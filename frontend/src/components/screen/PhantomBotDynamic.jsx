// src/components/screen/PhantomBotDynamic.jsx
import React from 'react';

export default function PhantomBotDynamic() {
  return (
    <svg 
      width="100%" 
      height="100%" 
      viewBox="0 0 100 100" 
      fill="none" 
      className="drop-shadow-[0_0_2px_rgba(32,16,0,0.3)]"
      style={{ animation: 'sp-float 2.5s ease-in-out infinite' }}
    >
      {/* ANTENAS MECANIZADAS GRUESAS */}
      <path d="M30 15 L10 2 M70 15 L90 2" stroke="#201000" strokeWidth="3" strokeLinecap="square" />
      <polygon points="8,2 16,0 14,8" fill="#201000" />
      <polygon points="92,2 84,0 86,8" fill="#201000" />

      {/* CRÁNEO POLIGONAL (Estructura Reforzada) */}
      <path 
        d="M25 18 H75 L86 38 L82 58 L75 56 L70 72 L60 74 L58 88 H42 L40 74 L30 72 L25 58 L14 38 Z" 
        stroke="#201000" 
        strokeWidth="3" 
        strokeLinejoin="miter" 
      />

      {/* VISORES OCULARES (Más grandes para imponer) */}
      <path d="M24 40 L46 45 L44 56 L26 52 Z" fill="#201000" />
      <path d="M76 40 L54 45 L56 56 L74 52 Z" fill="#201000" />

      {/* PUPILAS LCD (Píxel vacío) */}
      <rect x="34" y="47" width="6" height="4" fill="transparent" stroke="#fff3dd" strokeWidth="1" className="animate-pulse" />
      <rect x="60" y="47" width="6" height="4" fill="transparent" stroke="#fff3dd" strokeWidth="1" className="animate-pulse" />

      {/* FOSA NASAL TÁCTICA */}
      <polygon points="50,54 42,65 58,65" fill="#201000" />

      {/* MANDÍBULA DISIPADORA */}
      <path d="M38 74 L40 88 H60 L62 74" stroke="#201000" strokeWidth="2" />
      <line x1="46" y1="74" x2="46" y2="88" stroke="#201000" strokeWidth="2" />
      <line x1="54" y1="74" x2="54" y2="88" stroke="#201000" strokeWidth="2" />
      <line x1="25" y1="70" x2="75" y2="70" stroke="#201000" strokeWidth="3" />
    </svg>
  );
}