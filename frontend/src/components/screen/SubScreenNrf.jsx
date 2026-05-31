import React, { useState, useEffect, useRef } from 'react';
const raspberryIp = window.location.hostname
export default function SubScreenNrf({ lastAction }) {
  const [view, setView] = useState('menu');
  const [selectedIdx, setSelectedIdx] = useState(0);
  
  // Terminales de telemetría de RF
  const [c2Log, setC2Log] = useState("[C2] Awaiting NRF24 bus directives...");
  const [fwLog, setFwLog] = useState("[NRF24 RX] Bus SPI sintonizado en 2.4GHz.");
  
  // Estados de control visual
  const [isProcessing, setIsProcessing] = useState(false);
  const [executionStatus, setExecutionStatus] = useState(null);
  
  // Buffer del analizador de espectro (32 bloques para interfaz compacta)
  const [spectrumChannels, setSpectrumChannels] = useState(new Array(32).fill(0));
  const [peakInfo, setPeakInfo] = useState({ ch: 0, val: 0 });
  const [packetsJamming, setPacketsJamming] = useState(0);

  const [modal, setModal] = useState({ visible: false, title: '', message: '', extra: '' });

  const lastTimestampRef = useRef(null);
  const mountTimeRef = useRef(Date.now());
  
  // Sincronizador de variables para evitar closures en hilos de sockets
  const viewRef = useRef('menu');
  useEffect(() => { viewRef.current = view; }, [view]);

  const menuOptions = [
    { id: 'scan_spec', label: "SPECTRUM REALTIME", icon: "📊" },
    { id: 'scan_hid', label: "SNIFF HID NODES", icon: "🖱️" },
    { id: 'jammer_panel', label: "RF JAMMER CONTROL", icon: "🔥" }
  ];

  // Opciones internas del Jammer sintonizadas en modo SINGLE potente
  const jammerMenu = [
    { id: 'single_jam', label: "JAM SINGLE CH (CH 50)", icon: "🎯" },
    { id: 'stop', label: "DISENGAGE TRANSMITTER", icon: "🛑" }
  ];
  const [jamIdx, setJamIdx] = useState(0);
  const [isJammingActive, setIsJammingActive] = useState(false);

  const sendPingRequest = async (cmd, extraParams = {}) => {
    try {
      await fetch(`http://${raspberryIp}:8000/api/nrf24/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd, ...extraParams })
      });
    } catch (err) {
      setC2Log("[C2 ERR] Connection refused on ping");
    }
  };

  // 📡 CONTROLADOR DE ACCIONES COMPLEMENTARIAS (BARRIDOS SÍNCRONOS)
  useEffect(() => {
    let pingInterval = null;

    // Si estamos en escáner O en Jammer, ametrallamos al ESP32 con pings para ver el espectro
    if (view === 'scan_spec' || view === 'jammer_panel') {
      sendPingRequest("SCAN_SPECTRUM");
      pingInterval = setInterval(() => {
        const currentView = viewRef.current;
        if (currentView === 'scan_spec' || currentView === 'jammer_panel') {
          sendPingRequest("SCAN_SPECTRUM");
        }
      }, 300); // Ráfaga de pings asíncronos cada 300ms
    } 
    else if (view === 'scan_hid') {
      setIsProcessing(true);
      setExecutionStatus("SNIFFING HID BEACONS...");
      sendPingRequest("SCAN_HID");
    }

    return () => {
      if (pingInterval) clearInterval(pingInterval);
    };
  }, [view]);

  // 📡 RECEPTOR CENTRAL DE WEBSOCKETS (PINTA EL ESPECTRO Y CAPTURA HID)
  useEffect(() => {
    const ws = new WebSocket(`ws://${raspberryIp}:8000/ws/control`);
    
    ws.onopen = () => setC2Log("[C2 LINK] Sockets synchrony active.");
    
    ws.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data);
        if (packet.module === "NRF24") {
          const firmwarePayload = packet.data;
          setFwLog(`[NRF24 RX] ${JSON.stringify(firmwarePayload)}`);
          
          const currentActiveView = viewRef.current;

          // Si el payload trae canales, actualizamos la gráfica con decaimiento lento
          if (firmwarePayload.channels && (currentActiveView === 'scan_spec' || currentActiveView === 'jammer_panel')) {
            const rawChannels = firmwarePayload.channels;
            const compressed = [];
            const step = Math.ceil(rawChannels.length / 32);
            
            for (let i = 0; i < rawChannels.length; i += step) {
              const slice = rawChannels.slice(i, i + step);
              const sum = slice.reduce((a, b) => a + b, 0);
              compressed.push(Math.min(sum / 4, 30)); 
            }

            // ALGORITMO DE PERSISTENCIA ANALÓGICA (PEAK HOLD)
            setSpectrumChannels(prevChannels => {
              return compressed.map((newValue, index) => {
                const oldValue = prevChannels[index] || 0;
                return newValue > oldValue ? newValue : oldValue * 0.75;
              });
            });

            setPeakInfo({
              ch: firmwarePayload.peak_channel ?? 0,
              val: firmwarePayload.peak_value ?? 0
            });
            
            if (firmwarePayload.packets_sent) {
              setPacketsJamming(firmwarePayload.packets_sent);
            }
          }
          
          else if (currentActiveView === 'scan_hid') {
            setIsProcessing(false);
            if (firmwarePayload.found) {
              setModal({
                visible: true,
                title: 'HID INTERCEPTED',
                message: `ADDR: ${firmwarePayload.address}`,
                extra: `CH: ${firmwarePayload.channel} | VENDOR: ${firmwarePayload.manufacturer}`
              });
            } else {
              setModal({
                visible: true,
                title: 'SCAN COMPLETED',
                message: 'NO HID NODES IN FIELD',
                extra: 'ANTENNA RELEASED'
              });
            }
          }
        }
      } catch (e) {}
    };

    return () => ws.close();
  }, []);

  // 🎮 MANEJO DEL D-PAD FÍSICO (CON BLOQUEO PREVENTIVO)
  useEffect(() => {
    if (!lastAction || lastAction.timestamp === lastTimestampRef.current) return;
    if (lastAction.timestamp < mountTimeRef.current) return;
    
    lastTimestampRef.current = lastAction.timestamp;
    const { type } = lastAction;

    if (modal.visible) {
      if (type === 'OK' || type === 'BACK' || type === 'LEFT' || type === 'RIGHT') {
        setModal(prev => ({ ...prev, visible: false }));
        setView('menu');
      }
      return;
    }

    // ─── CONTROL EN EL MENÚ RAÍZ ───
    if (view === 'menu') {
      switch (type) {
        case 'UP': setSelectedIdx(p => (p - 1 + menuOptions.length) % menuOptions.length); break;
        case 'DOWN': setSelectedIdx(p => (p + 1) % menuOptions.length); break;
        case 'OK': setView(menuOptions[selectedIdx].id); break;
        default: break;
      }
    } 
    // ─── CONTROL DENTRO DEL PANEL DEL JAMMER (BLOQUEO ANTI-RETORNO) ───
    else if (view === 'jammer_panel') {
      if (type === 'BACK' || type === 'LEFT') {
        if (isJammingActive) {
          setC2Log("[CRITICAL] Desactiva el Jammer antes de abandonar el bus SPI!");
          return; 
        }
        setView('menu');
        return;
      }

      switch (type) {
        case 'UP': setJamIdx(p => (p - 1 + jammerMenu.length) % jammerMenu.length); break;
        case 'DOWN': setJamIdx(p => (p + 1) % jammerMenu.length); break;
        case 'OK':
          const targetOpt = jammerMenu[jamIdx].id;
          if (targetOpt === 'single_jam') {
            setIsJammingActive(true);
            sendPingRequest("START_JAMMER", { mode: "SINGLE", channel: 50 });
            setC2Log("[JAMMER] Inundación constante activada en Canal 50.");
          } else if (targetOpt === 'stop') {
            setIsJammingActive(false);
            sendPingRequest("STOP_JAMMER");
            setC2Log("[JAMMER] Transmisor apagado de forma segura.");
          }
          break;
        default: break;
      }
    } 
    // ─── VISTA DEL ESCÁNER ESTÁNDAR ───
    else {
      if (type === 'BACK' || type === 'LEFT') setView('menu');
    }
  }, [lastAction, view, selectedIdx, jamIdx, isJammingActive, modal.visible]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', color: '#201000', padding: '20px 25px 15px 25px', position: 'relative' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '3px solid #201000', paddingBottom: '6px', marginBottom: '10px', fontWeight: '900' }}>
        <span>NRF24_TACTICAL_MODULE</span>
        <span style={{ background: '#201000', color: '#ff9f1a', padding: '0 6px', borderRadius: '3px' }}>{view.toUpperCase()}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
        
        {/* MODAL TÁCTICO */}
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
              <div style={{ fontSize: '13px', fontWeight: '900', background: '#201000', color: '#ff9f1a', padding: '4px 10px', borderRadius: '4px', fontFamily: 'monospace' }}>
                {modal.message}
              </div>
              <div style={{ fontSize: '10px', fontWeight: 'bold', marginTop: '6px', opacity: 0.7 }}>
                {modal.extra}
              </div>
            </div>
            <div style={{ fontSize: '8px', fontWeight: '900', textAlign: 'center', borderTop: '1px solid #201000', paddingTop: '4px', opacity: 0.6 }}>
              PRESS ANY BUTTON TO DISMISS
            </div>
          </div>
        )}

        {/* 📊 MODO 1: GRÁFICA DEL ESCÁNER DE ESPECTRO CON TELEMETRÍA AVANZADA */}
        {view === 'scan_spec' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: '900', borderBottom: '1px dashed rgba(32,16,0,0.2)', paddingBottom: '2px' }}>
              <span style={{ color: '#ff9f1a', background: '#201000', padding: '0 4px', borderRadius: '2px' }}>
                🎯 PEAK: {2400 + peakInfo.ch} MHz
              </span>
              <span>ENERGY: {Math.round(peakInfo.val)}/15</span>
            </div>

            <div style={{ position: 'relative', height: '70px', border: '2px solid #201000', background: 'rgba(0,0,0,0.03)', borderRadius: '8px', display: 'flex', alignItems: 'flex-end', gap: '2px', padding: '15px 6px 4px 6px' }}>
              
              {/* MARCAS DE AGUA TÁCTICAS */}
              <div style={{ position: 'absolute', top: '2px', left: '8%', fontSize: '8px', fontWeight: '900', opacity: 0.25, fontFamily: 'monospace' }}>A BLE_CH_2</div>
              <div style={{ position: 'absolute', top: '2px', left: '42%', fontSize: '8px', fontWeight: '900', opacity: 0.25, fontFamily: 'monospace' }}>📶 WF_CH_6</div>
              <div style={{ position: 'absolute', top: '2px', left: '78%', fontSize: '8px', fontWeight: '900', opacity: 0.25, fontFamily: 'monospace' }}>A BLE_CH_80</div>

              {spectrumChannels.map((energy, i) => {
                const realChannel = i * 4; 
                const isPeak = Math.abs((peakInfo.ch / 4) - i) < 1;

                return (
                  <div 
                    key={i} 
                    style={{ 
                      flex: 1, 
                      height: `${(energy / 30) * 100}%`, 
                      minHeight: '2px', 
                      background: isPeak ? '#ff9f1a' : '#201000', 
                      border: isPeak ? '1px solid #201000' : 'none',
                      transition: 'height 0.08s ease-out',
                      position: 'relative'
                    }}
                    title={`CH: ${realChannel} (${2400 + realChannel}MHz)`}
                  />
                );
              })}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontFamily: 'monospace', fontWeight: '900', opacity: 0.8 }}>
                <span>2.400 GHz</span>
                <span style={{ opacity: 0.4 }}>|─── 2.442 GHz ───|</span>
                <span>2.524 GHz</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7px', fontWeight: 'bold', color: '#ff9f1a', background: '#201000', padding: '1px 6px', borderRadius: '3px' }}>
                <span>CH_0</span>
                <span>CH_32</span>
                <span>CH_64</span>
                <span>CH_96</span>
                <span>CH_124</span>
              </div>
            </div>

            <div style={{ fontSize: '9px', textAlign: 'center', opacity: 0.5, fontWeight: 'bold', marginTop: '2px' }}>
              [ PRESS BACK TO MENU ]
            </div>
          </div>
        )}

        {/* 🔥 MODO 2: PANEL DINÁMICO DEL JAMMER + GRÁFICA INFERIOR MEJORADA */}
        {view === 'jammer_panel' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '6px', flexDirection: 'column' }}>
              {jammerMenu.map((opt, i) => (
                <div key={opt.id} style={{
                  padding: '6px 10px', border: '2px solid #201000', borderRadius: '8px',
                  background: i === jamIdx ? '#201000' : 'transparent',
                  color: i === jamIdx ? '#ff9f1a' : '#201000', fontSize: '11px', fontWeight: '900',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  <span>{opt.icon}</span>
                  <span style={{ flex: 1 }}>{opt.label}</span>
                  {i === jamIdx && <span>◄</span>}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: isJammingActive ? '#a00' : 'rgba(32,16,0,0.06)', borderRadius: '6px', color: isJammingActive ? '#fff' : '#201000', fontSize: '10px', fontWeight: '900', margin: '4px 0' }}>
              <span>{isJammingActive ? "💥 ATTACK ENGAGED" : "💤 TX STANDBY"}</span>
              <span style={{ fontFamily: 'monospace', fontSize: '9px' }}>BURSTS: {packetsJamming}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ height: '35px', border: '2px solid #201000', background: 'rgba(0,0,0,0.03)', borderRadius: '6px', display: 'flex', alignItems: 'flex-end', gap: '1px', padding: '2px' }}>
                {spectrumChannels.map((energy, i) => (
                  <div key={i} style={{ flex: 1, height: `${(energy / 30) * 100}%`, minHeight: '1px', background: isJammingActive ? '#a00' : '#201000' }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7px', fontFamily: 'monospace', fontWeight: '900', opacity: 0.6, padding: '0 4px' }}>
                <span>2.400 GHz (CH 0)</span>
                <span>{isJammingActive ? "💥 JAMMING AIRSPACE" : "MONITOR ACTIVE"}</span>
                <span>2.524 GHz (CH 124)</span>
              </div>
            </div>
          </div>
        )}

        {/* LOG MENÚ PRINCIPAL */}
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

        {isProcessing && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', animation: 'spin 2s linear infinite' }}>⚙️</div>
            <div style={{ background: '#201000', color: '#ff9f1a', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '900', marginTop: '5px' }}>
              {executionStatus}
            </div>
          </div>
        )}

      </div>

      {/* MINI TERMINAL INFERIOR */}
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