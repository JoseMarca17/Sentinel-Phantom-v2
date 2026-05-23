# test_sys.py
from esp32_core import ESP32Controller
import time

class TestSys(ESP32Controller):
    def on_json_received(self, json_data):
        # Filtramos solo las respuestas del módulo base del sistema
        if json_data.get("mod") == "SYS" and json_data.get("status") == "OK":
            data = json_data.get("data", {})
            print("\n=========================================")
            print(f"  INFORMACIÓN DEL SENTINEL PHANTOM")
            print("=========================================")
            print(f" Dispositivo : {data.get('device')}")
            print(f" Firmware    : {data.get('version')}")
            print(f" Memoria Heap: {data.get('heap')} bytes")
            print("\n Estado de los Módulos de Hardware:")
            for module in data.get("modules", []):
                status = "🟢 ONLINE" if module.get("ready") else "🔴 OFFLINE"
                print(f"  -> {module.get('name').upper():<10}: {status}")
            print("=========================================\n")

if __name__ == "__main__":
    # Ajusta tu puerto aquí (ej: /dev/ttyUSB0 o /dev/ttyACM0)
    dev = TestSys(port='/dev/ttyUSB0')
    if dev.start():
        try:
            print("[*] Solicitando estado del sistema...")
            dev.send_command("SYS", "PING")
            
            # Mantenemos el script vivo 2 segundos para recibir la respuesta asíncrona
            time.sleep(2) 
        except KeyboardInterrupt:
            pass
        finally:
            dev.stop()
