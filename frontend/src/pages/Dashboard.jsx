// frontend/src/pages/Dashboard.jsx
import React from 'react';
import { Cpu, Database, Radio, ShieldAlert } from 'lucide-react';

export default function Dashboard() {
  // Datos simulados del estado actual de tu Raspberry Pi y base de datos
  const metrics = [
    { name: 'Coprocesador UART', value: 'CONECTADO', status: 'OK', desc: '/dev/ttyUSB0 @ 115200bps', icon: Cpu },
    { name: 'Base de Datos SQLite', value: 'ACTIVA', status: 'OK', desc: 'sentinel.db persistiendo', icon: Database },
    { name: 'Antena Ralink Mon', value: 'READY', status: 'OK', desc: 'Chipset RT5370 detected', icon: Radio },
  ];

  return (
    <div className="space-y-8 font-mono">
      {/* Título de la Terminal */}
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-xl font-black tracking-widest text-slate-100 uppercase">
          OPERATIONS CENTER <span className="text-yellow-400">// DASHBOARD</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">Consola táctica de auditoría, control de hardware y telemetría de red.</p>
      </div>

      {/* Grid de Métricas de Sistema */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {metrics.map((m, idx) => {
          const Icon = m.icon;
          return (
            <div key={idx} className="bg-slate-950/50 border border-slate-800 p-5 rounded-xl flex flex-col justify-between hover:border-slate-700 transition-colors">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xs font-black tracking-wider text-slate-400 uppercase">{m.name}</h3>
                  <p className="text-lg font-black text-yellow-400 mt-1">{m.value}</p>
                </div>
                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                  <Icon className="w-5 h-5 text-yellow-400" />
                </div>
              </div>
              <p className="text-[10px] text-slate-500 font-bold mt-4 tracking-wide border-t border-slate-900 pt-2">
                {m.desc}
              </p>
            </div>
          );
        })}
      </div>

      {/* Monitor de Eventos Recientes de Seguridad */}
      <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4 border-b border-slate-900 pb-3">
          <ShieldAlert className="w-4 h-4 text-yellow-400" />
          <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase">KERNEL REAL-TIME LOGS</h2>
        </div>
        <div className="bg-slate-950 border border-slate-900 p-4 rounded-lg h-40 overflow-y-auto text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
          <div>[<span className="text-yellow-400">INFO</span>] SYSTEM BOOT COMPLETED ON RASPBERRY PI 3B</div>
          <div>[<span className="text-yellow-400">INFO</span>] FASTAPI WEBSOCKET MANAGER OPERATIONAL AT PORT 8000</div>
          <div>[<span className="text-yellow-400">SUCCESS</span>] BASE DE DATOS SQLITE DETECTADA E INICIALIZADA DE FORMA CORRECTA</div>
          <div>[<span className="text-yellow-400">SERIAL</span>] INTENTANDO ENLACE AUTOMÁTICO EN /dev/ttyUSB0...</div>
          <div>[<span className="text-yellow-400">SERIAL</span>] ENLACE ESTABLECIDO CON EL FIRMWARE DEL ESP32 CON ÉXITO</div>
        </div>
      </div>
    </div>
  );
}
