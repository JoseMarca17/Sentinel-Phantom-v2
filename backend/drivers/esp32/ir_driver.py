from backend.core.serial_bridge import serial_bridge
from backend.core.socket_manager import socket_manager
from backend.database import SessionLocal
import backend.models as models
import datetime

class IRDriver:
    def __init__(self):
        self.module_name = "IR"

    def trigger_tv_bgone(self):
        """Inyecta el ataque de ráfagas bruteforce al bus de hardware."""
        return serial_bridge.send_packet(self.module_name, "TV_B_GONE")

    def trigger_capture(self):
        """Activa la ventana de escucha dinámica de 5 segundos en el VS1838B."""
        return serial_bridge.send_packet(self.module_name, "CAPTURE")

    def trigger_replay(self, protocol: str, code: int, bits: int):
        """Ordena al diodo emisor del ESP32 replicar un código específico."""
        params = {
            "protocol": protocol,
            "code": int(code),
            "bits": int(bits)
        }
        return serial_bridge.send_packet(self.module_name, "REPLAY", params)

    def handle_incoming_data(self, data: dict):
        """Manejador asíncrono del flujo serial delegado por SerialBridge."""
        # Si el JSON reporta éxito y contiene carga útil de captura válida
        if data.get("success") and "code" in data and data.get("message") != "tv-b-gone sent":
            db = SessionLocal()
            try:
                # Instanciar el registro con la estructura de SQLAlchemy
                new_capture = models.IRCapture(
                    protocol=str(data.get("protocol")),
                    code=str(hex(data.get("code")) if isinstance(data.get("code"), int) else data.get("code")),
                    bits=int(data.get("bits", 32)),
                    timestamp=datetime.datetime.now() # Hora local del sistema host
                )
                db.add(new_capture)
                db.commit()
                db.refresh(new_capture)
                print(f"[DATABASE] Señal IR capturada e indexada: {new_capture.code} ({new_capture.protocol})")
                
                # Adjuntamos el ID generado e información de base de datos para el Frontend
                data["db_id"] = new_capture.id
                data["timestamp_str"] = new_capture.timestamp.strftime("%d/%m %H:%M:%S")
            except Exception as e:
                db.rollback()
                print(f"[DATABASE] Error crítico de persistencia en ir_captures: {e}")
            finally:
                db.close()

        # Retransmitir por WebSockets a todos los operadores web conectados
        socket_manager.broadcast_sync(self.module_name, data)

ir_driver = IRDriver()
serial_bridge.register_driver("IR", ir_driver)