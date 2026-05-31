import React, { useState, useEffect } from 'react';
import { Bluetooth, Database, ShieldAlert, Cpu, Layers, Radio } from 'lucide-react';
const raspberryIp = window.location.hostname;
export default function DbBle() {
  const [devices, setDevices] = useState([]);
  const [trackers, setTrackers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [resDevices, resTrackers] = await Promise.all([
        fetch("http://${raspberryIp}:8000/api/ble/devices").then(r => r.ok ? r.json() : []),
        fetch("http://${raspberryIp}:8000/api/ble/trackers").then(r => r.ok ? r.json() : [])
      ]);
      setDevices(Array.isArray(resDevices) ? resDevices : []);
      setTrackers(Array.isArray(resTrackers) ? resTrackers : []);
    } catch (e) {
      console.log("[-] Error en bus de datos BLE");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  // Métricas
  const totalTrackers   = trackers.length;
  const appleDevices    = devices.filter(d => d.vendor?.includes("Apple")).length;
  const unknownDevices  = devices.filter(d => !d.vendor || d.vendor === "UNKNOWN").length;
  const strongSignal    = devices.filter(d => d.rssi >= -60).length;

  const rssiColor = (rssi) => {
    if (rssi >= -55) return 'text-green-400';
    if (rssi >= -70) return 'text-yellow-400';
    return 'text-slate-500';
  };

  const typeStyle = (type, isTracker) => {
    if (isTracker)           return 'bg-red-950/40 border-red-900 text-red-400';
    if (type === 'INFRASTRUCTURE') return 'bg-blue-950/40 border-blue-900 text-blue-400';
    if (type === 'PERIPHERAL')     return 'bg-purple-950/40 border-purple-900 text-purple-400';
    return 'bg-slate-950 border-slate-800 text-slate-500';
  };

  const typeLabel = (type, isTracker) => {
    if (isTracker) return 'TRACKER';
    return type || 'UNKNOWN';
  };

  return (
    <div className="space-y-6 font-mono pb-10">

      {/* BANNER */}
      <div className="relative border-2 border-blue-600/40 bg-slate-900/40 p-6 rounded-xl overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-1.5 bg-blue-500 text-slate-950 text-[8px] font-black tracking-widest uppercase rounded-bl">
          NET_VAULT // BLE_TSCM
        </div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left space-y-2">
            <h1 className="text-2xl font-black text-slate-100 uppercase tracking-tighter">
              INVENTARIO DE <span className="text-blue-400">NODOS BLUETOOTH</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-bold max-w-xl leading-relaxed uppercase">
              [TELEMETRÍA BLE] Repositorio de dispositivos Bluetooth capturados en el espectro 2.4GHz.
              Clasificación por vendor, tipo y detección de rastreadores comerciales (AirTag, SmartTag).
            </p>
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-center min-w-[80px]">
              <div className="text-[9px] text-slate-500 font-black uppercase">Nodos</div>
              <div className="text-lg font-black text-blue-400">{devices.length}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-center min-w-[80px]">
              <div className="text-[9px] text-slate-500 font-black uppercase">Trackers</div>
              <div className="text-lg font-black text-red-500">{totalTrackers}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-center min-w-[80px]">
              <div className="text-[9px] text-slate-500 font-black uppercase">En rango</div>
              <div className="text-lg font-black text-green-400">{strongSignal}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* MÉTRICAS */}
        <div className="bg-slate-900/20 border border-slate-800 rounded-xl p-5 space-y-5">
          <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-2 border-b border-slate-900 pb-3">
            <Layers className="w-4 h-4 text-blue-400" /> ANÁLISIS DE ECOSISTEMA
          </h2>
          <div className="space-y-4">
            {[
              { label: 'Trackers detectados',    count: totalTrackers,  color: 'bg-red-500',    max: devices.length || 1 },
              { label: 'Dispositivos Apple',     count: appleDevices,   color: 'bg-blue-500',   max: devices.length || 1 },
              { label: 'Vendor desconocido',     count: unknownDevices, color: 'bg-slate-500',  max: devices.length || 1 },
              { label: 'Señal fuerte (>-60dBm)', count: strongSignal,   color: 'bg-green-500',  max: devices.length || 1 },
            ].map((bar, i) => {
              const widthPct = Math.min((bar.count / bar.max) * 100, 100) || 3;
              return (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-[10px] font-black uppercase">
                    <span className="text-slate-400">{bar.label}</span>
                    <span className="text-slate-100">{bar.count}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-950 rounded-full border border-slate-800 p-[1px]">
                    <div style={{ width: `${widthPct}%` }} className={`h-full ${bar.color} rounded-full transition-all duration-500`} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Trackers recientes */}
          {totalTrackers > 0 && (
            <div className="mt-4 border-t border-slate-800 pt-4">
              <div className="text-[9px] font-black text-red-400 uppercase mb-2 flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> ALERTAS TSCM ACTIVAS
              </div>
              <div className="space-y-2">
                {trackers.slice(0, 3).map((t, i) => (
                  <div key={i} className="bg-red-950/20 border border-red-900/40 rounded p-2">
                    <div className="text-[9px] font-black text-red-400">{t.vendor || "TRACKER"}</div>
                    <div className="text-[8px] font-mono text-slate-400">{t.mac}</div>
                    <div className="text-[8px] text-slate-500">{t.rssi} dBm · {t.last_seen}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* TABLA PRINCIPAL */}
        <div className="lg:col-span-2 bg-slate-900/20 border border-slate-800 rounded-xl overflow-hidden shadow-inner flex flex-col">
          <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex justify-between items-center">
            <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" /> BASE_DATA // BLE_NODES
            </h2>
            <div className="text-[9px] text-slate-500 font-black">
              ACTUALIZA CADA 4s
            </div>
          </div>
          <div className="overflow-auto max-h-[340px] text-xs">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-950 text-[9px] font-black text-slate-500 uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="px-4 py-2.5">MAC</th>
                  <th className="px-4 py-2.5">NOMBRE</th>
                  <th className="px-4 py-2.5">VENDOR</th>
                  <th className="px-4 py-2.5">RSSI</th>
                  <th className="px-4 py-2.5">TIPO</th>
                  <th className="px-4 py-2.5">VISTO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/40">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-[10px] text-slate-600 font-black uppercase">
                      Cargando inventario BLE...
                    </td>
                  </tr>
                ) : devices.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-[10px] text-slate-600 font-black uppercase">
                      Sin nodos en caché. Inicia el sniffer BLE.
                    </td>
                  </tr>
                ) : devices.map((d, i) => (
                  <tr key={i} className={`transition-colors ${d.is_tracker ? 'bg-red-950/10 hover:bg-red-950/20' : 'hover:bg-blue-500/5'}`}>
                    <td className="px-4 py-2 font-mono text-blue-400/90 text-[10px]">{d.mac}</td>
                    <td className="px-4 py-2 font-black text-slate-200 text-[10px] max-w-[100px] truncate">
                      {d.name || "UNNAMED"}
                    </td>
                    <td className="px-4 py-2 text-slate-400 text-[10px] max-w-[90px] truncate">
                      {d.vendor || "?"}
                    </td>
                    <td className={`px-4 py-2 font-black text-[10px] ${rssiColor(d.rssi)}`}>
                      {d.rssi} dBm
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${typeStyle(d.type, d.is_tracker)}`}>
                        {typeLabel(d.type, d.is_tracker)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-500 text-[9px]">
                      {d.last_seen || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* GATT SERVICES — si hay devices con services_map */}
      {devices.some(d => d.services_map) && (
        <div className="bg-slate-900/20 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/40">
            <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" /> GATT SERVICES MAPEADOS
            </h2>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {devices.filter(d => d.services_map).map((d, i) => {
              let services = [];
              try { services = JSON.parse(d.services_map); } catch {}
              return (
                <div key={i} className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                  <div className="text-[9px] font-black text-purple-400 mb-1">{d.mac}</div>
                  <div className="text-[8px] text-slate-500 mb-2">{d.name}</div>
                  <div className="space-y-1">
                    {services.slice(0, 4).map((s, j) => (
                      <div key={j} className="text-[8px] font-mono text-slate-400 bg-slate-900 px-2 py-1 rounded">
                        › {s}
                      </div>
                    ))}
                    {services.length > 4 && (
                      <div className="text-[8px] text-slate-600">+{services.length - 4} más...</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}