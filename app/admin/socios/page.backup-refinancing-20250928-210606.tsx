'use client';

import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCurrency, gsFormat, gsParse, xround, getTodayParaguay } from '@/lib/utils';
import { ServiceType, PaymentItem, Service } from '@/lib/types';
import { 
  getPrecioSegunTipoMiembro, 
  calcularVencimiento, 
  calcularDiasEntreFechas,
  crearPaymentItemDefault,
  convertirTipoAPeriodicidad 
} from '@/lib/service-utils';
import {
  Plus, Search, Download, Filter, MoreVertical, X, ChevronDown, ChevronUp, User,
  CreditCard, Minus, Plus as PlusIcon, UserPlus
} from 'lucide-react';
import Link from 'next/link';
import ConceptosTable from '@/components/ConceptosTable';
import ResumenPago from '@/components/ResumenPago';

import { 
  ConceptoItem, 
  createEmptyConcepto, 
  calculateTotal, 
  getNumericValueSafe, 
  hasDuplicateService, 
  isServiceDuplicate,
  calcularVencimientoAutomatico,
  actualizarVencimientoSiEsAutomatico,
  marcarVencimientoComoManual,
  cryptoRandom
} from '@/lib/concept-helpers';

// === Tipos ===
type MovementType = 'DEBIT' | 'CREDIT';

interface Movement {
  id: string;
  memberId: string;
  fecha: string;
  concepto: string;
  tipo: MovementType;
  monto: number;
  origen?: string;
  refId?: string;
  vencimiento?: string;
  paidAmount?: number;
  observaciones?: string;
}

interface Member {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
  ci: string;
  ruc?: string;
  categoria: string;
  subcategoria: string;
  telefono?: string;
  email?: string;
  estado: string;
  alta: string;
  foto?: string;
  deudaTotal?: number;
}

interface Collector {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
  activo?: boolean;
}



interface PaymentMethod {
  id: string;
  nombre: string;
  activo?: boolean;
}

interface Subscription {
  id: string;
  serviceId: string;
  active: boolean;
  vencimiento?: string;
  [key: string]: any;
}

// ===== Helpers comunes =====
function normalizeTipoMovimiento(t: string): MovementType {
  const u = String(t || '').toUpperCase();
  if (u === 'DEBIT' || u === 'DEBE') return 'DEBIT';
  if (u === 'CREDIT' || u === 'HABER') return 'CREDIT';
  return 'DEBIT';
}

function calcularEstadoPorVencimientos(movs: any[]): 'AL_DIA' | 'ATRASADO' {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const debPend = movs.filter(m => {
    const esDebito = normalizeTipoMovimiento(m.tipo) === 'DEBIT';
    if (!esDebito) return false;
    const monto = Number(m.monto || 0);
    const pagado = Number(m.paidAmount || 0);
    return (monto - pagado) > 0;
  });
  if (debPend.length === 0) return 'AL_DIA';
  for (const d of debPend) {
    if (d.vencimiento) {
      const v = new Date(d.vencimiento); v.setHours(0,0,0,0);
      if (v < hoy) return 'ATRASADO';
    }
  }
  return 'AL_DIA';
}

function addDays(isoDate: string | null | undefined, days: number) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function nSafe(v: string | number | null | undefined): number {
  const n = typeof v === 'string' ? Number(v) : (v ?? 0 as number);
  return Number.isFinite(n) ? n : 0;
}
// ===== Página =====
export default function SociosPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterSubcategoria, setFilterSubcategoria] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Modal unificado
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [selectedMemberForService, setSelectedMemberForService] = useState<Member | null>(null);
  const [activeTab, setActiveTab] = useState<'unified'>('unified'); // UNIFICADO
  
  // Estados para modal de reservas
  const [showReservaModal, setShowReservaModal] = useState(false);
  const [reservaConceptoId, setReservaConceptoId] = useState<string>('');
  const [venues, setVenues] = useState<any[]>([]);
  const [reservaForm, setReservaForm] = useState({
    venueId: '',
    fecha: getTodayParaguay(),
    inicioHora: '19:00',
    finHora: '23:00',
    observaciones: ''
  });
  
  // ===== ESTADO UNIFICADO PARA TRANSACCIONES =====
  interface UnifiedTransactionForm {
    // Selector principal
    condicion: 'CONTADO' | 'CREDITO';
    
    // Datos del servicio (comunes)
    fecha: string;
    servicioId: string;
    concepto: string;
    tipoServicio: 'MENSUAL' | 'ANUAL' | 'UNICO' | 'DIARIO';
    monto: string;
    dias?: number; // Para DIARIO
    vencimiento: string;
    observaciones: string;
    
    // Opciones de servicio
    crearSuscripcion: boolean;
    
    // Pago parcial (solo CREDITO)
    pagoAplicado: string; // Monto a pagar ahora en modo crédito
    
    // Información de pago (condicional)
    metodoPago: string; // Puede ser "NINGUNO" en crédito sin pago
    cobradorId: string; // Puede ser "NINGUNO" en crédito sin pago  
    numeroRecibo: string;
    referencia: string; // Para comprobantes de pago
    permitirPagosParc: boolean; // Checkbox para habilitar pago parcial en CREDITO
    
    // Presupuesto adicional para deudas previas
    presupuestoDeudas: string;
    // Soporte para multiples conceptos por sección
    conceptosContado?: ConceptoItem[];
    conceptosCredito?: ConceptoItem[];
  }

  const [unifiedForm, setUnifiedForm] = useState<UnifiedTransactionForm>({
    condicion: 'CONTADO',
    fecha: getTodayParaguay(),
    servicioId: '',
    concepto: '',
    tipoServicio: 'MENSUAL',
    monto: '',
    dias: 1,
    vencimiento: addDays(getTodayParaguay(), 30),
    observaciones: '',
    crearSuscripcion: false,
    pagoAplicado: '',
    metodoPago: '',
    cobradorId: '',
    numeroRecibo: '',
    referencia: '',
    permitirPagosParc: false,
    presupuestoDeudas: '',
    // Inicializamos con un concepto por defecto para compatibilidad
    conceptosContado: [
      {
        id: cryptoRandom(),
        servicioId: '',
        concepto: '',
        tipoServicio: 'MENSUAL',
        monto: '',
        dias: 1,
        vencimiento: addDays(getTodayParaguay(), 30),
        observaciones: '',
      }
    ],
    conceptosCredito: [
      {
        id: cryptoRandom(),
        servicioId: '',
        concepto: '',
        tipoServicio: 'MENSUAL',
        monto: '',
        dias: 1,
        vencimiento: addDays(getTodayParaguay(), 30),
        observaciones: '',
      }
    ],
  });

  // Función auxiliar para crear concepto vacío con vencimiento automático
  function createEmptyConceptoWithDate(fechaBase?: string) {
    const concepto = createEmptyConcepto();
    const fecha = fechaBase || unifiedForm.fecha || getTodayParaguay();
    
    // Calcular vencimiento automático para MENSUAL por defecto
    const vencimientoAutomatico = calcularVencimientoAutomatico(fecha, 'MENSUAL');
    return {
      ...concepto,
      vencimiento: vencimientoAutomatico,
      vencimientoManual: false // Marcar como automático
    };
  }

  // Helpers para manipular conceptos dentro de unifiedForm
  function addConceptoToSection(section: 'CONTADO' | 'CREDITO') {
    const newC = createEmptyConceptoWithDate();
    setUnifiedForm(prev => {
      if (section === 'CONTADO') {
        const arr = (prev.conceptosContado || []).concat(newC);
        return { ...prev, conceptosContado: arr };
      } else {
        const arr = (prev.conceptosCredito || []).concat(newC);
        return { ...prev, conceptosCredito: arr };
      }
    });
  }

  function removeConceptoFromSection(section: 'CONTADO' | 'CREDITO', id: string) {
    setUnifiedForm(prev => {
      if (section === 'CONTADO') {
        const arr = (prev.conceptosContado || []).filter(c => c.id !== id);
        return { ...prev, conceptosContado: arr.length ? arr : [createEmptyConceptoWithDate()] };
      } else {
        const arr = (prev.conceptosCredito || []).filter(c => c.id !== id);
        return { ...prev, conceptosCredito: arr.length ? arr : [createEmptyConceptoWithDate()] };
      }
    });
  }

  // Permite recalcular vencimiento automáticamente si se cambia servicio, tipo o fecha global
  function updateConceptoInSection(section: 'CONTADO' | 'CREDITO', conceptoId: string, field: keyof ConceptoItem, value: any, autoVencimiento = false) {
    setUnifiedForm(prev => {
      const updateConceptos = (conceptos: ConceptoItem[] = []) => conceptos.map(c => {
        if (c.id !== conceptoId) return c;
        
        let updatedConcepto = { ...c, [field]: value };
        
        // Si se está editando el vencimiento manualmente, marcarlo como manual
        if (field === 'vencimiento' && !autoVencimiento) {
          updatedConcepto = marcarVencimientoComoManual(updatedConcepto, value);
        }
        // Si se cambia el tipoServicio y el vencimiento no es manual, recalcular automáticamente
        else if (field === 'tipoServicio' && prev.fecha) {
          updatedConcepto = actualizarVencimientoSiEsAutomatico(
            updatedConcepto, 
            prev.fecha, 
            value
          );
        }
        // Si se cambian los días para tipo DIARIO y no es manual, recalcular
        else if (field === 'dias' && updatedConcepto.tipoServicio === 'DIARIO' && prev.fecha) {
          updatedConcepto = actualizarVencimientoSiEsAutomatico(
            updatedConcepto,
            prev.fecha,
            updatedConcepto.tipoServicio
          );
        }
        
        return updatedConcepto;
      });
      
      if (section === 'CONTADO') {
        return ({ ...prev, conceptosContado: updateConceptos(prev.conceptosContado) });
      }
      return ({ ...prev, conceptosCredito: updateConceptos(prev.conceptosCredito) });
    });
  }

  // Recalcula vencimiento de todos los conceptos al cambiar la fecha global
  function handleFechaGlobalChange(newFecha: string) {
    setUnifiedForm(prev => {
      const updateVencs = (conceptos: ConceptoItem[] = []) => conceptos.map(c => {
        // Solo recalcular si el vencimiento no fue editado manualmente
        return actualizarVencimientoSiEsAutomatico(c, newFecha, c.tipoServicio);
      });
      return {
        ...prev,
        fecha: newFecha,
        conceptosContado: updateVencs(prev.conceptosContado),
        conceptosCredito: updateVencs(prev.conceptosCredito)
      };
    });
  }

  // Estados para validación y UX
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showFormValidation, setShowFormValidation] = useState(false);

  // Modal registro no-socio
  const [showNoSocioModal, setShowNoSocioModal] = useState(false);
  const [noSocioForm, setNoSocioForm] = useState({
    nombres: '',
    apellidos: '',
    ci: '',
    telefono: '',
    email: ''
  });
  const [ciValidationError, setCiValidationError] = useState('');

  // Función para cerrar modal no-socio y limpiar estado
  function closeNoSocioModal() {
    setShowNoSocioModal(false);
    setCiValidationError('');
    setNoSocioForm({
      nombres: '',
      apellidos: '',
      ci: '',
      telefono: '',
      email: ''
    });
  }

  // Tab SERVICIO (se mantiene para casos “no contado”)
  const [serviceForm, setServiceForm] = useState({
    fecha: getTodayParaguay(),
    servicioId: '',
    concepto: '',
    monto: '',
    tipoServicio: 'MENSUAL' as 'MENSUAL' | 'ANUAL' | 'UNICO' | 'DIARIO',
    observaciones: '',
    vencimiento: addDays(getTodayParaguay(), 30),
    makeSubscription: false,
    autoDebit: true,
  });
  const [vencimientoTouched, setVencimientoTouched] = useState(false);

  // Tab PAGO
  interface PayItem {
    id: string;
    servicioId: string;
    concepto: string;
    tipoServicio: 'MENSUAL' | 'ANUAL' | 'UNICO' | 'DIARIO';
    montoStr: string;
    subId?: string;
    currentDue?: string;
    nextDue?: string;
    vencimiento?: string;
    dias?: number;
  }
  const [payItems, setPayItems] = useState<PayItem[]>([
    { 
      id: cryptoRandom(), 
      servicioId: '', 
      concepto: '', 
      tipoServicio: 'MENSUAL', 
      montoStr: '',
      vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) // 30 días
    }
  ]);

  const [paymentForm, setPaymentForm] = useState({
    fecha: getTodayParaguay(),
    metodoPago: '',
    cobradorId: '',
    numeroRecibo: '',
    observaciones: '',
  });

  // Presupuesto para pagar deudas antiguas (además de los conceptos al contado)
  const [extraBudgetStr, setExtraBudgetStr] = useState('');

  // Asignación a débitos (deudas previas)
  const [loadingDebits, setLoadingDebits] = useState(false);
  const [pendingDebits, setPendingDebits] = useState<Movement[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  // Estados para selección de débitos y UI desplegable
  const [selectedDebits, setSelectedDebits] = useState<string[]>([]); // IDs de débitos seleccionados
  const [individualAmounts, setIndividualAmounts] = useState<{[key: string]: string}>({}); // Montos individuales por débito
  const [showDebtAssignment, setShowDebtAssignment] = useState(false); // Control de desplegable

  // Estados para el modal de deudas pendientes
  const [showDebtsModal, setShowDebtsModal] = useState(false);
  const [selectedMemberForDebts, setSelectedMemberForDebts] = useState<Member | null>(null);
  
  // Estados para el formulario de pago de deudas
  const [debtPaymentForm, setDebtPaymentForm] = useState({
    fecha: getTodayParaguay(),
    montoAPagar: '',
    metodoPago: '',
    cobradorId: '',
    numeroRecibo: '',
    referencia: '',
    observaciones: ''
  });

  // UI & otros
  const [saving, setSaving] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState('');
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState<number>(1);
  const [openMenuMemberId, setOpenMenuMemberId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const actionsBtnRef = useRef<HTMLButtonElement | null>(null);

  // Ledgers
  const [memberDebtMap, setMemberDebtMap] = useState<
    Record<string, { saldo: number; estadoCalc: 'AL_DIA' | 'ATRASADO' | 'SUSPENDIDO' }>
  >({});

  // ===== Helper Functions =====
  function trimAllocations(
    current: Record<string, string>,
    debs: Movement[],
    newTotal: number
  ): Record<string, string> {
    const ordered = debs.map(d => d.id);
    let left = newTotal;
    const next: Record<string, string> = {};
    for (const id of ordered) {
      const v = nSafe(current[id] || 0);
      if (!v) continue;
      if (left <= 0) { next[id] = ''; continue; }
      const take = Math.min(v, left);
      next[id] = take ? String(take) : '';
      left -= take;
    }
    return next;
  }

  // ===== Effects =====
  useEffect(() => {
    loadMembersAndLedgers();
    loadCollectors();
    loadServices();
    loadPaymentMethods();
    loadVenues();
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (actionsBtnRef.current && actionsBtnRef.current.contains(target as Node)) return;
      setOpenMenuMemberId(null);
    };
    
    const onScroll = () => {
      setOpenMenuMemberId(null);
    };
    
    document.addEventListener('click', onDocClick);
    window.addEventListener('scroll', onScroll, true); // true para capturar scroll en cualquier elemento
    
    return () => {
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  // Vencimiento dinámico (Tab Servicio)
  useEffect(() => {
    if (vencimientoTouched) return;
    const base = serviceForm.fecha;
    if (!base || !/^\d{4}-\d{2}-\d{2}$/.test(base)) return;
    const tipo = serviceForm.tipoServicio;
    const next =
      tipo === 'MENSUAL' ? addDays(base, 30) :
      tipo === 'ANUAL'   ? addDays(base, 365) :
      base;
    setServiceForm((p) => ({ ...p, vencimiento: next || p.vencimiento }));
  }, [serviceForm.fecha, serviceForm.tipoServicio, vencimientoTouched]);

  // Si cambia el presupuesto adicional, recorto asignaciones a ese límite
  useEffect(() => {
    const budget = gsParse(extraBudgetStr);
    setAllocations(prev => trimAllocations(prev, pendingDebits, budget));
  }, [extraBudgetStr, pendingDebits]);

  // ===== Loads =====
  async function loadMembersAndLedgers() {
    setLoading(true);
    try {
      const response = await AuthClient.authenticatedFetch('/api/members');
      const data = await response.json();
      const list: Member[] = Array.isArray(data) ? data : [];
      setMembers(list);

      const CONCURRENCY = 6;
      const chunks: Member[][] = [];
      for (let i = 0; i < list.length; i += CONCURRENCY) chunks.push(list.slice(i, i + CONCURRENCY));
      const debtPairs: Array<[string, { saldo: number; estadoCalc: 'AL_DIA' | 'ATRASADO' | 'SUSPENDIDO' }]> = [];
      for (const batch of chunks) {
        const results = await Promise.all(
          batch.map(async (m) => {
            try {
              let res = await AuthClient.authenticatedFetch(`/api/members/${m.id}/movements?pageSize=1000`);
              if (!res.ok) res = await AuthClient.authenticatedFetch(`/api/movements?memberId=${encodeURIComponent(m.id)}`);
              const ct = res.headers.get('content-type') || '';
              if (!res.ok || !ct.includes('application/json')) throw new Error('fail');
              const raw = await res.json();
              const arr: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
              const movs: Movement[] = arr.map((mv: any, idx: number) => ({
                id: String(mv.id ?? `${m.id}-${idx}`),
                memberId: String(mv.memberId ?? m.id),
                fecha: mv.fecha ?? mv.date ?? new Date().toISOString(),
                concepto: String(mv.concepto ?? mv.description ?? ''),
                tipo: normalizeTipoMovimiento(mv.tipo ?? mv.type ?? ''),
                monto: Number(mv.monto ?? mv.amount ?? 0),
                origen: mv.origen ?? mv.source ?? undefined,
                refId: mv.refId ?? mv.referenceId ?? undefined,
                vencimiento: mv.vencimiento ?? mv.dueDate ?? undefined,
                paidAmount: Number(mv.paidAmount ?? 0),
              }));
              const debitos = movs.filter(x => normalizeTipoMovimiento(x.tipo as any) === 'DEBIT');
              const deudaReal = debitos.reduce((acc, d) => acc + Math.max(0, xround(d.monto) - xround(d.paidAmount || 0)), 0);
              const estadoCalc: 'AL_DIA' | 'ATRASADO' | 'SUSPENDIDO' =
                m.estado === 'SUSPENDIDO' ? 'SUSPENDIDO' : calcularEstadoPorVencimientos(movs);
              return [m.id, { saldo: deudaReal, estadoCalc }] as [string, { saldo: number; estadoCalc: 'AL_DIA' | 'ATRASADO' | 'SUSPENDIDO' }];
            } catch {
              const estadoCalc = m.estado === 'SUSPENDIDO' ? 'SUSPENDIDO' : (m.estado === 'ATRASADO' ? 'ATRASADO' : 'AL_DIA');
              return [m.id, { saldo: m.deudaTotal ?? 0, estadoCalc }] as [string, { saldo: number; estadoCalc: 'AL_DIA' | 'ATRASADO' | 'SUSPENDIDO' }];
            }
          })
        );
        debtPairs.push(...results);
      }
      const map: Record<string, { saldo: number; estadoCalc: 'AL_DIA' | 'ATRASADO' | 'SUSPENDIDO' }> = {};
      debtPairs.forEach(([id, val]) => (map[id] = val));
      setMemberDebtMap(map);
    } catch (e) {
      console.error('Error loading members/ledgers:', e);
      setMembers([]); setMemberDebtMap({});
    } finally { setLoading(false); }
  }

  async function loadCollectors() {
    try {
      const res = await AuthClient.authenticatedFetch('/api/collectors');
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setCollectors(list.filter((c: Collector) => c.activo !== false));
    } catch (e) {
      console.error('Error loading collectors:', e);
      setCollectors([]);
    }
  }

  async function loadServices() {
    try {
      const res = await AuthClient.authenticatedFetch('/api/services');
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setServices(list.filter((s: any) => s.activo !== false));
    } catch (e) {
      console.error('Error loading services:', e);
      setServices([]);
    }
  }

  async function loadPaymentMethods() {
    try {
      const res = await AuthClient.authenticatedFetch('/api/payment-methods');
      const data = await res.json();
      const list: PaymentMethod[] = Array.isArray(data) ? data : [];
      const actives = list.filter(pm => pm.activo !== false);
      setPaymentMethods(actives.length ? actives : defaultPaymentMethods());
      if (!actives.length) console.warn('payment-methods vacío, usando fallback.');
    } catch {
      setPaymentMethods(defaultPaymentMethods());
    }
  }
  function defaultPaymentMethods(): PaymentMethod[] {
    return [
      { id: 'efectivo', nombre: 'Efectivo' },
      { id: 'transferencia', nombre: 'Transferencia' },
      { id: 'tarjeta', nombre: 'Tarjeta' },
      { id: 'cheque', nombre: 'Cheque' },
    ];
  }

  async function loadVenues() {
    try {
      const res = await AuthClient.authenticatedFetch('/api/venues');
      const data = await res.json();
      setVenues(Array.isArray(data) ? data.filter(v => v.activo !== false) : []);
    } catch (error) {
      console.error('Error loading venues:', error);
      setVenues([]);
    }
  }

  // ===== Subscripciones helpers =====
  function periodDays(tipo: 'MENSUAL'|'ANUAL'|'UNICO'|'DIARIO'|undefined, dias?: number): number {
    switch (tipo) {
      case 'ANUAL': return 365;
      case 'MENSUAL': return 30;
      case 'DIARIO': return dias || 1;
      case 'UNICO': 
      default: return 0;
    }
  }
  function subDue(sub: any): string | undefined {
    return sub?.validUntil || sub?.nextDueDate || sub?.dueDate || sub?.vencimiento;
  }
  async function findActiveSubscription(memberId: string, serviceId: string) {
    try {
      let url = `/api/members/${encodeURIComponent(memberId)}/subscriptions?serviceId=${encodeURIComponent(serviceId)}&active=true`;
      let res = await AuthClient.authenticatedFetch(url);
      let data = await res.json().catch(()=>({}));
      let arr = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
      if (!arr.length) {
        // fallback: traer todas y filtrar por fecha
        res = await AuthClient.authenticatedFetch(`/api/members/${encodeURIComponent(memberId)}/subscriptions`);
        data = await res.json().catch(()=>({}));
        arr = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
        const today = new Date().toISOString().slice(0,10);
        arr = arr.filter((s: Subscription) => String(s.serviceId) === String(serviceId))
                 .filter((s: Subscription) => {
                   const v = subDue(s);
                   return !v || v >= today || s.active === true;
                 });
      }
      return arr[0] || null;
    } catch {
      return null;
    }
  }

  // ===== Abrir/Cerrar modal =====
  const handleOpenCobranzaModal = async (member: Member) => {
    setSelectedMemberForService(member);
    setShowChargeModal(true);
    setActiveTab('unified');
    setShowFormValidation(false);
    
    // Cargar débitos pendientes automáticamente si el socio tiene deudas
    if ((member.deudaTotal || 0) > 0 || (memberDebtMap[member.id]?.saldo || 0) > 0) {
      loadPendingDebits(member.id);
    }
    
    // Reseteamos el formulario unificado
    setUnifiedForm({
      condicion: 'CONTADO',
      fecha: getTodayParaguay(),
      servicioId: '',
      concepto: '',
      tipoServicio: 'MENSUAL',
      monto: '',
      dias: 1,
      vencimiento: addDays(getTodayParaguay(), 30),
      observaciones: '',
      crearSuscripcion: false,
      pagoAplicado: '',
      metodoPago: paymentMethods[0]?.id || 'efectivo',
      cobradorId: '',
      numeroRecibo: '',
      referencia: '',
      permitirPagosParc: false,
      presupuestoDeudas: '',
      // Garantizar que al abrir el modal haya siempre un concepto inicial visible
      conceptosContado: [ createEmptyConceptoWithDate() ],
      conceptosCredito: [ createEmptyConceptoWithDate() ],
    });
    setAllocations({});
    await loadPendingDebits(member.id);
  };

  const handleCloseCobranzaModal = () => {
    setShowChargeModal(false);
    setSelectedMemberForService(null);
    setActiveTab('unified');
    setPendingDebits([]);
    setAllocations({});
    setSelectedDebits([]); // Limpiar selección de débitos
    setShowDebtAssignment(false); // Cerrar desplegable
    setShowFormValidation(false); // Resetear validaciones
    
    // Reset formulario de pago de deudas
    setDebtPaymentForm({
      fecha: getTodayParaguay(),
      montoAPagar: '',
      metodoPago: '',
      cobradorId: '',
      numeroRecibo: '',
      referencia: '',
      observaciones: ''
    });
    
    // Resetear formulario unificado
    setUnifiedForm({
      condicion: 'CONTADO',
      fecha: getTodayParaguay(),
      servicioId: '',
      concepto: '',
      tipoServicio: 'MENSUAL',
      monto: '',
      dias: 1,
      vencimiento: addDays(getTodayParaguay(), 30),
      observaciones: '',
      crearSuscripcion: false,
      pagoAplicado: '',
      metodoPago: '',
      cobradorId: '',
      numeroRecibo: '',
      referencia: '',
      permitirPagosParc: false,
      presupuestoDeudas: '',
      conceptosContado: [ createEmptyConceptoWithDate() ],
      conceptosCredito: [ createEmptyConceptoWithDate() ],
    });
  };

  // ===== Modal de Reservas =====
  const handleOpenReservaModal = (conceptoId: string) => {
    setReservaConceptoId(conceptoId);
    
    // Buscar el concepto para ver si ya tiene datos de reserva y el servicio seleccionado
    const section = unifiedForm.condicion;
    const conceptos = section === 'CONTADO' ? unifiedForm.conceptosContado : unifiedForm.conceptosCredito;
    const concepto = conceptos?.find(c => c.id === conceptoId);
    
    // 🎯 NUEVA LÓGICA: Filtrar espacios según el servicio seleccionado
    let availableVenues: any[] = [];
    if (concepto?.servicioId) {
      const servicio = services.find(s => s.id === concepto.servicioId);
      if (servicio) {
        // 1. Si el servicio tiene espacios disponibles configurados (nueva estructura), usarlos
        if ((servicio as any).espaciosDisponibles && (servicio as any).espaciosDisponibles.length > 0) {
          availableVenues = (servicio as any).espaciosDisponibles.map((espacio: any) => ({
            id: espacio.id,
            nombre: espacio.nombre,
            descripcion: espacio.descripcion,
            activo: true,
            precioBaseHora: espacio.precioBaseHora,
            capacidad: espacio.capacidad
          }));
          console.log(`📍 Espacios (nuevos) para ${servicio.nombre}:`, availableVenues.map(v => v.nombre));
        }
        // 2. Si tiene espacios en estructura antigua, convertirlos
        else if ((servicio as any).espacios && (servicio as any).espacios.length > 0) {
          availableVenues = (servicio as any).espacios.map((nombreEspacio: string, index: number) => ({
            id: `${servicio.id}-espacio-${index}`,
            nombre: nombreEspacio,
            descripcion: `Espacio para ${servicio.nombre}`,
            activo: true,
            precioBaseHora: servicio.precio || 0,
            capacidad: 4
          }));
          console.log(`📍 Espacios (antiguos) para ${servicio.nombre}:`, availableVenues.map(v => v.nombre));
        }
        // 3. Si no tiene espacios configurados, crear uno virtual con el nombre del servicio
        else {
          availableVenues = [{
            id: `servicio-${servicio.id}`,
            nombre: servicio.nombre,
            descripcion: `Espacio para ${servicio.nombre}`,
            activo: true,
            precioBaseHora: servicio.precio || 0,
            capacidad: 1
          }];
          console.log(`📍 Espacio virtual para ${servicio.nombre}:`, servicio.nombre);
        }
      }
    }
    
    // Fallback: si no hay espacios disponibles, usar todos los venues globales
    if (availableVenues.length === 0) {
      availableVenues = venues;
      console.log('📍 Usando venues globales como fallback');
    }
    
    if (concepto && (concepto as any).reservaVenueId) {
      // Cargar datos existentes
      setReservaForm({
        venueId: (concepto as any).reservaVenueId || '',
        fecha: (concepto as any).reservaFecha || getTodayParaguay(),
        inicioHora: (concepto as any).reservaHoraInicio || '19:00',
        finHora: (concepto as any).reservaHoraFin || '23:00',
        observaciones: (concepto as any).reservaObservaciones || ''
      });
    } else {
      // Valores por defecto
      setReservaForm({
        venueId: availableVenues.length > 0 ? availableVenues[0].id : '',
        fecha: getTodayParaguay(),
        inicioHora: '19:00',
        finHora: '23:00',
        observaciones: ''
      });
    }
    
    // 🔄 Actualizar la lista de venues disponibles para este servicio específico
    setVenues(availableVenues);
    console.log(`🎯 Modal abierto para servicio: ${concepto?.servicioId} con ${availableVenues.length} espacio(s) disponible(s)`);
    setShowReservaModal(true);
  };

  const handleCloseReservaModal = () => {
    setShowReservaModal(false);
    setReservaConceptoId('');
    setReservaForm({
      venueId: '',
      fecha: getTodayParaguay(),
      inicioHora: '19:00',
      finHora: '23:00',
      observaciones: ''
    });
    
    // 🔄 Restaurar venues originales cuando se cierre el modal
    loadVenues();
  };

  // Función para validar disponibilidad de horario
  const validateReservaAvailability = async (venueId: string, fecha: string, inicioHora: string, finHora: string) => {
    try {
      // Crear fechas completas con hora para la validación
      const startDateTime = new Date(`${fecha}T${inicioHora}:00`);
      const endDateTime = new Date(`${fecha}T${finHora}:00`);
      
      // Buscar reservas existentes para el mismo salón y fecha
      console.log(`🔍 Validando disponibilidad para: venueId=${venueId}, fecha=${fecha}`);
      
      // Usar rango completo del día para evitar problemas de zona horaria
      const fechaInicio = `${fecha}T00:00:00.000Z`;
      const fechaFin = `${fecha}T23:59:59.999Z`;
      
      const apiUrl = `/api/reservas?resourceId=${venueId}&dateFrom=${fechaInicio}&dateTo=${fechaFin}`;
      console.log(`📡 URL de consulta: ${apiUrl}`);
      const response = await AuthClient.authenticatedFetch(apiUrl);
      
      if (!response.ok) {
        console.warn('No se pudo validar disponibilidad, status:', response.status);
        return { available: true }; // En caso de error, permitir la reserva
      }
      
      const existingReservations = await response.json();
      console.log(`📋 Reservas encontradas para ${venueId}:`, existingReservations);
      
      // Verificar conflictos de horario
      const conflicts = existingReservations.filter((res: any) => {
        // Solo considerar reservas activas
        if (res.status === 'CANCELADO') return false;
        
        const resStart = new Date(res.start);
        const resEnd = new Date(res.end);
        
        // Verificar si hay solapamiento de horarios
        return (
          (startDateTime >= resStart && startDateTime < resEnd) || // Inicio dentro de reserva existente
          (endDateTime > resStart && endDateTime <= resEnd) ||     // Fin dentro de reserva existente
          (startDateTime <= resStart && endDateTime >= resEnd)     // Nueva reserva engloba existente
        );
      });
      
      if (conflicts.length > 0) {
        const conflictDetails = conflicts.map((res: any) => {
          const start = new Date(res.start).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
          const end = new Date(res.end).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
          return `${start} - ${end} (${res.nombreContacto || 'Sin contacto'})`;
        }).join('\n');
        
        return {
          available: false,
          conflicts: conflicts,
          message: `El horario seleccionado tiene conflictos con reservas existentes:\n\n${conflictDetails}\n\nPor favor seleccione otro horario.`
        };
      }
      
      return { available: true };
      
    } catch (error) {
      console.error('Error validating availability:', error);
      return { available: true }; // En caso de error, permitir la reserva
    }
  };

  const handleSaveReserva = async () => {
    if (!reservaConceptoId || !reservaForm.venueId || !reservaForm.fecha) {
      alert('Por favor complete todos los campos requeridos');
      return;
    }

    // Validar disponibilidad del horario
    const validation = await validateReservaAvailability(
      reservaForm.venueId,
      reservaForm.fecha,
      reservaForm.inicioHora,
      reservaForm.finHora
    );
    
    if (!validation.available) {
      alert(`⚠️ Conflicto de horario\n\n${validation.message}\n\nPor favor seleccione otro horario o espacio.`);
      return;
    }

    try {
      // Actualizar el concepto con los datos de reserva
      const section = unifiedForm.condicion;
      const conceptos = section === 'CONTADO' ? unifiedForm.conceptosContado : unifiedForm.conceptosCredito;
      
      if (conceptos) {
        const concepto = conceptos.find(c => c.id === reservaConceptoId);
        if (concepto) {
          updateConceptoInSection(section, reservaConceptoId, 'reservaVenueId', reservaForm.venueId);
          updateConceptoInSection(section, reservaConceptoId, 'reservaFecha', reservaForm.fecha);
          updateConceptoInSection(section, reservaConceptoId, 'reservaHoraInicio', reservaForm.inicioHora);
          updateConceptoInSection(section, reservaConceptoId, 'reservaHoraFin', reservaForm.finHora);
          updateConceptoInSection(section, reservaConceptoId, 'reservaObservaciones', reservaForm.observaciones);
        }
      }

      handleCloseReservaModal();
      alert('Datos de reserva guardados. La reserva se creará al procesar el pago.');
    } catch (error) {
      console.error('Error saving reserva data:', error);
      alert('Error al guardar los datos de reserva');
    }
  };

  // ===== Deudas pendientes =====
  async function loadPendingDebits(memberId: string) {
    setLoadingDebits(true);
    try {
      // Intentar traer una página amplia de movimientos para evitar perder débitos por paginación
      let res = await AuthClient.authenticatedFetch(`/api/members/${memberId}/movements?type=DEBIT&pageSize=1000`);
      let ct = res.headers.get('content-type') || '';
      let raw = ct.includes('application/json') ? await res.json() : {};

      // Si la respuesta no contiene datos, intentar endpoint alternativo (fallback)
      let arr: any[] = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : [];
      if (!arr.length) {
        try {
          res = await AuthClient.authenticatedFetch(`/api/movements?memberId=${encodeURIComponent(memberId)}&type=DEBIT&pageSize=1000`);
          ct = res.headers.get('content-type') || '';
          raw = ct.includes('application/json') ? await res.json() : {};
          arr = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : [];
        } catch (fallbackErr) {
          // fallback failed silently, we'll handle below
          console.warn('Fallback fetch for pending debits failed', fallbackErr);
        }
      }
      const debs: Movement[] = arr.map((m: any) => ({
        id: String(m.id),
        memberId: String(m.memberId),
        fecha: m.fecha,
        concepto: m.concepto,
        tipo: 'DEBIT' as MovementType,
        monto: Number(m.monto || 0),
        vencimiento: m.vencimiento,
        paidAmount: Number(m.paidAmount || 0),
        observaciones: m.observaciones || '',
      })).filter(d => (d.paidAmount || 0) < (d.monto || 0));
      // Ordenar por fecha de vencimiento (los que vencen primero aparecen arriba)
      debs.sort((a, b) => {
        const av = a.vencimiento ? new Date(a.vencimiento).getTime() : Infinity;
        const bv = b.vencimiento ? new Date(b.vencimiento).getTime() : Infinity;
        if (av !== bv) return av - bv; // Orden por vencimiento primero
        // Si tienen el mismo vencimiento, ordenar por fecha de creación
        const af = new Date(a.fecha).getTime(); 
        const bf = new Date(b.fecha).getTime();
        return af - bf;
      });
      setPendingDebits(debs);
    } catch (e) {
      console.error('Error loading pending debits:', e);
      setPendingDebits([]);
    } finally { setLoadingDebits(false); }
  }

  // ===== Pago: items =====
  function addPayItem() {
    const vencimientoDefault = addDays(paymentForm.fecha, 30); // Default mensual
    setPayItems(prev => [...prev, { 
      id: cryptoRandom(), 
      servicioId: '', 
      concepto: '', 
      tipoServicio: 'MENSUAL', 
      montoStr: '',
      vencimiento: vencimientoDefault
    }]);
  }
  function removePayItem(id: string) {
    setPayItems(prev => prev.filter(it => it.id !== id));
  }

  async function onSelectServiceForItem(idx: number, servicioId: string) {
    const srv = services.find(s => s.id === servicioId);
    if (!srv) return;

    const tipo = (srv?.tipo || 'MENSUAL') as 'MENSUAL' | 'ANUAL' | 'UNICO' | 'DIARIO';
    const concepto = srv?.nombre || '';

    // Calcular precio según tipo de socio usando las nuevas utilidades
    let precioCalculado: number;
    try {
      precioCalculado = getPrecioSegunTipoMiembro(srv, selectedMemberForService || undefined, false);
    } catch (error) {
      console.warn('Error al calcular precio:', error);
      precioCalculado = srv.precio; // Fallback al precio base
    }
    
    const montoStr = gsFormat(precioCalculado.toString());

    let subId: string | undefined;
    let currentDue: string | undefined;
    let nextDue: string | undefined;
    let vencimiento: string;
    let dias: number | undefined;

    // Calcular vencimiento inicial según el tipo
    switch (tipo) {
      case 'MENSUAL':
        vencimiento = addDays(paymentForm.fecha, 30);
        break;
      case 'ANUAL':
        vencimiento = addDays(paymentForm.fecha, 365);
        break;
      case 'DIARIO':
        dias = 1;
        vencimiento = addDays(paymentForm.fecha, 1);
        break;
      case 'UNICO':
      default:
        vencimiento = paymentForm.fecha;
        break;
    }

    if (selectedMemberForService && servicioId && tipo !== 'UNICO') {
      const sub = await findActiveSubscription(selectedMemberForService.id, servicioId);
      if (sub) {
        subId = String(sub.id);
        currentDue = subDue(sub);
        const days = periodDays(tipo, dias);
        nextDue = currentDue ? addDays(currentDue, days) : addDays(paymentForm.fecha, days);
        
        // Para suscripciones existentes, mantener el patrón de vencimiento
        if (currentDue) {
          vencimiento = addDays(currentDue, days);
        }
      } else {
        nextDue = vencimiento;
      }
    }

    setPayItems(prev => prev.map((it,i) => i === idx ? {
      ...it, servicioId, concepto, tipoServicio: tipo, montoStr, subId, currentDue, nextDue, vencimiento, dias
    } : it));
  }

  function setItemAmount(idx: number, raw: string) {
    const pretty = gsFormat(raw);
    setPayItems(prev => prev.map((it,i) => i===idx ? ({ ...it, montoStr: pretty }) : it));
  }

  // Nuevas funciones para manejo de tipo DIARIO y vencimientos
  function onChangeTipoServicio(idx: number, nuevoTipo: ServiceType) {
    setPayItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      
      const fechaPago = new Date(paymentForm.fecha);
      let nuevoVencimiento: string;
      let nuevasDias: number | undefined = it.dias;
      
      // Calcular vencimiento según el nuevo tipo
      switch (nuevoTipo) {
        case 'MENSUAL':
          nuevoVencimiento = addDays(paymentForm.fecha, 30);
          nuevasDias = undefined;
          break;
        case 'ANUAL':
          nuevoVencimiento = addDays(paymentForm.fecha, 365);
          nuevasDias = undefined;
          break;
        case 'DIARIO':
          nuevasDias = it.dias || 1;
          nuevoVencimiento = addDays(paymentForm.fecha, nuevasDias);
          break;
        case 'UNICO':
        default:
          nuevoVencimiento = paymentForm.fecha;
          nuevasDias = undefined;
          break;
      }

      // Recalcular precio si el servicio tiene el mismo tipo
      let nuevoMontoStr = it.montoStr;
      if (it.servicioId) {
        const srv = services.find(s => s.id === it.servicioId);
        if (srv && srv.tipo === nuevoTipo) {
          // Solo recalcular si el tipo coincide con el tipo nativo del servicio
          try {
            const precioCalculado = getPrecioSegunTipoMiembro(srv, selectedMemberForService || undefined, false);
            nuevoMontoStr = gsFormat(precioCalculado.toString());
          } catch (error) {
            // Mantener el precio actual si hay error
            console.warn('Error al recalcular precio:', error);
          }
        }
      }
      
      return {
        ...it,
        tipoServicio: nuevoTipo,
        vencimiento: nuevoVencimiento,
        dias: nuevasDias,
        montoStr: nuevoMontoStr
      };
    }));
  }

  function onChangeDias(idx: number, dias: number) {
    const diasValidos = Math.max(1, dias);
    setPayItems(prev => prev.map((it, i) => {
      if (i !== idx || it.tipoServicio !== 'DIARIO') return it;
      
      const nuevoVencimiento = addDays(paymentForm.fecha, diasValidos);
      
      return {
        ...it,
        dias: diasValidos,
        vencimiento: nuevoVencimiento
      };
    }));
  }

  function onChangeVencimiento(idx: number, vencimiento: string) {
    setPayItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      
      let nuevasDias = it.dias;
      
      // Si es tipo DIARIO, recalcular días
      if (it.tipoServicio === 'DIARIO' && vencimiento) {
        const fechaPago = new Date(paymentForm.fecha);
        const fechaVencimiento = new Date(vencimiento);
        const diffTime = fechaVencimiento.getTime() - fechaPago.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        nuevasDias = Math.max(1, diffDays);
      }
      
      return {
        ...it,
        vencimiento,
        dias: nuevasDias
      };
    }));
  }

  // Sumas
  const sumConcepts = useMemo(() =>
    payItems.reduce((acc, it) => acc + gsParse(it.montoStr), 0),
  [payItems]);

  const allocatedExisting = useMemo(
    () => Object.values(allocations).reduce((acc, v) => acc + nSafe(v), 0),
    [allocations]
  );

  const extraBudget = useMemo(() => gsParse(extraBudgetStr), [extraBudgetStr]);
  const remainingBudget = Math.max(0, extraBudget - allocatedExisting);

  const totalToPay = useMemo(() => sumConcepts + allocatedExisting, [sumConcepts, allocatedExisting]);

  function fillFull(debit: Movement) {
    const pend = Math.max(0, xround(debit.monto) - xround(debit.paidAmount || 0));
    const can = Math.min(pend, remainingBudget);
    setAllocations(prev => ({ ...prev, [debit.id]: can ? String(can) : '' }));
  }

  function autoDistribute() {
    let left = extraBudget;
    const next: Record<string, string> = {};
    for (const d of pendingDebits) {
      const pend = Math.max(0, xround(d.monto) - xround(d.paidAmount || 0));
      const take = Math.min(pend, left);
      if (take > 0) {
        next[d.id] = String(take);
        left -= take;
        if (left <= 0) break;
      }
    }
    setAllocations(next);
  }

  function setAllocation(debitId: string, value: string, maxPend: number) {
    const parsedValue = gsParse(value); // Usar gsParse para manejar formato con separadores
    const v = Math.max(0, Math.min(parsedValue, maxPend));
    const others = Object.entries(allocations).reduce((acc,[id,val]) => acc + (id===debitId?0:nSafe(val)), 0);
    const room = Math.max(0, extraBudget - others);
    const final = Math.min(v, room);
    setAllocations(prev => ({ ...prev, [debitId]: final ? String(final) : '' }));
  }

  // Obtener servicios disponibles para un ítem específico (excluyendo los ya seleccionados)
  function getAvailableServices(currentIdx: number) {
    const selectedServiceIds = payItems
      .map((item, idx) => idx !== currentIdx ? item.servicioId : '') // Excluir el ítem actual
      .filter(id => id !== ''); // Remover vacíos
    
    return services.filter(service => !selectedServiceIds.includes(service.id));
  }
  async function handleSubmitCharge() {
    if (!selectedMemberForService) return;

    if (!paymentForm.metodoPago) {
      alert('Elegí un método de pago.');
      return;
    }
    if (sumConcepts <= 0 && allocatedExisting <= 0) {
      alert('Agregá al menos un concepto o asigná pagos a deudas.');
      return;
    }

    setSaving(true);
    try {
      const newDebitAllocations: Array<{ debitId: string; amount: number }> = [];

      for (const it of payItems) {
        const amount = gsParse(it.montoStr);
        if (!it.servicioId || !amount) continue;

        const srv = services.find(s => s.id === it.servicioId);
        const tipo = (srv?.tipo || 'MENSUAL') as 'MENSUAL'|'ANUAL'|'UNICO';
        const concepto = srv?.nombre || it.concepto || 'Servicio';
        const days = periodDays(tipo);

        let nextDue = it.nextDue;
        let subId = it.subId;

        if (selectedMemberForService && tipo !== 'UNICO') {
          if (!subId) {
            const subRes = await AuthClient.authenticatedFetch(
              `/api/members/${encodeURIComponent(selectedMemberForService.id)}/subscriptions`,
              {
                method: 'POST',
                body: JSON.stringify({
                  serviceId: String(it.servicioId),
                  periodicity: tipo,
                  price: amount,
                  autoDebit: false,
                  notes: `Creado desde Cobrar el ${paymentForm.fecha}`,
                  validUntil: nextDue || addDays(paymentForm.fecha, days),
                }),
              }
            );
            const subJson = await subRes.json().catch(()=>({}));
            if (!subRes.ok) throw new Error(subJson?.msg || 'No se pudo crear la suscripción');
            subId = String(subJson.id || subJson?.subscription?.id || '');
          } else {
            if (nextDue) {
              await AuthClient.authenticatedFetch(
                `/api/members/${encodeURIComponent(selectedMemberForService.id)}/subscriptions/${encodeURIComponent(subId)}`,
                {
                  method: 'PATCH',
                  body: JSON.stringify({
                    validUntil: nextDue,
                    price: amount,
                  }),
                }
              ).catch(()=>{});
            }
          }
        }

        const debitRes = await AuthClient.authenticatedFetch('/api/movements', {
          method: 'POST',
          body: JSON.stringify({
            memberId: selectedMemberForService.id,
            fecha: paymentForm.fecha,
            concepto: `${concepto}${tipo !== 'UNICO' ? ` (${tipo})` : ''}`,
            tipo: 'DEBIT',
            monto: Number(amount),
            origen: 'SERVICIO',
            refId: it.servicioId,
            observaciones: `Cobro contado - ${paymentForm.metodoPago}`,
            vencimiento: tipo === 'UNICO' ? paymentForm.fecha : (nextDue || addDays(paymentForm.fecha, days)),
          }),
        });
        const debitJson = await debitRes.json().catch(()=>({}));
        if (!debitRes.ok) throw new Error(debitJson?.msg || 'No se pudo crear el débito del servicio');
        const newDebitId = String(debitJson.id ?? debitJson?.movement?.id ?? '');
        newDebitAllocations.push({ debitId: newDebitId, amount: amount });
      }

      const existingAllocations = Object.entries(allocations)
        .map(([debitId, val]) => ({ debitId, amount: nSafe(val) }))
        .filter(x => x.amount > 0);

      const payAmount = newDebitAllocations.reduce((a,b)=>a+b.amount,0) + existingAllocations.reduce((a,b)=>a+b.amount,0);

      const payRes = await AuthClient.authenticatedFetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          memberId: selectedMemberForService.id,
          fecha: paymentForm.fecha,
          monto: payAmount,
          concepto: 'Pago contado de servicios',
          formaPago: paymentForm.metodoPago,
          cobradorId: paymentForm.cobradorId || undefined,
          numeroRecibo: paymentForm.numeroRecibo || undefined,
          observaciones: paymentForm.observaciones || '',
          allocations: [...newDebitAllocations, ...existingAllocations],
        }),
      });
      const payJson = await payRes.json().catch(()=>({}));
      if (!payRes.ok) throw new Error(payJson?.msg || 'No se pudo registrar el pago');

      await loadMembersAndLedgers();
      handleCloseCobranzaModal();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Error al procesar la operación');
    } finally {
      setSaving(false);
    }
  }

  // ===== Guardar (crear sólo servicio) — Tab Servicio =====
  async function handleSaveServiceOnly() {
    if (!selectedMemberForService) return;
    const selected = services.find((s) => s.id === serviceForm.servicioId);
    const conceptoBase = selected?.nombre || serviceForm.concepto.trim();
    if (!serviceForm.fecha || !conceptoBase || !serviceForm.monto) {
      alert('Completa Fecha, Servicio/Concepto y Monto.');
      return;
    }
    if (!serviceForm.vencimiento) {
      alert('Seleccioná una fecha de vencimiento.');
      return;
    }
    const willSubscribe = serviceForm.makeSubscription && serviceForm.tipoServicio !== 'UNICO';
    const concepto = `${conceptoBase} (${serviceForm.tipoServicio})`;

    setSaving(true);
    try {
      const res = await AuthClient.authenticatedFetch('/api/movements', {
        method: 'POST',
        body: JSON.stringify({
          memberId: selectedMemberForService.id,
          fecha: serviceForm.fecha,
          concepto,
          tipo: 'DEBIT',
          monto: Number(serviceForm.monto),
          origen: 'SERVICIO',
          refId: selected?.id || undefined,
          observaciones: serviceForm.observaciones || '',
          vencimiento: serviceForm.vencimiento,
        }),
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data?.msg || 'No se pudo registrar el servicio');

      if (willSubscribe) {
        const svcId = selected?.id || `custom:${conceptoBase}`;
        await AuthClient.authenticatedFetch(
          `/api/members/${encodeURIComponent(selectedMemberForService.id)}/subscriptions`,
          {
            method: 'POST',
            body: JSON.stringify({
              serviceId: String(svcId),
              periodicity: serviceForm.tipoServicio,
              price: Number(serviceForm.monto),
              autoDebit: serviceForm.autoDebit !== false,
              notes: serviceForm.observaciones || '',
              validUntil: serviceForm.vencimiento,
            }),
          }
        );
      }

      await loadMembersAndLedgers();
      handleCloseCobranzaModal();
    } catch (e:any) {
      console.error(e);
      alert(e?.message || 'Error registrando el servicio');
    } finally {
      setSaving(false);
    }
  }

  // ===== Borrar socio =====
  async function handleDelete(memberId: string) {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;
    
    // Primera confirmación
    const confirmDelete = window.confirm(
      `¿Eliminar al socio ${member.nombres} ${member.apellidos}? Esta acción no se puede deshacer.`
    );
    if (!confirmDelete) return;
    
    try {
      const response = await AuthClient.authenticatedFetch(`/api/members/${memberId}`, { method: 'DELETE' });
      const data = await response.json();
      console.log('Delete response:', { status: response.status, data });
      
      if (response.ok) {
        setDeleteMsg('Socio eliminado correctamente');
        await loadMembersAndLedgers();
        setTimeout(() => setDeleteMsg(''), 3000);
      } else {
        console.error('Delete error:', data);
        
        // Si tiene deudas pendientes, mostrar confirmación adicional
        if (data.hasPendingDebts) {
          const confirmWithDebts = window.confirm(
            `ADVERTENCIA: ${member.nombres} ${member.apellidos} tiene ${data.pendingCount} deuda(s) pendiente(s) por un total de Gs. ${data.totalDebt.toLocaleString()}.\n\n¿Está SEGURO que desea eliminar este socio? Esta acción eliminará al socio y TODAS sus deudas pendientes de forma PERMANENTE.`
          );
          
          if (confirmWithDebts) {
            // Hacer llamada con parámetro de forzar eliminación
            const forceResponse = await AuthClient.authenticatedFetch(`/api/members/${memberId}?force=true`, { method: 'DELETE' });
            const forceData = await forceResponse.json();
            
            if (forceResponse.ok) {
              setDeleteMsg('Socio y sus deudas eliminados correctamente');
              await loadMembersAndLedgers();
              setTimeout(() => setDeleteMsg(''), 3000);
            } else {
              setDeleteMsg(forceData.msg || 'Error al eliminar socio forzadamente');
              setTimeout(() => setDeleteMsg(''), 8000);
            }
          }
        } else {
          // Otros tipos de error
          setDeleteMsg(data.msg || 'Error al eliminar socio');
          setTimeout(() => setDeleteMsg(''), 8000);
        }
      }
    } catch (error) {
      console.error('Delete exception:', error);
      setDeleteMsg('Error de conexión al eliminar socio');
      setTimeout(() => setDeleteMsg(''), 5000);
    }
  }

  // ===== Crear no-socio y abrir modal de cobro =====
  async function handleCreateNoSocio() {
    try {
      // Validar campos requeridos
      if (!noSocioForm.nombres.trim() || !noSocioForm.apellidos.trim()) {
        alert('Nombres y apellidos son obligatorios');
        return;
      }

      // Validar CI duplicado si se proporciona
      if (noSocioForm.ci.trim()) {
        const existingMember = members.find(member => 
          member.ci && member.ci.trim().toLowerCase() === noSocioForm.ci.trim().toLowerCase()
        );
        
        if (existingMember) {
          const memberType = existingMember.subcategoria === 'NO SOCIO' ? 'no-socio' : 'socio';
          setCiValidationError(`Ya existe un ${memberType} registrado con la CI ${noSocioForm.ci}: ${existingMember.nombres} ${existingMember.apellidos} (Código: ${existingMember.codigo})`);
          return;
        }
      }

      // Limpiar error de validación
      setCiValidationError('');

      // Generar código único para no-socio
      const timestamp = Date.now();
      const codigo = `NS${timestamp.toString().slice(-6)}`;

      // Crear el miembro no-socio
      const newMember = {
        codigo,
        nombres: noSocioForm.nombres.trim(),
        apellidos: noSocioForm.apellidos.trim(),
        ci: noSocioForm.ci.trim() || '',
        telefono: noSocioForm.telefono.trim() || '',
        email: noSocioForm.email.trim() || '',
        categoria: 'CLIENTE',
        subcategoria: 'NO SOCIO',
        estado: 'ACTIVO',
        alta: getTodayParaguay(),
        ruc: ''
      };

      const response = await AuthClient.authenticatedFetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMember)
      });

      const data = await response.json();
      if (response.ok) {
        // Actualizar lista de miembros
        await loadMembersAndLedgers();
        
        // Buscar el miembro recién creado
        const createdMember = data.member;
        
        // Limpiar form y cerrar modal
        setNoSocioForm({
          nombres: '',
          apellidos: '',
          ci: '',
          telefono: '',
          email: ''
        });
        setCiValidationError('');
        closeNoSocioModal();
        
        // Abrir modal de cobro con el nuevo no-socio
        setSelectedMemberForService(createdMember);
        setActiveTab('unified');
        setShowChargeModal(true);
        
      } else {
        alert(data.msg || 'Error al crear no-socio');
      }
    } catch (error) {
      console.error('Error creating no-socio:', error);
      alert('Error de conexión al crear no-socio');
    }
  }

  // ===== Convertir no-socio a socio =====
  async function handleConvertToSocio(memberId: string) {
    const member = members.find(m => m.id === memberId);
    if (!member) return;

    const confirmConvert = window.confirm(
      `¿Convertir a ${member.nombres} ${member.apellidos} de no-socio a socio? Se le asignará un nuevo número de socio.`
    );
    if (!confirmConvert) return;

    try {
      const response = await AuthClient.authenticatedFetch(`/api/members/${memberId}/convert-to-socio`, {
        method: 'POST'
      });

      const data = await response.json();
      if (response.ok) {
        alert(`✅ ${data.message}`);
        await loadMembersAndLedgers(); // Recargar la lista
      } else {
        alert(data.error || 'Error al convertir no-socio a socio');
      }
    } catch (error) {
      console.error('Error converting no-socio to socio:', error);
      alert('Error de conexión al convertir no-socio a socio');
    }
  }

  // ===== Estadísticas y filtros =====
  const stats = useMemo(() => {
    let alDia = 0, atrasados = 0;
    members.forEach((m) => {
      const calc = memberDebtMap[m.id]?.estadoCalc ?? m.estado;
      if (calc === 'ATRASADO') atrasados++; else if (calc === 'AL_DIA') alDia++;
    });
    return { total: members.length, alDia, atrasados };
  }, [members, memberDebtMap]);

  const filteredMembers = useMemo(() => {
    const text = searchTerm.toLowerCase();
    return members.filter((member) => {
      const matchesSearch =
        member.nombres.toLowerCase().includes(text) ||
        member.apellidos.toLowerCase().includes(text) ||
        member.codigo.toLowerCase().includes(text) ||
        member.ci.includes(searchTerm) ||
        (member.email && member.email.toLowerCase().includes(text));

      const estadoCalc = memberDebtMap[member.id]?.estadoCalc ?? (member.estado as any);
      const matchesCategoria = !filterCategoria || member.categoria === filterCategoria;
      const matchesEstado = !filterEstado || estadoCalc === filterEstado;
      const matchesSubcategoria = !filterSubcategoria || member.subcategoria === filterSubcategoria;

      return matchesSearch && matchesCategoria && matchesEstado && matchesSubcategoria;
    });
  }, [members, memberDebtMap, searchTerm, filterCategoria, filterEstado, filterSubcategoria]);

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const start = (pageSafe - 1) * pageSize;
  const end = start + pageSize;
  const pageMembers = filteredMembers.slice(start, end);

  const exportToExcel = async () => {
    try {
      const response = await AuthClient.authenticatedFetch('/api/members/export?format=excel');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `socios-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
    }
  };

  const EstadoBadge = ({ estado }: { estado: string }) => {
    const getVariant = () => {
      switch (estado) {
        case 'AL_DIA': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'ATRASADO': return 'bg-amber-50 text-amber-700 border-amber-200';
        case 'SUSPENDIDO': return 'bg-rose-50 text-rose-700 border-rose-200';
        default: return 'bg-gray-50 text-gray-700 border-gray-200';
      }
    };
    const label =
      estado === 'AL_DIA' ? 'Al Día' :
      estado === 'ATRASADO' ? 'Atrasado' :
      estado === 'SUSPENDIDO' ? 'Suspendido' : estado;
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getVariant()}`}>
        {label}
      </span>
    );
  };

  function openFloatingMenu(memberId: string, e: React.MouseEvent<HTMLButtonElement>) {
    // Toggle: si el menú ya está abierto para este miembro, cerrarlo
    if (openMenuMemberId === memberId) {
      setOpenMenuMemberId(null);
      return;
    }

    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
    
    // Posición simple: pegado al botón
    // X: A la izquierda del botón, pegado
    const xPos = rect.left - 200; // 200px es el ancho del menú (w-48 + margen)
    
    // Y: Justo al nivel del botón (no debajo ni arriba)
    const yPos = rect.top;

    setMenuPos({ x: xPos, y: yPos });
    actionsBtnRef.current = e.currentTarget;
    setOpenMenuMemberId(memberId);
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
        </div>
      </AdminLayout>
    );
  }

  // Validación inteligente del formulario unificado
  const isUnifiedFormValid = () => {
    // Validaciones básicas comunes
    if (!unifiedForm.fecha) return false;

    // Determinar conceptos de la sección activa
    const usingContado = unifiedForm.condicion === 'CONTADO';
    const conceptos = usingContado ? (unifiedForm.conceptosContado || []) : (unifiedForm.conceptosCredito || []);

    // Debe existir al menos un concepto válido
    if (!conceptos || conceptos.length === 0) return false;

    // Validar cada concepto: servicio y monto numérico > 0
    if (conceptos.length > 0) {
      for (const c of conceptos) {
        if (!c.servicioId) return false;
        const m = parseFloat(getNumericValueSafe(c.monto));
        if (isNaN(m) || m <= 0) return false;
        if (c.tipoServicio === 'DIARIO' && (!c.dias || c.dias <= 0)) return false;
      }
      // Validar duplicados
      if (hasDuplicateService(conceptos)) return false;
    }

    // Validaciones específicas por condición
    if (unifiedForm.condicion === 'CONTADO') {
      // CONTADO requiere método de pago
      if (!unifiedForm.metodoPago) return false;
    } else if (unifiedForm.condicion === 'CREDITO') {
      // CREDITO con pago parcial requiere validaciones adicionales
      if (unifiedForm.permitirPagosParc) {
        if (!unifiedForm.pagoAplicado) return false; // Si permite pago parcial, debe tener monto
        const pagoAplicado = parseFloat(getNumericValue(unifiedForm.pagoAplicado));
        if (isNaN(pagoAplicado) || pagoAplicado <= 0) return false;
        // calcular total actual
        const total = calculateTotal(unifiedForm.conceptosCredito) || parseFloat(getNumericValue(unifiedForm.monto || '0'));
        if (pagoAplicado > total) return false; // Pago parcial no puede superar el monto total
        if (!unifiedForm.metodoPago) return false; // Pago parcial requiere método de pago
      }
    }

    return true;
  };

  // Función unificada para manejar pagos al contado
  const handleUnifiedContadoPayment = async () => {
    setShowFormValidation(true);
    if (!selectedMemberForService || !isUnifiedFormValid()) return;

    setSaving(true);
    try {
      // Multi-concept flow: crear un débito por cada concepto y luego un pago que asigne los montos
      const conceptos = unifiedForm.conceptosContado || [];

      const createdDebits: { id: string; amount: number; conceptoName: string }[] = [];

      for (const c of conceptos) {
        const montoNum = parseFloat(getNumericValueSafe(c.monto));
        const tipo = c.tipoServicio;
        const days = tipo === 'ANUAL' ? 365 : tipo === 'MENSUAL' ? 30 : (c.dias || 1);

  // Crear suscripción por concepto si aplica (por-concepto o flag global)
  if ((c.crearSuscripcion || unifiedForm.crearSuscripcion) && tipo !== 'UNICO') {
          const subRes = await AuthClient.authenticatedFetch(
            `/api/members/${encodeURIComponent(selectedMemberForService.id)}/subscriptions`,
            {
              method: 'POST',
              body: JSON.stringify({
                serviceId: c.servicioId,
                periodicity: tipo,
                price: montoNum,
                autoDebit: false,
                notes: `Creado desde formulario unificado el ${unifiedForm.fecha}`,
                validUntil: c.vencimiento || addDays(unifiedForm.fecha, days),
              }),
            }
          );
          const subJson = await subRes.json().catch(() => ({}));
          if (!subRes.ok) throw new Error(subJson?.msg || 'No se pudo crear la suscripción');
        }

        // Crear débito por concepto
        const debitRes = await AuthClient.authenticatedFetch('/api/movements', {
          method: 'POST',
          body: JSON.stringify({
            memberId: selectedMemberForService.id,
            fecha: unifiedForm.fecha,
            concepto: `${c.concepto || 'Servicio'}${tipo !== 'UNICO' ? ` (${tipo})` : ''}`,
            tipo: 'DEBIT',
            monto: Number(montoNum),
            origen: 'SERVICIO',
            refId: c.servicioId,
            observaciones: c.observaciones || unifiedForm.observaciones || `Pago contado - ${unifiedForm.metodoPago}`,
            vencimiento: tipo === 'UNICO' ? unifiedForm.fecha : (c.vencimiento || addDays(unifiedForm.fecha, days)),
          }),
        });
        const debitJson = await debitRes.json().catch(() => ({}));
        if (!debitRes.ok) throw new Error(debitJson?.msg || 'No se pudo crear el débito del servicio');
        const newDebitId = String(debitJson.id ?? debitJson?.movement?.id ?? '');
        createdDebits.push({ id: newDebitId, amount: montoNum, conceptoName: c.concepto || 'Servicio' });
      }

      // Crear un pago que asigne a cada débito creado
      const totalAmount = createdDebits.reduce((s, d) => s + d.amount, 0);
      const allocations = createdDebits.map(d => ({ debitId: d.id, amount: d.amount }));

      const payRes = await AuthClient.authenticatedFetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          memberId: selectedMemberForService.id,
          fecha: unifiedForm.fecha,
          monto: totalAmount,
          concepto: `Pago contado: ${createdDebits.map(d => d.conceptoName).join(', ')}`,
          formaPago: unifiedForm.metodoPago,
          cobradorId: unifiedForm.cobradorId || undefined,
          numeroRecibo: unifiedForm.numeroRecibo || undefined,
          observaciones: unifiedForm.observaciones || '',
          allocations,
        }),
      });
      const payJson = await payRes.json().catch(() => ({}));
      if (!payRes.ok) throw new Error(payJson?.msg || 'No se pudo crear el pago');
      const paymentId = String(payJson.id ?? payJson?.payment?.id ?? '');

      // Asignación a deudas pendientes si hay presupuesto
      if (unifiedForm.presupuestoDeudas && parseFloat(getNumericValue(unifiedForm.presupuestoDeudas)) > 0) {
        const presupuesto = parseFloat(getNumericValue(unifiedForm.presupuestoDeudas));
        
        // Crear pago adicional para deudas
        const debtPayRes = await AuthClient.authenticatedFetch('/api/payments', {
          method: 'POST',
          body: JSON.stringify({
            memberId: selectedMemberForService.id,
            fecha: unifiedForm.fecha,
            monto: presupuesto,
            concepto: `Pago de deudas pendientes - ${createdDebits && createdDebits.length ? createdDebits.map(d => d.conceptoName).join(', ') : (unifiedForm.concepto || '')}`,
            formaPago: unifiedForm.metodoPago,
            cobradorId: unifiedForm.cobradorId || '',
            numeroRecibo: unifiedForm.numeroRecibo || '',
            observaciones: `Asignación automática a deudas pendientes. ${unifiedForm.observaciones || ''}`.trim(),
            // El sistema asignará automáticamente a los débitos más antiguos
          }),
        });
        const debtPayJson = await debtPayRes.json().catch(() => ({}));
        if (!debtPayRes.ok) {
          console.warn('No se pudo procesar el pago de deudas:', debtPayJson?.msg);
          // No fallar completamente, el pago principal ya se registró
        }
      }

      // Crear reservas si hay datos de reserva en los conceptos
      const reservasCreadas: string[] = [];
      for (const c of conceptos) {
        if (c.reservaVenueId && c.reservaFecha) {
          try {
            const startDateTime = new Date(`${c.reservaFecha}T${c.reservaHoraInicio || '19:00'}:00`);
            const endDateTime = new Date(`${c.reservaFecha}T${c.reservaHoraFin || '23:00'}:00`);
            
            const reservaData = {
              resourceId: c.reservaVenueId,
              memberId: selectedMemberForService.id,
              start: startDateTime.toISOString(),
              end: endDateTime.toISOString(),
              nombreContacto: `${selectedMemberForService.nombres} ${selectedMemberForService.apellidos}`,
              contacto: (selectedMemberForService as any).celular || selectedMemberForService.telefono || '',
              medioContacto: (selectedMemberForService as any).celular ? 'whatsapp' : 'telefono',
              invitados: 0,
              adelanto: 0,
              montoTotal: parseFloat(getNumericValueSafe(c.monto)),
              status: 'ACTIVO',
              notas: c.reservaObservaciones || c.observaciones || '',
              createdBy: 'system',
              // 🔗 CRÍTICO: Vincular la reserva al débito creado
              debitMovementId: createdDebits.find(d => d.conceptoName === (c.concepto || 'Servicio'))?.id
            };
            
            const reservaRes = await AuthClient.authenticatedFetch('/api/reservas', {
              method: 'POST',
              body: JSON.stringify(reservaData),
            });
            
            if (reservaRes.ok) {
              const reservaJson = await reservaRes.json();
              reservasCreadas.push(`${c.concepto || 'Reserva'} (${c.reservaFecha})`);
            } else {
              const errorResponse = await reservaRes.text();
              let errorMsg = errorResponse;
              try {
                const errorJson = JSON.parse(errorResponse);
                errorMsg = errorJson.msg || errorResponse;
              } catch (e) {
                // Si no es JSON válido, usar el texto tal como está
              }
              console.error(`❌ No se pudo crear la reserva para ${c.concepto}:`, errorMsg);
              alert(`⚠️ Error procesando reserva\n\nNo se pudo crear la reserva para "${c.concepto}".\n\n${errorMsg}\n\nEl pago no se procesará. Por favor verifique la disponibilidad del horario.`);
              return; // Detener el proceso para evitar pago sin reserva
            }
          } catch (error) {
            console.error(`Error creando reserva para ${c.concepto}:`, error);
            alert(`⚠️ Error inesperado\n\nError creando reserva para "${c.concepto}": ${error}\n\nEl pago no se procesará.`);
            return;
          }
        }
      }

      const debtAssignmentMsg = unifiedForm.presupuestoDeudas && parseFloat(getNumericValue(unifiedForm.presupuestoDeudas)) > 0
        ? ` y se asignaron Gs. ${parseInt(getNumericValue(unifiedForm.presupuestoDeudas)).toLocaleString('es-PY')} a deudas pendientes`
        : '';
      
      const reservaMsg = reservasCreadas.length > 0 
        ? `\n\n🎯 Reservas creadas:\n${reservasCreadas.join('\n')}` 
        : '';
      
      alert(`✅ Pago al contado registrado exitosamente${debtAssignmentMsg}${reservaMsg}`);
      handleCloseCobranzaModal();
      await loadMembersAndLedgers();
    } catch (error) {
      console.error('Error al procesar pago contado:', error);
      alert(`❌ Error: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setSaving(false);
    }
  };

  // Función unificada para manejar servicios a crédito
  const handleUnifiedCreditoService = async () => {
    setShowFormValidation(true);
    if (!selectedMemberForService || !isUnifiedFormValid()) return;

    setSaving(true);
    try {
      // Multi-concept flow para crédito: crear débitos por cada concepto
      const conceptos = unifiedForm.conceptosCredito || [];

      const createdDebits: { id: string; amount: number; conceptoName: string }[] = [];

      for (const c of conceptos) {
        const montoNum = parseFloat(getNumericValueSafe(c.monto));
        const tipo = c.tipoServicio;
        const days = tipo === 'ANUAL' ? 365 : tipo === 'MENSUAL' ? 30 : (c.dias || 1);

  // Crear suscripción por concepto si aplica (por-concepto o flag global)
  if ((c.crearSuscripcion || unifiedForm.crearSuscripcion) && tipo !== 'UNICO') {
          const subRes = await AuthClient.authenticatedFetch(
            `/api/members/${encodeURIComponent(selectedMemberForService.id)}/subscriptions`,
            {
              method: 'POST',
              body: JSON.stringify({
                serviceId: c.servicioId,
                periodicity: tipo,
                price: montoNum,
                autoDebit: false,
                notes: `Creado desde formulario unificado el ${unifiedForm.fecha}`,
                validUntil: c.vencimiento || addDays(unifiedForm.fecha, days),
              }),
            }
          );
          const subJson = await subRes.json().catch(() => ({}));
          if (!subRes.ok) throw new Error(subJson?.msg || 'No se pudo crear la suscripción');
        }

        const debitRes = await AuthClient.authenticatedFetch('/api/movements', {
          method: 'POST',
          body: JSON.stringify({
            memberId: selectedMemberForService.id,
            fecha: unifiedForm.fecha,
            concepto: `${c.concepto || 'Servicio'}${tipo !== 'UNICO' ? ` (${tipo})` : ''}`,
            tipo: 'DEBIT',
            monto: Number(montoNum),
            origen: 'SERVICIO',
            refId: c.servicioId,
            observaciones: c.observaciones || unifiedForm.observaciones || 'Servicio a crédito',
            vencimiento: tipo === 'UNICO' ? unifiedForm.fecha : (c.vencimiento || addDays(unifiedForm.fecha, days)),
          }),
        });
        const debitJson = await debitRes.json().catch(() => ({}));
        if (!debitRes.ok) throw new Error(debitJson?.msg || 'No se pudo crear el débito del servicio');
        const newDebitId = String(debitJson.id ?? debitJson?.movement?.id ?? '');
        createdDebits.push({ id: newDebitId, amount: montoNum, conceptoName: c.concepto || 'Servicio' });
      }

      // Si hay pago parcial, distribuir el pago entre los débitos creados (en orden) hasta agotar
      if (unifiedForm.permitirPagosParc && unifiedForm.pagoAplicado && unifiedForm.metodoPago) {
        let left = parseFloat(getNumericValue(unifiedForm.pagoAplicado));
        const allocations: { debitId: string; amount: number }[] = [];
        for (const d of createdDebits) {
          if (left <= 0) break;
          const take = Math.min(left, d.amount);
          allocations.push({ debitId: d.id, amount: take });
          left -= take;
        }

        if (allocations.length > 0) {
          const pagoTotal = allocations.reduce((s, a) => s + a.amount, 0);
          const payRes = await AuthClient.authenticatedFetch('/api/payments', {
            method: 'POST',
            body: JSON.stringify({
              memberId: selectedMemberForService.id,
              fecha: unifiedForm.fecha,
              monto: pagoTotal,
              concepto: `Pago parcial: ${createdDebits.map(d => d.conceptoName).join(', ')}`,
              formaPago: unifiedForm.metodoPago,
              cobradorId: unifiedForm.cobradorId || '',
              numeroRecibo: unifiedForm.referencia || '',
              observaciones: unifiedForm.observaciones || '',
              allocations,
            }),
          });
          const payJson = await payRes.json().catch(() => ({}));
          if (!payRes.ok) throw new Error(payJson?.msg || 'No se pudo crear el pago parcial');
        }
      }

      // Asignación a deudas pendientes si hay presupuesto
      if (unifiedForm.presupuestoDeudas && parseFloat(getNumericValue(unifiedForm.presupuestoDeudas)) > 0) {
        const presupuesto = parseFloat(getNumericValue(unifiedForm.presupuestoDeudas));
        
        // Crear pago adicional para deudas (independiente del pago parcial del servicio)
        const debtPayRes = await AuthClient.authenticatedFetch('/api/payments', {
          method: 'POST',
          body: JSON.stringify({
            memberId: selectedMemberForService.id,
            fecha: unifiedForm.fecha,
            monto: presupuesto,
            concepto: `Pago de deudas pendientes - ${createdDebits && createdDebits.length ? createdDebits.map(d => d.conceptoName).join(', ') : (unifiedForm.concepto || '')}`,
            formaPago: unifiedForm.permitirPagosParc ? unifiedForm.metodoPago : 'EFECTIVO', // Si hay pago parcial, usar mismo método
            cobradorId: '',
            numeroRecibo: '',
            observaciones: `Asignación automática a deudas pendientes. ${unifiedForm.observaciones || ''}`.trim(),
            // El sistema asignará automáticamente a los débitos más antiguos
          }),
        });
        const debtPayJson = await debtPayRes.json().catch(() => ({}));
        if (!debtPayRes.ok) {
          console.warn('No se pudo procesar el pago de deudas:', debtPayJson?.msg);
          // No fallar completamente, el servicio principal ya se registró
        }
      }

      // Crear reservas si hay datos de reserva en los conceptos
      const reservasCreadas: string[] = [];
      for (const c of conceptos) {
        if (c.reservaVenueId && c.reservaFecha) {
          try {
            const startDateTime = new Date(`${c.reservaFecha}T${c.reservaHoraInicio || '19:00'}:00`);
            const endDateTime = new Date(`${c.reservaFecha}T${c.reservaHoraFin || '23:00'}:00`);
            
            const reservaData = {
              resourceId: c.reservaVenueId,
              memberId: selectedMemberForService.id,
              start: startDateTime.toISOString(),
              end: endDateTime.toISOString(),
              nombreContacto: `${selectedMemberForService.nombres} ${selectedMemberForService.apellidos}`,
              contacto: (selectedMemberForService as any).celular || selectedMemberForService.telefono || '',
              medioContacto: (selectedMemberForService as any).celular ? 'whatsapp' : 'telefono',
              invitados: 0,
              adelanto: 0,
              montoTotal: parseFloat(getNumericValueSafe(c.monto)),
              status: 'ACTIVO',
              notas: c.reservaObservaciones || c.observaciones || '',
              createdBy: 'system',
              // 🔗 CRÍTICO: Vincular la reserva al débito creado
              debitMovementId: createdDebits.find(d => d.conceptoName === (c.concepto || 'Servicio'))?.id
            };
            
            const reservaRes = await AuthClient.authenticatedFetch('/api/reservas', {
              method: 'POST',
              body: JSON.stringify(reservaData),
            });
            
            if (reservaRes.ok) {
              const reservaJson = await reservaRes.json();
              reservasCreadas.push(`${c.concepto || 'Reserva'} (${c.reservaFecha})`);
            } else {
              const errorResponse = await reservaRes.text();
              let errorMsg = errorResponse;
              try {
                const errorJson = JSON.parse(errorResponse);
                errorMsg = errorJson.msg || errorResponse;
              } catch (e) {
                // Si no es JSON válido, usar el texto tal como está
              }
              console.error(`❌ No se pudo crear la reserva para ${c.concepto}:`, errorMsg);
              alert(`⚠️ Error procesando reserva\n\nNo se pudo crear la reserva para "${c.concepto}".\n\n${errorMsg}\n\nEl pago no se procesará. Por favor verifique la disponibilidad del horario.`);
              return; // Detener el proceso para evitar pago sin reserva
            }
          } catch (error) {
            console.error(`Error creando reserva para ${c.concepto}:`, error);
            alert(`⚠️ Error inesperado\n\nError creando reserva para "${c.concepto}": ${error}\n\nEl pago no se procesará.`);
            return;
          }
        }
      }

      const baseMessage = unifiedForm.permitirPagosParc && unifiedForm.pagoAplicado 
        ? '✅ Servicio a crédito con pago parcial registrado exitosamente'
        : '✅ Servicio a crédito registrado exitosamente';
      
      const debtAssignmentMsg = unifiedForm.presupuestoDeudas && parseFloat(getNumericValue(unifiedForm.presupuestoDeudas)) > 0
        ? ` y se asignaron Gs. ${parseInt(getNumericValue(unifiedForm.presupuestoDeudas)).toLocaleString('es-PY')} a deudas pendientes`
        : '';
      
      const reservaMsg = reservasCreadas.length > 0 
        ? `\n\n🎯 Reservas creadas:\n${reservasCreadas.join('\n')}` 
        : '';
      
      alert(`${baseMessage}${debtAssignmentMsg}${reservaMsg}`);
      handleCloseCobranzaModal();
      await loadMembersAndLedgers();
    } catch (error) {
      console.error('Error al procesar servicio a crédito:', error);
      alert(`❌ Error: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setSaving(false);
    }
  };

  // Función para formatear números con separadores de miles
  const formatNumberWithSeparator = (value: string) => {
    // Remover caracteres no numéricos excepto punto decimal
    const cleaned = value.replace(/[^\d]/g, '');
    if (!cleaned) return '';
    
    // Convertir a número y formatear con separadores
    const number = parseInt(cleaned);
    return number.toLocaleString('es-PY').replace(/,/g, '.');
  };

  // Función para obtener el valor numérico sin separadores
  const getNumericValue = (formattedValue: string) => {
    return formattedValue.replace(/\./g, '');
  };

  // Función para actualizar vencimiento automático
  const updateVencimientoAutomatico = (fecha: string, tipoServicio: string) => {
    if (!fecha) return '';
    
    const days = tipoServicio === 'ANUAL' ? 365 : 
                 tipoServicio === 'MENSUAL' ? 30 : 
                 tipoServicio === 'DIARIO' ? (unifiedForm.dias || 1) : 30;
    
    return tipoServicio === 'UNICO' ? fecha : addDays(fecha, days);
  };

  // Funciones para manejo de débitos seleccionados
  const handleDebitSelection = (debitId: string, isSelected: boolean) => {
    let newSelectedDebits: string[];
    let newIndividualAmounts = { ...individualAmounts };
    
    if (isSelected) {
      newSelectedDebits = [...selectedDebits, debitId];
      
      // SOLO auto-llenar el monto si no hay un monto previo ingresado
      const existingAmount = individualAmounts[debitId];
      const hasExistingAmount = existingAmount && parseInt(getNumericValue(existingAmount)) > 0;
      
      if (!hasExistingAmount) {
        // Auto-llenar el monto individual con el saldo pendiente del débito
        const debit = pendingDebits.find(d => d.id === debitId);
        if (debit) {
          const saldoPendiente = (debit.monto || 0) - (debit.paidAmount || 0);
          newIndividualAmounts[debitId] = formatNumberWithSeparator(saldoPendiente.toString());
        }
      }
      // Si ya hay un monto, mantenerlo tal como está
      
      // Auto-inicializar fecha de pago cuando se selecciona el primer débito
      if (selectedDebits.length === 0 && !debtPaymentForm.fecha) {
        const today = new Date().toISOString().split('T')[0];
        setDebtPaymentForm(prev => ({
          ...prev,
          fecha: today
        }));
      }
    } else {
      newSelectedDebits = selectedDebits.filter(id => id !== debitId);
      // Limpiar el monto individual del débito deseleccionado
      delete newIndividualAmounts[debitId];
    }
    
    setSelectedDebits(newSelectedDebits);
    setIndividualAmounts(newIndividualAmounts);
    
    // Calcular total basado en montos individuales
    const total = newSelectedDebits.reduce((sum, id) => {
      const amount = newIndividualAmounts[id];
      if (amount) {
        const numericAmount = parseInt(getNumericValue(amount));
        return sum + (isNaN(numericAmount) ? 0 : numericAmount);
      }
      return sum;
    }, 0);
    
    const formattedTotal = total > 0 ? formatNumberWithSeparator(total.toString()) : '';
    
    // Actualizar tanto el formulario unificado como el de deudas
    setUnifiedForm(prev => ({ ...prev, presupuestoDeudas: formattedTotal }));
    setDebtPaymentForm(prev => ({ ...prev, montoAPagar: formattedTotal }));
  };

  // Función para manejar cambios en montos individuales
  const handleIndividualAmountChange = (debitId: string, value: string) => {
    const debit = pendingDebits.find(d => d.id === debitId);
    if (!debit) return;

    const saldoPendiente = (debit.monto || 0) - (debit.paidAmount || 0);
    const numericValue = parseInt(getNumericValue(value)) || 0;

    // Validar que no exceda el saldo pendiente
    if (numericValue > saldoPendiente) {
      alert(`El monto no puede ser mayor al saldo pendiente: Gs. ${saldoPendiente.toLocaleString('es-PY')}`);
      return;
    }

    // Actualizar monto individual
    const newIndividualAmounts = {
      ...individualAmounts,
      [debitId]: formatNumberWithSeparator(numericValue.toString())
    };
    setIndividualAmounts(newIndividualAmounts);

    // AUTO-SELECCIONAR: Si se ingresa un monto (mayor a 0), auto-seleccionar el débito
    let newSelectedDebits = [...selectedDebits];
    if (numericValue > 0 && !selectedDebits.includes(debitId)) {
      newSelectedDebits = [...selectedDebits, debitId];
      setSelectedDebits(newSelectedDebits);
      
      // Auto-inicializar fecha de pago cuando se ingresa el primer monto
      if (selectedDebits.length === 0 && !debtPaymentForm.fecha) {
        const today = new Date().toISOString().split('T')[0];
        setDebtPaymentForm(prev => ({
          ...prev,
          fecha: today
        }));
      }
    } 
    // Si se borra el monto (queda en 0), deseleccionar el débito
    else if (numericValue === 0 && selectedDebits.includes(debitId)) {
      newSelectedDebits = selectedDebits.filter(id => id !== debitId);
      setSelectedDebits(newSelectedDebits);
    }

    // Recalcular total basado en los débitos seleccionados
    const total = newSelectedDebits.reduce((sum, id) => {
      const amount = newIndividualAmounts[id];
      if (amount) {
        const numericAmount = parseInt(getNumericValue(amount));
        return sum + (isNaN(numericAmount) ? 0 : numericAmount);
      }
      return sum;
    }, 0);

    const formattedTotal = total > 0 ? formatNumberWithSeparator(total.toString()) : '';
    
    // Actualizar formularios
    setUnifiedForm(prev => ({ ...prev, presupuestoDeudas: formattedTotal }));
    setDebtPaymentForm(prev => ({ ...prev, montoAPagar: formattedTotal }));
  };

  // Función para auto-asignar monto por antigüedad
  const autoAssignByAge = (availableAmount: number) => {
    if (pendingDebits.length === 0) return [];
    
    // Ordenar débitos por antigüedad (fecha más antigua primero, luego vencimiento)
    const sortedDebits = [...pendingDebits].sort((a, b) => {
      const dateA = new Date(a.fecha).getTime();
      const dateB = new Date(b.fecha).getTime();
      if (dateA !== dateB) return dateA - dateB;
      
      const vencA = a.vencimiento ? new Date(a.vencimiento).getTime() : Infinity;
      const vencB = b.vencimiento ? new Date(b.vencimiento).getTime() : Infinity;
      return vencA - vencB;
    });
    
    let remainingAmount = availableAmount;
    const selectedIds: string[] = [];
    
    for (const debit of sortedDebits) {
      if (remainingAmount <= 0) break;
      
      const saldoPendiente = (debit.monto || 0) - (debit.paidAmount || 0);
      if (saldoPendiente <= remainingAmount) {
        selectedIds.push(debit.id);
        remainingAmount -= saldoPendiente;
      }
    }
    
    return selectedIds;
  };

  // Función para manejar cambio manual del monto a pagar
  const handleMontoAPagarChange = (value: string) => {
    const formatted = formatNumberWithSeparator(value);
    setDebtPaymentForm(prev => ({ ...prev, montoAPagar: formatted }));
    
    // Auto-asignar débitos por antigüedad según el monto ingresado
    const numericAmount = parseFloat(getNumericValue(formatted)) || 0;
    if (numericAmount > 0) {
      const autoSelected = autoAssignByAge(numericAmount);
      setSelectedDebits(autoSelected);
    } else {
      setSelectedDebits([]);
    }
  };

  const calculateSelectedDebitsTotal = () => {
    return selectedDebits.reduce((total, debitId) => {
      const debit = pendingDebits.find(d => d.id === debitId);
      if (debit) {
        const saldoPendiente = (debit.monto || 0) - (debit.paidAmount || 0);
        return total + saldoPendiente;
      }
      return total;
    }, 0);
  };

  // Actualizar automáticamente el presupuesto según débitos seleccionados
  const updateBudgetFromSelection = () => {
    const total = calculateSelectedDebitsTotal();
    const formattedTotal = formatNumberWithSeparator(total.toString());
    setUnifiedForm(prev => ({ ...prev, presupuestoDeudas: formattedTotal }));
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Gestión de Socios</h1>
            <p className="text-sm text-gray-600 mt-1">Administra la información de los socios del club</p>
          </div>

          {/* Estadísticas */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm">
              <span className="text-lg font-semibold text-gray-900">{stats.total}</span>
              <span className="text-sm text-gray-600 ml-1">Total Socios</span>
            </div>
            <div className="bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm">
              <span className="text-lg font-semibold text-emerald-700">{stats.alDia}</span>
              <span className="text-sm text-gray-600 ml-1">Al Día</span>
            </div>
            <div className="bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm">
              <span className="text-lg font-semibold text-amber-700">{stats.atrasados}</span>
              <span className="text-sm text-gray-600 ml-1">Atrasados</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportToExcel}
                className="bg-white text-gray-700 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" />
                Exportar
              </button>
              <button
                onClick={() => setShowNoSocioModal(true)}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 flex items-center gap-2 shadow-sm"
              >
                <CreditCard className="w-4 h-4" />
                Cobrar (No socio)
              </button>
              <Link
                href="/admin/socios/nuevo"
                className="bg-custom-blue text-white px-4 py-2 rounded-lg hover:bg-custom-blue flex items-center gap-2 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Nuevo Socio
              </Link>
            </div>
          </div>
        </div>

        {/* Filtros y búsqueda */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-5">
              <label className="block text-xs font-medium text-gray-700 mb-1">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Nombre, código, CI o email..."
                  className="w-full h-[42px] pl-10 pr-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-700 focus:border-gray-700"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Categoría</label>
              <select
                className="w-full h-[42px] px-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-700 focus:border-gray-700 text-sm"
                value={filterCategoria}
                onChange={(e) => { setFilterCategoria(e.target.value); setPage(1); }}
              >
                <option value="">Todas</option>
                <option value="Individual">Individual</option>
                <option value="Familiar">Familiar</option>
                <option value="No Socio">No Socio</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Subcategoría</label>
              <select
                className="w-full h-[42px] px-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-700 focus:border-gray-700 text-sm"
                value={filterSubcategoria}
                onChange={(e) => { setFilterSubcategoria(e.target.value); setPage(1); }}
              >
                <option value="">Todas</option>
                <option value="SOCIO">Socio</option>
                <option value="NO SOCIO">No Socio</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
              <select
                className="w-full h-[42px] px-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-700 focus:border-gray-700 text-sm"
                value={filterEstado}
                onChange={(e) => { setFilterEstado(e.target.value); setPage(1); }}
              >
                <option value="">Todos</option>
                <option value="AL_DIA">Al Día</option>
                <option value="ATRASADO">Atrasado</option>
                <option value="SUSPENDIDO">Suspendido</option>
              </select>
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">&nbsp;</label>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterCategoria('');
                  setFilterEstado('');
                  setFilterSubcategoria('');
                  setPage(1);
                }}
                className="w-full h-[42px] px-1 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 text-xs"
                title="Limpiar todos los filtros"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>

        {/* Tabla de socios */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Socio</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Categoría</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Deuda</th>
                  <th className="px-6 py-4 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider"></th>
                  <th className="px-6 py-4 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pageMembers.map((member) => {
                  const deuda = memberDebtMap[member.id]?.saldo ?? member.deudaTotal ?? 0;
                  const estadoCalc = memberDebtMap[member.id]?.estadoCalc ?? member.estado;
                  return (
                    <tr key={member.id} className="hover:bg-gray-50/60">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            {member.foto ? (
                              <img
                                className="h-10 w-10 rounded-full object-cover"
                                src={member.foto}
                                alt={`${member.nombres} ${member.apellidos}`}
                                onError={(e) => { (e.currentTarget as HTMLImageElement).src='/avatar-placeholder.png'; }}
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200">
                                <User className="w-5 h-5 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {member.nombres} {member.apellidos}
                            </div>
                            <div className="text-xs text-gray-500">
                              {member.codigo} • CI: {formatNumberWithSeparator(String(member.ci || ''))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-900">
                          {member.subcategoria === 'NO SOCIO' ? (
                            <span>No Socio</span>
                          ) : (
                            <>
                              {(() => {
                                if (member.categoria === 'Individual') return '👤';
                                if (member.categoria === 'Familiar') return '👥';
                                return '👤'; // fallback
                              })()} <span className="ml-1">{member.subcategoria}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <EstadoBadge estado={estadoCalc} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-medium ${deuda > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                          {formatCurrency(Math.max(0, deuda))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleOpenCobranzaModal(member)}
                          className="bg-emerald-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-emerald-700 shadow-sm"
                        >
                          Cobrar
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={(e) => openFloatingMenu(member.id, e)}
                          className="text-gray-500 hover:text-gray-700 p-1 rounded-md hover:bg-gray-100"
                          title="Más acciones"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        {openMenuMemberId === member.id && (
                          <div
                            className="fixed z-50 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1"
                            style={{ left: `${menuPos.x}px`, top: `${menuPos.y}px` }}
                          >
                            <Link
                              href={`/admin/socios/${member.id}`}
                              className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              onClick={() => setOpenMenuMemberId(null)}
                            >
                              <User className="w-4 h-4 mr-2" />
                              Ver Detalles
                            </Link>
                            {/* Pagos / Servicios removed: main "Cobrar" button exists in table row */}
                            {/* Nueva opción para Deudas Pendientes */}
                            <button
                              onClick={() => { 
                                setSelectedMemberForDebts(member); 
                                setShowDebtsModal(true);
                                loadPendingDebits(member.id);
                                setOpenMenuMemberId(null);
                                
                                // Inicializar fecha de pago automáticamente
                                const today = new Date().toISOString().split('T')[0];
                                setDebtPaymentForm(prev => ({
                                  ...prev,
                                  fecha: today
                                }));
                              }}
                              className="flex items-center w-full text-left px-4 py-2 text-sm text-amber-700 hover:bg-amber-50"
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                              </svg>
                              Deudas Pendientes
                            </button>
                            {member.subcategoria === 'NO SOCIO' && (
                              <button
                                onClick={() => { handleConvertToSocio(member.id); setOpenMenuMemberId(null); }}
                                className="flex items-center w-full text-left px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
                              >
                                <UserPlus className="w-4 h-4 mr-2" />
                                Convertir a Socio
                              </button>
                            )}
                            <button
                              onClick={() => { handleDelete(member.id); setOpenMenuMemberId(null); }}
                              className="flex items-center w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50"
                            >
                              <X className="w-4 h-4 mr-2" />
                              Eliminar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {filteredMembers.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-6 border-t border-gray-200 bg-gray-50/50">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Filas por página:</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <div className="text-sm text-gray-600">
                Mostrando {start + 1}–{Math.min(end, filteredMembers.length)} de {filteredMembers.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={pageSafe <= 1}
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-700">Página {pageSafe} de {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={pageSafe >= totalPages}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
          
          {/* Espacio extra para que el menú de acciones del último socio siempre se vea */}
          <div style={{ height: 25 }} aria-hidden="true" />
        </div>
      </div>

      {/* === Modal NO-SOCIO Registration === */}
      {showNoSocioModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-no-socio-title"
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 id="modal-no-socio-title" className="text-xl font-semibold text-gray-900">
                  Registro No-Socio
                </h2>
                <button
                  onClick={closeNoSocioModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombres *
                    </label>
                    <input
                      type="text"
                      value={noSocioForm.nombres}
                      onChange={(e) => setNoSocioForm(prev => ({ ...prev, nombres: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="Ingrese nombres"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Apellidos *
                    </label>
                    <input
                      type="text"
                      value={noSocioForm.apellidos}
                      onChange={(e) => setNoSocioForm(prev => ({ ...prev, apellidos: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="Ingrese apellidos"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CI
                  </label>
                  <input
                    type="text"
                    value={noSocioForm.ci}
                    onChange={(e) => {
                      const ciValue = e.target.value;
                      setNoSocioForm(prev => ({ ...prev, ci: ciValue }));
                      
                      // Validar CI en tiempo real si no está vacío
                      if (ciValue.trim()) {
                        const existingMember = members.find(member => 
                          member.ci && member.ci.trim().toLowerCase() === ciValue.trim().toLowerCase()
                        );
                        
                        if (existingMember) {
                          const memberType = existingMember.subcategoria === 'NO SOCIO' ? 'no-socio' : 'socio';
                          setCiValidationError(`Ya existe un ${memberType} registrado con esta CI: ${existingMember.nombres} ${existingMember.apellidos} (${existingMember.codigo})`);
                        } else {
                          setCiValidationError('');
                        }
                      } else {
                        setCiValidationError('');
                      }
                    }}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                      ciValidationError ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="Cédula de identidad"
                  />
                  {ciValidationError && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <svg className="w-4 h-4 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {ciValidationError}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={noSocioForm.telefono}
                    onChange={(e) => setNoSocioForm(prev => ({ ...prev, telefono: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Número de teléfono"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={noSocioForm.email}
                    onChange={(e) => setNoSocioForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Correo electrónico"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={closeNoSocioModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateNoSocio}
                  disabled={!noSocioForm.nombres.trim() || !noSocioForm.apellidos.trim() || !!ciValidationError}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  Crear y Cobrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === Modal UNIFICADO === */}
      {showChargeModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-pago-unificado-title"
        >
          <div
            className="w-full max-w-7xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 id="modal-pago-unificado-title" className="text-lg font-semibold text-gray-900">Cobranza</h3>
                  {selectedMemberForService && (
                    <div className="text-xs text-gray-600 mt-1">
                      <span className="font-medium">
                        {selectedMemberForService.nombres} {selectedMemberForService.apellidos}
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">{selectedMemberForService.codigo}</p>
                    </div>
                  )}
                </div>
                <button onClick={handleCloseCobranzaModal} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Selector de Condición: CONTADO vs CREDITO */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">🎯 Condición de Operación</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Al Contado */}
                  <div 
                    className={`relative rounded-xl border-2 p-4 cursor-pointer transition-all ${
                      unifiedForm.condicion === 'CONTADO'
                        ? 'border-green-500 bg-green-50' 
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                    onClick={() => {
                      setShowFormValidation(false);
                      setUnifiedForm(prev => ({ 
                        ...prev, 
                        condicion: 'CONTADO',
                        pagoAplicado: prev.monto // En contado, pago aplicado = monto total
                      }));
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                        unifiedForm.condicion === 'CONTADO' ? 'border-green-500 bg-green-500' : 'border-gray-300'
                      }`}>
                        {unifiedForm.condicion === 'CONTADO' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                      </div>
                      <div className="flex-1">
                        <h5 className="font-medium text-gray-900">💳 Al Contado</h5>
                        <p className="text-sm text-gray-600 mt-1">
                          Se genera débito + pago inmediato por el monto total
                        </p>
                        <div className="text-xs text-green-700 mt-2 font-medium">
                          ✅ Pago completo • ✅ Recibo inmediato • ✅ Sin deuda pendiente
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* A Crédito */}
                  <div 
                    className={`relative rounded-xl border-2 p-4 cursor-pointer transition-all ${
                      unifiedForm.condicion === 'CREDITO'
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                    onClick={() => {
                      setShowFormValidation(false);
                      setUnifiedForm(prev => ({ 
                        ...prev, 
                        condicion: 'CREDITO',
                        pagoAplicado: '' // En crédito, el pago es opcional
                      }));
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                        unifiedForm.condicion === 'CREDITO' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                      }`}>
                        {unifiedForm.condicion === 'CREDITO' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                      </div>
                      <div className="flex-1">
                        <h5 className="font-medium text-gray-900">📋 A Crédito</h5>
                        <p className="text-sm text-gray-600 mt-1">
                          Se genera débito, pago opcional (parcial o diferido)
                        </p>
                        <div className="text-xs text-blue-700 mt-2 font-medium">
                          📝 Deuda registrada • 💰 Pago parcial opcional • 🔄 Saldo pendiente
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ===== FORMULARIO UNIFICADO ===== */}
              <div className="space-y-6">
                
                {/* ===== 1. DATOS DEL SERVICIO (Campos globales únicos) ===== */}
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    📋 Datos del Servicio
                  </h3>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Fecha (único para todos los conceptos) */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Fecha *</label>
                      <input
                        type="date"
                        value={unifiedForm.fecha}
                        onChange={(e) => handleFechaGlobalChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-gray-800"
                      />
                      {showFormValidation && !unifiedForm.fecha && (
                        <p className="text-xs text-red-600 mt-1">Fecha requerida</p>
                      )}
                    </div>

                    {/* Observaciones (único para todos los conceptos) */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Observaciones</label>
                      <textarea
                        rows={2}
                        value={unifiedForm.observaciones}
                        onChange={(e) => setUnifiedForm(prev => ({ ...prev, observaciones: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-gray-800"
                        placeholder="Observaciones adicionales..."
                      />
                    </div>
                  </div>

                  <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      💡 Los conceptos (Servicio, Tipo, Monto, Vencimiento) se configuran individualmente en cada sección de pago (Contado/Crédito) debajo.
                    </p>
                  </div>
                </div>

                {/* ===== 2. CONDICIÓN DE PAGO (CONTADO/CREDITO) ===== */}
                {unifiedForm.condicion === 'CONTADO' && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      💰 Pago Inmediato (Contado)
                    </h3>
                    {/* ===== Lista de conceptos para CONTADO (múltiples) ===== */}
                    <ConceptosTable
                      conceptos={unifiedForm.conceptosContado || []}
                      services={services}
                      selectedMember={selectedMemberForService}
                      showFormValidation={showFormValidation}
                      vencimientoDefault={unifiedForm.vencimiento}
                      onAddConcepto={() => addConceptoToSection('CONTADO')}
                      onUpdateConcepto={(id, field, value) => updateConceptoInSection('CONTADO', id, field, value)}
                      onRemoveConcepto={(id) => removeConceptoFromSection('CONTADO', id)}
                      formatNumberWithSeparator={formatNumberWithSeparator}
                      getNumericValueSafe={getNumericValueSafe}
                      isServiceDuplicate={(conceptos, servicioId) => isServiceDuplicate(conceptos, servicioId)}
                      title="Conceptos a pagar"
                      buttonColor="bg-green-600"
                      onOpenReservaModal={handleOpenReservaModal}
                    />

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                      {/* Método de Pago */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Método de Pago *</label>
                        <select
                          value={unifiedForm.metodoPago}
                          onChange={(e) => setUnifiedForm(prev => ({ ...prev, metodoPago: e.target.value as any }))}
                          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                            unifiedForm.metodoPago 
                              ? 'border-gray-300 focus:ring-green-500 focus:border-green-500'
                              : 'border-red-300 focus:ring-red-500 focus:border-red-500'
                          }`}
                        >
                          <option value="">— Seleccionar método —</option>
                          <option value="EFECTIVO">Efectivo</option>
                          <option value="TRANSFERENCIA">Transferencia</option>
                          <option value="TARJETA">Tarjeta</option>
                          <option value="CHEQUE">Cheque</option>
                        </select>
                        {!unifiedForm.metodoPago && (
                          <p className="text-xs text-red-600 mt-1">Método de pago requerido para contado</p>
                        )}
                      </div>

                      {/* Cobrador */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Cobrador</label>
                              <select
                value={unifiedForm.cobradorId}
                          onChange={(e) => setUnifiedForm(prev => ({ ...prev, cobradorId: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        >
                          <option value="">— Sin cobrador —</option>
                          {collectors.map(cobrador => (
                            <option key={cobrador.id} value={cobrador.id}>{cobrador.nombres}</option>
                          ))}
                        </select>
                      </div>

                      {/* Número de Recibo/Factura */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Nº Recibo/Factura</label>
                        <input
                          type="text"
                          value={unifiedForm.numeroRecibo}
                          onChange={(e) => setUnifiedForm(prev => ({ ...prev, numeroRecibo: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          placeholder="Ej: 00001234"
                        />
                      </div>

                      {/* Referencia/Comprobante */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Referencia/Comprobante</label>
                        <input
                          type="text"
                          value={unifiedForm.referencia}
                          onChange={(e) => setUnifiedForm(prev => ({ ...prev, referencia: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          placeholder="Nº de transferencia, ticket, etc."
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ===== 3. CONFIGURACIÓN PARA CRÉDITO ===== */}
                {unifiedForm.condicion === 'CREDITO' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      📅 Configuración de Crédito
                    </h3>

                    {/* ===== Lista de conceptos para CREDITO (múltiples) ===== */}
                    <ConceptosTable
                      conceptos={unifiedForm.conceptosCredito || []}
                      services={services}
                      selectedMember={selectedMemberForService}
                      showFormValidation={showFormValidation}
                      vencimientoDefault={unifiedForm.vencimiento}
                      onAddConcepto={() => addConceptoToSection('CREDITO')}
                      onUpdateConcepto={(id, field, value) => updateConceptoInSection('CREDITO', id, field, value)}
                      onRemoveConcepto={(id) => removeConceptoFromSection('CREDITO', id)}
                      formatNumberWithSeparator={formatNumberWithSeparator}
                      getNumericValueSafe={getNumericValueSafe}
                      isServiceDuplicate={(conceptos, servicioId) => isServiceDuplicate(conceptos, servicioId)}
                      title="Conceptos (Crédito)"
                      buttonColor="bg-blue-600"
                      onOpenReservaModal={handleOpenReservaModal}
                    />
                    
                    {/* Pagos Parciales */}
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          id="permitirPagosParc"
                          checked={unifiedForm.permitirPagosParc}
                          onChange={(e) => setUnifiedForm(prev => ({ ...prev, permitirPagosParc: e.target.checked, pagoAplicado: e.target.checked ? prev.pagoAplicado : '' }))}
                          className="w-4 h-4 text-blue-600"
                        />
                        <label htmlFor="permitirPagosParc" className="text-sm font-medium text-gray-700">
                          Aplicar pago parcial ahora
                        </label>
                      </div>
                      
                      {unifiedForm.permitirPagosParc && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-3 p-3 bg-white rounded-lg border border-blue-200">
                          {/* Monto del Pago Parcial */}
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Monto Pago (Gs.) *</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={unifiedForm.pagoAplicado}
                              onChange={(e) => {
                                const formatted = formatNumberWithSeparator(e.target.value);
                                setUnifiedForm(prev => ({ ...prev, pagoAplicado: formatted }));
                              }}
                              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                                unifiedForm.pagoAplicado && parseFloat(getNumericValue(unifiedForm.pagoAplicado)) > 0 && parseFloat(getNumericValue(unifiedForm.pagoAplicado)) <= parseFloat(getNumericValue(unifiedForm.monto || '0'))
                                  ? 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                                  : 'border-red-300 focus:ring-red-500 focus:border-red-500'
                              }`}
                              placeholder="25.000"
                            />
                            {unifiedForm.pagoAplicado && (
                              <>
                                {parseFloat(getNumericValue(unifiedForm.pagoAplicado)) <= 0 && (
                                  <p className="text-xs text-red-600 mt-1">Monto debe ser mayor a 0</p>
                                )}
                                {parseFloat(getNumericValue(unifiedForm.pagoAplicado)) > parseFloat(getNumericValue(unifiedForm.monto || '0')) && (
                                  <p className="text-xs text-red-600 mt-1">No puede superar el monto total</p>
                                )}
                              </>
                            )}
                          </div>

                          {/* Método de Pago Parcial */}
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Método de Pago *</label>
                            <select
                              value={unifiedForm.metodoPago}
                              onChange={(e) => setUnifiedForm(prev => ({ ...prev, metodoPago: e.target.value as any }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="">— Seleccionar método —</option>
                              <option value="EFECTIVO">Efectivo</option>
                              <option value="TRANSFERENCIA">Transferencia</option>
                              <option value="TARJETA">Tarjeta</option>
                              <option value="CHEQUE">Cheque</option>
                            </select>
                          </div>

                          {/* Referencia Pago Parcial */}
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Referencia</label>
                            <input
                              type="text"
                              value={unifiedForm.referencia}
                              onChange={(e) => setUnifiedForm(prev => ({ ...prev, referencia: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              placeholder="Nº comprobante"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ===== 4. RESUMEN Y BOTONES ===== */}
                <ResumenPago
                  condicion={unifiedForm.condicion}
                  conceptos={unifiedForm.condicion === 'CONTADO' ? (unifiedForm.conceptosContado || []) : (unifiedForm.conceptosCredito || [])}
                  pagoAplicado={unifiedForm.pagoAplicado}
                  permitirPagosParc={unifiedForm.permitirPagosParc}
                  calculateTotal={calculateTotal}
                  getNumericValue={getNumericValue}
                  onProcessPayment={() => {
                    if (unifiedForm.condicion === 'CONTADO') {
                      handleUnifiedContadoPayment();
                    } else {
                      handleUnifiedCreditoService();
                    }
                  }}
                  isFormValid={isUnifiedFormValid()}
                  saving={saving}
                  onCancel={handleCloseCobranzaModal}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL DE DEUDAS PENDIENTES ===== */}
      {showDebtsModal && selectedMemberForDebts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header del Modal */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-white flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-white bg-opacity-20 p-1.5 rounded-lg">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Gestión de Deudas Pendientes</h2>
                    <p className="text-amber-100 text-sm">
                      {selectedMemberForDebts.nombres} {selectedMemberForDebts.apellidos} 
                      <span className="ml-2 opacity-80">• Código: {selectedMemberForDebts.codigo}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowDebtsModal(false);
                    setSelectedMemberForDebts(null);
                    setSelectedDebits([]);
                    setIndividualAmounts({});
                    
                    // Resetear formulario de pago de deudas
                    setDebtPaymentForm({
                      fecha: '',
                      montoAPagar: '',
                      metodoPago: '',
                      cobradorId: '',
                      numeroRecibo: '',
                      referencia: '',
                      observaciones: ''
                    });
                  }}
                  className="text-white hover:text-amber-200 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Contenido del Modal */}
            <div className="flex-1 overflow-y-auto p-4">
              
              {/* Formulario de Pago - Siempre visible */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <h3 className="text-base font-semibold text-green-800 mb-3">💳 Datos del Pago</h3>
                
                {/* Primera fila - 5 campos principales */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
                  {/* Fecha de Pago */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">Fecha de Pago *</label>
                    <input
                      type="date"
                      value={debtPaymentForm.fecha}
                      onChange={(e) => setDebtPaymentForm(prev => ({ ...prev, fecha: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>

                  {/* Método de Pago */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">Método de Pago *</label>
                    <select
                      value={debtPaymentForm.metodoPago}
                      onChange={(e) => setDebtPaymentForm(prev => ({ ...prev, metodoPago: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    >
                      <option value="">— Seleccionar método —</option>
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="TRANSFERENCIA">Transferencia</option>
                      <option value="TARJETA">Tarjeta</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>

                  {/* Cobrador */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">Cobrador</label>
                    <select
                      value={debtPaymentForm.cobradorId}
                      onChange={(e) => setDebtPaymentForm(prev => ({ ...prev, cobradorId: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    >
                      <option value="">— Sin asignar —</option>
                      {collectors.map(collector => (
                        <option key={collector.id} value={collector.id}>
                          {collector.nombres} {collector.apellidos}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Número de Recibo */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">Nro. de Recibo</label>
                    <input
                      type="text"
                      value={debtPaymentForm.numeroRecibo}
                      onChange={(e) => setDebtPaymentForm(prev => ({ ...prev, numeroRecibo: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      placeholder="001-001-0000123"
                    />
                  </div>

                  {/* Referencia/Comprobante */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">Referencia/Comprobante</label>
                    <input
                      type="text"
                      value={debtPaymentForm.referencia}
                      onChange={(e) => setDebtPaymentForm(prev => ({ ...prev, referencia: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      placeholder="Nº transferencia, cheque, etc."
                    />
                  </div>
                </div>

                {/* Segunda fila - Observaciones con ancho reducido */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">Observaciones</label>
                    <textarea
                      rows={2}
                      value={debtPaymentForm.observaciones}
                      onChange={(e) => setDebtPaymentForm(prev => ({ ...prev, observaciones: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      placeholder="Observaciones adicionales sobre el pago..."
                    />
                  </div>
                  {/* Columna vacía para mantener el ancho reducido */}
                  <div></div>
                </div>


              </div>




              {/* Lista de Débitos Pendientes */}
              <div className="bg-white border border-gray-200 rounded-lg">
                <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-gray-900">📋 Detalle de Débitos Pendientes</span>
                      <span className="text-gray-400">•</span>
                      <span className="text-red-600 font-medium">
                        Deuda Total Gs.{(
                          memberDebtMap[selectedMemberForDebts.id]?.saldo || 
                          selectedMemberForDebts.deudaTotal || 0
                        ).toLocaleString('es-PY')}
                      </span>
                      <span className="text-gray-400">•</span>
                      <span className="text-amber-600 font-medium">
                        Débitos Pendientes {pendingDebits.length}
                      </span>
                      <span className="text-gray-400">•</span>
                      <span className="text-green-600 font-medium">
                        Seleccionados {selectedDebits.length > 0 
                          ? `Gs.${calculateSelectedDebitsTotal().toLocaleString('es-PY')}`
                          : 'Gs.0'
                        }
                      </span>
                    </div>
                    
                    {/* Botones de Acción Integrados */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          if (pendingDebits.length > 0) {
                            const allDebitIds = pendingDebits.map(d => d.id);
                            setSelectedDebits(allDebitIds);
                          }
                        }}
                        title="Seleccionar Todo"
                        className="px-2 py-1 bg-amber-100 text-amber-800 rounded hover:bg-amber-200 transition-colors text-xs font-medium"
                      >
                        ✓ Todo
                      </button>
                      <button
                        onClick={() => setSelectedDebits([])}
                        title="Limpiar Selección"
                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-xs"
                      >
                        🧹
                      </button>
                      <button
                        onClick={() => loadPendingDebits(selectedMemberForDebts.id)}
                        disabled={loadingDebits}
                        title="Actualizar Lista"
                        className="px-2 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors text-xs disabled:opacity-50"
                      >
                        {loadingDebits ? '⟳' : '🔄'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tabla de Débitos */}
                <div className="overflow-x-auto">
                  {loadingDebits ? (
                    <div className="p-6 text-center">
                      <div className="text-gray-500 text-sm">⟳ Cargando débitos pendientes...</div>
                    </div>
                  ) : pendingDebits.length > 0 ? (
                    <table className="w-full text-xs">
                      {/* Encabezados de la Tabla */}
                      <thead className="bg-gray-100 border-b border-gray-200">
                        <tr>
                          <th className="px-2 py-3 text-left font-semibold text-gray-700 w-8">
                            <input
                              type="checkbox"
                              checked={pendingDebits.length > 0 && selectedDebits.length === pendingDebits.length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const allDebitIds = pendingDebits.map(d => d.id);
                                  setSelectedDebits(allDebitIds);
                                } else {
                                  setSelectedDebits([]);
                                }
                              }}
                              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                            />
                          </th>
                          <th className="px-3 py-3 text-left font-semibold text-gray-700 min-w-[150px]">Descripción</th>
                          <th className="px-3 py-3 text-left font-semibold text-gray-700 w-20">Fecha</th>
                          <th className="px-3 py-3 text-left font-semibold text-gray-700 w-24">Vencimiento</th>
                          <th className="px-3 py-3 text-center font-semibold text-gray-700 w-20">Días Atraso</th>
                          <th className="px-3 py-3 text-center font-semibold text-gray-700 w-16">Estado</th>
                          <th className="px-3 py-3 text-right font-semibold text-gray-700 w-28">Saldo Pendiente</th>
                          <th className="px-3 py-3 text-right font-semibold text-gray-700 w-24">Pagado</th>
                          <th className="px-3 py-3 text-center font-semibold text-gray-700 w-32">Monto a Pagar</th>
                        </tr>
                      </thead>

                      {/* Cuerpo de la Tabla */}
                      <tbody className="divide-y divide-gray-200">
                        {pendingDebits.map((debit, index) => {
                          const saldoPendiente = (debit.monto || 0) - (debit.paidAmount || 0);
                          const isVencido = debit.vencimiento && new Date(debit.vencimiento) < new Date();
                          const isSelected = selectedDebits.includes(debit.id);
                          const fechaVenc = debit.vencimiento ? new Date(debit.vencimiento) : null;
                          const diasVencido = fechaVenc ? Math.floor((new Date().getTime() - fechaVenc.getTime()) / (1000 * 60 * 60 * 24)) : 0;

                          return (
                            <tr 
                              key={debit.id}
                              className={`transition-all hover:bg-gray-50 ${
                                isSelected 
                                  ? 'bg-green-50 border-l-4 border-green-400' 
                                  : isVencido 
                                    ? 'bg-red-50' 
                                    : ''
                              }`}
                            >
                              {/* Checkbox */}
                              <td className="px-2 py-3">
                                <input
                                  type="checkbox"
                                  id={`debt-${debit.id}`}
                                  checked={isSelected}
                                  onChange={(e) => handleDebitSelection(debit.id, e.target.checked)}
                                  className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                                />
                              </td>

                              {/* Descripción */}
                              <td className="px-3 py-3">
                                <label 
                                  htmlFor={`debt-${debit.id}`}
                                  className="font-medium text-gray-900 cursor-pointer block"
                                >
                                  {debit.concepto || 'Sin concepto'}
                                </label>
                              </td>

                              {/* Fecha */}
                              <td className="px-3 py-3 text-gray-600">
                                {debit.fecha ? new Date(debit.fecha).toLocaleDateString('es-PY') : 'N/A'}
                              </td>

                              {/* Vencimiento */}
                              <td className={`px-3 py-3 ${isVencido ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                                {debit.vencimiento ? new Date(debit.vencimiento).toLocaleDateString('es-PY') : 'N/A'}
                              </td>

                              {/* Días de Atraso */}
                              <td className="px-3 py-3 text-center">
                                {isVencido && diasVencido > 0 ? (
                                  <span className="text-red-600 font-medium">
                                    {diasVencido}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>

                              {/* Estado */}
                              <td className="px-3 py-3 text-center">
                                {isVencido ? (
                                  <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-medium">
                                    VENCIDO
                                  </span>
                                ) : (
                                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                                    AL DÍA
                                  </span>
                                )}
                              </td>

                              {/* Saldo Pendiente */}
                              <td className="px-3 py-3 text-right">
                                <span className={`font-bold ${isSelected ? 'text-green-700' : 'text-gray-900'}`}>
                                  Gs.{saldoPendiente.toLocaleString('es-PY')}
                                </span>
                              </td>

                              {/* Pagado */}
                              <td className="px-3 py-3 text-right text-gray-500">
                                {(debit.paidAmount || 0) > 0 ? (
                                  `Gs.${(debit.paidAmount || 0).toLocaleString('es-PY')}`
                                ) : (
                                  '-'
                                )}
                              </td>

                              {/* Monto a Pagar */}
                              <td className="px-3 py-3">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={individualAmounts[debit.id] || ''}
                                  onChange={(e) => handleIndividualAmountChange(debit.id, e.target.value)}
                                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                  placeholder="Ingrese monto"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-6 text-center">
                      <div className="text-gray-500 mb-2 text-sm">📭 No se encontraron débitos pendientes</div>
                      <button
                        onClick={() => loadPendingDebits(selectedMemberForDebts.id)}
                        className="text-amber-600 hover:text-amber-700 font-medium text-xs"
                      >
                        🔄 Cargar débitos
                      </button>
                    </div>
                  )}
                </div>
              </div>



              {/* Resumen del Pago - Solo si hay débitos con montos */}
              {(() => {
                const totalIndividualAmounts = Object.values(individualAmounts).reduce((sum, amount) => {
                  if (amount) {
                    const numericAmount = parseInt(getNumericValue(amount));
                    return sum + (isNaN(numericAmount) ? 0 : numericAmount);
                  }
                  return sum;
                }, 0);
                
                const totalSelectedDebts = calculateSelectedDebitsTotal();
                const remainingBalance = Math.max(0, totalSelectedDebts - totalIndividualAmounts);
                const hasAmounts = totalIndividualAmounts > 0;
                
                return hasAmounts && (
                  <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4 mx-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                        📊 Resumen del Pago
                      </h4>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium">
                        {selectedDebits.length} débito{selectedDebits.length !== 1 ? 's' : ''} seleccionado{selectedDebits.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                      {/* Total Adeudado */}
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="text-xs text-gray-500 mb-1">Total Adeudado</div>
                        <div className="text-lg font-bold text-red-600">
                          Gs.{totalSelectedDebts.toLocaleString('es-PY')}
                        </div>
                      </div>

                      {/* Total a Pagar */}
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="text-xs text-gray-500 mb-1">Total a Pagar</div>
                        <div className="text-lg font-bold text-green-600">
                          Gs.{totalIndividualAmounts.toLocaleString('es-PY')}
                        </div>
                      </div>

                      {/* Saldo Restante */}
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="text-xs text-gray-500 mb-1">Saldo Restante</div>
                        <div className={`text-lg font-bold ${remainingBalance <= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                          Gs.{remainingBalance.toLocaleString('es-PY')}
                        </div>
                      </div>

                      {/* Método de Pago */}
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="text-xs text-gray-500 mb-1">Método de Pago</div>
                        <div className="text-sm font-medium text-gray-800">
                          {debtPaymentForm.metodoPago || 'No seleccionado'}
                        </div>
                      </div>
                    </div>

                    {/* Indicador de Estado del Pago */}
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {remainingBalance <= 0 ? (
                        <div className="flex items-center gap-2 text-green-700 bg-green-100 px-3 py-2 rounded-lg text-sm">
                          <span className="text-lg">✅</span>
                          <div>
                            <div className="font-semibold">Pago Completo</div>
                            <div className="text-xs text-green-600">Se saldarán todos los débitos seleccionados</div>
                          </div>
                        </div>
                      ) : totalIndividualAmounts > 0 ? (
                        <div className="flex items-center gap-2 text-blue-700 bg-blue-100 px-3 py-2 rounded-lg text-sm">
                          <span className="text-lg">💡</span>
                          <div>
                            <div className="font-semibold">Pago Parcial</div>
                            <div className="text-xs text-blue-600">Quedará un saldo pendiente de Gs.{remainingBalance.toLocaleString('es-PY')}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-gray-600 bg-gray-100 px-3 py-2 rounded-lg text-sm">
                          <span className="text-lg">ℹ️</span>
                          <div>
                            <div className="font-semibold">Sin Pagos Definidos</div>
                            <div className="text-xs text-gray-500">Ingrese los montos a pagar para cada débito</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer con Acciones - Fijo en la parte inferior */}
            <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 flex-shrink-0">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-gray-600">
                    {selectedDebits.length > 0 
                      ? `${selectedDebits.length} débito${selectedDebits.length > 1 ? 's' : ''} seleccionado${selectedDebits.length > 1 ? 's' : ''}`
                      : 'Completa los datos de pago y selecciona los débitos'
                    }
                  </div>
                  

                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setShowDebtsModal(false);
                      setSelectedMemberForDebts(null);
                      setSelectedDebits([]);
                      
                      // Resetear formulario de pago de deudas
                      setDebtPaymentForm({
                        fecha: '',
                        montoAPagar: '',
                        metodoPago: '',
                        cobradorId: '',
                        numeroRecibo: '',
                        referencia: '',
                        observaciones: ''
                      });
                    }}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cerrar
                  </button>
                  
                  {selectedDebits.length > 0 && (
                    <>


                      <button
                        onClick={async () => {
                          if (!selectedMemberForDebts || !debtPaymentForm.fecha || !debtPaymentForm.metodoPago) {
                            alert('Por favor completa todos los campos requeridos.');
                            return;
                          }

                          // Calcular total basado en montos individuales
                          const totalIndividualAmounts = Object.values(individualAmounts).reduce((sum, amount) => {
                            if (amount) {
                              const numericAmount = parseInt(getNumericValue(amount));
                              return sum + (isNaN(numericAmount) ? 0 : numericAmount);
                            }
                            return sum;
                          }, 0);

                          if (totalIndividualAmounts <= 0) {
                            alert('Ingresa al menos un monto para procesar el pago.');
                            return;
                          }

                          setSaving(true);
                          try {
                            // Crear un solo pago con múltiples allocations
                            const allocations = [];
                            
                            // Recopilar todas las allocations
                            for (const debitId of Object.keys(individualAmounts)) {
                              const amount = individualAmounts[debitId];
                              if (amount) {
                                const numericAmount = parseInt(getNumericValue(amount));
                                if (numericAmount > 0) {
                                  allocations.push({
                                    debitId: debitId,
                                    amount: numericAmount
                                  });
                                }
                              }
                            }

                            if (allocations.length === 0) {
                              alert('No hay montos válidos para procesar.');
                              return;
                            }

                            // Crear un solo pago con todas las allocations
                            const paymentData = {
                              memberId: selectedMemberForDebts.id,
                              fecha: debtPaymentForm.fecha,
                              monto: totalIndividualAmounts,
                              concepto: `Pago de ${allocations.length} débito${allocations.length > 1 ? 's' : ''} pendiente${allocations.length > 1 ? 's' : ''}`,
                              formaPago: debtPaymentForm.metodoPago.toLowerCase(),
                              cobradorId: debtPaymentForm.cobradorId || '',
                              numeroRecibo: debtPaymentForm.numeroRecibo || '',
                              observaciones: debtPaymentForm.observaciones || 
                                (debtPaymentForm.referencia ? `Referencia: ${debtPaymentForm.referencia}` : ''),
                              allocations: allocations
                            };

                            // Ejecutar el pago
                            const response = await AuthClient.authenticatedFetch('/api/payments', {
                              method: 'POST',
                              body: JSON.stringify(paymentData),
                            });
                            
                            if (response.ok) {
                              alert(`¡Pago procesado exitosamente!\n\nTotal procesado: Gs. ${totalIndividualAmounts.toLocaleString('es-PY')}\nDébitos pagados: ${allocations.length}`);
                              
                              // Resetear modal y recargar datos
                              setShowDebtsModal(false);
                              setSelectedMemberForDebts(null);
                              setSelectedDebits([]);
                              setIndividualAmounts({});
                              setDebtPaymentForm({
                                fecha: '',
                                montoAPagar: '',
                                metodoPago: '',
                                cobradorId: '',
                                numeroRecibo: '',
                                referencia: '',
                                observaciones: ''
                              });
                              
                              // Recargar datos de miembros para actualizar las deudas
                              await loadMembersAndLedgers();
                            } else {
                              const errorData = await response.text();
                              throw new Error(`Error ${response.status}: ${errorData}`);
                            }

                          } catch (error) {
                            console.error('Error processing debt payments:', error);
                            alert(`Error al procesar el pago: ${error instanceof Error ? error.message : 'Error desconocido'}`);
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={(() => {
                          const totalIndividualAmounts = Object.values(individualAmounts).reduce((sum, amount) => {
                            if (amount) {
                              const numericAmount = parseInt(getNumericValue(amount));
                              return sum + (isNaN(numericAmount) ? 0 : numericAmount);
                            }
                            return sum;
                          }, 0);
                          return !debtPaymentForm.fecha || !debtPaymentForm.metodoPago || totalIndividualAmounts <= 0 || saving;
                        })()}
                        className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-400 transition-colors font-medium"
                      >
                        {saving ? (
                          <>
                            <span className="animate-spin">⟳</span> Procesando...
                          </>
                        ) : (
                          <>
                            💳 Procesar Pago
                            {(() => {
                              const totalIndividualAmounts = Object.values(individualAmounts).reduce((sum, amount) => {
                                if (amount) {
                                  const numericAmount = parseInt(getNumericValue(amount));
                                  return sum + (isNaN(numericAmount) ? 0 : numericAmount);
                                }
                                return sum;
                              }, 0);
                              return totalIndividualAmounts > 0 && (
                                <span className="ml-1 font-normal text-xs">
                                  (Gs. {totalIndividualAmounts.toLocaleString('es-PY')})
                                </span>
                              );
                            })()}
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === Modal de Reservas === */}
      {showReservaModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && handleCloseReservaModal()}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">📅 Configurar Reserva</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Complete los detalles para la reserva del servicio
                  </p>
                </div>
                <button 
                  onClick={handleCloseReservaModal} 
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Formulario */}
              <div className="space-y-4">
                {/* Espacio/Venue */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Espacio *
                  </label>
                  <select
                    value={reservaForm.venueId}
                    onChange={(e) => setReservaForm(prev => ({ ...prev, venueId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">— Seleccionar espacio —</option>
                    {venues.map(venue => (
                      <option key={venue.id} value={venue.id}>
                        {venue.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Fecha */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha *
                  </label>
                  <input
                    type="date"
                    value={reservaForm.fecha}
                    onChange={(e) => setReservaForm(prev => ({ ...prev, fecha: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Horarios */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Hora de inicio *
                    </label>
                    <input
                      type="time"
                      value={reservaForm.inicioHora}
                      onChange={(e) => setReservaForm(prev => ({ ...prev, inicioHora: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Hora de fin *
                    </label>
                    <input
                      type="time"
                      value={reservaForm.finHora}
                      onChange={(e) => setReservaForm(prev => ({ ...prev, finHora: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Observaciones */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Observaciones
                  </label>
                  <textarea
                    rows={3}
                    value={reservaForm.observaciones}
                    onChange={(e) => setReservaForm(prev => ({ ...prev, observaciones: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Detalles adicionales sobre la reserva..."
                  />
                </div>

                {/* Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    💡 <strong>Nota:</strong> Estos datos se guardarán con el concepto. 
                    La reserva real se creará en el sistema cuando se procese el pago.
                  </p>
                </div>
              </div>

              {/* Botones */}
              <div className="flex items-center gap-3 mt-6 pt-4 border-t border-gray-200">
                <button
                  onClick={handleSaveReserva}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  💾 Guardar Datos
                </button>
                <button
                  onClick={handleCloseReservaModal}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}


