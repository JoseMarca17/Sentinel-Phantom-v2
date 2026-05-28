# backend/config.py
import os

def es_raspberry_pi() -> bool:
    try:
        with open('/proc/device-tree/model', 'r') as f:
            return "Raspberry Pi" in f.read()
    except:
        return False

if es_raspberry_pi():
    INTERFACE_CONTROL = "wlan0"  
    INTERFACE_ATTACK  = "wlan1"  
else:
    INTERFACE_CONTROL = "wlo1"          
    INTERFACE_ATTACK  = "wlp8s0f3u1"    