import time
import sys
import asyncio
import json
import board
import busio
import RPi.GPIO as GPIO
from PIL import Image, ImageDraw, ImageFont
import adafruit_ssd1306
import aiohttp
import websockets

# 1. Configuración del Entorno C2 Engine
API_URL = "http://127.0.0.1:8000/api"
WS_URL = "ws://127.0.0.1:8000/ws/control"

WIDTH = 128
HEIGHT = 64

BUTTONS = {
    "UP": 17,
    "DOWN": 27,
    "LEFT": 22,   # VOLVER / CANCELAR
    "RIGHT": 23,
    "OK": 24      # AVANZAR / SELECCIONAR
}

try:
    i2c = busio.I2C(board.SCL, board.SDA)
    oled = adafruit_ssd1306.SSD1306_I2C(WIDTH, HEIGHT, i2c)
except Exception as e:
    print(f"[-] Error crítico de enlace I2C en OLED: {e}")
    sys.exit(1)

GPIO.setmode(GPIO.BCM)
for pin in BUTTONS.values():
    GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)

# 2. Variables de Estado Globales de la Interfaz
menu_items = [
    "1. WI-FI SNIFFER", 
    "2. NRF24 SPECTRUM", 
    "3. SCAN RFID", 
    "4. CAPTURE IR", 
    "5. BLE FLOOD"
]
current_idx = 0
current_view = "BANNER"
status_text = ""

# Amortiguadores dinámicos globales
wifi_networks = []  
nrf_channels = [0] * 16  

font = ImageFont.load_default()

# ─── MOTOR DE RENDERIZADO CENTRALIZADO ───
def draw_screen():
    """Genera el búfer gráfico basándose estrictamente en el estado actual de las variables globales"""
    image = Image.new("1", (WIDTH, HEIGHT))
    draw = ImageDraw.Draw(image)
    
    if current_view == "BANNER":
        draw.rectangle((0, 0, WIDTH-1, HEIGHT-1), outline=255, fill=0)
        draw.text((12, 12), "SENTINEL PHANTOM", font=font, fill=255)
        draw.text((24, 26), "[ CORE V2.0 ]", font=font, fill=255)
        draw.line(((15, 40), (112, 40)), fill=255)
        draw.text((18, 46), "PRESS OK TO BOOT", font=font, fill=255)

    elif current_view == "MENU":
        draw.text((0, 0), "SYS OPTIONS:", font=font, fill=255)
        draw.line(((0, 11), (WIDTH, 11)), fill=255)
        start = max(0, current_idx - 3)
        y = 14
        for i in range(start, min(start + 4, len(menu_items))):
            prefix = "> " if i == current_idx else "  "
            draw.text((0, y), f"{prefix}{menu_items[i]}", font=font, fill=255)
            y += 12

    elif current_view == "EXECUTING":
        draw.rectangle((0, 0, WIDTH-1, HEIGHT-1), outline=255, fill=0)
        draw.text((8, 10), ">> EXECUTING <<", font=font, fill=255)
        draw.text((4, 32), status_text[:20], font=font, fill=255)
        draw.text((4, 52), "[LEFT] TO ABORT", font=font, fill=255)

    elif current_view == "LIVE_WIFI":
        draw.text((0, 0), "RF MONITOR: WI-FI", font=font, fill=255)
        draw.line(((0, 11), (WIDTH, 11)), fill=255)
        if not wifi_networks:
            draw.text((10, 30), "Awaiting targets...", font=font, fill=255)
        else:
            y = 14
            for net in wifi_networks[:4]:
                ssid, rssi = net
                bar_w = max(2, int((rssi + 100) * 0.4))
                draw.text((0, y), f"{ssid[:10]}", font=font, fill=255)
                draw.rectangle((70, y+2, 70+bar_w, y+8), outline=255, fill=255)
                draw.text((112, y), f"{rssi}", font=font, fill=255)
                y += 12

    elif current_view == "LIVE_NRF24":
        draw.text((0, 0), "NRF24 SPECTRUM BAR", font=font, fill=255)
        draw.line(((0, 11), (WIDTH, 11)), fill=255)
        col_w = 6
        gap = 2
        for i, val in enumerate(nrf_channels):
            x = 2 + (i * (col_w + gap))
            bar_h = min(40, int(val * 4))
            y = 52 - bar_h
            draw.rectangle((x, y, x + col_w, 52), outline=255, fill=255)
        draw.text((0, 54), "2.4G Hz CHANNELS (0-15)", font=font, fill=255)

    elif current_view == "LIVE_DATA":
        draw.text((0, 0), "DATA CAPTURED", font=font, fill=255)
        draw.line(((0, 11), (WIDTH, 11)), fill=255)
        draw.text((0, 24), status_text[:21], font=font, fill=255)
        if len(status_text) > 21:
            draw.text((0, 38), status_text[21:42], font=font, fill=255)
        draw.text((0, 54), "[LEFT] TO RETURN", font=font, fill=255)

    try:
        oled.image(image)
        oled.show()
    except Exception:
        pass # Mitigar colisiones menores en el bus I2C

# ─── BUCLE REFRESCADOR ASÍNCRONO DEL HARDWARE (FPS CENTRAL) ───
async def screen_refresh_loop():
    """Vigila y empuja el dibujo a la OLED a unos 15 FPS de forma constante y limpia"""
    while True:
        draw_screen()
        await asyncio.sleep(0.06) # ~16 FPS, perfecto para refrescos sin parpadeo

# ─── DISPAROS HTTP ASÍNCRONOS ───
async def async_trigger_action(option):
    global current_view, status_text, wifi_networks, nrf_channels
    
    if option == 0:
        current_view = "LIVE_WIFI"
        wifi_networks = []
    elif option == 1:
        current_view = "LIVE_NRF24"
        nrf_channels = [0] * 16
    else:
        current_view = "EXECUTING"
        status_text = "Sending command..."

    async with aiohttp.ClientSession() as session:
        try:
            if option == 0: await session.post(f"{API_URL}/wifi/action", json={"cmd": "INITIALIZE"}, timeout=0.2)
            elif option == 1: await session.post(f"{API_URL}/nrf24/action", json={"cmd": "SCAN_SPECTRUM"}, timeout=0.2)
            elif option == 2: await session.post(f"{API_URL}/rfid/action", json={"cmd": "READ"}, timeout=0.2)
            elif option == 3: await session.post(f"{API_URL}/ir/action", json={"cmd": "CAPTURE"}, timeout=0.2)
            elif option == 4: await session.post(f"{API_URL}/ble/action", json={"cmd": "FLOOD_START", "ecosystem": "APPLE", "interval_ms": 30}, timeout=0.2)
        except Exception: pass

async def async_stop_action():
    async with aiohttp.ClientSession() as session:
        try:
            if current_idx == 0: await session.post(f"{API_URL}/wifi/action", json={"cmd": "STOP_MONITOR"}, timeout=0.5)
            elif current_idx == 1: await session.post(f"{API_URL}/nrf24/action", json={"cmd": "STOP_JAMMER"}, timeout=0.5)
            elif current_idx == 4: await session.post(f"{API_URL}/ble/action", json={"cmd": "FLOOD_STOP"}, timeout=0.5)
        except Exception: pass

# ─── RECOLECTOR ASÍNCRONO DE LOGS Y MENSAJES (SÓLO CONFIGURA VARIABLES) ───
async def websocket_listener():
    global current_view, wifi_networks, nrf_channels, status_text
    while True:
        try:
            async with websockets.connect(WS_URL) as ws:
                print("[+] Pipeline WebSocket acoplado y escuchando.")
                while True:
                    msg = await ws.recv()
                    payload = json.loads(msg)
                    
                    if not isinstance(payload, dict):
                        continue
                    
                    # 1. Captura anatómica para espectro NRF24 o Wi-Fi Spectrum crudo
                    if "channels" in payload:
                        raw_channels = payload.get("channels")
                        if isinstance(raw_channels, list):
                            for idx in range(min(16, len(raw_channels))):
                                nrf_channels[idx] = float(raw_channels[idx])
                                
                    else:
                        module = str(payload.get("module", "")).upper()
                        data = payload.get("data", payload)
                        
                        if isinstance(data, dict) and "channels" in data:
                            raw_channels = data.get("channels")
                            if isinstance(raw_channels, list):
                                for idx in range(min(16, len(raw_channels))):
                                    nrf_channels[idx] = float(raw_channels[idx])
                                
                        # 2. Captura e inyección para el Sniffer Wi-Fi (Venga de donde venga)
                        elif "ssid" in data or "rssi" in data or module == "WIFI":
                            ssid = data.get("ssid") or payload.get("ssid")
                            rssi = data.get("rssi") or payload.get("rssi")
                            if ssid and rssi:
                                # Filtrar duplicados
                                wifi_networks = [n for n in wifi_networks if n[0] != ssid]
                                wifi_networks.append((ssid, int(rssi)))
                                wifi_networks.sort(key=lambda x: x[1], reverse=True)
                                
                        # 3. Capturas estáticas (RFID, IR)
                        else:
                            uid = data.get("uid") or payload.get("uid")
                            proto = data.get("protocol") or payload.get("protocol")
                            if uid and current_view == "EXECUTING":
                                status_text = f"UID: {uid}"
                                current_view = "LIVE_DATA"
                            elif proto and current_view == "EXECUTING":
                                code = data.get("code") or payload.get("code")
                                status_text = f"IR: {proto}\n0x{code}"
                                current_view = "LIVE_DATA"
        except Exception:
            await asyncio.sleep(1)

# ─── LAZO DE ESCUCHA DEL D-PAD (SÓLO CAMBIA ESTADOS INTERNOS) ───
async def main_hardware_loop():
    global current_idx, current_view
    
    while True:
        if current_view == "BANNER":
            if not GPIO.input(BUTTONS["OK"]):
                current_view = "MENU"
                await asyncio.sleep(0.3)
                
        elif current_view == "MENU":
            if not GPIO.input(BUTTONS["DOWN"]):
                current_idx = (current_idx + 1) % len(menu_items)
                await asyncio.sleep(0.2)
            elif not GPIO.input(BUTTONS["UP"]):
                current_idx = (current_idx - 1) % len(menu_items)
                await asyncio.sleep(0.2)
            elif not GPIO.input(BUTTONS["OK"]):
                asyncio.create_task(async_trigger_action(current_idx))
                await asyncio.sleep(0.3)
                
        elif current_view in ["EXECUTING", "LIVE_WIFI", "LIVE_NRF24", "LIVE_DATA"]:
            if not GPIO.input(BUTTONS["LEFT"]):
                asyncio.create_task(async_stop_action())
                current_view = "MENU"
                await asyncio.sleep(0.3)
                
        await asyncio.sleep(0.05)

async def main():
    # El lazo asíncrono ahora ejecuta las TRES tareas en paralelo, aislando el renderizado de la red
    await asyncio.gather(
        websocket_listener(),
        main_hardware_loop(),
        screen_refresh_loop()
    )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        image = Image.new("1", (WIDTH, HEIGHT))
        oled.image(image)
        oled.show()
        GPIO.cleanup()