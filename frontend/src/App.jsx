// frontend/src/App.jsx
import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import SentinelScreenMain from './pages/SentinelScreenMain';
import Dashboard from './pages/Dashboard';
import DbRfid from './pages/DbRfid';

export default function App() {
  const [currentPage, setCurrentPage] = useState('device');

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-mono select-none">
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      
      <main className="flex-1 p-6 md:p-8 overflow-y-auto">
        {currentPage === 'device' && <SentinelScreenMain />}
        {currentPage === 'dashboard' && <Dashboard />}
        {currentPage === 'db-rfid' && <DbRfid />}
        
        {currentPage.startsWith('db-') && currentPage !== 'db-rfid' && (
          <div className="space-y-4">
            <h1 className="text-xl font-black tracking-widest text-slate-100 uppercase">
              REPOSITORIO SQLITE <span className="text-yellow-500">// {currentPage.slice(3).toUpperCase()}</span>
            </h1>
            <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-xl text-xs text-slate-500 shadow-inner">
              [!] NO RECORDS FOUND // ESPERANDO VOLCADOS DEL HARDWARE
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
