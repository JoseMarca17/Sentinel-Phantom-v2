// src/components/screen/PhantomBotDynamic.jsx
import React from 'react';

export default function PhantomBotDynamic() {
  return (
    <svg width="110" height="110" viewBox="0 0 100 100" fill="none" style={{ animation: 'sp-float 3s ease-in-out infinite', filter: 'drop-shadow(0 0 12px rgba(255,149,0,0.45))' }}>
      {/* Antenas de escaneo superiores */}
      <path d="M30 20 L20 8 M70 20 L80 8" stroke="#ff9500" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="20" cy="8" r="3" fill="#ff9500" />
      <circle cx="80" cy="8" r="3" fill="#ff9500" />

      {/* Orejas de acoplamiento de periféricos */}
      <rect x="10" y="38" width="8" height="24" rx="3" fill="#150800" stroke="#ff9500" strokeWidth="1.5" />
      <rect x="82" y="38" width="8" height="24" rx="3" fill="#150800" stroke="#ff9500" strokeWidth="1.5" />

      {/* Bloque del Chasis Principal (Cuerpo) */}
      <rect x="18" y="24" width="64" height="52" rx="10" fill="#1c0a00" stroke="#ff9500" strokeWidth="2" />

      {/* Visor LCD interno del Bot */}
      <rect x="26" y="34" width="48" height="20" rx="4" fill="#0d0400" stroke="#ff9500" strokeWidth="1" />

      {/* Opciones de Matrices de Píxeles (Ojos Digitales) */}
      <circle cx="38" cy="44" r="4" fill="#ff9500" />
      <circle cx="38" cy="44" r="1.5" fill="#000" />
      <circle cx="62" cy="44" r="4" fill="#ff9500" />
      <circle cx="62" cy="44" r="1.5" fill="#000" />

      {/* Líneas de Escaneo del Pecho (Estado de Buffers) */}
      <line x1="32" y1="62" x2="68" y2="62" stroke="#ff9500" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="38" y1="67" x2="62" y2="67" stroke="#ff9500" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 2" />
      <line x1="44" y1="71" x2="56" y2="71" stroke="#ff9500" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}