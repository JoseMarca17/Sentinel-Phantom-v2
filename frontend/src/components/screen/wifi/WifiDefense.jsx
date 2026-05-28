import React, { useState, useEffect } from 'react';

export default function WifiDefense({ functionIdx, lastAction, sendC2Action }) {
  const [alertsLog, setAlertsLog] = useState([]);
  const [radarPower, setRadarPower] = useState(-85);

  const defenseModules = [
    { id: "anti_deauth", label: "11. Anti-Deauth Monitor", type: "IDS" },
    { id: "twin_detect", label: "12. Evil Twin / BSSID Detector", type: "SIGNATURE" },
    { id: "ap_locator", label: "13. Rogue AP Locator (RSSI)", type: "PROXIMITY" },
    { id: "arp_watchdog", label: "14. LAN ARP Poisoning Watch", type: "KERNEL" },
    { id: "mac_random", label: "15. Mac Address Randomizer", type: "HARDWARE" }
  ];

  const currentModule = defenseModules[functionIdx] || defenseModules[0];

  // 🟢 BUS DE TELEMETRÍA EN CALIENTE: Escucha si el backend detecta anomalías
  useEffect(() => {
    const handleSystemTelemetry = (event) => {
      if (event.detail && event.detail.module === "WIFI_ALERT") {
        const { msg } = event.detail;
        setAlertsLog(p => [`[${new Date().toLocaleTimeString()}] ⚠️ IDS_ALERT: ${msg}`, ...p]);
      }
    };
    window.addEventListener('c2_telemetry', handleSystemTelemetry);
    return () => window.removeEventListener('c2_telemetry', handleSystemTelemetry);
  }, []);

  // Proximidad analógica para Localizador Rogue AP (Opción 13)
  useEffect(() => {
    if (currentModule.id === "ap_locator") {
      const interval = setInterval(() => {
        setRadarPower(() => -40 - Math.floor(Math.random() * 45));
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [currentModule.id]);

  // Manejo del botón EXE físico dentro del sub-módulo
  useEffect(() => {
    if (!lastAction) return;
    const { type } = lastAction;

    if (type === 'OK') {
      if (currentModule.id === "mac_random") {
        setAlertsLog(p => [`[${new Date().toLocaleTimeString()}] REQ -> MODIFICANDO REGISTROS OUI...`, ...p]);
        sendC2Action("RANDOMIZE_MAC_TACTICAL");
      } else {
        setAlertsLog(p => [`[${new Date().toLocaleTimeString()}] WATCHDOG -> ESCUCHA PROMISCUA RE-ARMADA EN: ${currentModule.id.toUpperCase()}`, ...p]);
        sendC2Action("START_DEFENSE_IDS", { modId: currentModule.id });
      }
    }
  }, [lastAction, currentModule.id]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', height: '100%', boxSizing: 'border-box' }}>
      
      {/* Header Fósforo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#201000', color: '#ff9f1a', padding: '4px 8px', fontSize: '10px', fontWeight: '900', borderRadius: '3px' }}>
        <span>TACTICAL_DEFENSE: {currentModule.label.toUpperCase()}</span>
        <span style={{ color: '#ff9f1a', fontSize: '9px' }}>[ MODE: {currentModule.type} ]</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(32,16,0,0.02)', border: '2px solid #201000', borderRadius: '6px', padding: '8px', overflow: 'hidden' }}>
        
        {/* VISTA ESPECÍFICA: LOCALIZADOR AP POR POTENCIA */}
        {currentModule.id === "ap_locator" ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '900' }}>POTENCIA DE TRANSMISOR ENEMIGO:</span>
            <div style={{ fontSize: '26px', fontWeight: 'bold', background: '#201000', color: '#ff9f1a', padding: '8px 20px', borderRadius: '4px', border: '1px solid #ff9f1a', letterSpacing: '1px' }}>
              {radarPower} dBm
            </div>
            <div style={{ width: '100%', height: '12px', border: '2px solid #201000', borderRadius: '4px', overflow: 'hidden', background: 'rgba(32,16,0,0.05)' }}>
              <div style={{ height: '100%', width: `${(radarPower + 100) * 1.6}%`, background: '#201000', transition: 'width 0.25s ease' }} />
            </div>
            <span style={{ fontSize: '8px', opacity: 0.6, textAlign: 'center', fontWeight: 'bold' }}>ORIENTA LA ANTENA PARA TRAZAR EL VECTOR DEL ROGUE AP</span>
          </div>
        ) : (
          /* VISTA ESTÁNDAR: HISTORIAL DE LOGS DE INTRUSIÓN (IDS) */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ fontSize: '9px', fontWeight: '900', borderBottom: '1px solid #201000', paddingBottom: '3px', marginBottom: '4px' }}>LOG DE EVENTOS DE CONTROLADORES DEFENSIVOS:</div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {alertsLog.map((log, i) => (
                <div key={i} style={{ fontSize: '9px', fontWeight: 'bold', color: log.includes('ALERT') ? '#c0392b' : '#201000', padding: '2px 4px', borderBottom: '1px dashed rgba(32,16,0,0.1)' }}>
                  {log}
                </div>
              ))}
              {alertsLog.length === 0 && (
                <div style={{ margin: 'auto', fontSize: '10px', opacity: 0.4, textAlign: 'center', fontWeight: '900', letterSpacing: '0.5px' }}>
                  CONSOLA INMUNE // AGUARDANDO ALERTAS DE FIRMAS WIRELESS
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* StatusBar */}
      <div style={{ fontSize: '9px', background: 'rgba(32,16,0,0.06)', border: '1px solid #201000', padding: '4px', borderRadius: '4px', textAlign: 'center', fontWeight: '900' }}>
        {currentModule.id === "mac_random" ? "► OK: DISPARAR CAMBIO DE DIRECCIÓN DIRECTA MAC" : "► OK: RE-ARMADO DE CAPTURA PROMISCUA"}
      </div>

    </div>
  );
}