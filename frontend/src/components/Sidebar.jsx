import React, { useState } from 'react';
import { 
  Terminal, LayoutDashboard, Database, Shield, Radio, Wifi, 
  Bluetooth, Cpu, LogOut, Menu, X, UserCheck, Smartphone, ChevronLeft, ChevronRight
} from 'lucide-react';

export default function Sidebar({ currentPage, setCurrentPage }) {
  // 🟢 ESTADO DE CONTROL DE VISIBILIDAD MANUAL GLOBAL
  const [isCollapsed, setIsCollapsed] = useState(false);

  const mainNavigation = [
    { id: 'dashboard', name: 'Dashboard Ops', icon: LayoutDashboard, desc: 'Telemetría central' },
  ];

  const rfModules = [
    { id: 'db-ir', name: 'Registros IR', icon: Cpu, tag: 'UART' },
    { id: 'db-rfid', name: 'Logs RFID / NFC', icon: Shield, tag: 'SPI' },
    { id: 'db-subghz', name: 'Capturas Sub-GHz', icon: Radio, tag: 'CC1101' },
    { id: 'db-wifi', name: 'Redes Wi-Fi', icon: Wifi, tag: 'NL80211' },
    { id: 'db-bluetooth', name: 'Dispositivos BLE', icon: Bluetooth, tag: 'BT_BUS' },
  ];

  const deviceView = { id: 'device', name: 'Sentinel Screen', icon: Smartphone, desc: 'HUD Físico de terminal' };

  return (
    <>
      {/* 🔘 PESTAÑA TÁCTICA FLOTANTE PARA OCULTAR / MOSTRAR */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={`fixed top-4 z-50 p-2 bg-slate-950 border border-yellow-600/40 text-yellow-500 rounded-lg shadow-xl backdrop-blur-md cursor-pointer transition-all duration-300 ${
          isCollapsed ? 'left-4' : 'left-60'
        }`}
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* aside ESTRUCTURAL DINÁMICO */}
      <aside className={`
        sticky top-0 left-0 z-40 shrink-0
        h-screen bg-slate-950 border-r-2 border-slate-900 
        flex flex-col justify-between font-mono select-none transition-all duration-300 ease-in-out
        ${isCollapsed ? 'w-0 -translate-x-full overflow-hidden border-r-0' : 'w-68 translate-x-0'}
      `}>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
          
          {/* 👤 PERFIL DE OPERADOR */}
          <div className="border border-slate-900 bg-slate-900/20 p-3 rounded-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-500" />
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 relative">
                <UserCheck className="w-5 h-5 text-yellow-500" />
                <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border border-slate-950 animate-pulse" />
              </div>
              
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">OPERADOR_ACTIVO</div>
                <h3 className="text-xs font-black text-slate-200 truncate tracking-wide">J. ANDRES MARCA</h3>
                <p className="text-[9px] text-yellow-500/80 font-bold tracking-widest mt-0.5">SYS_ENG // EMI</p>
              </div>

              <button 
                onClick={() => console.log("[SYS] LogOut solicitado.")}
                className="p-1.5 hover:bg-red-950/30 border border-transparent hover:border-red-900/40 rounded text-slate-500 hover:text-red-400 transition-all cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <hr className="border-slate-900/60" />

          {/* 🎛️ NAVEGACIÓN PRINCIPAL */}
          <div className="space-y-1">
            <p className="text-[9px] font-black text-slate-500 tracking-widest uppercase px-3 mb-2">OPERATIONS_CENTER</p>
            {mainNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all border text-left cursor-pointer group ${
                    isActive
                      ? 'bg-yellow-500 border-yellow-600 text-slate-950 font-black shadow-lg shadow-yellow-500/10'
                      : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-900/60 hover:text-slate-200 hover:border-slate-800'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-950' : 'text-yellow-500'}`} />
                  <div className="truncate">
                    <div>{item.name}</div>
                    <div className={`text-[8px] font-medium leading-none mt-0.5 ${isActive ? 'text-slate-800' : 'text-slate-500'}`}>{item.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 📡 MÓDULOS PERIFÉRICOS */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-3 mb-2">
              <p className="text-[9px] font-black text-slate-500 tracking-widest uppercase">MÓDULOS PERIFÉRICOS</p>
              <Database className="w-3 h-3 text-slate-600" />
            </div>
            {rfModules.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all border text-left cursor-pointer group ${
                    isActive
                      ? 'bg-slate-900 border-slate-800 text-yellow-400 font-black'
                      : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-900/40 hover:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-yellow-400' : 'text-slate-600'}`} />
                    <span className="truncate">{item.name}</span>
                  </div>
                  <span className={`text-[7px] font-black tracking-widest px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                    isActive ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500' : 'bg-slate-950 border-slate-900 text-slate-600'
                  }`}>
                    {item.tag}
                  </span>
                </button>
              );
            })}
          </div>

          <hr className="border-slate-900/60" />

          {/* 📲 PANTALLA VIRTUAL */}
          <div className="space-y-1">
            <p className="text-[9px] font-black text-slate-500 tracking-widest uppercase px-3 mb-2">PANTALLA VIRTUAL</p>
            <button
              onClick={() => setCurrentPage(deviceView.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all border text-left cursor-pointer group ${
                currentPage === deviceView.id
                  ? 'bg-yellow-500 border-yellow-600 text-slate-950 font-black shadow-lg shadow-yellow-500/10'
                  : 'bg-slate-950/60 border-slate-900 text-slate-400 hover:bg-slate-900 hover:text-slate-200 hover:border-slate-800'
              }`}
            >
              <deviceView.icon className={`w-4 h-4 shrink-0 ${currentPage === deviceView.id ? 'text-slate-950' : 'text-yellow-400'}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate">{deviceView.name}</div>
                <div className={`text-[8px] font-medium leading-none mt-0.5 ${currentPage === deviceView.id ? 'text-slate-800' : 'text-slate-500'}`}>{deviceView.desc}</div>
              </div>
            </button>
          </div>

        </div>

        {/* 📋 PIE DE MARCA */}
        <div className="p-3 bg-slate-950 border-t border-slate-900 flex items-center justify-between text-[9px] font-black tracking-widest text-slate-600">
          <span>EMI // SEC_OPS</span>
          <span>© 2026</span>
        </div>
      </aside>
    </>
  );
}