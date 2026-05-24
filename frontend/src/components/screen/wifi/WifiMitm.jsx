import React, { useState, useEffect } from 'react';

export default function WifiMitm({ functionIdx, lastAction, sendC2Action, accessPoints, clients, isInjecting, setIsInjecting, setStatusLog }) {
  const [listIdx, setListIdx] = useState(0);
  const [handshakesPool, setHandshakesPool] = useState([]);

  const subModules = [
    { id: "lan_scan", label: "06. LAN Discovery (Active ARP)" },
    { id: "arp_spoof", label: "07. ARP Spoofing Bridge" },
    { id: "dns_spoof", label: "08. DNS Spoofer Local" },
    { id: "deauth_burst", label: "09. Pure Deauth Tactical Burst" },
    { id: "eapol_trap", label: "10. WPA Handshake Sniffer Trap" }
  ];

  const currentId = subModules[functionIdx].id;

  // Cargar el historial de handshakes guardados desde la API REST al entrar a la trampa
  useEffect(() => {
    if (currentId === "eapol_trap") {
      fetch("http://127.0.0.1:8000/api/wifi/handshakes")
        .then(r => r.json())
        .then(data => setHandshakesPool(data || []))
        .catch(() => {});
    }
  }, [currentId]);

  // Capturador elástico interno para mover los índices de selección (Target Lock) de las tablas
  useEffect(() => {
    if (!lastAction) return;
    const { type } = lastAction;

    if (currentId === "deauth_burst" || currentId === "eapol_trap") {
      if (accessPoints.length === 0) return;
      switch (type) {
        case 'UP':
          setListIdx(p => (p - 1 + accessPoints.length) % accessPoints.length);
          break;
        case 'DOWN':
          setListIdx(p => (p + 1) % accessPoints.length);
          break;
        case 'OK':
          if (!isInjecting) {
            const tgt = accessPoints[listIdx];
            setIsInjecting(true);
            if (currentId === "deauth_burst") {
              setStatusLog("TX-BURST: INYECTANDO MANAGEMENT DEAUTH");
              sendC2Action("DEAUTH_TARGET", { bssid: tgt.bssid, client: "FF:FF:FF:FF:FF:FF" });
            } else {
              setStatusLog("TRAP: CASANDO INTERCAMBIO LLAVES WPA");
              sendC2Action("DEAUTH_TARGET", { bssid: tgt.bssid });
            }
          }
          break;
        default: break;
      }
    }
  }, [lastAction, accessPoints, listIdx, isInjecting, currentId]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#201000', color: '#ff9f1a', padding: '4px 8px', fontSize: '9px', fontWeight: '900', borderRadius: '3px' }}>
        <span>VECTOR_MITM: {subModules[functionIdx].label}</span>
        <span style={{ color: '#ff9f1a', animation: 'pulse 1s infinite' }}>● ACTIVE_BUS</span>
      </div>

      {/* OPERACIÓN 06: ACTIVE ARP LAN SCANNER */}
      {currentId === "lan_scan" && (
        <div style={{ flex: 1, background: 'rgba(32,16,0,0.02)', border: '2px solid #201000', borderRadius: '6px', padding: '6px', overflowY: 'auto', minHeight: '135px' }}>
          <div style={{ fontSize: '9px', fontWeight: '900', borderBottom: '1px solid #201000', paddingBottom: '2px', marginBottom: '4px' }}>HOSTS INDEXADOS EN SUBRED LOCAL:</div>
          {clients.map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderBottom: '1px dashed rgba(32,16,0,0.15)', padding: '2px 0', fontWeight: 'bold' }}>
              <span>HOST_IP: <b style={{ background: 'rgba(32,16,0,0.06)', padding: '0 4px' }}>{c.ip}</b></span>
              <span style={{ fontFamily: 'monospace' }}>{c.mac}</span>
            </div>
          ))}
          {clients.length === 0 && (
            <div style={{ fontSize: '10px', textAlign: 'center', padding: '40px', fontWeight: '900', opacity: 0.5 }}>PROCESANDO ENLACES ARP DISCOVERY...</div>
          )}
        </div>
      )}

      {/* OPERACIÓN 07 O 08: ARP / DNS SPOOFER PLACEHOLDERS */}
      {(currentId === "arp_spoof" || currentId === "dns_spoof") && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', border: '2px dashed #201000', borderRadius: '6px', background: 'rgba(32,16,0,0.01)', padding: '15px', minHeight: '135px' }}>
          <div style={{ fontSize: '20px', marginBottom: '4px' }}>📡</div>
          <div style={{ fontSize: '10px', fontWeight: '900' }}>VECTOR DE CAPA 3 ARMADO</div>
          <div style={{ fontSize: '9px', opacity: 0.7, marginTop: '2px', textAlign: 'center' }}>Inyectando descriptores de enrutamiento proxy en el bus de red.</div>
        </div>
      )}

      {/* OPERACIÓN 09: TARGET SELECTION PARA DEAUTH BURST PURE */}
      {currentId === "deauth_burst" && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '9px', fontWeight: '900', opacity: 0.7 }}>FIJAR ROUTER TARGET PARA DEAUTH:</div>
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '100px', border: '1px solid #201000', borderRadius: '4px' }}>
            {accessPoints.map((ap, i) => {
              const isSelected = i === listIdx;
              return (
                <div key={ap.bssid} style={{ padding: '5px 8px', background: isSelected ? '#201000' : 'transparent', color: isSelected ? '#ff9f1a' : '#201000', fontSize: '10px', fontWeight: '900', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(32,16,0,0.05)' }}>
                  <span>{isSelected ? `► ${ap.ssid}` : ap.ssid}</span>
                  <span style={{ fontSize: '9px', fontFamily: 'monospace' }}>{ap.bssid}</span>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: '9px', background: '#201000', color: '#ff9f1a', padding: '4px', textAlign: 'center', fontWeight: '900', borderRadius: '3px' }}>
            {isInjecting ? "🚨 ENVIANDO RÁFAGAS DE DESAUTENTICACIÓN..." : "[ PRESIONA EXE PARA ATAQUE DIRECTO ]"}
          </div>
        </div>
      )}

      {/* OPERACIÓN 10: WPA HANDSHAKE SECURE SNIFFER + VITRINA PCAP */}
      {currentId === "eapol_trap" && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ fontSize: '9px', fontWeight: '900', opacity: 0.7 }}>FIJAR OBJETIVO PARA INTERCEPTAR LLAVES:</div>
          <div style={{ overflowY: 'auto', maxHeight: '60px', border: '1px solid #201000', borderRadius: '4px' }}>
            {accessPoints.map((ap, i) => {
              const isSelected = i === listIdx;
              return (
                <div key={ap.bssid} style={{ padding: '4px 8px', background: isSelected ? '#201000' : 'transparent', color: isSelected ? '#ff9f1a' : '#201000', fontSize: '9px', fontWeight: '900', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{isSelected ? `► ${ap.ssid}` : ap.ssid}</span>
                  <span>{ap.bssid.slice(0, 12)}...</span>
                </div>
              );
            })}
          </div>
          
          {/* VITRINA DE TROFEOS .PCAP EXCLUSIVA */}
          <div style={{ height: '55px', border: '2px solid #201000', borderRadius: '5px', background: 'rgba(32,16,0,0.03)', padding: '4px', overflowY: 'auto' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px dashed #201000', paddingBottom: '2px', marginBottom: '2px', color: '#201000' }}>🗄️ HISTORIAL DE CAPTURAS EN DISCO (SQLITE ORM):</div>
            {handshakesPool.map((h, i) => (
              <div key={i} style={{ fontSize: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>📦 CAPTURA_BSSID: {h.bssid}</span>
                <span style={{ color: '#00aa00' }}>✓ HANDSHAKE.PCAP STORED</span>
              </div>
            ))}
            {handshakesPool.length === 0 && (
              <div style={{ fontSize: '8px', opacity: 0.5, textAlign: 'center', paddingTop: '12px' }}>Ninguna captura registrada en esta sesión.</div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}