import React, { useState, useEffect, useRef } from 'react';

export default function SubScreenBle({ lastAction }) {
  const [view, setView]           = useState('menu');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [devices, setDevices]     = useState([]);
  const [trackerCount, setTrackerCount] = useState(0);
  const [isTxActive, setIsTxActive] = useState(false);
  const [attackIdx, setAttackIdx] = useState(0);
  const [gattMac, setGattMac]     = useState("");
  const [gattServices, setGattServices] = useState([]);
  const [rssiTarget, setRssiTarget] = useState(null);
  const [rssiValue, setRssiValue]   = useState(-100);
  const [cloneHex, setCloneHex]   = useState("");
  const [c2Log, setC2Log]         = useState("BLE_BUS: STANDBY");
  const [fwLog, setFwLog]         = useState("PHY: NimBLE stack online");
  const [radarBars, setRadarBars] = useState(new Array(32).fill(0));
  const [modal, setModal]         = useState({ visible: false, title: '', msg: '' });

  const lastTimestampRef = useRef(null);
  const mountTimeRef     = useRef(Date.now());
  const viewRef          = useRef('menu');

  const raspberryIp = window.location.hostname

  useEffect(() => { viewRef.current = view; }, [view]);

  const menuOptions = [
    { id: 'scan_ble',     label: "01. PROMISCUOUS SNIFFER",   desc: "Escucha pasiva de todos los beacons BLE en rango. Detecta vendor, tipo y RSSI sin transmitir nada." },
    { id: 'anti_track',   label: "02. ANTI-TRACKING RADAR",   desc: "Filtra exclusivamente AirTags, SmartTags y balizas FindMy. Alerta si un tracker te sigue." },
    { id: 'rssi_locator', label: "03. RSSI PROXIMITY LOCATOR",desc: "Fija una MAC objetivo y muestra su potencia en tiempo real. Orienta el dispositivo para triangular." },
    { id: 'gatt_explore', label: "04. GATT SERVICE EXPLORER", desc: "Conecta a un dispositivo BLE y enumera sus servicios y características GATT expuestos." },
    { id: 'adv_cloner',   label: "05. ADV BEACON CLONER",     desc: "Replica el payload de advertising de un beacon capturado. Útil para demostrar spoofing de balizas." },
    { id: 'eco_flood',    label: "06. ECOSYSTEM FLOODER",     desc: "Emite beacons falsos de Apple/Android. Demuestra vulnerabilidades en protocolos de pairing por proximidad." },
  ];

  const floodOptions = [
    { id: 'APPLE',   label: "Apple AirPods / AirTag Spam" },
    { id: 'ANDROID', label: "Google Fast Pair Spam" },
    { id: 'GENERIC', label: "Generic BLE Beacon Spam" },
  ];

  const sendC2 = async (cmd, params = {}) => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/ble/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd, ...params })
      });
      return await res.json();
    } catch {
      setC2Log("C2 ERR: Bus REST denegado");
    }
  };

  // WebSocket con reconexión
  useEffect(() => {
    let ws, timer;
    const connect = () => {
      ws = new WebSocket("ws://${raspberryIp}:8000/ws/control");
      ws.onmessage = (e) => {
        try {
          const { module, data } = JSON.parse(e.data);
          if (module !== "BLE_STREAM") return;
          const cur = viewRef.current;

          setFwLog(`RX: ${data.mac} | ${data.vendor || "?"} | ${data.rssi} dBm`);
          setRadarBars(p => p.map(() => Math.floor(Math.random() * 25)));

          if (cur === 'scan_ble') {
            setDevices(prev => {
              const exists = prev.find(d => d.mac === data.mac);
              const updated = exists
                ? prev.map(d => d.mac === data.mac ? { ...d, ...data } : d)
                : [...prev, data];
              return updated.sort((a, b) => b.rssi - a.rssi).slice(0, 8);
            });
          }

          if (cur === 'anti_track' && data.is_tracker) {
            setTrackerCount(c => c + 1);
            setDevices(prev => {
              const exists = prev.find(d => d.mac === data.mac);
              return exists ? prev : [...prev, data].slice(0, 6);
            });
            setC2Log(`⚠ TRACKER: ${data.mac} — ${data.subtype || data.vendor}`);
          }

          if (cur === 'rssi_locator' && rssiTarget && data.mac === rssiTarget) {
            setRssiValue(data.rssi);
          }

          if (cur === 'gatt_explore' && data.services) {
            setGattServices(data.services || []);
            setC2Log(`GATT: ${data.services.length} servicios en ${data.mac}`);
          }

        } catch {}
      };
      ws.onclose = () => { timer = setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { clearTimeout(timer); ws?.close(); };
  }, [rssiTarget]);

  // Polling DB para historial
  useEffect(() => {
    if (view !== 'scan_ble' && view !== 'anti_track') return;
    const endpoint = view === 'anti_track' ? 'trackers' : 'devices';
    const fetch_db = async () => {
      try {
        const r = await fetch(`http://${raspberryIp}:8000/api/ble/${endpoint}`);
        const data = await r.json();
        setDevices(data.slice(0, 8));
        if (view === 'anti_track') setTrackerCount(data.length);
      } catch {}
    };
    fetch_db();
    const t = setInterval(fetch_db, 4000);
    return () => clearInterval(t);
  }, [view]);

  // Activar/desactivar sniffer según vista
  useEffect(() => {
    if (view === 'scan_ble') {
      sendC2("SNIFFER_START", { anti_tracking: false });
      setC2Log("SNIFFER: Escucha promiscua activa en todos los canales BLE");
      setDevices([]);
    } else if (view === 'anti_track') {
      sendC2("SNIFFER_START", { anti_tracking: true });
      setC2Log("TSCM: Filtro de trackers activo — AirTag / SmartTag");
      setDevices([]);
      setTrackerCount(0);
    } else if (view === 'menu') {
      sendC2("SNIFFER_STOP");
      if (isTxActive) {
        sendC2("FLOOD_STOP");
        setIsTxActive(false);
      }
    }
  }, [view]);

  // D-PAD
  useEffect(() => {
    if (!lastAction || lastAction.timestamp === lastTimestampRef.current) return;
    if (lastAction.timestamp < mountTimeRef.current) return;
    lastTimestampRef.current = lastAction.timestamp;
    const { type } = lastAction;

    if (modal.visible) {
      setModal(p => ({ ...p, visible: false }));
      return;
    }

    if (view === 'menu') {
      const max = menuOptions.length;
      if (type === 'UP')   setSelectedIdx(p => (p - 1 + max) % max);
      if (type === 'DOWN') setSelectedIdx(p => (p + 1) % max);
      if (type === 'OK')   setView(menuOptions[selectedIdx].id);
    }

    else if (view === 'scan_ble' || view === 'anti_track') {
      if (type === 'BACK' || type === 'LEFT') setView('menu');
    }

    else if (view === 'rssi_locator') {
      if (type === 'BACK' || type === 'LEFT') {
        sendC2("SNIFFER_STOP");
        setView('menu');
      }
      if (type === 'OK' && devices.length > 0) {
        const target = devices[0].mac;
        setRssiTarget(target);
        sendC2("RSSI_TRACK", { mac: target });
        setC2Log(`RSSI TRACK → ${target}`);
      }
    }

    else if (view === 'gatt_explore') {
      if (type === 'BACK' || type === 'LEFT') setView('menu');
      if (type === 'OK' && gattMac) {
        sendC2("GATT_EXPLORE", { mac: gattMac });
        setC2Log(`GATT → conectando a ${gattMac}...`);
      }
    }

    else if (view === 'adv_cloner') {
      if (type === 'BACK' || type === 'LEFT') {
        sendC2("FLOOD_STOP");
        setView('menu');
      }
      if (type === 'OK' && cloneHex) {
        sendC2("CLONE_BEACON", { hex_data: cloneHex });
        setIsTxActive(true);
        setC2Log(`ADV CLONE → transmitiendo payload ${cloneHex.slice(0, 12)}...`);
      }
    }

    else if (view === 'eco_flood') {
      if (type === 'BACK' || type === 'LEFT') {
        if (isTxActive) { sendC2("FLOOD_STOP"); setIsTxActive(false); }
        setView('menu');
      }
      if (type === 'UP')   setAttackIdx(p => (p - 1 + floodOptions.length) % floodOptions.length);
      if (type === 'DOWN') setAttackIdx(p => (p + 1) % floodOptions.length);
      if (type === 'OK') {
        if (isTxActive) {
          sendC2("FLOOD_STOP");
          setIsTxActive(false);
          setC2Log("FLOOD: Transmisor detenido");
        } else {
          const eco = floodOptions[attackIdx].id;
          sendC2("FLOOD_START", { ecosystem: eco, interval_ms: 30 });
          setIsTxActive(true);
          setC2Log(`FLOOD: Emitiendo beacons ${eco} — OK para detener`);
        }
      }
    }
  }, [lastAction, view, selectedIdx, attackIdx, isTxActive, gattMac, cloneHex, devices, modal.visible]);

  const rssiPercent = Math.min(Math.max((rssiValue + 100) * 1.6, 2), 100);
  const rssiColor   = rssiValue >= -55 ? '#006600' : rssiValue >= -70 ? '#885500' : '#201000';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', color: '#201000', padding: '15px 20px', fontFamily: 'monospace', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '3px solid #201000', paddingBottom: '6px', marginBottom: '12px', fontWeight: '900' }}>
        <span>BLE_TACTICAL_SUITE</span>
        <span style={{ background: '#201000', color: '#ff9f1a', padding: '0 8px' }}>{view.toUpperCase()}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Modal */}
        {modal.visible && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(32,16,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99, borderRadius: '8px' }}>
            <div style={{ background: '#fff8f0', border: '3px solid #201000', borderRadius: '8px', padding: '16px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: '900', marginBottom: '6px' }}>{modal.title}</div>
              <div style={{ fontSize: '10px' }}>{modal.msg}</div>
              <div style={{ fontSize: '9px', marginTop: '8px', opacity: 0.5 }}>[ CUALQUIER BOTÓN PARA CERRAR ]</div>
            </div>
          </div>
        )}

        {/* MENÚ */}
        {view === 'menu' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {menuOptions.map((opt, i) => (
                <div key={opt.id} style={{ padding: '5px 10px', background: i === selectedIdx ? '#201000' : 'rgba(32,16,0,0.03)', color: i === selectedIdx ? '#ff9f1a' : '#201000', border: '1px solid #201000', borderRadius: '5px', fontSize: '11px', fontWeight: '900', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{opt.label}</span>
                  {i === selectedIdx && <span style={{ fontSize: '9px', background: '#ff9f1a', color: '#201000', padding: '0 4px', borderRadius: '2px' }}>READY</span>}
                </div>
              ))}
            </div>
            <div style={{ padding: '8px', border: '2px solid #201000', borderRadius: '8px', marginTop: '8px' }}>
              <div style={{ fontSize: '9px', fontWeight: 'bold', lineHeight: '1.5', opacity: 0.85 }}>
                {menuOptions[selectedIdx].desc}
              </div>
            </div>
          </div>
        )}

        {/* 01 y 02: Sniffer / Anti-tracking */}
        {(view === 'scan_ble' || view === 'anti_track') && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontWeight: '900', background: '#201000', color: '#ff9f1a', padding: '3px 8px', borderRadius: '3px' }}>
              <span>{view === 'anti_track' ? '⚠ TRACKER ALERTS' : '📡 NODOS EN RANGO'}: {devices.length}</span>
              {view === 'anti_track' && <span>TOTAL DETECTADOS: {trackerCount}</span>}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {devices.length === 0 ? (
                <div style={{ margin: 'auto', fontSize: '10px', opacity: 0.4, textAlign: 'center' }}>
                  {view === 'anti_track' ? 'SIN TRACKERS DETECTADOS\nMUÉVETE PARA ACTIVAR DETECCIÓN' : 'ESCUCHANDO CANAL BLE...'}
                </div>
              ) : devices.map((d, i) => (
                <div key={i} style={{ padding: '4px 6px', border: d.is_tracker ? '1px solid #cc0000' : '1px dashed rgba(32,16,0,0.2)', borderRadius: '3px', background: d.is_tracker ? 'rgba(204,0,0,0.05)' : 'transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontWeight: '900' }}>
                    <span style={{ fontFamily: 'monospace' }}>{d.mac}</span>
                    <span style={{ color: d.is_tracker ? '#cc0000' : '#201000' }}>{d.rssi} dBm</span>
                  </div>
                  <div style={{ fontSize: '8px', display: 'flex', justifyContent: 'space-between', opacity: 0.8, marginTop: '1px' }}>
                    <span>{d.name || "UNNAMED"}</span>
                    <span>{d.vendor || d.type || "?"}{d.subtype ? ` — ${d.subtype}` : ''}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ height: '20px', border: '1px solid #201000', borderRadius: '4px', display: 'flex', alignItems: 'flex-end', gap: '1px', padding: '2px', overflow: 'hidden' }}>
              {radarBars.map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h * 4}%`, background: view === 'anti_track' ? '#cc0000' : '#201000' }} />
              ))}
            </div>
          </div>
        )}

        {/* 03: RSSI Locator */}
        {view === 'rssi_locator' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', background: '#201000', color: '#ff9f1a', padding: '3px 8px', borderRadius: '3px' }}>
              {rssiTarget ? `TRACKING → ${rssiTarget}` : 'SELECCIONA UN NODO DEL SNIFFER (OK)'}
            </div>
            {rssiTarget ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <div style={{ fontSize: '32px', fontWeight: '900', background: '#201000', color: '#ff9f1a', padding: '10px 28px', borderRadius: '4px', border: `2px solid ${rssiColor}`, fontFamily: 'monospace' }}>
                  {rssiValue} dBm
                </div>
                <div style={{ width: '100%', height: '14px', border: '2px solid #201000', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${rssiPercent}%`, background: rssiColor, transition: 'width 0.3s ease' }} />
                </div>
                <div style={{ fontSize: '8px', opacity: 0.5, textAlign: 'center' }}>
                  MUEVE EL DISPOSITIVO — MAYOR dBm = MÁS CERCA
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {devices.length === 0 ? (
                  <div style={{ margin: 'auto', fontSize: '9px', opacity: 0.4 }}>INICIA SNIFFER PRIMERO</div>
                ) : devices.map((d, i) => (
                  <div key={i} style={{ padding: '4px 6px', border: i === 0 ? '2px solid #201000' : '1px dashed rgba(32,16,0,0.2)', borderRadius: '3px', fontSize: '9px', fontWeight: '900', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{d.mac}</span>
                    <span>{d.rssi} dBm {i === 0 ? '← OK' : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 04: GATT Explorer */}
        {view === 'gatt_explore' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', opacity: 0.7 }}>MAC OBJETIVO (tus propios dispositivos):</div>
            <input
              type="text"
              value={gattMac}
              onChange={e => setGattMac(e.target.value)}
              placeholder="XX:XX:XX:XX:XX:XX"
              style={{ background: 'rgba(32,16,0,0.04)', border: '1px solid #201000', color: '#201000', padding: '4px 8px', fontSize: '10px', fontWeight: 'bold', outline: 'none', borderRadius: '3px', fontFamily: 'monospace' }}
            />
            <button onClick={() => { if (gattMac) { sendC2("GATT_EXPLORE", { mac: gattMac }); setC2Log(`GATT → ${gattMac}`); }}} style={{ padding: '5px', background: gattMac ? '#201000' : 'rgba(32,16,0,0.15)', color: '#ff9f1a', border: '1px solid #ff9f1a', borderRadius: '4px', fontSize: '9px', fontWeight: '900', cursor: gattMac ? 'pointer' : 'not-allowed' }}>
              ⚡ ENUMERAR SERVICIOS GATT
            </button>
            <div style={{ flex: 1, border: '1px solid #201000', borderRadius: '4px', padding: '4px 6px', overflowY: 'auto' }}>
              <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px dashed #201000', marginBottom: '3px' }}>SERVICIOS DETECTADOS:</div>
              {gattServices.length > 0 ? gattServices.map((s, i) => (
                <div key={i} style={{ fontSize: '8px', fontFamily: 'monospace', padding: '2px 0', borderBottom: '1px dashed rgba(32,16,0,0.1)' }}>› {s}</div>
              )) : (
                <div style={{ fontSize: '8px', opacity: 0.4, textAlign: 'center', marginTop: '8px' }}>SIN DATOS — EJECUTA EXPLORACIÓN</div>
              )}
            </div>
          </div>
        )}

        {/* 05: ADV Cloner */}
        {view === 'adv_cloner' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', opacity: 0.7 }}>PAYLOAD HEX DEL BEACON CAPTURADO:</div>
            <input
              type="text"
              value={cloneHex}
              onChange={e => setCloneHex(e.target.value)}
              placeholder="4c000215..."
              style={{ background: 'rgba(32,16,0,0.04)', border: '1px solid #201000', color: '#201000', padding: '4px 8px', fontSize: '10px', fontWeight: 'bold', outline: 'none', borderRadius: '3px', fontFamily: 'monospace' }}
            />
            <div style={{ fontSize: '8px', opacity: 0.6, lineHeight: '1.4' }}>
              Captura el payload del beacon con el sniffer, pégalo aquí y el ESP32 lo transmitirá como si fuera el dispositivo original.
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => { if (cloneHex) { sendC2("CLONE_BEACON", { hex_data: cloneHex }); setIsTxActive(true); setC2Log(`CLONE TX → ${cloneHex.slice(0,12)}...`); }}} style={{ flex: 1, padding: '5px', background: cloneHex ? '#201000' : 'rgba(32,16,0,0.15)', color: '#ff9f1a', border: '1px solid #ff9f1a', borderRadius: '4px', fontSize: '9px', fontWeight: '900', cursor: cloneHex ? 'pointer' : 'not-allowed' }}>
                ⚡ TRANSMITIR CLONE
              </button>
              <button onClick={() => { sendC2("FLOOD_STOP"); setIsTxActive(false); setC2Log("TX DETENIDO"); }} style={{ padding: '5px 10px', background: isTxActive ? '#cc0000' : 'rgba(32,16,0,0.1)', color: isTxActive ? '#fff' : '#201000', border: '1px solid #201000', borderRadius: '4px', fontSize: '9px', fontWeight: '900', cursor: 'pointer' }}>
                ■ STOP
              </button>
            </div>
            <div style={{ padding: '4px 6px', background: isTxActive ? 'rgba(204,0,0,0.05)' : 'rgba(32,16,0,0.04)', border: `1px solid ${isTxActive ? '#cc0000' : '#201000'}`, borderRadius: '3px', fontSize: '8px', fontWeight: '900', color: isTxActive ? '#cc0000' : '#201000' }}>
              {isTxActive ? '● TRANSMITIENDO BEACON CLONADO' : '○ TRANSMISOR INACTIVO'}
            </div>
          </div>
        )}

        {/* 06: Eco Flooder */}
        {view === 'eco_flood' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', background: '#201000', color: '#ff9f1a', padding: '3px 8px', borderRadius: '3px', display: 'flex', justifyContent: 'space-between' }}>
              <span>ECOSYSTEM FLOODER</span>
              <span style={{ color: isTxActive ? '#ff4444' : '#ff9f1a' }}>{isTxActive ? '● TX ACTIVO' : '○ STANDBY'}</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {floodOptions.map((opt, i) => (
                <div key={opt.id} style={{ padding: '6px 10px', background: i === attackIdx ? '#201000' : 'rgba(32,16,0,0.03)', color: i === attackIdx ? '#ff9f1a' : '#201000', border: '1px solid #201000', borderRadius: '5px', fontSize: '10px', fontWeight: '900', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{opt.label}</span>
                  {i === attackIdx && <span style={{ fontSize: '9px' }}>► OK: {isTxActive ? 'DETENER' : 'INICIAR'}</span>}
                </div>
              ))}
            </div>
            <div style={{ fontSize: '8px', padding: '4px 6px', background: 'rgba(32,16,0,0.04)', borderRadius: '3px', lineHeight: '1.4', opacity: 0.8 }}>
              Emite beacons falsos del ecosistema seleccionado. Los dispositivos cercanos mostrarán notificaciones de pairing falsas. Solo usar en entorno controlado.
            </div>
          </div>
        )}

      </div>

      {/* Terminal */}
      <div style={{ marginTop: '8px', height: '38px', background: 'rgba(32,16,0,0.05)', border: '2px solid #201000', borderRadius: '5px', padding: '4px 8px', fontSize: '9px', display: 'flex', flexDirection: 'column', gap: '2px', fontWeight: 'bold', overflow: 'hidden' }}>
        <div>&gt; {c2Log}</div>
        <div style={{ opacity: 0.6 }}>&gt; {fwLog}</div>
      </div>
    </div>
  );
}