# backend/drivers/wifi/__init__.py

from .wifi_monitor import wifi_monitor
from .wifi_sniffer import WiFiSniffer
from .wifi_lan import wifi_lan
from .wifi_driver import wifi_driver

# Aquí es donde realmente nacen las instancias en minúscula que usa app.py
# Le pasamos la instancia de wifi_monitor al sniffer para que compartan el estado del hardware
wifi_sniffer = WiFiSniffer(wifi_monitor)

# Exponemos todo de forma explícita para el paquete
__all__ = ["wifi_monitor", "wifi_sniffer", "wifi_lan", "wifi_driver"]