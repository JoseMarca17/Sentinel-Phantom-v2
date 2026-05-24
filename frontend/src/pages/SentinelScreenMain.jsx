import React, { useState, useCallback, useEffect } from 'react';
import SentinelShell from '../components/screen/SentinelShell';
import PhantomBotDynamic from '../components/screen/PhantomBotDynamic';
import SubScreenIr from '../components/screen/SubScreenIr';
import SubScreenRfid from '../components/screen/SubScreenRfid';
import SubScreenNrf from '../components/screen/SubScreenNrf';
import SubScreenSubghz from '../components/screen/SubScreenSubghz';

const MODS = [
  { id: 'ir', name: 'IR', full: 'INFRARROJO IR', sub: 'TV-B-GONE / RAW INJECT', status: 'ONLINE' },
  { id: 'rfid', name: 'RFID', full: 'RFID PN532', sub: '13.56MHZ MIFARE CLONER', status: 'ONLINE' },
  { id: 'subghz', name: 'SUB-GHZ', full: 'CC1101 SUB-GHZ', sub: '433MHZ REPLAY NODE', status: 'OFFLINE' },
  { id: 'wifi', name: 'WI-FI', full: 'RT5370 WI-FI', sub: 'MONITOR / DEAUTH MODE', status: 'OFFLINE' },
  { id: 'bt', name: 'BT BLE', full: 'BLUETOOTH BLE', sub: 'BEACON SNIFFER', status: 'ONLINE' },
  { id: 'nrf', name: 'NRF24', full: 'NRF24 TRANSCEIVER', sub: '2.4GHZ SPECTRUM / HID', status: 'ONLINE' }, // 🛠️ SUSTITUIDO NFC POR NRF24
];

const ModuleIcon = ({ id, active }) => {
  const stroke = active ? "#201000" : "rgba(32,16,0,0.2)";
  const icons = {
    ir: (
      <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round">
        <path d="M5 12h2M17 12h2M12 5v2M12 17v2"/><circle cx="12" cy="12" r="3"/>
        <path d="M7.05 7.05a7 7 0 0 0 0 9.9M16.95 7.05a7 7 0 0 1 0 9.9"/>
      </svg>
    ),
    rfid: (
      <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round">
        <rect x="3" y="6" width="18" height="13" rx="2"/><path d="M7 10h.01M7 14h10M7 17h5"/>
      </svg>
    ),
    subghz: (
      <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round">
        <path d="M3 7l9 5 9-5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5"/>
      </svg>
    ),
    wifi: (
      <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round">
        <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1.5" fill={stroke}/>
      </svg>
    ),
    bt: (
      <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round">
        <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"/>
      </svg>
    ),
    nrf: (
      /* 🛠️ NUEVO ICONO VECTORIAL TÁCTICO PARA EL TRANSCEPTOR NRF24L01+ */
      <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
      setTimeout(() => {
        setActionPayload(null);
      }, 0);
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
        // 🛠️ ACOPLAMIENTO DE LA BANDERA DE INYECCIÓN UNIFICADA CON EL ID 'nrf'
        if (MODS[idx].id === 'ir' || MODS[idx].id === 'rfid' || MODS[idx].id === 'nrf' || MODS[idx].id === 'subghz') {
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#201000' }}>
          <PhantomBotDynamic />
          <h2 style={{ letterSpacing: '6px', fontSize: '28px', fontWeight: '900', margin: '15px 0 5px 0' }}>PHANTOM OS</h2>
          <p style={{ fontSize: '11px', fontWeight: 'bold', opacity: 0.6 }}>[ PRESS EXE TO INITIALIZE ]</p>
        </div>
      ) : inModule && activeMod.id === 'ir' ? (
        <SubScreenIr lastAction={actionPayload} />
      ) : inModule && activeMod.id === 'rfid' ? (
        <SubScreenRfid lastAction={actionPayload} />
      ) : inModule && activeMod.id === 'nrf' ? (
        <SubScreenNrf lastAction={actionPayload} />
      ) : inModule && activeMod.id === 'subghz'?(
        <SubScreenSubghz lastAction={actionPayload} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '25px', color: '#201000', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '3px solid #201000', paddingBottom: '8px', fontWeight: '900' }}>
            <span>SELECT_HARDWARE_BUS</span>
            <span>{idx + 1} / {MODS.length}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '35px', margin: '20px 0' }}>
            {visibleCards.map(({ id, name, off }) => {
              const active = off === 0;
              return (
                <div key={id} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  opacity: active ? 1 : 0.2, transform: active ? 'scale(1.4)' : 'scale(0.85)',
                  transition: 'all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                }}>
                  <div style={{ width: '80px', height: '80px' }}>
                    <ModuleIcon id={id} active={active} />
                  </div>
                  {active && (
                    <span style={{ fontSize: '13px', fontWeight: '900', marginTop: '10px', background: '#201000', color: '#ff9f1a', padding: '2px 8px', borderRadius: '3px' }}>
                      {name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '15px', border: '3px solid #201000', borderRadius: '12px', background: 'rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '18px', fontWeight: '900' }}>{activeMod.full}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', opacity: 0.8 }}>{activeMod.sub}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ 
                  width: '8px', height: '8px', borderRadius: '50%', 
                  background: activeMod.status === 'OFFLINE' ? '#a00' : '#201000'
                }} />
                <span style={{ fontSize: '11px', fontWeight: '900' }}>{activeMod.status}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </SentinelShell>
  );
}