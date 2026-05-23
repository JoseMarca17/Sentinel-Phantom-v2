# test_nrf_scanner.py
from esp32_core import ESP32Controller
import time
import os

class TestScanner(ESP32Controller):
    def on_json_received(self, json_data):
        if json_data.get("mod") == "NRF24" and json_data.get("status") == "OK":
            data = json_data.get("data", {})
            channels = data.get("channels", [])
            
            if not channels:
                return

            # Limpiamos la pantalla de la terminal de Arch para generar efecto de animación
            os.system('clear')
            print("=============================================================================")
            print(f" VISUALIZADOR DE ESPECTRO 2.4 GHz - SENTINEL PHANTOM")
            print(f" Pico Máximo: Canal {data.get('peak_channel')} ({data.get('peak_freq_mhz')} MHz) | Valor: {data.get('peak_value')}")
            print("=============================================================================\n")
            
            # Graficamos solo canales representativos para que quepa bien en la pantalla (Muestreo cada 2 canales)
            for ch in range(0, 120, 2):
                val = channels[ch]
                # Creamos una barra visual basada en el valor (Máximo 15 de tu firmware)
                bar = "█" * val + "░" * (15 - val)
                freq = 2400 + ch
                # Resaltamos los canales principales de WiFi de forma visual
                tag = " [WiFi CH1]" if ch == 1 else " [WiFi CH6]" if ch == 57 else " [WiFi CH11]" if ch == 111 else ""
                print(f"CH {ch:03d} ({freq} MHz) |{bar}| {val:02d}{tag}")
                
            print("\n[*] Presiona Ctrl+C para detener el Escáner.")

if __name__ == "__main__":
    dev = TestScanner(port='/dev/ttyUSB0')
    if dev.start():
        try:
            print("[*] Iniciando bucle de escaneo de espectro...")
            while True:
                dev.send_command("NRF24", "SPECTRUM_SCAN")
                # Esperamos un segundo entre barridos completos para no saturar el bus
                time.sleep(1.2)
        except KeyboardInterrupt:
            print("\n[-] Escáner detenido por el usuario.")
        finally:
            dev.stop()
