import React from 'react';

export default function WifiSpectrum({ functionIdx, accessPoints, probes }) {
  const safeAPs = Array.isArray(accessPoints) ? accessPoints : [];
  const safeProbes = Array.isArray(probes) ? probes : [];

  const subModules = [
    { id: "scan_air",      label: "01. Beacon Passive Scanning" },
    { id: "probe_sniff",   label: "02. Client Probing Sniffer" },
    { id: "wps_discover",  label: "03. WPS Feature Discovery" },
    { id: "hidden_reveal", label: "04. Hidden SSID Revealer" },
    { id: "station_map",   label: "05. Wireless Station Mapper" }
  ];

  const currentModule = subModules[functionIdx] || subModules[0];

  // Color de barra según RSSI
  const rssiColor = (rssi) => {
    if (rssi >= -50) return '#006600';
    if (rssi >= -70) return '#885500';
    return '#201000';
  };

  const rssiLabel = (rssi) => {
    if (rssi >= -50) return 'FUERTE';
    if (rssi >= -65) return 'BUENA';
    if (rssi >= -80) return 'DÉBIL';
    return 'MUY DÉBIL';
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', height: '100%', boxSizing: 'border-box' }}>

      {/* Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#201000', color: '#ff9f1a', padding: '5px 10px', fontSize: '9px', fontWeight: '900', borderRadius: '3px', letterSpacing: '0.5px' }}>
        <span>VECTOR_RF: {currentModule.label.toUpperCase()}</span>
        <span style={{ color: safeAPs.length > 0 ? '#00cc00' : '#ff9f1a' }}>
          {safeAPs.length > 0 ? `● LIVE — ${safeAPs.length} AP` : '○ SINTONIZANDO...'}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(32,16,0,0.02)', border: '2px solid #201000', borderRadius: '8px', padding: '10px', overflow: 'hidden' }}>

        {/* 01: Espectro de barras RSSI */}
        {currentModule.id === "scan_air" && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px solid #201000', paddingBottom: '2px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
              <span>DENSIDAD DE SEÑAL RF POR AP (RSSI en dBm):</span>
              <span>{safeAPs.length} CELDAS DETECTADAS</span>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '3px' }}>
              {safeAPs.slice(0, 12).map((ap, i) => {
                const h = Math.min(Math.max((ap.rssi + 100) * 1.4, 10), 100);
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: '7px', fontWeight: '900', marginBottom: '2px', color: rssiColor(ap.rssi) }}>{ap.rssi}</span>
                    <div style={{ width: '100%', height: `${h}%`, background: rssiColor(ap.rssi), borderTop: `2px solid #ff9f1a`, transition: 'height 0.3s ease' }} />
                    <span style={{ fontSize: '6px', fontWeight: '900', marginTop: '3px', maxWidth: '36px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                      {ap.ssid === "SSID Oculto" ? `[CH${ap.channel}]` : ap.ssid}
                    </span>
                    {ap.wps && <span style={{ fontSize: '6px', color: '#cc3300', fontWeight: '900' }}>WPS</span>}
                  </div>
                );
              })}
              {safeAPs.length === 0 && (
                <div style={{ margin: 'auto', fontSize: '10px', fontWeight: '900', opacity: 0.4, textAlign: 'center' }}>
                  HOPPING EN CANALES 1-13...<br/>ESPERANDO BEACONS
                </div>
              )}
            </div>
          </div>
        )}

        {/* 02: Probe sniffer */}
        {currentModule.id === "probe_sniff" && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', overflowY: 'auto' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px solid #201000', paddingBottom: '2px', marginBottom: '3px', display: 'flex', justifyContent: 'space-between' }}>
              <span>DISPOSITIVOS BUSCANDO REDES CONOCIDAS:</span>
              <span>{safeProbes.length} PROBES</span>
            </div>
            {safeProbes.slice(-8).reverse().map((p, i) => (
              <div key={i} style={{ fontSize: '9px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed rgba(32,16,0,0.12)', padding: '3px 0', fontWeight: 'bold' }}>
                <span style={{ fontFamily: 'monospace', background: 'rgba(32,16,0,0.06)', padding: '0 3px' }}>{p.mac}</span>
                <span style={{ color: '#201000', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  → "{p.searching_for}"
                </span>
                <span style={{ color: rssiColor(p.rssi), fontWeight: '900' }}>{p.rssi} dBm</span>
              </div>
            ))}
            {safeProbes.length === 0 && (
              <div style={{ margin: 'auto', fontSize: '9px', fontWeight: '900', opacity: 0.4, textAlign: 'center' }}>
                ESCUCHANDO PROBE REQUESTS...<br/>ACERCA UN DISPOSITIVO AL RANGO
              </div>
            )}
          </div>
        )}

        {/* 03: WPS Discovery */}
        {currentModule.id === "wps_discover" && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', overflowY: 'auto' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', color: '#cc3300', borderBottom: '1px solid #201000', paddingBottom: '2px', marginBottom: '3px', display: 'flex', justifyContent: 'space-between' }}>
              <span>VECTORES WPS ABIERTOS DETECTADOS:</span>
              <span>{safeAPs.filter(ap => ap.wps).length} VULNERABLES</span>
            </div>
            {safeAPs.filter(ap => ap.wps).length > 0 ? (
              safeAPs.filter(ap => ap.wps).map((ap, i) => (
                <div key={i} style={{ padding: '5px 8px', border: '1px solid #cc3300', background: 'rgba(204,51,0,0.04)', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: '900' }}>
                    <span>⚠ {ap.ssid}</span>
                    <span style={{ fontFamily: 'monospace' }}>CH {ap.channel}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', marginTop: '2px', opacity: 0.8 }}>
                    <span>{ap.bssid}</span>
                    <span style={{ color: rssiColor(ap.rssi) }}>{ap.rssi} dBm — {rssiLabel(ap.rssi)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ margin: 'auto', fontSize: '9px', fontWeight: '900', opacity: 0.4, textAlign: 'center' }}>
                NINGÚN AP CON WPS ACTIVO EN RANGO<br/>CONTINÚA ESCANEANDO...
              </div>
            )}
          </div>
        )}

        {/* 04: Hidden SSID */}
        {currentModule.id === "hidden_reveal" && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', overflowY: 'auto' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px solid #201000', paddingBottom: '2px', marginBottom: '3px', display: 'flex', justifyContent: 'space-between' }}>
              <span>SSIDs DESENMASCARADOS POR ASOCIACIÓN:</span>
              <span>{safeAPs.filter(ap => ap.ssid !== "SSID Oculto").length} REVELADOS</span>
            </div>
            {safeAPs.filter(ap => ap.ssid !== "SSID Oculto").length > 0 ? (
              safeAPs.filter(ap => ap.ssid !== "SSID Oculto").map((ap, i) => (
                <div key={i} style={{ padding: '5px 8px', background: '#201000', color: '#ff9f1a', fontSize: '9px', fontWeight: '900', borderRadius: '3px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>✓ "{ap.ssid}"</span>
                    <span style={{ fontFamily: 'monospace', opacity: 0.8 }}>CH {ap.channel}</span>
                  </div>
                  <div style={{ fontSize: '8px', marginTop: '2px', opacity: 0.7, fontFamily: 'monospace' }}>{ap.bssid}</div>
                </div>
              ))
            ) : (
              <div style={{ margin: 'auto', fontSize: '9px', fontWeight: '900', opacity: 0.4, textAlign: 'center' }}>
                ESPERANDO TRAMAS DE ASOCIACIÓN...<br/>EL AP REVELA SU NOMBRE CUANDO UN CLIENTE SE CONECTA
              </div>
            )}
          </div>
        )}

        {/* 05: Station mapper */}
        {currentModule.id === "station_map" && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px solid #201000', paddingBottom: '2px', marginBottom: '3px', display: 'flex', justifyContent: 'space-between' }}>
              <span>MAPA AP ↔ CLIENTE (CELDAS ACTIVAS):</span>
              <span>{safeAPs.length} AP</span>
            </div>
            {safeAPs.slice(0, 6).map((ap, i) => (
              <div key={i} style={{ borderBottom: '1px dashed rgba(32,16,0,0.15)', padding: '4px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontWeight: '900' }}>
                  <span>📡 {ap.ssid === "SSID Oculto" ? `[OCULTO CH${ap.channel}]` : ap.ssid}</span>
                  <span style={{ color: rssiColor(ap.rssi), fontFamily: 'monospace' }}>{ap.rssi} dBm</span>
                </div>
                <div style={{ fontSize: '8px', opacity: 0.7, fontFamily: 'monospace', marginTop: '1px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{ap.bssid}</span>
                  <span>CH {ap.channel}{ap.wps ? ' · WPS' : ''}</span>
                </div>
              </div>
            ))}
            {safeAPs.length === 0 && (
              <div style={{ margin: 'auto', fontSize: '9px', fontWeight: '900', opacity: 0.4, textAlign: 'center' }}>MAPA VACÍO — INICIA BEACON SCANNING PRIMERO</div>
            )}
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div style={{ height: '36px', background: 'rgba(32,16,0,0.04)', border: '2px solid #201000', borderRadius: '5px', padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: '1px', overflow: 'hidden' }}>
        <div style={{ fontSize: '8px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          &gt; CACHÉ: {safeAPs.length} AP · {safeProbes.length} PROBES · {safeAPs.filter(a => a.wps).length} WPS · {safeAPs.filter(a => a.ssid === "SSID Oculto").length} OCULTOS
        </div>
        <div style={{ fontSize: '8px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          &gt; {safeAPs[0] ? `ÚLTIMO: ${safeAPs[0].ssid} [${safeAPs[0].bssid}] CH${safeAPs[0].channel}` : "AGUARDANDO SINCRONIZACIÓN DE ANTENA..."}
        </div>
      </div>
    </div>
  );
}