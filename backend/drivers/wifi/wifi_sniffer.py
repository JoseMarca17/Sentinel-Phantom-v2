import subprocess
import threading
import time
import datetime
import select
from scapy.all import sniff, Dot11, Dot11Beacon, Dot11Elt, Dot11ProbeReq, Dot11AssoReq

from backend.core.socket_manager import socket_manager
from backend.database import SessionLocal
from backend.models import WiFiAccessPoint, WiFiClient

class WiFiSniffer:
    def __init__(self, monitor):
        self.monitor = monitor
        self.networks = {}
        self.probes = []
        self.stations = {}
        self._sniff_thread = None
        self.is_sniffing = False

        self.last_beacon_broadcast = 0
        self.last_probe_broadcast = 0
        self.last_station_broadcast = 0

        # FIX: base de referencia separada para evil twin
        self._ap_reference = {}  # bssid -> canal visto por primera vez

        # Buffer ORM: flush cada 5s en lugar de por cada paquete
        self._db_buffer = {}      # bssid -> datos AP
        self._client_buffer = {}  # mac -> datos cliente
        self._last_db_flush = 0
        self._db_lock = threading.Lock()

    def _packet_handler(self, pkt):
        if not pkt.haslayer(Dot11):
            return

        if pkt.haslayer(Dot11Beacon):
            bssid = pkt[Dot11].addr3
            rssi = -50
            if pkt.haslayer('RadioTap'):
                try:
                    if hasattr(pkt['RadioTap'], 'dBm_AntSignal') and \
                       pkt['RadioTap'].dBm_AntSignal is not None:
                        rssi = pkt['RadioTap'].dBm_AntSignal
                except Exception:
                    pass

            ssid = "SSID Oculto"
            wps_active = False
            channel = self.monitor.current_channel

            elt = pkt[Dot11Elt]
            while isinstance(elt, Dot11Elt):
                if elt.ID == 0:
                    try:
                        decoded = elt.info.decode('utf-8', errors='ignore')
                        if decoded.strip():
                            ssid = decoded
                    except Exception:
                        pass
                elif elt.ID == 3:
                    try:
                        channel = int(elt.info[0])
                    except Exception:
                        pass
                elif elt.ID == 221:
                    if elt.info.startswith(b'\x00\x50\xF2\x04'):
                        wps_active = True
                elt = elt.payload

            # FIX evil twin: guardar referencia al PRIMER canal visto
            # y comparar beacons futuros contra esa referencia, no contra sí mismo
            if bssid not in self._ap_reference:
                self._ap_reference[bssid] = channel
            else:
                canal_referencia = self._ap_reference[bssid]
                if (ssid != "SSID Oculto" and
                        channel != canal_referencia and
                        abs(channel - canal_referencia) > 1):  # tolerancia de 1 canal
                    socket_manager.broadcast_sync("WIFI_ALERT", {
                        "type": "EVIL_TWIN",
                        "ssid": ssid,
                        "bssid": bssid,
                        "detail": (f"Canal de referencia: {canal_referencia}, "
                                   f"detectado: {channel}")
                    })

            self.networks[bssid] = {
                "ssid": ssid,
                "bssid": bssid,
                "channel": channel,
                "rssi": rssi,
                "wps": wps_active,
                "last_seen": time.time()
            }

            # Buffer ORM en lugar de escribir por paquete
            with self._db_lock:
                self._db_buffer[bssid] = {
                    "ssid": ssid, "channel": channel,
                    "rssi": rssi, "wps_active": wps_active
                }

            ahora = time.time()
            if ahora - self.last_beacon_broadcast > 0.4:
                socket_manager.broadcast_sync("WIFI_SPECTRUM",
                                              list(self.networks.values()))
                self.last_beacon_broadcast = ahora

        elif pkt.haslayer(Dot11ProbeReq):
            client_mac = pkt[Dot11].addr2
            rssi = -60
            if pkt.haslayer('RadioTap'):
                try:
                    if hasattr(pkt['RadioTap'], 'dBm_AntSignal') and \
                       pkt['RadioTap'].dBm_AntSignal is not None:
                        rssi = pkt['RadioTap'].dBm_AntSignal
                except Exception:
                    pass

            target_ssid = "Broadcast Search"
            if pkt.haslayer(Dot11Elt) and pkt[Dot11Elt].ID == 0:
                try:
                    target_ssid = pkt[Dot11Elt].info.decode('utf-8', errors='ignore') or "Cualquiera"
                except Exception:
                    pass

            probe_data = {
                "mac": client_mac,
                "searching_for": target_ssid,
                "rssi": rssi,
                "time": time.time()
            }
            self.probes.append(probe_data)
            if len(self.probes) > 100:
                self.probes.pop(0)

            with self._db_lock:
                self._client_buffer[client_mac] = {
                    "searching_for": target_ssid,
                    "rssi": rssi,
                    "client_type": "PROBE"
                }

            ahora = time.time()
            if ahora - self.last_probe_broadcast > 0.5:
                socket_manager.broadcast_sync("WIFI_PROBES", self.probes)
                self.last_probe_broadcast = ahora

        elif pkt.haslayer(Dot11AssoReq):
            client_mac = pkt[Dot11].addr2
            bssid = pkt[Dot11].addr1
            self.stations[client_mac] = {"bssid": bssid, "last_seen": time.time()}

            with self._db_lock:
                self._client_buffer[client_mac] = {
                    "associated_bssid": bssid,
                    "client_type": "STATION"
                }

            ahora = time.time()
            if ahora - self.last_station_broadcast > 0.5:
                socket_manager.broadcast_sync("WIFI_STATIONS", self.stations)
                self.last_station_broadcast = ahora

            # Hidden SSID reveal
            if pkt.haslayer(Dot11Elt) and pkt[Dot11Elt].ID == 0:
                try:
                    revealed = pkt[Dot11Elt].info.decode('utf-8', errors='ignore')
                    if (revealed.strip() and
                            bssid in self.networks and
                            self.networks[bssid]["ssid"] == "SSID Oculto"):
                        self.networks[bssid]["ssid"] = revealed
                        with self._db_lock:
                            if bssid in self._db_buffer:
                                self._db_buffer[bssid]["ssid"] = revealed
                except Exception:
                    pass

        # Flush ORM cada 5 segundos
        ahora = time.time()
        if ahora - self._last_db_flush > 5.0:
            self._flush_to_db()
            self._last_db_flush = ahora

    def _flush_to_db(self):
        """Escribe el buffer acumulado a SQLite en un solo ciclo."""
        with self._db_lock:
            ap_snap = dict(self._db_buffer)
            cli_snap = dict(self._client_buffer)
            self._db_buffer.clear()
            self._client_buffer.clear()

        if not ap_snap and not cli_snap:
            return

        db = SessionLocal()
        try:
            for bssid, data in ap_snap.items():
                ap = db.query(WiFiAccessPoint).filter(
                    WiFiAccessPoint.bssid == bssid).first()
                if not ap:
                    ap = WiFiAccessPoint(bssid=bssid)
                    db.add(ap)
                for k, v in data.items():
                    setattr(ap, k, v)
                ap.last_seen = datetime.datetime.utcnow()

            for mac, data in cli_snap.items():
                client = db.query(WiFiClient).filter(
                    WiFiClient.mac == mac).first()
                if not client:
                    client = WiFiClient(mac=mac)
                    db.add(client)
                for k, v in data.items():
                    setattr(client, k, v)
                client.last_seen = datetime.datetime.utcnow()

            db.commit()
        except Exception as e:
            db.rollback()
            print(f"[SNIFFER DB FLUSH ERR] {e}")
        finally:
            db.close()

    def _run_sniffer(self):
        target_iface = self.monitor.monitor_interface
        time.sleep(0.2)
        try:
            subprocess.run(["ip", "link", "set", target_iface, "up"], check=True)
        except Exception as e:
            print(f"[WIFI SNIFFER ERR] {e}")
            return

        print(f"[WIFI SNIFFER] Abriendo socket en {target_iface}")
        s = None
        try:
            from scapy.arch.linux import L2ListenSocket
            s = L2ListenSocket(iface=target_iface, type=0x0003)

            # FIX stop robusto: usar select con timeout en lugar del hack UDP
            while self.is_sniffing:
                ready = select.select([s.ins], [], [], 0.5)
                if ready[0]:
                    pkt = s.recv(65535)
                    if pkt:
                        self._packet_handler(pkt)

        except Exception as e:
            print(f"[WIFI SNIFFER CRITICAL] {e}")
        finally:
            self.is_sniffing = False
            if s:
                try:
                    s.close()
                    print("[WIFI SNIFFER] Socket cerrado.")
                except Exception:
                    pass
            # Flush final al salir
            self._flush_to_db()

    def start(self):
        if self.is_sniffing:
            self.stop()
        self._ap_reference.clear()
        self.is_sniffing = True
        self._last_db_flush = time.time()
        self._sniff_thread = threading.Thread(
            target=self._run_sniffer, daemon=True)
        self._sniff_thread.start()
        print("[WIFI SNIFFER] Motor online.")

    def stop(self):
        if not self.is_sniffing:
            return
        print("[WIFI SNIFFER] Deteniendo...")
        self.is_sniffing = False
        if self._sniff_thread and self._sniff_thread.is_alive():
            self._sniff_thread.join(timeout=3.0)
        print("[WIFI SNIFFER] Motor offline.")