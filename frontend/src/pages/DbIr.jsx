import React, { useState, useEffect } from 'react';
import { Zap, Database, Clock, Activity, Cpu } from 'lucide-react';

export default function DbIr() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchIr = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/ir/signals");
      if (res.ok) {
        const data = await res.json();
        setSignals(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.log("[-] Error en bus IR");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIr();
    const interval = setInterval(fetchIr, 5000);
    return () => clearInterval(interval);
  }, []);

  const necCount = signals.filter(s => s.protocol?.toUpperCase().includes('NEC')).length;

  return (
    <div className="space-y-6 font-mono pb-10">
      <div className="relative border-2 border-yellow-600/40 bg-slate-900/40 p-6 rounded-xl overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-1.5 bg-yellow-500 text-slate-950 text-[8px] font-black tracking-widest uppercase rounded-bl">
          OPTICAL_VAULT // INFRARED_BUS
        </div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left space-y-2">
            <h1 className="text-2xl font-black text-slate-100 uppercase tracking-tighter">
              REPOSITORIO DE <span className="text-yellow-500">CÓDIGOS INFRARROJOS</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-bold max-w-xl leading-relaxed uppercase">
              [INFRARED DECODING] Almacén de tramas y protocolos capturados en el pin GPIO 26 (Comandos de TV, aire acondicionado, sistemas multimedia).
            </p>
          </div>
          <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-center min-w-[90px]">
            <div className="text-[9px] text-slate-500 font-black uppercase">Códigos</div>
            <div className="text-lg font-black text-yellow-500">{signals.length}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-slate-900/20 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-2 border-b border-slate-900 pb-3">
              <Activity className="w-4 h-4 text-yellow-500" /> HISTOGRAMA DE PROTOCOLOS
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between text-[10px] font-black">
                <span className="text-slate-400">Protocolo NEC Nv.3</span>
                <span className="text-slate-200">{necCount}</span>
              </div>
              <div className="h-2 w-full bg-slate-950 rounded-full border border-slate-800 p-[1px]">
                <div style={{ width: `${signals.length > 0 ? (necCount / signals.length) * 100 : 0}%` }} className="h-full bg-yellow-500 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-slate-900/20 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-inner">
          <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex justify-between items-center">
            <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-2">
              <Database className="w-4 h-4 text-yellow-500" /> IR_CAPTURED_CODES
            </h2>
          </div>
          <div className="overflow-auto max-h-[350px] custom-scrollbar text-xs">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-950 text-[9px] font-black text-slate-500 uppercase sticky top-0">
                <tr>
                  <th className="px-4 py-2.5">ID</th>
                  <th className="px-4 py-2.5">PROTOCOLO</th>
                  <th className="px-4 py-2.5">CÓDIGO HEX</th>
                  <th className="px-4 py-2.5">BITS</th>
                  <th className="px-4 py-2.5">FECHA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/40">
                {signals.map((s) => (
                  <tr key={s.id} className="hover:bg-yellow-500/5 transition-colors">
                    <td className="px-4 py-2 text-slate-500 font-bold">#{s.id}</td>
                    <td className="px-4 py-2 font-black text-slate-300 uppercase flex items-center gap-1"><Cpu className="w-3 h-3 text-slate-600" /> {s.protocol}</td>
                    <td className="px-4 py-2 font-mono text-yellow-400 font-bold bg-yellow-500/5 rounded border border-yellow-500/10 inline-block mt-1">{s.code}</td>
                    <td className="px-4 py-2 text-slate-400 font-bold">{s.bits} bits</td>
                    <td className="px-4 py-2 text-slate-500 font-bold text-[10px]">{s.date}</td>
                  </tr>
                ))}
                {signals.length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-[10px] text-slate-600 font-black uppercase">Bus óptico inactivo. Esperando demodulación IR...</td>
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