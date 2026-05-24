from fastapi import WebSocket
import json
import asyncio

class SocketManager:
    def __init__(self):
        if not hasattr(self, 'initialized'):
            self.active_connections = set()
            self.queue = asyncio.Queue()
            self.main_loop = None  # <-- Guardaremos la referencia real del loop de FastAPI
            self.initialized = True

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        print(f"[WS-CORE] Terminal acoplada. Conexiones vivas: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        print(f"[WS-CORE] Terminal removida. Conexiones vivas: {len(self.active_connections)}")

    def broadcast_sync(self, module: str, data: dict):
        """
        Entrega el payload de hardware a la cola de forma segura desde CUALQUIER hilo secundario.
        """
        payload = {"event": "HARDWARE_UPDATE", "module": module, "data": data}
        
        # 🛡️ SOLUCIÓN AL FALLO CRÍTICO: Usamos la referencia guardada del hilo principal
        if self.main_loop and self.main_loop.is_running():
            self.main_loop.call_soon_threadsafe(self.queue.put_nowait, payload)
            print(f"[WS-CORE] Trampa serial de {module} inyectada con éxito en el bus de red.")
        else:
            print("[-] Error: El loop asíncrono principal de FastAPI aún no está referenciado o corriendo.")

    async def start_dispatcher(self):
        # Capturamos de forma explícita el loop asíncrono en el momento que arranca FastAPI
        self.main_loop = asyncio.get_running_loop()
        print("[WS-CORE] Despachador asíncrono centralizado en línea.")
        
        while True:
            payload = await self.queue.get()
            if self.active_connections:
                message = json.dumps(payload)
                # Evitamos mutaciones en caliente copiando el set a una lista
                tasks = [conn.send_text(message) for conn in list(self.active_connections)]
                await asyncio.gather(*tasks, return_exceptions=True)
                print(f"[WS-CORE] Ráfaga broadcast enviada a {len(self.active_connections)} terminales.")
            self.queue.task_done()

# Forzamos una instancia única absoluta en memoria (Singleton seguro)
if not hasattr(asyncio, "_global_socket_manager"):
    asyncio._global_socket_manager = SocketManager()

socket_manager = asyncio._global_socket_manager