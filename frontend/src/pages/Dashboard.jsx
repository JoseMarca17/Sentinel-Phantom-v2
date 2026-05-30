import React, { useState, useEffect, useRef } from 'react';
import { Cpu, Database, Radio, ShieldAlert, Activity, Server, Users, RadioReceiver, Layers, Zap, Key, Bluetooth, Wifi } from 'lucide-react';

export default function Dashboard() {
  const [hardwareState, setHardwareState] = useState({
    uart:    { status: 'CHECKING', desc: 'Esperando respuesta del ESP32...', val: 'PENDING' },
    db:      { status: 'OK',       desc: 'sentinel.db activa',              val: 'ACTIVA'  },
    antenna: { status: 'CHECKING', desc: 'Verificando interfaz RF...',      val: 'PENDING' }
  });

  const [stats, setStats] = useState({
    wifi_aps: 0, wifi_clients: 0, wifi_handshakes: 0,
    ir_signals: 0, rfid_cards: 0, subghz_logs: 0,
    ble_nodes: 0, ble_trackers: 0,
  });

  const [liveLogs, setLiveLogs] = useState([
    { type: 'CORE', text: 'SENTINEL PHANTOM C2 — WATCHDOG ACTIVO' }
  ]);

  const addLog = (type, text) =>
    setLiveLogs(p => [{ type, text }, ...p.slice(0, 7)]);

  const uartChecked = useRef(false);

  // ── Polling de endpoints ──
  useEffect(() => {
    const fetchAll = async () => {
      const safe = async (url, key) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return;
          const d = await r.json();
          if (Array.isArray(d))
            setStats(p => ({ ...p, [key]: d.length }));
        } catch {}
      };

      await Promise.all([
        safe("http://127.0.0.1:8000/api/wifi/access-points", "wifi_aps"),
        safe("http://127.0.0.1:8000/api/wifi/clients",       "wifi_clients"),
        safe("http://127.0.0.1:8000/api/wifi/handshakes",    "wifi_handshakes"),
        safe("http://127.0.0.1:8000/api/ir/signals",         "ir_signals"),
        safe("http://127.0.0.1:8000/api/rfid/history",       "rfid_cards"),
        safe("http://127.0.0.1:8000/api/subghz/history",     "subghz_logs"),
        safe("http://127.0.0.1:8000/api/ble/devices",        "ble_nodes"),
        safe("http://127.0.0.1:8000/api/ble/trackers",       "ble_trackers"),
      ]);

      // Verificar antena leyendo la interfaz desde el backend
      try {
        const r = await fetch("http://127.0.0.1:8000/");
        if (r.ok) {
          const d = await r.json();
          const iface = d.attack_iface || "wlp8s0f3u1";
          setHardwareState(p => ({
            ...p,
            antenna: { status: 'OK', desc: `${iface} disponible`, val: 'READY' }
          }));
        }
      } catch {
        setHardwareState(p => ({
          ...p,
          antenna: { status: 'CRIT', desc: 'Interfaz RF no responde', val: 'OFFLINE' }
        }));
      }
    };

    fetchAll();
    const t = setInterval(fetchAll, 5000);
    return () => clearInterval(t);
  }, []);

  // ── WebSocket ──
  useEffect(() => {
    let ws, timer;
    const connect = () => {
      ws = new WebSocket("ws://127.0.0.1:8000/ws/control");

      ws.onopen = () => {
        if (!uartChecked.current) {
          uartChecked.current = true;
          setHardwareState(p => ({
            ...p,
            uart: { status: 'OK', desc: '/dev/ttyUSB0 @ 115200bps', val: 'CONECTADO' }
          }));
          addLog('UART', 'Bus serie ESP32 sincronizado con éxito');
        }
      };

      ws.onmessage = (e) => {
        try {
          const { module, data: payload = [] } = JSON.parse(e.data);
          if (module === "WIFI_SPECTRUM" && Array.isArray(payload)) {
            setStats(p => ({ ...p, wifi_aps: payload.length }));
          } else if (module === "WIFI_LAN_HOSTS" && Array.isArray(payload)) {
            setStats(p => ({ ...p, wifi_clients: payload.length }));
            addLog('NET', `BARRIDO L3: ${payload.length} terminales en subred`);
          } else if (module === "WIFI_HANDSHAKE") {
            setStats(p => ({ ...p, wifi_handshakes: p.wifi_handshakes + 1 }));
            addLog('WPA2', `HANDSHAKE CAPTURADO → ${payload?.bssid || "?"}`);
          } else if (module === "BLE_STREAM") {
            setStats(p => ({ ...p, ble_nodes: p.ble_nodes + 1 }));
            if (payload?.is_tracker)
              addLog('TSCM', `TRACKER DETECTADO → ${payload.mac}`);
          }
        } catch {}
      };

      ws.onerror = () => {
        setHardwareState(p => ({
          ...p,
          uart: { status: 'CRIT', desc: 'Bus UART inaccesible', val: 'DESCONECTADO' }
        }));
      };

      ws.onclose = () => { timer = setTimeout(connect, 3000); };
    };

    connect();
    return () => { clearTimeout(timer); ws?.close(); };
  }, []);

  const totalWifi = stats.wifi_aps + stats.wifi_clients + stats.wifi_handshakes;
  const totalSdr  = stats.ir_signals + stats.rfid_cards + stats.subghz_logs;

  const hwCards = [
    { name: 'Coprocesador ESP32',   ...hardwareState.uart,    icon: Cpu       },
    { name: 'Base de Datos SQLite', ...hardwareState.db,      icon: Database  },
    { name: 'Antena RF Monitor',    ...hardwareState.antenna, icon: Radio     },
  ];

  return (
    <div className="space-y-6 font-mono max-w-7xl mx-auto p-2 bg-slate-950 text-slate-200 select-none">

      {/* ── BANNER ── */}
      <div className="relative border-2 border-yellow-600 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8 md:p-10 rounded-2xl overflow-hidden shadow-2xl flex flex-col lg:flex-row justify-between items-center gap-8">
        {/* Grid background */}
        <div className="absolute inset-0 opacity-5 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:16px_16px]" />
        {/* Corner accents */}
        <div className="absolute top-0 left-0 w-16 h-16 border-t-2 border-l-2 border-yellow-500/40 rounded-tl-2xl" />
        <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-yellow-500/40 rounded-br-2xl" />

        <div className="relative z-10 space-y-5 text-center lg:text-left w-full lg:w-2/3">
          <div className="flex flex-wrap justify-center lg:justify-start gap-3">
            <div className="inline-flex items-center gap-2 text-yellow-500 font-black text-[10px] tracking-widest bg-yellow-950/40 border border-yellow-800/40 px-3 py-1.5 rounded">
              <Zap className="w-3.5 h-3.5 animate-pulse" /> MIL-SPEC AUDIT PLATFORM
            </div>
            <div className="inline-flex items-center gap-2 text-emerald-400 font-black text-[10px] tracking-widest bg-emerald-950/40 border border-emerald-800/40 px-3 py-1.5 rounded">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" /> SYSTEM DEPLOYED
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-4xl md:text-5xl font-black text-slate-100 uppercase tracking-wider leading-none">
              SENTINEL{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600">
                PHANTOM
              </span>
            </h1>
            <div className="text-yellow-600 font-black text-xl tracking-widest">AUDIT PLATFORM</div>
            <p className="text-[10px] font-black tracking-widest text-slate-500 uppercase">
              Escuela Militar de Ingeniería · Ingeniería de Sistemas
            </p>
          </div>

          <div className="border-l-4 border-yellow-500 pl-4 py-1 text-left">
            <p className="text-[11px] text-slate-400 font-bold leading-relaxed">
              Dispositivo táctico autónomo de auditoría de espectro electromagnético e interceptación
              de vectores inalámbricos. Desarrollado para el análisis y mitigación de amenazas en
              entornos críticos mediante módulos RF, BLE, SubGHz, RFID e IR.
            </p>
          </div>

          <div className="flex flex-wrap justify-center lg:justify-start gap-6 text-[10px] font-black">
            <div className="text-slate-400">OPERADOR: <span className="text-yellow-500">J. ANDRES MARCA C.</span></div>
            <div className="text-slate-400">PLATAFORMA: <span className="text-yellow-500">RASPBERRY PI 3B</span></div>
            <div className="text-slate-400">FIRMWARE: <span className="text-yellow-500">ESP32 WROOM-32</span></div>
          </div>

          {/* Mini stats en el banner */}
          <div className="flex flex-wrap justify-center lg:justify-start gap-3 pt-2">
            {[
              { icon: Wifi,      label: 'APs',       val: stats.wifi_aps,      color: 'text-yellow-400' },
              { icon: Bluetooth, label: 'BLE',        val: stats.ble_nodes,     color: 'text-blue-400'   },
              { icon: ShieldAlert,label: 'Trackers',  val: stats.ble_trackers,  color: 'text-red-400'    },
              { icon: Key,       label: 'RFID',       val: stats.rfid_cards,    color: 'text-purple-400' },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 px-3 py-1.5 rounded-lg">
                  <Icon className={`w-3.5 h-3.5 ${s.color}`} />
                  <span className="text-[9px] text-slate-400 font-black uppercase">{s.label}</span>
                  <span className={`text-sm font-black ${s.color}`}>{s.val}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Logo */}
        <div className="relative w-48 h-48 md:w-52 md:h-52 shrink-0 bg-slate-950 rounded-full border-2 border-yellow-600/30 shadow-inner flex items-center justify-center p-2 group">
          <div className="absolute inset-0 rounded-full border border-dashed border-yellow-500/20 animate-spin" style={{ animationDuration: '12s' }} />
          <div className="absolute inset-4 rounded-full border border-yellow-500/10 animate-spin" style={{ animationDuration: '8s', animationDirection: 'reverse' }} />
          <div className="absolute inset-2 rounded-full border border-yellow-500/5 animate-ping" style={{ animationDuration: '3s' }} />
          <svg className="w-32 h-32 text-yellow-500 filter drop-shadow-[0_0_12px_rgba(234,179,8,0.4)] transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 10a8 8 0 0 1 16 0v1.5c0 1.5-.5 2.5-1.5 3.5l-1.5 1.5v2.5a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-2.5L5.5 15C4.5 14 4 13 4 11.5V10z" fill="rgba(32,16,0,0.3)" />
            <path d="M8 11l2 1 1.5-1.5M16 11l-2 1-1.5-1.5" strokeWidth="1.5" />
            <path d="M12 13l-1 1.5h2z" fill="currentColor" />
            <path d="M9 19v-2M11 19v-2M13 19v-2M15 19v-2" strokeWidth="1.5" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2" opacity="0.3" />
          </svg>
        </div>
      </div>

      {/* ── HARDWARE STATUS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {hwCards.map((m, i) => {
          const Icon = m.icon;
          const isCrit    = m.status === 'CRIT';
          const isOk      = m.status === 'OK';
          const isPending = m.status === 'CHECKING';
          return (
            <div key={i} className={`border p-4 rounded-xl flex flex-col justify-between transition-all relative ${
              isCrit    ? 'border-red-900    bg-red-950/10'    :
              isPending ? 'border-slate-700  bg-slate-900/20'  :
                          'border-slate-800  bg-slate-900/40 hover:border-slate-700'
            }`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-[9px] font-black tracking-wider text-slate-400 uppercase">{m.name}</h3>
                  <p className={`text-base font-black mt-1 ${
                    isCrit    ? 'text-red-500 animate-pulse'  :
                    isPending ? 'text-slate-500 animate-pulse':
                                'text-yellow-500'
                  }`}>{m.val}</p>
                </div>
                <div className={`p-2 rounded border ${
                  isCrit ? 'bg-red-950/20 border-red-900' : 'bg-slate-950 border-slate-800'
                }`}>
                  <Icon className={`w-4 h-4 ${isCrit ? 'text-red-500' : isPending ? 'text-slate-600' : 'text-yellow-500'}`} />
                </div>
              </div>
              <p className="text-[9px] text-slate-500 font-bold mt-4 border-t border-slate-950 pt-2">&gt; {m.desc}</p>
              {isOk && <div className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
            </div>
          );
        })}
      </div>

      {/* ── MÉTRICAS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* WiFi */}
        <div className="bg-slate-900/20 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-900 pb-2">
            <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-2">
              <Wifi className="w-4 h-4 text-yellow-500" /> VECTORES WI-FI
            </h2>
            <span className="text-[9px] font-black text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">{totalWifi}</span>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Access Points (Capa 2)', count: stats.wifi_aps,         color: 'bg-yellow-500', max: 40 },
              { label: 'Clientes / Estaciones',  count: stats.wifi_clients,     color: 'bg-amber-600',  max: 20 },
              { label: 'Handshakes WPA2',        count: stats.wifi_handshakes,  color: 'bg-emerald-500',max: 10 },
            ].map((bar, i) => {
              const w = Math.min((bar.count / bar.max) * 100, 100) || 3;
              return (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-slate-400">{bar.label}</span>
                    <span className="text-slate-200">{bar.count}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-950 rounded border border-slate-900 overflow-hidden p-[1px]">
                    <div style={{ width: `${w}%` }} className={`h-full ${bar.color} rounded-sm transition-all duration-500`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* BLE */}
        <div className="bg-slate-900/20 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-900 pb-2">
            <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-2">
              <Bluetooth className="w-4 h-4 text-blue-400" /> VECTORES BLE
            </h2>
            <span className="text-[9px] font-black text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">{stats.ble_nodes}</span>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Nodos detectados',   count: stats.ble_nodes,    color: 'bg-blue-500',   max: 30 },
              { label: 'Trackers (TSCM)',    count: stats.ble_trackers, color: 'bg-red-500',    max: 10 },
            ].map((bar, i) => {
              const w = Math.min((bar.count / bar.max) * 100, 100) || 3;
              return (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-slate-400">{bar.label}</span>
                    <span className="text-slate-200">{bar.count}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-950 rounded border border-slate-900 overflow-hidden p-[1px]">
                    <div style={{ width: `${w}%` }} className={`h-full ${bar.color} rounded-sm transition-all duration-500`} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Log en vivo */}
          <div className="border-t border-slate-900 pt-3 space-y-1">
            <div className="text-[9px] font-black text-slate-500 uppercase mb-2">LOG EN VIVO</div>
            {liveLogs.slice(0, 4).map((l, i) => (
              <div key={i} className="text-[8px] font-mono text-slate-500 truncate">
                <span className="text-yellow-600">[{l.type}]</span> {l.text}
              </div>
            ))}
          </div>
        </div>

        {/* SDR / Coprocesador */}
        <div className="bg-slate-900/20 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-900 pb-2">
            <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-2">
              <RadioReceiver className="w-4 h-4 text-yellow-500" /> COPROCESADOR UART
            </h2>
            <span className="text-[9px] font-black text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">{totalSdr}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 h-24 items-end">
            {[
              { label: 'IR',     val: stats.ir_signals,  max: 25, color: 'from-amber-600 to-yellow-500'   },
              { label: 'RFID',   val: stats.rfid_cards,  max: 20, color: 'from-purple-700 to-purple-400'  },
              { label: 'SubGHz', val: stats.subghz_logs, max: 30, color: 'from-blue-700 to-blue-400'      },
            ].map((col, i) => {
              const h = Math.min((col.val / col.max) * 100, 100) || 8;
              return (
                <div key={i} className="flex flex-col items-center justify-end h-full gap-1">
                  <span className="text-[10px] font-black text-yellow-500">{col.val}</span>
                  <div className="w-full bg-slate-950 border border-slate-900 rounded p-[1px] h-14 flex flex-col justify-end">
                    <div style={{ height: `${h}%` }} className={`w-full bg-gradient-to-t ${col.color} rounded-sm transition-all duration-500`} />
                  </div>
                  <span className="text-[8px] font-black text-slate-500 text-center">{col.label}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ── ACCESOS RÁPIDOS ── */}
      <div className="space-y-2">
        <h2 className="text-[9px] font-black tracking-widest text-slate-400 uppercase">MÓDULOS DE PERIFÉRICOS</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { name: 'INFRARROJO',  count: stats.ir_signals,     icon: Zap,         color: 'text-amber-400'  },
            { name: 'RFID / NFC',  count: stats.rfid_cards,     icon: Key,         color: 'text-purple-400' },
            { name: 'SUB-GHZ',     count: stats.subghz_logs,    icon: RadioReceiver,color: 'text-blue-400'  },
            { name: 'WI-FI APs',   count: stats.wifi_aps,       icon: Wifi,        color: 'text-yellow-400' },
            { name: 'BLE NODOS',   count: stats.ble_nodes,      icon: Bluetooth,   color: 'text-blue-300'   },
            { name: 'TRACKERS',    count: stats.ble_trackers,   icon: ShieldAlert, color: 'text-red-400'    },
          ].map((mod, i) => {
            const Icon = mod.icon;
            return (
              <div key={i} className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl flex flex-col justify-between hover:border-yellow-600/50 transition-all shadow-md">
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-black text-slate-400 uppercase leading-tight">{mod.name}</span>
                  <Icon className={`w-4 h-4 shrink-0 ${mod.color}`} />
                </div>
                <div className={`text-2xl font-black mt-2 ${mod.color}`}>{mod.count}</div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}