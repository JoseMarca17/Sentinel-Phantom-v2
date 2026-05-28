import React from 'react';

export default function WifiSpectrum({ functionIdx, accessPoints, probes }) {
  // Guardias elásticas anti-crasheo de Javascript
  const safeAPs = Array.isArray(accessPoints) ? accessPoints : [];
  const safeProbes = Array.isArray(probes) ? probes : [];

  const subModules = [
    { id: "scan_air", label: "01. Beacon Passive Scanning" },
    { id: "probe_sniff", label: "02. Client Probing Sniffer" },
    { id: "wps_discover", label: "03. WPS Feature Discovery" },
    { id: "hidden_reveal", label: "04. Hidden SSID Revealer" },
    { id: "station_map", label: "05. Wireless Station Mapper" }
  ];

  const currentModule = subModules[functionIdx] || subModules[0];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', height: '100%', boxSizing: 'border-box' }}>
      
      {/* Mini Banner de Estado Táctico del Vector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#201000', color: '#ff9f1a', padding: '5px 10px', fontSize: '9px', fontWeight: '900', borderRadius: '3px', letterSpacing: '0.5px' }}>
        <span>VECTOR_RF: {currentModule.label.toUpperCase()}</span>
        <span style={{ animation: 'pulse 1.2s infinite', color: '#ff9f1a' }}>● RADAR_LIVE</span>
      </div>

      {/* =======================================================================
          ZONA CENTRAL DE VISUALIZACIÓN ADAPTATIVA SEGÚN SUB-MÓDULO SELECCIONADO
         ======================================================================= */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(32,16,0,0.02)', border: '2px solid #201000', borderRadius: '8px', padding: '10px', overflow: 'hidden', minHeight: '110px' }}>
        
        {/* 📊 OPCIÓN 01: ANALIZADOR DE ESPECTRO GRÁFICO (Muestra Densidad y Potencia RSSI) */}
        {currentModule.id === "scan_air" && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '4px', height: '100%' }}>
            {safeAPs.slice(0, 10).map((ap, i) => {
              // Mapeo proporcional analógico de dBm a porcentaje de CSS para la barra
              const heightPercent = Math.min(Math.max((ap.rssi + 100) * 1.4, 15), 100);
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${heightPercent}%`, background: '#201000', borderTop: '2px solid #ff9f1a', transition: 'height 0.2s ease' }} />
                  <span style={{ fontSize: '7px', fontWeight: '900', marginTop: '4px', maxWidth: '38px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ap.ssid === "SSID Oculto" ? `[CH${ap.channel}]` : ap.ssid}
                  </span>
                </div>
              );
            })}
            {safeAPs.length === 0 && (
              <div style={{ margin: 'auto', fontSize: '10px', fontWeight: '900', opacity: 0.5, textAlign: 'center' }}>SINTONIZANDO FRECUENCIAS... EN AIRE</div>
            )}
          </div>
        )}

        {/* 📡 OPCIÓN 02: PROBE SNIFFER TERMINAL (Visualización limpia en cascada del tracking de clientes) */}
        {currentModule.id === "probe_sniff" && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', overflowY: 'auto' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', color: '#201000', borderBottom: '1px solid #201000', paddingBottom: '2px', marginBottom: '3px' }}>TRACKING DE DISPOSITIVOS MÓVILES CERCANOS:</div>
            {safeProbes.slice(-5).reverse().map((p, i) => (
              <div key={i} style={{ fontSize: '9px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed rgba(32,16,0,0.12)', padding: '2px 0', fontWeight: 'bold' }}>
                <span>📱 <b style={{ background: 'rgba(32,16,0,0.06)', padding: '0 3px' }}>{p.mac}</b></span>
                <span style={{ color: '#201000' }}>REDS: "{p.searching_for}" ({p.rssi} dBm)</span>
              </div>
            ))}
            {safeProbes.length === 0 && (
              <div style={{ margin: 'auto', fontSize: '9px', fontWeight: '900', opacity: 0.5 }}>ESCUCHANDO TRAMAS PROBE REQUEST...</div>
            )}
          </div>
        )}

        {/* ⚠️ OPCIÓN 03: WPS FEATURE DISCOVERY (Filtrado estricto de routers vulnerables en el perímetro) */}
        {currentModule.id === "wps_discover" && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', color: '#d35400', borderBottom: '1px solid #201000', paddingBottom: '2px', marginBottom: '3px' }}>AUDITORÍA DE VECTORES WPS ABIERTOS:</div>
            {safeAPs.filter(ap => ap.wps).length > 0 ? (
              safeAPs.filter(ap => ap.wps).slice(0, 4).map((ap, i) => (
                <div key={i} style={{ padding: '4px 8px', border: '1px solid #201000', background: 'rgba(211,84,0,0.05)', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', fontWeight: '900' }}>
                  <span style={{ color: '#201000' }}>⚠️ [WPS PIN OPEN] {ap.ssid}</span>
                  <span>CH {ap.channel} // {ap.rssi} dBm</span>
                </div>
              ))
            ) : (
              <div style={{ margin: 'auto', fontSize: '9px', fontWeight: '900', opacity: 0.4, textAlign: 'center' }}>NINGÚN AP CON REGISTROS WPS ABIERTOS DISPONIBLE...</div>
            )}
          </div>
        )}

        {/* 🔓 OPCIÓN 04: HIDDEN SSID REVEALER (Tablero táctico enfocado en alertar revelaciones por handshake/asociación) */}
        {currentModule.id === "hidden_reveal" && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', color: '#201000', borderBottom: '1px solid #201000', paddingBottom: '2px', marginBottom: '3px' }}>MONITOREO DE DESENMASCARAMIENTO DE SSIDS:</div>
            {safeAPs.filter(ap => ap.ssid !== "SSID Oculto").length > 0 ? (
              safeAPs.filter(ap => ap.ssid !== "SSID Oculto").slice(0, 4).map((ap, i) => (
                <div key={i} style={{ padding: '4px 6px', background: '#201000', color: '#ff9f1a', fontSize: '9px', fontWeight: '900', borderRadius: '3px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>🔓 RADAR REVELADO: "{ap.ssid}"</span>
                  <span style={{ fontFamily: 'monospace', opacity: 0.8 }}>BSSID: {ap.bssid}</span>
                </div>
              ))
            ) : (
              <div style={{ margin: 'auto', fontSize: '9px', fontWeight: '900', opacity: 0.4, textAlign: 'center' }}>CAPTURA DE BALIZAS... ESPERANDO INTERCAMBIO DE ASOCIACIÓN DE CLIENTES O BALIZAS DIRECTAS</div>
            )}
          </div>
        )}

        {/* 🗺️ OPCIÓN 05: WIRELESS STATION MAPPER (Layout analítico tabular de densidad de celdas inalámbricas) */}
        {currentModule.id === "station_map" && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', overflowY: 'auto' }}>
            <div style={{ fontSize: '8px', fontWeight: '900', borderBottom: '1px solid #201000', paddingBottom: '2px', marginBottom: '3px' }}>MATRIZ RELACIONAL DE CELDAS INALÁMBRICAS (RSSI DETECTADO):</div>
            {safeAPs.slice(0, 4).map((ap, i) => (
              <div key={i} style={{ fontSize: '9px', borderBottom: '1px dashed rgba(32,16,0,0.15)', padding: '3px 0', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>📡 ESSID: <b>{ap.ssid}</b></span>
                <span style={{ fontFamily: 'monospace' }}>MAC: {ap.bssid} | CANAL: {ap.channel} ({ap.rssi} dBm)</span>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Volcado Consolidado Inferior (Mantiene la estética industrial de logs calientes) */}
      <div style={{ height: '48px', background: 'rgba(32,16,0,0.04)', border: '2px solid #201000', borderRadius: '5px', padding: '4px 8px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <div style={{ fontSize: '8px', fontWeight: '900', color: '#201000', opacity: 0.7, borderBottom: '1px dashed rgba(32,16,0,0.2)' }}>[ VOLCADO DE FLUJO SERIAL PASIVO ]</div>
        <div style={{ fontSize: '8px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          &gt; BUS_DRIVER: {safeAPs.length} celdas activas en la caché interna de Scapy.
        </div>
        <div style={{ fontSize: '8px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          &gt; ÚLTIMO EVENTO: {safeAPs[0] ? `Intercepción en BSSID [${safeAPs[0].bssid}]` : "Esperando sincronización de antena física..."}
        </div>
      </div>

    </div>
  );
}