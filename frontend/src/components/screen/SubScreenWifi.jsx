import React, { useState, useEffect, useRef } from 'react';
import WifiSpectrum from './wifi/WifiSpectrum';
import WifiMitm from './wifi/WifiMitm';
import WifiDefense from './wifi/WifiDefense';
const raspberryIp = window.location.hostname;
export default function SubScreenWifi({ lastAction }) {
  const [tier, setTier] = useState('menu');
  const [activeBlock, setActiveBlock] = useState(0);
  const [functionIdx, setFunctionIdx] = useState(0);

  const [accessPoints, setAccessPoints] = useState([]);
  const [clients, setClients] = useState([]);
  const [probes, setProbes] = useState([]);

  const [monitorLog, setMonitorLog] = useState("CORE: RF_BUS EN LINEA");
  const [statusLog, setStatusLog] = useState("ANTENNA: PASSIVE_STANDBY");
  const [isInjecting, setIsInjecting] = useState(false);
  const [wsStatus, setWsStatus] = useState("CONNECTING"); // CONNECTING | ONLINE | LOST
  const [modal, setModal] = useState({ visible: false, title: '', msg: '', extra: '' });

  const lastTimestampRef = useRef(null);
  const mountTimeRef = useRef(Date.now());

  const modulesConfig = [
    {
      id: "spectrum",
      title: "SPECTRUM ANALYSER",
      desc: "Capa 2 — Escucha pasiva de beacons, probes y tramas 802.11 en el aire.",
      icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z" opacity="0.15"/><path d="M12 6v12M8 10v4M4 11v2M16 8v8M20 11v2" /></svg>),
      functions: [
        { id: "scan_air",     label: "01. Beacon Passive Scanning",  desc: "Escucha beacons 802.11 y grafica RSSI de cada AP. Muestra SSID, canal y potencia en tiempo real sin transmitir nada." },
        { id: "probe_sniff",  label: "02. Client Probing Sniffer",   desc: "Captura Probe Requests de dispositivos cercanos. Revela qué redes tienen guardadas los teléfonos aunque no estén conectados." },
        { id: "wps_discover", label: "03. WPS Feature Discovery",    desc: "Filtra exclusivamente APs con WPS activo. El PIN abierto es un vector de ataque directo sin necesidad de handshake." },
        { id: "hidden_reveal",label: "04. Hidden SSID Revealer",     desc: "Intercepta tramas de asociación para desenmascarar SSIDs ocultos. El AP revela su nombre cuando un cliente se conecta." },
        { id: "station_map",  label: "05. Wireless Station Mapper",  desc: "Construye mapa relacional AP↔Cliente. Muestra qué dispositivos están asociados a cada router y su señal." }
      ]
    },
    {
      id: "mitm",
      title: "MITM & NET ATTACKS",
      desc: "Capa 3 — Inyección de tramas, envenenamiento ARP/DNS y captura de handshakes WPA.",
      icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="3" opacity="0.15"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6" /></svg>),
      functions: [
        { id: "lan_scan",    label: "06. LAN Discovery (Nmap)",        desc: "Escanea la subred activa con Nmap. Detecta hosts vivos, MACs y vendor fingerprinting sin levantar alertas agresivas." },
        { id: "arp_spoof",   label: "07. ARP Spoofing Bridge",         desc: "Envenena la tabla ARP del router y la víctima. Todo el tráfico pasa por este dispositivo antes de llegar al gateway." },
        { id: "dns_spoof",   label: "08. DNS Spoofer Local",           desc: "Intercepta consultas DNS y devuelve respuestas falsas. Redirige dominios reales a tu C2 para captura de credenciales." },
        { id: "deauth_burst",label: "09. Deauth Tactical Burst",       desc: "Inyecta frames 802.11 de desautenticación continua contra un AP. Fuerza desconexión de todos los clientes del canal." },
        { id: "eapol_trap",  label: "10. WPA Handshake Sniffer Trap",  desc: "Combina deauth + sniffer EAPOL. Fuerza reconexión del cliente y captura los 4 frames del handshake WPA2 para crackeo offline." }
      ]
    },
    {
      id: "defense",
      title: "TACTICAL DEFENSE",
      desc: "IDS pasivo — Detecta ataques externos contra tu infraestructura inalámbrica.",
      icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>),
      functions: [
        { id: "anti_deauth", label: "11. Anti-Deauth Monitor",        desc: "Detecta ráfagas de frames de desautenticación en tu subred. Alerta si un atacante externo está expulsando clientes." },
        { id: "twin_detect", label: "12. Evil Twin / BSSID Detector", desc: "Compara canal y BSSID de beacons. Detecta APs clonados que usan tu mismo SSID en un canal diferente." },
        { id: "ap_locator",  label: "13. Rogue AP Locator (RSSI)",    desc: "Medidor de potencia de señal en tiempo real. Orienta la antena para localizar físicamente un transmisor rogue." },
        { id: "arp_watchdog",label: "14. LAN ARP Poisoning Watch",    desc: "Monitorea la tabla ARP local. Alerta si una MAC responde por múltiples IPs, indicando envenenamiento activo." },
        { id: "mac_random",  label: "15. MAC Address Randomizer",     desc: "Muta la dirección física del adaptador de ataque con OUI aleatorio. Evita rastreo por filtros MAC y logs de router." }
      ]
    }
  ];

  const sendC2Action = async (cmd, params = {}) => {
    try {
      const response = await fetch(`http://${raspberryIp}:8000/api/wifi/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd, ...params })
      });
      return await response.json();
    } catch (err) {
      setMonitorLog("C2 ERR: Bus REST denegado");
    }
  };

  // WebSocket con reconexión automática
  useEffect(() => {
    let ws;
    let reconnectTimer;

    const connect = () => {
      setWsStatus("CONNECTING");
      ws = new WebSocket(`ws://${raspberryIp}:8000/ws/control`);

      ws.onopen = () => setWsStatus("ONLINE");

      ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          const { module, data: payload = [] } = raw;

          if (module === "WIFI_SPECTRUM") {
            setAccessPoints(Array.isArray(payload) ? payload : []);
          } else if (module === "WIFI_LAN_HOSTS") {
            setClients(Array.isArray(payload) ? payload : []);
          } else if (module === "WIFI_PROBES") {
            setProbes(Array.isArray(payload) ? payload : []);
          } else if (module === "WIFI_HANDSHAKE") {
            setMonitorLog(`EAPOL: HANDSHAKE CAPTURADO → ${payload?.bssid || "?"} [${payload?.frames || "?"}F]`);
          } else if (module === "WIFI_ALERT") {
            window.dispatchEvent(new CustomEvent('c2_telemetry', {
              detail: { module: "WIFI_ALERT", msg: payload?.detail || JSON.stringify(payload) }
            }));
            setMonitorLog(`ALERT: ${payload?.type || "IDS"} → ${payload?.ssid || payload?.detail || "?"}`);
          }
        } catch (e) {
          console.error("WS parse error:", e);
        }
      };

      ws.onclose = () => {
        setWsStatus("LOST");
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  // D-PAD físico
  useEffect(() => {
    if (!lastAction || lastAction.timestamp === lastTimestampRef.current) return;
    if (lastAction.timestamp < mountTimeRef.current) return;
    lastTimestampRef.current = lastAction.timestamp;
    const { type } = lastAction;

    if (modal.visible) { setModal(p => ({ ...p, visible: false })); return; }

    if (tier === 'action') {
      if (type === 'BACK' || type === 'LEFT') {
        sendC2Action("STOP_DEAUTH");           // primero detener ataque
        setTimeout(() => {
            sendC2Action("STOP_MONITOR");      // luego bajar interfaz
        }, 500);
        setIsInjecting(false);
        setStatusLog("ANTENNA: PASSIVE_STANDBY");
        setMonitorLog("CORE: HARDWARE REPLEGADO CON ÉXITO");
        setTier('sub_menu');
     }
      return;
    }

    if (tier === 'menu') {
      switch (type) {
        case 'UP': case 'LEFT':  setActiveBlock(p => (p - 1 + 3) % 3); break;
        case 'DOWN': case 'RIGHT': setActiveBlock(p => (p + 1) % 3); break;
        case 'OK': setTier('sub_menu'); setFunctionIdx(0); break;
      }
    } else if (tier === 'sub_menu') {
      const max = modulesConfig[activeBlock].functions.length;
      switch (type) {
        case 'UP':   setFunctionIdx(p => (p - 1 + max) % max); break;
        case 'DOWN': setFunctionIdx(p => (p + 1) % max); break;
        case 'OK': {
          const targetFuncId = modulesConfig[activeBlock].functions[functionIdx].id;
          if (activeBlock === 0) {
            setMonitorLog("KERNEL: ACTIVANDO MODO MONITOR EN INTERFAZ EXTERNA...");
            sendC2Action("INITIALIZE").then(r => {
              setMonitorLog(r?.status === "SUCCESS"
                ? "MONITOR: ESCUCHA PASIVA 802.11 ACTIVA — HOPPING EN CANALES 1-13"
                : "ERROR: FALLO AL ACTIVAR MODO MONITOR");
            });
          } else if (targetFuncId === "lan_scan") {
            setMonitorLog("NET: AGUARDANDO CREDENCIALES EN FORMULARIO L3...");
          } else if (activeBlock === 2) {
            if (targetFuncId === "mac_random") {
              sendC2Action("RANDOMIZE_MAC_TACTICAL").then(r => {
                setModal({ visible: true, title: "MAC MUTADA", msg: r?.detail || "OUI actualizado", extra: "Adaptador anonimizado." });
              });
              return;
            } else {
              setMonitorLog(`GUARD: WATCHDOG IDS ARMADO → ${targetFuncId.toUpperCase()}`);
              sendC2Action("START_DEFENSE_IDS", { modId: targetFuncId });
            }
          }
          setTier('action');
          break;
        }
        case 'BACK': case 'LEFT': setTier('menu'); break;
      }
    }
  }, [lastAction, tier, activeBlock, functionIdx, modal.visible]);

  const currentBlock = modulesConfig[activeBlock];
  const currentFunc = currentBlock.functions[functionIdx];
  const visibleCards = [-1, 0, 1].map(off => ({ ...modulesConfig[(activeBlock + off + 3) % 3], off }));

  const wsColor = wsStatus === "ONLINE" ? "#00aa00" : wsStatus === "LOST" ? "#cc0000" : "#ff9f1a";
  const wsLabel = wsStatus === "ONLINE" ? "● WS_ONLINE" : wsStatus === "LOST" ? "✕ WS_LOST — RETRY" : "○ WS_CONN...";

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', color: '#201000', padding: '15px 20px', fontFamily: 'monospace', boxSizing: 'border-box', background: 'transparent' }}>

      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', borderBottom: '3px solid #201000', paddingBottom: '6px', marginBottom: '15px', fontWeight: '900' }}>
        <span>SELECT_HARDWARE_BUS // WI-FI</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '8px', color: wsColor, fontWeight: '900' }}>{wsLabel}</span>
          <span style={{ background: '#201000', color: '#ff9f1a', padding: '0 8px', textTransform: 'uppercase' }}>{`SYS_${tier.toUpperCase()}`}</span>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>

        {/* TIER 1: Carrusel */}
        {tier === 'menu' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '40px', margin: '25px 0' }}>
              {visibleCards.map(({ id, icon, off }) => (
                <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: off === 0 ? 1 : 0.15, transform: off === 0 ? 'scale(1.35)' : 'scale(0.85)', transition: 'all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                  <div style={{ width: '70px', height: '70px' }}>{icon}</div>
                  {off === 0 && <span style={{ fontSize: '11px', fontWeight: '900', marginTop: '12px', background: '#201000', color: '#ff9f1a', padding: '2px 10px' }}>{id.toUpperCase()}</span>}
                </div>
              ))}
            </div>
            <div style={{ padding: '15px', border: '3px solid #201000', borderRadius: '12px', background: 'rgba(32,16,0,0.02)' }}>
              <div style={{ fontSize: '16px', fontWeight: '900' }}>{currentBlock.title}</div>
              <div style={{ fontSize: '11px', fontWeight: 'bold', opacity: 0.8, marginTop: '4px' }}>{currentBlock.desc}</div>
            </div>
          </div>
        )}

        {/* TIER 2: Sub-menú */}
        {tier === 'sub_menu' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', maxHeight: '165px' }}>
              {currentBlock.functions.map((func, i) => {
                const isSelected = i === functionIdx;
                return (
                  <div key={func.id} style={{ padding: '6px 12px', fontSize: '11px', fontWeight: '900', background: isSelected ? '#201000' : 'rgba(32,16,0,0.03)', color: isSelected ? '#ff9f1a' : '#201000', border: '1px solid #201000', borderRadius: '5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{func.label}</span>
                    {isSelected && <span style={{ fontSize: '9px', background: '#ff9f1a', color: '#201000', padding: '0 4px', borderRadius: '2px' }}>READY</span>}
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '10px', border: '3px solid #201000', borderRadius: '10px', background: 'rgba(32,16,0,0.02)', marginTop: '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: '900', borderBottom: '1px dashed #201000', paddingBottom: '2px', marginBottom: '6px' }}>
                [ VECTOR_DESCRIPCIÓN: {currentFunc.id.toUpperCase()} ]
              </div>
              <div style={{ fontSize: '10px', fontWeight: 'bold', lineHeight: '1.5', opacity: 0.85 }}>{currentFunc.desc}</div>
            </div>
          </div>
        )}

        {/* TIER 3: Acción */}
        {tier === 'action' && activeBlock === 0 && <WifiSpectrum functionIdx={functionIdx} lastAction={lastAction} accessPoints={accessPoints} probes={probes} />}
        {tier === 'action' && activeBlock === 1 && <WifiMitm functionIdx={functionIdx} lastAction={lastAction} sendC2Action={sendC2Action} accessPoints={accessPoints} clients={clients} isInjecting={isInjecting} setIsInjecting={setIsInjecting} setStatusLog={setStatusLog} />}
        {tier === 'action' && activeBlock === 2 && <WifiDefense functionIdx={functionIdx} lastAction={lastAction} sendC2Action={sendC2Action} />}

        {/* Modal */}
        {modal.visible && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(32,16,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99 }}>
            <div style={{ background: '#fff8f0', border: '3px solid #201000', borderRadius: '8px', padding: '16px 24px', maxWidth: '260px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: '900', marginBottom: '6px' }}>{modal.title}</div>
              <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '4px' }}>{modal.msg}</div>
              <div style={{ fontSize: '9px', opacity: 0.7 }}>{modal.extra}</div>
              <div style={{ fontSize: '9px', marginTop: '10px', opacity: 0.5 }}>[ CUALQUIER BOTÓN PARA CERRAR ]</div>
            </div>
          </div>
        )}
      </div>

      {/* Terminal */}
      <div style={{ marginTop: '8px', height: '42px', background: 'rgba(32,16,0,0.05)', border: '2px solid #201000', borderRadius: '6px', padding: '5px 8px', fontSize: '9px', display: 'flex', flexDirection: 'column', gap: '2px', fontWeight: 'bold', overflow: 'hidden' }}>
        <div>&gt; {monitorLog}</div>
        <div>&gt; {statusLog}</div>
      </div>
    </div>
  );
}