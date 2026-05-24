# backend/drivers/wifi/wifi_monitor.py
import asyncio
import subprocess
import random
import os
import time

class WiFiMonitor:
    def __init__(self):
        # 🟢 Tu antena USB externa MediaTek detectada en tu laptop Lenovo LOQ
        self.interface = "wlp8s0f3u1"  
        
        # Estrategia Wifite: La interfaz de escucha es el mismo dispositivo físico puro
        self.monitor_interface = self.interface  
        
        self.current_channel = 1
        self._hopper_task = None
        self.is_hopping = False

    def check_root(self) -> bool:
        """El acceso a sockets RAW y configuración de interfaces requiere privilegios de Root."""
        return os.getuid() == 0

    def randomize_mac(self, iface: str) -> str:
        """Cambia la dirección MAC de la interfaz para anonimato táctico."""
        if not self.check_root():
            return "00:11:22:33:44:55"
        
        new_mac = [0x00, 0x16, 0x3e,
                   random.randint(0x00, 0x7f),
                   random.randint(0x00, 0xff),
                   random.randint(0x00, 0xff)]
        mac_str = ':'.join(f"{x:02x}" for x in new_mac)
        
        try:
            subprocess.run(["ip", "link", "set", iface, "down"], check=True)
            subprocess.run(["ip", "link", "set", iface, "address", mac_str], check=True)
            subprocess.run(["ip", "link", "set", iface, "up"], check=True)
            print(f"[WIFI MONITOR] MAC Spoofing exitoso en {iface} -> {mac_str}")
            return mac_str
        except subprocess.CalledProcessError:
            print(f"[WIFI MONITOR ERR] No se pudo cambiar la MAC en {iface}")
            return "Error"

    def enable_monitor_mode(self) -> bool:
        """Conmuta la interfaz física principal directamente a modo monitor (Sin clones virtuales)."""
        if not self.check_root():
            print("[WIFI MONITOR ERR] Requiere privilegios de ROOT.")
            return False
        try:
            # Higienización: Si existía algún clon virtual remanente de pruebas previas, lo barremos
            if os.path.exists(f"/sys/class/net/{self.interface}mon"):
                subprocess.run(["ip", "link", "set", f"{self.interface}mon", "down"], capture_output=True)
                subprocess.run(["iw", "dev", f"{self.interface}mon", "del"], capture_output=True)

            print(f"[WIFI MONITOR] Conmutando {self.interface} directamente a Monitor...")
            
            # 1. Bajamos la interfaz de red
            subprocess.run(["ip", "link", "set", self.interface, "down"], check=True)
            time.sleep(0.2)
            
            # 2. Desactivamos el ahorro de energía para evitar cortes de energía en el puerto USB
            subprocess.run(["iw", "dev", self.interface, "set", "power_save", "off"], capture_output=True)
            
            # 3. Forzamos la mutación a modo monitor directo
            subprocess.run(["iw", "dev", self.interface, "set", "type", "monitor"], check=True)
            time.sleep(0.2)
            
            # 4. Levantamos la interfaz purgada
            subprocess.run(["ip", "link", "set", self.interface, "up"], check=True)
            
            # Watchdog de verificación en el kernel (/sys/class/net/)
            retries = 0
            while not os.path.exists(f"/sys/class/net/{self.interface}"):
                time.sleep(0.1)
                retries += 1
                if retries > 20:
                    return False
            
            time.sleep(0.5)
            print(f"[WIFI MONITOR] {self.interface} establecida en modo monitor directo con éxito.")
            return True
        except Exception as e:
            print(f"[WIFI MONITOR ERR] Error fatal en monitor directo: {e}")
            return False

    async def _channel_hopper(self, channels: list, delay: float):
        """Alterna secuencialmente la frecuencia sintonizada por el chip de radio."""
        try:
            while self.is_hopping:
                for channel in channels:
                    if not self.is_hopping:
                        break
                    self.current_channel = channel
                    proc = await asyncio.create_subprocess_exec(
                        "iw", "dev", self.monitor_interface, "set", "channel", str(channel),
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.DEVNULL
                    )
                    await proc.wait()
                    await asyncio.sleep(delay)
        except asyncio.CancelledError:
            pass

    def start_hopping(self, channels: list = None, delay: float = 0.3):
        """Inicia el bucle asíncrono de barrido de canales."""
        if channels is None:
            channels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
        if self._hopper_task is None or self._hopper_task.done():
            self.is_hopping = True
            self._hopper_task = asyncio.create_task(self._channel_hopper(channels, delay))
            print(f"[WIFI MONITOR] Channel Hopping iniciado en canales: {channels}")

    def stop_hopping(self):
        """Cancela la tarea de salto y congela la antena en la frecuencia actual."""
        self.is_hopping = False
        if self._hopper_task and not self._hopper_task.done():
            self._hopper_task.cancel()
            print(f"[WIFI MONITOR] Barrido detenido. Antena estática en Canal {self.current_channel}")

wifi_monitor = WiFiMonitor()