# backend/app.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio

from backend.core.socket_manager import socket_manager
from backend.core.serial_bridge import serial_bridge
from backend.drivers.esp32.ir_driver import ir_driver
import backend.models as models
from backend.database import engine

# Auto-crear tablas al arrancar el C2
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sentinel Phantom C2 Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicializar hilos de hardware
serial_bridge.start()

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(socket_manager.start_dispatcher())

# 🛠️ CORRECCIÓN DE RAÍZ: Evita el 404 y da estado del C2
@app.get("/")
async def root_status():
    return JSONResponse(content={
        "status": "ONLINE",
        "system": "Sentinel Phantom v2",
        "author": "Jose Andres Marca Cruz",
        "api_version": "2.0.0"
    })

@app.websocket("/ws/control")
async def websocket_endpoint(websocket: WebSocket):
    await socket_manager.connect(websocket)
    try:
        while True:
            message = await websocket.receive_text()
            print(f"[WS RECIBIDO] -> {message}")
    except WebSocketDisconnect:
        socket_manager.disconnect(websocket)
