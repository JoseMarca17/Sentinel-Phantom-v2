import React, { useState, useEffect, useRef } from 'react';

export default function SubScreenIr({ lastAction }) {
  const [view, setView] = useState('menu');
  const [selectedIdx, setSelectedIdx] = useState(0);
  
  // Guardamos el milisegundo exacto en el que este componente aparece en pantalla
  const mountTimeRef = useRef(Date.now());
  const lastTimestampRef = useRef(null);

  const menuOptions = [
    { id: 'sniff', label: "SNIFFER / CAPTURE", icon: "📡" },
    { id: 'saved', label: "SAVED SIGNALS", icon: "💾" },
    { id: 'tvbgone', label: "TV-B-GONE (ATTACK)", icon: "💥" },
    { id: 'camera', label: "CAMERA DETECT", icon: "📷" }
  ];

  const savedSignals = [
    { name: "SONY_TV_PWR", proto: "SONY", code: "0xA90", date: "23/05 14:20" },
    { name: "AC_OFF_GEN", proto: "RAW", code: "PULSE_230", date: "22/05 09:15" },
    { name: "LG_MONITOR", proto: "NEC", code: "0x20DF10EF", date: "20/05 18:45" }
  ];

  useEffect(() => {
    // 1. Si no hay acción, no hacemos nada
    if (!lastAction) return;

    // 2. FILTRO CRÍTICO: Si el comando ocurrió ANTES de que se abra este módulo, lo ignoramos.
    // Esto evita que el "OK" usado para entrar al módulo se ejecute aquí adentro.
    if (lastAction.timestamp < mountTimeRef.current) return;

    // 3. Evitamos procesar dos veces el mismo evento exacto
    if (lastAction.timestamp === lastTimestampRef.current) return;
    lastTimestampRef.current = lastAction.timestamp;

    const { type } = lastAction;

    if (view === 'menu') {
      switch (type) {
        case 'UP':
        case 'LEFT':
          setSelectedIdx(p => (p - 1 + menuOptions.length) % menuOptions.length);
          break;
        case 'DOWN':
        case 'RIGHT':
          setSelectedIdx(p => (p + 1) % menuOptions.length);
          break;
        case 'OK':
          setView(menuOptions[selectedIdx].id);
          break;
        default:
          break;
      }
    } else {
      // Si estás dentro de una sub-vista, BACK te regresa al menú interno de IR
      if (type === 'BACK') {
        setView('menu');
      }
    }
  }, [lastAction, view, selectedIdx, menuOptions.length]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', color: '#201000', padding: '25px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '3px solid #201000', paddingBottom: '8px', marginBottom: '15px', fontWeight: '900' }}>
        <span>IR_MODULE</span>
        <span style={{ background: '#201000', color: '#ff9f1a', padding: '0 6px', borderRadius: '3px' }}>{view.toUpperCase()}</span>
      </div>

      {view === 'menu' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {menuOptions.map((opt, i) => (
            <div key={opt.id} style={{
                padding: '12px',
                background: i === selectedIdx ? '#201000' : 'transparent',
                color: i === selectedIdx ? '#ff9f1a' : '#201000',
                border: '2px solid #201000',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '900',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
            }}>
              <span>{opt.icon}</span>
              <span style={{ flex: 1 }}>{opt.label}</span>
              {i === selectedIdx && <span>◄</span>}
            </div>
          ))}
        </div>
      )}

      {view === 'sniff' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', animation: 'pulse 1s infinite' }}>📡</div>
          <h3 style={{ fontWeight: '900', margin: '10px 0' }}>AWAITING SIGNAL...</h3>
          <p style={{ fontSize: '11px', opacity: 0.8 }}>GPIO 26 RX ACTIVE</p>
          <div style={{ marginTop: '30px', fontSize: '11px', fontWeight: 'bold', border: '1.5px dashed #201000', padding: '8px 20px' }}>PRESS BACK TO ABORT</div>
        </div>
      )}

      {view === 'saved' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
          {savedSignals.map((sig, i) => (
            <div key={i} style={{ padding: '10px', border: '2px solid #201000', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '13px', fontWeight: '900' }}>{sig.name}</span>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>{sig.date} | {sig.proto}</span>
              </div>
              <span style={{ fontSize: '11px', fontWeight: '900', background: '#201000', color: '#ff9f1a', padding: '4px 8px', borderRadius: '4px' }}>EXE</span>
            </div>
          ))}
        </div>
      )}

      {view === 'tvbgone' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '50px' }}>💥</div>
          <h2 style={{ fontWeight: '900', color: '#b00', margin: '10px 0' }}>ATTACK RUNNING</h2>
          <p style={{ fontSize: '11px', textAlign: 'center' }}>FLOODING TRANSMITTER WITH POWER CODES</p>
        </div>
      )}

      {view === 'camera' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '50px' }}>📷</div>
          <h2 style={{ fontWeight: '900', margin: '10px 0' }}>CAMERA DETECT</h2>
          <p style={{ fontSize: '11px', textAlign: 'center', opacity: 0.7 }}>NOT IMPLEMENTED YET</p>
        </div>
      )}
    </div>
  );
}