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
  const stroke = active ? "#201000" : "rgba(32,16,0,0.2)";
  const icons = {
    ir: (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round">
        <path d="M5 12h2M17 12h2M12 5v2M12 17v2"/><circle cx="12" cy="12" r="3"/>
        <path d="M7.05 7.05a7 7 0 0 0 0 9.9M16.95 7.05a7 7 0 0 1 0 9.9"/>
      </svg>
    ),
    rfid: (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round">
        <rect x="3" y="6" width="18" height="13" rx="2"/><path d="M7 10h.01M7 14h10M7 17h5"/>
      </svg>
    ),
    subghz: (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round">
        <path d="M3 7l9 5 9-5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5"/>
      </svg>
    ),
    wifi: (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round">
        <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1.5" fill={stroke}/>
      </svg>
    ),
    bt: (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round">
        <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"/>
      </svg>
    ),
    nrf: (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M12 13v5M9 15h6M12 6a3 3 0 0 1 3 3M12 3a6 6 0 0 1 6 6" />
        <circle cx="12" cy="9" r="1" fill={stroke} />
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
      setInModule(false);
      setActionPayload(null); 
      return;
    }

    if (inModule) {
      setActionPayload({ type: action, timestamp: Date.now() });
      setTimeout(() => setActionPayload(null), 0);
      return; 
    }

    switch(action) {
      case 'UP': case 'LEFT':
        setIdx(p => (p - 1 + MODS.length) % MODS.length);
        break;
      case 'DOWN': case 'RIGHT':
        setIdx(p => (p + 1) % MODS.length);
        break;
      case 'OK':
        if (['ir', 'rfid', 'nrf', 'subghz', 'wifi'].includes(MODS[idx].id)) {
          setActionPayload(null); 
          setInModule(true);
        }
        break;
      default: break;
    }
  }, [booted, inModule, idx]);

  const activeMod = MODS[idx];
  const visibleCards = [-1, 0, 1].map(off => ({
    ...MODS[(idx + off + MODS.length) % MODS.length], off,
  }));

  return (
    <SentinelShell onAction={handleAction} booted={booted} statusText={inModule ? "RUNNING_MOD" : "MAIN_MENU"}>
      {!booted ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#201000] p-4 text-center">
          <div className="w-20 h-20 sm:w-24 sm:h-24"><PhantomBotDynamic /></div>
          <h2 className="tracking-[4px] text-lg sm:text-xl font-black my-2">PHANTOM OS</h2>
          <p className="text-[9px] font-black opacity-60 animate-pulse">[ PRESS EXE / OK TO INITIALIZE ]</p>
        </div>
      ) : inModule && activeMod.id === 'ir' ? (
        <SubScreenIr lastAction={actionPayload} />
      ) : inModule && activeMod.id === 'rfid' ? (
        <SubScreenRfid lastAction={actionPayload} />
      ) : inModule && activeMod.id === 'nrf' ? (
        <SubScreenNrf lastAction={actionPayload} />
      ) : inModule && activeMod.id === 'subghz' ? (
        <SubScreenSubghz lastAction={actionPayload} />
      ) : inModule && activeMod.id === 'wifi' ? (
        <SubScreenWifi lastAction={actionPayload} />
      ) : (
        <div className="flex-1 flex flex-col p-4 text-[#201000] justify-between h-full min-h-[260px]">
          
          <div className="flex justify-between text-[10px] border-b border-[#201000] pb-1 font-black">
            <span>SELECT_HARDWARE_BUS</span>
            <span>{idx + 1} / {MODS.length}</span>
          </div>

          {/* Carrusel Flex Responsivo Elástico */}
          <div className="flex items-center justify-center gap-2 sm:gap-6 my-2 overflow-hidden py-1">
            {visibleCards.map(({ id, name, off }) => {
              const active = off === 0;
              return (
                <div 
                  key={id} 
                  className={`flex flex-col items-center transition-all duration-300 transform ${
                    active ? 'scale-110 opacity-100 w-16 h-16 sm:w-20 sm:h-20' : 'scale-75 opacity-20 w-10 h-10 sm:w-14 sm:h-14'
                      }`}
                >
                  <div className="w-full h-full"><ModuleIcon id={id} active={active} /></div>
                  {active && (
                    <span className="text-[9px] font-black mt-1 bg-[#201000] text-[#ff9f1a] px-1.5 py-0.5 rounded tracking-wide uppercase truncate max-w-full">
                      {name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tarjeta de Especificación de la Subpantalla */}
          <div className="p-2.5 border border-[#201000] rounded-lg bg-black/5 space-y-0.5">
            <div className="text-xs sm:text-sm font-black truncate">{activeMod.full}</div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-[9px] font-bold opacity-80 truncate">{activeMod.sub}</span>
              <div className="flex items-center gap-1 shrink-0">
                <div className={`w-1.5 h-1.5 rounded-full ${activeMod.status === 'OFFLINE' ? 'bg-red-700' : 'bg-[#201000]'}`} />
                <span className="text-[9px] font-black uppercase tracking-wider">{activeMod.status}</span>
              </div>
            </div>
          </div>

        </div>
      )}
    </SentinelShell>
  );
}