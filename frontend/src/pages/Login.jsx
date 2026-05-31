import React, { useState, useEffect } from 'react';
import { Zap, ShieldAlert } from 'lucide-react';

function generateCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { question: `${a} + ${b}`, answer: a + b };
}

export default function Login({ onLogin }) {
  const [username, setUsername]     = useState('');
  const [password, setPassword]     = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captcha, setCaptcha]       = useState(generateCaptcha());
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [attempts, setAttempts]     = useState(0);
  const [blocked, setBlocked]       = useState(false);
  const [blockTimer, setBlockTimer] = useState(0);

  // Bloqueo temporal tras 3 intentos fallidos
  useEffect(() => {
    if (attempts >= 3) {
      setBlocked(true);
      setBlockTimer(30);
      const t = setInterval(() => {
        setBlockTimer(p => {
          if (p <= 1) {
            clearInterval(t);
            setBlocked(false);
            setAttempts(0);
            return 0;
          }
          return p - 1;
        });
      }, 1000);
      return () => clearInterval(t);
    }
  }, [attempts]);

  const refreshCaptcha = () => {
    setCaptcha(generateCaptcha());
    setCaptchaInput('');
  };

  const handleSubmit = async () => {
    if (blocked) return;
    setError('');

    if (!username || !password) {
      setError('Completa todos los campos.');
      return;
    }
    if (parseInt(captchaInput) !== captcha.answer) {
      setError('Captcha incorrecto.');
      refreshCaptcha();
      setAttempts(p => p + 1);
      return;
    }

    setLoading(true);
    try {
      const form = new URLSearchParams();
      form.append('username', username);
      form.append('password', password);
      const raspberryIp = window.location.hostname
      const res = await fetch('http://${raspberryIp}:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('phantom_token', data.access_token);
        localStorage.setItem('phantom_role',  data.role);
        onLogin(data.role);
      } else {
        setError('Credenciales incorrectas.');
        setAttempts(p => p + 1);
        refreshCaptcha();
      }
    } catch {
      setError('No se puede conectar al C2. Verifica que el backend esté activo.');
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-mono">

      {/* Fondo con grid */}
      <div className="absolute inset-0 opacity-5 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:20px_20px]" />

      <div className="relative w-full max-w-md">

        {/* Corner accents */}
        <div className="absolute -top-2 -left-2 w-8 h-8 border-t-2 border-l-2 border-yellow-500/60" />
        <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-2 border-r-2 border-yellow-500/60" />

        <div className="border-2 border-yellow-600/40 bg-slate-900/80 rounded-xl p-8 space-y-6 shadow-2xl backdrop-blur">

          {/* Header */}
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="relative w-20 h-20 bg-slate-950 rounded-full border border-yellow-600/30 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-dashed border-yellow-500/20 animate-spin" style={{ animationDuration: '10s' }} />
                <svg className="w-12 h-12 text-yellow-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10a8 8 0 0 1 16 0v1.5c0 1.5-.5 2.5-1.5 3.5l-1.5 1.5v2.5a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-2.5L5.5 15C4.5 14 4 13 4 11.5V10z" fill="rgba(32,16,0,0.3)" />
                  <path d="M9 19v-2M11 19v-2M13 19v-2M15 19v-2" strokeWidth="1.5" />
                </svg>
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-100 uppercase tracking-wider">
                SENTINEL <span className="text-yellow-500">PHANTOM</span>
              </h1>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">
                C2 TACTICAL PLATFORM · ACCESO RESTRINGIDO
              </p>
            </div>
            <div className="inline-flex items-center gap-2 text-[9px] font-black text-red-400 bg-red-950/30 border border-red-900/40 px-3 py-1 rounded">
              <ShieldAlert className="w-3 h-3" />
              SOLO PERSONAL AUTORIZADO
            </div>
          </div>

          {/* Bloqueo temporal */}
          {blocked && (
            <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 text-center">
              <div className="text-red-400 font-black text-sm">ACCESO BLOQUEADO</div>
              <div className="text-red-500 text-[10px] mt-1">
                Demasiados intentos fallidos. Espera {blockTimer}s
              </div>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                IDENTIFICADOR DE OPERADOR
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={handleKey}
                disabled={blocked}
                placeholder="ej. User123"
                className="w-full bg-slate-950 border border-slate-700 focus:border-yellow-500 text-slate-100 px-4 py-3 rounded-lg text-sm font-bold outline-none transition-colors placeholder-slate-600 disabled:opacity-40"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                CLAVE DE ACCESO
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={handleKey}
                disabled={blocked}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-700 focus:border-yellow-500 text-slate-100 px-4 py-3 rounded-lg text-sm font-bold outline-none transition-colors placeholder-slate-600 disabled:opacity-40"
              />
            </div>

            {/* Captcha matemático */}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                VERIFICACIÓN HUMANA
              </label>
              <div className="flex gap-3 items-center">
                <div className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-center">
                  <span className="text-yellow-500 font-black text-lg tracking-widest">
                    {captcha.question} = ?
                  </span>
                </div>
                <input
                  type="number"
                  value={captchaInput}
                  onChange={e => setCaptchaInput(e.target.value)}
                  onKeyDown={handleKey}
                  disabled={blocked}
                  placeholder="R"
                  className="w-20 bg-slate-950 border border-slate-700 focus:border-yellow-500 text-slate-100 px-3 py-3 rounded-lg text-sm font-black outline-none transition-colors text-center placeholder-slate-600 disabled:opacity-40"
                />
                <button
                  onClick={refreshCaptcha}
                  className="p-3 bg-slate-800 border border-slate-700 rounded-lg hover:border-yellow-500 transition-colors text-slate-400 hover:text-yellow-500"
                  title="Nuevo captcha"
                >
                  ↻
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-950/30 border border-red-900/50 rounded-lg px-4 py-2 text-[10px] font-black text-red-400 uppercase">
                ⚠ {error}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={loading || blocked}
              className="w-full bg-yellow-600 hover:bg-yellow-500 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-black text-sm uppercase tracking-widest py-3 rounded-lg transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                  AUTENTICANDO...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  ACCEDER AL C2
                </>
              )}
            </button>
          </div>

          {/* Footer */}
          <div className="text-center text-[8px] font-black text-slate-600 uppercase tracking-widest pt-2 border-t border-slate-800">
            EMI · INGENIERÍA DE SISTEMAS · PROYECTO DE GRADO
          </div>
        </div>
      </div>
    </div>
  );
}