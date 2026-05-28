import React from 'react';
import { Bluetooth, ShieldAlert } from 'lucide-react';

export default function DbBluetooth() {
  return (
    <div className="space-y-6 font-mono pb-10">
      <div className="relative border-2 border-slate-800 bg-slate-900/10 p-6 rounded-xl overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-1.5 bg-slate-800 text-slate-400 text-[8px] font-black tracking-widest uppercase rounded-bl">
          BLE_VAULT // EXPANSION_SLOT
        </div>
        <div className="text-center md:text-left space-y-2">
          <h1 className="text-2xl font-black text-slate-400 uppercase tracking-tighter">
            LOGS DE DISPOSITIVOS <span className="text-slate-600">BLUETOOTH BLE</span>
          </h1>
          <p className="text-[10px] text-slate-500 font-bold max-w-xl leading-relaxed uppercase">
            [DRIVER UNLINKED] Repositorio reservado para tramas de publicidad e identificadores MAC de balizas de rastreo y periféricos de bajo consumo.
          </p>
        </div>
      </div>

      <div className="p-12 border border-dashed border-slate-800 rounded-xl bg-slate-950/40 text-center space-y-3">
        <div className="inline-flex p-4 bg-slate-900 border border-slate-800 rounded-full text-slate-600">
          <Bluetooth className="w-6 h-6 animate-pulse" />
        </div>
        <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Módulo de Expansión de Capa Física Inactiva</h3>
        <p className="text-[10px] text-slate-500 max-w-sm mx-auto leading-relaxed uppercase font-bold">
          [!] REQUIERE TRANSCEPTOR USB CSR4.0 COMPATIBLE CON BLUEZ. EL SUBSISTEMA NO HA SIDO ENLAZADO EN EL KERNEL TÁCTICO POR AHORA.
        </p>
      </div>
    </div>
  );
}