import subprocess
import threading
import time
import datetime
from scapy.all import sniff, Dot11, Dot11Beacon, Dot11Elt, Dot11ProbeReq, Dot11AssoReq, sendp, Ether, IP, UDP

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
        
        # 🚀 Temporizadores independientes para Throttling táctico (Evita asfixiar a React)
        self.last_beacon_broadcast = 0
        self.last_probe_broadcast = 0
        self.last_station_broadcast = 0

    def _packet_handler(self, pkt):
        if not pkt.haslayer(Dot11):
            return

        # 📊 [01. BEACON RECON & 03. WPS DISCOVERY]
        if pkt.haslayer(Dot11Beacon):
            bssid = pkt[Dot11].addr3
            
            rssi = -50  
            if pkt.haslayer('RadioTap'):
                try:
                    if hasattr(pkt['RadioTap'], 'dBm_AntSignal') and pkt['RadioTap'].dBm_AntSignal is not None:
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
                        decoded_ssid = elt.info.decode('utf-8', errors='ignore')
                        if decoded_ssid.strip() != "":
                            ssid = decoded_ssid
                    except:
                        pass
                elif elt.ID == 3:  
                    try:
                        channel = int(elt.info[0])
                    except:
                        pass
                elif elt.ID == 221:  
                    if elt.info.startswith(b'\x00\x50\xF2\x04'):  
                        wps_active = True
                elt = elt.payload

            self.networks[bssid] = {
                "ssid": ssid,
                "bssid": bssid,
                "channel": channel,
                "rssi": rssi,
                "wps": wps_active,
                "last_seen": time.time()
            }
            
            # 🛡️ [12. EVIL TWIN DETECTOR]
            is_rogue_flag = False
            if ssid != "SSID Oculto" and bssid in self.networks:
                if self.networks[bssid]["channel"] != channel:
                    is_rogue_flag = True
                    socket_manager.broadcast_sync("WIFI_ALERT", {
                        "type": "EVIL_TWIN",
                        "ssid": ssid,
                        "bssid": bssid,
                        "detail": f"Inconsistencia de Canal: Esperado {self.networks[bssid]['channel']}, Detectado {channel}"
                    })

            # 🗄️ PERSISTENCIA AUTOMÁTICA EN SQLALCHEMY
            db = SessionLocal()
            try:
                ap = db.query(WiFiAccessPoint).filter(WiFiAccessPoint.bssid == bssid).first()
                if not ap:
                    ap = WiFiAccessPoint(bssid=bssid)
                    db.add(ap)
                ap.ssid = ssid
                ap.channel = channel
                ap.rssi = rssi
                ap.wps_active = wps_active
                ap.is_rogue = is_rogue_flag
                ap.last_seen = datetime.datetime.utcnow()
                db.commit()
            except Exception:
                db.rollback()
            finally:
                db.close()

            # 🟢 THROTTLING CONTROLADO: 400ms para mantener barras fluidas en React sin congelar el bus
            ahora = time.time()
            if ahora - self.last_beacon_broadcast > 0.4:
                socket_manager.broadcast_sync("WIFI_SPECTRUM", list(self.networks.values()))
                self.last_beacon_broadcast = ahora

        # 📶 [02. CLIENT PROBING SNIFFER]
        elif pkt.haslayer(Dot11ProbeReq):
            client_mac = pkt[Dot11].addr2
            
            rssi = -60  
            if pkt.haslayer('RadioTap'):
                try:
                    if hasattr(pkt['RadioTap'], 'dBm_AntSignal') and pkt['RadioTap'].dBm_AntSignal is not None:
                        rssi = pkt['RadioTap'].dBm_AntSignal
                except Exception:
                    pass
            
            target_ssid = "Broadcast Search"
            if pkt.haslayer(Dot11Elt) and pkt[Dot11Elt].ID == 0:
                try:
                    target_ssid = pkt[Dot11Elt].info.decode('utf-8', errors='ignore')
                except:
                    pass
            
            target_ssid = target_ssid or "Cualquiera"
            probe_data = {"mac": client_mac, "searching_for": target_ssid, "rssi": rssi, "time": time.time()}
            self.probes.append(probe_data)
            if len(self.probes) > 100: self.probes.pop(0)
            
            # 🗄️ PERSISTENCIA DE PROBES EN SQLALCHEMY
            db = SessionLocal()
            try:
                client = db.query(WiFiClient).filter(WiFiClient.mac == client_mac).first()
                if not client:
                    client = WiFiClient(mac=client_mac)
                    db.add(client)
                client.searching_for = target_ssid
                client.rssi = rssi
                client.client_type = "PROBE"
                client.last_seen = datetime.datetime.utcnow()
                db.commit()
            except Exception:
                db.rollback()
            finally:
                db.close()

            # 🟢 THROTTLING DE PROBES: Despacha ráfaga cada 500ms
            ahora = time.time()
            if ahora - self.last_probe_broadcast > 0.5:
                socket_manager.broadcast_sync("WIFI_PROBES", self.probes)
                self.last_probe_broadcast = ahora

        # 🔍 [04. HIDDEN SSID REVEALER & 05. WIRELESS STATION MAPPER]
        elif pkt.haslayer(Dot11AssoReq):
            client_mac = pkt[Dot11].addr2
            bssid = pkt[Dot11].addr1
            
            self.stations[client_mac] = {"bssid": bssid, "last_seen": time.time()}
            
            # 🗄️ PERSISTENCIA DE ASOCIACIONES EN SQLALCHEMY
            db = SessionLocal()
            try:
                client = db.query(WiFiClient).filter(WiFiClient.mac == client_mac).first()
                if not client:
                    client = WiFiClient(mac=client_mac)
                    db.add(client)
                client.associated_bssid = bssid
                client.client_type = "STATION"
                client.last_seen = datetime.datetime.utcnow()
                db.commit()
            except Exception:
                db.rollback()
            finally:
                db.close()

            # 🟢 THROTTLING DE ASOCIACIONES Y RELACIONES AP-CLIENTE
            ahora = time.time()
            if ahora - self.last_station_broadcast > 0.5:
                # Se envía el diccionario relacional directo al bus mapeador
                socket_manager.broadcast_sync("WIFI_STATIONS", self.stations)
                self.last_station_broadcast = ahora
            
            if pkt.haslayer(Dot11Elt) and pkt[Dot11Elt].ID == 0:
                try:
                    revealed_ssid = pkt[Dot11Elt].info.decode('utf-8', errors='ignore')
                    if revealed_ssid.strip() != "" and bssid in self.networks and self.networks[bssid]["ssid"] == "SSID Oculto":
                        self.networks[bssid]["ssid"] = revealed_ssid
                        
                        db = SessionLocal()
                        try:
                            ap = db.query(WiFiAccessPoint).filter(WiFiAccessPoint.bssid == bssid).first()
                            if ap:
                                ap.ssid = revealed_ssid
                                db.commit()
                        except: db.rollback()
                        finally: db.close()
                except:
                    pass

    def _run_sniffer(self):
        target_iface = self.monitor.monitor_interface
        time.sleep(0.2)
        
        try:
            subprocess.run(["ip", "link", "set", target_iface, "up"], check=True)
        except Exception as e:
            print(f"[WIFI SNIFFER ERR] Error de link en hilo: {e}")
            return

        print(f"[WIFI KERNEL LINK] Scapy abriendo socket crudo en: {target_iface}")
        
        s = None
        try:
            from scapy.arch.linux import L2ListenSocket
            
            s = L2ListenSocket(iface=target_iface, type=0x0003)  # ETH_P_ALL
            
            sniff(
                opened_socket=s,
                prn=self._packet_handler,
                stop_filter=lambda x: not self.is_sniffing,
                store=0
            )
        except Exception as e:
            print(f"[WIFI SNIFFER CRITICAL] Error de descriptor: {e}")
            self.is_sniffing = False
        finally:
            if s:
                try:
                    s.close()
                    print("[WIFI KERNEL LINK] Descriptor de socket cerrado y devuelto al sistema.")
                except:
                    pass

    def start(self):
        if self.is_sniffing:
            print("[WIFI SNIFFER] Instancia viva detectada. Forzando repliegue preventivo...")
            self.stop()

        self.is_sniffing = True
        self._sniff_thread = threading.Thread(target=self._run_sniffer, daemon=True)
        self._sniff_thread.start()
        print("[WIFI SNIFFER] Motor analítico de Capa 2 y persistencia en línea.")

    def stop(self):
        if not self.is_sniffing:
            return

        print("[WIFI SNIFFER] Iniciando secuencia de repliegue táctico...")
        self.is_sniffing = False
        
        try:
            print("[WIFI SNIFFER] Inyectando trama de mitigación para destrabar socket...")
            sendp(
                Ether(dst="ff:ff:ff:ff:ff:ff")/IP(dst="127.0.0.1")/UDP(), 
                iface=self.monitor.monitor_interface, 
                count=2, 
                verbose=False
            )
        except Exception:
            pass

        if self._sniff_thread and self._sniff_thread.is_alive():
            self._sniff_thread.join(timeout=2.0)
        
        print("[WIFI SNIFFER] Motor fuera de línea de forma segura y descriptores liberados.")