# test_nrf_jammer.py
from esp32_core import ESP32Controller
import time
import sys

class TestJammer(ESP32Controller):
    def on_json_received(self, json_data):
        # Filtrar las respuestas del módulo de radiofrecuencia
        if json_data.get("mod") == "NRF24" and json_data.get("status") == "OK":
            data = json_data.get("data", {})
            
            # Si es una respuesta de estado, imprimimos la telemetría en tiempo real
            if "packets_sent" in data:
                active = "TRANSMITIENDO" if data.get("active") else "INACTIVO"
                print(f"\r[*] Estado: [{active}] | Canal: {data.get('channel')} | Ráfagas Inyectadas: {data.get('packets_sent'):,}", end="")
                sys.stdout.flush()
            
            # Si es una confirmación de inicio o parada
            elif "status" in data:
                print(f"\n[ESP32-CONFIRMACIÓN] -> {data.get('status')}")

if __name__ == "__main__":
    # Inicializar el controlador en el puerto correspondiente
    dev = TestJammer(port='/dev/ttyUSB0')
    
    if dev.start():
        try:
            canal_objetivo = 64
            print(f"\n[*] Enviando comando de activación: Canal {canal_objetivo}")
            
            # Disparamos el ataque asíncrono
            dev.send_command("NRF24", "JAM_START", {"mode": "SINGLE", "channel": canal_objetivo})
            time.sleep(0.5) # Breve pausa para asentar la orden
            
            print("[*] Monitoreando actividad en el fondo (Presiona Ctrl+C para detener)...")
            # Bucle de consulta de telemetría dinámica
            while True:
                dev.send_command("NRF24", "JAM_STATUS")
                time.sleep(0.5) # Interrogar cada 500 ms
                
        except KeyboardInterrupt:
            print("\n\n[-] Deteniendo ráfagas de transmisión...")
            # Forzar el apagado del periférico antes de cerrar el script
            dev.send_command("NRF24", "JAM_STOP")
            time.sleep(0.5)
        finally:
            dev.stop()
