# test_subghz.py
from esp32_core import ESP32Controller
import time

class TestSubGHz(ESP32Controller):
    def on_json_received(self, json_data):
        if json_data.get("mod") == "SUBGHZ" and json_data.get("status") == "OK":
            data = json_data.get("data", {})
            print(f"\n[SUB-GHZ REPORTE] -> {data}")

if __name__ == "__main__":
    dev = TestSubGHz(port='/dev/ttyUSB0')
    if dev.start():
        try:
            print("\n--- MENÚ DE PRUEBAS SUB-GHZ (CC1101) ---")
            print("1. Escanear frecuencias activas")
            print("2. Capturar señal en 433.92 MHz")
            print("3. Transmitir ruido de prueba en 433.92 MHz")
            opcion = input("Selecciona una opción: ")

            if opcion == "1":
                print("[*] Lanzando escaneo de frecuencias...")
                dev.send_command("SUBGHZ", "SCAN")
            elif opcion == "2":
                print("[*] Escuchando en 433.92 MHz... Presiona el botón de tu control remoto.")
                dev.send_command("SUBGHZ", "CAPTURE", {"freq_mhz": 433.92})
            elif opcion == "3":
                print("[*] Transmitiendo portadora de prueba durante 2 segundos...")
                dev.send_command("SUBGHZ", "JAM", {"freq_mhz": 433.92, "duration_ms": 2000})
            
            time.sleep(3) # Tiempo para recibir la respuesta asíncrona
        except KeyboardInterrupt:
            pass
        finally:
            dev.stop()
