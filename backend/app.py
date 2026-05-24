from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import asyncio
import subprocess
from contextlib import asynccontextmanager

from backend.core.socket_manager import socket_manager
from backend.core.serial_bridge import serial_bridge
from backend.drivers.esp32.ir_driver import ir_driver
from backend.drivers.esp32.rfid_driver import rfid_driver
from backend.drivers.esp32.nrf24_driver import nrf24_driver
from backend.drivers.esp32.subghz_driver import subghz_driver

# Importación unificada desde el __init__.py del paquete wifi
from backend.drivers.wifi import wifi_monitor, wifi_sniffer, wifi_lan, wifi_driver

from backend.models import WiFiCapture
import backend.models as models
from backend.database import engine, get_db

# Inicializar la base de datos (Auto-crear tablas al arrancar el C2)
models.Base.metadata.create_all(bind=engine)


# 🟢 ADMINISTRADOR DE CICLO DE VIDA DE HARDWARE AUTOMATIZADO (LIFESPAN)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ─── LÓGICA AL ARRANCAR EL SERVIDOR (STARTUP) ───
    print("[C2 BOOT] Asegurando estado inicial limpio del hardware inalámbrico...")
    try:
        # Aseguramos que arranque en modo administrado estándar para remover bloqueos previos
        subprocess.run(["ip", "link", "set", wifi_monitor.interface, "down"], capture_output=True)
        subprocess.run(["iw", "dev", wifi_monitor.interface, "set", "type", "managed"], capture_output=True)
        subprocess.run(["ip", "link", "set", wifi_monitor.interface, "up"], capture_output=True)
        print("[C2 BOOT] Subsistema inalámbrico higienizado y libre de interfaces fantasmas.")
    except Exception as e:
        print(f"[C2 BOOT WARNING] No se pudo limpiar la interfaz física: {e}")
    
    # Inicializar hilos de hardware UART y WebSockets
    serial_bridge.start()
    asyncio.create_task(socket_manager.start_dispatcher())
    
    yield  # El C2 se queda operando de forma normal
    
    # ─── LÓGICA AL APAGAR EL SERVIDOR CON CTRL+C (SHUTDOWN) ───
    print("\n[C2 SHUTDOWN] Apagado controlado detectado. Desmantelando laboratorio de red...")
    try:
        if wifi_sniffer.is_sniffing:
            wifi_sniffer.stop()
        wifi_monitor.stop_hopping()
        
        # Devolvemos la tarjeta física real a modo cliente normal al apagar
        print(f"[C2 SHUTDOWN] Devolviendo {wifi_monitor.interface} a modo administrado...")
        subprocess.run(["ip", "link", "set", wifi_monitor.interface, "down"], capture_output=True)
        subprocess.run(["iw", "dev", wifi_monitor.interface, "set", "type", "managed"], capture_output=True)
        subprocess.run(["ip", "link", "set", wifi_monitor.interface, "up"], capture_output=True)
        print("[C2 SHUTDOWN] Antena restaurada a modo cliente de forma segura.")
    except Exception as e:
        print(f"[C2 SHUTDOWN ERR] Fallo en repliegue automático de hardware: {e}")


# Inicializar aplicación FastAPI acoplada al Lifespan moderno
app = FastAPI(title="Sentinel Phantom C2 Engine", lifespan=lifespan)

# Configurar Middlewares de red
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── ENDPOINTS DE LA API (CORE / IR) ───

@app.get("/")
async def root_status():
    return JSONResponse(content={
        "status": "ONLINE",
        "system": "Sentinel Phantom v2",
        "author": "Jose Andres Marca Cruz",
        "api_version": "2.0.0"
    })

@app.get("/api/ir/signals")
async def get_saved_ir_signals(db: Session = Depends(get_db)):
    """Devuelve el volcado completo de capturas almacenadas en la base de datos."""
    captures = db.query(models.IRCapture).order_by(models.IRCapture.id.desc()).all()
    return [{
        "id": c.id,
        "protocol": c.protocol,
        "code": c.code,
        "bits": c.bits,
        "date": c.timestamp.strftime("%d/%m %H:%M")
    } for c in captures]

@app.post("/api/ir/action")
async def trigger_ir_action(payload: dict, db: Session = Depends(get_db)):
    """Pasarela API-REST síncrona con retorno de estado analógico y logs."""
    cmd = payload.get("cmd")
    print(f"[C2 COMMAND] Ejecutando orden en bus IR: {cmd}")
    
    if cmd == "CAPTURE":
        success = ir_driver.trigger_capture()
        return {
            "status": "AWAITING_HARDWARE", 
            "detail": "Ventana de escucha de 5s iniciada en GPIO 26",
            "transport_success": success
        }
    elif cmd == "TV_B_GONE":
        success = ir_driver.trigger_tv_bgone()
        print(f"[UART TX] TV_B_GONE inyectado al bus serie. Estado físico: {success}")
        return JSONResponse(content={
            "status": "SUCCESS" if success else "ERROR",
            "mod": "IR",
            "cmd": "TV_B_GONE",
            "detail": "Ráfagas bruteforce enviadas al transistor" if success else "Fallo de bus"
        })
    elif cmd == "REPLAY":
        proto = payload.get("protocol")
        code_str = payload.get("code")
        bits = payload.get("bits", 32)
        code_int = int(code_str, 16) if "0x" in str(code_str).lower() else int(code_str)
        success = ir_driver.trigger_replay(proto, code_int, bits)
        print(f"[UART TX] REPLAY -> Proto: {proto} | Code: {code_str} | Bits: {bits} | OK: {success}")
        return JSONResponse(content={
            "status": "SUCCESS" if success else "ERROR",
            "mod": "IR",
            "cmd": "REPLAY",
            "data": {"protocol": proto, "code": code_str, "bits": bits}
        })
    return JSONResponse(status_code=400, content={"error": "Unknown tactical command"})


# ─── ENDPOINTS DE LA API (RFID / NFC) ───

@app.get("/api/rfid/history")
async def get_rfid_history(db: Session = Depends(get_db)):
    """Obtiene el historial de tarjetas leídas ordenadas desde la más reciente."""
    cards = db.query(models.RFIDCapture).order_by(models.RFIDCapture.id.desc()).all()
    return [{
        "id": c.id,
        "uid": c.uid,
        "card_type": c.card_type,
        "date": c.timestamp.strftime("%d/%m %H:%M:%S")
    } for c in cards]

@app.post("/api/rfid/action")
async def trigger_rfid_action(payload: dict, db: Session = Depends(get_db)):
    cmd = payload.get("cmd")
    print(f"[C2 COMMAND] RFID -> Ejecutando acción de hardware: {cmd}")
    
    if cmd == "READ":
        success = rfid_driver.trigger_read()
        print(f"[UART TX] READ_CARD transmitido al PN532. Estatus UART: {success}")
        return {"status": "AWAITING_HARDWARE", "detail": "Buscando UID...", "transport_success": success}
        
    elif cmd == "DUMP":
        success = rfid_driver.trigger_dump()
        print(f"[UART TX] DUMP_MIFARE transmitido al PN532. Estatus UART: {success}")
        return {"status": "AWAITING_HARDWARE", "detail": "Crackeando bloques...", "transport_success": success}
        
    elif cmd == "CLONE":
        uid_target = payload.get("uid")
        if not uid_target:
            last_card = db.query(models.RFIDCapture).order_by(models.RFIDCapture.id.desc()).first()
            if not last_card:
                print("[-] Fallo de inyección: Base de datos SQLite vacía para clonación.")
                return JSONResponse(status_code=400, content={"status": "ERROR", "detail": "Base de datos vacía. Lee una tarjeta primero."})
            uid_target = last_card.uid
            
        success = rfid_driver.trigger_clone(uid_target)
        print(f"[UART TX] CLONE_UID -> Destino: {uid_target} | Estatus UART: {success}")
        return {
            "status": "AWAITING_HARDWARE", 
            "detail": f"Preparando clonación. UID: {uid_target}", 
            "target_uid": uid_target,
            "transport_success": success
        }
        
    return JSONResponse(status_code=400, content={"error": "Unknown tactical RFID command"})


# ─── ENDPOINTS NRF24L01+ COMPLETOS (BARRIDO, SNIFFER Y ATTACK) ───

@app.post("/api/nrf24/action")
async def trigger_nrf_action(payload: dict):
    cmd = payload.get("cmd")
    print(f"[C2 COMMAND] NRF24 -> Orden de hardware: {cmd}")
    
    if cmd == "SCAN_SPECTRUM":
        success = nrf24_driver.trigger_spectrum_scan()
        return {"status": "OK", "detail": "Barrido solicitado", "transport_success": success}
        
    elif cmd == "SCAN_HID":
        success = nrf24_driver.trigger_hid_scan()
        return {"status": "OK", "detail": "Sniffer HID solicitado", "transport_success": success}
        
    elif cmd == "START_JAMMER":
        mode = payload.get("mode", "SINGLE")  
        channel = int(payload.get("channel", 1))
        success = nrf24_driver.trigger_start_jamming(mode, channel)
        return {"status": "OK", "detail": f"Jammer inyectado en Ch {channel}", "transport_success": success}
        
    elif cmd == "STOP_JAMMER":
        success = nrf24_driver.trigger_stop_jamming()
        return {"status": "SUCCESS", "detail": "Señal de paro transmitida", "transport_success": success}
        
    return JSONResponse(status_code=400, content={"error": "Unknown tactical NRF24 command"})


# ─── ENDPOINTS CC1101 SUB-GHZ COMPLETOS ───

@app.post("/api/subghz/action")
async def trigger_subghz_action(payload: dict):
    cmd = payload.get("cmd")
    print(f"[C2 COMMAND] SUBGHZ -> Directiva serial: {cmd}")
    
    if cmd == "SCAN":
        subghz_driver.trigger_scan()
        return {"status": "OK", "detail": "Barrido de RSSI solicitado"}
        
    elif cmd == "CAPTURE":
        freq = payload.get("freq_mhz", 433.92)
        subghz_driver.trigger_capture(freq)
        return {"status": "OK", "detail": f"Capturador montado en {freq} MHz"}
        
    elif cmd == "REPLAY":
        freq = payload.get("freq_mhz", 433.92)
        pulse_str = payload.get("pulse_string", "")
        subghz_driver.trigger_replay(freq, pulse_str)
        return {"status": "OK", "detail": "Clone transmitido al ESP32"}
        
    elif cmd == "JAM":
        freq = payload.get("freq_mhz", 433.92)
        duration = payload.get("duration_ms", 1000)
        subghz_driver.trigger_jam(freq, duration)
        return {"status": "OK", "detail": "Ruido inyectado en frecuencia"}
        
    return JSONResponse(status_code=400, content={"error": "Unknown command"})

@app.get("/api/subghz/history")
async def get_subghz_history(db: Session = Depends(get_db)):
    """Consulta el índice de señales clonadas usando el motor de SQLAlchemy ORM."""
    captures = db.query(models.SubGHzCapture).order_by(models.SubGHzCapture.id.desc()).all()
    return [
        {
            "id": c.id,
            "alias": c.alias,
            "freq_mhz": c.freq_mhz,
            "pulse_string": c.pulse_string,
            "date": c.timestamp.strftime("%Y-%m-%d %H:%M:%S") if c.timestamp else ""
        }
        for c in captures
    ]


# ─── ENDPOINTS WI-FI COMPLETOS (ESTRATEGIA MONITOR DIRECTO ESTILO WIFITE) ───

@app.post("/api/wifi/action")
async def trigger_wifi_action(payload: dict, db: Session = Depends(get_db)):
    cmd = payload.get("cmd")
    print(f"[C2 COMMAND] WI-FI -> Directiva de red: {cmd}")
    
    if cmd == "INITIALIZE":
        # APAGADO PREVENTIVO: Limpiamos software de sesiones previas antes de tocar hardware
        if wifi_sniffer.is_sniffing:
            wifi_sniffer.stop()
        wifi_monitor.stop_hopping()
        
        # Opcional: Descomenta si tu antena tolera Spoofing de MAC en monitor directo sin colapsar el driver
        # wifi_monitor.randomize_mac(wifi_monitor.interface)
        
        # Conmutamos el hardware físico puro de la antena directo a monitor
        success = wifi_monitor.enable_monitor_mode()
        if success:
            print("[C2 CORE] Esperando 1.5s a que el subsistema nl80211 indexe la interfaz...")
            await asyncio.sleep(1.5)
            
            # Inicialización secuencial controlada sobre la interfaz pura
            wifi_monitor.start_hopping(delay=0.3)
            wifi_sniffer.start()
            
        return {"status": "SUCCESS" if success else "ERROR", "detail": "Modo monitor directo activo y escáner iniciado"}
    
    elif cmd == "STOP_MONITOR":
        # FLUJO SECUENCIAL ESTRICTO: Primero matamos software síncronamente antes de alterar el link físico
        if wifi_sniffer.is_sniffing:
            wifi_sniffer.stop()  # Bloquea la API hasta que Scapy suelta los descriptores del socket
        wifi_monitor.stop_hopping()
        
        # RESTAURACIÓN DIRECTA EN CALIENTE: Regresamos la antena física a modo cliente normal
        try:
            print(f"[C2 CORE] Devolviendo {wifi_monitor.interface} a modo administrado...")
            subprocess.run(["ip", "link", "set", wifi_monitor.interface, "down"], capture_output=True)
            subprocess.run(["iw", "dev", wifi_monitor.interface, "set", "type", "managed"], capture_output=True)
            subprocess.run(["ip", "link", "set", wifi_monitor.interface, "up"], capture_output=True)
            print("[C2 CORE] Antena física devuelta a modo administrado con éxito.")
        except Exception:
            pass
            
        return {"status": "SUCCESS", "detail": "Antena restaurada a modo administrado de forma síncrona"}
        
    elif cmd == "DEAUTH_TARGET":
        bssid = payload.get("bssid")
        client = payload.get("client", "FF:FF:FF:FF:FF:FF")
        if not bssid:
            return JSONResponse(status_code=400, content={"error": "Falta BSSID objetivo"})
            
        wifi_monitor.stop_hopping() 
        
        # 🟢 CORREGIDO: Apuntamos dinámicamente a la interfaz física real activa (wlp8s0f3u1)
        iface_tactica = wifi_monitor.monitor_interface
        
        wifi_lan.start_handshake_sniffer(iface_tactica, bssid)
        wifi_lan.trigger_deauth(iface_tactica, bssid, client, count=45)
        return {"status": "SUCCESS", "detail": "Ataque de desautenticación inyectado e interceptor EAPOL armado"}
        
    elif cmd == "LAN_SCAN":
        ip_range = payload.get("range", "192.168.1.0/24")
        
        # 🟢 CORREGIDO: Apuntamos transparentemente a tu tarjeta interna "wlo1" para no tumbar tu red
        iface_lan = "wlo1"
        
        print(f"[C2 CORE] Lanzando descubrimiento ARP en la interfaz local activa: {iface_lan}")
        wifi_lan.trigger_arp_scan(iface_lan, ip_range)
        return {"status": "SUCCESS", "detail": f"Escáner ARP lanzado en {ip_range} vía {iface_lan}"}
        
    return JSONResponse(status_code=400, content={"error": "Comando inalámbrico desconocido"})

@app.get("/api/wifi/handshakes")
async def get_wifi_handshakes(db: Session = Depends(get_db)):
    """Devuelve la lista indexada de intercambios de llaves capturados."""
    captures = db.query(WiFiCapture).order_by(WiFiCapture.id.desc()).all()
    return [
        {
            "id": c.id,
            "ssid": c.ssid,
            "bssid": c.bssid,
            "channel": c.channel,
            "encryption": c.encryption,
            "path": c.payload_path,
            "date": c.timestamp.strftime("%Y-%m-%d %H:%M:%S") if c.timestamp else ""
        }
        for c in captures
    ]
 
@app.get("/api/wifi/access-points")
async def get_wifi_access_points(db: Session = Depends(get_db)):
    """Devuelve el inventario histórico de redes interceptadas en el aire."""
    aps = db.query(models.WiFiAccessPoint).order_by(models.WiFiAccessPoint.last_seen.desc()).all()
    return [
        {
            "id": c.id,
            "ssid": c.ssid,
            "bssid": c.bssid,
            "channel": c.channel,
            "rssi": c.rssi,
            "wps_active": c.wps_active,
            "is_rogue": c.is_rogue,
            "date": c.last_seen.strftime("%d/%m %H:%M:%S") if c.last_seen else ""
        }
        for c in aps
    ]

@app.get("/api/wifi/clients")
async def get_wifi_clients(db: Session = Depends(get_db)):
    """Devuelve el inventario histórico de estaciones y clientes interceptados."""
    clients = db.query(models.WiFiClient).order_by(models.WiFiClient.last_seen.desc()).all()
    return [
        {
            "id": c.id,
            "mac": c.mac,
            "associated_bssid": c.associated_bssid,
            "searching_for": c.searching_for,
            "rssi": c.rssi,
            "client_type": c.client_type,
            "ip_address": c.ip_address,
            "date": c.last_seen.strftime("%d/%m %H:%M:%S") if c.last_seen else ""
        }
        for c in clients
    ]
    
@app.websocket("/ws/control")
async def websocket_endpoint(websocket: WebSocket):
    await socket_manager.connect(websocket)
    try:
        while True:
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        socket_manager.disconnect(websocket)