
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AuthState, MilitaryPerson, Movement, MovementStatus, MaterialType, UnitConfig, UnitID } from './types';
import { MATERIAL_TYPES, RANKS } from './constants';
import { getSmartSummary } from './geminiService';
import { saveToSheets, fetchFromSheets, sendEmailViaGas } from './sheetService';

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
  Loader2,
  Settings,
  CloudOff,
  RefreshCw,
  User,
  Wifi,
  WifiOff,
  Save,
  AlertCircle,
  ArrowRight,
  AlertOctagon,
  MapPin,
  Trash2,
  Layers,
  BookOpen,
  ArrowLeft,
  Building2,
  TentTree,
  Camera,
  Image as ImageIcon
} from 'lucide-react';

const PERMANENT_SHEET_URL_SEDE = "https://script.google.com/macros/s/AKfycbyXQCnd0H7EorUcjdRrCmSXQ3Sq9p7mBt7mrVb01yzQv_t6zwLZu77bpgVeUjeIUTXd/exec";
// URL Configurada para PEMAD
const PERMANENT_SHEET_URL_PEMAD = "https://script.google.com/macros/s/AKfycbxrI2lk12BqOvn1ZzYHhOaNq9gdyhOozUYxNg1P93HppIOy3RXAHw8nVBx6jskpXJoQbQ/exec"; 

// --- CONFIGURAÇÃO DE LOGOS ---
// Substitua as URLs abaixo pelos links dos arquivos PNG informados
const LOGO_SEDE_URL = "https://lh3.googleusercontent.com/pw/AP1GczOz2AhM552qAgdmxiIOyRGmSjpy4CB-NXjG8hi4lrNw7qPO3nvnN2-tBgf_rC2BZ9eRLdT4RMZao6KYQH2491BiXKZTYg2P7dG40u6QFD34WFRxzrBKDPRBDC86-z5kToRz1UtxVhrADJxoQo4ysL1_=w487-h512-s-no-gm?authuser=0"; 
const LOGO_PEMAD_URL = "https://lh3.googleusercontent.com/pw/AP1GczO6BpZloEeO-gyjV_gu_HrsF8KlPEsAOUq4UgycHBUzMT-iILU1P54YKghilwlTmt0SCtrVKxG-rrUXKcjFXpaQA0Cw7dAcYYGnPlFNi66lP0IiQtOLw_eO_rohMz1vP_WI6l9rvfa6vJsewgchVj0w=w194-h197-s-no-gm?authuser=0"; 

const UNITS: Record<UnitID, UnitConfig> = {
  SEDE: {
    id: 'SEDE',
    name: 'SAO - 6º BBM / SEDE',
    shortName: 'SEDE 6º BBM',
    defaultSheetUrl: PERMANENT_SHEET_URL_SEDE,
    theme: 'red'
  },
  PEMAD: {
    id: 'PEMAD',
    name: 'PEMAD / 6º BBM',
    shortName: 'PEMAD',
    defaultSheetUrl: PERMANENT_SHEET_URL_PEMAD,
    theme: 'orange'
  }
};

const THEMES = {
  red: {
    primary: 'bg-red-700',
    primaryHover: 'hover:bg-red-800',
    primaryRing: 'focus:ring-red-500',
    border: 'border-red-900',
    text: 'text-red-700',
    textDark: 'text-red-900',
    textLight: 'text-red-200',
    lightBg: 'bg-red-50',
    lightBorder: 'border-red-200',
    iconColor: 'text-red-600',
    gradient: 'from-red-700 to-red-900'
  },
  orange: {
    primary: 'bg-orange-600',
    primaryHover: 'hover:bg-orange-700',
    primaryRing: 'focus:ring-orange-500',
    border: 'border-orange-800',
    text: 'text-orange-700',
    textDark: 'text-orange-900',
    textLight: 'text-orange-100', // Better contrast on dark orange
    lightBg: 'bg-orange-50',
    lightBorder: 'border-orange-200',
    iconColor: 'text-orange-600',
    gradient: 'from-orange-600 to-orange-800'
  }
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

interface CartItem {
  id: string;
  material: string;
  reason: string;
  type: MaterialType;
  origin: string;
  estimatedReturn: string;
  image?: string;
}

// Componente auxiliar para exibir imagem com fallback robusto
const ImageDisplay = ({ src }: { src?: string }) => {
  const [error, setError] = useState(false);
  
  // SOLUÇÃO DEFINITIVA: Converter links do Drive para o endpoint de 'thumbnail'.
  // O link 'uc?export=view' é tratado como download e bloqueado (403) em tags <img> repetidas.
  // O link 'thumbnail?id=...' é tratado como preview e funciona estavelmente.
  const imageSrc = useMemo(() => {
    if (!src) return '';
    
    // Verifica se é um link do Drive e se tem um ID
    if (src.includes('drive.google.com') && src.includes('id=')) {
       const match = src.match(/id=([^&]+)/);
       if (match && match[1]) {
         // sz=w200 define a largura da miniatura para 200px (boa qualidade/leve)
         return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200`;
       }
    }
    return src;
  }, [src]);

  if (!src || src.length < 5) return null;
  // Tratar mensagem de erro salva no banco
  if (src.startsWith('Erro')) {
      return <span className="text-[9px] text-red-500 font-bold bg-red-50 px-2 py-1 rounded" title={src}>Erro Upload</span>;
  }
  
  if (error) {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[9px] text-blue-600 underline font-bold bg-blue-50 px-2 py-1 rounded-md min-w-fit hover:bg-blue-100 transition-colors" title="Clique para abrir (Imagem não carregou na visualização)">
        <ImageIcon className="w-3 h-3" /> Ver Foto
      </a>
    );
  }

  return (
    <div className="relative shrink-0">
      <img 
        src={imageSrc} 
        referrerPolicy="no-referrer"
        loading="lazy"
        className="w-10 h-10 rounded-lg object-cover border border-slate-200 cursor-pointer hover:scale-[2.5] hover:shadow-xl transition-all origin-left z-10 bg-slate-100" 
        alt="Foto"
        title="Clique para abrir original"
        onClick={() => window.open(src, '_blank')} // Abre o link original (full size) ao clicar
        onError={() => setError(true)}
      />
    </div>
  );
};

const App: React.FC = () => {
  // Unit State
  const [selectedUnit, setSelectedUnit] = useState<UnitConfig | null>(null);

  const [authState, setAuthState] = useState<AuthState>({ user: null, isVisitor: false });
  const [activeTab, setActiveTab] = useState<'checkout' | 'checkin' | 'history'>('checkout');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [checkinSearchTerm, setCheckinSearchTerm] = useState(''); 
  const [statusFilter, setStatusFilter] = useState<'all' | MovementStatus>('all');
  
  const [sheetUrl, setSheetUrl] = useState<string>("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasInitialLoad, setHasInitialLoad] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showInstructions, setShowInstructions] = useState(false);

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);

  // Login Form states
  const [formRank, setFormRank] = useState('');
  const [formName, setFormName] = useState('');
  const [formBm, setFormBm] = useState('');

  // Checkout Form states
  const [borrowerRank, setBorrowerRank] = useState('');
  const [borrowerName, setBorrowerName] = useState('');
  const [borrowerBm, setBorrowerBm] = useState('');
  
  // Item specific states
  const [checkoutMaterial, setCheckoutMaterial] = useState('');
  const [checkoutReason, setCheckoutReason] = useState('');
  const [checkoutType, setCheckoutType] = useState<MaterialType>(MaterialType.OUTROS);
  const [checkoutOrigin, setCheckoutOrigin] = useState('SAO');
  const [checkoutEstimatedReturn, setCheckoutEstimatedReturn] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [checkoutImage, setCheckoutImage] = useState<string>('');
  
  // Cart state for multi-origin
  const [checkoutCart, setCheckoutCart] = useState<CartItem[]>([]);

  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  
  // Return States
  const [selectedReturnIds, setSelectedReturnIds] = useState<string[]>([]);
  const [pendingObservations, setPendingObservations] = useState('');
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Theme helper
  const theme = useMemo(() => {
    return selectedUnit ? THEMES[selectedUnit.theme] : THEMES.red;
  }, [selectedUnit]);

  // Load selected unit from storage on mount
  useEffect(() => {
    const savedUnitId = localStorage.getItem('sao_selected_unit_id');
    if (savedUnitId && UNITS[savedUnitId as UnitID]) {
      setSelectedUnit(UNITS[savedUnitId as UnitID]);
    }
  }, []);

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
      const success = await sendEmailViaGas(sheetUrl, email, subjectTitle, messageBody);
      if (success) {
        addNotification(`E-mail enviado para ${email}`, 'success');
      } else {
        console.warn("Script de email retornou falha, mas a movimentação seguiu.");
        addNotification(`Erro ao enviar e-mail para ${email} (verifique planilha)`, 'error');
      }
    } catch (error: any) {
      console.error("Erro Envio Email:", error);
      addNotification(`Falha envio e-mail (${email})`, 'error');
    }
  };

  const syncData = useCallback(async (showLoader = true) => {
    if (!selectedUnit || !sheetUrl) return;
    if (showLoader) setIsSyncing(true);
    
    // Check local storage key specific to unit
    const storageKey = `sao_movements_${selectedUnit.id}`;

    const data = await fetchFromSheets(sheetUrl);
    if (data) {
      setMovements(data);
      localStorage.setItem(storageKey, JSON.stringify(data));
      setLastSync(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      setSyncError(false);
      setHasInitialLoad(true);
    } else {
      setSyncError(true);
      const cached = localStorage.getItem(storageKey);
      if (cached && !hasInitialLoad) {
        try {
          setMovements(JSON.parse(cached));
          setHasInitialLoad(true);
        } catch (e) {
          console.error("Erro ao ler cache", e);
        }
      }
    }
    if (showLoader) setIsSyncing(false);
  }, [sheetUrl, hasInitialLoad, selectedUnit]);

  // Initialize App when Unit is Selected
  useEffect(() => {
    if (!selectedUnit) return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initialize Sheet URL for this unit
    const storageUrlKey = `sao_sheet_url_${selectedUnit.id}`;
    const storedUrl = localStorage.getItem(storageUrlKey);
    const urlToUse = storedUrl || selectedUnit.defaultSheetUrl;
    setSheetUrl(urlToUse);

    const initApp = async () => {
      const storageUserKey = `sao_current_user_${selectedUnit.id}`;
      const savedUser = localStorage.getItem(storageUserKey);
      if (savedUser) setAuthState({ user: JSON.parse(savedUser), isVisitor: false });
      
      // We need to pass the URL manually here because setSheetUrl state update might not have flushed yet for the syncData callback
      if (urlToUse) {
         // Logic duplicated from syncData to ensure immediate execution with correct URL
         const storageKey = `sao_movements_${selectedUnit.id}`;
         const data = await fetchFromSheets(urlToUse);
         if (data) {
            setMovements(data);
            localStorage.setItem(storageKey, JSON.stringify(data));
            setLastSync(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
            setSyncError(false);
            setHasInitialLoad(true);
          } else {
            setSyncError(true);
            const cached = localStorage.getItem(storageKey);
            if (cached) {
              try { setMovements(JSON.parse(cached)); setHasInitialLoad(true); } catch(e){}
            }
          }
      }
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
  }, [selectedUnit]); // Re-run if unit changes

  // Re-trigger sync if sheetURL changes manually
  useEffect(() => {
    if(selectedUnit && sheetUrl && hasInitialLoad) {
        syncData(false);
    }
  }, [sheetUrl]);

  const handleSyncManually = () => syncData(true);

  // Compress image helper
  const handleImageCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = reader.result;
        // Fix for potential issue where result is not a string
        if (typeof result !== 'string') return;
        
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 500;
          const MAX_HEIGHT = 500;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.5); // Compress to 50% quality
            setCheckoutImage(dataUrl);
          }
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    }
  };

  const addItemToCart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutMaterial.trim()) return;

    const newItem: CartItem = {
      id: Math.random().toString(36).substr(2, 9),
      material: checkoutMaterial,
      reason: checkoutReason || 'Não informado',
      type: checkoutType,
      origin: checkoutOrigin,
      estimatedReturn: checkoutEstimatedReturn,
      image: checkoutImage
    };

    setCheckoutCart([...checkoutCart, newItem]);
    
    // Reset item fields but keep borrower info
    setCheckoutMaterial('');
    setCheckoutReason('');
    setCheckoutType(MaterialType.OUTROS);
    setCheckoutImage('');
    if(fileInputRef.current) fileInputRef.current.value = "";
    addNotification("Item adicionado à lista", "success");
  };

  const removeItemFromCart = (id: string) => {
    setCheckoutCart(prev => prev.filter(item => item.id !== id));
  };

  const handleCheckoutFinal = async () => {
    if (!authState.user || !hasInitialLoad || checkoutCart.length === 0 || !selectedUnit) return;
    setIsSaving(true);

    const names = borrowerName.trim().split(/\s+/);
    const uppercaseWords = names.filter(n => n === n.toUpperCase() && n.length >= 2);
    const borrowerWarName = uppercaseWords.length > 0 ? uppercaseWords.join(' ') : names[names.length - 1];

    const newMovements: Movement[] = checkoutCart.map(item => ({
      id: item.id,
      bm: borrowerBm, 
      name: borrowerName, 
      warName: borrowerWarName,
      rank: borrowerRank, 
      dateCheckout: new Date().toISOString(),
      estimatedReturnDate: item.estimatedReturn, 
      material: item.material,
      reason: item.reason, 
      type: item.type,
      origin: item.origin,
      status: MovementStatus.PENDENTE,
      dutyOfficerBm: authState.user!.bm,
      dutyOfficerName: `${authState.user!.rank} ${authState.user!.warName}`,
      image: item.image // Passando a imagem
    }));
    
    const updated = [...newMovements, ...movements];
    setMovements(updated);
    localStorage.setItem(`sao_movements_${selectedUnit.id}`, JSON.stringify(updated));
    
    const success = await saveToSheets(sheetUrl, updated);
    if (success) {
      setLastSync(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      setSyncError(false);
      
      const itemsList = newMovements.map(m => `- ${m.material} (Origem: ${m.origin || 'SAO'})`).join('\n');
      const subjectSuffix = selectedUnit.id === 'PEMAD' ? 'SAO 6º BBM / PEMAD' : selectedUnit.shortName;

      const msgBorrower = `Olá ${borrowerRank} ${borrowerWarName}, confirmamos que você acautelou os seguintes materiais no(a) ${selectedUnit.name}:\n${itemsList}\nPlantonista responsável: ${authState.user.rank} ${authState.user.warName}.\n\nCaso não reconheça este registro, entre em contato com a SAO ou CBU do dia IMEDIATAMENTE. Tel: (33) 3279-3600\n\n At.te 1ª Cia. Operacional - ${selectedUnit.name}`;
      await sendMovementEmail(borrowerBm, msgBorrower, `Retirada de Material - ${subjectSuffix}`);

      const msgDutyOfficer = `Olá ${authState.user.rank} ${authState.user.warName}. registramos que na data de hoje você, na função de plantonista do(a) ${selectedUnit.name}, entregou os itens:\n${itemsList}\nFicaram sob posse do ${borrowerRank} ${borrowerWarName}.\n\nCaso não reconheça este registro, entre em contato com a SAO ou CBU do dia IMEDIATAMENTE. Tel: (33) 3279-3600\n\n At.te 1ª Cia. Operacional - ${selectedUnit.name}`;
      await sendMovementEmail(authState.user.bm, msgDutyOfficer, `Registro de Saída - ${subjectSuffix}`);
      
    } else {
      setSyncError(true);
      addNotification("Aviso: Dados salvos localmente, sync pendente.", "error");
    }
    
    setCheckoutCart([]);
    setBorrowerBm('');
    setBorrowerName('');
    setBorrowerRank('');
    setShowCheckoutConfirm(false);
    setIsSaving(false);
    setActiveTab('history');
  };

  const toggleReturnSelection = (id: string) => {
    setSelectedReturnIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleReturnFinal = async () => {
    if (!authState.user || selectedReturnIds.length === 0 || !hasInitialLoad || !selectedUnit) return;
    setIsSaving(true);
    const obs = pendingObservations || 'Sem observações.';
    
    const targets = movements.filter(m => selectedReturnIds.includes(m.id));
    
    const updated = movements.map(m => {
      if (selectedReturnIds.includes(m.id)) {
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
    localStorage.setItem(`sao_movements_${selectedUnit.id}`, JSON.stringify(updated));

    const success = await saveToSheets(sheetUrl, updated);
    if (success) {
      setLastSync(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      setSyncError(false);
      
      const subjectSuffix = selectedUnit.id === 'PEMAD' ? 'SAO 6º BBM / PEMAD' : selectedUnit.shortName;
      const uniqueBorrowers = Array.from(new Set(targets.map(t => t.bm)));
      
      for (const bBm of uniqueBorrowers) {
        const bItems = targets.filter(t => t.bm === bBm);
        const bInfo = bItems[0]; 
        const itemsList = bItems.map(m => `- ${m.material} (Origem: ${m.origin})`).join('\n');

        const msgBorrower = `Olá ${bInfo.rank} ${bInfo.warName}, confirmamos a devolução dos materiais no(a) ${selectedUnit.name}:\n${itemsList}\nRecebido por: ${authState.user.rank} ${authState.user.warName}. Caso não reconheça essa movimentação ou verifique qualquer inconsistência, entre em contato com a SAO e com o CBU do dia IMEDIATAMENTE. Tel: (33) 3279-3600\n\n At.te 1ª Cia. Operacional - ${selectedUnit.name}`;
        await sendMovementEmail(bBm, msgBorrower, `Devolução Confirmada - ${subjectSuffix}`);
      }

      const allItemsList = targets.map(m => `- ${m.material} (${m.rank} ${m.warName}) - (Origem: ${m.origin || 'SAO'})`).join('\n');
      const msgReceiver = `Olá ${authState.user.rank} ${authState.user.warName}, verificamos que você, na função de plantonista do(a) ${selectedUnit.name}, recebeu os seguintes materiais:\n${allItemsList}.\n\nCaso não reconheça a movimentação ou verifique qualquer inconsistência, entre em contato com a SAO e CBU do dia imediatamente. Tel: (33) 3279-3600.\n\n At.te 1ª Cia. Operacional - ${selectedUnit.name}`;
      await sendMovementEmail(authState.user.bm, msgReceiver, `Recebimento de Material - ${subjectSuffix}`);

    } else {
      setSyncError(true);
      addNotification("Devolução registrada localmente. Sync pendente.", "error");
    }
    
    setSelectedReturnIds([]);
    setPendingObservations('');
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
        m.receiverWarName || '',
        m.dutyOfficerName || '',
        m.origin || 'SAO'
      ].some(f => f.toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });
  }, [movements, searchTerm, statusFilter]);

  // --- SCREEN 0: INSTRUCTIONS (Must be first to overlay on Unit Selection if needed) ---
  if (showInstructions) {
    return (
      <div className="min-h-screen flex flex-col items-center p-4 bg-slate-50 relative z-[200]">
        <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-right duration-500">
           <div className={`p-6 flex items-center justify-between text-white ${theme.primary}`}>
              <h2 className="text-xl font-bold uppercase tracking-wider flex items-center gap-3">
                <BookOpen className="w-6 h-6" /> Manual de Instruções
              </h2>
              <button 
                onClick={() => setShowInstructions(false)}
                className="bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
              >
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
           </div>
           <div className="p-8 space-y-8 overflow-y-auto max-h-[80vh]">
              <div className={`p-4 rounded-xl text-xs font-bold uppercase tracking-wide border ${theme.lightBg} ${theme.lightBorder} ${theme.text}`}>
                Unidade Selecionada: {selectedUnit ? selectedUnit.name : 'Geral (Seleção)'}
              </div>
              <section className="space-y-3">
                <h3 className={`text-lg font-black uppercase ${theme.text} flex items-center gap-2 border-b pb-2`}>
                  1. Login do Plantonista
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Apenas algum <strong>Militar de serviço da Ala Operacional</strong> ou o <strong>Plantonista responsável</strong> deve realizar o login. Os dados (Posto, Nome e BM) ficarão registrados como "Responsável pela entrega" ou "Recebedor".
                </p>
              </section>

              <section className="space-y-3">
                <h3 className={`text-lg font-black uppercase ${theme.text} flex items-center gap-2 border-b pb-2`}>
                  2. Cautela de Material (Saída)
                </h3>
                <ul className="list-disc pl-5 space-y-2 text-slate-600 text-sm">
                  <li>Identifique o militar que está retirando o material (BM e Nome).</li>
                  <li>Adicione os itens um a um no "carrinho" de acordo com a origem.</li>
                  <li><strong>Campo Origem:</strong> Selecione a origem (SAO, Viatura, Galpão, etc).</li>
                  <li>Clique em "Finalizar Cautela" para salvar. O sistema envia e-mail automático.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h3 className={`text-lg font-black uppercase ${theme.text} flex items-center gap-2 border-b pb-2`}>
                  3. Devolução (Entrada)
                </h3>
                <ul className="list-disc pl-5 space-y-2 text-slate-600 text-sm">
                  <li>Acesse a aba <strong>Devolução</strong>.</li>
                  <li>Selecione as caixas de seleção dos itens que estão sendo devolvidos.</li>
                  <li>Clique no botão flutuante <strong>"Receber X Itens"</strong>.</li>
                </ul>
              </section>
           </div>
        </div>
      </div>
    );
  }

  // --- SCREEN 1: UNIT SELECTION ---
  if (!selectedUnit) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,_rgba(220,38,38,0.15),_transparent_70%)] pointer-events-none" />
        
        <button 
          onClick={() => setShowInstructions(true)}
          className="absolute top-4 right-4 z-50 p-2.5 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-sm transition-all text-white shadow-lg border border-white/10"
          title="Manual de Instruções"
        >
          <BookOpen className="w-5 h-5" />
        </button>

        <div className="max-w-4xl w-full relative z-10 animate-in fade-in zoom-in-95 duration-700">
          <div className="text-center mb-6 md:mb-12">
            <img 
              src="https://www.bombeiros.mg.gov.br/images/logo.png" 
              alt="Logo CBMMG" 
              className="w-16 h-16 md:w-24 md:h-24 mx-auto mb-4 md:mb-6 drop-shadow-2xl" 
            />
            <h1 className="text-2xl md:text-5xl font-black text-white uppercase tracking-tighter mb-1 md:mb-2">Controle de Materiais</h1>
            <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-sm">6º Batalhão de Bombeiros Militar</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
            <button 
              onClick={() => {
                const unit = UNITS.SEDE;
                localStorage.setItem('sao_selected_unit_id', unit.id);
                setSelectedUnit(unit);
              }}
              className="group relative bg-white rounded-3xl p-4 md:p-8 transition-all hover:-translate-y-1 hover:shadow-[0_0_40px_-10px_rgba(220,38,38,0.6)] overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-red-600 to-red-900 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="bg-red-50 group-hover:bg-white/20 p-3 md:p-4 rounded-full mb-3 md:mb-6 transition-colors flex items-center justify-center">
                  <img 
                    src={LOGO_SEDE_URL} 
                    alt="Logo Sede" 
                    className="w-12 h-12 md:w-16 md:h-16 object-contain drop-shadow-md" 
                  />
                </div>
                <h2 className="text-lg md:text-2xl font-black uppercase text-slate-800 group-hover:text-white mb-2">Sede / 1ª Cia</h2>
                <p className="text-xs font-bold text-slate-400 group-hover:text-red-100 uppercase tracking-widest">Seção de Apoio Operacional</p>
                <div className="mt-8 opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500 delay-100 flex items-center gap-2 text-white font-bold text-sm uppercase">
                  Acessar Sistema <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </button>

            <button 
              onClick={() => {
                const unit = UNITS.PEMAD;
                localStorage.setItem('sao_selected_unit_id', unit.id);
                setSelectedUnit(unit);
              }}
              className="group relative bg-white rounded-3xl p-4 md:p-8 transition-all hover:-translate-y-1 hover:shadow-[0_0_40px_-10px_rgba(234,88,12,0.6)] overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-orange-800 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="bg-orange-50 group-hover:bg-white/20 p-3 md:p-4 rounded-full mb-3 md:mb-6 transition-colors flex items-center justify-center">
                   <img 
                    src={LOGO_PEMAD_URL} 
                    alt="Logo PEMAD" 
                    className="w-14 h-14 md:w-20 md:h-20 object-contain drop-shadow-md" 
                  />
                </div>
                <h2 className="text-lg md:text-2xl font-black uppercase text-slate-800 group-hover:text-white mb-2">PEMAD</h2>
                <p className="text-xs font-bold text-slate-400 group-hover:text-orange-100 uppercase tracking-widest">Pelotão de Emergências Ambientais</p>
                <div className="mt-8 opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500 delay-100 flex items-center gap-2 text-white font-bold text-sm uppercase">
                  Acessar Sistema <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!authState.user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950 relative">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-500">
          <div className={`relative p-10 text-center text-white bg-gradient-to-b ${theme.gradient}`}>
            
            <button 
               onClick={() => {
                 setSelectedUnit(null);
                 localStorage.removeItem('sao_selected_unit_id');
               }} 
               className="absolute top-4 left-4 p-2.5 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-sm transition-all text-white shadow-lg border border-white/10"
               title="Trocar Unidade"
            >
               <ArrowLeft className="w-5 h-5" />
            </button>

            <button 
              onClick={() => setShowInstructions(true)}
              className="absolute top-4 right-4 p-2.5 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-sm transition-all text-white shadow-lg border border-white/10"
              title="Manual de Instruções"
            >
              <BookOpen className="w-5 h-5" />
            </button>

            <img 
              src="https://www.bombeiros.mg.gov.br/images/logo.png" 
              alt="Logo CBMMG" 
              className="w-24 mx-auto mb-6 drop-shadow-xl" 
            />
            <h1 className="text-3xl font-black uppercase tracking-tighter leading-tight">{selectedUnit.name}</h1>
            <p className="text-[10px] font-bold mt-2 opacity-90 tracking-widest uppercase">Acesso do Plantonista</p>
          </div>
          <div className="p-8">
            <form onSubmit={async (e) => {
              e.preventDefault();
              const names = formName.trim().split(/\s+/);
              const uppercaseWords = names.filter(n => n === n.toUpperCase() && n.length >= 2);
              const warNameFound = uppercaseWords.length > 0 ? uppercaseWords.join(' ') : names[names.length - 1];
              const user = { rank: formRank, name: formName, warName: warNameFound, bm: formBm, cpf: '' };
              setAuthState({ user, isVisitor: false });
              localStorage.setItem(`sao_current_user_${selectedUnit.id}`, JSON.stringify(user));
              // Trigger sync immediately with user loaded
              if (sheetUrl) {
                const storageKey = `sao_movements_${selectedUnit.id}`;
                const data = await fetchFromSheets(sheetUrl);
                if (data) {
                  setMovements(data);
                  localStorage.setItem(storageKey, JSON.stringify(data));
                  setLastSync(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
                  setSyncError(false);
                  setHasInitialLoad(true);
                }
              }
            }} className="space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Posto/Graduação (Plantonista)</label>
                <select className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 ${theme.primaryRing} outline-none`} value={formRank} onChange={(e) => setFormRank(e.target.value)} required>
                  <option value="">Selecione...</option>
                  {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo (GUERRA em CAIXA ALTA)</label>
                <input type="text" placeholder="Ex: JOÃO Augusto Silva" className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 ${theme.primaryRing} outline-none`} value={formName} onChange={(e) => setFormName(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nº BM (Plantonista)</label>
                <input type="text" placeholder="Ex: 123.456-7" className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-2 ${theme.primaryRing} outline-none`} value={formBm} onChange={(e) => setFormBm(formatBM(e.target.value))} required />
              </div>
              <button type="submit" className={`w-full ${theme.primary} ${theme.primaryHover} text-white font-bold py-4 rounded-xl shadow-lg uppercase tracking-widest border-b-4 ${theme.border} transition-all active:scale-95 mt-2`}>
                Registrar Movimentação
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN APP ---
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 relative">
      <header className={`${theme.primary} text-white shadow-lg p-4 sticky top-0 z-50`}>
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img 
              src="https://www.bombeiros.mg.gov.br/images/logo.png" 
              alt="Logo CBMMG" 
              className="w-8 h-8 drop-shadow-md" 
            />
            <div className="flex flex-col">
              <h1 className="font-black text-xl leading-none uppercase tracking-tighter">{selectedUnit.name}</h1>
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
                  <div className="flex items-center gap-1 text-[8px] font-bold uppercase text-green-100 bg-green-950/30 px-2 py-0.5 rounded-full border border-green-500/20">
                    <Wifi className="w-3 h-3" /> Plantonista Online {lastSync && `(${lastSync})`}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 bg-black/20 rounded-xl border border-white/10`}>
              <User className={`w-3.5 h-3.5 ${theme.textLight}`} />
              <span className="text-[10px] font-bold uppercase tracking-wider">{authState.user.rank} {authState.user.warName}</span>
            </div>

            <button onClick={handleSyncManually} className={`p-2 rounded-xl transition-all hover:bg-black/20 bg-black/10 ${isSyncing ? 'animate-spin' : ''}`} title="Sincronizar">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button onClick={() => { 
              // Clear current user
              setAuthState({ user: null, isVisitor: false }); 
              localStorage.removeItem(`sao_current_user_${selectedUnit.id}`); 
              // Note: We do NOT clear selectedUnit here, user goes to login screen of same unit
            }} className="p-2 hover:bg-black/20 rounded-xl transition-all" title="Sair do Plantão">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[300] flex flex-col gap-2 w-full max-w-sm px-4">
        {notifications.map(n => (
          <div key={n.id} className={`p-4 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold uppercase tracking-wider animate-in slide-in-from-bottom-2 duration-300 border backdrop-blur-md ${n.type === 'success' ? 'bg-green-500/90 text-white border-green-400' : 'bg-red-600/90 text-white border-red-500'}`}>
            {n.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
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
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold transition-all ${activeTab === tab.id ? `${theme.primary} text-white shadow-md` : 'text-slate-500 hover:bg-slate-50'}`}>
              <tab.icon className="w-4 h-4" />
              <span className="text-[10px] sm:text-xs uppercase tracking-wider">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === 'checkout' && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200">
              <h2 className={`text-xl font-bold text-slate-800 uppercase mb-8 flex items-center gap-2`}>
                <ClipboardList className={`w-6 h-6 ${theme.text}`} /> Registro de Entrega de Material
              </h2>
              
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 mb-8">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1"><User className="w-3 h-3"/> Militar Retirante (Responsável)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Posto/Graduação</label>
                    <select className={`w-full p-3 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 ${theme.primaryRing} outline-none`} value={borrowerRank} onChange={(e) => setBorrowerRank(e.target.value)}>
                      <option value="">Selecione...</option>
                      {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nº BM</label>
                    <input type="text" placeholder="Ex: 123.456-7" className={`w-full p-3 bg-white border border-slate-200 rounded-xl font-bold focus:ring-2 ${theme.primaryRing} outline-none`} value={borrowerBm} onChange={(e) => setBorrowerBm(formatBM(e.target.value))} />
                  </div>
                  <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                    <input type="text" placeholder="Ex: PAULO Santos" className={`w-full p-3 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 ${theme.primaryRing} outline-none`} value={borrowerName} onChange={(e) => setBorrowerName(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <form onSubmit={addItemToCart} className="lg:col-span-2 space-y-5">
                   <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição do Material</label>
                      <textarea placeholder="Ex: 03 Mosquetões; 01 baudrier; 02 cordas 60m" className={`w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl min-h-[100px] font-medium focus:ring-2 ${theme.primaryRing} outline-none transition-all`} value={checkoutMaterial} onChange={(e) => setCheckoutMaterial(e.target.value)} />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1"><MapPin className="w-3 h-3"/> Origem do Material</label>
                        <input list="origins" type="text" placeholder="Ex: SAO, Viatura, SOU..." className={`w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-2 ${theme.primaryRing} outline-none`} value={checkoutOrigin} onChange={(e) => setCheckoutOrigin(e.target.value)} required />
                        <datalist id="origins">
                          <option value="SAO" />
                          <option value="ABTS 1033" />
                          <option value="ABTS 9744" />
                          <option value="AT 0696" />
                          <option value="UR 5566" />
                          <option value="UR 2088" />
                          <option value="ASM 0252" />
                          <option value="ACA 2168" />
                          <option value="ASL 6081" />
                          <option value="ASL 4675" />
                          <option value="ASF 2360" />
                          <option value="ASF 2157" />
                          <option value="APP 1121" />
                        </datalist>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Previsão Retorno</label>
                        <input type="date" className={`w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 ${theme.primaryRing} outline-none`} value={checkoutEstimatedReturn} onChange={(e) => setCheckoutEstimatedReturn(e.target.value)} required />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Motivo (Opcional)</label>
                        <input type="text" placeholder="TPB, Manutenção, Ocorrência, Curso" className={`w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 ${theme.primaryRing} outline-none`} value={checkoutReason} onChange={(e) => setCheckoutReason(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo</label>
                        <select className={`w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 ${theme.primaryRing} outline-none`} value={checkoutType} onChange={(e) => setCheckoutType(e.target.value as MaterialType)}>
                            {MATERIAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Foto do Material (Opcional)</label>
                       <div className="flex items-center gap-4">
                          <input 
                            type="file" 
                            accept="image/*" 
                            capture="environment" 
                            className="hidden" 
                            ref={fileInputRef}
                            onChange={handleImageCapture}
                          />
                          <button 
                            type="button" 
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-3 rounded-xl font-bold text-xs uppercase flex items-center gap-2 border border-slate-200 transition-all"
                          >
                             <Camera className="w-4 h-4" /> Capturar Foto
                          </button>
                          {checkoutImage && (
                             <div className="relative group">
                                <img src={checkoutImage} alt="Preview" className="h-12 w-12 rounded-lg object-cover border-2 border-slate-200" />
                                <button type="button" onClick={() => { setCheckoutImage(''); if(fileInputRef.current) fileInputRef.current.value = ""; }} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-md">
                                   <X className="w-3 h-3" />
                                </button>
                             </div>
                          )}
                       </div>
                    </div>

                    <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg uppercase flex items-center justify-center gap-2 transition-all active:scale-95">
                      <PlusCircle className="w-5 h-5" /> Adicionar à Lista
                    </button>
                </form>

                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 flex flex-col h-full">
                  <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4 flex items-center gap-2">
                    <Layers className="w-4 h-4"/> Itens para Retirada ({checkoutCart.length})
                  </h3>
                  <div className="flex-1 overflow-y-auto space-y-3 mb-4 max-h-[300px]">
                    {checkoutCart.length === 0 ? (
                      <p className="text-center text-slate-400 text-sm italic py-10">Nenhum item adicionado ainda.</p>
                    ) : (
                      checkoutCart.map(item => (
                        <div key={item.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm relative group">
                          <button onClick={() => removeItemFromCart(item.id)} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div className="flex gap-3">
                             {item.image ? (
                                <img src={item.image} className="w-10 h-10 rounded-lg object-cover border border-slate-100 bg-slate-50" alt="Item" />
                             ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300">
                                   <ImageIcon className="w-5 h-5" />
                                </div>
                             )}
                             <div>
                                <p className="font-bold text-slate-800 text-sm pr-6">{item.material}</p>
                                <div className="flex items-center gap-2 mt-1">
                                   <span className="text-[9px] uppercase font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md">{item.origin}</span>
                                   <span className="text-[9px] text-slate-400">{item.type}</span>
                                </div>
                             </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <button 
                    onClick={() => setShowCheckoutConfirm(true)} 
                    disabled={checkoutCart.length === 0 || !borrowerBm || !borrowerName || !borrowerRank}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl shadow-xl uppercase flex items-center justify-center gap-3 border-b-4 border-green-800 transition-all active:scale-95 mt-auto"
                  >
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    Finalizar Cautela
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'checkin' && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 min-h-[500px]">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-4 border-b gap-4">
                <h2 className={`text-xl font-bold text-slate-800 uppercase flex items-center gap-2`}>
                  <ArrowRightLeft className={`w-6 h-6 ${theme.text}`} /> Materiais com a Tropa
                </h2>
                <div className="w-full md:w-96 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input type="text" placeholder="Filtrar por Militar, BM, Origem..." className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium outline-none" value={checkinSearchTerm} onChange={(e) => setCheckinSearchTerm(e.target.value)} />
                </div>
              </div>
              
              {selectedReturnIds.length > 0 && (
                <div className="fixed bottom-20 right-6 z-50 animate-in slide-in-from-bottom-5">
                   <button onClick={() => setShowReturnConfirm(true)} className="bg-green-600 text-white font-black py-4 px-8 rounded-full shadow-2xl border-4 border-white flex items-center gap-3 hover:scale-105 transition-transform">
                      <CheckCircle2 className="w-6 h-6" /> Receber {selectedReturnIds.length} Itens
                   </button>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                {movements.filter(m => m.status === MovementStatus.PENDENTE).filter(m => 
                  [m.name, m.warName, m.material, m.bm, m.origin || 'SAO'].some(f => (f || '').toLowerCase().includes(checkinSearchTerm.toLowerCase()))
                ).map(m => {
                  const overdue = isOverdue(m.estimatedReturnDate, m.status);
                  const isSelected = selectedReturnIds.includes(m.id);
                  return (
                    <div key={m.id} className={`border rounded-2xl p-4 transition-all flex items-start gap-4 group ${overdue ? 'bg-red-50 border-red-100' : 'bg-slate-50/50 hover:bg-white border-slate-100'} ${isSelected ? 'ring-2 ring-green-500 bg-green-50' : ''}`}>
                      <div className="pt-2">
                         <input type="checkbox" checked={isSelected} onChange={() => toggleReturnSelection(m.id)} className="w-5 h-5 rounded-md border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer" />
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-col md:flex-row md:items-center gap-2 mb-1">
                          <h4 className="font-black text-lg uppercase text-slate-800 leading-tight">{m.rank} {m.warName}</h4>
                          <div className="flex gap-2">
                            {overdue && <span className="bg-red-600 text-white text-[8px] px-2 py-0.5 rounded-full font-black animate-pulse flex items-center gap-1"><AlertOctagon className="w-2.5 h-2.5" /> ATRASADO</span>}
                            <span className="bg-slate-200 text-slate-600 text-[8px] px-2 py-0.5 rounded-full font-black uppercase flex items-center gap-1"><MapPin className="w-2.5 h-2.5" /> {m.origin || 'SAO'}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                          <p className="text-[11px] text-slate-400 font-bold">BM {m.bm}</p>
                          <p className="text-[11px] text-slate-400 font-bold">Retirado em: {formatDateTime(m.dateCheckout)}</p>
                          <p className={`text-[11px] font-black uppercase ${overdue ? 'text-red-600' : 'text-slate-400'}`}>Previsão: {formatDateOnly(m.estimatedReturnDate)}</p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm text-sm text-slate-700 font-medium italic flex items-start gap-3">
                          <ImageDisplay src={m.image} />
                          <span>"{m.material}"</span>
                        </div>
                      </div>
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
                        <input type="text" placeholder="Filtrar por nome, material, origem..." className={`w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-medium outline-none focus:ring-2 ${theme.primaryRing} transition-all`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 bg-slate-100/50 p-1.5 rounded-2xl border border-slate-200">
                        <button onClick={() => setStatusFilter('all')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-white/50'}`}>Todos</button>
                        <button onClick={() => setStatusFilter(MovementStatus.PENDENTE)} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${statusFilter === MovementStatus.PENDENTE ? 'bg-amber-500 text-white shadow-md' : 'text-amber-600 hover:bg-amber-50'}`}><Clock className="w-3.5 h-3.5" /> Pendências</button>
                        <button onClick={() => setStatusFilter(MovementStatus.DEVOLVIDO)} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${statusFilter === MovementStatus.DEVOLVIDO ? 'bg-green-600 text-white shadow-md' : 'text-green-600 hover:bg-green-50'}`}><CheckCircle2 className="w-3.5 h-3.5" /> Devolvidos</button>
                      </div>
                   </div>

                   <div className="overflow-x-auto -mx-6 sm:mx-0">
                      <table className="w-full text-left border-separate border-spacing-y-3 min-w-[1200px] px-6 sm:px-0 lg:min-w-0">
                        <thead>
                          <tr className="text-[9px] lg:text-[8px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="px-5 py-3">Militar Responsável</th>
                            <th className="px-5 py-3">Descrição Material</th>
                            <th className="px-5 py-3">Origem</th>
                            <th className="px-5 py-3">Datas (Saída/Prev)</th>
                            <th className="px-5 py-3">Entregue por</th>
                            <th className="px-5 py-3">Recebido por</th>
                            <th className="px-5 py-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMovements.length > 0 ? filteredMovements.map(m => {
                            const overdue = isOverdue(m.estimatedReturnDate, m.status);
                            return (
                              <tr key={m.id} className={`transition-all text-sm lg:text-[11px] group shadow-sm hover:shadow-md border border-slate-100 ${overdue ? 'bg-red-50/50 hover:bg-red-50' : 'bg-slate-50/50 hover:bg-white'}`}>
                                <td className="py-5 px-5 rounded-l-2xl border-l border-y border-slate-100">
                                  <div className="font-black uppercase text-slate-800 leading-tight mb-1 text-xs lg:text-[10px]">{m.rank} {m.warName}</div>
                                  <div className="text-[9px] lg:text-[8px] text-slate-400 font-bold">BM {m.bm}</div>
                                </td>
                                <td className="py-5 px-5 border-y border-slate-100">
                                  <div className="flex items-start gap-2">
                                     <ImageDisplay src={m.image} />
                                     <div>
                                        <div className="font-bold text-slate-700 max-w-xs leading-relaxed">{m.material}</div>
                                        <div className="text-[8px] uppercase font-black text-slate-400 mt-1">{m.type}</div>
                                     </div>
                                  </div>
                                </td>
                                <td className="py-5 px-5 border-y border-slate-100">
                                   <div className="flex items-center gap-1.5 text-[10px] lg:text-[9px] font-bold text-slate-600 uppercase bg-slate-100 px-2 py-1 rounded-md w-fit">
                                      <MapPin className="w-3 h-3 text-slate-400" />
                                      {m.origin || 'SAO'}
                                   </div>
                                </td>
                                <td className="py-5 px-5 border-y border-slate-100 whitespace-nowrap">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2 text-slate-500">
                                      <ArrowRight className="w-3 h-3 text-red-400" />
                                      <span className="text-[10px] lg:text-[9px] font-bold">{formatDateTime(m.dateCheckout)}</span>
                                    </div>
                                    {m.estimatedReturnDate && (
                                      <div className={`flex items-center gap-2 ${overdue ? 'text-red-600 font-black' : 'text-slate-400'}`}>
                                        <Calendar className="w-3 h-3" />
                                        <span className="text-[10px] lg:text-[9px]">Prev: {formatDateOnly(m.estimatedReturnDate)}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="py-5 px-5 border-y border-slate-100">
                                  <div className="text-[10px] lg:text-[9px] font-bold text-slate-600 uppercase">{m.dutyOfficerName}</div>
                                  <div className="text-[8px] text-slate-400">BM {m.dutyOfficerBm}</div>
                                </td>
                                <td className="py-5 px-5 border-y border-slate-100">
                                  {m.status === MovementStatus.DEVOLVIDO ? (
                                    <div>
                                      <div className="font-black uppercase text-slate-800 leading-tight mb-1 text-xs lg:text-[10px]">{m.receiverRank} {m.receiverWarName}</div>
                                      <div className="text-[9px] lg:text-[8px] text-slate-400 font-bold">BM {m.receiverBm}</div>
                                    </div>
                                  ) : <span className="text-slate-300 italic text-[10px] lg:text-[9px]">Em posse da tropa</span>}
                                </td>
                                <td className="py-5 px-5 rounded-r-2xl border-r border-y border-slate-100 text-center">
                                  <span className={`inline-block px-4 py-1.5 rounded-full text-[9px] lg:text-[8px] font-black uppercase tracking-widest shadow-sm ${m.status === MovementStatus.PENDENTE ? (overdue ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-700 border border-amber-200') : 'bg-green-100 text-green-700 border border-green-200'}`}>
                                    {m.status === MovementStatus.PENDENTE && overdue ? "EM ATRASO" : m.status}
                                  </span>
                                  {m.status === MovementStatus.DEVOLVIDO && (
                                    <div className="text-[9px] lg:text-[8px] text-slate-400 font-bold mt-1">
                                      {formatDateOnly(m.dateReturn)}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          }) : <tr><td colSpan={7} className="py-20 text-center text-slate-400 font-medium italic">Nenhum registro encontrado.</td></tr>}
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
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Resumo automático de criticidade</p>
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

      {showReturnConfirm && selectedReturnIds.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8">
            <h3 className="text-2xl font-black uppercase tracking-tight text-green-600 mb-6 flex items-center gap-2">
               <CheckCircle2 className="w-6 h-6" /> Confirmar Devolução
            </h3>
            <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100 text-slate-600 text-sm max-h-[150px] overflow-y-auto">
              <p className="font-bold mb-2">Itens selecionados ({selectedReturnIds.length}):</p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                 {movements.filter(m => selectedReturnIds.includes(m.id)).map(m => (
                   <li key={m.id}>{m.material} <span className="text-slate-400">({m.origin})</span></li>
                 ))}
              </ul>
            </div>
            <textarea 
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-green-500" 
              placeholder="Descreva o estado dos materiais ou observações pertinentes para este lote..."
              value={pendingObservations}
              onChange={(e) => setPendingObservations(e.target.value)}
            />
            <div className="flex gap-3 mt-6">
              <button disabled={isSaving} onClick={() => setShowReturnConfirm(false)} className="flex-1 py-4 bg-slate-100 font-bold rounded-xl uppercase hover:bg-slate-200">Cancelar</button>
              <button disabled={isSaving || !hasInitialLoad} onClick={handleReturnFinal} className="flex-1 py-4 bg-green-600 text-white font-bold rounded-xl uppercase shadow-xl flex items-center justify-center gap-2 hover:bg-green-700 active:scale-95 transition-all">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Receber Lote
              </button>
            </div>
          </div>
        </div>
      )}

      {showCheckoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8">
            <h3 className="text-2xl font-black uppercase tracking-tight text-amber-600 mb-6 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6" /> Confirmar Cautela
            </h3>
            <div className="bg-slate-50 p-6 rounded-2xl border text-sm space-y-4 mb-6">
               <div className="flex justify-between border-b pb-2">
                 <p className="font-black text-slate-400 uppercase text-[10px]">Militar Retirante:</p>
                 <p className="font-bold text-slate-800">{borrowerRank} {borrowerName}</p>
               </div>
               <div className="flex justify-between border-b pb-2">
                 <p className="font-black text-slate-400 uppercase text-[10px]">Plantonista Responsável:</p>
                 <p className="font-bold text-slate-800">{authState.user?.rank} {authState.user?.warName}</p>
               </div>
               <div className="pt-2">
                 <p className="font-black text-slate-400 uppercase text-[10px] mb-2">Lista de Materiais:</p>
                 <div className="max-h-[150px] overflow-y-auto space-y-2">
                    {checkoutCart.map(item => (
                       <div key={item.id} className="bg-white p-2 rounded border border-slate-100 text-xs flex gap-2">
                          {item.image && <img src={item.image} className="w-10 h-10 rounded object-cover" alt="item"/>}
                          <div>
                            <span className="font-bold">{item.material}</span>
                            <span className="block text-[10px] text-slate-400">Origem: {item.origin} | Prev: {formatDateOnly(item.estimatedReturn)}</span>
                          </div>
                       </div>
                    ))}
                 </div>
               </div>
            </div>
            <div className="flex gap-3">
              <button disabled={isSaving} onClick={() => setShowCheckoutConfirm(false)} className="flex-1 py-4 bg-slate-100 font-bold rounded-xl uppercase hover:bg-slate-200">Revisar</button>
              <button disabled={isSaving || !hasInitialLoad} onClick={handleCheckoutFinal} className="flex-1 py-4 bg-green-600 text-white font-bold rounded-xl uppercase shadow-xl flex items-center justify-center gap-2 hover:bg-green-700 active:scale-95 transition-all">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Confirmar Entrega
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfig && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6">
            <h3 className="font-black uppercase text-slate-800 mb-4 flex items-center gap-2"><Settings className="w-5 h-5" /> Endpoint da Planilha ({selectedUnit.shortName})</h3>
            <p className="text-xs text-slate-500 mb-2">Configure aqui a URL do Google Script para o banco de dados desta unidade.</p>
            <input 
              type="text" 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono mb-4 focus:ring-2 focus:ring-red-500"
              value={sheetUrl}
              onChange={(e) => {
                setSheetUrl(e.target.value);
                localStorage.setItem(`sao_sheet_url_${selectedUnit.id}`, e.target.value);
              }}
            />
            <button onClick={async () => { await handleSyncManually(); setShowConfig(false); }} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-xs uppercase hover:bg-black active:scale-95 transition-all">Salvar Configuração</button>
          </div>
        </div>
      )}

      <footer className="p-10 text-center bg-white border-t border-slate-100">
        <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">{selectedUnit.name}</span>
      </footer>
    </div>
  );
};

export default App;
