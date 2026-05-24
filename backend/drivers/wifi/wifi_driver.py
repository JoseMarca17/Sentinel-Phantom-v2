# backend/drivers/wifi/wifi_driver.py
from backend.core.serial_bridge import serial_bridge
from backend.core.socket_manager import socket_manager
from .wifi_monitor import wifi_monitor
from .wifi_sniffer import WiFiSniffer
from .wifi_lan import wifi_lan

class WiFiDriver:
    def __init__(self):
        self.module_name = "WIFI"

    def handle_incoming_data(self, data: dict):
        """Manejador elástico de eventos asíncronos."""
        # Redireccionamos la telemetría directo por WebSocket a React
        socket_manager.broadcast_sync(self.module_name, data)

wifi_driver = WiFiDriver()
# Registramos formalmente el driver de hardware
serial_bridge.register_driver("WIFI", wifi_driver)