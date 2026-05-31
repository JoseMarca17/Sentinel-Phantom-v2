import React, { useState, useEffect } from 'react';
import { Wifi, Database, ShieldAlert, Cpu, Layers, Trash2, Zap } from 'lucide-react';

export default function DbWifi() {
  const [aps, setAps] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [resAps, resClients] = await Promise.all([
        fetch("http://${raspberryIp}:8000/api/wifi/access-points").then(r => r.ok ? r.json() : []),
        fetch("http://${raspberryIp}:8000/api/wifi/clients").then(r => r.ok ? r.json() : [])
      ]);
      setAps(resAps);
      setClients(resClients);
    } catch (e) {
      console.log("[-] Error en bus de datos Wi-Fi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  // Métricas analíticas nativas
  const rogueAPs = aps.filter(ap => ap.is_rogue).length;
  const wpsAPs = aps.filter(ap => ap.wps || ap.wps_active).length;

  return (
    <div className="space-y-6 font-mono pb-10">
      
      {/* BANNER TÁCTICO */}
      <div className="relative border-2 border-yellow-600/40 bg-slate-900/40 p-6 rounded-xl overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-1.5 bg-yellow-500 text-slate-950 text-[8px] font-black tracking-widest uppercase rounded-bl">
          NET_VAULT // WIRELESS_80211
        </div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left space-y-2">
            <h1 className="text-2xl font-black text-slate-100 uppercase tracking-tighter">
              INVENTARIO DE <span className="text-yellow-500">CELDAS INALÁMBRICAS</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-bold max-w-xl leading-relaxed uppercase">
              [TELEMETRÍA RF] Repositorio de Access Points interceptados en el espectro y estaciones mapeadas en Capa 3 mediante barridos activos de Nmap.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-center min-w-[90px]">
              <div className="text-[9px] text-slate-500 font-black uppercase">Routers</div>
              <div className="text-lg font-black text-yellow-500">{aps.length}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-center min-w-[90px]">
              <div className="text-[9px] text-slate-500 font-black uppercase">Rogue APs</div>
              <div className="text-lg font-black text-red-500">{rogueAPs}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* GRÁFICAS VECTORIALES */}
        <div className="bg-slate-900/20 border border-slate-800 rounded-xl p-5 space-y-5">
          <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-2 border-b border-slate-900 pb-3">
            <Layers className="w-4 h-4 text-yellow-500" /> ALERTAS DE SEGURIDAD
          </h2>
          <div className="space-y-4">
            {[
              { label: 'Vectores WPS Vulnerables', count: wpsAPs, color: 'bg-amber-500', max: aps.length || 1 },
              { label: 'Suplantaciones (Rogue AP)', count: rogueAPs, color: 'bg-red-500', max: aps.length || 1 },
              { label: 'Estaciones Asociadas L3', count: clients.length, color: 'bg-blue-500', max: 20 }
            ].map((bar, i) => {
              const widthPct = Math.min((bar.count / bar.max) * 100, 100) || 5;
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
        </div>

        {/* TABLA DE ACCESS POINTS */}
        <div className="lg:col-span-2 bg-slate-900/20 border border-slate-800 rounded-xl overflow-hidden shadow-inner flex flex-col">
          <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex justify-between items-center">
            <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-2">
              <Database className="w-4 h-4 text-yellow-500" /> BASE_DATA // ACCESS_POINTS
            </h2>
          </div>
          <div className="overflow-auto max-h-[320px] custom-scrollbar text-xs">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-950 text-[9px] font-black text-slate-500 uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="px-4 py-2.5">ESSID</th>
                  <th className="px-4 py-2.5">BSSID (MAC)</th>
                  <th className="px-4 py-2.5">CH</th>
                  <th className="px-4 py-2.5">RSSI</th>
                  <th className="px-4 py-2.5">TIPO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/40">
                {aps.map((ap, i) => (
                  <tr key={i} className="hover:bg-yellow-500/5 transition-colors">
                    <td className="px-4 py-2 font-black text-slate-200">{ap.ssid}</td>
                    <td className="px-4 py-2 font-mono text-yellow-500/90">{ap.bssid}</td>
                    <td className="px-4 py-2 font-bold text-slate-400">{ap.channel}</td>
                    <td className="px-4 py-2 font-bold text-slate-400">{ap.rssi} dBm</td>
                    <td className="px-4 py-2">
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${
                        ap.is_rogue ? 'bg-red-950/40 border-red-900 text-red-400' : 'bg-slate-950 border-slate-800 text-slate-500'
                      }`}>
                        {ap.is_rogue ? "EVIL_TWIN" : "CLEAR"}
                      </span>
                    </td>
                  </tr>
                ))}
                {aps.length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-[10px] text-slate-600 font-black uppercase">Espectro limpio. No hay routers en caché.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}