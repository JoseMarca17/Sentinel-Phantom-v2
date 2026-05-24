from backend.core.serial_bridge import serial_bridge
from backend.core.socket_manager import socket_manager
from backend.database import SessionLocal
import backend.models as models
import datetime

class RFIDDriver:
    def __init__(self):
        self.module_name = "RFID"

    def trigger_read(self):
        return serial_bridge.send_packet(self.module_name, "READ_CARD")

    def trigger_dump(self):
        return serial_bridge.send_packet(self.module_name, "DUMP_MIFARE")

    def trigger_clone(self, target_uid: str):
        return serial_bridge.send_packet(self.module_name, "CLONE_UID", {"uid": target_uid})

    def handle_incoming_data(self, data: dict):
        # 🚨 LOG DE DIAGNÓSTICO CRÍTICO
        print(f"[RFID-DRIVER-RX] !!! Llegaron datos del puerto serie al driver !!! -> {data}")
        
        # Soportamos que success o detected vengan en cualquier formato
        is_read = data.get("detected") and "uid" in data
        is_dump = data.get("blocks_read") is not None

        if is_read:
            db = SessionLocal()
            try:
                new_card = models.RFIDCapture(
                    uid=str(data.get("uid")),
                    card_type=str(data.get("card_type", "UNKNOWN")),
                    timestamp=datetime.datetime.now()
                )
                db.add(new_card)
                db.commit()
                db.refresh(new_card)
                print(f"[DATABASE] Tarjeta RFID indexada: UID {new_card.uid}")
                data["db_id"] = new_card.id
            except Exception as e:
                db.rollback()
                print(f"[DATABASE] Error al guardar RFID: {e}")
            finally:
                db.close()

        # Forzar el envío inmediato al SocketManager
        socket_manager.broadcast_sync(self.module_name, data)

rfid_driver = RFIDDriver()
serial_bridge.register_driver("RFID", rfid_driver)