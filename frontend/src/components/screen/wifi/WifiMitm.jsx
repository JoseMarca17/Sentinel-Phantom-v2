import React, { useState, useEffect } from 'react';

export default function WifiMitm({ functionIdx, lastAction, sendC2Action, accessPoints, clients, isInjecting, setIsInjecting, setStatusLog }) {
  const [listIdx, setListIdx] = useState(0);
  const [handshakesPool, setHandshakesPool] = useState([]);
  
  // 🟢 CREDENCIALES Y LOGS DE ESTADO EN CALIENTE
  const [inputSsid, setInputSsid] = useState("JOSEANDRES");
  const [inputPass, setInputPass] = useState(""); // Rellenar con la clave en uso
  const [connectionStatus, setConnectionStatus] = useState("STANDBY"); // STANDBY, CONNECTING, LINK_OK, AUTH_ERR

  const subModules = [
    { id: "lan_scan", label: "06. LAN Discovery (Active ARP)" },
    { id: "arp_spoof", label: "07. ARP Spoofing Bridge" },
    { id: "dns_spoof", label: "08. DNS Spoofer Local" },
    { id: "deauth_burst", label: "09. Pure Deauth Tactical Burst" },
    { id: "eapol_trap", label: "10. WPA Handshake Sniffer Trap" }
  ];

  const currentId = subModules[functionIdx]?.id || "lan_scan";

  const safeClients = Array.isArray(clients) ? clients : [];
  const safeAPs = Array.isArray(accessPoints) ? accessPoints : [];
  const safeHandshakes = Array.isArray(handshakesPool) ? handshakesPool : [];

  useEffect(() => {
    if (currentId === "eapol_trap") {
      fetch("http://127.0.0.1:8000/api/wifi/handshakes")
        .then(r => r.json())
        .then(data => setHandshakesPool(data || []))
        .catch(() => console.log("[-] Error sincronizando repositorio de llaves"));
    }
  }, [currentId]);

  useEffect(() => {
    // Si cambia de submódulo y ya hay clientes detectados, preservamos el estado para no bloquear la UX
    if (safeClients.length === 0 && currentId === "lan_scan") {
      setConnectionStatus("STANDBY");
      setIsInjecting(false);
    }
    setListIdx(0);
  }, [functionIdx, safeClients.length]);

  // Secuencia de Conexión con captura de Callback para la UI
  const ejecutarConexionTactica = () => {
    if (isInjecting) return;
    setIsInjecting(true);
    setConnectionStatus("CONNECTING");
    setStatusLog("NET: ISOLATING wlo1 && ASOCIANDO ANTENA ADAPTADA...");
    
    // Forzamos el paso explícito del objetivo para no alterar interfaces globales
    sendC2Action("LINK_NET", { ssid: inputSsid, password: inputPass, target_interface: "EXTERNAL" })
      .then((res) => {
        if (res && res.status === "SUCCESS" || res?.detail?.includes("completada")) {
          setConnectionStatus("LINK_OK");
          setStatusLog("NET: ADQUISICIÓN L3 EXITOSA -> ESCANEANDO SUBRED...");
          sendC2Action("LAN_SCAN", {});
        } else {
          setConnectionStatus("AUTH_ERR");
          setIsInjecting(false);
          setStatusLog("NET ERR: CREDENCIALES RECHAZADAS O TIMEOUT EN INTERFAZ");
        }
      })
      .catch(() => {
        setConnectionStatus("AUTH_ERR");
        setIsInjecting(false);
      });
  };

  // 🎮 CAPTURADOR DEL D-PAD FÍSICO OPTIMIZADO PARA EVITAR COLISIONES EN CAPA 3
  useEffect(() => {
    if (!lastAction) return;
    const { type } = lastAction;

    let maxItems = 0;
    if (currentId === "lan_scan" || currentId === "arp_spoof" || currentId === "dns_spoof") {
      maxItems = safeClients.length;
    } else if (currentId === "deauth_burst" || currentId === "eapol_trap") {
      maxItems = safeAPs.length;
    }

    if (type === 'OK' && !isInjecting) {
      if (currentId === "lan_scan" && maxItems === 0) {
        ejecutarConexionTactica();
        return;
      }

      if (maxItems === 0) return;

      // 💥 VECTORES DE INYECCIÓN CAPA 3
      if (currentId === "arp_spoof" || currentId === "dns_spoof") {
        const targetClient = safeClients[listIdx];
        if (targetClient) {
          setIsInjecting(true);
          if (currentId === "arp_spoof") {
            setStatusLog(`SPOOF: EJECUTANDO REDIRECCIÓN EN ENLACE -> ${targetClient.ip}`);
            sendC2Action("ARP_SPOOF_TARGET", { ip: targetClient.ip, mac: targetClient.mac });
          } else if (currentId === "dns_spoof") {
            setStatusLog(`DNS: SUPLANTANDO RESPUESTAS DE DOMINIO -> ${targetClient.ip}`);
            sendC2Action("DNS_SPOOF_TARGET", { ip: targetClient.ip });
          }
        }
        return;
      }

      // 💥 VECTORES DE INYECCIÓN CAPA 2 (RADIO)
      const targetAP = safeAPs[listIdx];
      if (targetAP) {
        setIsInjecting(true);
        if (currentId === "deauth_burst") {
          setStatusLog(`TX-BURST: INYECTANDO DESAUTENTICACIÓN CONTINUA -> ${targetAP.bssid}`);
          sendC2Action("DEAUTH_TARGET", { bssid: targetAP.bssid, client: "FF:FF:FF:FF:FF:FF", currentId: "deauth_burst" });
        } else if (currentId === "eapol_trap") {
          setStatusLog(`TRAP: CAPTURADOR EAPOL EN CANAL ${targetAP.channel} OPERANDO...`);
          sendC2Action("DEAUTH_TARGET", { bssid: targetAP.bssid, currentId: "eapol_trap" });
        }
      }
      return;
    }

    if (maxItems === 0) return;

    switch (type) {
      case 'UP': setListIdx(p => (p - 1 + maxItems) % maxItems); break;
      case 'DOWN': setListIdx(p => (p + 1) % maxItems); break;
      default: break;
    }
  }, [lastAction, safeAPs, safeClients, listIdx, isInjecting, currentId, inputSsid, inputPass]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', height: '100%', fontFamily: 'monospace' }}>
      
      {/* Header Táctico */}
      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#201000', color: '#ff9f1a', padding: '4px 8px', fontSize: '9px', fontWeight: '900', borderRadius: '3px' }}>
        <span>VECTOR_MITM: {subModules[functionIdx]?.label.toUpperCase()}</span>
        <span style={{ color: '#ff9f1a' }}>● ATK_BUS</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(32,16,0,0.02)', border: '2px solid #201000', borderRadius: '6px', padding: '6px', overflow: 'hidden' }}>
        
        {/* 🛠️ MODULO 06: LAN DISCOVERY (CON RENDER DE UX TRIPLE ACCIÓN) */}
        {currentId === "lan_scan" && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            {/* CASO A: Nmap ya arrojó resultados válidos por el bus de Sockets */}
            {safeClients.length > 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px solid #201000', paddingBottom: '2px', marginBottom: '4px' }}>MAPA DINÁMICO DE SUBRED (OS FINGERPRINTING):</div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {safeClients.map((c, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', padding: '4px', borderBottom: '1px dashed rgba(32,16,0,0.1)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#201000' }}>IP: {c.ip}</span>
                        <span style={{ fontSize: '9px', background: '#201000', color: '#ff9f1a', padding: '1px 4px', borderRadius: '2px', fontWeight: 'bold' }}>{c.mac || "DETECTED"}</span>
                      </div>
                      <span style={{ fontSize: '9px', color: '#885500', fontStyle: 'italic', fontWeight: 'bold', marginTop: '1px' }}>
                        ⚡ {c.tipo || "ANALIZANDO ENTORNO TCP/IP..."}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : 
            
            connectionStatus === "LINK_OK" || connectionStatus === "CONNECTING" ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <div style={{ fontSize: '11px', fontWeight: '900', color: '#ff9f1a', background: '#201000', padding: '4px 12px', borderRadius: '3px' }}>
                  {connectionStatus === "CONNECTING" ? "⚙️ CONFIGURANDO ENLACE..." : "📡 ENLACE TOTALMENTE ASOCIADO"}
                </div>
                <div style={{ fontSize: '9px', fontWeight: 'bold', textAlign: 'center', maxWidth: '85%', lineHeight: '1.4' }}>
                  {connectionStatus === "CONNECTING" 
                    ? "Negociando direccionamiento dinámico con el AP objetivo a través del driver..." 
                    : "Analizando respuestas de la subred local mediante huellas TCP/IP. El mapa de hosts se poblará automáticamente en unos instantes..."}
                </div>
                <div style={{ width: '75%', height: '5px', border: '1px solid #201000', borderRadius: '2px', background: 'rgba(32,16,0,0.05)', overflow: 'hidden', marginTop: '4px' }}>
                  <div style={{ height: '100%', width: '100%', background: '#201000', opacity: 0.6 }} />
                </div>
              </div>
            ) : (
              
              /* CASO C: Estado Standby / Error de autenticación (Formulario Base Abierto) */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', justifyContent: 'center' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', background: '#201000', padding: '4px 8px', borderRadius: '3px', fontSize: '8px', fontWeight: 'bold' }}>
                  <span style={{ color: '#ff9f1a' }}>LINK_ADAPTER: INTERFAZ_EXTERNA</span>
                  {connectionStatus === "STANDBY" && <span style={{ color: '#888' }}>● STANDBY</span>}
                  {connectionStatus === "AUTH_ERR" && <span style={{ color: '#ff0000' }}>⚠️ AUTH_FAILED</span>}
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <label style={{ fontSize: '8px', fontWeight: 'bold', opacity: 0.7 }}>SSID TARGET:</label>
                  <input 
                    type="text" 
                    value={inputSsid}
                    onChange={(e) => setInputSsid(e.target.value)}
                    placeholder="Escribe el SSID..."
                    style={{ background: 'rgba(32,16,0,0.04)', border: '1px solid #201000', color: '#201000', padding: '3px 6px', fontSize: '10px', fontWeight: 'bold', outline: 'none', borderRadius: '3px' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <label style={{ fontSize: '8px', fontWeight: 'bold', opacity: 0.7 }}>PASSWORD:</label>
                  <input 
                    type="password" 
                    value={inputPass}
                    onChange={(e) => setInputPass(e.target.value)}
                    placeholder="Contraseña..."
                    style={{ background: 'rgba(32,16,0,0.04)', border: '1px solid #201000', color: '#201000', padding: '3px 6px', fontSize: '10px', fontWeight: 'bold', outline: 'none', borderRadius: '3px' }}
                  />
                </div>

                <button 
                  onClick={ejecutarConexionTactica}
                  disabled={isInjecting}
                  style={{ 
                    marginTop: '4px', padding: '6px', 
                    background: isInjecting ? 'rgba(32,16,0,0.2)' : '#201000', 
                    color: '#ff9f1a', border: '1px solid #ff9f1a',
                    textAlign: 'center', fontSize: '9px', fontWeight: '950', borderRadius: '4px', 
                    cursor: isInjecting ? 'not-allowed' : 'pointer', letterSpacing: '0.5px'
                  }}
                >
                  {connectionStatus === "CONNECTING" ? "[ ESTABLECIENDO ENLACE... ]" : "⚡ [ COMPROMETER ENLACE L3 Y ESCANEAR ] ⚡"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 07 y 08. Módulos de Suplantación L3 */}
        {(currentId === "arp_spoof" || currentId === "dns_spoof") && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px solid #201000', paddingBottom: '2px', marginBottom: '4px' }}>OBJETIVOS DISPONIBLES EN CAPA 3:</div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {safeClients.map((c, i) => {
                const isSelected = i === listIdx;
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', padding: '3px', background: isSelected ? '#201000' : 'transparent', color: isSelected ? '#ff9f1a' : '#201000' }}>
                    <span>{isSelected ? `► IP: ${c.ip}` : `  IP: ${c.ip}`}</span>
                    <span>[ REDIRECCIONAR TRÁFICO ]</span>
                  </div>
                );
              })}
              {safeClients.length === 0 && <div style={{ fontSize: '9px', opacity: 0.5, textAlign: 'center', marginTop: '20px' }}>REQUIERE MAPEO PREVIO EN LA OPCIÓN 06</div>}
            </div>
          </div>
        )}

        {/* 09. Deauth Puro */}
        {currentId === "deauth_burst" && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px solid #201000', paddingBottom: '2px', marginBottom: '4px' }}>INYECTAR DESAUTENTICACIÓN MASIVA A PUNTOS DE ACCESO:</div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {safeAPs.map((ap, i) => {
                const isSelected = i === listIdx;
                return (
                  <div key={ap.bssid} style={{ padding: '4px', background: isSelected ? '#201000' : 'transparent', color: isSelected ? '#ff9f1a' : '#201000', fontSize: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>{isSelected ? `► ${ap.ssid}` : `  ${ap.ssid}`}</span>
                    <span>CH: {ap.channel} | {ap.rssi} dBm</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 10. Interceptor Handshake */}
        {currentId === "eapol_trap" && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px solid #201000', paddingBottom: '2px' }}>DESPLEGAR TRAMPA SNIFFER CONTRA AP OBJETIVO:</div>
            <div style={{ overflowY: 'auto', maxHeight: '60px' }}>
              {safeAPs.map((ap, i) => {
                const isSelected = i === listIdx;
                return (
                  <div key={ap.bssid} style={{ padding: '3px', background: isSelected ? '#201000' : 'transparent', color: isSelected ? '#ff9f1a' : '#201000', fontSize: '9px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>{isSelected ? `► ${ap.ssid}` : `  ${ap.ssid}`}</span>
                    <span>MAC: {ap.bssid.slice(0, 12)}...</span>
                  </div>
                );
              })}
            </div>
            <div style={{ flex: 1, border: '1px solid #201000', borderRadius: '4px', background: 'rgba(32,16,0,0.04)', padding: '4px', overflowY: 'auto' }}>
              <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px dashed #201000', color: '#201000' }}>🗄️ ARCHIVOS DE CAPTURA CONFIRMADOS (.PCAP):</div>
              {safeHandshakes.map((h, i) => (
                <div key={i} style={{ fontSize: '8px', display: 'flex', justifyContent: 'space-between', color: '#00aa00', fontWeight: 'bold' }}>
                  <span>📦 BSSID: {h.bssid}</span>
                  <span>✓ REPOSITORY_INDEXED</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Footer Fijo */}
      <div style={{ fontSize: '9px', background: '#201000', color: '#ff9f1a', padding: '4px 8px', textAlign: 'center', fontWeight: '900', borderRadius: '3px' }}>
        {isInjecting ? "🚨 BUS DE RED COMPROMETIDO POR TRANSPORTE REST..." : "[ COMPRESIÓN DE VECTORES DE RED COMPLETA ]"}
      </div>

    </div>
  );
}