import React, { useState, useEffect } from 'react';
import { RadioReceiver, Database, Clock, Activity, Zap, Trash2 } from 'lucide-react';

export default function DbSubghz() {
  const [captures, setCaptures] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSubghz = async () => {
    try {
      const res = await fetch("http://${raspberryIp}:8000/api/subghz/history");
      if (res.ok) {
        const data = await res.json();
        setCaptures(Array.isArray(data) ? data : []);
      }
    } catch (e) {
       console.log("[-] Error interrogando CC1101");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubghz();
    const interval = setInterval(fetchSubghz, 5000);
    return () => clearInterval(interval);
  }, []);

  const count433 = captures.filter(c => c.freq_mhz === 433.92).length;
  const count315 = captures.filter(c => c.freq_mhz === 315.0).length;

  return (
    <div className="space-y-6 font-mono pb-10">
      <div className="relative border-2 border-yellow-600/40 bg-slate-900/40 p-6 rounded-xl overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-1.5 bg-yellow-500 text-slate-950 text-[8px] font-black tracking-widest uppercase rounded-bl">
          SDR_VAULT // CC1101_TRANSCEIVER
        </div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left space-y-2">
            <h1 className="text-2xl font-black text-slate-100 uppercase tracking-tighter">
              LOGS DE SEÑALES <span className="text-yellow-500">SUB-GHZ RF</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-bold max-w-xl leading-relaxed uppercase">
              [SUB-1GHz PROTOCOLS] Registro de tramas modulares capturadas en frecuencias industriales (Mandos de portones, alarmas, sensores RF).
            </p>
          </div>
          <div className="flex gap-4">
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-center min-w-[90px]">
              <div className="text-[9px] text-slate-500 font-black uppercase">Capturas</div>
              <div className="text-lg font-black text-yellow-500">{captures.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-slate-900/20 border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-2 border-b border-slate-900 pb-3">
            <Activity className="w-4 h-4 text-yellow-500" /> DENSIDAD DE FRECUENCIA
          </h2>
          <div className="grid grid-cols-2 gap-4 h-24 pt-2 items-end">
            {[
              { label: '433.92 MHz', val: count433, max: 20 },
              { label: '315.00 MHz', val: count315, max: 20 }
            ].map((col, i) => {
              const heightPct = Math.min((col.val / col.max) * 100, 100) || 12;
              return (
                <div key={i} className="flex flex-col items-center justify-end h-full gap-1">
                  <span className="text-[10px] font-black text-yellow-500">{col.val}</span>
                  <div className="w-full bg-slate-950 border border-slate-900 rounded p-[1px] h-14 flex flex-col justify-end">
                    <div style={{ height: `${heightPct}%` }} className="w-full bg-yellow-500 rounded-sm transition-all" />
                  </div>
                  <span className="text-[8px] font-black text-slate-500 text-center uppercase">{col.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 bg-slate-900/20 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-inner">
          <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex justify-between items-center">
            <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-2">
              <Database className="w-4 h-4 text-yellow-500" /> RF_SDR_CAPTURES
            </h2>
          </div>
          <div className="overflow-auto max-h-[350px] custom-scrollbar text-xs">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-950 text-[9px] font-black text-slate-500 uppercase sticky top-0">
                <tr>
                  <th className="px-4 py-2.5">ALIAS</th>
                  <th className="px-4 py-2.5">FRECUENCIA</th>
                  <th className="px-4 py-2.5">PULSE STRING (RAW)</th>
                  <th className="px-4 py-2.5">TIMESTAMP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/40">
                {captures.map((c) => (
                  <tr key={c.id} className="hover:bg-yellow-500/5 transition-colors">
                    <td className="px-4 py-2 font-black text-slate-200">{c.alias}</td>
                    <td className="px-4 py-2 font-mono text-yellow-500 font-bold">{c.freq_mhz} MHz</td>
                    <td className="px-4 py-2 font-mono text-slate-500 truncate max-w-[180px]">{c.pulse_string}</td>
                    <td className="px-4 py-2 text-slate-500 font-bold text-[10px]">{c.date}</td>
                  </tr>
                ))}
                {captures.length === 0 && (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-[10px] text-slate-600 font-black uppercase">Frecuencias en calma. Esperando modulación OOK/FSK.</td>
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