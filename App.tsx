
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AuthState, MilitaryPerson, Movement, MovementStatus, MaterialType } from './types';
import { MATERIAL_TYPES, RANKS } from './constants';
import { getSmartSummary } from './geminiService';
import { saveToSheets, fetchFromSheets } from './sheetService';
import emailjs from '@emailjs/browser';
import { 
  ClipboardList, 
  LogOut, 
  History, 
  PlusCircle, 
  Search, 
  ArrowRightLeft, 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles, 
  Calendar, 
  Clock, 
  X,
  Info,
  Loader2,
  Settings,
  CloudCheck,
  CloudOff,
  RefreshCw,
  Database,
  User,
  Wifi,
  WifiOff
} from 'lucide-react';

const PERMANENT_SHEET_URL = "https://script.google.com/macros/s/AKfycbzlAE_yo3o6mo7X-4x4oeE0zD8S16gbqi0zEty5IyebTE7ww178_u1g8bOdffB_ApEt/exec";

const EMAILJS_CONFIG = {
  SERVICE_ID: "TESTE SAO", 
  TEMPLATE_ID: "template_epzy7h4", 
  PUBLIC_KEY: "E0VFVhDaGcvZiH2zD"
};

const formatBM = (value: string): string => {
  if (!value) return "";
  const digits = value.replace(/\D/g, '').slice(0, 7);
  if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  return digits;
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  } catch { return dateStr; }
};

const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
  } catch { return dateStr; }
};

const App: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>({ user: null, isVisitor: false });
  const [activeTab, setActiveTab] = useState<'checkout' | 'checkin' | 'history'>('checkout');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [checkinSearchTerm, setCheckinSearchTerm] = useState(''); 
  const [statusFilter, setStatusFilter] = useState<'all' | MovementStatus>(MovementStatus.PENDENTE);
  
  const [sheetUrl, setSheetUrl] = useState<string>(localStorage.getItem('sao_sheet_url') || PERMANENT_SHEET_URL);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);

  // Form states
  const [formRank, setFormRank] = useState('');
  const [formName, setFormName] = useState('');
  const [formBm, setFormBm] = useState('');
  const [checkoutMaterial, setCheckoutMaterial] = useState('');
  const [checkoutReason, setCheckoutReason] = useState('');
  const [checkoutType, setCheckoutType] = useState<MaterialType>(MaterialType.TERRESTRE);
  const [checkoutEstimatedReturn, setCheckoutEstimatedReturn] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  const [pendingObservations, setPendingObservations] = useState<Record<string, string>>({});
  const [returnTarget, setReturnTarget] = useState<Movement | null>(null);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);

  // Função de sincronização memorizada
  const syncData = useCallback(async (showLoader = true) => {
    if (showLoader) setIsSyncing(true);
    const data = await fetchFromSheets(sheetUrl);
    if (data) {
      setMovements(data);
      localStorage.setItem('sao_movements', JSON.stringify(data));
      setLastSync(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      setSyncError(false);
    } else {
      setSyncError(true);
    }
    if (showLoader) setIsSyncing(false);
  }, [sheetUrl]);

  // Monitor de conexão e Auto-Sync 24h
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Inicialização
    const initApp = async () => {
      const savedUser = localStorage.getItem('sao_current_user');
      if (savedUser) setAuthState({ user: JSON.parse(savedUser), isVisitor: false });
      
      const local = localStorage.getItem('sao_movements');
      if (local) setMovements(JSON.parse(local));

      await syncData();
      emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);
    };

    initApp();

    // Timer de 5 minutos para manter o terminal atualizado (Operação 24h)
    const autoSyncInterval = setInterval(() => {
      if (navigator.onLine) {
        syncData(false);
      }
    }, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(autoSyncInterval);
    };
  }, [syncData]);

  const handleSyncManually = () => syncData(true);

  const handleCheckoutFinal = async () => {
    if (!authState.user) return;
    const newMovement: Movement = {
      id: Math.random().toString(36).substr(2, 9),
      bm: authState.user.bm, 
      name: authState.user.name, 
      warName: authState.user.warName,
      rank: authState.user.rank, 
      dateCheckout: new Date().toISOString(),
      estimatedReturnDate: checkoutEstimatedReturn, 
      material: checkoutMaterial,
      reason: checkoutReason || 'TPB', 
      type: checkoutType, 
      status: MovementStatus.PENDENTE
    };
    
    const updated = [newMovement, ...movements];
    setMovements(updated);
    localStorage.setItem('sao_movements', JSON.stringify(updated));
    
    const success = await saveToSheets(sheetUrl, updated);
    if (success) {
      setLastSync(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      setSyncError(false);
    } else {
      setSyncError(true);
    }
    
    setCheckoutMaterial(''); 
    setCheckoutReason(''); 
    setShowCheckoutConfirm(false);
    setActiveTab('history');
  };

  const handleReturnFinal = async () => {
    if (!authState.user || !returnTarget) return;
    const obs = pendingObservations[returnTarget.id] || 'Sem observações.';
    
    const updated = movements.map(m => {
      if (m.id === returnTarget.id) {
        return {
          ...m, 
          status: MovementStatus.DEVOLVIDO, 
          dateReturn: new Date().toISOString(),
          observations: obs, 
          receiverBm: authState.user?.bm,
          receiverName: authState.user?.name, 
          receiverRank: authState.user?.rank,
          receiverWarName: authState.user?.warName
        };
      }
      return m;
    });
    
    setMovements(updated);
    localStorage.setItem('sao_movements', JSON.stringify(updated));

    const success = await saveToSheets(sheetUrl, updated);
    if (success) {
      setLastSync(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      setSyncError(false);
    } else {
      setSyncError(true);
    }
    
    setReturnTarget(null);
    setShowReturnConfirm(false);
  };

  const filteredMovements = useMemo(() => {
    const term = (searchTerm || '').toLowerCase();
    return movements.filter(m => {
      const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
      const matchesSearch = [
        m.name || '', 
        m.material || '', 
        m.bm || '', 
        m.reason || ''
      ].some(f => f.toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });
  }, [movements, searchTerm, statusFilter]);

  if (!authState.user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-500">
          <div className="bg-red-700 p-10 text-center text-white">
            <h1 className="text-4xl font-black uppercase tracking-tighter">SAO - 6º BBM</h1>
            <p className="text-[10px] font-bold mt-2 opacity-90 tracking-widest uppercase">Controle de materiais da SAO</p>
          </div>
          <div className="p-8">
            <form onSubmit={(e) => {
              e.preventDefault();
              const names = formName.trim().split(/\s+/);
              const uppercaseWords = names.filter(n => n === n.toUpperCase() && n.length >= 2);
              const warNameFound = uppercaseWords.length > 0 ? uppercaseWords.join(' ') : names[0];
              const user = { rank: formRank, name: formName, warName: warNameFound, bm: formBm, cpf: '' };
              setAuthState({ user, isVisitor: false });
              localStorage.setItem('sao_current_user', JSON.stringify(user));
            }} className="space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Posto/Graduação</label>
                <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-red-500 outline-none" value={formRank} onChange={(e) => setFormRank(e.target.value)} required>
                  <option value="">Selecione...</option>
                  {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">nome completo (Nome de Guerra em caixa Alta)</label>
                <input type="text" placeholder="Ex: João SILVA Santos" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-red-500 outline-none" value={formName} onChange={(e) => setFormName(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">nº BM</label>
                <input type="text" placeholder="Ex: 123.456-7" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-red-500 outline-none" value={formBm} onChange={(e) => setFormBm(formatBM(e.target.value))} required />
              </div>
              <button type="submit" className="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-4 rounded-xl shadow-lg uppercase tracking-widest border-b-4 border-red-900 transition-all active:scale-95 mt-2">Acessar Sistema</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-red-700 text-white shadow-lg p-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex flex-col">
            <h1 className="font-black text-xl leading-none uppercase tracking-tighter">SAO - 6º BBM</h1>
            <div className="flex items-center gap-2 mt-1">
              {!isOnline ? (
                <div className="flex items-center gap-1 text-[8px] font-bold uppercase text-red-100 bg-red-900/60 px-2 py-0.5 rounded-full border border-red-400/30 animate-pulse">
                  <WifiOff className="w-3 h-3" /> Sem Internet
                </div>
              ) : syncError ? (
                <div className="flex items-center gap-1 text-[8px] font-bold uppercase text-amber-200 bg-amber-900/40 px-2 py-0.5 rounded-full border border-amber-400/30">
                  <CloudOff className="w-3 h-3" /> Planilha Offline
                </div>
              ) : (
                <div className="flex items-center gap-1 text-[8px] font-bold uppercase text-green-300 bg-green-950/30 px-2 py-0.5 rounded-full border border-green-500/20">
                  <Wifi className="w-3 h-3" /> Online {lastSync && `(${lastSync})`}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-red-800/40 rounded-xl border border-white/10">
              <User className="w-3.5 h-3.5 text-red-200" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Olá {authState.user.rank} {authState.user.warName}</span>
            </div>

            <button onClick={handleSyncManually} className={`p-2 rounded-xl transition-all hover:bg-red-800 bg-red-800/20 ${isSyncing ? 'animate-spin' : ''}`} title="Sincronizar Agora">
              <RefreshCw className="w-5 h-5" />
            </button>
            {authState.user.bm === '161.382-7' && (
              <button onClick={() => setShowConfig(true)} className="p-2 rounded-xl transition-all hover:bg-red-800">
                <Settings className="w-5 h-5" />
              </button>
            )}
            <button onClick={() => { setAuthState({ user: null, isVisitor: false }); localStorage.removeItem('sao_current_user'); }} className="p-2 hover:bg-red-800 rounded-xl transition-all">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="md:hidden mt-2 text-center border-t border-white/10 pt-2">
           <span className="text-[9px] font-bold uppercase tracking-widest text-red-100">Olá {authState.user.rank} {authState.user.warName}</span>
        </div>
      </header>

      {/* Restante do componente permanece igual com as funcionalidades de abas e modais */}
      {/* ... (Omitido para brevidade, mas mantendo a lógica de abas) ... */}
      
      {/* O componente completo continua aqui como estava, mas com as melhorias de sync no topo */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-6">
        <div className="flex bg-white rounded-2xl shadow-sm border p-1 sticky top-20 z-40 backdrop-blur-md bg-white/90">
          {[
            { id: 'checkout', icon: PlusCircle, label: 'Saída' },
            { id: 'checkin', icon: ArrowRightLeft, label: 'Devolução' },
            { id: 'history', icon: History, label: 'Histórico' }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold transition-all ${activeTab === tab.id ? 'bg-red-700 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
              <tab.icon className="w-4 h-4" />
              <span className="text-[10px] sm:text-xs uppercase tracking-wider">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === 'checkout' && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 uppercase mb-8 flex items-center gap-2">
                <ClipboardList className="w-6 h-6 text-red-600" /> Registro de Saída de Material
              </h2>
              <form onSubmit={(e) => { e.preventDefault(); setShowCheckoutConfirm(true); }} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-5">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição Detalhada dos Materiais</label>
                      <textarea placeholder="Ex: 02 Cordas de 50m, 01 Maca Sked..." className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl min-h-[160px] font-medium focus:ring-2 focus:ring-red-500 outline-none transition-all" value={checkoutMaterial} onChange={(e) => setCheckoutMaterial(e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Motivo do acautelamento</label>
                      <input 
                        type="text" 
                        placeholder="Treinamento, TPB, manutenção, Ocorrência" 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-red-500 outline-none" 
                        value={checkoutReason} 
                        onChange={(e) => setCheckoutReason(e.target.value)} 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Previsão de Retorno (Estimativa)</label>
                      <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-red-500 outline-none" value={checkoutEstimatedReturn} onChange={(e) => setCheckoutEstimatedReturn(e.target.value)} required />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Seção Responsável pelo Material</label>
                    <div className="grid grid-cols-1 gap-2">
                      {MATERIAL_TYPES.map(t => (
                        <button key={t} type="button" onClick={() => setCheckoutType(t)} className={`flex justify-between items-center p-4 rounded-xl border transition-all ${checkoutType === t ? 'border-red-600 bg-red-50 text-red-700 font-bold shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          <span className="text-[10px] uppercase font-bold">{t}</span>
                          {checkoutType === t && <CheckCircle2 className="w-4 h-4" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <button type="submit" className="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-5 rounded-2xl shadow-xl uppercase flex items-center justify-center gap-3 border-b-4 border-red-900 transition-all active:scale-95">
                  <PlusCircle className="w-5 h-5" /> Registrar Acautelamento
                </button>
              </form>
            </div>
          )}
          {/* ... Outras abas permanecem com sua lógica original ... */}
          {activeTab === 'checkin' && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 min-h-[500px]">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-4 border-b gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 uppercase flex items-center gap-2">
                    <ArrowRightLeft className="w-6 h-6 text-red-600" /> Pendências na SAO
                  </h2>
                </div>
                <div className="w-full md:w-96 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input type="text" placeholder="Pesquisar..." className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium outline-none focus:ring-2 focus:ring-red-500" value={checkinSearchTerm} onChange={(e) => setCheckinSearchTerm(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {movements.filter(m => m.status === MovementStatus.PENDENTE).filter(m => 
                  [m.name, m.material, m.bm].some(f => (f || '').toLowerCase().includes(checkinSearchTerm.toLowerCase()))
                ).map(m => (
                  <div key={m.id} className="border border-slate-100 rounded-2xl p-6 bg-slate-50/50 hover:bg-white transition-all flex flex-col md:flex-row justify-between gap-6 group">
                    <div className="flex-1">
                      <h4 className="font-black text-lg uppercase text-slate-800 mb-1">{m.rank} {m.warName}</h4>
                      <p className="text-[11px] text-slate-400 font-bold mb-3">BM {m.bm} | Saída: {formatDateTime(m.dateCheckout)}</p>
                      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-sm text-slate-600 font-medium italic group-hover:border-red-100">
                        "{m.material}"
                      </div>
                    </div>
                    <button onClick={() => { setReturnTarget(m); setShowReturnConfirm(true); }} className="bg-green-600 hover:bg-green-700 text-white font-black px-8 py-4 rounded-xl uppercase text-[10px] self-center shadow-lg border-b-4 border-green-800 transition-all active:scale-95 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Receber Material
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'history' && (
             <div className="space-y-6">
                <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200">
                   {/* Interface de histórico mantida igual para consistência */}
                   <div className="flex flex-col lg:flex-row gap-4 mb-8">
                      <div className="flex-1 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" placeholder="Filtrar histórico..." className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-medium outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                      </div>
                   </div>
                   <div className="overflow-x-auto">
                      <table className="w-full text-left border-separate border-spacing-y-2">
                        <thead>
                          <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="px-4 py-2">Responsável</th>
                            <th className="px-4 py-2">Material</th>
                            <th className="px-4 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMovements.map(m => (
                            <tr key={m.id} className="bg-slate-50/50 hover:bg-white transition-all text-sm group">
                              <td className="py-5 px-4 rounded-l-2xl border-l border-y border-slate-100">
                                <div className="font-black uppercase text-slate-800">{m.rank} {m.warName}</div>
                                <div className="text-[9px] text-slate-400">BM {m.bm}</div>
                              </td>
                              <td className="py-5 px-4 border-y border-slate-100 font-bold text-slate-700">{m.material}</td>
                              <td className="py-5 px-4 rounded-r-2xl border-r border-y border-slate-100">
                                <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm ${m.status === MovementStatus.PENDENTE ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{m.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                   </div>
                </div>
                {/* Bloco de Análise IA mantido igual */}
                <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
                  <div className="flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
                    <div className="flex items-center gap-6">
                      <Sparkles className="w-8 h-8 text-yellow-400" />
                      <div>
                        <h3 className="font-black text-2xl uppercase tracking-tighter">Relatório Inteligente (Gemini)</h3>
                      </div>
                    </div>
                    <button 
                      onClick={async () => {
                        setIsLoadingAi(true);
                        const res = await getSmartSummary(movements);
                        setAiSummary(res);
                        setIsLoadingAi(false);
                      }} 
                      disabled={isLoadingAi || movements.length === 0}
                      className="bg-white text-slate-950 px-10 py-5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-100 transition-all flex items-center gap-3"
                    >
                      {isLoadingAi ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-4 h-4" />} Analisar Pendências
                    </button>
                  </div>
                  {aiSummary && <div className="mt-10 p-8 bg-white/5 rounded-3xl text-slate-200">{aiSummary}</div>}
                </div>
             </div>
          )}
        </div>
      </main>

      {/* Modais omitidos mas assumidos presentes na implementação final para o app completo */}
      {showReturnConfirm && returnTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8">
            <h3 className="text-2xl font-black uppercase tracking-tight text-green-600 mb-6">Receber Material</h3>
            <textarea 
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm min-h-[100px] outline-none" 
              placeholder="Observações do estado do material..."
              value={pendingObservations[returnTarget.id] || ''}
              onChange={(e) => setPendingObservations(prev => ({ ...prev, [returnTarget.id]: e.target.value }))}
            />
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowReturnConfirm(false)} className="flex-1 py-4 bg-slate-100 font-bold rounded-xl uppercase">Cancelar</button>
              <button onClick={handleReturnFinal} className="flex-1 py-4 bg-green-600 text-white font-bold rounded-xl uppercase shadow-xl">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {showCheckoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8">
            <h3 className="text-2xl font-black uppercase tracking-tight text-amber-600 mb-6">Confirmar Carga</h3>
            <div className="bg-slate-50 p-6 rounded-2xl border text-sm space-y-4 mb-6">
               <p className="font-bold">{checkoutMaterial}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCheckoutConfirm(false)} className="flex-1 py-4 bg-slate-100 font-bold rounded-xl uppercase">Voltar</button>
              <button onClick={handleCheckoutFinal} className="flex-1 py-4 bg-green-600 text-white font-bold rounded-xl uppercase shadow-xl">Confirmar Saída</button>
            </div>
          </div>
        </div>
      )}

      {showConfig && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6">
            <h3 className="font-black uppercase text-slate-800 mb-4">Configuração URL Planilha</h3>
            <input 
              type="text" 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono mb-4"
              value={sheetUrl}
              onChange={(e) => {
                setSheetUrl(e.target.value);
                localStorage.setItem('sao_sheet_url', e.target.value);
              }}
            />
            <button onClick={async () => { await handleSyncManually(); setShowConfig(false); }} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-xs uppercase">Salvar e Sincronizar</button>
          </div>
        </div>
      )}

      <footer className="p-10 text-center bg-white border-t border-slate-100">
        <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">CBMMG - 6º BBM</span>
      </footer>
    </div>
  );
};

export default App;
