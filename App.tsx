
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
  Mail,
  Loader2,
  Settings,
  CloudCheck,
  CloudOff,
  RefreshCw,
  Database,
  ExternalLink,
  MessageSquareQuote
} from 'lucide-react';

const PERMANENT_SHEET_URL = "https://script.google.com/macros/s/AKfycbzlAE_yo3o6mo7X-4x4oeE0zD8S16gbqi0zEty5IyebTE7ww178_u1g8bOdffB_ApEt/exec";

const EMAILJS_CONFIG = {
  SERVICE_ID: "TESTE SAO", 
  TEMPLATE_ID: "template_epzy7h4", 
  PUBLIC_KEY: "E0VFVhDaGcvZiH2zD"
};

// --- Helpers ---
const extractWarName = (fullName: string): string => {
  const matches = fullName.match(/\b[A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ]{2,}\b/g);
  return (matches && matches.length > 0) ? matches.join(' ') : fullName.split(' ')[0];
};

const formatBM = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 7);
  if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  return digits;
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  } catch { return dateStr; }
};

const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
  } catch { return dateStr; }
};

const App: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>({ user: null, isVisitor: false });
  const [activeTab, setActiveTab] = useState<'checkout' | 'checkin' | 'history'>('checkout');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [checkinSearchTerm, setCheckinSearchTerm] = useState(''); // Novo termo de busca para devolução
  const [statusFilter, setStatusFilter] = useState<'all' | MovementStatus>(MovementStatus.PENDENTE);
  
  // URL Permanente como padrão
  const [sheetUrl, setSheetUrl] = useState<string>(localStorage.getItem('sao_sheet_url') || PERMANENT_SHEET_URL);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [isProcessingEmail, setIsProcessingEmail] = useState(false);

  const [formRank, setFormRank] = useState('');
  const [formName, setFormName] = useState('');
  const [formBm, setFormBm] = useState('');
  const [checkoutMaterial, setCheckoutMaterial] = useState('');
  const [checkoutReason, setCheckoutReason] = useState('');
  const [checkoutType, setCheckoutType] = useState<MaterialType>(MaterialType.TERRESTRE);
  const [checkoutEstimatedReturn, setCheckoutEstimatedReturn] = useState(() => {
    // Define a previsão padrão para o ano de 2026
    const d = new Date();
    d.setFullYear(2026);
    return d.toISOString().split('T')[0];
  });
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);

  // Estados para Devolução
  const [pendingObservations, setPendingObservations] = useState<Record<string, string>>({});
  const [returnTarget, setReturnTarget] = useState<Movement | null>(null);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);

  useEffect(() => {
    const savedMovements = localStorage.getItem('sao_movements');
    if (savedMovements) setMovements(JSON.parse(savedMovements));
    
    const savedUser = localStorage.getItem('sao_current_user');
    if (savedUser) setAuthState({ user: JSON.parse(savedUser), isVisitor: false });
    
    emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);

    // Sincronização automática na carga
    if (sheetUrl) syncFromSheets();
  }, []);

  const syncFromSheets = async () => {
    if (!sheetUrl) return;
    setIsSyncing(true);
    const data = await fetchFromSheets(sheetUrl);
    if (data) {
      setMovements(data);
      localStorage.setItem('sao_movements', JSON.stringify(data));
      setLastSync(new Date().toLocaleTimeString());
    }
    setIsSyncing(false);
  };

  const syncToSheets = async (currentMovements: Movement[]) => {
    if (!sheetUrl) return;
    setIsSyncing(true);
    const success = await saveToSheets(sheetUrl, currentMovements);
    if (success) setLastSync(new Date().toLocaleTimeString());
    setIsSyncing(false);
  };

  useEffect(() => {
    localStorage.setItem('sao_movements', JSON.stringify(movements));
  }, [movements]);

  const handleIdentify = (e: React.FormEvent) => {
    e.preventDefault();
    if (formRank && formName && formBm) {
      const user = { rank: formRank, name: formName, warName: extractWarName(formName), bm: formBm, cpf: '' };
      setAuthState({ user, isVisitor: false });
      localStorage.setItem('sao_current_user', JSON.stringify(user));
    }
  };

  const handleLogout = () => {
    setAuthState({ user: null, isVisitor: false });
    localStorage.removeItem('sao_current_user');
  };

  const sendRealEmail = async (params: any) => {
    const recipientEmail = `${params.recipient.bm.replace(/\D/g, '')}@bombeiros.mg.gov.br`;
    const message = params.type === 'CHECKOUT' 
      ? `Olá ${params.recipient.rank} ${params.recipient.name}, registramos uma retirada de material (${params.material}).`
      : `Olá ${params.recipient.rank} ${params.recipient.name}, registramos a devolução do material (${params.material}).`;

    try {
      setIsProcessingEmail(true);
      await emailjs.send(EMAILJS_CONFIG.SERVICE_ID, EMAILJS_CONFIG.TEMPLATE_ID, {
        to_email: recipientEmail,
        message: message,
        subject: 'Notificação SAO - 6º BBM'
      });
      return true;
    } catch { return false; } 
    finally { setIsProcessingEmail(false); }
  };

  const handleCheckoutFinal = async () => {
    if (!authState.user) return;
    const newMovement: Movement = {
      id: Math.random().toString(36).substr(2, 9),
      bm: authState.user.bm, name: authState.user.name, warName: authState.user.warName,
      rank: authState.user.rank, dateCheckout: new Date().toISOString(),
      estimatedReturnDate: checkoutEstimatedReturn, material: checkoutMaterial,
      reason: checkoutReason || undefined, type: checkoutType, status: MovementStatus.PENDENTE
    };
    
    const updatedMovements = [newMovement, ...movements];
    setMovements(updatedMovements);
    await syncToSheets(updatedMovements);
    await sendRealEmail({ type: 'CHECKOUT', recipient: authState.user, material: checkoutMaterial });
    
    setCheckoutMaterial(''); setCheckoutReason(''); setShowCheckoutConfirm(false);
    setActiveTab('history');
  };

  const handleReturnFinal = async () => {
    if (!authState.user || !returnTarget) return;
    const obs = pendingObservations[returnTarget.id] || 'Sem observações.';
    
    const updated = movements.map(m => {
      if (m.id === returnTarget.id) {
        return {
          ...m, status: MovementStatus.DEVOLVIDO, dateReturn: new Date().toISOString(),
          observations: obs, receiverBm: authState.user?.bm,
          receiverName: authState.user?.name, receiverRank: authState.user?.rank,
          receiverWarName: authState.user?.warName
        };
      }
      return m;
    });
    
    setMovements(updated);
    await syncToSheets(updated);
    await sendRealEmail({ type: 'RETURN', recipient: { bm: returnTarget.bm, name: returnTarget.name, rank: returnTarget.rank } as any, material: returnTarget.material });
    
    // Limpar estados
    const newObs = { ...pendingObservations };
    delete newObs[returnTarget.id];
    setPendingObservations(newObs);
    setReturnTarget(null);
    setShowReturnConfirm(false);
  };

  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
      const term = searchTerm.toLowerCase();
      const matchesSearch = [m.name, m.material, m.bm].some(f => f.toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });
  }, [movements, searchTerm, statusFilter]);

  // Filtro específico para a aba de Devolução
  const filteredCheckinMovements = useMemo(() => {
    return movements
      .filter(m => m.status === MovementStatus.PENDENTE)
      .filter(m => {
        const term = checkinSearchTerm.toLowerCase();
        const formattedDate = formatDateTime(m.dateCheckout).toLowerCase();
        return [m.name, m.material, m.bm, formattedDate].some(f => f.toLowerCase().includes(term));
      });
  }, [movements, checkinSearchTerm]);

  if (!authState.user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
          <div className="bg-red-700 p-10 text-center text-white">
            <h1 className="text-4xl font-black uppercase tracking-tighter">SAO - 6º BBM</h1>
            <p className="text-[10px] font-bold mt-2 opacity-90 tracking-widest uppercase">Sistema de Acautelamento</p>
          </div>
          <div className="p-8">
            <form onSubmit={handleIdentify} className="space-y-4">
              <select 
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium" 
                value={formRank} 
                onChange={(e) => setFormRank(e.target.value)} 
                required
              >
                <option value="">Posto/Grad...</option>
                {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-wider">nome completo</label>
                <input 
                  type="text" 
                  placeholder="Ex: JOÃO Augusto Fernandes" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium" 
                  value={formName} 
                  onChange={(e) => setFormName(e.target.value)} 
                  required 
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-wider">nº BM</label>
                <input 
                  type="text" 
                  placeholder="Ex: 123.345-6" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold tracking-widest" 
                  value={formBm} 
                  onChange={(e) => setFormBm(formatBM(e.target.value))} 
                  required 
                />
              </div>

              <button type="submit" className="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-4 rounded-xl shadow-lg uppercase tracking-widest border-b-4 border-red-900 transition-all active:scale-95">Entrar no Sistema</button>
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
              <div className="flex items-center gap-1 text-[8px] font-bold uppercase text-green-300 bg-green-950/30 px-2 py-0.5 rounded-full">
                <CloudCheck className="w-3 h-3" /> Conectado à SAO {lastSync && `(${lastSync})`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {authState.user?.bm === '161.382-7' && (
              <button 
                onClick={() => setShowConfig(true)} 
                className={`p-2 rounded-xl transition-all hover:bg-red-800`}
                title="Configurações Administrativas"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
            <button onClick={handleLogout} className="p-2 hover:bg-red-800 rounded-xl transition-all" title="Sair">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Modal Configuração (Apenas Admin) */}
      {showConfig && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-100 p-6 flex justify-between items-center border-b">
              <div className="flex items-center gap-2 text-slate-800">
                <Database className="w-5 h-5 text-red-600" />
                <h3 className="font-black uppercase text-sm">Configuração de Nuvem</h3>
              </div>
              <button onClick={() => setShowConfig(false)} className="hover:rotate-90 transition-transform"><X className="w-6 h-6 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400">URL do Google Apps Script</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                  value={sheetUrl}
                  onChange={(e) => {
                    setSheetUrl(e.target.value);
                    localStorage.setItem('sao_sheet_url', e.target.value);
                  }}
                />
              </div>
              <button 
                onClick={async () => { await syncFromSheets(); setShowConfig(false); }} 
                className="w-full bg-red-700 text-white py-3 rounded-xl font-bold text-xs uppercase flex items-center justify-center gap-2"
              >
                {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Forçar Sincronização
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmação Saída */}
      {showCheckoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-8 space-y-6">
              <div className="flex items-center gap-3 text-amber-600">
                <AlertTriangle className="w-8 h-8" />
                <h3 className="text-2xl font-black uppercase tracking-tight">Confirmar Acautelamento</h3>
              </div>
              <div className="bg-slate-50 p-6 rounded-2xl border text-sm space-y-3">
                <p className="flex justify-between"><b>Material:</b> <span className="font-bold text-slate-800">{checkoutMaterial}</span></p>
                <p className="flex justify-between"><b>Responsável:</b> <span>{authState.user.rank} {authState.user.warName}</span></p>
                <p className="flex justify-between"><b>Previsão:</b> <span className="text-red-600 font-bold">{formatDate(checkoutEstimatedReturn)}</span></p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCheckoutConfirm(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-xl uppercase hover:bg-slate-200 transition-all">Voltar</button>
                <button onClick={handleCheckoutFinal} className="flex-1 py-4 bg-green-600 text-white font-black rounded-xl shadow-lg uppercase border-b-4 border-green-800 hover:bg-green-700 transition-all active:scale-95">Confirmar e Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmação Devolução */}
      {showReturnConfirm && returnTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-8 space-y-6">
              <div className="flex items-center gap-3 text-green-600">
                <CheckCircle2 className="w-8 h-8" />
                <h3 className="text-2xl font-black uppercase tracking-tight">Confirmar Devolução</h3>
              </div>
              <div className="bg-slate-50 p-6 rounded-2xl border text-sm space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400">Material Devolvido</label>
                  <p className="font-bold text-slate-800">{returnTarget.material}</p>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400">Militar Responsável</label>
                  <p className="font-medium">{returnTarget.rank} {returnTarget.warName}</p>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400">Observações de Recebimento</label>
                  <p className="italic text-slate-600">"{pendingObservations[returnTarget.id] || 'Sem observações.'}"</p>
                </div>
                <div className="pt-2 border-t text-[10px] text-slate-400 font-bold flex items-center gap-2">
                  <Info className="w-3 h-3" /> Recebido por: {authState.user.rank} {authState.user.warName} (SAO)
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowReturnConfirm(false); setReturnTarget(null); }} className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-xl uppercase hover:bg-slate-200 transition-all">Cancelar</button>
                <button onClick={handleReturnFinal} className="flex-1 py-4 bg-green-600 text-white font-black rounded-xl shadow-lg uppercase border-b-4 border-green-800 hover:bg-green-700 transition-all active:scale-95">Finalizar Devolução</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-6">
        <div className="flex bg-white rounded-2xl shadow-sm border p-1 sticky top-20 z-40">
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
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border">
              <h2 className="text-xl font-bold text-slate-800 uppercase mb-6 flex items-center gap-2">
                <ClipboardList className="w-6 h-6 text-red-600" /> Registro de Saída
              </h2>
              <form onSubmit={(e) => { e.preventDefault(); setShowCheckoutConfirm(true); }} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Lista de Materiais</label>
                      <textarea placeholder="Ex: 02 Cordas de 50m, 04 Mosquetões, 02 Polias..." className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl min-h-[140px] font-medium outline-none focus:ring-2 focus:ring-red-500 transition-all" value={checkoutMaterial} onChange={(e) => setCheckoutMaterial(e.target.value)} required />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Motivo do acautelamento</label>
                      <input 
                        type="text" 
                        placeholder="Treinamento, TPB, manutenção, Ocorrência" 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-red-500 transition-all" 
                        value={checkoutReason} 
                        onChange={(e) => setCheckoutReason(e.target.value)} 
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Previsão de Retorno</label>
                      <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" value={checkoutEstimatedReturn} onChange={(e) => setCheckoutEstimatedReturn(e.target.value)} required />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Seção / Tipo de Carga</label>
                    <div className="grid grid-cols-1 gap-2">
                      {MATERIAL_TYPES.map(t => (
                        <button key={t} type="button" onClick={() => setCheckoutType(t)} className={`flex justify-between items-center p-4 rounded-xl border transition-all ${checkoutType === t ? 'border-red-600 bg-red-50 text-red-700 font-bold shadow-sm' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'}`}>
                          <span className="text-[10px] uppercase font-bold">{t}</span>
                          {checkoutType === t ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-200" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <button type="submit" className="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-5 rounded-2xl shadow-xl uppercase border-b-4 border-red-900 transition-all active:scale-95 flex items-center justify-center gap-2">
                  <PlusCircle className="w-5 h-5" /> Registrar Acautelamento
                </button>
              </form>
            </div>
          )}

          {activeTab === 'checkin' && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border min-h-[400px]">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-4 border-b border-slate-100 gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 uppercase flex items-center gap-2">
                    <ArrowRightLeft className="w-6 h-6 text-red-600" /> Pendências na SAO
                  </h2>
                  <div className="text-[10px] font-black text-slate-400 uppercase bg-slate-100 px-3 py-1 rounded-full inline-block mt-1">
                    {movements.filter(m => m.status === MovementStatus.PENDENTE).length} Itens disponibilizados
                  </div>
                </div>

                {/* Novo Campo de Pesquisa na aba Devolução */}
                <div className="w-full md:w-96 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input 
                    type="text" 
                    placeholder="Pesquisar por nome, material ou data..." 
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-red-500 transition-all font-medium text-xs" 
                    value={checkinSearchTerm} 
                    onChange={(e) => setCheckinSearchTerm(e.target.value)} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {filteredCheckinMovements.map(m => (
                  <div key={m.id} className="border-2 border-slate-100 rounded-3xl p-6 flex flex-col gap-6 hover:border-red-100 hover:bg-red-50/10 transition-all group shadow-sm bg-slate-50/30">
                    <div className="flex flex-col md:flex-row justify-between gap-6">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <span className="bg-red-700 text-white text-[8px] font-black px-2 py-1 rounded uppercase tracking-tighter">{m.type}</span>
                          <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Saída: {formatDateTime(m.dateCheckout)}
                          </span>
                        </div>
                        <h4 className="font-black text-lg uppercase text-slate-800 leading-tight">{m.rank} {m.warName}</h4>
                        <p className="text-[11px] text-slate-400 font-bold mb-4">BM {m.bm}</p>
                        <div className="text-sm text-slate-700 font-medium bg-white p-5 rounded-2xl border border-slate-100 shadow-inner group-hover:border-red-100 min-h-[80px]">
                          {m.material}
                        </div>
                      </div>

                      <div className="w-full md:w-[350px] space-y-4">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase text-slate-400 flex items-center gap-2">
                            <MessageSquareQuote className="w-3 h-3" /> Observações da Devolução
                          </label>
                          <textarea 
                            placeholder="Descreva o estado do material ou faltas..."
                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-green-500 outline-none min-h-[100px] transition-all"
                            value={pendingObservations[m.id] || ''}
                            onChange={(e) => setPendingObservations(prev => ({ ...prev, [m.id]: e.target.value }))}
                          />
                        </div>
                        <button 
                          onClick={() => {
                            setReturnTarget(m);
                            setShowReturnConfirm(true);
                          }} 
                          className="w-full bg-green-600 hover:bg-green-700 text-white font-black px-8 py-4 rounded-2xl uppercase text-[10px] shadow-lg border-b-4 border-green-800 transition-all active:scale-95 flex items-center justify-center gap-3"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Receber Material
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Estado Vazio ou Sem Resultados */}
                {filteredCheckinMovements.length === 0 && (
                  <div className="text-center py-24 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200">
                    <div className="bg-slate-200 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      {checkinSearchTerm ? <Search className="w-8 h-8 text-slate-400" /> : <CheckCircle2 className="w-8 h-8 text-slate-400" />}
                    </div>
                    <p className="text-slate-400 font-black uppercase text-xs tracking-widest">
                      {checkinSearchTerm ? "Nenhum resultado para sua busca" : "Nenhuma carga pendente para devolução"}
                    </p>
                    {checkinSearchTerm && (
                      <button 
                        onClick={() => setCheckinSearchTerm('')} 
                        className="mt-4 text-red-600 font-bold text-[10px] uppercase hover:underline"
                      >
                        Limpar pesquisa
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-6">
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border overflow-hidden">
                <div className="flex flex-col lg:flex-row gap-4 mb-8">
                  <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Filtrar por nome, material ou BM..." className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-red-500 transition-all font-medium" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                  <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-200 shrink-0">
                    {[
                      { id: 'all', label: 'Ver Tudo' },
                      { id: MovementStatus.PENDENTE, label: 'Pendentes' },
                      { id: MovementStatus.DEVOLVIDO, label: 'Devolvidos' }
                    ].map(f => (
                      <button key={f.id} onClick={() => setStatusFilter(f.id as any)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${statusFilter === f.id ? 'bg-red-700 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full text-left border-separate border-spacing-y-3">
                    <thead>
                      <tr className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                        <th className="px-4 py-2">Militar Responsável</th>
                        <th className="px-4 py-2">Timeline / Prazos</th>
                        <th className="px-4 py-2">Material / Seção</th>
                        <th className="px-4 py-2 text-center">Status</th>
                        <th className="px-4 py-2">Recebedor SAO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMovements.map(m => (
                        <tr key={m.id} className="bg-slate-50/60 hover:bg-slate-100/80 transition-all text-sm group">
                          <td className="py-5 px-4 rounded-l-2xl border-l border-y border-slate-100">
                            <div className="font-black uppercase text-slate-800 leading-none mb-1">{m.rank} {m.warName}</div>
                            <div className="text-[9px] text-slate-400 font-bold tracking-wider">BM {m.bm}</div>
                          </td>
                          <td className="py-5 px-4 border-y border-slate-100">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 mb-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" /> {formatDateTime(m.dateCheckout)}
                            </div>
                            {m.status === MovementStatus.PENDENTE ? (
                              <div className="inline-flex items-center gap-1 text-[9px] text-red-600 font-black uppercase bg-red-50 px-2 py-0.5 rounded">
                                <AlertTriangle className="w-3 h-3" /> Previsto: {formatDate(m.estimatedReturnDate)}
                              </div>
                            ) : (
                              <div className="text-[9px] text-green-600 font-bold uppercase">Devolvido em: {formatDateTime(m.dateReturn)}</div>
                            )}
                          </td>
                          <td className="py-5 px-4 border-y border-slate-100">
                            <div className="font-bold text-slate-700 max-w-[200px] truncate leading-tight mb-1">{m.material}</div>
                            <span className="text-[8px] font-black text-red-700/60 uppercase tracking-tighter bg-red-50/50 px-2 py-0.5 rounded">{m.type}</span>
                          </td>
                          <td className="py-5 px-4 border-y border-slate-100 text-center">
                            <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${m.status === MovementStatus.PENDENTE ? 'bg-amber-100 text-amber-700 shadow-sm' : 'bg-green-100 text-green-700 shadow-sm'}`}>
                              {m.status}
                            </span>
                          </td>
                          <td className="py-5 px-4 rounded-r-2xl border-r border-y border-slate-100">
                            {m.status === MovementStatus.DEVOLVIDO ? (
                              <div className="text-[10px]">
                                <div className="font-black uppercase text-slate-700 leading-none mb-1">{m.receiverRank} {m.receiverWarName}</div>
                                {m.observations && <div className="text-[8px] text-slate-400 italic truncate max-w-[120px]">"{m.observations}"</div>}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 opacity-50">
                                <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
                                <span className="text-[9px] font-black text-slate-400 uppercase italic">Aguardando...</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-slate-900 rounded-[2.5rem] p-8 sm:p-12 text-white shadow-2xl relative overflow-hidden group border border-white/5">
                <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/10 blur-[100px] -mr-32 -mt-32 rounded-full"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-600/10 blur-[80px] -ml-24 -mb-24 rounded-full"></div>
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 relative z-10">
                  <div className="flex items-center gap-6">
                    <div className="bg-white/5 p-5 rounded-3xl border border-white/10 shadow-inner group-hover:scale-110 transition-transform duration-500">
                      <Sparkles className="w-8 h-8 text-yellow-400 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="font-black text-2xl uppercase tracking-tighter">Relatório Estratégico</h3>
                      <p className="text-sm text-slate-400 font-medium italic">Análise de IA sobre a carga empenhada (Gemini 3 Flash)</p>
                    </div>
                  </div>
                  <button 
                    onClick={async () => {
                      setIsLoadingAi(true);
                      const res = await getSmartSummary(movements);
                      setAiSummary(res);
                      setIsLoadingAi(false);
                    }} 
                    disabled={isLoadingAi || movements.filter(m => m.status === 'PENDENTE').length === 0} 
                    className="w-full md:w-auto bg-white text-slate-950 px-10 py-5 rounded-2xl text-xs font-black uppercase tracking-[0.2em] hover:bg-slate-100 transition-all flex items-center justify-center gap-3 shadow-xl active:scale-95 disabled:opacity-30"
                  >
                    {isLoadingAi ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Sparkles className="w-4 h-4" /> Gerar Análise</>}
                  </button>
                </div>

                {aiSummary && (
                  <div className="mt-10 p-8 bg-white/5 backdrop-blur-xl rounded-[2rem] border border-white/10 text-sm leading-relaxed animate-in fade-in slide-in-from-top-4 duration-700 whitespace-pre-wrap font-medium text-slate-200">
                    <div className="flex items-center gap-2 mb-4 text-yellow-400 font-black uppercase text-[10px] tracking-widest">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full"></div> Análise Concluída
                    </div>
                    {aiSummary}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="p-8 text-center border-t border-slate-200 bg-white">
        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">SAO - Seção de Apoio Operacional | 6º BBM - CBMMG</p>
      </footer>
    </div>
  );
};

export default App;
