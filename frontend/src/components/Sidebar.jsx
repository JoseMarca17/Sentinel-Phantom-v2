// frontend/src/components/Sidebar.jsx
import React from 'react';
import { Terminal, LayoutDashboard, Database, Shield, Radio, Wifi, Bluetooth, Cpu } from 'lucide-react';

export default function Sidebar({ currentPage, setCurrentPage }) {
  const mainNavigation = [
    { id: 'device', name: 'Sentinel Screen', icon: Terminal },
    { id: 'dashboard', name: 'Dashboard Ops', icon: LayoutDashboard },
  ];

  const databaseModules = [
    { id: 'db-ir', name: 'Registros IR', icon: Cpu },
    { id: 'db-rfid', name: 'Logs RFID / NFC', icon: Shield },
    { id: 'db-subghz', name: 'Capturas Sub-GHz', icon: Radio },
    { id: 'db-wifi', name: 'Redes Wi-Fi', icon: Wifi },
    { id: 'db-bluetooth', name: 'Dispositivos BLE', icon: Bluetooth },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800/80 flex flex-col justify-between h-screen sticky top-0 font-mono select-none">
      <div className="p-6">
        {/* Marca del Sistema */}
        <div className="flex items-center gap-3 mb-8 border-b border-slate-800 pb-4">
          <Terminal className="w-7 h-7 text-yellow-400 animate-pulse" />
          <div>
            <h2 className="text-sm font-black tracking-widest text-slate-200">SENTINEL</h2>
            <p className="text-[10px] text-slate-500 font-bold tracking-wider">PHANTOM v2</p>
          </div>
        </div>

        {/* Navegación del Dispositivo */}
        <div className="space-y-1.5 mb-6">
          <p className="text-[9px] font-black text-slate-500 tracking-widest uppercase px-4 mb-2">CONTROLADOR</p>
          {mainNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border border-transparent text-left cursor-pointer ${
                  currentPage === item.id
                    ? 'bg-yellow-400 text-slate-950 font-black shadow-lg shadow-yellow-400/10'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.name}
              </button>
            );
          })}
        </div>

        {/* Módulos de Datos */}
        <div className="space-y-1.5">
          <p className="text-[9px] font-black text-slate-500 tracking-widest uppercase px-4 mb-2">PERSISTENCIA DB</p>
          {databaseModules.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2 rounded-xl text-xs font-bold transition-all border border-transparent text-left cursor-pointer ${
                  currentPage === item.id
                    ? 'bg-slate-800 text-yellow-400 border-slate-700/50 font-black'
                    : 'text-slate-500 hover:bg-slate-800/40 hover:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 border-t border-slate-800 text-center">
        <span className="text-[10px] font-bold text-slate-600 tracking-widest">
          EMI SEC OPS © 2026
        </span>
      </div>
    </aside>
  );
}
