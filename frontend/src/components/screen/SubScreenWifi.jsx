import React, { useState, useEffect, useRef } from 'react';
import WifiSpectrum from './wifi/WifiSpectrum';
import WifiMitm from './wifi/WifiMitm';
import WifiDefense from './wifi/WifiDefense';

export default function SubScreenWifi({ lastAction }) {
  const [tier, setTier] = useState('menu'); 
  const [activeBlock, setActiveBlock] = useState(0); 
  const [functionIdx, setFunctionIdx] = useState(0);

  // Estados de telemetría de red compartidos
  const [accessPoints, setAccessPoints] = useState([]);
  const [clients, setClients] = useState([]);
  const [probes, setProbes] = useState([]);

  const [monitorLog, setMonitorLog] = useState("CORE: RF_BUS EN LINEA");
  const [statusLog, setStatusLog] = useState("ANTENNA: PASSIVE_STANDBY");
  const [isInjecting, setIsInjecting] = useState(false);
  const [modal, setModal] = useState({ visible: false, title: '', msg: '', extra: '' });

  const lastTimestampRef = useRef(null);
  const mountTimeRef = useRef(Date.now());

  const modulesConfig = [
    { 
      id: "spectrum", 
      title: "SPECTRUM ANALYSER", 
      desc: "Capa 2 - Monitoreo de Espectro y RF", 
      icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z" opacity="0.15"/><path d="M12 6v12M8 10v4M4 11v2M16 8v8M20 11v2" /></svg>), 
      functions: [
        { id: "scan_air", label: "01. Beacon Passive Scanning", desc: "Monitorea la densidad de routers activos en el aire graficando su potencia (RSSI)." },
        { id: "probe_sniff", label: "02. Client Probing Sniffer", desc: "Detecta qué redes Wi-Fi guardadas buscan los celulares que van pasando cerca." },
        { id: "wps_discover", label: "03. WPS Feature Discovery", desc: "Muestra únicamente las redes vulnerables que tienen el PIN de emparejamiento abierto." },
        { id: "hidden_reveal", label: "04. Hidden SSID Revealer", desc: "Captura paquetes de asociación para desenmascarar el nombre real de redes ocultas." },
        { id: "station_map", label: "05. Wireless Station Mapper", desc: "Tabla relacional que vincula qué dispositivos cliente están conectados a cada antena." }
      ]
    },
    { 
      id: "mitm", 
      title: "MITM & NET ATTACKS", 
      desc: "Capa 3 - Manipulación de Vector de Red", 
      icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="3" opacity="0.15"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6" /></svg>), 
      functions: [
        { id: "lan_scan", label: "06. LAN Discovery (Active ARP)", desc: "Inyecta tramas ARP Request en la red local vía wlo1 para mapear IPs y MACs conectadas." },
        { id: "arp_spoof", label: "07. ARP Spoofing Bridge", desc: "Envenena las tablas de enrutamiento del router para desviar la navegación de una víctima." },
        { id: "dns_spoof", label: "08. DNS Spoofer Local", desc: "Falsifica respuestas de dominio DNS para redirigir peticiones locales a tu C2." },
        { id: "deauth_burst", label: "09. Pure Deauth Tactical Burst", desc: "Envía una ráfaga Deauth masiva a un canal para desautenticar clientes inalámbricos." },
        { id: "eapol_trap", label: "10. WPA Handshake Sniffer Trap", desc: "Monta una trampa pasiva para capturar e indexar los intercambios de llaves de seguridad." }
      ]
    },
    { 
      id: "defense", 
      title: "TACTICAL DEFENSE", 
      desc: "Módulos Anti-Intrusión & Watchdogs", 
      icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>), 
      functions: [
        { id: "anti_deauth", label: "11. Anti-Deauth Monitor", desc: "Vigila de forma pasiva si hay atacantes externos inyectando desautenticaciones en tu subred." },
        { id: "twin_detect", label: "12. Evil Twin / BSSID Detector", desc: "Inspecciona si hay routers duplicados intentando clonar la identidad de tu infraestructura." },
        { id: "ap_locator", label: "13. Rogue AP Locator (RSSI)", desc: "Medidor acústico proporcional para hallar físicamente un transmisor mediante potencia de señal." },
        { id: "arp_watchdog", label: "14. LAN ARP Poisoning Watch", desc: "Alerta en tiempo real si hay otra máquina envenenando las tablas de red de tu propia casa." },
        { id: "mac_random", label: "15. Mac Address Randomizer", desc: "Muta la dirección física de la interfaz de red inalámbrica para evadir cortafuegos locales." }
      ]
    }
  ];

  const sendC2Action = async (cmd, params = {}) => {
    try {
      await fetch("http://127.0.0.1:8000/api/wifi/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd, ...params })
      });
    } catch (err) { setMonitorLog("C2 ERR: Bus REST denegado"); }
  };

  useEffect(() => {
    const ws = new WebSocket("ws://127.0.0.1:8000/ws/control");
    ws.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data);
        if (Array.isArray(packet)) setAccessPoints(packet);
        else if (packet.module === "WIFI_LAN_HOSTS") setClients(packet.data);
        else if (packet.module === "WIFI_SPECTRUM") setAccessPoints(packet.data);
        else if (packet.module === "WIFI_PROBES") setProbes(packet.data);
      } catch (e) {}
    };
    return () => ws.close();
  }, []);

  // 🎮 CAPTURA CENTRALIZADA INTEGRAL DEL D-PAD FÍSICO
  useEffect(() => {
    if (!lastAction || lastAction.timestamp === lastTimestampRef.current) return;
    if (lastAction.timestamp < mountTimeRef.current) return;
    lastTimestampRef.current = lastAction.timestamp;
    const { type } = lastAction;

    if (modal.visible) { setModal(p => ({ ...p, visible: false })); return; }

    // 🟢 CONTROL DE INTERRUPCIÓN GLOBAL (TIER 3)
    if (tier === 'action') {
      if (type === 'BACK' || type === 'LEFT') {
        console.log("[C2 HARDWARE] Deteniendo transmisiones y cerrando descriptores...");
        sendC2Action("STOP_MONITOR"); 
        setIsInjecting(false);
        setStatusLog("ANTENNA: PASSIVE_STANDBY");
        setMonitorLog("CORE: HARDWARE REPLEGADO CON ÉXITO");
        setTier('sub_menu');
      }
      return; 
    }

    if (tier === 'menu') {
      switch (type) {
        case 'UP': case 'LEFT': setActiveBlock(p => (p - 1 + 3) % 3); break;
        case 'DOWN': case 'RIGHT': setActiveBlock(p => (p + 1) % 3); break;
        case 'OK': setTier('sub_menu'); setFunctionIdx(0); break;
      }
    } 
    else if (tier === 'sub_menu') {
      const max = modulesConfig[activeBlock].functions.length;
      switch (type) {
        case 'UP': setFunctionIdx(p => (p - 1 + max) % max); break;
        case 'DOWN': setFunctionIdx(p => (p + 1) % max); break;
        
        case 'OK': 
          // 🟢 ORQUESTACIÓN DE ENCENDIDO TÁCTICO CONTROLADO
          const targetFuncId = modulesConfig[activeBlock].functions[functionIdx].id;
          
          if (activeBlock === 0) {
            setMonitorLog("KERNEL: INTERCEPCIÓN RADAR ACTIVA VÍA wlp8s0f3u1");
            sendC2Action("INITIALIZE");
          } else if (targetFuncId === "lan_scan") {
            setMonitorLog("NET: BARRIDO ARP DISPARADO EN INTERFAZ wlo1");
            sendC2Action("LAN_SCAN", { range: "192.168.1.0/24" });
          } else if (targetFuncId === "mac_random") {
            setModal({ visible: true, title: "MAC MUTADA", msg: "REGISTROS OUI ACTUALIZADOS EN EL KERNEL", extra: "wlp8s0f3u1 alterada con éxito." });
            sendC2Action("INITIALIZE");
            return; 
          }
          
          setTier('action'); 
          break;
          
        case 'BACK': case 'LEFT': 
          setTier('menu'); 
          break;
      }
    }
  }, [lastAction, tier, activeBlock, functionIdx, modal.visible]);

  const currentBlock = modulesConfig[activeBlock];
  const currentFunc = currentBlock.functions[functionIdx];
  const visibleCards = [-1, 0, 1].map(off => ({ ...modulesConfig[(activeBlock + off + 3) % 3], off }));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', color: '#201000', padding: '15px 20px', fontFamily: 'monospace', position: 'relative', boxSizing: 'border-box', background: 'transparent' }}>
      
      {/* Cabecera Sepia */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '3px solid #201000', paddingBottom: '6px', marginBottom: '15px', fontWeight: '900' }}>
        <span>SELECT_HARDWARE_BUS // WI-FI</span>
        <span style={{ background: '#201000', color: '#ff9f1a', padding: '0 8px', textTransform: 'uppercase' }}>{`SYS_${tier.toUpperCase()}`}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        
        {/* TIER 1: Carrusel Horizontal */}
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

        {/* TIER 2: Lista de Comandos */}
        {tier === 'sub_menu' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', maxHeight: '165px' }}>
              {currentBlock.functions.map((func, i) => {
                const isSelected = i === functionIdx;
                return (
                  <div key={func.id} style={{
                    padding: '6px 12px', fontSize: '11px', fontWeight: '900',
                    background: isSelected ? '#201000' : 'rgba(32,16,0,0.03)',
                    color: isSelected ? '#ff9f1a' : '#201000',
                    border: '1px solid #201000', borderRadius: '5px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <span>{func.label}</span>
                    {isSelected && <span style={{ fontSize: '9px', background: '#ff9f1a', color: '#201000', padding: '0 4px', borderRadius: '2px' }}>READY</span>}
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '10px', border: '3px solid #201000', borderRadius: '10px', background: 'rgba(32,16,0,0.02)', marginTop: '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: '900', borderBottom: '1px dashed #201000', paddingBottom: '2px', marginBottom: '4px' }}>
                <span>[ VECTOR_DESCRIPCIÓN: {currentFunc.id.toUpperCase()} ]</span>
              </div>
              <div style={{ fontSize: '10px', fontWeight: 'bold', lineHeight: '1.3', opacity: 0.85 }}>{currentFunc.desc}</div>
            </div>
          </div>
        )}

        {/* TIER 3: Renderizado Modular de Sub-Páginas */}
        {tier === 'action' && activeBlock === 0 && <WifiSpectrum functionIdx={functionIdx} lastAction={lastAction} accessPoints={accessPoints} probes={probes} />}
        {tier === 'action' && activeBlock === 1 && <WifiMitm functionIdx={functionIdx} lastAction={lastAction} sendC2Action={sendC2Action} accessPoints={accessPoints} clients={clients} isInjecting={isInjecting} setIsInjecting={setIsInjecting} setStatusLog={setStatusLog} />}
        {tier === 'action' && activeBlock === 2 && <WifiDefense functionIdx={functionIdx} lastAction={lastAction} />}

      </div>

      {/* Terminal Industrial */}
      <div style={{ marginTop: '8px', height: '42px', background: 'rgba(32,16,0,0.05)', border: '2px solid #201000', borderRadius: '6px', padding: '5px 8px', fontSize: '9px', display: 'flex', flexDirection: 'column', gap: '2px', fontWeight: 'bold', overflow: 'hidden' }}>
        <div>&gt; {monitorLog}</div>
        <div>&gt; {statusLog}</div>
      </div>
    </div>
  );
}