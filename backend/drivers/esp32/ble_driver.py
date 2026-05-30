from backend.core.serial_bridge import serial_bridge
from backend.core.socket_manager import socket_manager

class BLEDriver:
    def __init__(self):
        serial_bridge.register_driver("BLE", self)
        serial_bridge.register_driver("BLE_STREAM", self)
        serial_bridge.register_driver("bt", self)

    def handle_incoming_data(self, data: dict):
        if not data or "mac" not in data:
            return
        try:
            from backend.database import SessionLocal
            from backend.models import BLECapture
            import json

            db = SessionLocal()
            mac_addr = data["mac"].lower()

            device = db.query(BLECapture).filter(BLECapture.mac == mac_addr).first()
            if not device:
                device = BLECapture(mac=mac_addr)
                db.add(device)

            device.name        = data.get("name", "UNNAMED_NODE")
            device.rssi        = data.get("rssi", -100)
            device.vendor      = data.get("vendor", "UNKNOWN")
            device.device_type = data.get("type", "GENERIC_BLE")
            device.is_tracker  = data.get("is_tracker", False)
            if "services" in data:
                device.services_map = json.dumps(data["services"])
            db.commit()
            db.close()

            # Broadcast por WebSocket usando socket_manager (sin importación circular)
            socket_manager.broadcast_sync("BLE_STREAM", {
                "mac":        mac_addr,
                "name":       data.get("name", "UNNAMED_NODE"),
                "rssi":       data.get("rssi", -100),
                "vendor":     data.get("vendor", "UNKNOWN"),
                "type":       data.get("type", "GENERIC_BLE"),
                "is_tracker": data.get("is_tracker", False),
                "subtype":    data.get("subtype", ""),
                "company_id": data.get("company_id", 0)
            })
        except Exception as e:
            print(f"[BLE DRIVER ERR] {e}")

    def start_sniffer(self, target_mac: str = "", anti_tracking: bool = False):
        serial_bridge.send_packet("BLE", "SNIFFER_START", {
            "target_mac": target_mac,
            "anti_tracking": anti_tracking
        })

    def stop_sniffer(self):
        serial_bridge.send_packet("BLE", "SNIFFER_STOP", {})

    def start_flooding(self, ecosystem: str = "APPLE", interval_ms: int = 30):
        serial_bridge.send_packet("BLE", "FLOOD_START", {
            "ecosystem": ecosystem.upper(),
            "interval_ms": interval_ms
        })

    def stop_advertising(self):
        serial_bridge.send_packet("BLE", "ADV_STOP", {})

    def clone_beacon(self, payload_hex: str):
        serial_bridge.send_packet("BLE", "CLONE_BEACON", {
            "hex_data": payload_hex
        })

    def gatt_explore(self, mac: str):
        serial_bridge.send_packet("BLE", "GATT_CONNECT", {
            "mac": mac
        })

    def rssi_track(self, target_mac: str):
        """Activa sniffer filtrado por MAC para tracking de proximidad."""
        serial_bridge.send_packet("BLE", "SNIFFER_START", {
            "target_mac": target_mac,
            "anti_tracking": False
        })

ble_driver = BLEDriver()