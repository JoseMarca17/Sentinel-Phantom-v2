from backend.core.serial_bridge import serial_bridge
from backend.core.socket_manager import socket_manager

class NRF24Driver:
    def __init__(self):
        self.module_name = "NRF24"

    def trigger_spectrum_scan(self):
        """
        Solicita un barrido completo de energía en los 126 canales.
        TRADUCCIÓN: Convertimos 'SCAN_SPECTRUM' al string real del firmware 'SPECTRUM_SCAN'
        """
        return serial_bridge.send_packet(self.module_name, "SPECTRUM_SCAN")

    def trigger_hid_scan(self):
        """
        Inicia la ventana de escucha para sniffer de direcciones de hardware.
        TRADUCCIÓN: Convertimos 'SCAN_HID' al string real del firmware 'HID_SCAN'
        """
        return serial_bridge.send_packet(self.module_name, "HID_SCAN")

    def trigger_start_jamming(self, mode: str, channel: int = 50):
        """
        Inicia la transmisión en bucle continuo sobre las frecuencias.
        TRADUCCIÓN: Convertimos 'START_JAMMER' al string real del firmware 'JAM_START'
        """
        # Tu firmware espera la clave 'mode' ("SINGLE"/"CARPET") y 'channel' (uint8_t)
        params = {
            "mode": "CARPET" if mode == "CARPET" else "SINGLE",
            "channel": int(channel)
        }
        return serial_bridge.send_packet(self.module_name, "JAM_START", params)

    def trigger_stop_jamming(self):
        """
        Detiene la transmisión y apaga el ruido de radiofrecuencia.
        TRADUCCIÓN: Convertimos 'STOP_JAMMER' al string real del firmware 'JAM_STOP'
        """
        return serial_bridge.send_packet(self.module_name, "JAM_STOP")

    def handle_incoming_data(self, data: dict):
        """
        Manejador elástico acoplado al SerialBridge. Recibe los arrays de canales
        del ESP32 y los inyecta en caliente hacia los WebSockets de React.
        """
        print(f"[{self.module_name} DRIVER] Datos UART recibidos de forma síncrona: {data}")
        
        # Si tu firmware reporta un fallo de comando por residuo, lo filtramos en consola
        if data.get("status") == "ERROR":
            print(f"[\033[91mNRF24-ERR\033[0m] Respuesta de error del firmware: {data.get('message')}")
            
        # Retransmitimos la trama intacta hacia el bus de la interfaz gráfica
        socket_manager.broadcast_sync(self.module_name, data)

nrf24_driver = NRF24Driver()
serial_bridge.register_driver("NRF24", nrf24_driver)