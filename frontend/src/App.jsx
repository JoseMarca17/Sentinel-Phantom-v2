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
  // Verificar token al montar de forma limpia sin peticiones fantasma
  useEffect(() => {
    const token = localStorage.getItem('phantom_token');
    const savedRole = localStorage.getItem('phantom_role');
    
    if (token && savedRole) {
      // Bypass temporal seguro: si hay sesión local activa, la cargamos directamente
      setIsAuthenticated(true);
      setRole(savedRole);
    } else {
      // Si no hay credenciales, forzar limpieza y mandar al Login
      localStorage.removeItem('phantom_token');
      localStorage.removeItem('phantom_role');
      setIsAuthenticated(false);
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