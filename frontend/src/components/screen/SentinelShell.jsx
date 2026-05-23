import React, { useEffect } from 'react';

const DpadBtn = ({ label, onClick, style = {} }) => (
  <button 
    onClick={onClick} 
    className="dpad-button" 
    style={{
      background: '#1e222a', border: '2px solid #3c444d', color: '#8b949e',
      fontSize: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center',
      justifyContent: 'center', transition: 'all .1s', boxShadow: '0 5px 0 #0d1117', ...style
    }}
  >
    {label}
  </button>
);

export default function SentinelShell({ children, onAction, booted }) {
  
  // Captura el teclado globalmente y lo traduce a comandos del sistema
  useEffect(() => {
    const handleKeyDown = (e) => {
      const mapping = { 
        Enter: 'OK', ArrowUp: 'UP', ArrowDown: 'DOWN', 
        ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', Escape: 'BACK' 
      };
      if (mapping[e.key]) {
        e.preventDefault();
        onAction(mapping[e.key]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onAction]);

  return (
    <div className="sentinel-container">
      <style>{`
        .sentinel-container { min-height: 100vh; background: #080a14; display: flex; align-items: center; justify-content: center; padding: 20px; font-family: 'Courier New', monospace; user-select: none; }
        .sentinel-shell { 
          width: 100%; max-width: 1000px; background: linear-gradient(145deg, #0055ff 0%, #002266 100%); 
          border: 6px solid #001a4d; border-radius: 40px; padding: 35px; 
          box-shadow: 0 50px 100px rgba(0,0,0,0.9), inset 0 2px 10px rgba(255,255,255,0.3);
        }
        .layout-engine { display: grid; grid-template-columns: 1fr; gap: 30px; }
        @media (min-width: 950px) { .layout-engine { grid-template-columns: 1fr 280px; } }

        .lcd-screen { 
          background: #ff9f1a; border: 10px solid #1a1a1a; border-radius: 24px; 
          height: 480px; position: relative; overflow: hidden; display: flex; flex-direction: column;
          box-shadow: inset 0 0 40px rgba(0,0,0,0.6);
        }
        .pixel-grid { position: absolute; inset: 0; z-index: 10; pointer-events: none; background-image: linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px); background-size: 3px 3px; }

        .dpad-container { display: flex; flex-direction: column; gap: 20px; background: rgba(0,0,0,0.5); padding: 30px; border-radius: 35px; border: 2px solid rgba(255,255,255,0.1); }
        .dpad-grid { position: relative; width: 200px; height: 200px; margin: 0 auto; }
        
        .dpad-button:active { background: #0055ff !important; color: white !important; transform: translateY(3px); box-shadow: 0 2px 0 #001a4d; }
        
        .exe-btn { position: absolute; top: 65px; left: 65px; width: 70px; height: 70px; background: #2a2f38; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; cursor: pointer; border: 5px solid #0d1117; z-index: 15; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
        .exe-btn:active { transform: scale(0.92); background: #0055ff; }
      `}</style>

      <div className="sentinel-shell">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold', color: '#e6f0ff', marginBottom: '20px', letterSpacing: '2px' }}>
          <span>SENTINEL // PHANTOM_OS</span>
          <span>{booted ? 'SYSTEM_ACTIVE' : 'STANDBY'}</span>
        </div>

        <div className="layout-engine">
          <div className="lcd-screen">
            <div className="pixel-grid" />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', zIndex: 11, height: '100%' }}>
              {children}
            </div>
          </div>

          <div className="dpad-container">
            <div className="dpad-grid">
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#0d1117', border: '4px solid #21262d' }} />
              <DpadBtn label="▲" onClick={() => onAction('UP')} style={{ position: 'absolute', top: 0, left: '70px', width: '60px', height: '55px', borderRadius: '15px 15px 5px 5px' }} />
              <DpadBtn label="◀" onClick={() => onAction('LEFT')} style={{ position: 'absolute', top: '70px', left: 0, width: '55px', height: '60px', borderRadius: '15px 5px 5px 15px' }} />
              <DpadBtn label="▶" onClick={() => onAction('RIGHT')} style={{ position: 'absolute', top: '70px', right: 0, width: '55px', height: '60px', borderRadius: '5px 15px 15px 5px' }} />
              <DpadBtn label="▼" onClick={() => onAction('DOWN')} style={{ position: 'absolute', bottom: 0, left: '70px', width: '60px', height: '55px', borderRadius: '5px 5px 15px 15px' }} />
              <div className="exe-btn" onClick={() => onAction('OK')}>EXE</div>
            </div>
            <button onClick={() => onAction('BACK')} style={{ marginTop: '10px', padding: '18px', background: '#30363d', border: 'none', color: '#fff', borderRadius: '20px', cursor: 'pointer', fontWeight: '900', fontSize: '14px', boxShadow: '0 5px 0 #161b22' }}>
              BACK / ESC
            </button>
          </div>
        </div>

        <div style={{ marginTop: '25px', textAlign: 'center', fontSize: '11px', color: '#80b3ff', letterSpacing: '5px', fontWeight: 'bold', opacity: 0.6 }}>
          EMI SEC-OPS // SYSTEM AUDIT TOOL V2
        </div>
      </div>
    </div>
  );
}