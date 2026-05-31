import React, { useState, useEffect, useRef } from 'react';
const raspberryIp = window.location.hostname
export default function SubScreenRfid({ lastAction }) {
  const [view, setView] = useState('menu');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [savedSignals, setSavedSignals] = useState([]);
  
  // Terminal dividida monocromática
  const [c2Log, setC2Log] = useState("[C2] Awaiting RFID hardware directives...");
  const [fwLog, setFwLog] = useState("[PN532 RX] Antena sintonizada en 13.56MHz.");
  
  // Control de estados visuales
  const [isProcessing, setIsProcessing] = useState(false);
  const [executionStatus, setExecutionStatus] = useState(null);

  // Mini-ventana emergente industrial (Modal de veredicto)
  const [modal, setModal] = useState({
    visible: false,
    type: 'SUCCESS', // 'SUCCESS' | 'ERROR'
    title: '',
    message: '',
    extra: ''
  });

  const lastTimestampRef = useRef(null);
  const mountTimeRef = useRef(Date.now());
  
  // Ancla de estado inmutable para el hilo asíncrono del WebSocket
  const viewRef = useRef('menu');
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const menuOptions = [
    { id: 'read', label: "SCAN UID / TYPE", icon: "🪪" },
    { id: 'dump', label: "DUMP ALL SECTORS", icon: "🗄️" },
    { id: 'clone', label: "CLONE LAST CAPTURE", icon: "👥" },
    { id: 'saved', label: "VIEW SAVED UID", icon: "💾" }
  ];

  const fetchSignals = async () => {
    try {
      const res = await fetch("http://${raspberryIp}:8000/api/rfid/history");
      const data = await res.json();
      setSavedSignals(data);
      setC2Log(`[C2 DB_SYNC] Synchronized ${data.length} cards from SQLite`);
    } catch (err) {
      setC2Log("[C2 ERR] Failed to synchronize registries");
    }
  };

  const sendCommand = async (cmd, extraParams = {}) => {
    setIsProcessing(true);
    setExecutionStatus(cmd === "READ" ? "SCANNING FIELD..." : cmd === "DUMP" ? "CRACKING KEYS..." : "WRITING SECTOR 0...");

    try {
      const res = await fetch("http://${raspberry}:8000/api/rfid/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd, ...extraParams })
      });
      const resData = await res.json();
      setC2Log(`[C2 TX_OK] ${JSON.stringify(resData)}`);
      
      if (resData.status === "ERROR") {
        setIsProcessing(false);
        setModal({
          visible: true,
          type: 'ERROR',
          title: 'DB EMPTY',
          message: resData.detail.toUpperCase(),
          extra: 'READ A CARD FIRST'
        });
      }
    } catch (err) {
      setIsProcessing(false);
      setC2Log(`[C2 CRITICAL] Connection refused on: ${cmd}`);
      setModal({
        visible: true,
        type: 'ERROR',
        title: 'LINK DEAD',
        message: 'C2 ENGINE UNREACHABLE',
        extra: 'CHECK HOST PORT'
      });
    }
  };

  useEffect(() => {
    if (view === 'saved') fetchSignals();
    if (view === 'read') sendCommand("READ");
    if (view === 'dump') sendCommand("DUMP");
    if (view === 'clone') sendCommand("CLONE");
  }, [view]);

  // 📡 PIPELINE WEBSOCKET GLOBAL BLINDADO CONTRA CONEXIONES FANTASMAS
  useEffect(() => {
    const ws = new WebSocket("ws://${raspberryIp}:8000/ws/control");
    
    ws.onopen = () => {
      setC2Log("[C2 LINK] Sockets synchrony engaged successfully.");
    };
    
    ws.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data);
        if (packet.module === "RFID") {
          const firmwarePayload = packet.data;
          
          // Forzar volcado real del JSON en la segunda línea de terminal para auditoría
          setFwLog(`[PN532 RX] ${JSON.stringify(firmwarePayload)}`);
          
          const currentActiveView = viewRef.current;
          
          // Mapeo elástico de propiedades del firmware en C++
          const hasUid = firmwarePayload.uid !== undefined;
          const hasClonedUid = firmwarePayload.cloned_uid !== undefined;
          const isDetectedTrue = firmwarePayload.detected === true || firmwarePayload.detected === "true";
          const hasBlocksData = firmwarePayload.blocks_read !== undefined;
          
          // Éxito analítico del Dump: si procesó bloques de datos en caliente
          const isDumpSuccess = hasBlocksData && (firmwarePayload.success === true || firmwarePayload.success === "true" || firmwarePayload.blocks_read > 0);
          const isStandardSuccess = firmwarePayload.success === true || firmwarePayload.success === "true";

          if (isDetectedTrue || isStandardSuccess || hasUid || hasClonedUid || isDumpSuccess) {
            setIsProcessing(false); // Detener animación de engranaje

            setModal({
              visible: true,
              type: 'SUCCESS',
              title: currentActiveView === 'read' ? 'CARD CAPTURED' : currentActiveView === 'dump' ? 'DUMP COMPLETED' : 'UID CLONED',
              message: currentActiveView === 'dump' 
                ? `READ: ${firmwarePayload.blocks_read ?? 0} / 64 BLKS` 
                : firmwarePayload.uid ? `UID: ${firmwarePayload.uid}` : 'OPERATION OK',
              extra: currentActiveView === 'dump'
                ? `FAILED: ${firmwarePayload.blocks_failed ?? 0} | KEYS EXPLOITED`
                : firmwarePayload.card_type ? `TYPE: ${firmwarePayload.card_type}` : `SECTORS MODIFIED OK`
            });
            
            fetchSignals(); // Sincronizar visor
          } else if (firmwarePayload.success === false || firmwarePayload.success === "false" || firmwarePayload.detected === false || firmwarePayload.detected === "false") {
            setIsProcessing(false);
            setModal({
              visible: true,
              type: 'ERROR',
              title: 'BURST TIMEOUT',
              message: firmwarePayload.error ? firmwarePayload.error.toUpperCase() : 'OPERATION FAILED',
              extra: 'ANTENNA DISENGAGED'
            });
          }
        }
      } catch (e) {
        console.error("Error parseando WebSocket:", e);
      }
    };

    // 🛡️ RECOLECTOR DE BASURA ANTI-ZOMBIS: Cierra el socket al desmontar la vista
    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, []); 

  // Mandos del D-Pad físico
  useEffect(() => {
    if (!lastAction || lastAction.timestamp === lastTimestampRef.current) return;
    if (lastAction.timestamp < mountTimeRef.current) return;
    
    lastTimestampRef.current = lastAction.timestamp;
    const { type } = lastAction;

    // Si la mini-ventana está arriba, cualquier comando D-Pad la limpia y vuelve al menú raíz
    if (modal.visible) {
      if (type === 'OK' || type === 'BACK' || type === 'LEFT' || type === 'RIGHT') {
        setModal(prev => ({ ...prev, visible: false }));
        setView('menu');
      }
      return;
    }

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
        setView('menu');
      }
    }
  }, [lastAction, view, selectedIdx, modal.visible]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', color: '#201000', padding: '20px 25px 15px 25px', position: 'relative' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '3px solid #201000', paddingBottom: '6px', marginBottom: '10px', fontWeight: '900' }}>
        <span>RFID_PN532_MODULE</span>
        <span style={{ background: '#201000', color: '#ff9f1a', padding: '0 6px', borderRadius: '3px' }}>{view.toUpperCase()}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
        
        {/* MODAL TÁCTICO DE BIENVENIDA A RESULTADOS */}
        {modal.visible && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: '#ff9f1a', border: '3px solid #201000', borderRadius: '12px',
            zIndex: 99, display: 'flex', flexDirection: 'column', padding: '12px',
            boxShadow: '5px 5px 0px #201000'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px dashed #201000', paddingBottom: '4px', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: '900', letterSpacing: '1px' }}>[ {modal.title} ]</span>
              <span style={{ fontSize: '14px' }}>{modal.type === 'SUCCESS' ? '🟢' : '🔴'}</span>
            </div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ fontSize: modal.type === 'SUCCESS' ? '38px' : '32px', margin: '0 0 5px 0' }}>
                {modal.type === 'SUCCESS' ? '⚡' : '⚠️'}
              </div>
              <div style={{ fontSize: '13px', fontWeight: '900', background: '#201000', color: '#ff9f1a', padding: '4px 10px', borderRadius: '4px', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'monospace' }}>
                {modal.message}
              </div>
              <div style={{ fontSize: '10px', fontWeight: 'bold', marginTop: '6px', opacity: 0.7 }}>
                {modal.extra}
              </div>
            </div>

            <div style={{ fontSize: '8px', fontWeight: '900', textAlign: 'center', borderTop: '1px solid #201000', paddingTop: '4px', marginTop: '4px', opacity: 0.6 }}>
              PRESS ANY BUTTON TO DISMISS
            </div>
          </div>
        )}

        {/* SPINNER DE CARGA */}
        {isProcessing ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', animation: 'spin 2s linear infinite' }}>⚙️</div>
            <h3 style={{ fontWeight: '900', margin: '10px 0', fontSize: '16px' }}>ENERGIZING ANTENNA...</h3>
            <div style={{ background: '#201000', color: '#ff9f1a', padding: '6px 12px', borderRadius: '4px', display: 'inline-block', fontSize: '11px', fontWeight: '900' }}>
              {executionStatus}
            </div>
          </div>
        ) : (
          <>
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

            {view === 'saved' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '160px' }}>
                <div style={{ fontSize: '10px', fontWeight: '900', marginBottom: '6px', opacity: 0.7 }}>
                  INTERNAL SQLITE CAPTURES:
                </div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '4px' }} className="scrollbar-none">
                  {savedSignals.length === 0 ? (
                    <div style={{ textTransform: 'uppercase', fontSize: '11px', textAlign: 'center', padding: '20px', border: '2px dashed #201000', borderRadius: '8px', fontWeight: 'bold' }}>
                      No captures in index
                    </div>
                  ) : (
                    savedSignals.map((card) => (
                      <div key={card.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '6px 10px', background: 'rgba(32,16,0,0.06)', border: '1px solid #201000',
                        borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace', fontWeight: 'bold'
                      }}>
                        <span style={{ color: '#ff9f1a', background: '#201000', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>
                          {card.uid}
                        </span>
                        <span style={{ fontSize: '10px', opacity: 0.8 }}>{card.card_type}</span>
                        <span style={{ fontSize: '9px', opacity: 0.5 }}>{card.date.split(" ")[1]}</span>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ fontSize: '9px', marginTop: '6px', textAlign: 'center', opacity: 0.5, fontWeight: 'bold' }}>
                  [ PRESS LEFT OR BACK TO RETURN ]
                </div>
              </div>
            )}
          </>
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
        <div style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', color: fwLog.includes('false') || fwLog.includes('error') ? '#b00' : '#201000' }}>
          &gt; {fwLog}
        </div>
      </div>

    </div>
  );
}