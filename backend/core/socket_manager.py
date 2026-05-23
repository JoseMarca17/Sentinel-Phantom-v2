# backend/core/socket_manager.py
from fastapi import WebSocket
import json
import asyncio

class SocketManager:
    _instance = None

    def __new__(cls):
        """Implementamos un Singleton para que todos los drivers usen la misma instancia de sockets"""
        if cls._instance is None:
            cls._instance = super(SocketManager, cls).__new__(cls)
            cls._instance.active_connections = set()
            cls._instance.queue = asyncio.Queue()
        return cls._instance

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        print(f"[WS] Nueva terminal conectada. Sockets activos: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        print(f"[WS] Terminal desconectada. Sockets restantes: {len(self.active_connections)}")

    def broadcast_sync(self, module: str, data: dict):
        """Método seguro para hilos tradicionales (como el Serial). Mete datos a la cola asíncrona."""
        payload = {"event": "HARDWARE_UPDATE", "module": module, "data": data}
        try:
            loop = asyncio.get_event_loop()
            loop.call_soon_threadsafe(self.queue.put_nowait, payload)
        except RuntimeError:
            pass

    async def start_dispatcher(self):
        """Bucle asíncrono permanente de FastAPI que vacía la cola y hace el await correcto"""
        print("[WS] Despachador asíncrono de WebSockets iniciado correctamente.")
        while True:
            payload = await self.queue.get()
            if self.active_connections:
                message = json.dumps(payload)
                # Copia de la lista para evitar mutaciones en caliente mientras iteramos
                tasks = [conn.send_text(message) for conn in list(self.active_connections)]
                await asyncio.gather(*tasks, return_exceptions=True)
            self.queue.task_done()

# Exportamos una instancia única global
socket_manager = SocketManager()
