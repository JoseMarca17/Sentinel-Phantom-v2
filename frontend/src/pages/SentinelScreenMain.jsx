// src/pages/SentinelScreenMain.jsx
import React, { useState, useCallback } from 'react';
import SentinelShell from '../components/screen/SentinelShell';
import PhantomBotDynamic from '../components/screen/PhantomBotDynamic';
import SubScreenIr from '../components/screen/SubScreenIr';
import SubScreenRfid from '../components/screen/SubScreenRfid';
import SubScreenNrf from '../components/screen/SubScreenNrf';
import SubScreenSubghz from '../components/screen/SubScreenSubghz';
import SubScreenWifi from '../components/screen/SubScreenWifi';

const MODS = [
  { id: 'ir', name: 'IR', full: 'INFRARROJO IR', sub: 'TV-B-GONE / RAW INJECT', status: 'ONLINE' },
  { id: 'rfid', name: 'RFID', full: 'RFID PN532', sub: '13.56MHZ CLONER', status: 'ONLINE' },
  { id: 'subghz', name: 'SUB-GHZ', full: 'CC1101 SUB-GHZ', sub: '433MHZ REPLAY NODE', status: 'OFFLINE' },
  { id: 'wifi', name: 'WI-FI', full: 'RT5370 WI-FI', sub: 'MONITOR / DEAUTH', status: 'OFFLINE' },
  { id: 'bt', name: 'BT BLE', full: 'BLUETOOTH BLE', sub: 'BEACON SNIFFER', status: 'ONLINE' },
  { id: 'nrf', name: 'NRF24', full: 'NRF24 TRANSCEIVER', sub: '2.4GHZ SPECTRUM', status: 'ONLINE' },
];

const ModuleIcon = ({ id, active }) => {
  const stroke = active ? "#201000" : "rgba(32, 16, 0, 0.15)";
  const icons = {
    ir: (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round">
        <path d="M5 12h2M17 12h2M12 5v2M12 17v2"/><circle cx="12" cy="12" r="3"/>
        <path d="M7.05 7.05a7 7 0 0 0 0 9.9M16.95 7.05a7 7 0 0 1 0 9.9"/>
      </svg>
    ),
    rfid: (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M6 13h12M6 16h8"/>
      </svg>
    ),
    subghz: (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round">
        <path d="M2 8l10 5 10-5-10-5zM2 13l10 5 10-5M2 18l10 5 10-5"/>
      </svg>
    ),
    wifi: (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round">
        <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1.5" fill={stroke}/>
      </svg>
    ),
    bt: (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round">
        <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"/>
      </svg>
    ),
    nrf: (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M12 13v5M9 15h6M12 6a3 3 0 0 1 3 3M12 3a6 6 0 0 1 6 6" />
      </svg>
    ),
  };
  return icons[id] || null;
};

export default function SentinelScreenMain() {
  const [booted, setBooted] = useState(false);
  const [inModule, setInModule] = useState(false);
  const [idx, setIdx] = useState(0);
  const [actionPayload, setActionPayload] = useState(null);

  const handleAction = useCallback((action) => {
    if (!booted) {
      if (action === 'OK') setBooted(true);
      return;
    }
    if (action === 'BACK' && inModule) {
      setInModule(false); setActionPayload(null); return;
    }
    if (inModule) {
      setActionPayload({ type: action, timestamp: Date.now() });
      setTimeout(() => setActionPayload(null), 0); return; 
    }
    switch(action) {
      case 'UP': case 'LEFT': setIdx(p => (p - 1 + MODS.length) % MODS.length); break;
      case 'DOWN': case 'RIGHT': setIdx(p => (p + 1) % MODS.length); break;
      case 'OK': setInModule(true); break;
      default: break;
    }
  }, [booted, inModule, idx]);

  const activeMod = MODS[idx];
  const visibleCards = [-1, 0, 1].map(off => ({
    ...MODS[(idx + off + MODS.length) % MODS.length], off,
  }));

  // FIX CRÍTICO: Forzamos el color de fondo sepia plano en el Inline Style para anular a SentinelShell
  const lcdStyle = {
    backgroundColor: '#ff9f1a',
    color: '#201000',
  };

  return (
    <SentinelShell onAction={handleAction} booted={booted} statusText={inModule ? "MOD_ACTIVE" : "MAIN_HUB"}>
      {!booted ? (
        <div className="flex-1 flex flex-col items-center justify-between p-4 relative overflow-hidden" style={lcdStyle}>
          {/* Scanline Effect */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(32,16,0,1) 1px, transparent 1px)', backgroundSize: '100% 3px' }} />
          
          <div className="w-full flex justify-between text-[8px] font-black opacity-40 border-b border-[#201000]/20 pb-1 uppercase tracking-tighter">
            <span>RAM: 512KB</span><span>SENTINEL_BOOT_v2</span>
          </div>

          <div className="w-32 h-32 sm:w-44 sm:h-44 my-auto relative">
             <PhantomBotDynamic />
          </div>

          <div className="text-center space-y-1">
            <h1 className="text-2xl sm:text-3xl font-black tracking-[10px] uppercase">SENTINEL</h1>
            <div className="inline-block bg-[#201000] text-[#fff3dd] px-4 py-0.5 text-[10px] font-black tracking-[4px] rounded-sm">PHANTOM_OS</div>
          </div>

          <div className="w-full pt-2 mt-4 text-center border-t border-[#201000]/10">
            <span className="text-[9px] font-black tracking-widest animate-pulse">[ PRESS EXE TO START ]</span>
          </div>
        </div>
      ) : inModule && activeMod.id === 'ir' ? ( <SubScreenIr lastAction={actionPayload} />
      ) : inModule && activeMod.id === 'rfid' ? ( <SubScreenRfid lastAction={actionPayload} />
      ) : inModule && activeMod.id === 'nrf' ? ( <SubScreenNrf lastAction={actionPayload} />
      ) : inModule && activeMod.id === 'subghz' ? ( <SubScreenSubghz lastAction={actionPayload} />
      ) : inModule && activeMod.id === 'wifi' ? ( <SubScreenWifi lastAction={actionPayload} />
      ) : (
        <div className="flex-1 flex flex-col p-3 sm:p-5 justify-between h-full relative" style={lcdStyle}>
          {/* Malla de Píxeles de Fondo */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(#201000 0.5px, transparent 0.5px)', backgroundSize: '8px 8px' }} />

          <div className="flex justify-between items-end border-b-2 border-[#201000] pb-1">
            <span className="text-[10px] font-black tracking-tighter uppercase">Bus_Hardware_Explorer</span>
            <span className="text-[10px] font-black">{idx + 1}/{MODS.length}</span>
          </div>

          {/* Área Central */}
          <div className="flex-1 flex items-center justify-center relative my-4">
             <div className="hidden sm:block absolute left-4 opacity-10 w-16 h-16">
                <ModuleIcon id={visibleCards[0].id} active={false} />
             </div>

             <div className="relative w-28 h-28 sm:w-40 sm:h-40 flex items-center justify-center">
                <div className="absolute -top-3 -left-3 w-5 h-5 border-t-4 border-l-4 border-[#201000]" />
                <div className="absolute -top-3 -right-3 w-5 h-5 border-t-4 border-r-4 border-[#201000]" />
                <div className="absolute -bottom-3 -left-3 w-5 h-5 border-b-4 border-l-4 border-[#201000]" />
                <div className="absolute -bottom-3 -right-3 w-5 h-5 border-b-4 border-r-4 border-[#201000]" />
                
                <div className="w-full h-full p-2 animate-in zoom-in-95 duration-150">
                  <ModuleIcon id={activeMod.id} active={true} />
                </div>
             </div>

             <div className="hidden sm:block absolute right-4 opacity-10 w-16 h-16">
                <ModuleIcon id={visibleCards[2].id} active={false} />
             </div>
          </div>

          {/* Datos del Módulo */}
          <div className="space-y-1 relative z-10">
            <div className="flex items-center gap-2">
              <span className="bg-[#201000] text-[#fff3dd] text-[10px] font-black px-2 py-0.5 rounded-sm tracking-widest uppercase">{activeMod.name}</span>
              <div className="h-[2px] flex-1 bg-[#201000]/20" />
            </div>
            
            {/* Cambiado bg-black/5 a una opacidad pura del color sepia oscuro */}
            <div className="p-2 border-2 border-[#201000] bg-[#201000]/5 rounded-sm">
              <h3 className="text-xs sm:text-sm font-black truncate">{activeMod.full}</h3>
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold opacity-60 italic">{activeMod.sub}</span>
                <span className={`text-[8px] font-black px-1.5 py-0.5 border border-[#201000] rounded-sm ${
                  activeMod.status === 'OFFLINE' ? 'bg-[#201000] text-[#fff3dd]' : 'bg-transparent text-[#201000]'
                }`}>
                  {activeMod.status}
                </span>
              </div>
            </div>
          </div>

        </div>
      )}
    </SentinelShell>
  );
}