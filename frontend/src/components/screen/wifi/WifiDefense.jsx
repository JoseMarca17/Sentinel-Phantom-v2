import React, { useEffect } from 'react';

export default function WifiDefense({ functionIdx, lastAction, setTier, sendC2Action }) {
  const subModules = [
    { id: "anti_deauth", label: "11. Anti-Deauth Monitor" },
    { id: "twin_detect", label: "12. Evil Twin / BSSID Detector" },
    { id: "ap_locator", label: "13. Rogue AP Locator (RSSI)" },
    { id: "arp_watchdog", label: "14. LAN ARP Poisoning Watch" },
    { id: "mac_random", label: "15. Mac Address Randomizer" }
  ];

  useEffect(() => {
    if (lastAction && lastAction.type === 'BACK') {
      sendC2Action("STOP_MONITOR");
      setTier('sub_menu');
    }
  }, [lastAction]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', border: '3px dashed #201000', borderRadius: '8px', background: 'rgba(32,16,0,0.01)', padding: '20px' }}>
      <div style={{ fontSize: '24px', marginBottom: '6px' }}>🛡️</div>
      <div style={{ fontSize: '11px', fontWeight: '900', fontFamily: 'monospace' }}>WATCHDOG DEFENSA ACTIVO</div>
      <div style={{ fontSize: '9px', opacity: 0.8, marginTop: '4px', textAlign: 'center', lineHeight: '1.3', maxWidth: '220px' }}>
        Inspeccionando firmas analíticas en {subModules[functionIdx].label} buscando vectores intrusivos en Arch.
      </div>
    </div>
  );
}