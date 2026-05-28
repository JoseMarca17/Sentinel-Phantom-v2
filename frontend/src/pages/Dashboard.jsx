import React, { useState, useEffect } from 'react';
import { Cpu, Database, Radio, ShieldAlert, Activity, Server, Users, RadioReceiver, Layers, Zap, Key } from 'lucide-react';

export default function Dashboard() {
  const [hardwareState, setHardwareState] = useState({
    uart: { status: 'CHECKING', desc: 'Sintonizando bus serie...', val: 'PENDING' },
    db: { status: 'OK', desc: 'sentinel.db persistiendo', val: 'ACTIVA' },
    antenna: { status: 'OK', desc: 'wlp8s0f3u1 mapeada', val: 'READY' }
  });

  const [stats, setStats] = useState({
    wifi_aps: 0,
    wifi_clients: 0,
    wifi_handshakes: 0,
    ir_signals: 0,
    rfid_cards: 0,
    subghz_logs: 0,
  });

  const [liveLogs, setLiveLogs] = useState([
    { type: 'CORE', text: 'TACTICAL MONITOR INSTANCIADO CON ÉXITO VÍA WEBSOCKET' }
  ]);

  // 📡 CARGA DE TELEMETRÍA ULTRA SOLA (MÉTODO INDEPENDIENTE POR ENDPOINT)
  useEffect(() => {
    const fetchEndpoints = async () => {
      // 1. RFID History
      try {
        const res = await fetch("http://127.0.0.1:8000/api/rfid/history");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setStats(prev => ({ ...prev, rfid_cards: data.length }));
          }
        }
      } catch (e) { console.log("[-] RFID offline"); }

      // 2. Wi-Fi APs
      try {
        const res = await fetch("http://127.0.0.1:8000/api/wifi/access-points");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setStats(prev => ({ ...prev, wifi_aps: data.length }));
        }
      } catch (e) {}

      // 3. Wi-Fi Clients
      try {
        const res = await fetch("http://127.0.0.1:8000/api/wifi/clients");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setStats(prev => ({ ...prev, wifi_clients: data.length }));
        }
      } catch (e) {}

      // 4. Wi-Fi Handshakes
      try {
        const res = await fetch("http://127.0.0.1:8000/api/wifi/handshakes");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setStats(prev => ({ ...prev, wifi_handshakes: data.length }));
        }
      } catch (e) {}

      // 5. IR Signals
      try {
        const res = await fetch("http://127.0.0.1:8000/api/ir/signals");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setStats(prev => ({ ...prev, ir_signals: data.length }));
        }
      } catch (e) {}

      // 6. SubGHz
      try {
        const res = await fetch("http://127.0.0.1:8000/api/subghz/history");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setStats(prev => ({ ...prev, subghz_logs: data.length }));
        }
      } catch (e) {}
    };

    fetchEndpoints();
    const interval = setInterval(fetchEndpoints, 4000); // Actualización cada 4 segundos
    return () => clearInterval(interval);
  }, []);

  // ⚡ ENLACE DE SOCKET CONTROLADOR
  useEffect(() => {
    const ws = new WebSocket("ws://127.0.0.1:8000/ws/control");

    ws.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data);
        const module = (raw.module || "").toUpperCase();
        const payload = raw.data || [];

        if (module === "WIFI_SPECTRUM") {
          setStats(prev => ({ ...prev, wifi_aps: Array.isArray(payload) ? payload.length : prev.wifi_aps }));
          setHardwareState(prev => ({ ...prev, antenna: { status: 'OK', desc: 'RF_SCANNER: Saltando canales', val: 'MONITOR' } }));
        } else if (module === "WIFI_LAN_HOSTS") {
          setStats(prev => ({ ...prev, wifi_clients: Array.isArray(payload) ? payload.length : prev.wifi_clients }));
          setLiveLogs(prev => [{ type: 'NET', text: `BARRIDO L3 FINALIZADO: ${payload.length} terminales en caché.` }, ...prev]);
        }

        if (hardwareState.uart.status === 'CHECKING') {
          setHardwareState(prev => ({ ...prev, uart: { status: 'OK', desc: '/dev/ttyUSB0 @ 115200bps', val: 'CONECTADO' } }));
        }
      } catch (e) { console.error(e); }
    };

    ws.onerror = () => {
      setHardwareState(prev => ({ ...prev, uart: { status: 'CRIT', desc: 'Bus UART inaccesible', val: 'DESCONECTADO' } }));
    };

    return () => ws.close();
  }, [hardwareState.uart.status]);

  const totalWifiRecords = stats.wifi_aps + stats.wifi_clients + stats.wifi_handshakes;
  const totalSdrRecords = stats.ir_signals + stats.rfid_cards + stats.subghz_logs;

  return (
    <div className="space-y-6 font-mono max-w-7xl mx-auto p-2 bg-slate-950 text-slate-200 select-none">
      
      {/* 💀 BANNER INDUSTRIAL TÁCTICO IMPONENTE */}
      <div className="relative border-2 border-yellow-600 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 md:p-8 rounded-xl overflow-hidden shadow-2xl flex flex-col lg:flex-row justify-between items-center gap-6">
        <div className="absolute inset-0 opacity-5 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:16px_16px]" />
        
        <div className="relative z-10 space-y-4 text-center lg:text-left w-full lg:w-2/3">
          <div className="inline-flex items-center gap-2 text-yellow-500 font-black text-xs tracking-widest bg-yellow-950/40 border border-yellow-800/40 px-3 py-1 rounded">
            <Zap className="w-3.5 h-3.5 animate-pulse" /> MIL-SPEC AUDIT PLATFORM ACTIVE
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-black text-slate-100 uppercase tracking-wider">
              SENTINEL <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600">PHANTOM v2.0</span>
            </h1>
            <h2 className="text-[10px] md:text-xs font-black tracking-widest text-slate-500 uppercase">
              Escuela Militar de Ingeniería // Proyecto de Grado - Ingeniería de Sistemas
            </h2>
          </div>
          <div className="border-l-2 border-yellow-500 pl-4 py-1 text-left hidden md:block">
            <p className="text-[11px] text-slate-400 font-bold leading-relaxed">
              Dispositivo táctico autónomo de auditoría de espectro e interceptación de vectores. Desarrollado para el análisis y mitigación de amenazas inalámbricas en entornos críticos.
            </p>
          </div>
          <div className="flex flex-wrap justify-center lg:justify-start gap-4 text-[10px] font-black text-slate-400">
            <div>OPERADOR: <span className="text-yellow-500">J. ANDRES MARCA C.</span></div>
            <div className="hidden sm:block text-slate-700">|</div>
            <div>STATUS: <span className="text-emerald-500 animate-pulse">DEPLOYED</span></div>
          </div>
        </div>

        {/* LOGO ADAPTATIVO SVG */}
        <div className="relative w-40 h-40 md:w-44 md:h-44 shrink-0 bg-slate-950 rounded-full border border-yellow-600/30 shadow-inner flex items-center justify-center p-2 group">
          <div className="absolute inset-0 rounded-full border border-dashed border-yellow-500/10 animate-spin" style={{ animationDuration: '8s' }} />
          <div className="absolute inset-2 rounded-full border border-yellow-500/5 animate-ping" style={{ animationDuration: '3s' }} />
          
          <svg className="w-28 h-28 text-yellow-500 filter drop-shadow-[0_0_8px_rgba(234,179,8,0.3)] transition-transform duration-300 group-hover:scale-105" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 10a8 8 0 0 1 16 0v1.5c0 1.5-.5 2.5-1.5 3.5l-1.5 1.5v2.5a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-2.5L5.5 15C4.5 14 4 13 4 11.5V10z" fill="rgba(32,16,0,0.2)" />
            <path d="M8 11l2 1 1.5-1.5M16 11l-2 1-1.5-1.5" strokeWidth="1.5" stroke="currentColor" />
            <path d="M12 13l-1 1.5h2z" fill="currentColor" />
            <path d="M9 19v-2M11 19v-2M13 19v-2M15 19v-2" strokeWidth="1.5" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2" opacity="0.4" />
          </svg>
        </div>
      </div>

      {/* 🎛️ CORE INFRASTRUCTURE MATRIX */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { name: 'Coprocesador UART', val: hardwareState.uart.val, status: hardwareState.uart.status, desc: hardwareState.uart.desc, icon: Cpu },
          { name: 'Base de Datos SQLite', val: hardwareState.db.val, status: hardwareState.db.status, desc: hardwareState.db.desc, icon: Database },
          { name: 'Antena Ralink Mon', val: hardwareState.antenna.val, status: hardwareState.antenna.status, desc: hardwareState.antenna.desc, icon: Radio }
        ].map((m, idx) => {
          const Icon = m.icon;
          const isCrit = m.status === 'CRIT';
          return (
            <div key={idx} className={`bg-slate-900/40 border p-4 rounded-lg flex flex-col justify-between transition-all relative ${isCrit ? 'border-red-900 bg-red-950/10' : 'border-slate-800 hover:border-slate-700'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-[9px] font-black tracking-wider text-slate-400 uppercase">{m.name}</h3>
                  <p className={`text-base font-black mt-1 ${isCrit ? 'text-red-500 animate-pulse' : 'text-yellow-500'}`}>{m.val}</p>
                </div>
                <div className={`p-2 rounded border ${isCrit ? 'bg-red-950/20 border-red-900' : 'bg-slate-950 border-slate-800'}`}>
                  <Icon className={`w-4 h-4 ${isCrit ? 'text-red-500' : 'text-yellow-500'}`} />
                </div>
              </div>
              <p className="text-[9px] text-slate-500 font-bold mt-4 border-t border-slate-950 pt-2">&gt; {m.desc}</p>
            </div>
          );
        })}
      </div>

      {/* 📊 MATRICES GRÁFICAS VECTORIALES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* GRÁFICA WI-FI */}
        <div className="bg-slate-900/20 border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-900 pb-2">
            <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-2">
              <Layers className="w-4 h-4 text-yellow-500" /> VECTORES DE RED WI-FI
            </h2>
            <span className="text-[9px] font-black text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">{totalWifiRecords} OBJETOS</span>
          </div>
          
          <div className="space-y-3 pt-1">
            {[
              { label: 'Access Points (Capa 2)', count: stats.wifi_aps, color: 'bg-yellow-500', max: 40 },
              { label: 'Clientes / Estaciones', count: stats.wifi_clients, color: 'bg-amber-600', max: 20 },
              { label: 'Handshakes Capturados', count: stats.wifi_handshakes, color: 'bg-emerald-500', max: 10 }
            ].map((bar, i) => {
              const widthPct = Math.min((bar.count / bar.max) * 100, 100) || 4;
              return (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-slate-400">{bar.label}</span>
                    <span className="text-slate-200">{bar.count} indexados</span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-950 rounded border border-slate-900 overflow-hidden p-[1px]">
                    <div style={{ width: `${widthPct}%` }} className={`h-full ${bar.color} rounded-sm transition-all duration-500`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* HISTOGRAMA COPROCESADOR */}
        <div className="bg-slate-900/20 border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-900 pb-2">
            <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-2">
              <RadioReceiver className="w-4 h-4 text-yellow-500" /> SEÑALES COPROCESADOR UART
            </h2>
            <span className="text-[9px] font-black text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">{totalSdrRecords} CAPTURAS</span>
          </div>

          <div className="grid grid-cols-3 gap-3 h-[92px] pt-1 items-end">
            {[
              { label: 'IR_CODES', val: stats.ir_signals, max: 25 },
              { label: 'RFID_UIDS', val: stats.rfid_cards, max: 20 },
              { label: 'SUB-GHZ', val: stats.subghz_logs, max: 30 }
            ].map((col, i) => {
              const heightPct = Math.min((col.val / col.max) * 100, 100) || 10;
              return (
                <div key={i} className="flex flex-col items-center justify-end h-full gap-1.5">
                  <span className="text-[10px] font-black text-yellow-500">{col.val}</span>
                  <div className="w-full bg-slate-950 border border-slate-900 rounded p-[1px] h-14 flex flex-col justify-end">
                    <div style={{ height: `${heightPct}%` }} className="w-full bg-gradient-to-t from-amber-600 to-yellow-500 rounded-sm transition-all duration-500" />
                  </div>
                  <span className="text-[8px] font-black text-slate-500 tracking-wider text-center truncate w-full">{col.label}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* 🗂️ GRILLA DE ACCESOS DIRECTOS */}
      <div className="space-y-2">
        <h2 className="text-[9px] font-black tracking-widest text-slate-400 uppercase">ACCESOS DIRECTOS // MÓDULOS DE PERIFÉRICOS</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { name: 'INFRARROJO (IR)', count: stats.ir_signals, desc: 'Códigos guardados en BD', icon: Zap },
            { name: 'RFID / NFC MATRIX', count: stats.rfid_cards, desc: 'Tarjetas físicas leídas', icon: Key },
            { name: 'TRANSCEIVER SUB-GHZ', count: stats.subghz_logs, desc: 'Ráfagas capturadas', icon: RadioReceiver }
          ].map((mod, i) => {
            const Icon = mod.icon;
            return (
              <div key={i} className="bg-slate-900/50 border border-slate-800 p-4 rounded-lg flex flex-col justify-between hover:border-yellow-600/50 transition-all cursor-pointer shadow-md">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{mod.name}</div>
                    <div className="text-xl font-black text-slate-100 mt-0.5">{mod.count}</div>
                  </div>
                  <Icon className="w-4 h-4 text-yellow-500 shrink-0" />
                </div>
                <div className="text-[8px] text-slate-500 font-bold tracking-wide mt-3 uppercase border-t border-slate-950 pt-1.5">
                  &gt; {mod.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}