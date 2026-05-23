// frontend/src/pages/DbRfid.jsx
import React from 'react';
import { Shield, Clock, Trash2 } from 'lucide-react';

export default function DbRfid() {
  // Datos ejemplo de lo que se lee en SQLite
  const capturedCards = [
    { id: 1, uid: "A2:3B:C9:D1", type: "Mifare Classic 1K", time: "23-05-2026 14:22" },
    { id: 2, uid: "F8:E0:44:B5", type: "NFC Type 2 Tag", time: "23-05-2026 11:05" },
    { id: 3, uid: "04:11:8F:A2", type: "Mifare Desfire", time: "22-05-2026 18:40" },
  ];

  return (
    <div className="space-y-6 font-mono">
      <div>
        <h1 className="text-xl font-black tracking-widest text-slate-100 uppercase">
          DATABASE MANAGER <span className="text-yellow-400">// RFID_LOGS</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">Registros históricos persistidos en SQLite recolectados por el lector físico PN532.</p>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/80 text-[10px] font-black tracking-widest text-slate-400 uppercase">
              <th className="p-4">ID</th>
              <th className="p-4">UID CAPTURADO</th>
              <th className="p-4">TIPO DE CREDENCIAL</th>
              <th className="p-4">TIMESTAMP</th>
              <th className="p-4 text-center">ACCIONES</th>
            </tr>
          </thead>
          <tbody className="text-xs font-medium text-slate-300 divide-y divide-slate-900">
            {capturedCards.map((card) => (
              <tr key={card.id} className="hover:bg-slate-900/30 transition-colors">
                <td className="p-4 font-bold text-slate-600">#{card.id}</td>
                <td className="p-4 font-black text-yellow-400 tracking-wider">{card.uid}</td>
                <td className="p-4 text-slate-400">{card.type}</td>
                <td className="p-4 text-slate-500 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {card.time}</td>
                <td className="p-4 text-center">
                  <button className="p-1.5 bg-red-950/40 hover:bg-red-900 border border-red-900/50 rounded-lg text-red-400 transition-colors cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
