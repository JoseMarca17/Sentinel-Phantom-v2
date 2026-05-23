# backend/drivers/esp32/ir_driver.py
# 📝 CORRECCIÓN: Prefijo 'backend.' absoluto
from backend.core.serial_bridge import serial_bridge
from backend.core.socket_manager import socket_manager
from backend.database import SessionLocal
import backend.models as models # Si ya creaste models.py

class IRDriver:
    def __init__(self):
        self.module_name = "IR"

    def trigger_tv_bgone(self):
        return serial_bridge.send_packet(self.module_name, "TV_B_GONE")

    def trigger_capture(self):
        return serial_bridge.send_packet(self.module_name, "CAPTURE")

    def handle_incoming_data(self, data: dict):
        if data.get("success") and "code" in data and data.get("message") != "tv-b-gone sent":
            # Aquí irá tu lógica de BD con SessionLocal si ya tienes configurado database.py
            pass

        socket_manager.broadcast_sync(self.module_name, data)

ir_driver = IRDriver()
serial_bridge.register_driver("IR", ir_driver)
