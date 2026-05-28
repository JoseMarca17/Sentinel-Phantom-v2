import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import SentinelScreenMain from './pages/SentinelScreenMain';
import Dashboard from './pages/Dashboard';
import DbRfid from './pages/DbRfid';
import DbWifi from './pages/DbWifi';
import DbSubghz from './pages/DbSubghz';
import DbIr from './pages/DbIr';
import DbBluetooth from './pages/DbBluetooth';

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-mono select-none">
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      
      <main className="flex-1 p-6 md:p-8 overflow-y-auto w-full">
        {currentPage === 'device' && <SentinelScreenMain />}
        {currentPage === 'dashboard' && <Dashboard />}
        {currentPage === 'db-rfid' && <DbRfid />}
        {currentPage === 'db-wifi' && <DbWifi />}
        {currentPage === 'db-subghz' && <DbSubghz />}
        {currentPage === 'db-ir' && <DbIr />}
        {currentPage === 'db-bluetooth' && <DbBluetooth />}
      </main>
    </div>
  );
}