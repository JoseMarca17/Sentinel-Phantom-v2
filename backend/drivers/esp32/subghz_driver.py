from backend.core.serial_bridge import serial_bridge
from backend.core.socket_manager import socket_manager
from backend.models import SubGHzCapture
from backend.database import SessionLocal 

class SubGHzDriver:
    def __init__(self):
        self.module_name = "SUBGHZ"

    def trigger_scan(self):
        """Solicita al ESP32 un barrido rápido por el array de frecuencias RSSI."""
        return serial_bridge.send_packet(self.module_name, "SCAN")

    def trigger_capture(self, freq_mhz: float):
        """Monta el sniffer por interrupciones ISR en la frecuencia seleccionada."""
        return serial_bridge.send_packet(self.module_name, "CAPTURE", {"freq_mhz": float(freq_mhz)})

    def trigger_replay(self, freq_mhz: float, pulse_string: str):
        """Inyecta la señal clonada (HEX) directo hacia el modulador OOK del CC1101."""
        return serial_bridge.send_packet(self.module_name, "REPLAY", {"freq_mhz": float(freq_mhz), "hex": pulse_string})

    def trigger_jam(self, freq_mhz: float, duration_ms: int = 1000):
        """Activa el generador de ondas destructivas en el bus analógico durante un tiempo fijo."""
        return serial_bridge.send_packet(self.module_name, "JAM", {"freq_mhz": float(freq_mhz), "duration_ms": int(duration_ms)})

    def save_signal_to_db(self, alias: str, freq_mhz: float, timings: list):
        """Discretiza el array RAW de microsegundos a binario y lo empaqueta en HEX usando SQLAlchemy."""
        bit_string = ""
        for t in timings:
            bit_string += "1" if t > 700 else "0"

        # Alineación preventiva para agrupamiento de 4 bits (Nizamiento Nibble)
        while len(bit_string) % 4 != 0:
            bit_string += "0"

        # Conversión compacta a formato Hexadecimal usando rango de Python puro
        hex_string = ""
        for i in range(0, len(bit_string), 4):
            chunk = bit_string[i:i+4]
            hex_string += f"{int(chunk, 2):X}"

        # Transacción aislada en el Pool de SQLAlchemy
        db = SessionLocal()
        try:
            new_capture = SubGHzCapture(
                alias=alias,
                freq_mhz=float(freq_mhz),
                pulse_string=hex_string
            )
            db.add(new_capture)
            db.commit()
            print(f"[SUBGHZ ORM] Clon '{alias}' persistido con éxito en SQLite. HEX: {hex_string}")
        except Exception as e:
            db.rollback()
            print(f"[SUBGHZ ORM ERR] Fallo catastrófico de inserción en el pool: {e}")
        finally:
            db.close()

    def handle_incoming_data(self, data: dict):
        """Manejador delegado por el puente serial elástico."""
        # Desempaquetamos la llave interna 'data' para compatibilidad con la envoltura de red
        payload = data.get("data", {}) if "data" in data else data

        # Si el microcontrolador interceptó un tren de pulsos válido en la ISR
        if payload.get("captured") and "timings" in payload:
            alias_gen = f"REMOTE_{int(payload['freq_mhz'])}_{payload['count']}"
            
            # Procesamos el guardado automático
            self.save_signal_to_db(alias_gen, payload["freq_mhz"], payload["timings"])
            
            # Despachamos la confirmación estructurada hacia el WebSocket de React
            socket_manager.broadcast_sync(self.module_name, {
                "module": "SUBGHZ",
                "data": {
                    "event": "CAPTURE_SUCCESS",
                    "freq_mhz": payload["freq_mhz"],
                    "count": payload["count"]
                }
            })
            return

        # Cualquier otra telemetría (como el RSSI del barrido) pasa limpia hacia la interfaz gráfica
        socket_manager.broadcast_sync(self.module_name, data)

subghz_driver = SubGHzDriver()
serial_bridge.register_driver("SUBGHZ", subghz_driver)