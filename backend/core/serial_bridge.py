# backend/core/serial_bridge.py
import serial
import json
import threading
import time

class SerialBridge:
    def __init__(self, port='/dev/ttyUSB0', baudrate=115200):
        self.port = port
        self.baudrate = baudrate
        self.serial_conn = None
        self.is_running = False
        self.drivers = {} # Registro dinámico de sub-drivers (IR, RFID, Sub-GHz)

    def register_driver(self, module_name, driver_instance):
        self.drivers[module_name] = driver_instance

    def start(self):
        try:
            self.serial_conn = serial.Serial(self.port, self.baudrate, timeout=1)
            self.serial_conn.reset_input_buffer()
            self.is_running = True
            threading.Thread(target=self._read_loop, daemon=True).start()
            print(f"[SERIAL] Enlace físico establecido en {self.port}")
            return True
        except Exception as e:
            print(f"[SERIAL] Error crítico al enlazar {self.port}: {e}")
            return False

    def _read_loop(self):
        while self.is_running:
            if self.serial_conn and self.serial_conn.in_waiting > 0:
                try:
                    line = self.serial_conn.readline().decode('utf-8', errors='ignore').strip()
                    if not line or not line.startswith('{'):
                        continue
                    
                    payload = json.loads(line)
                    if payload.get("status") == "OK":
                        mod = payload.get("mod")
                        data = payload.get("data")
                        
                        # DELEGACIÓN MODULAR: Si el módulo está registrado, procesa su lógica independiente
                        if mod in self.drivers:
                            self.drivers[mod].handle_incoming_data(data)
                except Exception as e:
                    print(f"[SERIAL] Trampa de lectura corrupta: {e}")
            time.sleep(0.001)

    def send_packet(self, module: str, command: str, params: dict = None):
        if not self.serial_conn or not self.serial_conn.is_open:
            return False
        packet = {"mod": module, "cmd": command, "params": params or {}}
        try:
            self.serial_conn.write((json.dumps(packet) + '\n').encode('utf-8'))
            self.serial_conn.flush()
            return True
        except Exception as e:
            print(f"[-] Fallo al inyectar comando serial [{command}]: {e}")
            return False

# Instancia global
serial_bridge = SerialBridge()
