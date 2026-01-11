
import React, { useState, useEffect, useMemo } from 'react';
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
  User
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

  // Inicialização robusta para 24h
  useEffect(() => {
    const initApp = async () => {
      const savedUser = localStorage.getItem('sao_current_user');
      if (savedUser) setAuthState({ user: JSON.parse(savedUser), isVisitor: false });
      
      const local = localStorage.getItem('sao_movements');
      if (local) setMovements(JSON.parse(local));

      if (sheetUrl) {
        setIsSyncing(true);
        const cloudData = await fetchFromSheets(sheetUrl);
        if (cloudData) {
          setMovements(cloudData);
          localStorage.setItem('sao_movements', JSON.stringify(cloudData));
          setLastSync(new Date().toLocaleTimeString());
          setSyncError(false);
        } else {
          setSyncError(true);
        }
        setIsSyncing(false);
      }
      
      emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);
    };

    initApp();
  }, [sheetUrl]);

  const handleSyncManually = async () => {
    setIsSyncing(true);
    const data = await fetchFromSheets(sheetUrl);
    if (data) {
      setMovements(data);
      localStorage.setItem('sao_movements', JSON.stringify(data));
      setLastSync(new Date().toLocaleTimeString());
      setSyncError(false);
    } else {
      setSyncError(true);
    }
    setIsSyncing(false);
  };

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
      setLastSync(new Date().toLocaleTimeString());
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
      setLastSync(new Date().toLocaleTimeString());
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
              // Extrair o nome de guerra: busca todas as palavras em caixa alta (mínimo 2 letras)
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
              {syncError ? (
                <div className="flex items-center gap-1 text-[8px] font-bold uppercase text-red-100 bg-red-900/40 px-2 py-0.5 rounded-full animate-pulse border border-red-400/30">
                  <CloudOff className="w-3 h-3" /> Offline (Cache Local)
                </div>
              ) : (
                <div className="flex items-center gap-1 text-[8px] font-bold uppercase text-green-300 bg-green-950/30 px-2 py-0.5 rounded-full border border-green-500/20">
                  <CloudCheck className="w-3 h-3" /> Nuvem Conectada {lastSync && `(${lastSync})`}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Indicação de Usuário Logado com Saudação */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-red-800/40 rounded-xl border border-white/10">
              <User className="w-3.5 h-3.5 text-red-200" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Olá {authState.user.rank} {authState.user.warName}</span>
            </div>

            <button onClick={handleSyncManually} className={`p-2 rounded-xl transition-all hover:bg-red-800 bg-red-800/20 ${isSyncing ? 'animate-spin' : ''}`} title="Sincronizar">
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
        {/* Identificação Mobile com Saudação */}
        <div className="md:hidden mt-2 text-center border-t border-white/10 pt-2">
           <span className="text-[9px] font-bold uppercase tracking-widest text-red-100">Olá {authState.user.rank} {authState.user.warName}</span>
        </div>
      </header>

      {/* Modal Configuração */}
      {showConfig && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
              <h3 className="font-black uppercase text-slate-800 flex items-center gap-2">
                <Database className="w-5 h-5 text-red-600" /> Configuração SAO
              </h3>
              <button onClick={() => setShowConfig(false)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1 mb-1 block">URL da Planilha (GAS)</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-red-500 outline-none"
                  value={sheetUrl}
                  onChange={(e) => {
                    setSheetUrl(e.target.value);
                    localStorage.setItem('sao_sheet_url', e.target.value);
                  }}
                />
              </div>
              <button onClick={async () => { await handleSyncManually(); setShowConfig(false); }} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-xs uppercase shadow-lg hover:bg-slate-800 transition-all">Testar e Salvar Conexão</button>
            </div>
          </div>
        </div>
      )}

      {/* Modais de Confirmação */}
      {showCheckoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 border border-slate-100">
            <div className="flex items-center gap-3 text-amber-600 mb-6">
              <AlertTriangle className="w-8 h-8" />
              <h3 className="text-2xl font-black uppercase tracking-tight">Confirmar Carga</h3>
            </div>
            <div className="bg-slate-50 p-6 rounded-2xl border text-sm space-y-4 mb-6">
              <div><span className="text-slate-400 font-bold uppercase text-[10px]">Material:</span> <p className="font-bold text-slate-800">{checkoutMaterial}</p></div>
              <div className="flex justify-between">
                <div><span className="text-slate-400 font-bold uppercase text-[10px]">Responsável:</span> <p className="font-medium">{authState.user.rank} {authState.user.warName}</p></div>
                <div><span className="text-slate-400 font-bold uppercase text-[10px]">Retorno:</span> <p className="font-bold text-red-600">{formatDate(checkoutEstimatedReturn)}</p></div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCheckoutConfirm(false)} className="flex-1 py-4 bg-slate-100 font-bold rounded-xl uppercase hover:bg-slate-200 transition-all">Voltar</button>
              <button onClick={handleCheckoutFinal} className="flex-1 py-4 bg-green-600 text-white font-bold rounded-xl uppercase shadow-xl hover:bg-green-700 transition-all border-b-4 border-green-800">Registrar Saída</button>
            </div>
          </div>
        </div>
      )}

      {showReturnConfirm && returnTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8">
            <div className="flex items-center gap-3 text-green-600 mb-6">
              <CheckCircle2 className="w-8 h-8" />
              <h3 className="text-2xl font-black uppercase tracking-tight">Receber Material</h3>
            </div>
            <div className="space-y-4 mb-6">
              <div className="bg-slate-50 p-4 rounded-xl border">
                <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Material do acautelamento</p>
                <p className="font-bold text-slate-800">{returnTarget.material}</p>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block">Observações do Recebimento (SAO)</label>
                <textarea 
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-green-500" 
                  placeholder="Descreva o estado do material..."
                  value={pendingObservations[returnTarget.id] || ''}
                  onChange={(e) => setPendingObservations(prev => ({ ...prev, [returnTarget.id]: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowReturnConfirm(false)} className="flex-1 py-4 bg-slate-100 font-bold rounded-xl uppercase hover:bg-slate-200">Cancelar</button>
              <button onClick={handleReturnFinal} className="flex-1 py-4 bg-green-600 text-white font-bold rounded-xl uppercase shadow-xl border-b-4 border-green-800">Confirmar Devolução</button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* Navegação */}
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
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-[10px] text-amber-700 font-medium flex items-start gap-2">
                      <Info className="w-4 h-4 shrink-0 mt-0.5" />
                      Certifique-se de conferir o estado do material antes de sair. A devolução deve ser feita para um militar da SAO.
                    </div>
                  </div>
                </div>
                <button type="submit" className="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-5 rounded-2xl shadow-xl uppercase flex items-center justify-center gap-3 border-b-4 border-red-900 transition-all active:scale-95">
                  <PlusCircle className="w-5 h-5" /> Registrar Acautelamento
                </button>
              </form>
            </div>
          )}

          {activeTab === 'checkin' && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 min-h-[500px]">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-4 border-b gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 uppercase flex items-center gap-2">
                    <ArrowRightLeft className="w-6 h-6 text-red-600" /> Pendências na SAO
                  </h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Materiais aguardando recebimento oficial</p>
                </div>
                <div className="w-full md:w-96 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input type="text" placeholder="Pesquisar por nome ou material..." className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium outline-none focus:ring-2 focus:ring-red-500" value={checkinSearchTerm} onChange={(e) => setCheckinSearchTerm(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {movements.filter(m => m.status === MovementStatus.PENDENTE).filter(m => 
                  [m.name, m.material, m.bm].some(f => (f || '').toLowerCase().includes(checkinSearchTerm.toLowerCase()))
                ).map(m => (
                  <div key={m.id} className="border border-slate-100 rounded-2xl p-6 bg-slate-50/50 hover:bg-white transition-all flex flex-col md:flex-row justify-between gap-6 group">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="bg-red-700 text-white text-[9px] font-black px-3 py-1 rounded-full uppercase shadow-sm">{m.type}</span>
                        <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Saída em: {formatDateTime(m.dateCheckout)}
                        </span>
                      </div>
                      <h4 className="font-black text-lg uppercase text-slate-800 leading-tight mb-1">{m.rank} {m.warName}</h4>
                      <p className="text-[11px] text-slate-400 font-bold mb-3">BM {m.bm}</p>
                      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-sm text-slate-600 font-medium italic group-hover:border-red-100">
                        "{m.material}"
                      </div>
                      <div className="mt-3 text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                        <Info className="w-3 h-3" /> Motivo: <span className="text-slate-800">{m.reason}</span>
                      </div>
                    </div>
                    <button onClick={() => { setReturnTarget(m); setShowReturnConfirm(true); }} className="bg-green-600 hover:bg-green-700 text-white font-black px-8 py-4 rounded-xl uppercase text-[10px] self-center shadow-lg border-b-4 border-green-800 transition-all active:scale-95 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Receber Material
                    </button>
                  </div>
                ))}
                
                {movements.filter(m => m.status === MovementStatus.PENDENTE).length === 0 && (
                  <div className="text-center py-20 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200">
                    <CheckCircle2 className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-black uppercase text-xs tracking-widest">Tudo em dia! Nenhuma carga pendente.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-6">
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex flex-col lg:flex-row gap-4 mb-8">
                  <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Filtrar por nome, BM, material ou motivo..." className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-medium outline-none focus:ring-2 focus:ring-red-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                  <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-200 shrink-0">
                    {[
                      { id: 'all', label: 'Ver Tudo' },
                      { id: MovementStatus.PENDENTE, label: 'Pendentes' },
                      { id: MovementStatus.DEVOLVIDO, label: 'Devolvidos' }
                    ].map(f => (
                      <button key={f.id} onClick={() => setStatusFilter(f.id as any)} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === f.id ? 'bg-red-700 text-white shadow-md' : 'text-slate-500 hover:bg-slate-200'}`}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full text-left border-separate border-spacing-y-2">
                    <thead>
                      <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="px-4 py-2">Responsável</th>
                        <th className="px-4 py-2">Cronologia</th>
                        <th className="px-4 py-2">Material / Seção</th>
                        <th className="px-4 py-2 text-center">Status</th>
                        <th className="px-4 py-2">Recebedor SAO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMovements.map(m => (
                        <tr key={m.id} className="bg-slate-50/50 hover:bg-white transition-all text-sm group">
                          <td className="py-5 px-4 rounded-l-2xl border-l border-y border-slate-100">
                            <div className="font-black uppercase text-slate-800 leading-none mb-1">{m.rank} {m.warName}</div>
                            <div className="text-[9px] text-slate-400 font-bold">BM {m.bm}</div>
                          </td>
                          <td className="py-5 px-4 border-y border-slate-100">
                            <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1 mb-1">
                              <Calendar className="w-3 h-3" /> {formatDate(m.dateCheckout)}
                            </div>
                            {m.status === MovementStatus.PENDENTE ? (
                              <div className="text-[9px] text-red-600 font-black uppercase bg-red-50 px-2 py-0.5 rounded inline-block">Previsto: {formatDate(m.estimatedReturnDate)}</div>
                            ) : (
                              <div className="text-[9px] text-green-600 font-bold uppercase">OK: {formatDate(m.dateReturn)}</div>
                            )}
                          </td>
                          <td className="py-5 px-4 border-y border-slate-100">
                            <div className="font-bold text-slate-700 truncate max-w-[200px] mb-1">{m.material}</div>
                            <span className="text-[8px] font-black text-slate-400 uppercase border border-slate-200 px-2 py-0.5 rounded">{m.type}</span>
                          </td>
                          <td className="py-5 px-4 border-y border-slate-100 text-center">
                            <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm ${m.status === MovementStatus.PENDENTE ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{m.status}</span>
                          </td>
                          <td className="py-5 px-4 rounded-r-2xl border-r border-y border-slate-100">
                            {m.status === MovementStatus.DEVOLVIDO ? (
                              <div>
                                <div className="font-black uppercase text-slate-700 text-[10px] leading-none mb-1">{m.receiverRank} {m.receiverWarName}</div>
                                <div className="text-[8px] text-slate-400 italic truncate max-w-[100px]">"{m.observations}"</div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 opacity-40">
                                <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                                <span className="text-[9px] font-bold uppercase text-slate-400">Pendente</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bloco de Análise IA */}
              <div className="bg-slate-900 rounded-[2.5rem] p-8 sm:p-12 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/5 blur-[100px] -mr-32 -mt-32 rounded-full"></div>
                <div className="flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
                  <div className="flex items-center gap-6">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10 group-hover:scale-110 transition-transform">
                      <Sparkles className="w-8 h-8 text-yellow-400" />
                    </div>
                    <div>
                      <h3 className="font-black text-2xl uppercase tracking-tighter">Relatório Inteligente (Gemini)</h3>
                      <p className="text-sm text-slate-400 font-medium italic">Resumo estratégico para comando e logística da SAO.</p>
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
                    className="bg-white text-slate-950 px-10 py-5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-100 transition-all flex items-center gap-3 shadow-xl active:scale-95 disabled:opacity-30"
                  >
                    {isLoadingAi ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Sparkles className="w-4 h-4" /> Analisar Pendências</>}
                  </button>
                </div>
                {aiSummary && (
                  <div className="mt-10 p-8 bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 text-sm leading-relaxed whitespace-pre-wrap text-slate-200 animate-in slide-in-from-top-4 duration-500">
                    {aiSummary}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="p-10 text-center bg-white border-t border-slate-100">
        <div className="flex justify-center items-center gap-3 mb-4 grayscale opacity-40">
          <div className="h-6 w-px bg-slate-300"></div>
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">CBMMG - 6º BBM</span>
        </div>
        <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">SAO - Seção de Apoio Operacional | Gestão de Ativos Logísticos 24h</p>
      </footer>
    </div>
  );
};

export default App;
