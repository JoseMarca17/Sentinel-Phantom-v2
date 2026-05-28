# backend/app.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import asyncio
import subprocess
from contextlib import asynccontextmanager

# 🚀 1. IMPORTACIÓN PRIORITARIA DE BASE DE DATOS Y MODELOS (Obliga al Kernel a mapear todo)
from backend.database import engine, get_db
import backend.models as models

# 🚀 2. INICIALIZACIÓN PROTEGIDA Y RESERVADA DEL ESQUEMA SQLITE
try:
    # Vincula todas las tablas (rfid_captures, ir_captures, etc.) respetando los datos existentes
    models.Base.metadata.create_all(bind=engine)
    print("[DB CORE] Mapeo de persistencia SQLite unificado con éxito. Estructura preservada.")
except Exception as db_err:
    print(f"[DB CORE CRITICAL] Error al enlazar modelos con el motor ORM: {db_err}")

# 3. IMPORTACIÓN DE COMPONENTES DEL C2 Y DRIVERS INDUSTRIALES
from backend.core.socket_manager import socket_manager
from backend.core.serial_bridge import serial_bridge
from backend.drivers.esp32.ir_driver import ir_driver
from backend.drivers.esp32.rfid_driver import rfid_driver
from backend.drivers.esp32.nrf24_driver import nrf24_driver
from backend.drivers.esp32.subghz_driver import subghz_driver

# Importación unificada desde el paquete wifi
from backend.drivers.wifi import wifi_monitor, wifi_sniffer, wifi_lan, wifi_driver
from backend.config import INTERFACE_ATTACK


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

# ─── ENDPOINTS DE LA API (CORE / IR COREGIDO) ───

@app.get("/api/ir/signals")
async def get_saved_ir_signals(db: Session = Depends(get_db)):
    """Devuelve el volcado completo de capturas almacenadas tolerando formatos de fecha."""
    captures = db.query(models.IRCapture).order_by(models.IRCapture.id.desc()).all()
    res_data = []
    for c in captures:
        # Si ya es string, lo pasamos directo; si es objeto datetime, lo formateamos
        date_str = c.timestamp.strftime("%d/%m %H:%M") if hasattr(c.timestamp, "strftime") else str(c.timestamp)[:16]
        res_data.append({
            "id": c.id,
            "protocol": c.protocol,
            "code": c.code,
            "bits": c.bits,
            "date": date_str
        })
    return res_data



@app.post("/api/ir/action")
async def trigger_ir_action(payload: dict, db: Session = Depends(get_db)):
    cmd = payload.get("cmd")
    print(f"[C2 COMMAND] Ejecutando orden en bus IR: {cmd}")
    
    if cmd == "CAPTURE":
        success = ir_driver.trigger_capture()
        return {"status": "AWAITING_HARDWARE", "detail": "Escucha de 5s iniciada en GPIO 26", "transport_success": success}
    elif cmd == "TV_B_GONE":
        success = ir_driver.trigger_tv_bgone()
        return JSONResponse(content={"status": "SUCCESS" if success else "ERROR", "mod": "IR", "cmd": "TV_B_GONE", "detail": "Ráfagas enviadas" if success else "Fallo"})
    elif cmd == "REPLAY":
        proto = payload.get("protocol")
        code_str = payload.get("code")
        bits = payload.get("bits", 32)
        code_int = int(code_str, 16) if "0x" in str(code_str).lower() else int(code_str)
        success = ir_driver.trigger_replay(proto, code_int, bits)
        return JSONResponse(content={"status": "SUCCESS" if success else "ERROR", "mod": "IR", "cmd": "REPLAY", "data": {"protocol": proto, "code": code_str, "bits": bits}})
    return JSONResponse(status_code=400, content={"error": "Unknown tactical command"})


# ─── ENDPOINTS DE LA API (RFID / NFC) ───

# ─── ENDPOINTS DE LA API (RFID / NFC CORREGIDO) ───

@app.get("/api/rfid/history")
async def get_rfid_history(db: Session = Depends(get_db)):
    """Devuelve las 17 capturas del tag Mifare normalizando el objeto timestamp."""
    cards = db.query(models.RFIDCapture).order_by(models.RFIDCapture.id.desc()).all()
    res_data = []
    for c in cards:
        # Parche táctico anti-crasheo de strings de SQLite
        date_str = c.timestamp.strftime("%d/%m %H:%M:%S") if hasattr(c.timestamp, "strftime") else str(c.timestamp)[5:19]
        res_data.append({
            "id": c.id,
            "uid": c.uid,
            "card_type": c.card_type,
            "date": date_str
        })
    return res_data
@app.post("/api/rfid/action")
async def trigger_rfid_action(payload: dict, db: Session = Depends(get_db)):
    cmd = payload.get("cmd")
    if cmd == "READ":
        success = rfid_driver.trigger_read()
        return {"status": "AWAITING_HARDWARE", "detail": "Buscando UID...", "transport_success": success}
    elif cmd == "DUMP":
        success = rfid_driver.trigger_dump()
        return {"status": "AWAITING_HARDWARE", "detail": "Crackeando bloques...", "transport_success": success}
    elif cmd == "CLONE":
        uid_target = payload.get("uid")
        if not uid_target:
            last_card = db.query(models.RFIDCapture).order_by(models.RFIDCapture.id.desc()).first()
            if not last_card: return JSONResponse(status_code=400, content={"status": "ERROR", "detail": "DB vacía"})
            uid_target = last_card.uid
        success = rfid_driver.trigger_clone(uid_target)
        return {"status": "AWAITING_HARDWARE", "detail": f"Clonando UID: {uid_target}", "transport_success": success}
    return JSONResponse(status_code=400, content={"error": "Unknown tactical RFID command"})


# ─── ENDPOINTS NRF24L01+ COMPLETOS ───

@app.post("/api/nrf24/action")
async def trigger_nrf_action(payload: dict):
    cmd = payload.get("cmd")
    if cmd == "SCAN_SPECTRUM":
        return {"status": "OK", "detail": "Barrido solicitado", "transport_success": nrf24_driver.trigger_spectrum_scan()}
    elif cmd == "SCAN_HID":
        return {"status": "OK", "detail": "Sniffer HID solicitado", "transport_success": nrf24_driver.trigger_hid_scan()}
    elif cmd == "START_JAMMER":
        mode = payload.get("mode", "SINGLE")  
        channel = int(payload.get("channel", 1))
        return {"status": "OK", "detail": f"Jammer Ch {channel}", "transport_success": nrf24_driver.trigger_start_jamming(mode, channel)}
    elif cmd == "STOP_JAMMER":
        return {"status": "SUCCESS", "detail": "Paro transmitido", "transport_success": nrf24_driver.trigger_stop_jamming()}
    return JSONResponse(status_code=400, content={"error": "Unknown tactical NRF24 command"})


# ─── ENDPOINTS CC1101 SUB-GHZ COMPLETOS ───

@app.post("/api/subghz/action")
async def trigger_subghz_action(payload: dict):
    cmd = payload.get("cmd")
    if cmd == "SCAN":
        subghz_driver.trigger_scan()
        return {"status": "OK", "detail": "Barrido RSSI solicitado"}
    elif cmd == "CAPTURE":
        subghz_driver.trigger_capture(payload.get("freq_mhz", 433.92))
        return {"status": "OK", "detail": "Capturador montado"}
    elif cmd == "REPLAY":
        subghz_driver.trigger_replay(payload.get("freq_mhz", 433.92), payload.get("pulse_string", ""))
        return {"status": "OK", "detail": "Clone transmitido"}
    elif cmd == "JAM":
        subghz_driver.trigger_jam(payload.get("freq_mhz", 433.92), payload.get("duration_ms", 1000))
        return {"status": "OK", "detail": "Ruido inyectado"}
    return JSONResponse(status_code=400, content={"error": "Unknown command"})

@app.get("/api/subghz/history")
async def get_subghz_history(db: Session = Depends(get_db)):
    captures = db.query(models.SubGHzCapture).order_by(models.SubGHzCapture.id.desc()).all()
    return [{"id": c.id, "alias": c.alias, "freq_mhz": c.freq_mhz, "pulse_string": c.pulse_string, "date": c.timestamp.strftime("%Y-%m-%d %H:%M:%S") if c.timestamp else ""} for c in captures]


# ─── ENDPOINTS WI-FI COMPLETOS (MATRIZ INTEGRAL DE ATAQUE Y DEFENSA MÓVIL) ───

@app.post("/api/wifi/action")
async def trigger_wifi_action(payload: dict, db: Session = Depends(get_db)):
    cmd = payload.get("cmd")
    print(f"[C2 COMMAND] WI-FI -> Directiva táctica recibida: {cmd}")
    
    # 01-05. Inicialización General del Monitor
    if cmd == "INITIALIZE":
        if wifi_sniffer.is_sniffing:
            wifi_sniffer.stop()
        wifi_monitor.stop_hopping()
        
        success = wifi_monitor.enable_monitor_mode()
        if success:
            print("[C2 CORE] Indexando adaptador nl80211...")
            await asyncio.sleep(1.5)
            wifi_monitor.start_hopping(delay=0.3)
            wifi_sniffer.start()
        return {"status": "SUCCESS" if success else "ERROR", "detail": "Modo monitor activo"}
    
    elif cmd == "STOP_MONITOR":
        if wifi_sniffer.is_sniffing:
            wifi_sniffer.stop()  
        wifi_monitor.stop_hopping()
        try:
            print(f"[C2 CORE] Desmantelando monitor en {wifi_monitor.interface}...")
            subprocess.run(["ip", "link", "set", wifi_monitor.interface, "down"], capture_output=True)
            subprocess.run(["iw", "dev", wifi_monitor.interface, "set", "type", "managed"], capture_output=True)
            subprocess.run(["ip", "link", "set", wifi_monitor.interface, "up"], capture_output=True)
        except Exception: pass
        return {"status": "SUCCESS", "detail": "Antena restaurada a modo cliente síncronamente"}

    # 🔗 Enlace Táctico Móvil para la Feria
    elif cmd == "LINK_NET":
        ssid = payload.get("ssid")
        password = payload.get("password")
        if not ssid or not password:
            return JSONResponse(status_code=400, content={"error": "Credenciales SSID/PASS ausentes"})
        
        enlace_ok = wifi_lan.asociar_antena_externa(ssid, password)
        return {"status": "SUCCESS" if enlace_ok else "FAILED"}
        
    # 06. Escáner de Red con Detección Avanzada de SO (Nmap)
    elif cmd == "LAN_SCAN":
        # Si el frontend envía el objeto vacío {}, autodetectamos el segmento activo de la antena externa
        ip_range = payload.get("range")
        if not ip_range or ip_range == "192.168.1.0/24":
            ip_range = wifi_lan.obtener_segmento_autodetectado(INTERFACE_ATTACK)
            
        print(f"[C2 CORE] Desplegando análisis de enrutamiento y OS Fingerprinting en: {ip_range}")
        
        # Sincronizamos los hilos para que alimenten tanto el almacén ORM como el broadcast
        wifi_lan.trigger_arp_scan(ip_range)
        return {"status": "SUCCESS", "detail": f"Barrido Nmap inicializado en segmento {ip_range}"}

    # 07 y 08. Inyecciones MITM de Capa 3 (Pivots estructurales para tus scripts)
    elif cmd == "ARP_SPOOF_TARGET":
        target_ip = payload.get("ip")
        print(f"[C2 MITM] Envenenando descriptores ARP para el host local: {target_ip}")
        # Aquí amarras la llamada a tu script/hilo inyector de Scapy
        return {"status": "SUCCESS", "detail": f"Ataque MITM ARP armado en la IP {target_ip}"}

    elif cmd == "DNS_SPOOF_TARGET":
        target_ip = payload.get("ip")
        print(f"[C2 MITM] Redireccionando consultas DNS entrantes del host: {target_ip}")
        # Aquí amarras tu regla de iptables/nfqueue para interceptar navegación web
        return {"status": "SUCCESS", "detail": f"Proxy DNS activo para {target_ip}"}
        
    # 09 y 10. Desautenticación Quirúrgica y Captura de PCAPs de Handshakes
    elif cmd == "DEAUTH_TARGET":
        bssid = payload.get("bssid")
        client = payload.get("client", "FF:FF:FF:FF:FF:FF")
        current_id = payload.get("currentId", "deauth_burst")
        
        if not bssid:
            return JSONResponse(status_code=400, content={"error": "Falta BSSID objetivo"})
            
        wifi_monitor.stop_hopping() 
        iface_tactica = INTERFACE_ATTACK
        
        if current_id == "eapol_trap":
            # Opción 10: Levanta sniffer de descriptores y luego inyecta deauth quirúrgico
            print(f"[C2 CORE] Armando trampa sniffer EAPOL en {bssid}...")
            wifi_lan.start_handshake_sniffer(iface_tactica, bssid)
            wifi_lan.trigger_deauth(iface_tactica, bssid, client, count=15)
        else:
            # Opción 09: Inyección masiva continua de ráfagas para denegación (Deauth puro)
            print(f"[C2 CORE] Inyectando ráfaga masiva continua en {bssid}...")
            wifi_lan.trigger_deauth(iface_tactica, bssid, client, count=60)
            
        return {"status": "SUCCESS", "detail": "Operación de inyección inalámbrica despachada"}

    # ─── VECTOR DE DEFENSA TÁCTICA AUTOMATIZADA (11 al 15) ───
    elif cmd == "START_DEFENSE_IDS":
        mod_id = payload.get("modId") # anti_deauth, twin_detect, arp_watchdog
        print(f"[C2 GUARD] Inicializando filtro de telemetría IDS contra firma: {mod_id}")
        # Aquí amarras tus escuchas promiscuos que notifican alertas por el WS a React
        return {"status": "SUCCESS", "detail": f"Watchdog IDS configurado para {mod_id}"}

    elif cmd == "RANDOMIZE_MAC_TACTICAL":
        print(f"[C2 GUARD] Solicitando mutación OUI en caliente para la interfaz: {INTERFACE_ATTACK}")
        nueva_mac = wifi_monitor.randomize_mac(INTERFACE_ATTACK)
        return {"status": "SUCCESS", "detail": f"MAC mutada con éxito -> {nueva_mac}"}
        
    return JSONResponse(status_code=400, content={"error": "Comando inalámbrico desconocido"})


# ─── ENDPOINT DE HANDSHAKES CORREGIDO (LÍNEA 328-332) ───

@app.get("/api/wifi/handshakes")
async def get_wifi_handshakes(db: Session = Depends(get_db)):
    """Devuelve el volcado de llaves capturadas corrigiendo el NameError del modelo."""
    # 🚀 CORREGIDO: Cambiado 'WiFiCapture' por 'models.WiFiCapture'
    captures = db.query(models.WiFiCapture).order_by(models.WiFiCapture.id.desc()).all()
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
    """Devuelve el inventario histórico mapeando las llaves nativas para el Spectrum."""
    aps = db.query(models.WiFiAccessPoint).order_by(models.WiFiAccessPoint.last_seen.desc()).all()
    return [
        {
            "id": c.id,
            "ssid": c.ssid,
            "bssid": c.bssid,
            "channel": c.channel,
            "rssi": c.rssi,
            "wps": c.wps_active,         # 🟢 Mapeo nativo para 'ap.wps' en React
            "wps_active": c.wps_active,
            "is_rogue": c.is_rogue,
            "date": c.last_seen.strftime("%d/%m %H:%M:%S") if c.last_seen else ""
        }
        for c in aps
    ]

@app.get("/api/wifi/clients")
async def get_wifi_clients(db: Session = Depends(get_db)):
    """Devuelve el inventario de estaciones sincronizando variables L2/L3."""
    clients = db.query(models.WiFiClient).order_by(models.WiFiClient.last_seen.desc()).all()
    return [
        {
            "id": c.id,
            "mac": c.mac,
            "associated_bssid": c.associated_bssid,
            "searching_for": c.searching_for,
            "searching": c.searching_for, # Compatibilidad analítica
            "rssi": c.rssi,
            "client_type": c.client_type,
            "tipo": c.client_type,         # Compatibilidad para Nmap Fingerprinting
            "ip_address": c.ip_address,
            "ip": c.ip_address,            # Compatibilidad para rejilla MITM
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