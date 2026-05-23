# test_rfid.py
from esp32_core import ESP32Controller
import time

class TestRFID(ESP32Controller):
    def on_json_received(self, json_data):
        if json_data.get("mod") == "RFID" and json_data.get("status") == "OK":
            data = json_data.get("data", {})
            print("\n=========================================")
            print("         LECTURA RFID EXITOSA")
            print("=========================================")
            print(f" Datos extraídos: {data}")
            print("=========================================\n")

if __name__ == "__main__":
    dev = TestRFID(port='/dev/ttyUSB0')
    if dev.start():
        try:
            print("\n--- MENÚ DE PRUEBAS RFID/NFC (PN532) ---")
            print("1. Leer UID de tarjeta rápido (READ)")
            print("2. Intentar volcado completo de sectores Mifare (DUMP)")
            opcion = input("Selecciona una opción: ")

            if opcion == "1":
                print("[*] Acerque una tarjeta o llavero al lector...")
                dev.send_command("RFID", "READ")
            elif opcion == "2":
                print("[*] Iniciando volcado profundo de sectores... No retire la tarjeta.")
                dev.send_command("RFID", "DUMP")
            
            time.sleep(4) # El volcado puede tomar un par de segundos
        except KeyboardInterrupt:
            pass
        finally:
            dev.stop()
