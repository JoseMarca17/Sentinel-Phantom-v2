# esp32_core.py
import serial
import json
import threading
import time

class ESP32Controller:
    def __init__(self, port='/dev/ttyUSB0', baudrate=115200):
        self.port = port
        self.baudrate = baudrate
        self.serial_conn = None
        self.is_running = False
        self.read_thread = None

    def start(self):
        try:
            # Abrimos el puerto con un timeout para evitar bloqueos eternos
            self.serial_conn = serial.Serial(self.port, self.baudrate, timeout=1)
            # Limpiamos buffers residuales del arranque del ESP32
            self.serial_conn.reset_input_buffer()
            self.serial_conn.reset_output_buffer()
            
            self.is_running = True
            self.read_thread = threading.Thread(target=self._listen_loop, daemon=True)
            self.read_thread.start()
            print(f"[+] Conexión serial establecida en {self.port}")
            return True
        except Exception as e:
            print(f"[-] Error crítico al abrir el puerto {self.port}: {e}")
            return False

    def _listen_loop(self):
        """Hilo dedicado a capturar y parsear todo lo que el ESP32 escupe."""
        while self.is_running:
            if self.serial_conn and self.serial_conn.in_waiting > 0:
                try:
                    line = self.serial_conn.readline().decode('utf-8', errors='ignore').strip()
                    if not line:
                        continue
                    
                    # Si el ESP32 manda texto crudo de depuración (como printDetails), lo imprimimos directo
                    if not line.startswith('{'):
                        print(f"[ESP32-LOG] {line}")
                        continue
                    
                    # Si es un JSON estructurado de nuestro protocolo, lo manejamos de forma limpia
                    data_json = json.loads(line)
                    self.on_json_received(data_json)
                    
                except json.JSONDecodeError:
                    # Captura strings corruptos intermedios por ruido eléctrico
                    pass
                except Exception as e:
                    print(f"[-] Error en el hilo de lectura: {e}")
            time.sleep(0.001)

    def send_command(self, module, command, params=None):
        """Construye e inyecta el paquete JSON hacia el ESP32."""
        if params is None:
            params = {}
        packet = {
            "mod": module,
            "cmd": command,
            "params": params
        }
        try:
            payload = json.dumps(packet) + '\n'
            self.serial_conn.write(payload.encode('utf-8'))
            self.serial_conn.flush()
        except Exception as e:
            print(f"[-] Error al enviar comando [{command}]: {e}")

    def on_json_received(self, json_data):
        """Método de callback. Los scripts individuales lo reescribirán para procesar sus datos."""
        pass

    def stop(self):
        self.is_running = False
        if self.serial_conn and self.serial_conn.is_open:
            self.serial_conn.close()
        print("[*] Conexión serial cerrada.")
