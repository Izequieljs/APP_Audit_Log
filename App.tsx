import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DropZone } from './components/DropZone';
import { ResultCard } from './components/ResultCard';
import { FileData, FileExtractionResult } from './types';
import { extractShipmentId } from './services/utils';
import { extractDataFromPdf } from './services/geminiService';
import { generateExcelReport } from './services/excelService';
import { AuthProvider, useAuth } from './components/AuthContext';
import { AuthPanel } from './components/AuthPanel';
import { AdminDashboard } from './components/AdminDashboard';

type LogisticsMode = 'AEREO_FOR' | 'MARITIMO_PEC' | 'MARITIMO_SUAPE';

const MainApp: React.FC = () => {
  const { user, token, logout } = useAuth();
  const [showAdmin, setShowAdmin] = useState(false);
  const [files, setFiles] = useState<FileData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [results, setResults] = useState<FileExtractionResult[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [selectedMode, setSelectedMode] = useState<LogisticsMode>('AEREO_FOR');
  const [useTolerance, setUseTolerance] = useState(true);
  const [toleranceValue, setToleranceValue] = useState(0.05);
  const [forceLocal, setForceLocal] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [remainingLimit, setRemainingLimit] = useState<number | null>(null);

  // Ref to keep track of the stop signal
  const stopSignal = React.useRef(false);

  // Log usage
  useEffect(() => {
    if (user && token) {
      fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'ACCESS', details: 'User accessed the main application' })
      }).catch(console.error);
    }
  }, [user, token]);

  // Fetch limit for selected mode
  useEffect(() => {
    if (user && token) {
      fetch(`/api/limit?mode=${selectedMode}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => setRemainingLimit(data.remaining))
      .catch(console.error);
    }
  }, [selectedMode, user, token, processedCount]);

  const handleAddFiles = (newFiles: File[]) => {
    setFiles(prev => {
      const existingNames = new Set(prev.map(f => f.name));
      const uniqueNewFiles = newFiles.filter(f => !existingNames.has(f.name));
      
      const formattedFiles: FileData[] = uniqueNewFiles.map(f => ({
        id: uuidv4(),
        file: f,
        name: f.name,
        shipmentId: extractShipmentId(f.name)
      }));
      return [...prev, ...formattedFiles];
    });
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearAll = () => {
    setFiles([]);
    setResults([]);
    setProcessedCount(0);
    setStartTime(null);
  };

  const stopProcessing = () => {
    setIsStopping(true);
    stopSignal.current = true;
  };

  const modes = [
    { 
      id: 'AEREO_FOR', 
      label: 'AÉREO - FORTALEZA', 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      )
    },
    { 
      id: 'MARITIMO_PEC', 
      label: 'MARÍTIMO - PECÉM',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.9 5.8 2.38 8"/><path d="M12 10V4"/><polyline points="8 8 12 4 16 8"/><rect x="10" y="4" width="4" height="6" fill="currentColor" fillOpacity="0.1" stroke="none"/></svg>
      )
    },
    { 
      id: 'MARITIMO_SUAPE', 
      label: 'MARÍTIMO - SUAPE',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16.2 7.8l-2.4 2.4"/><path d="M14.1 14.1l-2.4 2.4"/><path d="M7.8 16.2l2.4-2.4"/><path d="M9.9 9.9l2.4-2.4"/><path d="M12 2v20"/><path d="M2 12h20"/></svg>
      )
    }
  ];

  const startExtraction = async () => {
    if (files.length === 0) {
      alert("Por favor, adicione pelo menos um arquivo PDF.");
      return;
    }

    // Check daily limit
    if (user && token) {
      try {
        const limitRes = await fetch(`/api/limit?mode=${selectedMode}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const limitData = await limitRes.json();
        if (limitData.remaining < files.length) {
          const modeLabel = modes.find(m => m.id === selectedMode)?.label || selectedMode;
          alert(`O limite de tokens para a modalidade ${modeLabel} acabou e somente será renovado no outro dia. (Restam ${limitData.remaining} processos hoje)`);
          return;
        }
      } catch (err) {
        console.error("Error checking limit:", err);
      }
    }

    setIsProcessing(true);
    setIsStopping(false);
    stopSignal.current = false;
    setResults([]);
    setProcessedCount(0);
    setStartTime(Date.now());

    const processName = files.length > 0 ? files[0].name.substring(0, 10).toUpperCase() : "Relatorio";

    // Log extraction start
    if (user && token) {
      fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'EXTRACTION_START', details: `Started extraction for ${files.length} files in mode ${selectedMode}. Process: ${processName}` })
      }).catch(console.error);
    }

    const newResults: FileExtractionResult[] = [];
    let totalTokens = 0;

    for (const file of files) {
      if (stopSignal.current) {
        console.log("Processamento interrompido pelo usuário.");
        break;
      }

      // Check limit again per file just in case another user used it
      if (user && token) {
        try {
          const limitRes = await fetch(`/api/limit?mode=${selectedMode}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const limitData = await limitRes.json();
          if (limitData.remaining <= 0) {
            const modeLabel = modes.find(m => m.id === selectedMode)?.label || selectedMode;
            alert(`O limite de tokens para a modalidade ${modeLabel} acabou e somente será renovado no outro dia.`);
            break;
          }
        } catch (err) {
          console.error("Error checking limit:", err);
        }
      }

      // Future: Pass selectedMode to extraction service to filter logic
      const result = await extractDataFromPdf(file, selectedMode, forceLocal);
      if (result) {
        newResults.push(result);
        setResults(prev => [...prev, result]);
        if (result.tokensUsed) {
            totalTokens += result.tokensUsed;
        }
        
        // Increment limit
        if (user && token) {
          fetch('/api/limit/increment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ count: 1, mode: selectedMode })
          }).catch(console.error);
        }
      }
      setProcessedCount(prev => prev + 1);
    }

    if (user && token && totalTokens > 0) {
      fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'EXTRACTION_END', details: `Finished extraction. Process: ${processName}. Tokens used: ${totalTokens}` })
      }).catch(console.error);
    }

    setIsProcessing(false);
    setIsStopping(false);
    stopSignal.current = false;
    setStartTime(null);
  };

  const calculateEstimatedTime = () => {
    if (!startTime || processedCount === 0 || files.length === 0) return null;
    
    const elapsedMs = Date.now() - startTime;
    const msPerFile = elapsedMs / processedCount;
    const remainingFiles = files.length - processedCount;
    const remainingMs = remainingFiles * msPerFile;
    
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    
    if (remainingSeconds < 60) {
      return `${remainingSeconds} seg`;
    }
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${minutes}m ${seconds}s`;
  };

  const first10Chars = files.length > 0 ? files[0].name.substring(0, 10).toUpperCase() : "";
  const hasMismatch = files.some(f => f.name.substring(0, 10).toUpperCase() !== first10Chars);

  if (!user) {
    return <AuthPanel />;
  }

  if (showAdmin && user.role === 'admin') {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white shadow-sm sticky top-0 z-10 border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <div className="w-10 h-10 bg-gradient-to-br from-[#FB923C] to-[#EA580C] rounded-full flex items-center justify-center text-white shadow-md">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-[spin_10s_linear_infinite]"><path d="M12 12c0-3 2.5-5.5 5.5-5.5S23 9 23 12H12z"></path><path d="M12 12c0 3-2.5 5.5-5.5 5.5S1 15 1 12h11z"></path><path d="M12 12c-3 0-5.5-2.5-5.5-5.5S9 1 12 1v11z"></path></svg>
                </div>
                Painel Admin - Aeris Extractor
              </h1>
              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">Revisão: 0.25</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-slate-600">Olá, {user.name}</span>
              <button onClick={() => setShowAdmin(false)} className="text-sm font-medium text-[#EA580C] hover:text-[#C2410C]">
                Voltar ao App
              </button>
              <button onClick={logout} className="text-sm font-medium text-red-600 hover:text-red-700">
                Sair
              </button>
            </div>
          </div>
        </header>
        <AdminDashboard />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-orange-200">
      {/* Navbar / Corporate Header */}
      <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
             {/* Abstract Wind/Energy Logo - ORANGE */}
            <div className="w-10 h-10 bg-gradient-to-br from-[#FB923C] to-[#EA580C] rounded-full flex items-center justify-center text-white shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-[spin_10s_linear_infinite]"><path d="M12 12c0-3 2.5-5.5 5.5-5.5S23 9 23 12H12z"></path><path d="M12 12c0 3-2.5 5.5-5.5 5.5S1 15 1 12h11z"></path><path d="M12 12c-3 0-5.5-2.5-5.5-5.5S9 1 12 1v11z"></path></svg>
            </div>
            <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">AERIS <span className="font-light text-[#EA580C]">AUDIT</span></h1>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">Revisão: 0.25</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 border-r border-slate-200 pr-6">
                <span className="text-sm font-medium text-slate-600">Olá, {user.name}</span>
                {user.role === 'admin' && (
                  <button onClick={() => setShowAdmin(true)} className="text-sm font-medium text-[#EA580C] hover:text-[#C2410C]">
                    Painel Admin
                  </button>
                )}
                <button onClick={logout} className="text-sm font-medium text-red-600 hover:text-red-700">
                  Sair
                </button>
              </div>
              <div className="flex gap-3">
                  {files.length > 0 && !isProcessing && (
                     <button 
                        onClick={clearAll}
                        className="px-5 py-2 rounded-full text-sm font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                     >
                       Limpar
                     </button>
                  )}
                  {results.length > 0 && !isProcessing && (
                      <button 
                          onClick={() => generateExcelReport(results, useTolerance ? toleranceValue : 0, first10Chars || "Relatorio")}
                          className="bg-[#EA580C] hover:bg-[#C2410C] text-white px-6 py-2 rounded-full text-sm font-semibold transition-all shadow-md hover:shadow-lg flex items-center gap-2 transform active:scale-95"
                      >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                          <span>Exportar Excel</span>
                      </button>
                  )}
              </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        
        {/* Hero / Intro */}
        <div className="mb-10 text-center max-w-3xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight text-slate-900">
            Auditoria Logística <span className="text-[#EA580C]">Integrada</span>
          </h2>
          <p className="text-slate-500 text-lg leading-relaxed font-light">
            Selecione a modalidade de transporte abaixo e carregue os documentos para auditoria.
          </p>
        </div>

        {/* Mode Selection Tabs - Apple Style Segmented Control */}
        <div className="flex justify-center mb-2">
          <div className="bg-white p-1.5 rounded-full border border-slate-200 shadow-sm inline-flex flex-wrap justify-center gap-1 sm:gap-2">
            {modes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setSelectedMode(mode.id as LogisticsMode)}
                className={`
                  flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300
                  ${selectedMode === mode.id 
                    ? 'bg-slate-900 text-white shadow-md transform scale-100' 
                    : 'bg-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }
                `}
              >
                {mode.icon}
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {remainingLimit !== null && (
          <div className="text-center mb-8 text-sm font-medium text-slate-500">
            Limite diário para esta modalidade: <span className={remainingLimit > 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>{remainingLimit} processos restantes</span>
          </div>
        )}

        {/* Tolerance Configuration */}
        <div className="flex flex-col items-center mb-10 space-y-4">
          <div className="flex items-center gap-4">
            <span className="font-medium text-slate-700">Com tolerância na conferência cruzada?</span>
            <div className="flex bg-white p-1 rounded-full border border-slate-200 shadow-sm">
              <button
                onClick={() => setUseTolerance(true)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${useTolerance ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Sim
              </button>
              <button
                onClick={() => setUseTolerance(false)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${!useTolerance ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Não
              </button>
            </div>
          </div>
          
          {useTolerance && (
            <div className="flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <span className="text-sm text-slate-600">Valor da tolerância:</span>
              <select 
                value={toleranceValue}
                onChange={(e) => setToleranceValue(Number(e.target.value))}
                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-sm"
              >
                <option value={0.01}>R$ 0,01</option>
                <option value={0.02}>R$ 0,02</option>
                <option value={0.03}>R$ 0,03</option>
                <option value={0.04}>R$ 0,04</option>
                <option value={0.05}>R$ 0,05</option>
                <option value={0.06}>R$ 0,06</option>
                <option value={0.07}>R$ 0,07</option>
                <option value={0.08}>R$ 0,08</option>
                <option value={0.09}>R$ 0,09</option>
                <option value={0.10}>R$ 0,10</option>
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 mt-2">
            <label className="flex items-center space-x-2 text-sm text-slate-600 cursor-pointer">
              <input 
                type="checkbox" 
                checked={forceLocal} 
                onChange={(e) => setForceLocal(e.target.checked)} 
                className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300" 
              />
              <span>Forçar Extração Local (Sem IA / Mais Rápido)</span>
            </label>
          </div>
        </div>

        {/* Unified Input Area - Modernized */}
        <div className="mb-12 h-[380px] bg-white rounded-3xl shadow-xl shadow-orange-100/50 border border-slate-100 overflow-hidden">
            <DropZone 
                title={`Arquivos: ${modes.find(m => m.id === selectedMode)?.label}`}
                description="Processamento automático de DI, PC, Notas Fiscais e Guias de Impostos."
                files={files}
                onFilesAdded={handleAddFiles}
                onRemoveFile={removeFile}
                icon={
                    <svg className="w-16 h-16 text-[#EA580C]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="12" y1="18" x2="12" y2="12"></line>
                        <line x1="9" y1="15" x2="15" y2="15"></line>
                    </svg>
                }
                colorClass="text-[#EA580C] bg-orange-50"
            />
        </div>

        {/* Action Area - Wind Energy Button */}
        <div className="flex flex-col items-center mb-20">
          {hasMismatch && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex flex-col items-center text-center animate-in fade-in w-full max-w-2xl">
              <svg className="w-10 h-10 text-red-500 mb-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              <p className="text-red-700 font-medium mb-4">Atenção: Os arquivos selecionados não pertencem ao mesmo processo (os 10 primeiros caracteres dos nomes divergem).</p>
              <button 
                onClick={clearAll} 
                className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-full font-bold shadow-md transition-all"
              >
                Limpar Tudo e Recomeçar
              </button>
            </div>
          )}

          <div className="flex justify-center gap-4 w-full">
            <button 
              onClick={startExtraction}
              disabled={isProcessing || files.length === 0 || hasMismatch}
              className={`
                relative group overflow-hidden px-16 py-5 rounded-full text-xl font-bold shadow-2xl transition-all duration-300 transform 
                ${isProcessing 
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none scale-95' 
                  : 'bg-gradient-to-r from-[#F97316] to-[#C2410C] text-white hover:shadow-orange-500/40 hover:-translate-y-1 hover:scale-105 active:scale-95'
                }
              `}
            >
              {isProcessing ? (
                <span className="flex items-center gap-4">
                  {/* Turbine Spinner */}
                  <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                     <path className="opacity-75" fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"></path>
                     <path fill="currentColor" d="M12 4V2C6.48 2 2 6.48 2 12h2c0-4.41 3.59-8 8-8z"></path>
                  </svg>
                  <span>Processando ({processedCount}/{files.length})...</span>
                </span>
              ) : (
                <span className="flex items-center gap-3">
                  <span>INICIAR PROCESSAMENTO</span>
                  <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                </span>
              )}
              
              {/* Glossy overlay effect */}
              {!isProcessing && (
                  <div className="absolute inset-0 rounded-full bg-gradient-to-t from-black/10 to-transparent pointer-events-none"></div>
              )}
            </button>

            {isProcessing && (
              <button
                onClick={stopProcessing}
                disabled={isStopping}
                className={`
                  px-8 py-5 rounded-full text-xl font-bold transition-all duration-300 shadow-md
                  ${isStopping
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-red-500 text-white hover:bg-red-600 hover:shadow-lg hover:-translate-y-1 active:scale-95'
                  }
                `}
              >
                <span className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
                  {isStopping ? 'PARANDO...' : 'PARAR'}
                </span>
              </button>
            )}
          </div>

          {/* Progress Bar & ETA */}
          {isProcessing && files.length > 0 && (
            <div className="w-full max-w-2xl mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between text-sm font-medium text-slate-500 mb-2 px-1">
                <span>Progresso: {Math.round((processedCount / files.length) * 100)}%</span>
                {processedCount > 0 && (
                  <span className="text-[#EA580C]">
                    Tempo estimado: {calculateEstimatedTime() || 'Calculando...'}
                  </span>
                )}
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                <div 
                  className="h-full bg-gradient-to-r from-[#F97316] to-[#C2410C] rounded-full transition-all duration-500 ease-out relative"
                  style={{ width: `${(processedCount / files.length) * 100}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]"></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Results Area */}
        {results.length > 0 && (
          <div className="space-y-6">
             <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-2">
                 <h3 className="text-2xl font-bold text-slate-900">Resultados</h3>
                 <span className="text-sm font-medium text-slate-400">{results.length} arquivos extraídos</span>
             </div>
             
             <div className="grid grid-cols-1 gap-5">
               {results.map((res) => (
                 <ResultCard key={res.fileId} result={res} />
               ))}
             </div>
          </div>
        )}
      </main>
      
      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-8 mt-12">
          <div className="max-w-7xl mx-auto px-6 text-center text-slate-400 text-sm">
              <p>&copy; {new Date().getFullYear()} Aeris Energy. Todos os direitos reservados.</p>
          </div>
      </footer>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
};

export default App;