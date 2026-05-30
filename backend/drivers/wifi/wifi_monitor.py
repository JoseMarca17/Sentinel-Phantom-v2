import asyncio
import subprocess
import random
import os
import time
from backend.config import INTERFACE_ATTACK

class WiFiMonitor:
    def __init__(self):
        self.interface = INTERFACE_ATTACK
        self.monitor_interface = self.interface
        self.current_channel = 1
        self._hopper_task = None
        self.is_hopping = False

    def check_root(self) -> bool:
        return os.getuid() == 0

    def randomize_mac(self, iface: str) -> str:
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
            print(f"[WIFI MONITOR] MAC -> {mac_str}")
            return mac_str
        except subprocess.CalledProcessError:
            return "Error"

    def enable_monitor_mode(self) -> bool:
        if not self.check_root():
            return False
        try:
            # Limpiar clon virtual si existe
            if os.path.exists(f"/sys/class/net/{self.interface}mon"):
                subprocess.run(["ip", "link", "set", f"{self.interface}mon", "down"], capture_output=True)
                subprocess.run(["iw", "dev", f"{self.interface}mon", "del"], capture_output=True)

            # Desconectar de NetworkManager antes de tocar el link
            try:
                subprocess.run(["nmcli", "device", "disconnect", self.interface],
                               capture_output=True, timeout=5)
                time.sleep(0.4)
            except Exception:
                pass

            subprocess.run(["ip", "link", "set", self.interface, "down"], check=True)
            time.sleep(0.4)
            subprocess.run(["iw", "dev", self.interface, "set", "power_save", "off"], capture_output=True)
            subprocess.run(["iw", "dev", self.interface, "set", "type", "monitor"], check=True)
            time.sleep(0.4)
            subprocess.run(["ip", "link", "set", self.interface, "up"], check=True)

            # Watchdog
            for _ in range(20):
                if os.path.exists(f"/sys/class/net/{self.interface}"):
                    break
                time.sleep(0.1)
            else:
                return False

            time.sleep(1.2)
            print(f"[WIFI MONITOR] {self.interface} en modo monitor.")
            return True
        except Exception as e:
            print(f"[WIFI MONITOR ERR] {e}")
            return False

    def enable_managed_mode(self) -> bool:
        if not self.check_root():
            return False
        # FIX: verificar si ya está en managed antes de cambiar
        try:
            result = subprocess.run(
                ["iw", "dev", self.interface, "info"],
                capture_output=True, text=True
            )
            if "type managed" in result.stdout:
                print("[WIFI MONITOR] Ya está en modo managed, nada que hacer.")
                return True
        except Exception:
            pass

        try:
            self.stop_hopping()
            subprocess.run(["ip", "link", "set", self.interface, "down"], check=True)
            time.sleep(0.2)
            subprocess.run(["iw", "dev", self.interface, "set", "type", "managed"], check=True)
            time.sleep(0.2)
            subprocess.run(["ip", "link", "set", self.interface, "up"], check=True)
            print(f"[WIFI MONITOR] {self.interface} en modo managed.")
            return True
        except Exception as e:
            print(f"[WIFI MONITOR ERR] {e}")
            return False

    async def _channel_hopper(self, channels: list, delay: float):
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
        if channels is None:
            channels = list(range(1, 14))
        self.is_hopping = True

        # FIX: obtener el loop correcto en lugar de asumir que existe
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                self._hopper_task = loop.create_task(
                    self._channel_hopper(channels, delay)
                )
            else:
                print("[WIFI MONITOR ERR] Event loop no activo, hopping no iniciado.")
        except RuntimeError as e:
            print(f"[WIFI MONITOR ERR] {e}")

    def stop_hopping(self):
        self.is_hopping = False
        if self._hopper_task and not self._hopper_task.done():
            self._hopper_task.cancel()
            print(f"[WIFI MONITOR] Hopping detenido en canal {self.current_channel}.")

wifi_monitor = WiFiMonitor()