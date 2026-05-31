import time
import sys
import asyncio
import threading
import requests
import websockets
import json
import board
import busio
import RPi.GPIO as GPIO
from PIL import Image, ImageDraw, ImageFont
import adafruit_ssd1306

# 1. Configuración de Entorno e Infraestructura C2
API_URL = "http://127.0.0.1:8000/api"
WS_URL = "ws://127.0.0.1:8000/ws/control"

WIDTH = 128
HEIGHT = 64

BUTTONS = {
    "UP": 17,
    "DOWN": 27,
    "LEFT": 22,   # Funciona como VOLVER / CANCELAR
    "RIGHT": 23,  # Control secundario
    "OK": 24      # AVANZAR / SELECCIONAR
}

try:
    i2c = busio.I2C(board.SCL, board.SDA)
    oled = adafruit_ssd1306.SSD1306_I2C(WIDTH, HEIGHT, i2c)
except Exception as e:
    print(f"[-] Error I2C OLED: {e}")
    sys.exit(1)

GPIO.setmode(GPIO.BCM)
for pin in BUTTONS.values():
    GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)

# 2. Variables de Estado de la Máquina de Estados (UI)
menu_items = [
    "1. WI-FI SNIFFER", 
    "2. NRF24 SPECTRUM", 
    "3. SCAN RFID", 
    "4. CAPTURE IR", 
    "5. BLE FLOOD"
]
current_idx = 0
current_view = "BANNER"  # Estados: BANNER, MENU, EXECUTING, LIVE_WIFI, LIVE_NRF24, LIVE_DATA

# Estructuras de almacenamiento para datos en vivo (Muestreo rápido)
wifi_networks = []  # Almacena tuplas: (SSID, RSSI)
nrf_channels = [0] * 16  # Mapeo simplificado de canales del barrido RSSI

font = ImageFont.load_default()

# ─── MÓDULO VISUAL: RENDERIZADOR ESPECÍFICO DE ESTADOS ───
def render_ui():
    image = Image.new("1", (WIDTH, HEIGHT))
    draw = ImageDraw.Draw(image)
    
    if current_view == "BANNER":
        # Pantalla de Bienvenida (Estilo Terminal Militar)
        draw.rectangle((0, 0, WIDTH-1, HEIGHT-1), outline=255, fill=0)
        draw.text((12, 12), "SENTINEL PHANTOM", font=font, fill=255)
        draw.text((24, 26), "[ CORE V2.0 ]", font=font, fill=255)
        # CORREGIDO: Tupla doble obligatoria para Pillow ((x1, y1), (x2, y2))
        draw.line(((15, 40), (112, 40)), fill=255)
        draw.text((18, 46), "PRESS OK TO BOOT", font=font, fill=255)

    elif current_view == "MENU":
        # Menú Principal
        draw.text((0, 0), "SYS OPTIONS:", font=font, fill=255)
        # CORREGIDO: Tupla doble obligatoria ((x1, y1), (x2, y2))
        draw.line(((0, 11), (WIDTH, 11)), fill=255)
        
        # Mostrar opciones con scroll adaptativo básico
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
        # Interfaz Avanzada Wi-Fi
        draw.text((0, 0), "RF MONITOR: WI-FI", font=font, fill=255)
        # CORREGIDO: Tupla doble obligatoria ((x1, y1), (x2, y2))
        draw.line(((0, 11), (WIDTH, 11)), fill=255)
        
        if not wifi_networks:
            draw.text((10, 30), "Awaiting targets...", font=font, fill=255)
        else:
            y = 14
            for net in wifi_networks[:4]: # Muestra los 4 mejores APs detectados
                ssid, rssi = net
                # Dibujar barra de intensidad gráfica
                bar_w = max(2, int((rssi + 100) * 0.4)) # Normalización de señal
                draw.text((0, y), f"{ssid[:10]}", font=font, fill=255)
                draw.rectangle((70, y+2, 70+bar_w, y+8), outline=255, fill=255)
                draw.text((112, y), f"{rssi}", font=font, fill=255)
                y += 12

    elif current_view == "LIVE_NRF24":
        # Interfaz Gráfica Avanzada NRF24 (Analizador de Espectro)
        draw.text((0, 0), "NRF24 SPECTRUM BAR", font=font, fill=255)
        # CORREGIDO: Tupla doble obligatoria ((x1, y1), (x2, y2))
        draw.line(((0, 11), (WIDTH, 11)), fill=255)
        
        # Dibujar 16 columnas para representar los canales de barrido de frecuencia
        col_w = 6
        gap = 2
        for i, val in enumerate(nrf_channels):
            x = 2 + (i * (col_w + gap))
            # Calcular altura de la barra según la saturación de ruido recibida
            bar_h = min(40, int(val * 4)) 
            y = 52 - bar_h
            draw.rectangle((x, y, x + col_w, 52), outline=255, fill=255)
            
        draw.text((0, 54), "2.4G Hz CHANNELS (0-15)", font=font, fill=255)

    elif current_view == "LIVE_DATA":
        draw.text((0, 0), "DATA CAPTURED", font=font, fill=255)
        # CORREGIDO: Tupla doble obligatoria ((x1, y1), (x2, y2))
        draw.line(((0, 11), (WIDTH, 11)), fill=255)
        draw.text((0, 24), status_text[:21], font=font, fill=255)
        if len(status_text) > 21:
            draw.text((0, 38), status_text[21:42], font=font, fill=255)
        draw.text((0, 54), "[LEFT] TO RETURN", font=font, fill=255)

    oled.image(image)
    oled.show()

# ─── INYECCIÓN DE DIRECTIVAS AL MOTOR FASTAPI ───
def trigger_action(option):
    global current_view, status_text, wifi_networks, nrf_channels
    
    try:
        if option == 0:  # WI-FI SNIFFER (Especial)
            current_view = "LIVE_WIFI"
            wifi_networks = []
            render_ui()
            requests.post(f"{API_URL}/wifi/action", json={"cmd": "INITIALIZE"}, timeout=2)
        elif option == 1:  # NRF24 SPECTRUM (Especial)
            current_view = "LIVE_NRF24"
            nrf_channels = [0] * 16
            render_ui()
            requests.post(f"{API_URL}/nrf24/action", json={"cmd": "SCAN_SPECTRUM"}, timeout=2)
        elif option == 2:  # SCAN RFID (Ejecutable simple)
            current_view = "EXECUTING"
            status_text = "Reading RFID..."
            render_ui()
            requests.post(f"{API_URL}/rfid/action", json={"cmd": "READ"}, timeout=2)
        elif option == 3:  # CAPTURE IR (Ejecutable simple)
            current_view = "EXECUTING"
            status_text = "IR Receiver Armed..."
            render_ui()
            requests.post(f"{API_URL}/ir/action", json={"cmd": "CAPTURE"}, timeout=2)
        elif option == 4:  # BLE FLOOD (Ejecutable simple)
            current_view = "EXECUTING"
            status_text = "BLE Spammer Active"
            render_ui()
            requests.post(f"{API_URL}/ble/action", json={"cmd": "FLOOD_START", "ecosystem": "APPLE", "interval_ms": 30}, timeout=2)
    except Exception:
        current_view = "EXECUTING"
        status_text = "Link Error to C2"
    render_ui()

# ─── RECOLECTOR ASÍNCRONO: WEBSOCKETS (MONITOREO EN VIVO) ───
async def websocket_listener():
    global current_view, wifi_networks, nrf_channels, status_text
    while True:
        try:
            async with websockets.connect(WS_URL) as ws:
                print("[+] Pipeline WS acoplado a la OLED.")
                while True:
                    msg = await ws.recv()
                    payload = json.loads(msg)
                    
                    if not isinstance(payload, dict):
                        continue
                        
                    module = payload.get("module", "").upper()
                    data = payload.get("data", {})
                    
                    # 1. Captura e Inyección para Wi-Fi Sniffer en Vivo
                    if current_view == "LIVE_WIFI":
                        ssid = data.get("ssid") or payload.get("ssid")
                        rssi = data.get("rssi") or payload.get("rssi")
                        if ssid and rssi:
                            wifi_networks = [n for n in wifi_networks if n[0] != ssid]
                            wifi_networks.append((ssid, int(rssi)))
                            wifi_networks.sort(key=lambda x: x[1], reverse=True)
                            render_ui()
                            
                    # 2. Captura e Inyección para el Espectro NRF24
                    elif current_view == "LIVE_NRF24" and module == "NRF24":
                        raw_channels = data.get("channels") or payload.get("channels")
                        if isinstance(raw_channels, list):
                            for idx in range(min(16, len(raw_channels))):
                                nrf_channels[idx] = raw_channels[idx]
                            render_ui()
                            
                    # 3. Interrupciones globales de Capturas Simples (RFID, IR)
                    else:
                        uid = data.get("uid") or payload.get("uid")
                        proto = data.get("protocol") or payload.get("protocol")
                        if uid:
                            status_text = f"UID: {uid}"
                            current_view = "LIVE_DATA"
                            render_ui()
                        elif proto:
                            code = data.get("code") or payload.get("code")
                            status_text = f"IR: {proto}\n0x{code}"
                            current_view = "LIVE_DATA"
                            render_ui()
                            
        except Exception:
            await asyncio.sleep(2)

def start_ws_thread():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(websocket_listener())

# ─── LAZO DE CONTROL PRIMARIO DE LOS PULSADORES ───
def main_hardware_loop():
    global current_idx, current_view
    
    render_ui()
    while True:
        # 1. Control en Estado BANNER
        if current_view == "BANNER":
            if not GPIO.input(BUTTONS["OK"]):
                current_view = "MENU"
                render_ui()
                time.sleep(0.3)
                
        # 2. Control en Estado MENÚ PRINCIPAL
        elif current_view == "MENU":
            if not GPIO.input(BUTTONS["DOWN"]):
                current_idx = (current_idx + 1) % len(menu_items)
                render_ui()
                time.sleep(0.2)
            elif not GPIO.input(BUTTONS["UP"]):
                current_idx = (current_idx - 1) % len(menu_items)
                render_ui()
                time.sleep(0.2)
            elif not GPIO.input(BUTTONS["OK"]):
                trigger_action(current_idx)
                time.sleep(0.3)
                
        # 3. Control en Vistas Interactivas o de Ejecución (Retorno)
        elif current_view in ["EXECUTING", "LIVE_WIFI", "LIVE_NRF24", "LIVE_DATA"]:
            if not GPIO.input(BUTTONS["LEFT"]):
                try:
                    if current_idx == 0:
                        requests.post(f"{API_URL}/wifi/action", json={"cmd": "STOP_MONITOR"}, timeout=1)
                    elif current_idx == 1:
                        requests.post(f"{API_URL}/nrf24/action", json={"cmd": "STOP_SCAN"}, timeout=1)
                    elif current_idx == 4:
                        requests.post(f"{API_URL}/ble/action", json={"cmd": "FLOOD_STOP"}, timeout=1)
                except:
                    pass
                    
                current_view = "MENU"
                render_ui()
                time.sleep(0.3)
                
        time.sleep(0.05)

if __name__ == "__main__":
    ws_thread = threading.Thread(target=start_ws_thread, daemon=True)
    ws_thread.start()
    
    try:
        main_hardware_loop()
    except KeyboardInterrupt:
        image = Image.new("1", (WIDTH, HEIGHT))
        oled.image(image)
        oled.show()
        GPIO.cleanup()