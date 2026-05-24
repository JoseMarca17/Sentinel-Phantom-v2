from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import asyncio

from backend.core.socket_manager import socket_manager
from backend.core.serial_bridge import serial_bridge
from backend.drivers.esp32.ir_driver import ir_driver
from backend.drivers.esp32.rfid_driver import rfid_driver
from backend.drivers.esp32.nrf24_driver import nrf24_driver
from backend.drivers.esp32.subghz_driver import subghz_driver
import backend.models as models
from backend.database import engine, get_db

# 1. Instanciar la base de datos (Auto-crear tablas al arrancar el C2)
models.Base.metadata.create_all(bind=engine)

# 2. Inicializar la aplicación FastAPI
app = FastAPI(title="Sentinel Phantom C2 Engine")

# 3. Configurar Middlewares de red
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 4. Inicializar hilos de hardware UART
serial_bridge.start()

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(socket_manager.start_dispatcher())


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
        mode = payload.get("mode", "SINGLE")  # "SINGLE" o "CARPET"
        channel = int(payload.get("channel", 1))
        success = nrf24_driver.trigger_start_jamming(mode, channel)
        return {"status": "OK", "detail": f"Jammer inyectado en Ch {channel}", "transport_success": success}
        
    elif cmd == "STOP_JAMMER":
        success = nrf24_driver.trigger_stop_jamming()
        return {"status": "SUCCESS", "detail": "Señal de paro transmitida", "transport_success": success}
        
    return JSONResponse(status_code=400, content={"error": "Unknown tactical NRF24 command"})

# backend/app.py
# (Busca la sección de endpoints donde pusiste las rutas de NRF24 o RFID)

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
@app.websocket("/ws/control")
async def websocket_endpoint(websocket: WebSocket):
    await socket_manager.connect(websocket)
    try:
        # Loop asíncrono pasivo de monitoreo de enlace sin bloqueo de hilos
        while True:
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        socket_manager.disconnect(websocket)