import React, { useState, useEffect } from 'react';
import { Shield, Database, Clock, Fingerprint, Activity, Zap, Trash2 } from 'lucide-react';
const raspberryIp = window.location.hostname;
export default function DbRfid() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // 📡 Sincronización con la Base de Datos SQLite
  const fetchRfidData = async () => {
    try {
      const res = await fetch(`http://${raspberryIp}:8000/api/rfid/history`);
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("[-] Error en bus de datos RFID");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRfidData();
    const interval = setInterval(fetchRfidData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Estadísticas para las gráficas
  const totalCards = logs.length;
  const mifareCount = logs.filter(l => l.card_type?.includes('Mifare')).length;
  const hidCount = logs.filter(l => l.card_type?.includes('HID')).length;

  return (
    <div className="space-y-6 font-mono animate-fade-in pb-10">
      
      {/* 💀 BANNER DE MÓDULO // ESTRATEGIA MILITAR */}
      <div className="relative border-2 border-yellow-600/40 bg-slate-900/40 p-6 rounded-xl overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-1.5 bg-yellow-500 text-slate-950 text-[8px] font-black tracking-widest uppercase rounded-bl">
          DATA_VAULT // RFID_NFC
        </div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left space-y-2">
            <h1 className="text-2xl font-black text-slate-100 tracking-tighter uppercase">
              REPOSITORIO DE <span className="text-yellow-500">IDENTIDADES RFID</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-bold max-w-xl leading-relaxed uppercase">
              [ANALISIS DE CREDENCIALES] Registro de UIDs capturados mediante el driver SPI. 
              Permite la clonación posterior y el análisis de protocolos de proximidad.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-center min-w-[100px]">
              <div className="text-[9px] text-slate-500 font-black uppercase">Registros</div>
              <div className="text-xl font-black text-yellow-500">{totalCards}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-center min-w-[100px]">
              <div className="text-[9px] text-slate-500 font-black uppercase">Estado</div>
              <div className="text-xs font-black text-emerald-500 animate-pulse uppercase">Sync_OK</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 📊 GRÁFICA DE DISTRIBUCIÓN DE PROTOCOLOS */}
        <div className="lg:col-span-1 bg-slate-900/20 border border-slate-800 rounded-xl p-5 space-y-6">
          <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-2 border-b border-slate-800 pb-3">
            <Activity className="w-4 h-4 text-yellow-500" /> MÉTRICAS DE CAPTURA
          </h2>
          
          <div className="space-y-4">
            {[
              { label: 'Mifare / ISO14443', count: mifareCount, color: 'bg-yellow-500' },
              { label: 'HID Prox / 125kHz', count: hidCount, color: 'bg-amber-600' },
              { label: 'Otros / Desconocidos', count: totalCards - (mifareCount + hidCount), color: 'bg-slate-700' }
            ].map((bar, i) => {
              const pct = totalCards > 0 ? (bar.count / totalCards) * 100 : 0;
              return (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-black uppercase">
                    <span className="text-slate-400">{bar.label}</span>
                    <span className="text-slate-100">{bar.count}</span>
                  </div>
                  <div className="h-2 bg-slate-950 rounded-full border border-slate-800 p-[1px]">
                    <div style={{ width: `${pct}%` }} className={`h-full ${bar.color} rounded-full transition-all duration-700`} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-yellow-500/5 border border-yellow-500/10 rounded-lg">
             <p className="text-[9px] text-yellow-500/70 font-bold leading-relaxed italic uppercase text-center">
               "El análisis de UIDs permite detectar patrones en sistemas de control de acceso vulnerables."
             </p>
          </div>
        </div>

        {/* 📋 TABLA DE DATOS CRUDA */}
        <div className="lg:col-span-2 bg-slate-900/20 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-inner">
          <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex justify-between items-center">
            <h2 className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-2">
              <Database className="w-4 h-4 text-yellow-500" /> REGISTROS SQLITE_LATEST
            </h2>
            <button onClick={fetchRfidData} className="p-1.5 hover:bg-slate-800 rounded transition-colors cursor-pointer">
              <Zap className="w-3.5 h-3.5 text-yellow-500" />
            </button>
          </div>

          <div className="flex-1 overflow-auto max-h-[400px] custom-scrollbar">
            {loading ? (
              <div className="p-10 text-center text-[10px] font-black text-slate-600 animate-pulse uppercase">Interrogando base de datos...</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-950 text-[9px] font-black uppercase text-slate-500 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">UID HEX</th>
                    <th className="px-4 py-3">PROTOCOLO</th>
                    <th className="px-4 py-3">FECHA/HORA</th>
                    <th className="px-4 py-3 text-right">ACCION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-yellow-500/5 transition-colors group">
                      <td className="px-4 py-3 text-[10px] font-bold text-slate-500">#{log.id}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-black text-yellow-500 tracking-wider font-mono bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">
                          {log.uid}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-[10px] font-black text-slate-300 uppercase">
                          <Fingerprint className="w-3 h-3 text-slate-500" /> {log.card_type}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-[9px] font-bold text-slate-500 uppercase">
                          <Clock className="w-3 h-3" /> {log.date}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button className="p-1.5 text-slate-600 hover:text-red-500 transition-colors cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-10 text-center text-[10px] font-black text-slate-600 uppercase">No se han detectado tramas RFID en el bus SPI.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}