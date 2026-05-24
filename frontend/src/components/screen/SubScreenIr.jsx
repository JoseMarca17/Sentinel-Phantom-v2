import React, { useState, useEffect, useRef } from 'react';

export default function SubScreenIr({ lastAction }) {
  const [view, setView] = useState('menu');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [savedSignals, setSavedSignals] = useState([]);
  const [sniffLog, setSniffLog] = useState("READY TO CACHE...");
  
  // Terminal dividida: Línea 1 (HTTP/C2) y Línea 2 (Firmware RX)
  const [c2Log, setC2Log] = useState("[C2] Awaiting hardware bus directives...");
  const [fwLog, setFwLog] = useState("[FIRMWARE RX] Idle. No packets in UART buffer.");
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [executionStatus, setExecutionStatus] = useState(null);
  const [sniffResult, setSniffResult] = useState(null); // 'SUCCESS' | 'TIMEOUT' | null

  const lastTimestampRef = useRef(null);
  const mountTimeRef = useRef(Date.now());

  const menuOptions = [
    { id: 'sniff', label: "SNIFFER / CAPTURE", icon: "📡" },
    { id: 'saved', label: "SAVED SIGNALS", icon: "💾" },
    { id: 'tvbgone', label: "TV-B-GONE (ATTACK)", icon: "💥" },
    { id: 'camera', label: "CAMERA DETECT", icon: "📷" }
  ];

  const fetchSignals = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/ir/signals");
      const data = await res.json();
      setSavedSignals(data);
    } catch (err) {
      setC2Log("[C2 ERR] Failed to synchronize SQLite registries");
    }
  };

  const sendCommand = async (cmd, extraParams = {}) => {
    setIsProcessing(true);
    setSniffResult(null);
    setExecutionStatus(cmd === "CAPTURE" ? "LISTENING GPIO 26..." : "TRANSMITTING...");

    try {
      const res = await fetch("http://localhost:8000/api/ir/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd, ...extraParams })
      });
      const resData = await res.json();
      
      // Volcamos la respuesta HTTP en la línea 1 de la consola
      setC2Log(`[C2 TX_OK] ${JSON.stringify(resData)}`);
      
      if (cmd === "REPLAY" || cmd === "TV_B_GONE") {
        setSniffResult(resData.status === "SUCCESS" ? 'SUCCESS' : 'TIMEOUT');
        setExecutionStatus(resData.status === "SUCCESS" ? "BURST SENT OK" : "BUS ATTRITION");
        setTimeout(() => {
          setIsProcessing(false);
          setSniffResult(null);
          if (cmd === "TV_B_GONE") setView('menu');
        }, 1500);
      }
    } catch (err) {
      setC2Log(`[C2 CRITICAL] Connection refused on command: ${cmd}`);
      setSniffResult('TIMEOUT');
      setExecutionStatus("LINK DEAD");
      setTimeout(() => setIsProcessing(false), 1500);
    }
  };

  useEffect(() => {
    if (view === 'saved') fetchSignals();
    if (view === 'sniff') sendCommand("CAPTURE");
    if (view === 'tvbgone') sendCommand("TV_B_GONE");
  }, [view]);

  // 📡 WEB SOCKET PIPELINE CRÍTICO
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws/control");
    
    ws.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data);
        if (packet.module === "IR") {
          const payload = packet.data;
          
          // ─── LÍNEA 2 DE LA TERMINAL: Aquí se fuerza el volcado del microcontrolador ───
          setFwLog(`[FIRMWARE RX] ${JSON.stringify(payload)}`);
          
          if (view === 'sniff') {
            if (payload.success && payload.code) {
              setSniffResult('SUCCESS');
              setExecutionStatus(`CAPTURED: ${payload.protocol}`);
              setSniffLog(`[+] OK: ${payload.code}`);
              fetchSignals(); // Auto-refrescar lista
            } else {
              // Manejo explícito de la expiración o respuesta vacía del chip
              setSniffResult('TIMEOUT');
              setExecutionStatus("TIMEOUT: NO SIGNAL DETECTED");
              setSniffLog("[-] TIMEOUT: BUFFER EMPTY");
            }
            
            // Retorno automático controlado
            setTimeout(() => {
              setIsProcessing(false);
              setSniffResult(null);
              setView('menu');
            }, 2500);
          }
        }
      } catch (e) {}
    };

    return () => ws.close();
  }, [view]);

  // D-Pad Mandos
  useEffect(() => {
    if (!lastAction || lastAction.timestamp === lastTimestampRef.current) return;
    if (lastAction.timestamp < mountTimeRef.current) return;
    
    lastTimestampRef.current = lastAction.timestamp;
    const { type } = lastAction;

    if (view === 'menu') {
      switch (type) {
        case 'UP': setSelectedIdx(p => (p - 1 + menuOptions.length) % menuOptions.length); break;
        case 'DOWN': setSelectedIdx(p => (p + 1) % menuOptions.length); break;
        case 'OK': setView(menuOptions[selectedIdx].id); break;
        default: break;
      }
    } else {
      if (type === 'BACK' || type === 'LEFT') {
        setIsProcessing(false);
        setSniffResult(null);
        setView('menu');
        return;
      }
      
      if (view === 'saved') {
        if (type === 'UP') setSelectedIdx(p => (p - 1 + savedSignals.length) % savedSignals.length);
        if (type === 'DOWN') setSelectedIdx(p => (p + 1) % savedSignals.length);
        if (type === 'OK' && savedSignals[selectedIdx]) {
          const sig = savedSignals[selectedIdx];
          sendCommand("REPLAY", { protocol: sig.protocol, code: sig.code, bits: sig.bits });
        }
      }
    }
  }, [lastAction, view, selectedIdx, savedSignals]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', color: '#201000', padding: '20px 25px 15px 25px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '3px solid #201000', paddingBottom: '6px', marginBottom: '10px', fontWeight: '900' }}>
        <span>IR_TACTICAL_DEVICE</span>
        <span style={{ background: '#201000', color: '#ff9f1a', padding: '0 6px', borderRadius: '3px' }}>{view.toUpperCase()}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        
        {isProcessing ? (
          <div style={{ textAlign: 'center' }}>
            {sniffResult === 'SUCCESS' ? (
              <div style={{ fontSize: '40px' }}>✅</div>
            ) : sniffResult === 'TIMEOUT' ? (
              <div style={{ fontSize: '40px' }}>❌</div>
            ) : (
              <div style={{ fontSize: '36px', animation: 'spin 2s linear infinite' }}>⚙️</div>
            )}
            
            <h3 style={{ fontWeight: '900', margin: '10px 0', fontSize: '16px' }}>
              {sniffResult === 'SUCCESS' ? "SIGNAL CACHED" : sniffResult === 'TIMEOUT' ? "EMPTY BUFFER" : "AUDITING BUS..."}
            </h3>

            <div style={{ 
              background: sniffResult === 'SUCCESS' ? '#201000' : sniffResult === 'TIMEOUT' ? '#a00' : '#201000', 
              color: sniffResult === 'SUCCESS' ? '#ff9f1a' : '#fff', 
              padding: '6px 12px', borderRadius: '4px', display: 'inline-block', fontSize: '11px', fontWeight: '900' 
            }}>
              {executionStatus}
            </div>
          </div>
        ) : (
          <>
            {view === 'menu' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {menuOptions.map((opt, i) => (
                  <div key={opt.id} style={{
                      padding: '10px 12px', background: i === selectedIdx ? '#201000' : 'transparent',
                      color: i === selectedIdx ? '#ff9f1a' : '#201000', border: '2px solid #201000',
                      borderRadius: '10px', fontSize: '14px', fontWeight: '900', display: 'flex', alignItems: 'center'
                  }}>
                    <span style={{ marginRight: '12px' }}>{opt.icon}</span>
                    <span style={{ flex: 1 }}>{opt.label}</span>
                    {i === selectedIdx && <span>◄</span>}
                  </div>
                ))}
              </div>
            )}

            {view === 'saved' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '170px', overflowY: 'auto' }} className="scrollbar-none">
                {savedSignals.length === 0 ? (
                  <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 'bold', padding: '20px' }}>NO RECORDS IN SQLITE</div>
                ) : (
                  savedSignals.map((sig, i) => (
                    <div key={sig.id} style={{ 
                      padding: '6px 10px', border: '2px solid #201000', borderRadius: '8px', 
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: i === selectedIdx ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.01)',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '12px', fontWeight: '900' }}>{sig.name || `SIGNAL_${sig.id}`}</span>
                        <span style={{ fontSize: '9px', opacity: 0.7 }}>{sig.protocol} | {sig.code}</span>
                      </div>
                      <span style={{ fontSize: '9px', fontWeight: '900', background: '#201000', color: '#ff9f1a', padding: '3px 6px', borderRadius: '4px' }}>
                        {i === selectedIdx ? '► EXE' : 'IDLE'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {view === 'tvbgone' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '40px' }}>💥</div>
                <h2 style={{ fontWeight: '900', color: '#b00', margin: '5px 0' }}>ATTACK FINISHED</h2>
                <p style={{ fontSize: '11px', opacity: 0.8 }}>BURST SENT VIA TRANSMITTER BUS</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* 📟 MINI TERMINAL ESTRICTA DE DOS LÍNEAS (Muestra C2 y Firmware por separado) */}
      <div style={{ 
        marginTop: '10px', height: '55px', background: 'rgba(0,0,0,0.08)', 
        border: '2px solid #201000', borderRadius: '6px', padding: '6px 8px', 
        fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '4px',
        fontFamily: 'monospace', fontWeight: 'bold', overflow: 'hidden'
      }}>
        <div style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', opacity: 0.8 }}>
          &gt; {c2Log}
        </div>
        <div style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', color: fwLog.includes('"success":false') ? '#b00' : '#201000' }}>
          &gt; {fwLog}
        </div>
      </div>

    </div>
  );
}