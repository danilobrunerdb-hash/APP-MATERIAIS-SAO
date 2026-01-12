
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
  WifiOff,
  Save,
  Mail,
  Check,
  AlertCircle,
  Filter,
  ArrowRight,
  AlertOctagon
} from 'lucide-react';

const PERMANENT_SHEET_URL = "https://script.google.com/macros/s/AKfycbxYLn5e62ejJO784KmCoTSQ5cRe7Q7jLoqdO5QlzZljnC392ppHeUKlqbRjUEYaqzVD/exec";

const EMAILJS_CONFIG = {
  SERVICE_ID: "TESTE SAO", 
  TEMPLATE_ID: "template_epzy7h4", 
  PUBLIC_KEY: "F0L0nHY7l2OI-DgpO"
};

const formatBM = (value: string): string => {
  if (!value) return "";
  const digits = value.replace(/\D/g, '').slice(0, 7);
  if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  return digits;
};

const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
  } catch { return dateStr; }
};

const formatDateOnly = (dateStr?: string) => {
  if (!dateStr) return "-";
  try {
    if (dateStr.length === 10 && dateStr.includes('-')) {
      const [y, m, d] = dateStr.split('-');
      return `${d}/${m}/${y}`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  } catch { return dateStr; }
};

const isOverdue = (estimatedDate?: string, status?: MovementStatus) => {
  if (!estimatedDate || status === MovementStatus.DEVOLVIDO) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const estimate = new Date(estimatedDate);
  return estimate < today;
};

interface Notification {
  message: string;
  type: 'success' | 'error';
  id: number;
}

const App: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>({ user: null, isVisitor: false });
  const [activeTab, setActiveTab] = useState<'checkout' | 'checkin' | 'history'>('checkout');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [checkinSearchTerm, setCheckinSearchTerm] = useState(''); 
  const [statusFilter, setStatusFilter] = useState<'all' | MovementStatus>('all');
  
  const [sheetUrl, setSheetUrl] = useState<string>(localStorage.getItem('sao_sheet_url') || PERMANENT_SHEET_URL);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasInitialLoad, setHasInitialLoad] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

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
  
  // Plantonista states
  const [dutyOfficerBm, setDutyOfficerBm] = useState('');
  const [dutyOfficerName, setDutyOfficerName] = useState('');
  
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  const [pendingObservations, setPendingObservations] = useState<Record<string, string>>({});
  const [returnTarget, setReturnTarget] = useState<Movement | null>(null);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);

  const addNotification = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { message, type, id }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const sendMovementEmail = async (toBm: string, messageBody: string, subjectTitle: string) => {
    const email = `${toBm.replace(/\D/g, '')}@bombeiros.mg.gov.br`;
    try {
      await emailjs.send(
        EMAILJS_CONFIG.SERVICE_ID,
        EMAILJS_CONFIG.TEMPLATE_ID,
        {
          to_email: email,
          subject: subjectTitle,
          message: messageBody,
          content: messageBody
        },
        EMAILJS_CONFIG.PUBLIC_KEY
      );
      addNotification(`E-mail enviado para ${email}`, 'success');
    } catch (error) {
      console.error("Erro EmailJS:", error);
      addNotification(`Falha no e-mail militar (${email}).`, 'error');
    }
  };

  const syncData = useCallback(async (showLoader = true) => {
    if (showLoader) setIsSyncing(true);
    const data = await fetchFromSheets(sheetUrl);
    if (data) {
      setMovements(data);
      localStorage.setItem('sao_movements', JSON.stringify(data));
      setLastSync(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      setSyncError(false);
      setHasInitialLoad(true);
    } else {
      setSyncError(true);
      const cached = localStorage.getItem('sao_movements');
      if (cached && !hasInitialLoad) {
        setMovements(JSON.parse(cached));
        setHasInitialLoad(true);
      }
    }
    if (showLoader) setIsSyncing(false);
  }, [sheetUrl, hasInitialLoad]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const initApp = async () => {
      const savedUser = localStorage.getItem('sao_current_user');
      if (savedUser) setAuthState({ user: JSON.parse(savedUser), isVisitor: false });
      await syncData();
      emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);
    };

    initApp();

    const autoSyncInterval = setInterval(() => {
      if (navigator.onLine) syncData(false);
    }, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(autoSyncInterval);
    };
  }, [syncData]);

  const handleSyncManually = () => syncData(true);

  const handleCheckoutFinal = async () => {
    if (!authState.user || !hasInitialLoad) return;
    setIsSaving(true);

    const newMovement: Movement = {
      id: Math.random().toString(36).substr(2, 9),
      bm: authState.user.bm, 
      name: authState.user.name, 
      warName: authState.user.warName,
      rank: authState.user.rank, 
      dateCheckout: new Date().toISOString(),
      estimatedReturnDate: checkoutEstimatedReturn, 
      material: checkoutMaterial,
      reason: checkoutReason || 'Não informado', 
      type: checkoutType, 
      status: MovementStatus.PENDENTE,
      dutyOfficerBm: dutyOfficerBm,
      dutyOfficerName: dutyOfficerName
    };
    
    const updated = [newMovement, ...movements];
    setMovements(updated);
    localStorage.setItem('sao_movements', JSON.stringify(updated));
    
    const success = await saveToSheets(sheetUrl, updated);
    if (success) {
      setLastSync(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      setSyncError(false);
      
      const msg = `Olá ${authState.user.rank} ${authState.user.warName}, confirmamos a retirada de material na SAO do 6º BBM (${checkoutMaterial}). Previsão de devolução: ${formatDateOnly(checkoutEstimatedReturn)}. Plantonista SAO: ${dutyOfficerName}. Caso não reconheça este registro, procure a SAO imediatamente.`;
      await sendMovementEmail(authState.user.bm, msg, "Retirada de Material - SAO 6º BBM");

      // Novo e-mail para o plantonista da SAO conforme solicitação
      const msgDutyOfficer = `Olá ${dutyOfficerName}. registramos que na data de hoje você, na função de Plantonista da SAO repassou os seguintes itens (${checkoutMaterial}) que ficaram sob posse do ${authState.user.rank} ${authState.user.warName} (militar responsável). Caso verifique qualquer inconsistência entre em contato com o CBU do dia.`;
      await sendMovementEmail(dutyOfficerBm, msgDutyOfficer, "Registro de Saída - Plantonista SAO");
      
    } else {
      setSyncError(true);
      addNotification("Aviso: Dados salvos localmente, sync pendente.", "error");
    }
    
    setCheckoutMaterial(''); 
    setCheckoutReason(''); 
    setDutyOfficerBm('');
    setDutyOfficerName('');
    setShowCheckoutConfirm(false);
    setIsSaving(false);
    setActiveTab('history');
  };

  const handleReturnFinal = async () => {
    if (!authState.user || !returnTarget || !hasInitialLoad) return;
    setIsSaving(true);
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
      
      // E-mail para o militar que retirou os materiais
      const msgBorrower = `Olá ${returnTarget.rank} ${returnTarget.warName}, confirmamos a devolução do material (${returnTarget.material}) na SAO do 6º BBM. Recebido por: ${authState.user.rank} ${authState.user.warName}.`;
      await sendMovementEmail(returnTarget.bm, msgBorrower, "Devolução Confirmada - SAO 6º BBM");

      // E-mail para o militar que está recebendo o material
      const msgReceiver = `Olá ${authState.user.rank} ${authState.user.warName}, verificamos que você recebeu o material (${returnTarget.material}) do militar (${returnTarget.rank} ${returnTarget.warName}) caso verifique inconsistências entre em contato com o SAO ou CBU de serviço hoje`;
      await sendMovementEmail(authState.user.bm, msgReceiver, "Recebimento de Material - SAO 6º BBM");

    } else {
      setSyncError(true);
      addNotification("Devolução registrada localmente. Sync pendente.", "error");
    }
    
    setReturnTarget(null);
    setShowReturnConfirm(false);
    setIsSaving(false);
  };

  const filteredMovements = useMemo(() => {
    const term = (searchTerm || '').toLowerCase();
    return movements.filter(m => {
      const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
      const matchesSearch = [
        m.name || '', 
        m.material || '', 
        m.bm || '', 
        m.reason || '',
        m.warName || '',
        m.receiverWarName || ''
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
            <p className="text-[10px] font-bold mt-2 opacity-90 tracking-widest uppercase">Controle de Material CBMMG</p>
          </div>
          <div className="p-8">
            <form onSubmit={async (e) => {
              e.preventDefault();
              const names = formName.trim().split(/\s+/);
              const uppercaseWords = names.filter(n => n === n.toUpperCase() && n.length >= 2);
              const warNameFound = uppercaseWords.length > 0 ? uppercaseWords.join(' ') : names[names.length - 1];
              const user = { rank: formRank, name: formName, warName: warNameFound, bm: formBm, cpf: '' };
              setAuthState({ user, isVisitor: false });
              localStorage.setItem('sao_current_user', JSON.stringify(user));
              // Sincroniza dados imediatamente após o login para todos os usuários
              await syncData(true);
            }} className="space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Posto/Graduação</label>
                <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-red-500 outline-none" value={formRank} onChange={(e) => setFormRank(e.target.value)} required>
                  <option value="">Selecione...</option>
                  {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo (GUERRA em CAIXA ALTA)</label>
                <input type="text" placeholder="Ex: João SILVA Santos" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-red-500 outline-none" value={formName} onChange={(e) => setFormName(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nº BM</label>
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
    <div className="min-h-screen flex flex-col bg-slate-50 relative">
      <header className="bg-red-700 text-white shadow-lg p-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex flex-col">
            <h1 className="font-black text-xl leading-none uppercase tracking-tighter">SAO - 6º BBM</h1>
            <div className="flex items-center gap-2 mt-1">
              {!isOnline ? (
                <div className="flex items-center gap-1 text-[8px] font-bold uppercase text-red-100 bg-red-900/60 px-2 py-0.5 rounded-full border border-red-400/30 animate-pulse">
                  <WifiOff className="w-3 h-3" /> Modo Offline
                </div>
              ) : syncError ? (
                <div className="flex items-center gap-1 text-[8px] font-bold uppercase text-amber-200 bg-amber-900/40 px-2 py-0.5 rounded-full border border-amber-400/30">
                  <CloudOff className="w-3 h-3" /> Sync Falhou
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
              <span className="text-[10px] font-bold uppercase tracking-wider">{authState.user.rank} {authState.user.warName}</span>
            </div>

            <button onClick={handleSyncManually} className={`p-2 rounded-xl transition-all hover:bg-red-800 bg-red-800/20 ${isSyncing ? 'animate-spin' : ''}`} title="Sincronizar">
              <RefreshCw className="w-5 h-5" />
            </button>
            {authState.user.bm === '161.382-7' && (
              <button onClick={() => { setShowConfig(true); }} className="p-2 rounded-xl transition-all hover:bg-red-800">
                <Settings className="w-5 h-5" />
              </button>
            )}
            <button onClick={() => { setAuthState({ user: null, isVisitor: false }); localStorage.removeItem('sao_current_user'); }} className="p-2 hover:bg-red-800 rounded-xl transition-all">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[300] flex flex-col gap-2 w-full max-w-sm px-4">
        {notifications.map(n => (
          <div key={n.id} className={`p-4 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold uppercase tracking-wider animate-in slide-in-from-bottom-2 duration-300 border backdrop-blur-md ${n.type === 'success' ? 'bg-green-500/90 text-white border-green-400' : 'bg-red-600/90 text-white border-red-500'}`}>
            {n.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="flex-1">{n.message}</span>
            <button onClick={() => setNotifications(prev => prev.filter(notif => notif.id !== n.id))}>
              <X className="w-3 h-3 opacity-60" />
            </button>
          </div>
        ))}
      </div>

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
                    {/* Plantonista Info Fields Added Above Detailed Description */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Plantonista SAO (nº BM)</label>
                        <input type="text" placeholder="111.111-7" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-red-500 outline-none" value={dutyOfficerBm} onChange={(e) => setDutyOfficerBm(formatBM(e.target.value))} required />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Plantonista SAO (P/G e Nome)</label>
                        <input type="text" placeholder="Ex: Cb Augusto" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-red-500 outline-none" value={dutyOfficerName} onChange={(e) => setDutyOfficerName(e.target.value)} required />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição Detalhada</label>
                      <textarea placeholder="Ex: 03 Mosquetões, 02 polias, 01 Bolsa APH" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl min-h-[160px] font-medium focus:ring-2 focus:ring-red-500 outline-none transition-all" value={checkoutMaterial} onChange={(e) => setCheckoutMaterial(e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Motivo do Acautelamento</label>
                      <input type="text" placeholder="Treinamento, Manutenção, Ocorrência" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-red-500 outline-none" value={checkoutReason} onChange={(e) => setCheckoutReason(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Previsão de Retorno Estimada</label>
                      <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-red-500 outline-none" value={checkoutEstimatedReturn} onChange={(e) => setCheckoutEstimatedReturn(e.target.value)} required />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Tipo de Material </label>
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
                <button type="submit" disabled={!hasInitialLoad || isSaving} className="w-full bg-red-700 hover:bg-red-800 disabled:bg-slate-300 text-white font-bold py-5 rounded-2xl shadow-xl uppercase flex items-center justify-center gap-3 border-b-4 border-red-900 transition-all active:scale-95">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlusCircle className="w-5 h-5" />}
                  {isSaving ? "Salvando Registro..." : "Confirmar Acautelamento"}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'checkin' && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 min-h-[500px]">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-4 border-b gap-4">
                <h2 className="text-xl font-bold text-slate-800 uppercase flex items-center gap-2">
                  <ArrowRightLeft className="w-6 h-6 text-red-600" /> Pendências na SAO
                </h2>
                <div className="w-full md:w-96 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input type="text" placeholder="Filtrar por Militar ou BM..." className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium outline-none" value={checkinSearchTerm} onChange={(e) => setCheckinSearchTerm(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {movements.filter(m => m.status === MovementStatus.PENDENTE).filter(m => 
                  [m.name, m.material, m.bm].some(f => (f || '').toLowerCase().includes(checkinSearchTerm.toLowerCase()))
                ).map(m => {
                  const overdue = isOverdue(m.estimatedReturnDate, m.status);
                  return (
                    <div key={m.id} className={`border rounded-2xl p-6 transition-all flex flex-col md:flex-row justify-between gap-6 group ${overdue ? 'bg-red-50 border-red-100 hover:bg-red-100/50' : 'bg-slate-50/50 hover:bg-white border-slate-100'}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-black text-lg uppercase text-slate-800 leading-tight">{m.rank} {m.warName}</h4>
                          {overdue && <span className="bg-red-600 text-white text-[8px] px-2 py-0.5 rounded-full font-black animate-pulse flex items-center gap-1"><AlertOctagon className="w-2.5 h-2.5" /> ATRASADO</span>}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                          <p className="text-[11px] text-slate-400 font-bold">BM {m.bm}</p>
                          <p className="text-[11px] text-slate-400 font-bold">Retirado em: {formatDateTime(m.dateCheckout)}</p>
                          <p className={`text-[11px] font-black uppercase ${overdue ? 'text-red-600' : 'text-slate-400'}`}>Previsão: {formatDateOnly(m.estimatedReturnDate)}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-sm text-slate-700 font-medium italic">
                          "{m.material}"
                        </div>
                      </div>
                      <button onClick={() => { setReturnTarget(m); setShowReturnConfirm(true); }} className="bg-green-600 hover:bg-green-700 text-white font-black px-8 py-4 rounded-xl uppercase text-[10px] self-center shadow-lg border-b-4 border-green-800 transition-all active:scale-95 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> Receber Material
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
             <div className="space-y-6">
                <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200">
                   <div className="flex flex-col xl:flex-row gap-6 mb-8 items-start xl:items-center">
                      <div className="flex-1 w-full relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" placeholder="Filtrar por qualquer campo..." className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-medium outline-none focus:ring-2 focus:ring-red-500 transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 bg-slate-100/50 p-1.5 rounded-2xl border border-slate-200">
                        <button onClick={() => setStatusFilter('all')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-white/50'}`}>Todos</button>
                        <button onClick={() => setStatusFilter(MovementStatus.PENDENTE)} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${statusFilter === MovementStatus.PENDENTE ? 'bg-amber-500 text-white shadow-md' : 'text-amber-600 hover:bg-amber-50'}`}><Clock className="w-3.5 h-3.5" /> Pendências</button>
                        <button onClick={() => setStatusFilter(MovementStatus.DEVOLVIDO)} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${statusFilter === MovementStatus.DEVOLVIDO ? 'bg-green-600 text-white shadow-md' : 'text-green-600 hover:bg-green-50'}`}><CheckCircle2 className="w-3.5 h-3.5" /> Devolvidos</button>
                      </div>
                   </div>

                   <div className="overflow-x-auto -mx-6 sm:mx-0">
                      <table className="w-full text-left border-separate border-spacing-y-3 min-w-[1000px] px-6 sm:px-0">
                        <thead>
                          <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="px-5 py-3">Responsável</th>
                            <th className="px-5 py-3">Descrição Material</th>
                            <th className="px-5 py-3">Datas (Saída/Prev)</th>
                            <th className="px-5 py-3">Recebido Por</th>
                            <th className="px-5 py-3">Data Devolução</th>
                            <th className="px-5 py-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMovements.length > 0 ? filteredMovements.map(m => {
                            const overdue = isOverdue(m.estimatedReturnDate, m.status);
                            return (
                              <tr key={m.id} className={`transition-all text-sm group shadow-sm hover:shadow-md border border-slate-100 ${overdue ? 'bg-red-50/50 hover:bg-red-50' : 'bg-slate-50/50 hover:bg-white'}`}>
                                <td className="py-5 px-5 rounded-l-2xl border-l border-y border-slate-100">
                                  <div className="font-black uppercase text-slate-800 leading-tight mb-1">{m.rank} {m.warName}</div>
                                  <div className="text-[9px] text-slate-400 font-bold">BM {m.bm}</div>
                                </td>
                                <td className="py-5 px-5 border-y border-slate-100">
                                  <div className="font-bold text-slate-700 max-w-xs leading-relaxed">{m.material}</div>
                                  <div className="text-[8px] uppercase font-black text-slate-400 mt-1">{m.type}</div>
                                </td>
                                <td className="py-5 px-5 border-y border-slate-100 whitespace-nowrap">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2 text-slate-500">
                                      <ArrowRight className="w-3 h-3 text-red-400" />
                                      <span className="text-[10px] font-bold">{formatDateTime(m.dateCheckout)}</span>
                                    </div>
                                    {m.estimatedReturnDate && (
                                      <div className={`flex items-center gap-2 ${overdue ? 'text-red-600 font-black' : 'text-slate-400'}`}>
                                        <Calendar className="w-3 h-3" />
                                        <span className="text-[10px]">Prev: {formatDateOnly(m.estimatedReturnDate)}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="py-5 px-5 border-y border-slate-100">
                                  {m.status === MovementStatus.DEVOLVIDO ? (
                                    <div>
                                      <div className="font-black uppercase text-slate-800 leading-tight mb-1 text-xs">{m.receiverRank} {m.receiverWarName}</div>
                                      <div className="text-[9px] text-slate-400 font-bold">BM {m.receiverBm}</div>
                                    </div>
                                  ) : <span className="text-slate-300 italic text-[10px]">Aguardando...</span>}
                                </td>
                                <td className="py-5 px-5 border-y border-slate-100 whitespace-nowrap">
                                  {m.dateReturn ? (
                                    <div className="flex items-center gap-2 text-green-600 font-bold">
                                      <Check className="w-3.5 h-3.5" />
                                      <span className="text-[10px]">{formatDateTime(m.dateReturn)}</span>
                                    </div>
                                  ) : <span className="text-slate-300">-</span>}
                                </td>
                                <td className="py-5 px-5 rounded-r-2xl border-r border-y border-slate-100 text-center">
                                  <span className={`inline-block px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm ${m.status === MovementStatus.PENDENTE ? (overdue ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-700 border border-amber-200') : 'bg-green-100 text-green-700 border border-green-200'}`}>
                                    {m.status === MovementStatus.PENDENTE && overdue ? "EM ATRASO" : m.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          }) : <tr><td colSpan={6} className="py-20 text-center text-slate-400 font-medium italic">Nenhum registro encontrado.</td></tr>}
                        </tbody>
                      </table>
                   </div>
                </div>

                <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
                  <div className="flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
                    <div className="flex items-center gap-6">
                      <Sparkles className="w-8 h-8 text-yellow-400" />
                      <div>
                        <h3 className="font-black text-2xl uppercase tracking-tighter">Relatório Estratégico (Gemini)</h3>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Resumo automático de criticidade SAO</p>
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
                      className="bg-white text-slate-950 px-10 py-5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-100 transition-all flex items-center gap-3 active:scale-95"
                    >
                      {isLoadingAi ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-4 h-4" />} Analisar Carga
                    </button>
                  </div>
                  {aiSummary && (
                    <div className="mt-10 p-8 bg-white/5 rounded-3xl text-slate-200 border border-white/10 animate-in fade-in zoom-in-95 duration-500">
                       <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap font-medium leading-relaxed">
                          {aiSummary}
                       </div>
                    </div>
                  )}
                </div>
             </div>
          )}
        </div>
      </main>

      {showReturnConfirm && returnTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8">
            <h3 className="text-2xl font-black uppercase tracking-tight text-green-600 mb-6 flex items-center gap-2">
               <CheckCircle2 className="w-6 h-6" /> Devolução de Material
            </h3>
            <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100 italic text-slate-600 text-sm">
              "{returnTarget.material}"
            </div>
            <textarea 
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-green-500" 
              placeholder="Descreva o estado do material ou observações pertinentes..."
              value={pendingObservations[returnTarget.id] || ''}
              onChange={(e) => setPendingObservations(prev => ({ ...prev, [returnTarget.id]: e.target.value }))}
            />
            <div className="flex gap-3 mt-6">
              <button disabled={isSaving} onClick={() => setShowReturnConfirm(false)} className="flex-1 py-4 bg-slate-100 font-bold rounded-xl uppercase hover:bg-slate-200">Cancelar</button>
              <button disabled={isSaving || !hasInitialLoad} onClick={handleReturnFinal} className="flex-1 py-4 bg-green-600 text-white font-bold rounded-xl uppercase shadow-xl flex items-center justify-center gap-2 hover:bg-green-700 active:scale-95 transition-all">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Confirmar Recebimento
              </button>
            </div>
          </div>
        </div>
      )}

      {showCheckoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8">
            <h3 className="text-2xl font-black uppercase tracking-tight text-amber-600 mb-6 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6" /> Confirmar Carga Militar
            </h3>
            <div className="bg-slate-50 p-6 rounded-2xl border text-sm space-y-4 mb-6">
               <p className="font-black text-slate-400 uppercase text-[10px]">Material em Retirada:</p>
               <p className="font-bold text-slate-800">{checkoutMaterial}</p>
               <div className="pt-2 border-t">
                 <p className="text-[10px] text-slate-400 uppercase font-black">Previsão para Devolução:</p>
                 <p className="font-black text-red-600">{formatDateOnly(checkoutEstimatedReturn)}</p>
               </div>
            </div>
            <div className="flex gap-3">
              <button disabled={isSaving} onClick={() => setShowCheckoutConfirm(false)} className="flex-1 py-4 bg-slate-100 font-bold rounded-xl uppercase hover:bg-slate-200">Revisar</button>
              <button disabled={isSaving || !hasInitialLoad} onClick={handleCheckoutFinal} className="flex-1 py-4 bg-green-600 text-white font-bold rounded-xl uppercase shadow-xl flex items-center justify-center gap-2 hover:bg-green-700 active:scale-95 transition-all">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Confirmar Saída
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfig && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6">
            <h3 className="font-black uppercase text-slate-800 mb-4 flex items-center gap-2"><Settings className="w-5 h-5" /> Endpoint da Planilha</h3>
            <input 
              type="text" 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono mb-4 focus:ring-2 focus:ring-red-500"
              value={sheetUrl}
              onChange={(e) => {
                setSheetUrl(e.target.value);
                localStorage.setItem('sao_sheet_url', e.target.value);
              }}
            />
            <button onClick={async () => { await handleSyncManually(); setShowConfig(false); }} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-xs uppercase hover:bg-black active:scale-95 transition-all">Salvar Configuração</button>
          </div>
        </div>
      )}

      <footer className="p-10 text-center bg-white border-t border-slate-100">
        <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">6º Batalhão de Bombeiros Militar - CBMMG</span>
      </footer>
    </div>
  );
};

export default App;
