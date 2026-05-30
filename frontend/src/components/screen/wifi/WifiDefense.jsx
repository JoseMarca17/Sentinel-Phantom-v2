import React, { useState, useEffect } from 'react';

export default function WifiDefense({ functionIdx, lastAction, sendC2Action }) {
  const [alertsLog, setAlertsLog] = useState([]);
  const [radarPower, setRadarPower] = useState(-85);
  const [watchdogActive, setWatchdogActive] = useState(false);

  const defenseModules = [
    { id: "anti_deauth", label: "11. Anti-Deauth Monitor",        type: "IDS",       desc: "Detecta ráfagas de frames 802.11 de desautenticación. Un atacante usa esto para expulsar clientes y capturar handshakes." },
    { id: "twin_detect", label: "12. Evil Twin / BSSID Detector", type: "SIGNATURE", desc: "Compara beacons contra referencia de canal. Un AP clon usa el mismo SSID en canal diferente para robar credenciales." },
    { id: "ap_locator",  label: "13. Rogue AP Locator (RSSI)",    type: "PROXIMITY", desc: "Medidor de señal en tiempo real. Orienta la antena hacia la fuente: a mayor dBm, más cerca está el transmisor rogue." },
    { id: "arp_watchdog",label: "14. LAN ARP Poisoning Watch",    type: "KERNEL",    desc: "Monitorea la tabla ARP local. Si una MAC responde por varias IPs, hay envenenamiento ARP activo en la subred." },
    { id: "mac_random",  label: "15. MAC Address Randomizer",     type: "HARDWARE",  desc: "Muta el OUI del adaptador de ataque. Evita que firewalls y routers logueen o bloqueen por dirección física." }
  ];

  const currentModule = defenseModules[functionIdx] || defenseModules[0];

  // Escuchar alertas del backend vía custom event
  useEffect(() => {
    const handler = (event) => {
      if (event.detail?.module === "WIFI_ALERT") {
        const { msg } = event.detail;
        setAlertsLog(p => [
          { time: new Date().toLocaleTimeString(), msg, isAlert: true },
          ...p.slice(0, 29)
        ]);
      }
    };
    window.addEventListener('c2_telemetry', handler);
    return () => window.removeEventListener('c2_telemetry', handler);
  }, []);

  // Simulación RSSI para ap_locator (en producción vendría del WS)
  useEffect(() => {
    if (currentModule.id !== "ap_locator") return;
    const interval = setInterval(() => {
      setRadarPower(-40 - Math.floor(Math.random() * 45));
    }, 1500);
    return () => clearInterval(interval);
  }, [currentModule.id]);

  // Reset watchdog al cambiar módulo
  useEffect(() => {
    setWatchdogActive(false);
  }, [functionIdx]);

  // D-PAD
  useEffect(() => {
    if (!lastAction) return;
    if (lastAction.type !== 'OK') return;

    if (currentModule.id === "mac_random") {
      setAlertsLog(p => [{ time: new Date().toLocaleTimeString(), msg: "MUTANDO OUI → SOLICITUD ENVIADA AL KERNEL...", isAlert: false }, ...p]);
      sendC2Action("RANDOMIZE_MAC_TACTICAL").then(r => {
        setAlertsLog(p => [{ time: new Date().toLocaleTimeString(), msg: `MAC ACTUALIZADA → ${r?.detail || "OK"}`, isAlert: false }, ...p]);
      });
    } else {
      setWatchdogActive(true);
      setAlertsLog(p => [{ time: new Date().toLocaleTimeString(), msg: `WATCHDOG ARMADO → ${currentModule.id.toUpperCase()} EN ESCUCHA PROMISCUA`, isAlert: false }, ...p]);
      sendC2Action("START_DEFENSE_IDS", { modId: currentModule.id });
    }
  }, [lastAction]);

  const rssiPercent = Math.min(Math.max((radarPower + 100) * 1.6, 2), 100);
  const rssiColor = radarPower >= -55 ? '#cc0000' : radarPower >= -70 ? '#885500' : '#201000';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', height: '100%', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#201000', color: '#ff9f1a', padding: '4px 8px', fontSize: '9px', fontWeight: '900', borderRadius: '3px' }}>
        <span>{currentModule.label.toUpperCase()}</span>
        <span style={{ color: watchdogActive ? '#00cc00' : '#ff9f1a' }}>
          {watchdogActive ? `● ${currentModule.type}_ACTIVE` : `○ ${currentModule.type}_IDLE`}
        </span>
      </div>

      {/* Descripción del módulo */}
      <div style={{ padding: '5px 8px', background: 'rgba(32,16,0,0.04)', border: '1px dashed rgba(32,16,0,0.3)', borderRadius: '4px', fontSize: '8px', fontWeight: 'bold', lineHeight: '1.5', opacity: 0.85 }}>
        {currentModule.desc}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(32,16,0,0.02)', border: '2px solid #201000', borderRadius: '6px', padding: '8px', overflow: 'hidden' }}>

        {/* AP Locator */}
        {currentModule.id === "ap_locator" ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <div style={{ fontSize: '9px', fontWeight: '900', opacity: 0.7 }}>POTENCIA DE SEÑAL DEL TRANSMISOR OBJETIVO:</div>
            <div style={{ fontSize: '32px', fontWeight: '900', background: '#201000', color: '#ff9f1a', padding: '10px 28px', borderRadius: '4px', border: `2px solid ${rssiColor}`, letterSpacing: '2px', fontFamily: 'monospace' }}>
              {radarPower} dBm
            </div>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7px', fontWeight: '900', opacity: 0.6 }}>
                <span>LEJOS (-100)</span>
                <span style={{ color: rssiColor }}>{radarPower >= -55 ? '🔴 MUY CERCA' : radarPower >= -70 ? '🟡 CERCA' : '⚪ LEJOS'}</span>
                <span>CERCA (-40)</span>
              </div>
              <div style={{ width: '100%', height: '14px', border: '2px solid #201000', borderRadius: '4px', overflow: 'hidden', background: 'rgba(32,16,0,0.05)' }}>
                <div style={{ height: '100%', width: `${rssiPercent}%`, background: rssiColor, transition: 'width 0.4s ease, background 0.4s ease' }} />
              </div>
            </div>
            <div style={{ fontSize: '8px', opacity: 0.5, textAlign: 'center', fontWeight: 'bold', lineHeight: '1.4' }}>
              MUEVE LA ANTENA LENTAMENTE<br/>BUSCA EL MÁXIMO DE dBm PARA TRIANGULAR
            </div>
          </div>
        ) : (
          /* Log IDS */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px solid #201000', paddingBottom: '3px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
              <span>CONSOLA DE EVENTOS IDS:</span>
              <span>{alertsLog.length} EVENTOS</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {alertsLog.map((entry, i) => (
                <div key={i} style={{ fontSize: '9px', fontWeight: 'bold', color: entry.isAlert ? '#cc0000' : '#201000', padding: '2px 4px', borderBottom: '1px dashed rgba(32,16,0,0.1)', display: 'flex', gap: '6px' }}>
                  <span style={{ opacity: 0.5, whiteSpace: 'nowrap' }}>[{entry.time}]</span>
                  <span>{entry.isAlert ? '⚠ ' : '› '}{entry.msg}</span>
                </div>
              ))}
              {alertsLog.length === 0 && (
                <div style={{ margin: 'auto', fontSize: '9px', opacity: 0.35, textAlign: 'center', fontWeight: '900', lineHeight: '1.6' }}>
                  CONSOLA LIMPIA<br/>PRESIONA OK PARA ARMAR EL WATCHDOG<br/>LAS ALERTAS APARECEN AQUÍ EN TIEMPO REAL
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={{ fontSize: '9px', background: watchdogActive ? '#201000' : 'rgba(32,16,0,0.06)', color: watchdogActive ? '#ff9f1a' : '#201000', border: '1px solid #201000', padding: '4px 8px', borderRadius: '4px', fontWeight: '900', display: 'flex', justifyContent: 'space-between' }}>
        <span>{currentModule.id === "mac_random" ? "► OK: MUTAR MAC DEL ADAPTADOR" : watchdogActive ? `● WATCHDOG ACTIVO — ${currentModule.type}` : "► OK: ARMAR WATCHDOG"}</span>
        {watchdogActive && <span style={{ fontSize: '8px', opacity: 0.8 }}>ESCUCHA PROMISCUA EN CURSO</span>}
      </div>
    </div>
  );
}