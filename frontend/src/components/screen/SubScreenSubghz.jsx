import React, { useState, useEffect, useRef } from 'react';

export default function SubScreenSubghz({ lastAction }) {
  const [view, setView] = useState('menu');
  const [selectedIdx, setSelectedIdx] = useState(0);
  
  // Terminales de telemetría interna del bus CC1101
  const [c2Log, setC2Log] = useState("[C2] Awaiting CC1101 bus directives...");
  const [fwLog, setFwLog] = useState("[CC1101 RX] Demodulador OOK listo.");

  const [isProcessing, setIsProcessing] = useState(false);
  const [executionStatus, setExecutionStatus] = useState(null);
  
  // Canales canónicos definidos en tu archivo de cabecera .h
  const availableFreqs = [433.92, 315.0, 868.0, 915.0, 304.25];
  const [freqIdx, setFreqIdx] = useState(0);
  
  // Estados para el visor indexado de la base de datos SQLAlchemy
  const [savedSignals, setSavedSignals] = useState([]);
  const [dbIdx, setDbIdx] = useState(0);

  const [modal, setModal] = useState({ visible: false, title: '', message: '', extra: '' });

  const lastTimestampRef = useRef(null);
  const mountTimeRef = useRef(Date.now());
  
  // Ref elástica para evitar closures en los hilos asíncronos del WebSocket
  const viewRef = useRef('menu');
  useEffect(() => { viewRef.current = view; }, [view]);

  const menuOptions = [
    { id: 'select_freq', label: "SNIFFER / CAPTURE RAW", icon: "📡" },
    { id: 'view_clones', label: "VIEW SAVED CLONES", icon: "💾" },
    { id: 'scan_freqs', label: "DISCOVER ACTIVE RF", icon: "🔍" },
    { id: 'jam_opt', label: "BURST NOISE GENERATOR", icon: "🔥" }
  ];

  // 🗄️ CONSULTA SÍNCRONA A TU API DE HISTORIAL (SQLAlchemy)
  const fetchSavedClones = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/subghz/history");
      const data = await res.json();
      setSavedSignals(data);
      setC2Log(`[C2 DB] Sincronizados ${data.length} clones desde SQLAlchemy.`);
    } catch (err) {
      setC2Log("[C2 ERR] Error de enlace con el pool del ORM.");
    }
  };

  const sendCommand = async (cmd, extraParams = {}) => {
    setIsProcessing(true);
    setExecutionStatus(
      cmd === "SCAN" ? "SCANNING RSSI..." : 
      cmd === "CAPTURE" ? "LISTENING RAW..." : "INJECTING WAVE..."
    );
    try {
      await fetch("http://127.0.0.1:8000/api/subghz/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd, ...extraParams })
      });
    } catch (err) {
      setIsProcessing(false);
      setC2Log("[C2 CRITICAL] Conexión rechazada en el bus de red.");
    }
  };

  // Disparadores de carga según la sub-pantalla activa
  useEffect(() => {
    if (view === 'view_clones') fetchSavedClones();
    if (view === 'scan_freqs') sendCommand("SCAN");
    if (view === 'jam_opt') sendCommand("JAM", { freq_mhz: availableFreqs[freqIdx], duration_ms: 2500 });
  }, [view]);

  // 📡 RECEPTOR CENTRAL DE EVENTOS WEBSOCKET (CC1101)
  useEffect(() => {
    const ws = new WebSocket("ws://127.0.0.1:8000/ws/control");
    
    ws.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data);
        if (packet.module === "SUBGHZ") {
          const payload = packet.data;
          setFwLog(`[CC1101 RX] ${JSON.stringify(payload)}`);
          
          const currentView = viewRef.current;

          // Si el driver reporta que la ISR guardó la señal en SQLite
          if (payload.event === "CAPTURE_SUCCESS" && currentView === 'capture_mode') {
            setIsProcessing(false);
            setModal({
              visible: true,
              title: 'SIGNAL INTERCEPTED',
              message: `AUTO-SAVED TO ORM`,
              extra: `FREQ: ${payload.freq_mhz} MHz | PULSOS: ${payload.count}`
            });
            fetchSavedClones(); // Refrescamos el buffer en memoria
          }
          // Manejo del escáner de frecuencias activas (RSSI)
          else if (payload.active_freqs && currentView === 'scan_freqs') {
            setIsProcessing(false);
            setModal({
              visible: true,
              title: 'SCAN FINISHED',
              message: payload.active_freqs.length > 0 ? `ACTIVAS: ${payload.active_freqs.join(", ")} MHz` : 'AIRSPACE CLEAN',
              extra: 'UMBRAL RSSI COMPLETO'
            });
          }
        }
      } catch (e) {}
    };

    return () => ws.close();
  }, []);

  // 🎮 MANEJO TÁCTICO DEL D-PAD FÍSICO Y NAVEGACIÓN INDEXADA
  useEffect(() => {
    if (!lastAction || lastAction.timestamp === lastTimestampRef.current) return;
    if (lastAction.timestamp < mountTimeRef.current) return;
    
    lastTimestampRef.current = lastAction.timestamp;
    const { type } = lastAction;

    // Control global de salida de modales
    if (modal.visible) {
      if (type === 'OK' || type === 'BACK' || type === 'LEFT' || type === 'RIGHT') {
        setModal(prev => ({ ...prev, visible: false }));
        setView('menu');
      }
      return;
    }

    // ─── MENÚ PRINCIPAL ───
    if (view === 'menu') {
      switch (type) {
        case 'UP': setSelectedIdx(p => (p - 1 + menuOptions.length) % menuOptions.length); break;
        case 'DOWN': setSelectedIdx(p => (p + 1) % menuOptions.length); break;
        case 'OK': setView(menuOptions[selectedIdx].id); break;
        default: break;
      }
    } 
    // ─── SELECTOR DE FRECUENCIA PARA EL SNIFFER ───
    else if (view === 'select_freq') {
      switch (type) {
        case 'LEFT': case 'UP': setFreqIdx(p => (p - 1 + availableFreqs.length) % availableFreqs.length); break;
        case 'RIGHT': case 'DOWN': setFreqIdx(p => (p + 1) % availableFreqs.length); break;
        case 'OK':
          setView('capture_mode');
          sendCommand("CAPTURE", { freq_mhz: availableFreqs[freqIdx] });
          break;
        case 'BACK': setView('menu'); break;
        default: break;
      }
    }
    // ─── NAVEGADOR DE BASE DE DATOS (REPLAY ATTACK) ───
    else if (view === 'view_clones') {
      if (savedSignals.length === 0) {
        if (type === 'BACK' || type === 'LEFT') setView('menu');
        return;
      }
      switch (type) {
        case 'UP': setDbIdx(p => (p - 1 + savedSignals.length) % savedSignals.length); break;
        case 'DOWN': setDbIdx(p => (p + 1) % savedSignals.length); break;
        case 'OK':
          const targetSignal = savedSignals[dbIdx];
          // Inyectamos el ataque de repetición pasando los parámetros al ORM
          sendCommand("REPLAY", { freq_mhz: targetSignal.freq_mhz, pulse_string: targetSignal.pulse_string });
          setModal({
            visible: true,
            title: 'REPLAY ENGAGED',
            message: `ALIAS: ${targetSignal.alias}`,
            extra: `EMITIENDO CLON EN FREC: ${targetSignal.freq_mhz} MHz`
          });
          break;
        case 'BACK': case 'LEFT': setView('menu'); break;
        default: break;
      }
    }
    // Retorno para estados asíncronos (Scan/Jam)
    else {
      if (type === 'BACK' || type === 'LEFT') {
        setIsProcessing(false);
        setView('menu');
      }
    }
  }, [lastAction, view, selectedIdx, freqIdx, dbIdx, savedSignals, modal.visible]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', color: '#201000', padding: '20px 25px 15px 25px', position: 'relative' }}>
      
      {/* CABECERA ESTILO INDUSTRIAL */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '3px solid #201000', paddingBottom: '6px', marginBottom: '10px', fontWeight: '900' }}>
        <span>CC1101_SUBGHZ_MODULE</span>
        <span style={{ background: '#201000', color: '#ff9f1a', padding: '0 6px', borderRadius: '3px' }}>{view.toUpperCase()}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
        
        {/* MODAL EMERGENTE DE TELEMETRÍA */}
        {modal.visible && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: '#ff9f1a', border: '3px solid #201000', borderRadius: '12px',
            zIndex: 99, display: 'flex', flexDirection: 'column', padding: '12px', boxShadow: '5px 5px 0px #201000'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px dashed #201000', paddingBottom: '4px', marginBottom: '8px', fontWeight: '900', fontSize: '11px' }}>
              <span>[ {modal.title} ]</span>
              <span>🟢</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: '900', background: '#201000', color: '#ff9f1a', padding: '4px 10px', borderRadius: '4px', fontFamily: 'monospace', textAlign: 'center' }}>
                {modal.message}
              </div>
              <div style={{ fontSize: '10px', fontWeight: 'bold', marginTop: '6px', opacity: 0.7 }}>
                {modal.extra}
              </div>
            </div>
            <div style={{ fontSize: '8px', fontWeight: '900', textAlign: 'center', borderTop: '1px solid #201000', paddingTop: '4px', opacity: 0.6 }}>
              PRESS ANY D-PAD BUTTON TO DISMISS
            </div>
          </div>
        )}

        {/* VISTA 1: SELECTOR DE FRECUENCIA INTERACTIVO */}
        {view === 'select_freq' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '900' }}>SELECT FREQUENCY TARGET:</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#201000', color: '#ff9f1a', padding: '10px 15px', borderRadius: '8px', border: '2px solid #201000' }}>
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>◄</span>
              <span style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: '900', letterSpacing: '1px' }}>
                {availableFreqs[freqIdx]} <span style={{ fontSize: '12px' }}>MHz</span>
              </span>
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>►</span>
            </div>
            <span style={{ fontSize: '9px', fontWeight: 'bold', opacity: 0.5 }}>[ PRESS OK TO ENGAGE SNIFFER ]</span>
          </div>
        )}

        {/* VISTA 2: NAVEGADOR DE BASE DE DATOS (SQLALCHEMY INDEX) */}
        {view === 'view_clones' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '145px' }}>
            <div style={{ fontSize: '10px', fontWeight: '900', marginBottom: '4px', opacity: 0.7 }}>INTERNAL SQLALCHEMY REGISTRIES:</div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '2px' }}>
              {savedSignals.length === 0 ? (
                <div style={{ textTransform: 'uppercase', fontSize: '10px', textAlign: 'center', padding: '20px', border: '2px dashed #201000', borderRadius: '8px', fontWeight: 'bold', opacity: 0.6 }}>
                  No clones indexed in ORM pool
                </div>
              ) : (
                savedSignals.map((sig, i) => (
                  <div key={sig.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 10px', background: i === dbIdx ? '#201000' : 'rgba(32,16,0,0.06)', 
                    color: i === dbIdx ? '#ff9f1a' : '#201000',
                    border: '1px solid #201000', borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace', fontWeight: 'bold'
                  }}>
                    <span>{sig.alias}</span>
                    <span style={{ fontSize: '10px', opacity: 0.8 }}>{sig.freq_mhz} MHz</span>
                  </div>
                ))
              )}
            </div>
            {savedSignals.length > 0 && <div style={{ fontSize: '9px', marginTop: '6px', textAlign: 'center', opacity: 0.6, fontWeight: 'bold' }}>[ PRESS OK TO REPLAY SELECTION ]</div>}
          </div>
        )}

        {/* VISTA RAÍZ: MENÚ DE OPCIONES DEL MÓDULO */}
        {view === 'menu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {menuOptions.map((opt, i) => (
              <div key={opt.id} style={{
                  padding: '8px 12px', background: i === selectedIdx ? '#201000' : 'transparent',
                  color: i === selectedIdx ? '#ff9f1a' : '#201000', border: '2px solid #201000',
                  borderRadius: '10px', fontSize: '13px', fontWeight: '900', display: 'flex', alignItems: 'center'
              }}>
                <span style={{ marginRight: '12px' }}>{opt.icon}</span>
                <span style={{ flex: 1 }}>{opt.label}</span>
                {i === selectedIdx && <span>◄</span>}
              </div>
            ))}
          </div>
        )}

        {/* PANTALLA DE CARGA ASÍNCRONA (OSCILOSCOPIO DIGITAL SIMULADO) */}
        {isProcessing && (
          <div style={{ textAlign: 'center' }}>
            {view === 'capture_mode' ? (
              <div style={{ height: '30px', display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'center', margin: '5px 0' }}>
                <div style={{ width: '4px', height: '10px', background: '#201000', animation: 'spin 0.5s ease infinite alternate' }} />
                <div style={{ width: '4px', height: '28px', background: '#201000', animation: 'spin 0.3s ease infinite alternate' }} />
                <div style={{ width: '4px', height: '5px', background: '#201000' }} />
                <div style={{ width: '4px', height: '22px', background: '#201000', animation: 'spin 0.4s ease infinite alternate' }} />
              </div>
            ) : (
              <div style={{ fontSize: '30px', animation: 'spin 2s linear infinite', marginBottom: '5px' }}>⚙️</div>
            )}
            <div style={{ background: '#201000', color: '#ff9f1a', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '900' }}>
              {executionStatus}
            </div>
          </div>
        )}

      </div>

      {/* MINI TERMINAL DE LOGS INFERIOR */}
      <div style={{ 
        marginTop: '10px', height: '55px', background: 'rgba(0,0,0,0.08)', 
        border: '2px solid #201000', borderRadius: '6px', padding: '6px 8px', 
        fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '4px',
        fontFamily: 'monospace', fontWeight: 'bold', overflow: 'hidden'
      }}>
        <div style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', opacity: 0.7 }}>
          &gt; {c2Log}
        </div>
        <div style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
          &gt; {fwLog}
        </div>
      </div>

    </div>
  );
}