import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import SentinelScreenMain from './pages/SentinelScreenMain';
import Dashboard from './pages/Dashboard';
import DbRfid from './pages/DbRfid';
import DbWifi from './pages/DbWifi';
import DbSubghz from './pages/DbSubghz';
import DbIr from './pages/DbIr';
import DbBluetooth from './pages/DbBluetooth';
import Login from './pages/Login';
const raspberryIp = window.location.hostname;
export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState(null);

  // Verificar token al montar
  useEffect(() => {
    const token = localStorage.getItem('phantom_token');
    const savedRole = localStorage.getItem('phantom_role');
    if (token) {
      // Verificar que el token sigue siendo válido
      fetch('http://${raspberryIp}:8000/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(r => {
          if (r.ok) {
            setIsAuthenticated(true);
            setRole(savedRole);
          } else {
            // Token expirado o inválido
            localStorage.removeItem('phantom_token');
            localStorage.removeItem('phantom_role');
          }
        })
        .catch(() => {
          // Backend offline — permitir acceso si hay token guardado
          setIsAuthenticated(true);
          setRole(savedRole);
        });
    }
  }, []);

  const handleLogin = (userRole) => {
    setIsAuthenticated(true);
    setRole(userRole);
  };

  const handleLogout = () => {
    localStorage.removeItem('phantom_token');
    localStorage.removeItem('phantom_role');
    setIsAuthenticated(false);
    setRole(null);
    setCurrentPage('dashboard');
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-mono select-none">
      <Sidebar
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onLogout={handleLogout}
        role={role}
      />
      <main className="flex-1 p-6 md:p-8 overflow-y-auto w-full">
        {currentPage === 'device'       && <SentinelScreenMain />}
        {currentPage === 'dashboard'    && <Dashboard />}
        {currentPage === 'db-rfid'      && <DbRfid />}
        {currentPage === 'db-wifi'      && <DbWifi />}
        {currentPage === 'db-subghz'    && <DbSubghz />}
        {currentPage === 'db-ir'        && <DbIr />}
        {currentPage === 'db-bluetooth' && <DbBluetooth />}
      </main>
    </div>
  );
}