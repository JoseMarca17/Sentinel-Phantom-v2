from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import asyncio
import subprocess
from contextlib import asynccontextmanager
import time
from backend.database import engine, get_db
import backend.models as models

try:
    models.Base.metadata.create_all(bind=engine)
    print("[DB CORE] Mapeo de persistencia SQLite unificado con éxito. Estructura preservada.")
except Exception as db_err:
    print(f"[DB CORE CRITICAL] Error al enlazar modelos con el motor ORM: {db_err}")

from backend.core.socket_manager import socket_manager
from backend.core.serial_bridge import serial_bridge
from backend.drivers.esp32.ir_driver import ir_driver
from backend.drivers.esp32.rfid_driver import rfid_driver
from backend.drivers.esp32.nrf24_driver import nrf24_driver
from backend.drivers.esp32.subghz_driver import subghz_driver
from backend.drivers.esp32.ble_driver import ble_driver as ble_controller

from backend.drivers.wifi import wifi_monitor, wifi_sniffer, wifi_lan, wifi_driver
from backend.config import INTERFACE_ATTACK, INTERFACE_MONITOR  

from backend.auth import router as auth_router, seed_admin
from backend.database import SessionLocal  


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[C2 BOOT] Asegurando estado inicial limpio del hardware inalámbrico...")
    try:
        subprocess.run(["ip", "link", "set", INTERFACE_ATTACK, "down"], capture_output=True)
        subprocess.run(["iw", "dev", INTERFACE_ATTACK, "set", "type", "managed"], capture_output=True)
        subprocess.run(["ip", "link", "set", INTERFACE_ATTACK, "up"], capture_output=True)
        print(f"[C2 BOOT] {INTERFACE_ATTACK} higienizada. {INTERFACE_MONITOR} intacta.")
    except Exception as e:
        print(f"[C2 BOOT WARNING] {e}")

    try:
        print("[AUTH] Sincronizando base de datos de operadores...")
        db_session = SessionLocal()
        seed_admin(db_session)
        db_session.close()
    except Exception as seed_err:
        print(f"[AUTH CRITICAL WARNING] No se pudo inicializar la persistencia de usuarios: {seed_err}")

    serial_bridge.socket_manager = socket_manager
    
    def interceptor_read_loop():
        import json
        import time
        import asyncio

        while serial_bridge.is_running:
            if serial_bridge.serial_conn and serial_bridge.serial_conn.in_waiting > 0:
                try:
                    line = serial_bridge.serial_conn.readline().decode('utf-8', errors='ignore').strip()
                    if line and line.startswith('{'):
                        payload = json.loads(line)
                        mod = payload.get("mod") or payload.get("module")

                        if mod:
                            if payload.get("status") == "OK" and "data" in payload:
                                data = payload.get("data")
                            elif "data" in payload:
                                data = payload.get("data")
                            else:
                                data = payload

                            if mod in serial_bridge.drivers:
                                serial_bridge.drivers[mod].handle_incoming_data(data)

                            if hasattr(serial_bridge, 'socket_manager'):
                                try:
                                    target_channel = mod.upper()
                                    if mod.lower() == "wifi_spectrum":
                                        target_channel = "WIFI_SPECTRUM"
                                    
                                    # Normalización para Bluetooth
                                    if target_channel == "BLE_STREAM" or target_channel == "BLE":
                                        target_channel = "BLE"

                                    # 🛠️ PARCHE DE CONCURRENCIA UNIFICADO
                                    # Empaquetamos según el módulo de origen para no romper Wi-Fi, IR ni RFID
                                    if target_channel == "BLE":
                                        ws_payload = {
                                            "module": "BLE",
                                            "data": data
                                        }
                                    else:
                                        # Mantiene el formato original que tus otras pantallas ya consumen perfectamente
                                        ws_payload = data

                                    loop = asyncio.get_event_loop()
                                    loop.call_soon_threadsafe(
                                        serial_bridge.socket_manager.broadcast_sync,
                                        target_channel,
                                        ws_payload
                                    )
                                except RuntimeError:
                                    pass
                except Exception as e:
                    print(f"[SERIAL INTERCEPTOR ERR] {e}")
            time.sleep(0.001)

    serial_bridge._read_loop = interceptor_read_loop

    if not serial_bridge.is_running:
        serial_bridge.start()
        print("[C2 BOOT] UART + interceptor inicializado.")

    asyncio.create_task(socket_manager.start_dispatcher())
    print("[C2 BOOT] Pipeline UART -> WebSockets online.")

    yield 
    
    print("\n[C2 SHUTDOWN] Apagado controlado detectado...")
    try:
        serial_bridge.is_running = False
        if wifi_sniffer.is_sniffing:
            wifi_sniffer.stop()
        wifi_monitor.stop_hopping()
        subprocess.run(["ip", "link", "set", INTERFACE_ATTACK, "down"], capture_output=True)
        subprocess.run(["iw", "dev", INTERFACE_ATTACK, "set", "type", "managed"], capture_output=True)
        subprocess.run(["ip", "link", "set", INTERFACE_ATTACK, "up"], capture_output=True)
        print(f"[C2 SHUTDOWN] {INTERFACE_ATTACK} restaurada. {INTERFACE_MONITOR} no fue tocada.")
    except Exception as e:
        print(f"[C2 SHUTDOWN ERR] {e}")


app = FastAPI(title="Sentinel Phantom C2 Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)

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
    captures = db.query(models.IRCapture).order_by(models.IRCapture.id.desc()).all()
    res_data = []
    for c in captures:
        date_str = c.timestamp.strftime("%d/%m %H:%M") if hasattr(c.timestamp, "strftime") else str(c.timestamp)[:16]
        res_data.append({"id": c.id, "protocol": c.protocol, "code": c.code, "bits": c.bits, "date": date_str})
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

@app.get("/api/rfid/history")
async def get_rfid_history(db: Session = Depends(get_db)):
    cards = db.query(models.RFIDCapture).order_by(models.RFIDCapture.id.desc()).all()
    res_data = []
    for c in cards:
        date_str = c.timestamp.strftime("%d/%m %H:%M:%S") if hasattr(c.timestamp, "strftime") else str(c.timestamp)[5:19]
        res_data.append({"id": c.id, "uid": c.uid, "card_type": c.card_type, "date": date_str})
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


# ─── ENDPOINTS WIFI — aquí están los cambios ───

@app.post("/api/wifi/action")
async def trigger_wifi_action(payload: dict, db: Session = Depends(get_db)):
    cmd = payload.get("cmd")
    print(f"[C2 COMMAND] WI-FI -> Directiva táctica recibida: {cmd}")

    if cmd == "INITIALIZE":
        if wifi_sniffer.is_sniffing:
            wifi_sniffer.stop()
        wifi_monitor.stop_hopping()
        success = wifi_monitor.enable_monitor_mode()
        if success:
            print("[C2 CORE] Indexando adaptador nl80211...")
            await asyncio.sleep(1.5)
            wifi_monitor.start_hopping(delay=0.5)
            wifi_sniffer.start()
        return {"status": "SUCCESS" if success else "ERROR", "detail": "Modo monitor activo"}

    elif cmd == "REFRESH_SPECTRUM":
        # Reinicia el sniffer para forzar re-escaneo
        if wifi_sniffer.is_sniffing:
            wifi_sniffer.stop()
            time.sleep(0.5)
        wifi_sniffer.start()
        return {"status": "SUCCESS", "detail": "Sniffer reiniciado para refresco de espectro"}

    elif cmd == "STOP_MONITOR":
        if wifi_sniffer.is_sniffing:
            wifi_sniffer.stop()
        wifi_monitor.stop_hopping()
        if not wifi_lan.is_deauthing:
            try:
                subprocess.run(["ip", "link", "set", INTERFACE_ATTACK, "down"], capture_output=True)
                subprocess.run(["iw", "dev", INTERFACE_ATTACK, "set", "type", "managed"], capture_output=True)
                subprocess.run(["ip", "link", "set", INTERFACE_ATTACK, "up"], capture_output=True)
            except Exception:
                pass
        return {"status": "SUCCESS", "detail": f"{INTERFACE_ATTACK} restaurada. {INTERFACE_MONITOR} no fue tocada."}

    elif cmd == "LINK_NET":
        ssid = payload.get("ssid")
        password = payload.get("password")
        if not ssid or not password:
            return JSONResponse(status_code=400, content={"error": "Credenciales SSID/PASS ausentes"})
        enlace_ok = wifi_lan.asociar_antena_externa(ssid, password)
        return {"status": "SUCCESS" if enlace_ok else "FAILED"}

    elif cmd == "LAN_SCAN":
        ip_range = payload.get("range")
        if not ip_range or ip_range == "192.168.1.0/24":
            ip_range = wifi_lan.obtener_segmento_autodetectado(INTERFACE_ATTACK)
        print(f"[C2 CORE] Desplegando Nmap en: {ip_range}")
        wifi_lan.trigger_arp_scan(ip_range)
        return {"status": "SUCCESS", "detail": f"Barrido Nmap inicializado en segmento {ip_range}"}

    elif cmd == "ARP_SPOOF_TARGET":
        target_ip = payload.get("ip")
        print(f"[C2 MITM] Envenenando ARP para: {target_ip}")
        return {"status": "SUCCESS", "detail": f"MITM ARP armado en {target_ip}"}

    elif cmd == "DNS_SPOOF_TARGET":
        target_ip = payload.get("ip")
        print(f"[C2 MITM] Redireccionando DNS para: {target_ip}")
        return {"status": "SUCCESS", "detail": f"Proxy DNS activo para {target_ip}"}

    elif cmd == "DEAUTH_TARGET":
        bssid      = payload.get("bssid")
        client     = payload.get("client", "FF:FF:FF:FF:FF:FF")
        current_id = payload.get("currentId", "deauth_burst")
        channel    = int(payload.get("channel", 6))

        if not bssid:
            return JSONResponse(status_code=400, content={"error": "Falta BSSID"})

        wifi_monitor.stop_hopping()

        if current_id == "eapol_trap":
            # Sniffer EAPOL con MT7601U + deauth con ESP32
            print(f"[C2 CORE] Trampa EAPOL en {bssid} CH{channel}...")
            wifi_lan.start_handshake_sniffer(INTERFACE_ATTACK, bssid)
            # 300 paquetes = ~10 segundos de deauth continuo, suficiente para forzar reconexión
            wifi_lan.trigger_deauth_esp32_continuo(bssid, client, channel, duration=300)
        else:
            # Deauth puro continuo — mandamos en lotes mientras el flag esté activo
            print(f"[C2 CORE] Deauth ESP32 en {bssid} CH{channel}...")
            wifi_lan.trigger_deauth_esp32_continuo(bssid, client, channel, duration=500)

        return {"status": "SUCCESS", "detail": f"Deauth ESP32 → CH{channel} {bssid}"}

    elif cmd == "STOP_DEAUTH":
        wifi_lan.stop_deauth()
        return {"status": "SUCCESS", "detail": "Deauth detenido"}

    elif cmd == "START_DEFENSE_IDS":
        mod_id = payload.get("modId")
        print(f"[C2 GUARD] Watchdog IDS: {mod_id}")
        return {"status": "SUCCESS", "detail": f"Watchdog IDS configurado para {mod_id}"}

    elif cmd == "RANDOMIZE_MAC_TACTICAL":
        print(f"[C2 GUARD] Mutando MAC en: {INTERFACE_ATTACK}")
        nueva_mac = wifi_monitor.randomize_mac(INTERFACE_ATTACK)
        return {"status": "SUCCESS", "detail": f"MAC mutada -> {nueva_mac}"}

    return JSONResponse(status_code=400, content={"error": "Comando inalámbrico desconocido"})


@app.get("/api/wifi/handshakes")
async def get_wifi_handshakes(db: Session = Depends(get_db)):
    captures = db.query(models.WiFiCapture).order_by(models.WiFiCapture.id.desc()).all()
    return [{"id": c.id, "ssid": c.ssid, "bssid": c.bssid, "channel": c.channel, "encryption": c.encryption, "path": c.payload_path, "date": c.timestamp.strftime("%Y-%m-%d %H:%M:%S") if c.timestamp else ""} for c in captures]

@app.get("/api/wifi/access-points")
async def get_wifi_access_points(db: Session = Depends(get_db)):
    aps = db.query(models.WiFiAccessPoint).order_by(models.WiFiAccessPoint.last_seen.desc()).all()
    return [{"id": c.id, "ssid": c.ssid, "bssid": c.bssid, "channel": c.channel, "rssi": c.rssi, "wps": c.wps_active, "wps_active": c.wps_active, "is_rogue": c.is_rogue, "date": c.last_seen.strftime("%d/%m %H:%M:%S") if c.last_seen else ""} for c in aps]

@app.get("/api/wifi/clients")
async def get_wifi_clients(db: Session = Depends(get_db)):
    clients = db.query(models.WiFiClient).order_by(models.WiFiClient.last_seen.desc()).all()
    return [{"id": c.id, "mac": c.mac, "associated_bssid": c.associated_bssid, "searching_for": c.searching_for, "searching": c.searching_for, "rssi": c.rssi, "client_type": c.client_type, "tipo": c.client_type, "ip_address": c.ip_address, "ip": c.ip_address, "date": c.last_seen.strftime("%d/%m %H:%M:%S") if c.last_seen else ""} for c in clients]

# =====================================================================
# ─── ENDPOINTS BLE ───

@app.post("/api/ble/action")
async def trigger_ble_action(payload: dict, db: Session = Depends(get_db)):
    cmd = payload.get("cmd")
    print(f"[C2 COMMAND] BLE -> {cmd}")

    if cmd == "SNIFFER_START":
        target      = payload.get("target_mac", "")
        anti        = payload.get("anti_tracking", False)
        ble_controller.start_sniffer(target, anti)
        mode = "ANTI-TRACKING" if anti else "PROMISCUOUS"
        return {"status": "OK", "detail": f"Sniffer {mode} activo"}

    elif cmd == "SNIFFER_STOP":
        ble_controller.stop_sniffer()
        return {"status": "OK", "detail": "Sniffer detenido"}

    elif cmd == "FLOOD_START":
        eco      = payload.get("ecosystem", "APPLE")
        interval = int(payload.get("interval_ms", 30))
        ble_controller.start_flooding(eco, interval)
        return {"status": "OK", "detail": f"Flooding {eco} activo"}

    elif cmd == "FLOOD_STOP":
        ble_controller.stop_advertising()
        return {"status": "OK", "detail": "Transmisor BLE detenido"}

    elif cmd == "CLONE_BEACON":
        hex_data = payload.get("hex_data", "")
        if not hex_data:
            return JSONResponse(status_code=400, content={"error": "hex_data requerido"})
        ble_controller.clone_beacon(hex_data)
        return {"status": "OK", "detail": "Beacon clonado transmitiendo"}

    elif cmd == "GATT_EXPLORE":
        mac = payload.get("mac", "")
        if not mac:
            return JSONResponse(status_code=400, content={"error": "mac requerido"})
        ble_controller.gatt_explore(mac)
        return {"status": "OK", "detail": f"GATT explorer → {mac}"}

    elif cmd == "RSSI_TRACK":
        mac = payload.get("mac", "")
        if not mac:
            return JSONResponse(status_code=400, content={"error": "mac requerido"})
        ble_controller.rssi_track(mac)
        return {"status": "OK", "detail": f"RSSI tracker → {mac}"}

    return JSONResponse(status_code=400, content={"error": "Comando BLE desconocido"})


@app.get("/api/ble/devices")
async def get_ble_devices(db: Session = Depends(get_db)):
    devices = db.query(models.BLECapture).order_by(
        models.BLECapture.rssi.desc()
    ).limit(50).all()
    return [{
        "id":         d.id,
        "mac":        d.mac,
        "name":       d.name,
        "rssi":       d.rssi,
        "vendor":     d.vendor,
        "type":       d.device_type,
        "is_tracker": d.is_tracker,
        "last_seen":  d.last_seen.strftime("%d/%m %H:%M:%S") if d.last_seen else ""
    } for d in devices]


@app.get("/api/ble/trackers")
async def get_ble_trackers(db: Session = Depends(get_db)):
    trackers = db.query(models.BLECapture).filter(
        models.BLECapture.is_tracker == True
    ).order_by(models.BLECapture.rssi.desc()).all()
    return [{
        "id":        t.id,
        "mac":       t.mac,
        "name":      t.name,
        "vendor":    t.vendor,
        "rssi":      t.rssi,
        "last_seen": t.last_seen.strftime("%d/%m %H:%M:%S") if t.last_seen else ""
    } for t in trackers]


@app.websocket("/ws/control")
async def websocket_endpoint(websocket: WebSocket):
    await socket_manager.connect(websocket)
    try:
        while True:
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        socket_manager.disconnect(websocket)