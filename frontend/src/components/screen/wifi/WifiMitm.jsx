import React, { useState, useEffect } from 'react';

export default function WifiMitm({ functionIdx, lastAction, sendC2Action, accessPoints, clients, isInjecting, setIsInjecting, setStatusLog }) {
  const [listIdx, setListIdx] = useState(0);
  const [handshakesPool, setHandshakesPool] = useState([]);
  const [inputSsid, setInputSsid] = useState("");
  const [inputPass, setInputPass] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("STANDBY");
  const [attackLog, setAttackLog] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const subModules = [
    { id: "lan_scan",     label: "06. LAN Discovery (Nmap)" },
    { id: "arp_spoof",    label: "07. ARP Spoofing Bridge" },
    { id: "dns_spoof",    label: "08. DNS Spoofer Local" },
    { id: "deauth_burst", label: "09. Deauth Tactical Burst" },
    { id: "eapol_trap",   label: "10. WPA Handshake Sniffer Trap" }
  ];

  const currentId = subModules[functionIdx]?.id || "lan_scan";
  const safeClients = Array.isArray(clients) ? clients : [];
  const safeAPs = Array.isArray(accessPoints) ? accessPoints : [];
  const safeHandshakes = Array.isArray(handshakesPool) ? handshakesPool : [];

  const addLog = (msg) => setAttackLog(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p.slice(0, 19)]);

  const ejecutarRefrescoActivo = () => {
    if (isRefreshing || isInjecting) return;
    setIsRefreshing(true);
    setStatusLog("WIFI: FORZANDO ESCANEO ACTIVO...");
    addLog("SOLICITANDO REFRESCO DE ESPECTRO (PROBE REQS)...");

    sendC2Action("REFRESH_SPECTRUM", {})
      .then((res) => {
        if (res && res.status === "SUCCESS") {
          addLog("RE-SINCRO OK → MONITOREANDO EMISIONES CELULARES/AP");
        } else {
          addLog("ERROR EN SUBSISTEMA DE RADIO AL REFRESCAR");
        }
      })
      .catch(() => addLog("FALLO DE TRANSPORTE EN ACCIÓN TÁCTICA"))
      .finally(() => setIsRefreshing(false));
  };

  useEffect(() => {
    if (currentId === "eapol_trap") {
      fetch("http://127.0.0.1:8000/api/wifi/handshakes")
        .then(r => r.json())
        .then(data => setHandshakesPool(data || []))
        .catch(() => {});
    }
  }, [currentId]);

  useEffect(() => {
    setListIdx(0);
  }, [functionIdx]);

  const ejecutarConexionTactica = () => {
    if (isInjecting || !inputSsid) return;
    setIsInjecting(true);
    setConnectionStatus("CONNECTING");
    setStatusLog("NET: ASOCIANDO ANTENA EXTERNA...");
    addLog(`LINK_NET → SSID: "${inputSsid}"`);

    sendC2Action("LINK_NET", { ssid: inputSsid, password: inputPass })
      .then((res) => {
        if (res && (res.status === "SUCCESS" || res?.detail?.includes("completada"))) {
          setConnectionStatus("LINK_OK");
          setStatusLog("NET: ENLACE L3 OK → ESCANEANDO SUBRED...");
          addLog("ENLACE EXITOSO → LANZANDO NMAP...");
          sendC2Action("LAN_SCAN", {}).then(() => addLog("NMAP COMPLETADO → HOSTS EN TABLA"));
        } else {
          setConnectionStatus("AUTH_ERR");
          setIsInjecting(false);
          setStatusLog("NET ERR: CREDENCIALES RECHAZADAS");
          addLog("ERROR: CREDENCIALES INVÁLIDAS O TIMEOUT");
        }
      })
      .catch(() => {
        setConnectionStatus("AUTH_ERR");
        setIsInjecting(false);
        addLog("ERROR CRÍTICO: FALLO DE TRANSPORTE REST");
      });
  };

  useEffect(() => {
    if (!lastAction) return;
    const { type } = lastAction;

    const maxItems = (currentId === "lan_scan" || currentId === "arp_spoof" || currentId === "dns_spoof")
      ? safeClients.length
      : safeAPs.length;

    if (type === 'OK' && !isInjecting) {
      if (currentId === "lan_scan" && safeClients.length === 0) {
        ejecutarConexionTactica();
        return;
      }
      if (maxItems === 0) return;

      if (currentId === "arp_spoof" || currentId === "dns_spoof") {
        const target = safeClients[listIdx];
        if (!target) return;
        setIsInjecting(true);
        if (currentId === "arp_spoof") {
          setStatusLog(`SPOOF: ENVENENANDO ARP → ${target.ip}`);
          addLog(`ARP_SPOOF → VÍCTIMA: ${target.ip} (${target.mac})`);
          sendC2Action("ARP_SPOOF_TARGET", { ip: target.ip, mac: target.mac });
        } else {
          setStatusLog(`DNS: SUPLANTANDO DOMINIO → ${target.ip}`);
          addLog(`DNS_SPOOF → VÍCTIMA: ${target.ip}`);
          sendC2Action("DNS_SPOOF_TARGET", { ip: target.ip });
        }
        return;
      }

      const targetAP = safeAPs[listIdx];
      if (!targetAP) return;
      setIsInjecting(true);

      if (currentId === "deauth_burst") {
        setStatusLog(`DEAUTH: INYECTANDO FRAMES → ${targetAP.bssid}`);
        addLog(`DEAUTH CONTINUO → AP: "${targetAP.ssid}" CH${targetAP.channel} [30s]`);
        sendC2Action("DEAUTH_TARGET", { bssid: targetAP.bssid, client: "FF:FF:FF:FF:FF:FF", channel : targetAP.channel, currentId: "deauth_burst" });
      } else if (currentId === "eapol_trap") {
        setStatusLog(`EAPOL: TRAMPA ACTIVA EN CH${targetAP.channel} → ${targetAP.bssid}`);
        addLog(`EAPOL TRAP → AP: "${targetAP.ssid}" — ESPERANDO 4 FRAMES WPA2...`);
        sendC2Action("DEAUTH_TARGET", { bssid: targetAP.bssid, client: "FF:FF:FF:FF:FF:FF", channel : targetAP.channel, currentId: "eapol_trap" });
      }
      return;
    }

    if (type === 'BACK' && isInjecting) {
      sendC2Action("STOP_DEAUTH");
      setIsInjecting(false);
      setStatusLog("ATAQUE DETENIDO MANUALMENTE");
      addLog("STOP → DEAUTH/EAPOL CANCELADO");
      return;
    }

    if (maxItems === 0) return;
    if (type === 'UP')   setListIdx(p => (p - 1 + maxItems) % maxItems);
    if (type === 'DOWN') setListIdx(p => (p + 1) % maxItems);
  }, [lastAction, safeAPs, safeClients, listIdx, isInjecting, currentId, inputSsid, inputPass]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', height: '100%', fontFamily: 'monospace' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#201000', color: '#ff9f1a', padding: '4px 8px', fontSize: '9px', fontWeight: '900', borderRadius: '3px' }}>
        <span>{subModules[functionIdx]?.label.toUpperCase()}</span>
        <span style={{ color: isInjecting ? '#ff4444' : '#ff9f1a' }}>{isInjecting ? '● ATAQUE ACTIVO' : '○ STANDBY'}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(32,16,0,0.02)', border: '2px solid #201000', borderRadius: '6px', padding: '6px', overflow: 'hidden' }}>

        {/* 06: LAN Scan */}
        {currentId === "lan_scan" && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            {safeClients.length > 0 ? (
              <>
                <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px solid #201000', paddingBottom: '2px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>HOSTS DETECTADOS EN SUBRED:</span>
                  <span>{safeClients.length} HOSTS</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {safeClients.map((c, i) => (
                    <div key={i} style={{ padding: '4px 6px', border: '1px dashed rgba(32,16,0,0.2)', borderRadius: '3px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: '900' }}>
                        <span>{c.ip}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '8px', background: '#201000', color: '#ff9f1a', padding: '1px 4px' }}>{c.mac || "DETECTED"}</span>
                      </div>
                      <div style={{ fontSize: '8px', color: '#885500', marginTop: '2px', fontStyle: 'italic' }}>⚡ {c.tipo || "ANALIZANDO HUELLA TCP/IP..."}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : connectionStatus === "CONNECTING" || connectionStatus === "LINK_OK" ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: '900', background: '#201000', color: '#ff9f1a', padding: '4px 16px', borderRadius: '3px' }}>
                  {connectionStatus === "CONNECTING" ? "⚙ CONFIGURANDO ENLACE..." : "📡 ENLACE ASOCIADO — ESCANEANDO..."}
                </div>
                <div style={{ fontSize: '9px', textAlign: 'center', opacity: 0.7, lineHeight: '1.5', maxWidth: '85%' }}>
                  {connectionStatus === "CONNECTING"
                    ? "Negociando DHCP con el AP objetivo..."
                    : "Nmap analizando subred. Los hosts aparecerán automáticamente."}
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', justifyContent: 'center' }}>
                <div style={{ fontSize: '8px', fontWeight: '900', background: '#201000', color: connectionStatus === "AUTH_ERR" ? '#ff4444' : '#ff9f1a', padding: '3px 8px', borderRadius: '3px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>ASOCIAR ANTENA EXTERNA A RED</span>
                  <span>{connectionStatus === "AUTH_ERR" ? "⚠ AUTH_FAILED" : "● STANDBY"}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <label style={{ fontSize: '8px', fontWeight: 'bold', opacity: 0.7 }}>SSID OBJETIVO:</label>
                  <input type="text" value={inputSsid} onChange={e => setInputSsid(e.target.value)} placeholder="Nombre de la red..." style={{ background: 'rgba(32,16,0,0.04)', border: '1px solid #201000', color: '#201000', padding: '3px 6px', fontSize: '10px', fontWeight: 'bold', outline: 'none', borderRadius: '3px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <label style={{ fontSize: '8px', fontWeight: 'bold', opacity: 0.7 }}>CONTRASEÑA:</label>
                  <input type="password" value={inputPass} onChange={e => setInputPass(e.target.value)} placeholder="WPA2 key..." style={{ background: 'rgba(32,16,0,0.04)', border: '1px solid #201000', color: '#201000', padding: '3px 6px', fontSize: '10px', fontWeight: 'bold', outline: 'none', borderRadius: '3px' }} />
                </div>
                <button onClick={ejecutarConexionTactica} disabled={isInjecting || !inputSsid} style={{ marginTop: '2px', padding: '6px', background: (!inputSsid || isInjecting) ? 'rgba(32,16,0,0.15)' : '#201000', color: '#ff9f1a', border: '1px solid #ff9f1a', fontSize: '9px', fontWeight: '900', borderRadius: '4px', cursor: (!inputSsid || isInjecting) ? 'not-allowed' : 'pointer' }}>
                  ⚡ COMPROMETER ENLACE L3 Y ESCANEAR SUBRED
                </button>
              </div>
            )}
          </div>
        )}

        {/* 07 y 08: ARP/DNS Spoof */}
        {(currentId === "arp_spoof" || currentId === "dns_spoof") && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px solid #201000', paddingBottom: '2px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{currentId === "arp_spoof" ? "ENVENENAR TABLA ARP DE VÍCTIMA:" : "SUPLANTAR RESPUESTAS DNS:"}</span>
              <span>{safeClients.length} HOSTS</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {safeClients.map((c, i) => {
                const sel = i === listIdx;
                return (
                  <div key={i} style={{ padding: '4px 6px', background: sel ? '#201000' : 'transparent', color: sel ? '#ff9f1a' : '#201000', fontSize: '9px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed rgba(32,16,0,0.1)' }}>
                    <span>{sel ? '► ' : '  '}{c.ip}</span>
                    <span style={{ opacity: 0.8 }}>{c.mac || "?"} · {c.tipo || "HOST"}</span>
                  </div>
                );
              })}
              {safeClients.length === 0 && <div style={{ margin: 'auto', fontSize: '9px', opacity: 0.4, textAlign: 'center', marginTop: '20px' }}>EJECUTA LAN DISCOVERY PRIMERO (OPCIÓN 06)</div>}
            </div>
            {safeClients.length > 0 && (
              <div style={{ fontSize: '8px', marginTop: '4px', padding: '3px 6px', background: 'rgba(32,16,0,0.05)', borderRadius: '3px', fontWeight: 'bold' }}>
                {currentId === "arp_spoof"
                  ? `► OK: ENVENENAR ARP DE ${safeClients[listIdx]?.ip} — TODO SU TRÁFICO PASA POR AQUÍ`
                  : `► OK: SUPLANTAR DNS PARA ${safeClients[listIdx]?.ip} — REDIRIGE DOMINIOS A TU C2`}
              </div>
            )}
          </div>
        )}

        {/* 09: Deauth */}
        {currentId === "deauth_burst" && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px solid #201000', paddingBottom: '2px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>SELECCIONA AP OBJETIVO PARA DEAUTH:</span>
              <button 
                onClick={ejecutarRefrescoActivo} 
                disabled={isRefreshing || isInjecting}
                style={{ background: '#201000', color: '#ff9f1a', border: '1px solid #ff9f1a', fontSize: '7px', padding: '2px 5px', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {isRefreshing ? "⏳ BUSCANDO..." : "🔄 REFRESCAR ESPECTRO"}
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {safeAPs.map((ap, i) => {
                const sel = i === listIdx;
                return (
                  <div key={ap.bssid} style={{ padding: '4px 6px', background: sel ? '#201000' : 'transparent', color: sel ? '#ff9f1a' : '#201000', fontSize: '9px', fontWeight: 'bold', borderBottom: '1px dashed rgba(32,16,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{sel ? '► ' : '  '}{ap.ssid}</span>
                      <span>CH{ap.channel} · {ap.rssi} dBm</span>
                    </div>
                    {sel && <div style={{ fontSize: '7px', marginTop: '1px', opacity: 0.8, fontFamily: 'monospace' }}>{ap.bssid}</div>}
                  </div>
                );
              })}
              {safeAPs.length === 0 && <div style={{ margin: 'auto', fontSize: '9px', opacity: 0.4, textAlign: 'center', marginTop: '20px' }}>INICIA BEACON SCANNING O HAZ REFRESCO ACTIVO</div>}
            </div>
            {safeAPs.length > 0 && (
              <div style={{ fontSize: '8px', marginTop: '4px', padding: '3px 6px', background: isInjecting ? 'rgba(255,0,0,0.05)' : 'rgba(32,16,0,0.05)', borderRadius: '3px', fontWeight: 'bold', color: isInjecting ? '#cc0000' : '#201000' }}>
                {isInjecting ? `🚨 DEAUTH ACTIVO → "${safeAPs[listIdx]?.ssid}" — BACK: DETENER` : `► OK: DEAUTH CONTINUO 30s → "${safeAPs[listIdx]?.ssid}"`}
              </div>
            )}
          </div>
        )}

        {/* 10: EAPOL Trap */}
        {currentId === "eapol_trap" && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px solid #201000', paddingBottom: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>TRAMPA EAPOL — CAPTURA HANDSHAKE WPA2:</span>
              <button 
                onClick={ejecutarRefrescoActivo} 
                disabled={isRefreshing || isInjecting}
                style={{ background: '#201000', color: '#ff9f1a', border: '1px solid #ff9f1a', fontSize: '7px', padding: '2px 5px', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {isRefreshing ? "⏳ BUSCANDO..." : "🔄 REFRESCAR ESPECTRO"}
              </button>
            </div>
            <div style={{ maxHeight: '55px', overflowY: 'auto' }}>
              {safeAPs.map((ap, i) => {
                const sel = i === listIdx;
                return (
                  <div key={ap.bssid} style={{ padding: '3px 6px', background: sel ? '#201000' : 'transparent', color: sel ? '#ff9f1a' : '#201000', fontSize: '9px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{sel ? '► ' : '  '}{ap.ssid}</span>
                    <span>CH{ap.channel} · {ap.bssid.slice(0, 11)}...</span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: '8px', padding: '3px 6px', background: 'rgba(32,16,0,0.04)', borderRadius: '3px', fontWeight: 'bold', color: isInjecting ? '#cc0000' : '#201000' }}>
              {isInjecting
                ? `🔴 DEAUTH+SNIFFER ACTIVO — ESPERANDO 4 FRAMES EAPOL... — BACK: CANCELAR`
                : `► OK: ARMAR TRAMPA CONTRA "${safeAPs[listIdx]?.ssid || "—"}"`}
            </div>
            <div style={{ flex: 1, border: '1px solid #201000', borderRadius: '4px', padding: '4px 6px', overflowY: 'auto' }}>
              <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px dashed #201000', marginBottom: '3px' }}>HANDSHAKES CAPTURADOS (.PCAP):</div>
              {safeHandshakes.length > 0 ? safeHandshakes.map((h, i) => (
                <div key={i} style={{ fontSize: '8px', display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: 'bold', color: '#006600' }}>
                  <span>✓ {h.bssid}</span>
                  <span>{h.date}</span>
                </div>
              )) : (
                <div style={{ fontSize: '8px', opacity: 0.4, textAlign: 'center', marginTop: '4px' }}>SIN CAPTURAS AÚN</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Log de ataques */}
      <div style={{ height: '36px', background: 'rgba(32,16,0,0.04)', border: '1px solid #201000', borderRadius: '4px', padding: '3px 6px', overflowY: 'auto' }}>
        {attackLog.length > 0
          ? attackLog.slice(0, 3).map((l, i) => <div key={i} style={{ fontSize: '8px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>&gt; {l}</div>)
          : <div style={{ fontSize: '8px', opacity: 0.4, fontWeight: 'bold' }}>&gt; BUS DE ATAQUE EN STANDBY...</div>}
      </div>
    </div>
  );
}