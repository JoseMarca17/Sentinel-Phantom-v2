// frontend/src/pages/ModuloIR.jsx
import React, { useState, useEffect, useRef } from 'react';
import SentinelScreen from '../components/SentinelScreen';

export default function ModuloIR() {
  const [status, setStatus] = useState('OFFLINE');
  const [logs, setLogs] = useState([]);
  const ws = useRef(null);

  useEffect(() => {
    // Conexión nativa al WebSocket central del C2
    const wsUrl = `ws://${window.location.host}/ws/control`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      setStatus('ONLINE');
      setLogs(prev => ['[+] Enlace de Infrarrojos Inicializado', ...prev]);
    };

    ws.current.onmessage = (event) => {
      const packet = JSON.parse(event.data);
      if (packet.event === "HARDWARE_UPDATE" && packet.module === "IR") {
        const { data } = packet;
        setLogs(prev => [`[RX] Protocolo: ${data.protocol || 'RAW'} | CODE: ${data.code}`, ...prev]);
      }
    };

    ws.current.onclose = () => {
      setStatus('OFFLINE');
      setLogs(prev => ['[-] Conexión con el núcleo perdida', ...prev]);
    };

    return () => {
      if (ws.current) ws.current.close();
    };
  }, []);

  const handleAction = (direction) => {
    if (status !== 'ONLINE') return;

    if (direction === 'OK') {
      setLogs(prev => ['[*] Disparando ráfaga universal TV-B-GONE...', ...prev]);
      ws.current.send(JSON.stringify({
        module: "IR",
        command: "TV_B_GONE",
        params: {}
      }));
    } else if (direction === 'UP') {
      setLogs(prev => ['[*] Coprocesador en modo ESCUCHA/CAPTURA IR...', ...prev]);
      ws.current.send(JSON.stringify({
        module: "IR",
        command: "CAPTURE",
        params: {}
      }));
    } else {
      setLogs(prev => [`[!] Dirección [${direction}] sin ráfaga asignada`, ...prev]);
    }
  };

  return (
    <div className="space-y-8 font-mono">
      <div>
        <h1 className="text-xl font-black tracking-widest text-slate-100 uppercase">
          MÓDULO INFRARROJO <span className="text-yellow-400">// AUDIT</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">Auditoría óptica mediante inyección de señales de ráfaga y clonación RAW.</p>
      </div>

      <SentinelScreen 
        moduleName="TRANSCEIVER INFRARROJO"
        status={status}
        logs={logs}
        onCommand={handleAction}
      />
    </div>
  );
}
