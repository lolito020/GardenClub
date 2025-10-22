'use client';
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatCurrency, formatDate, getTodayParaguay, gsFormat, gsParse } from '@/lib/utils';
import {
  ArrowLeft,
  Edit,
  Users,
  CreditCard,
  FileText,
  Phone,
  Mail,
  MapPin,
  User,
  Building,
  Plus,
  X,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { analyzeSocialQuotaStatus, monthCodeToText, type SocialQuotaStatus } from '@/lib/social-quota-utils';
import GenerateAnnualQuotasModal from '@/components/modals/GenerateAnnualQuotasModal';
import RevertAnnualQuotasModal from '@/components/modals/RevertAnnualQuotasModal';

// -------------------- Tipos --------------------
type MovementType = 'DEBIT' | 'CREDIT'; // DEBIT = Debe, CREDIT = Haber
type MovementSource = 'SERVICIO' | 'CUOTA' | 'PAGO' | 'AJUSTE';

interface Movement {
  id: string;
  memberId: string;
  fecha: string; // ISO
  concepto: string;
  tipo: MovementType; // 'DEBIT'/'CREDIT'
  monto: number; // positivo
  origen?: MovementSource;
  refId?: string;
  observaciones?: string;

  // extendidos para estado/vencimiento
  paidAmount?: number;
  status?: 'PENDIENTE' | 'PARCIAL' | 'CANCELADO' | 'REFINANCIADO';
  vencimiento?: string; // YYYY-MM-DD o ISO
  allocations?: Array<{
    debitId: string;
    amount: number;
  }>;
}
interface MovementWithSaldo extends Movement {
  saldo: number;
}

type Categoria = 'Individual' | 'Familiar';

interface Member {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
  ci: string;
  ruc?: string;
  categoria: Categoria;
  subcategoria: string;
  direccion?: string;
  telefono?: string;
  celular?: string;
  email?: string;
  nacimiento?: string;
  nacionalidad?: string;
  datosLaborales?: string;
  alta: string;
  estado: string;
  foto?: string;
  servicios: string[];
  observaciones?: string;
}

interface Service {
  id: string;
  nombre: string;
  precio: number;
}

interface Payment {
  id: string;
  fecha: string; // YYYY-MM-DD
  monto: number;
  concepto: string;
  formaPago: string;
  numeroRecibo?: string;
  cobradorId?: string;
  observaciones?: string;
  allocations?: Array<{
    debitId: string;
    amount: number;
  }>;
}

interface Collector {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
  activo?: boolean;
}

interface FamilyMember {
  id: string;
  nombres: string;
  apellidos: string;
  ci: string;
  parentesco?: string;
  socioTitularId?: string;
  socioId?: string;
  memberId?: string;
}

interface Attachment {
  id: string;
  memberId: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedAt: string;
}

// Usamos la interfaz del archivo de tipos principal
import type { MemberSubscription } from '@/lib/types';

// Interfaz para créditos relacionados a un débito
interface RelatedCredit {
  id: string;
  fecha: string;
  concepto: string;
  monto: number;
  allocatedAmount: number;
  formaPago?: string;
  numeroRecibo?: string;
  tipo: 'CREDIT' | 'PAYMENT';
}

// -------------------- Helpers --------------------
function normalizeTipoMovimiento(t: string): 'DEBIT' | 'CREDIT' {
  const u = String(t || '').toUpperCase();
  if (u === 'DEBIT' || u === 'DEBE') return 'DEBIT';
  if (u === 'CREDIT' || u === 'HABER') return 'CREDIT';
  return 'DEBIT';
}

// Función para calcular estado basado en fechas de vencimiento
function calcularEstadoPorVencimientos(movimientos: any[]): 'AL_DIA' | 'ATRASADO' {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0); // Solo comparar fechas, no horas
  
  // Filtrar solo débitos pendientes (no pagados completamente)
  const debitosPendientes = movimientos.filter(mov => {
    const esDebito = normalizeTipoMovimiento(mov.tipo) === 'DEBIT';
    if (!esDebito) return false;
    
    const monto = Number(mov.monto || 0);
    const pagado = Number(mov.paidAmount || 0);
    const pendiente = monto - pagado;
    
    return pendiente > 0; // Solo considerar los que tienen saldo pendiente
  });
  
  // Si no hay débitos pendientes, está al día
  if (debitosPendientes.length === 0) return 'AL_DIA';
  
  // Revisar si algún débito pendiente ya venció
  for (const debito of debitosPendientes) {
    if (debito.vencimiento) {
      const fechaVencimiento = new Date(debito.vencimiento);
      fechaVencimiento.setHours(0, 0, 0, 0);
      
      // Si la fecha de vencimiento es anterior a hoy, está atrasado
      if (fechaVencimiento < hoy) {
        return 'ATRASADO';
      }
    }
  }
  
  // Si tiene débitos pendientes pero ninguno vencido, está al día
  return 'AL_DIA';
}

// -------------------- Componente --------------------
export default function SocioDetailPage() {
  const params = useParams();

  // Datos base
  const [member, setMember] = useState<Member | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [subs, setSubs] = useState<MemberSubscription[]>([]);
  const [loading, setLoading] = useState(true);

  // Estado de cuota social
  const [socialQuotaStatus, setSocialQuotaStatus] = useState<SocialQuotaStatus | null>(null);

  // Modales de cuotas anuales
  const [showGenerateAnnualQuotasModal, setShowGenerateAnnualQuotasModal] = useState(false);
  const [showRevertAnnualQuotasModal, setShowRevertAnnualQuotasModal] = useState(false);

  // -------------------- Helpers foto de perfil --------------------
  function resolveMediaUrl(p?: string | null) {
    if (!p) return '';
    const url = String(p);
    if (/^https?:\/\//i.test(url)) return url;
    const path = url.startsWith('/') ? url : `/${url}`;
    if (typeof window !== 'undefined' && window.location) {
      return `${window.location.origin}${path}`;
    }
    return path;
  }
  const [photoError, setPhotoError] = useState(false);
  useEffect(() => {
    setPhotoError(false);
  }, [member?.foto]);

  // Paginación de pagos
  const [payPage, setPayPage] = useState(1);
  const [payPageSize, setPayPageSize] = useState(10);

  // Familiares
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [familyLoading, setFamilyLoading] = useState(true);

  // Adjuntos
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [uploadingAttach, setUploadingAttach] = useState(false);
  const [attachMsg, setAttachMsg] = useState('');

  // Adjuntos: filtros y paginación
  const [attachQ, setAttachQ] = useState('');
  const [attachPage, setAttachPage] = useState(1);
  const [attachPageSize, setAttachPageSize] = useState(10);

  // Modal Asociar Familiar (buscar existente)
  const [showSearchFamilyModal, setShowSearchFamilyModal] = useState(false);
  
  // Modal Agregar Familiar (crear nuevo)
  const [showAddFamilyModal, setShowAddFamilyModal] = useState(false);
  const [savingFamily, setSavingFamily] = useState(false);
  const [familyMsg, setFamilyMsg] = useState<string>('');
  const [familyForm, setFamilyForm] = useState({
    nombres: '',
    apellidos: '',
    ci: '',
    parentesco: '',
    nacimiento: '',
    email: '',
    telefono: '',
  });

  // === Edición de movimientos ===
  const [showEditMv, setShowEditMv] = useState(false);
  const [editingMv, setEditingMv] = useState<Movement | null>(null);
  const [editForm, setEditForm] = useState({
    fecha: '',
    concepto: '',
    tipo: 'DEBIT' as 'DEBIT' | 'CREDIT',
    monto: '',
    observaciones: '',
    vencimiento: '', // solo para DEBIT
  });
  const [savingMv, setSavingMv] = useState(false);

  function isEditableMovement(m: Movement) {
    return m.origen !== 'PAGO';
  }

  // === Edición de pagos ===
  const [showEditPay, setShowEditPay] = useState(false);
  const [editingPay, setEditingPay] = useState<Payment | null>(null);
  const [editPayForm, setEditPayForm] = useState({
    fecha: '',
    concepto: '',
    formaPago: '',
    numeroRecibo: '',
    monto: '',
    cobradorId: '',
    observaciones: '',
  });
  const [savingPay, setSavingPay] = useState(false);

  // Movimientos / Estado de cuenta
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(true);

  // Filtros de movimientos
  const [mvFrom, setMvFrom] = useState<string>(''); // yyyy-mm-dd
  const [mvTo, setMvTo] = useState<string>(''); // yyyy-mm-dd
  const [mvType, setMvType] = useState<'ALL' | 'DEBIT' | 'CREDIT'>('ALL');
  const [mvStatus, setMvStatus] = useState<'ALL' | 'PENDIENTE' | 'PARCIAL' | 'CANCELADO'>('ALL');
  const [mvQuery, setMvQuery] = useState<string>('');

  // Paginación movimientos
  const [mvPage, setMvPage] = useState<number>(1);
  const [mvPageSize, setMvPageSize] = useState<number>(50);

  // Gestión centralizada por tipo
  const [showManageDebits, setShowManageDebits] = useState(false);
  const [showManageCredits, setShowManageCredits] = useState(false);

  // === Modal de Pagos Relacionados ===
  const [showRelatedPaymentsModal, setShowRelatedPaymentsModal] = useState(false);
  const [selectedDebit, setSelectedDebit] = useState<Movement | null>(null);
  const [relatedCredits, setRelatedCredits] = useState<RelatedCredit[]>([]);
  const [loadingRelatedCredits, setLoadingRelatedCredits] = useState(false);

  // === Edición de suscripciones ===
  const [showEditSubscriptionModal, setShowEditSubscriptionModal] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<MemberSubscription | null>(null);
  const [editSubscriptionForm, setEditSubscriptionForm] = useState({
    serviceId: '',
    price: '',
    periodicity: 'MONTHLY' as 'MONTHLY' | 'ANNUAL' | 'DAILY',
    nextChargeDate: '',
    notes: '',
  });
  const [savingEditSubscription, setSavingEditSubscription] = useState(false);
  const [editSubscriptionMsg, setEditSubscriptionMsg] = useState('');

  // Carga inicial
  useEffect(() => {
    if (params.id) {
      loadMemberData();
      loadFamilyMembers(params.id as string);
      loadMovements(params.id as string);
      loadAttachments(params.id as string);
      loadCollectors();
      loadSubscriptions(params.id as string);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Analizar estado de cuota social cuando los movimientos cambien
  useEffect(() => {
    if (movements.length > 0) {
      analyzeMemberSocialQuota();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movements]);

  // Verificación automática de categoría después de cargar datos
  useEffect(() => {
    if (member && !familyLoading && familyMembers !== null) {
      // Verificar inmediatamente si la categoría necesita actualización
      const currentFamilyCount = familyMembers.length;
      const needsUpdate = 
        (currentFamilyCount === 0 && member.categoria === 'Familiar') ||
        (currentFamilyCount > 0 && member.categoria === 'Individual');
      
      if (needsUpdate) {
        console.log(`🔍 Categoría necesita actualización automática`);
        // Pequeño delay para asegurar que todos los datos estén cargados
        const timer = setTimeout(() => {
          updateMemberCategory(member.id);
        }, 300);
        
        return () => clearTimeout(timer);
      }
    }
  }, [member, familyLoading, familyMembers]);

  // Debug: detectar modales duplicados
  useEffect(() => {
    if (showAddFamilyModal || showSearchFamilyModal) {
      setTimeout(() => {
        const modals = document.querySelectorAll('.fixed.inset-0');
        console.log('🔍 Detectados', modals.length, 'modales después de abrir');
        if (modals.length > 1) {
          console.warn('⚠️ Se detectaron múltiples modales!', modals);
        }
      }, 100);
    }
  }, [showAddFamilyModal, showSearchFamilyModal]);

  // -------------------- Loads --------------------
  async function loadMemberData() {
    try {
      const [memberRes, servicesRes, paymentsRes] = await Promise.all([
        AuthClient.authenticatedFetch(`/api/members/${params.id}`),
        AuthClient.authenticatedFetch('/api/services'),
        AuthClient.authenticatedFetch(`/api/payments?memberId=${params.id}`),
      ]);

      const [memberData, servicesData, paymentsData] = await Promise.all([
        memberRes.json(),
        servicesRes.json(),
        paymentsRes.json(),
      ]);

      setMember(memberData);
      setServices(Array.isArray(servicesData) ? servicesData : []);
      setPayments(Array.isArray(paymentsData) ? paymentsData : []);
      setPayPage(1); // reset al recargar
    } catch (error) {
      console.error('Error loading member data:', error);
    } finally {
      setLoading(false);
    }
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

  async function loadSubscriptions(memberId: string) {
    try {
      const res = await AuthClient.authenticatedFetch(`/api/members/${encodeURIComponent(memberId)}/subscriptions`);
      if (!res.ok) {
        if (res.status === 404) {
          // Es normal que no tenga suscripciones
          setSubs([]);
          return;
        }
        throw new Error(await res.text());
      }
      const data = await res.json();
      setSubs(Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      console.error('No se pudieron cargar suscripciones', e);
      setSubs([]);
    }
  }

  async function loadFamilyMembers(memberId: string) {
    try {
      const res = await AuthClient.authenticatedFetch(
        `/api/members/${memberId}/familiares`
      );
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} - ${body.slice(0, 200)}`);
      }
      if (!ct.includes('application/json')) {
        const body = await res.text();
        throw new Error(`Respuesta no JSON - ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      setFamilyMembers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Error loading family members:', e);
      setFamilyMembers([]);
    } finally {
      setFamilyLoading(false);
    }
  }

  // === Movimientos (inyecta pagos como HABER si hiciera falta) ===
  async function loadMovements(memberId: string) {
    setMovementsLoading(true);
    try {
      // 1) traer movimientos
      let res = await AuthClient.authenticatedFetch(
        `/api/members/${memberId}/movements?pageSize=1000`
      );
      if (!res.ok) {
        res = await AuthClient.authenticatedFetch(
          `/api/movements?memberId=${encodeURIComponent(memberId)}`
        );
      }

      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        const body = ct.includes('application/json') ? await res.json() : await res.text();
        throw new Error(typeof body === 'string' ? body : body?.msg || `HTTP ${res.status}`);
      }
      if (!ct.includes('application/json')) {
        const body = await res.text();
        throw new Error(`Respuesta no JSON - ${body.slice(0, 200)}`);
      }

      const data = await res.json();
      const rawMovs: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : [];

      // 2) normalizar movimientos base
      const baseMovs: Movement[] = rawMovs
        .map((m: any, idx: number) => ({
          id: String(m.id ?? `${memberId}-${m.fecha ?? m.date ?? Date.now()}-${idx}`),
          memberId: String(m.memberId ?? memberId),
          fecha: m.fecha ?? m.date ?? m.createdAt ?? new Date().toISOString(),
          concepto: m.concepto ?? m.description ?? '',
          tipo: normalizeTipoMovimiento(m.tipo ?? m.type ?? ''),
          monto: Number(m.monto ?? m.amount ?? 0),
          origen: m.origen ?? m.source ?? undefined,
          refId: m.refId ?? m.referenceId ?? undefined,
          observaciones: m.observaciones ?? m.notes ?? '',
          paidAmount: Number(m.paidAmount ?? 0),
          status: m.status as Movement['status'],
          vencimiento: m.vencimiento ?? m.dueDate ?? undefined,
          allocations: m.allocations ?? undefined, // ⭐ Incluir allocations para vincular créditos con débitos
        }))
        .filter((x) => x.concepto !== '');

      // 3) pagos → convertir a movimientos CREDIT (y conservar observaciones)
      const payRes = await AuthClient.authenticatedFetch(
        `/api/payments?memberId=${encodeURIComponent(memberId)}`
      );
      const payCt = payRes.headers.get('content-type') || '';
      let paymentsList: Payment[] = [];
      if (payRes.ok && payCt.includes('application/json')) {
        const payData = await payRes.json();
        paymentsList = Array.isArray(payData) ? payData : [];
      }

      const paymentMovs: Movement[] = paymentsList.map((p, i) => ({
        id: `pay-${p.id ?? `${memberId}-${p.fecha}-${i}`}`,
        memberId,
        fecha: p.fecha ? new Date(p.fecha).toISOString() : new Date().toISOString(),
        concepto:
          (p.concepto && String(p.concepto).trim()) ||
          `Pago${p.formaPago ? ' ' + p.formaPago : ''}${
            p.numeroRecibo ? ` • Recibo ${p.numeroRecibo}` : ''
          }`,
        tipo: 'CREDIT',
        monto: Number(p.monto) || 0,
        origen: 'PAGO',
        refId: p.id,
        observaciones: p.observaciones || '',
      }));

      // 4) fusionar y deduplicar priorizando pagos con metadata/observaciones
      const mergedAll = [...baseMovs, ...paymentMovs];

      function keyFor(m: Movement) {
        const day = new Date(m.fecha).toISOString().slice(0, 10);
        if (m.origen === 'PAGO' && m.refId) return `PAGO:${m.refId}`;
        // Para movimientos regulares, usar más criterios para evitar eliminar movimientos legítimos
        return `MOV:${day}:${Number(m.monto)}:${m.concepto}:${m.tipo}:${m.id}`;
      }
      function score(m: Movement) {
        let s = 0;
        if (m.origen === 'PAGO') s += 2;
        if (m.observaciones && m.observaciones.trim()) s += 1;
        return s;
      }

      const grouped = new Map<string, Movement>();
      for (const m of mergedAll) {
        const k = keyFor(m);
        const prev = grouped.get(k);
        if (!prev || score(m) > score(prev)) grouped.set(k, m);
      }

      const merged = Array.from(grouped.values());

      // DEBUG: Comparar antes y después de deduplicación
      if (memberId === 'm1') {
        console.log('\n=== DEBUG DEDUPLICACIÓN ===');
        console.log(`Movimientos antes deduplicación: ${mergedAll.length}`);
        console.log(`Movimientos después deduplicación: ${merged.length}`);
        console.log('\nMovimientos eliminados por deduplicación:');
        const mergedIds = new Set(merged.map(m => m.id));
        const eliminated = mergedAll.filter(m => !mergedIds.has(m.id));
        eliminated.forEach(mov => {
          console.log(`- ${mov.fecha} | ${mov.tipo} | ${mov.monto} | ${mov.concepto} | key: ${keyFor(mov)}`);
        });
      }

      // 5) orden por fecha ASC
      merged.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

      setMovements(merged);
    } catch (e) {
      console.error('No se pudo cargar movimientos', e);
      setMovements([]);
    } finally {
      setMovementsLoading(false);
    }
  }

  // Análisis de cuota social
  function analyzeMemberSocialQuota() {
    if (!movements || movements.length === 0) {
      setSocialQuotaStatus(null);
      return;
    }

    // Convertir movements al formato esperado por el analizador
    const formattedMovements = movements.map(m => ({
      id: m.id,
      fecha: m.fecha,
      concepto: m.concepto,
      observaciones: m.observaciones || '',
      monto: m.monto,
      tipo: (m.tipo === 'CREDIT' ? 'credito' : 'debito') as 'credito' | 'debito',
      socio_id: m.memberId
    }));

    const status = analyzeSocialQuotaStatus(formattedMovements);
    setSocialQuotaStatus(status);
  }

  // === Función para cargar créditos relacionados a un débito ===
  async function loadRelatedCredits(debit: Movement) {
    setLoadingRelatedCredits(true);
    setSelectedDebit(debit);
    setShowRelatedPaymentsModal(true);
    setRelatedCredits([]);

    try {
      // Buscar movimientos CREDIT que tengan allocations hacia este débito
      const creditsFromMovements = movements.filter(m => 
        m.tipo === 'CREDIT' && 
        Array.isArray(m.allocations) && 
        m.allocations.some(a => a.debitId === debit.id)
      ).map(credit => {
        const allocation = credit.allocations?.find(a => a.debitId === debit.id);
        return {
          id: credit.id,
          fecha: credit.fecha,
          concepto: credit.concepto,
          monto: credit.monto,
          allocatedAmount: allocation?.amount || 0,
          tipo: 'CREDIT' as const
        };
      });

      // Buscar pagos que tengan allocations hacia este débito
      const paymentsWithAllocations: RelatedCredit[] = [];
      for (const payment of payments) {
        // Obtener detalles del pago incluyendo allocations
        const paymentRes = await AuthClient.authenticatedFetch(`/api/payments/${payment.id}`);
        if (paymentRes.ok) {
          const paymentData = await paymentRes.json();
          if (Array.isArray(paymentData.allocations)) {
            const allocation = paymentData.allocations.find((a: any) => a.debitId === debit.id);
            if (allocation) {
              paymentsWithAllocations.push({
                id: paymentData.id,
                fecha: paymentData.fecha,
                concepto: paymentData.concepto,
                monto: paymentData.monto,
                allocatedAmount: allocation.amount || 0,
                formaPago: paymentData.formaPago,
                numeroRecibo: paymentData.numeroRecibo,
                tipo: 'PAYMENT' as const
              });
            }
          }
        }
      }

      // Combinar, ordenar y eliminar duplicados por id y debitId
      const allRelatedRaw = [...creditsFromMovements, ...paymentsWithAllocations]
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

      // Deduplicar mostrando solo 'PAYMENT' si hay duplicado con mismos datos
      const deduped: RelatedCredit[] = [];
      for (const item of allRelatedRaw) {
        // Buscar si ya existe uno igual en deduped
        const existe = deduped.find((x) =>
          x.concepto === item.concepto &&
          x.fecha === item.fecha &&
          x.monto === item.monto &&
          x.allocatedAmount === item.allocatedAmount
        );
        if (!existe) {
          deduped.push(item);
        } else if (item.tipo === 'PAYMENT' && existe.tipo !== 'PAYMENT') {
          // Si el actual es PAYMENT y el anterior no, reemplazar por PAYMENT
          const idx = deduped.indexOf(existe);
          deduped[idx] = item;
        }
        // Si ya existe y es PAYMENT, ignorar
      }
      setRelatedCredits(deduped);
    } catch (e) {
      console.error('Error al cargar créditos relacionados:', e);
      setRelatedCredits([]);
    } finally {
      setLoadingRelatedCredits(false);
    }
  }

  // Adjuntos
  async function loadAttachments(memberId: string) {
    setAttachmentsLoading(true);
    try {
      const res = await AuthClient.authenticatedFetch(
        `/api/members/${memberId}/attachments`
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} - ${body.slice(0, 200)}`);
      }
      const data = await res.json();

      const raw: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : [];

      const normalized = raw.map((a: any) => ({
        id: a.id,
        memberId: a.memberId,
        name: a.name ?? a.nombre ?? a.filename ?? 'archivo',
        type: a.type ?? a.mime ?? a.mimetype ?? '',
        size: Number(a.size) || 0,
        url: a.url,
        uploadedAt:
          a.uploadedAt ?? a.fecha ?? a.createdAt ?? new Date().toISOString(),
      }));

      setAttachments(normalized);
      setAttachPage(1);
    } catch (e) {
      console.error('No se pudo cargar adjuntos', e);
      setAttachments([]);
    } finally {
      setAttachmentsLoading(false);
    }
  }

  // -------------------- Helpers --------------------
  function computeLedger(rows: Movement[]): {
    withRunning: MovementWithSaldo[];
    totalDebe: number;
    totalHaber: number;
    saldo: number;
  } {
    const ordered = [...rows].sort(
      (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
    );

    let saldo = 0;
    const withRunning: MovementWithSaldo[] = ordered.map((m) => {
      if (m.tipo === 'DEBIT') saldo += m.monto;
      else saldo -= m.monto;
      return { ...m, saldo };
    });

    const totalDebe = ordered
      .filter((r) => r.tipo === 'DEBIT')
      .reduce((acc, r) => acc + r.monto, 0);

    const totalHaber = ordered
      .filter((r) => r.tipo === 'CREDIT')
      .reduce((acc, r) => acc + r.monto, 0);

    // El saldo final debe ser totalDebe - totalHaber
    const saldoFinal = totalDebe - totalHaber;

    return { withRunning, totalDebe, totalHaber, saldo: saldoFinal };
  }

  // Quick filters
  function setCurrentMonth() {
    const d = new Date();
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    setMvFrom(from.toISOString().slice(0, 10));
    setMvTo(to.toISOString().slice(0, 10));
    setMvPage(1);
  }
  function setCurrentYear() {
    const d = new Date();
    const from = new Date(d.getFullYear(), 0, 1);
    const to = new Date(d.getFullYear(), 11, 31);
    setMvFrom(from.toISOString().slice(0, 10));
    setMvTo(to.toISOString().slice(0, 10));
    setMvPage(1);
  }
  function clearMvFilters() {
    setMvFrom('');
    setMvTo('');
    setMvType('ALL');
    setMvStatus('ALL');
    setMvQuery('');
    setMvPage(1);
  }

  // Filtro de movimientos (client-side) para la tabla
  // Excluir movimientos DEBIT con status REFINANCIADO (los CANCELADO sí se muestran)
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      // Excluir solo débitos refinanciados
      if (m.tipo === 'DEBIT' && m.status === 'REFINANCIADO') {
        return false;
      }
      const okType = mvType === 'ALL' ? true : m.tipo === mvType;
      const okStatus = mvStatus === 'ALL' ? true : m.status === mvStatus;
      const okQuery = mvQuery
        ? (m.concepto || '').toLowerCase().includes(mvQuery.toLowerCase()) ||
          (m.observaciones || '').toLowerCase().includes(mvQuery.toLowerCase())
        : true;
      let okFrom = true,
        okTo = true;
      if (mvFrom) okFrom = new Date(m.fecha) >= new Date(mvFrom);
      if (mvTo) okTo = new Date(m.fecha) <= new Date(mvTo + 'T23:59:59');
      return okType && okStatus && okQuery && okFrom && okTo;
    });
  }, [movements, mvType, mvStatus, mvQuery, mvFrom, mvTo]);

  const { withRunning, totalDebe, totalHaber, saldo } =
    computeLedger(filteredMovements);

  // Paginación vista
  const mvTotalPages = Math.max(1, Math.ceil(withRunning.length / mvPageSize));
  const mvPageSafe = Math.min(mvPage, mvTotalPages);
  const mvStart = (mvPageSafe - 1) * mvPageSize;
  const mvEnd = mvStart + mvPageSize;
  const withRunningPage = withRunning.slice(mvStart, mvEnd);

  // Cálculo del transporte (subtotal acumulativo)
  const { transporteDebe, transporteHaber, transporteSaldo, transporteAnterior } = useMemo(() => {
    // Calcular subtotal de páginas anteriores (transporte)
    const movimientosPaginasAnteriores = withRunning.slice(0, mvStart);
    const movimientosPaginaActual = withRunningPage;
    
    // Sumar páginas anteriores (este será el "transporte" que aparece como primera fila)
    const debe1 = movimientosPaginasAnteriores.reduce((acc, m) => 
      acc + (m.tipo === 'DEBIT' ? m.monto : 0), 0);
    const haber1 = movimientosPaginasAnteriores.reduce((acc, m) => 
      acc + (m.tipo === 'CREDIT' ? m.monto : 0), 0);
    const saldo1 = debe1 - haber1;
    
    // Sumar página actual
    const debe2 = movimientosPaginaActual.reduce((acc, m) => 
      acc + (m.tipo === 'DEBIT' ? m.monto : 0), 0);
    const haber2 = movimientosPaginaActual.reduce((acc, m) => 
      acc + (m.tipo === 'CREDIT' ? m.monto : 0), 0);
    
    return {
      transporteDebe: debe1 + debe2,
      transporteHaber: haber1 + haber2,
      transporteSaldo: debe1 + debe2 - haber1 - haber2,
      transporteAnterior: { debe: debe1, haber: haber1, saldo: saldo1 } // Para mostrar como primera fila
    };
  }, [withRunning, mvStart, withRunningPage]);

  // Saldo GLOBAL
  const { saldo: saldoGlobal } = useMemo(() => {
    return computeLedger(movements);
  }, [movements]);

  // Calcular deuda real: solo débitos no pagados completamente (mismo método que página principal)
  // Calcular deuda real: solo débitos PENDIENTE o PARCIAL (nunca REFINANCIADO ni CANCELADO)
  const totalDeuda = useMemo(() => {
    const debitos = movements.filter(x =>
      normalizeTipoMovimiento(x.tipo as any) === 'DEBIT' &&
      (x.status === 'PENDIENTE' || x.status === 'PARCIAL')
    );
    const deudaReal = debitos.reduce((acc, d) => acc + Math.max(0, d.monto - (d.paidAmount || 0)), 0);
    return deudaReal;
  }, [movements]);

  // Estado calculado dinámicamente basado en fechas de vencimiento
  const estadoCalculado = useMemo(() => {
    if (!member || !movements) return member?.estado || 'AL_DIA';
    if (member.estado === 'SUSPENDIDO') return 'SUSPENDIDO';
    return calcularEstadoPorVencimientos(movements);
  }, [movements, member]);

  // Contexto para exportadores
  useEffect(() => {
    (window as any).__mv_ctx = {
      withRunning,
      totalDebe,
      totalHaber,
      saldo,
      member,
    };
  }, [withRunning, totalDebe, totalHaber, saldo, member]);

  // -------------------- UI Handlers --------------------
  // Movimientos
  function openEditMovement(m: Movement) {
    setEditingMv(m);
    setEditForm({
      fecha: m.fecha.slice(0, 10),
      concepto: m.concepto,
      tipo: m.tipo,
      monto: gsFormat(String(m.monto)),
      observaciones: m.observaciones || '',
      vencimiento: (m.vencimiento || '').slice(0, 10),
    });
    setShowEditMv(true);
  }
  function closeEditMovement() {
    setShowEditMv(false);
    setEditingMv(null);
  }
  async function saveEditMovement() {
      // Validar que la fecha de vencimiento no sea menor a la fecha del movimiento
      if (editForm.tipo === 'DEBIT' && editForm.vencimiento && editForm.fecha) {
        const fechaMv = new Date(editForm.fecha);
        const fechaVenc = new Date(editForm.vencimiento);
        if (fechaVenc < fechaMv) {
          alert('La fecha de vencimiento no puede ser menor a la fecha del movimiento.');
          setSavingMv(false);
          return;
        }
      }
    if (!member || !editingMv) return;
    setSavingMv(true);
    try {
      // Si la fecha no fue modificada, usar la original
      let fechaFinal = editForm.fecha;
      if (editingMv && fechaFinal === editingMv.fecha.slice(0, 10)) {
        fechaFinal = editingMv.fecha.slice(0, 10); // Asegurar formato YYYY-MM-DD
      }
      const payload: any = {
        fecha: fechaFinal,
        concepto: editForm.concepto,
        tipo: editForm.tipo,
        monto: gsParse(editForm.monto || ''),
        observaciones: editForm.observaciones,
      };
      if (editForm.tipo === 'DEBIT') {
        let venc = editForm.vencimiento || null;
        // Si el formato es DD/MM/YYYY, convertir a YYYY-MM-DD
        if (venc && /^\d{2}\/\d{2}\/\d{4}$/.test(venc)) {
          const [d, m, y] = venc.split('/');
          venc = `${y}-${m}-${d}`;
        }
        payload.vencimiento = venc;
      }
      // Log antes de PATCH
      console.log('PATCH vencimiento:', payload.vencimiento);
      console.log('PATCH payload completo:', JSON.stringify(payload, null, 2));
      console.log('editForm original:', JSON.stringify(editForm, null, 2));

      // intentamos ruta anidada; si devuelve 404, fallback a /api/movements/:id
      let res = await AuthClient.authenticatedFetch(
        `/api/members/${member.id}/movements/${editingMv.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (res.status === 404) {
        res = await AuthClient.authenticatedFetch(
          `/api/movements/${editingMv.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
      }

      if (!res.ok) {
        let msg = 'Error al guardar';
        let t = '';
        try {
          t = await res.text();
          const err = JSON.parse(t);
          if (err.msg) {
            if (err.msg.includes('Movimiento no encontrado')) {
              msg = 'El movimiento no existe o fue eliminado.';
            } else if (err.msg.includes('Tipo inválido')) {
              msg = 'El tipo de movimiento no es válido.';
            } else if (err.msg.includes('Vencimiento inválido') || err.msg.includes('Fecha inválida')) {
              msg = 'La fecha ingresada no es válida. Usa formato DD/MM/YYYY o YYYY-MM-DD.';
            } else {
              msg = err.msg;
            }
          }
        } catch {
          msg = t || msg;
        }
        alert(msg);
        console.error('Guardar movimiento:', msg);
        return;
      }
      await loadMovements(member.id);
      closeEditMovement();
    } catch (e) {
      alert('No se pudo guardar el movimiento');
      console.error(e);
    } finally {
      setSavingMv(false);
    }
  }
  async function deleteMovement(id: string) {
    if (!member) return;
    const ok = confirm('¿Eliminar movimiento?');
    if (!ok) return;
    try {
      let cascade = false;
      
      while (true) {
        const url = `/api/movements/${encodeURIComponent(id)}` + (cascade ? '?cascade=true' : '');
        const res = await AuthClient.authenticatedFetch(url, { method: 'DELETE' });
        
        if (res.ok) {
          await loadMovements(member.id);
          return;
        } else if (res.status === 409 && !cascade) {
          // Backend indica que hay pagos relacionados
          const data = await res.json();
          const pagos = data.relatedCredits || [];
          let msg = 'Este débito tiene pagos relacionados:\n';
          pagos.forEach((p: any, idx: number) => {
            msg += `\n${idx + 1}. ${p.fecha ? new Date(p.fecha).toLocaleDateString('es-PY') : ''} - ${p.concepto || ''} - Gs.${(p.monto || 0).toLocaleString('es-PY')}`;
          });
          msg += '\n\nSi continúas, se eliminarán también estos pagos. ¿Deseas continuar?';
          if (window.confirm(msg)) {
            cascade = true;
            // Continúa el bucle para reintentar con cascade=true
          } else {
            return;
          }
        } else {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.msg || 'Error al eliminar');
        }
      }
    } catch (e) {
      alert('No se pudo eliminar el movimiento');
      console.error(e);
    }
  }

  // Pagos
  function _openEditPayment(p: Payment) {
    setEditingPay(p);
    setEditPayForm({
      fecha: (p.fecha || '').slice(0, 10),
      concepto: p.concepto || '',
      formaPago: p.formaPago || '',
      numeroRecibo: p.numeroRecibo || '',
      monto: gsFormat(String(p.monto || '')),
      cobradorId: p.cobradorId || '',
      observaciones: p.observaciones || '',
    });
    setShowEditPay(true);
  }
  async function openEditPaymentById(paymentId: string) {
    try {
      const res = await AuthClient.authenticatedFetch(`/api/payments/${paymentId}`);
      if (!res.ok) throw new Error(await res.text());
      const p: Payment = await res.json();
      _openEditPayment(p);
    } catch (e) {
      alert('No se pudo cargar el pago');
      console.error(e);
    }
  }
  function closeEditPayment() {
    setShowEditPay(false);
    setEditingPay(null);
  }
  // Función para normalizar fecha al formato ISO
  function normalizeFecha(fecha: string): string {
    if (!fecha) return '';
    // Si ya está en formato YYYY-MM-DD, retornar
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
    // Si está en formato DD/MM/YYYY, convertir
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) {
      const [dia, mes, año] = fecha.split('/');
      return `${año}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    }
    // Si está en formato DD-MM-YYYY, convertir
    if (/^\d{2}-\d{2}-\d{4}$/.test(fecha)) {
      const [dia, mes, año] = fecha.split('-');
      return `${año}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    }
    return fecha;
  }

  async function saveEditPayment() {
    if (!editingPay) return;
    setSavingPay(true);
    try {
      // Normalizar la fecha al formato correcto
      let fechaFinal = normalizeFecha(editPayForm.fecha);
      console.log('Fecha original:', editPayForm.fecha);
      console.log('Fecha normalizada:', fechaFinal);
      
      // Siempre usar solo la parte de fecha (YYYY-MM-DD) sin hora
      fechaFinal = fechaFinal.slice(0, 10); // Asegurar formato YYYY-MM-DD
      
      const payload = { ...editPayForm, fecha: fechaFinal, monto: gsParse(editPayForm.monto || '') };
      console.log('Payload a enviar:', payload);
      
      const res = await AuthClient.authenticatedFetch(`/api/payments/${editingPay.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());

      // refrescar
      await loadMemberData();
      const memberId = (member?.id || (params.id as string)) as string;
      await loadMovements(memberId);

      closeEditPayment();
    } catch (e) {
      alert('No se pudo guardar el pago');
      console.error(e);
    } finally {
      setSavingPay(false);
    }
  }
  async function deletePayment(paymentId: string) {
    const ok = confirm('¿Eliminar pago?');
    if (!ok) return;
    try {
      const res = await AuthClient.authenticatedFetch(`/api/payments/${paymentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await res.text());

      await loadMemberData();
      const memberId = (member?.id || (params.id as string)) as string;
      await loadMovements(memberId);
    } catch (e) {
      alert('No se pudo eliminar el pago');
      console.error(e);
    }
  }

  // === Gestión de suscripciones ===
  async function toggleSubscriptionStatus(subscription: MemberSubscription) {
    if (!member) return;
    
    const newStatus = subscription.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    const actionText = newStatus === 'PAUSED' ? 'pausando' : 'reanudando';
    
    try {
      // Crear notas simples con la información de la acción
      const actionDate = new Date().toLocaleDateString('es-PY');
      const actionDetails = `${newStatus === 'PAUSED' ? 'PAUSADA' : 'REANUDADA'} el ${actionDate}`;
      
      const payload: any = {
        status: newStatus,
        notes: actionDetails,
      };

      // Para reanudación, calcular próximo vencimiento usando lógica inteligente
      if (newStatus === 'ACTIVE') {
        payload.nextChargeDate = calculateIntelligentNextCharge(subscription);
      }

      const res = await AuthClient.authenticatedFetch(
        `/api/members/${member.id}/subscriptions/${subscription.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Error al ${actionText} suscripción`);
      }

      // Recargar suscripciones para mostrar el cambio
      await loadSubscriptions(member.id);

    } catch (e: any) {
      console.error(`Error al ${actionText} suscripción:`, e);
      alert(`No se pudo ${actionText.replace('ando', 'ar').replace('eando', 'ear')} la suscripción: ${e?.message || 'Error desconocido'}`);
    }
  }

  // === Edición de suscripciones ===
  function openEditSubscriptionModal(subscription: MemberSubscription) {
    setEditingSubscription(subscription);
    
    // Normalizar la fecha para evitar problemas de zona horaria
    let nextChargeDateFormatted = '';
    if (subscription.nextChargeDate) {
      // Si la fecha viene en formato ISO, extraer solo YYYY-MM-DD
      const dateStr = subscription.nextChargeDate.split('T')[0];
      nextChargeDateFormatted = dateStr;
    }
    
    setEditSubscriptionForm({
      serviceId: subscription.serviceId,
      price: (subscription.price || 0).toString(),
      periodicity: subscription.periodicity || 'MONTHLY',
      nextChargeDate: nextChargeDateFormatted,
      notes: subscription.notes || '',
    });
    setEditSubscriptionMsg('');
    setShowEditSubscriptionModal(true);
  }

  function closeEditSubscriptionModal() {
    setShowEditSubscriptionModal(false);
    setEditingSubscription(null);
    setEditSubscriptionMsg('');
  }

  async function saveEditSubscription() {
    if (!member || !editingSubscription) return;
    
    // Validaciones
    if (!editSubscriptionForm.serviceId) {
      setEditSubscriptionMsg('Selecciona un servicio.');
      return;
    }
    
    const price = parseFloat(editSubscriptionForm.price);
    if (isNaN(price) || price <= 0) {
      setEditSubscriptionMsg('El precio debe ser un número mayor a cero.');
      return;
    }

    if (!editSubscriptionForm.nextChargeDate) {
      setEditSubscriptionMsg('La fecha de próximo cobro es requerida.');
      return;
    }

    setSavingEditSubscription(true);
    setEditSubscriptionMsg('');

    try {
      const payload = {
        serviceId: editSubscriptionForm.serviceId,
        price: price,
        periodicity: editSubscriptionForm.periodicity,
        nextChargeDate: editSubscriptionForm.nextChargeDate,
        notes: editSubscriptionForm.notes,
      };

      const res = await AuthClient.authenticatedFetch(
        `/api/members/${member.id}/subscriptions/${editingSubscription.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Error al actualizar suscripción');
      }

      // Recargar suscripciones para mostrar los cambios
      await loadSubscriptions(member.id);
      setEditSubscriptionMsg('Suscripción actualizada correctamente.');
      
      // Cerrar modal después de un momento
      setTimeout(() => {
        setSavingEditSubscription(false);
        closeEditSubscriptionModal();
      }, 1000);

    } catch (e: any) {
      console.error('Error al editar suscripción:', e);
      setEditSubscriptionMsg(e?.message || 'No se pudo actualizar la suscripción.');
      setSavingEditSubscription(false);
    }
  }

  // === Cancelación de suscripciones ===
  async function cancelSubscription(subscription: MemberSubscription) {
    if (!member) return;
    
    const serviceName = services.find(s => s.id === subscription.serviceId)?.nombre || 'Servicio desconocido';
    
    const confirmed = confirm(
      `¿Estás seguro de que quieres cancelar la suscripción a "${serviceName}"?\n\n` +
      `Esta acción no se puede deshacer y la suscripción se eliminará completamente del listado.`
    );
    
    if (!confirmed) return;

    try {
      const res = await AuthClient.authenticatedFetch(
        `/api/members/${member.id}/subscriptions/${subscription.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Error al cancelar suscripción');
      }

      // Recargar suscripciones para mostrar el cambio
      await loadSubscriptions(member.id);
      alert('Suscripción cancelada y eliminada correctamente.');

    } catch (e: any) {
      console.error('Error al cancelar suscripción:', e);
      alert(`No se pudo cancelar la suscripción: ${e?.message || 'Error desconocido'}`);
    }
  }

  // === Cálculo inteligente de próximos vencimientos ===
  function calculateIntelligentNextCharge(subscription: MemberSubscription): string {
    if (!member || !payments || payments.length === 0) {
      // Si no hay pagos, usar la lógica estándar
      return calculateStandardNextCharge(subscription);
    }

    // Filtrar pagos relacionados con este servicio
    const servicePayments = payments.filter(p => 
      p.concepto && p.concepto.toLowerCase().includes(
        services.find(s => s.id === subscription.serviceId)?.nombre.toLowerCase() || ''
      )
    ).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    if (servicePayments.length === 0) {
      return calculateStandardNextCharge(subscription);
    }

    // Obtener el último pago
    const lastPayment = servicePayments[0];
    const lastPaymentDate = new Date(lastPayment.fecha);
    
    // Calcular próximo vencimiento basado en la periodicidad
    const nextDate = new Date(lastPaymentDate);
    if (subscription.periodicity === 'MONTHLY') {
      nextDate.setMonth(nextDate.getMonth() + 1);
    } else { // ANNUAL
      nextDate.setFullYear(nextDate.getFullYear() + 1);
    }

    return nextDate.toISOString().split('T')[0];
  }

  function calculateStandardNextCharge(subscription: MemberSubscription): string {
    const today = new Date();
    let nextDate: Date;
    
    if (subscription.periodicity === 'MONTHLY') {
      nextDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    } else { // ANNUAL
      nextDate = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
    }
    
    return nextDate.toISOString().split('T')[0];
  }

  // === Recálculo masivo de vencimientos ===
  async function recalculateAllSubscriptionDates() {
    if (!member || subs.length === 0) return;

    const confirmed = confirm(
      `¿Quieres recalcular automáticamente las fechas de próximo cobro de todas las suscripciones?\n\n` +
      `Esto actualizará ${subs.filter(s => s.status === 'ACTIVE').length} suscripción(es) activa(s) basándose en el historial de pagos.`
    );
    
    if (!confirmed) return;

    try {
      let updated = 0;
      
      for (const subscription of subs) {
        if (subscription.status !== 'ACTIVE') continue;
        
        const newNextChargeDate = calculateIntelligentNextCharge(subscription);
        
        // Solo actualizar si la fecha cambió
        if (newNextChargeDate !== subscription.nextChargeDate) {
          const payload = {
            nextChargeDate: newNextChargeDate,
            notes: subscription.notes ? 
              `${subscription.notes}\nFecha recalculada automáticamente el ${new Date().toLocaleDateString('es-PY')}` :
              `Fecha recalculada automáticamente el ${new Date().toLocaleDateString('es-PY')}`
          };

          const res = await AuthClient.authenticatedFetch(
            `/api/members/${member.id}/subscriptions/${subscription.id}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            }
          );

          if (res.ok) {
            updated++;
          }
        }
      }

      // Recargar suscripciones para mostrar los cambios
      await loadSubscriptions(member.id);
      
      alert(`Recálculo completado. Se actualizaron ${updated} suscripción(es).`);

    } catch (e: any) {
      console.error('Error al recalcular fechas:', e);
      alert(`Error durante el recálculo: ${e?.message || 'Error desconocido'}`);
    }
  }

  // Adjuntos
  function openAttachModal() {
    setShowAttachModal(true);
    setAttachFiles([]);
    setAttachMsg('');
  }
  function closeAttachModal() {
    setShowAttachModal(false);
  }
  async function saveAttachments() {
    if (!member) return;
    if (!attachFiles.length) {
      setAttachMsg('Seleccioná al menos un archivo.');
      return;
    }
    setUploadingAttach(true);
    setAttachMsg('');
    try {
      for (const f of attachFiles) {
        const form = new FormData();
        form.append('file', f);
        const res = await AuthClient.authenticatedFetch(
          `/api/members/${member.id}/attachments`,
          { method: 'POST', body: form }
        );
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t);
        }
      }
      await loadAttachments(member.id);
      setAttachMsg('Adjunto(s) subido(s) correctamente.');
      setTimeout(() => {
        setUploadingAttach(false);
        closeAttachModal();
      }, 600);
    } catch (e: any) {
      console.error(e);
      setAttachMsg(e?.message || 'No se pudo subir el/los adjunto(s).');
      setUploadingAttach(false);
    }
  }
  async function deleteAttachment(attId: string) {
    if (!member) return;
    const ok = confirm('¿Eliminar adjunto?');
    if (!ok) return;

    try {
      const res = await AuthClient.authenticatedFetch(
        `/api/members/${member.id}/attachments?attachmentId=${encodeURIComponent(
          attId
        )}`,
        { method: 'DELETE' }
      );

      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        const body = ct.includes('application/json')
          ? await res.json()
          : await res.text();
        throw new Error(
          typeof body === 'string' ? body : body?.msg || `HTTP ${res.status}`
        );
      }

      await loadAttachments(member.id);
    } catch (e) {
      console.error('No se pudo eliminar adjunto', e);
      alert('No se pudo eliminar adjunto');
    }
  }

  // Utils adjuntos
  function isImage(att: Attachment) {
    return (
      att.type?.startsWith('image/') ||
      /\.(png|jpe?g|gif|webp|bmp)$/i.test(att.name)
    );
  }
  function isPDF(att: Attachment) {
    return att.type === 'application/pdf' || /\.pdf$/i.test(att.name);
  }

  // -------------------- Family Functions --------------------
  function openFamilyModal() {
    console.log('🔍 openFamilyModal llamado');
    
    // Limpiar cualquier otro modal que pueda estar abierto
    const existingModals = document.querySelectorAll('.fixed.inset-0');
    console.log('🧹 Modales existentes antes de abrir:', existingModals.length);
    
    setFamilyForm({
      nombres: '',
      apellidos: '',
      ci: '',
      parentesco: '',
      nacimiento: '',
      email: '',
      telefono: '',
    });
    setFamilyMsg('');
    setShowAddFamilyModal(true);
    console.log('📄 showAddFamilyModal establecido a true');
  }

  function closeFamilyModal() {
    setShowAddFamilyModal(false);
    setFamilyForm({
      nombres: '',
      apellidos: '',
      ci: '',
      parentesco: '',
      nacimiento: '',
      email: '',
      telefono: '',
    });
    setFamilyMsg('');
  }

  async function saveFamilyMember() {
    if (!member) return;
    
    setSavingFamily(true);
    setFamilyMsg('');
    
    try {
      if (!familyForm.nombres.trim() || !familyForm.apellidos.trim() || !familyForm.ci.trim()) {
        setFamilyMsg('Nombres, apellidos y CI son obligatorios');
        return;
      }

      const res = await AuthClient.authenticatedFetch(`/api/members/${member.id}/familiares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(familyForm),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText);
      }

      // Recargar familiares
      await loadFamilyMembers(member.id);
      
      // Pequeño delay para asegurar sincronización con la API
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Actualizar categoría automáticamente
      await updateMemberCategory(member.id);
      
      setFamilyMsg('Familiar agregado correctamente');
      setTimeout(() => {
        closeFamilyModal();
      }, 1500);
      
    } catch (e: any) {
      console.error('Error adding family member:', e);
      setFamilyMsg(`Error: ${e?.message || 'No se pudo agregar el familiar'}`);
    } finally {
      setSavingFamily(false);
    }
  }

  async function deleteFamilyMember(familyId: string, familyName: string) {
    if (!member) return;
    
    const confirmed = confirm(`¿Eliminar a ${familyName} de la familia?`);
    if (!confirmed) return;
    
    try {
      const res = await AuthClient.authenticatedFetch(`/api/families/${familyId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText);
      }

      // Recargar familiares
      await loadFamilyMembers(member.id);
      
      // Pequeño delay para asegurar sincronización con la API
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Actualizar categoría automáticamente
      await updateMemberCategory(member.id);
      
    } catch (e: any) {
      console.error('Error deleting family member:', e);
      alert(`Error: ${e?.message || 'No se pudo eliminar el familiar'}`);
    }
  }

  async function updateMemberCategory(memberId: string) {
    if (!member) return;
    
    try {
      // Obtener número actual de familiares directamente de la API
      const res = await AuthClient.authenticatedFetch(`/api/members/${memberId}/familiares`);
      if (!res.ok) {
        console.error('No se pudo obtener familiares para actualizar categoría');
        return;
      }
      
      const currentFamilies = await res.json();
      const currentFamilyCount = Array.isArray(currentFamilies) ? currentFamilies.length : 0;
      
      console.log(`� Conteo de familiares: ${currentFamilyCount}, Categoría actual: ${member.categoria}`);
      
      // Determinar la nueva categoría basándose en el conteo actual
      let newCategory = member.categoria;
      if (currentFamilyCount === 0 && member.categoria === 'Familiar') {
        newCategory = 'Individual';
      } else if (currentFamilyCount > 0 && member.categoria === 'Individual') {
        newCategory = 'Familiar';
      }
      
      // Solo actualizar si la categoría cambió
      if (newCategory !== member.categoria) {
        console.log(`🔄 Actualizando categoría: ${member.categoria} → ${newCategory}`);
        
        const updateRes = await AuthClient.authenticatedFetch(`/api/members/${memberId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoria: newCategory }),
        });

        if (!updateRes.ok) {
          const errorText = await updateRes.text();
          console.error(`❌ Error en API:`, errorText);
          throw new Error(errorText);
        }

        // Actualizar estado local del member
        setMember(prev => prev ? { ...prev, categoria: newCategory } : null);
        
        console.log(`✅ Categoría actualizada automáticamente a: ${newCategory}`);
        
      } else {
        console.log('No se requiere cambio de categoría');
      }
      
    } catch (e: any) {
      console.error('Error updating member category:', e);
      // No mostramos alert para no interrumpir el flujo del usuario
    }
  }

  // Derivados: pagos paginados
  const payTotalPages = Math.max(1, Math.ceil(payments.length / payPageSize));
  const payPageSafe = Math.min(payPage, payTotalPages);
  const paymentsPage = payments.slice(
    (payPageSafe - 1) * payPageSize,
    (payPageSafe - 1) * payPageSize + payPageSize
  );

  // Derivados: adjuntos filtrados + paginados
  const filteredAtt = useMemo(() => {
    const q = attachQ.trim().toLowerCase();
    return q
      ? attachments.filter((a) => (a.name || '').toLowerCase().includes(q))
      : attachments;
  }, [attachments, attachQ]);

  const attTotalPages = Math.max(1, Math.ceil(filteredAtt.length / attachPageSize));
  const attPageSafe = Math.min(attachPage, attTotalPages);
  const attRows = filteredAtt.slice(
    (attPageSafe - 1) * attachPageSize,
    (attPageSafe - 1) * attachPageSize + attachPageSize
  );

  // Base
  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </div>
      </AdminLayout>
    );
  }
  if (!member) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <div className="text-gray-500">Socio no encontrado</div>
          <Link
            href="/admin/socios"
            className="text-primary-600 hover:text-primary-800 mt-4 inline-block"
          >
            ← Volver a Socios
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const memberServices = services.filter((s) => member.servicios.includes(s.id));
  const ultimoPago = payments[0];

  // Helper: estado mostrado en la tabla (por si no viene status)
  function renderDebitStatus(m: Movement): 'PENDIENTE' | 'PARCIAL' | 'CANCELADO' | 'REFINANCIADO' | '—' {
  if (m.tipo !== 'DEBIT') return '—';
  if (m.status === 'PENDIENTE' || m.status === 'PARCIAL' || m.status === 'CANCELADO') return m.status;
  if (m.status === 'REFINANCIADO') return 'REFINANCIADO';
  const paid = Number(m.paidAmount || 0);
  const total = Number(m.monto || 0);
  if (paid <= 0) return 'PENDIENTE';
  if (paid >= total) return 'CANCELADO';
  return 'PARCIAL';
  }

  // Helper: renderizar estado con colores
  function renderStatusChip(m: Movement) {
    const status = renderDebitStatus(m);
    if (status === '—') return <span className="text-gray-400">—</span>;
    
    const colorMap = {
      'PENDIENTE': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'PARCIAL': 'bg-blue-100 text-blue-800 border-blue-200', 
      'CANCELADO': 'bg-green-100 text-green-800 border-green-200',
      'REFINANCIADO': 'bg-gray-200 text-gray-600 border-gray-300'
    };
    
    return (
      <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${colorMap[status]}`}>
        {status}
      </span>
    );
  }

  // -------------------- Render --------------------
  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Header Corporativo Compacto */}
        <div className="bg-white border-b border-gray-200">
          <div className="px-6 py-4">
            {/* Breadcrumbs */}
            <nav className="flex items-center text-sm text-gray-500 mb-3">
              <Link href="/admin" className="hover:text-gray-700">Panel</Link>
              <span className="mx-2">/</span>
              <Link href="/admin/socios" className="hover:text-gray-700">Socios</Link>
              <span className="mx-2">/</span>
              <span className="text-gray-900 font-medium">{member.nombres} {member.apellidos}</span>
            </nav>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href="/admin/socios" className="p-1.5 hover:bg-gray-100 rounded-md">
                  <ArrowLeft className="w-4 h-4" />
                </Link>
                <div className="flex items-center gap-3">
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900">
                      {member.nombres} {member.apellidos}
                    </h1>
                    <p className="text-sm text-gray-600">
                      {member.codigo} • {member.subcategoria}
                    </p>
                  </div>
                  {/* Badge de Estado */}
                  <div className={`px-3 py-1 rounded-full text-xs font-medium border ${
                    estadoCalculado === 'AL_DIA'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : estadoCalculado === 'ATRASADO'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-gray-50 text-gray-700 border-gray-200'
                  }`}>
                    {estadoCalculado === 'AL_DIA' ? 'Al Día' : estadoCalculado === 'ATRASADO' ? 'Atrasado' : 'Suspendido'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/socios/${member.id}/editar`}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 flex items-center gap-1.5 text-sm"
                >
                  <Edit className="w-3.5 h-3.5" />
                  Editar
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Layout Principal: 70% contenido + 30% sidebar */}
        <div className="grid grid-cols-1 xl:grid-cols-10 gap-4">
          {/* Contenido Principal (70%) */}
          <div className="xl:col-span-7 space-y-4">
            
            {/* Datos del Socio - Unificado y Compacto */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center">
                  <User className="w-4 h-4 mr-2 text-gray-500" />
                  Información del Socio
                </h3>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Datos Personales */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Datos Personales</h4>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-500">Nombres</label>
                        <div className="text-sm font-medium">{member.nombres}</div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Apellidos</label>
                        <div className="text-sm font-medium">{member.apellidos}</div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Cédula</label>
                        <div className="text-sm font-medium">{member.ci}</div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">RUC</label>
                        <div className="text-sm font-medium">{member.ruc || '-'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Información Personal */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Información Personal</h4>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-500">Nacimiento</label>
                        <div className="text-sm font-medium">
                          {member.nacimiento ? formatDate(member.nacimiento) : '-'}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Nacionalidad</label>
                        <div className="text-sm font-medium">{member.nacionalidad || '-'}</div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Fecha de Alta</label>
                        <div className="text-sm font-medium">{formatDate(member.alta)}</div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Categoría</label>
                        <div className="text-sm font-medium">{member.categoria}</div>
                      </div>
                    </div>
                  </div>

                  {/* Contacto */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contacto</h4>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-500">Teléfono</label>
                        <div className="text-sm font-medium">{member.telefono || '-'}</div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Celular</label>
                        <div className="text-sm font-medium">{member.celular || '-'}</div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Email</label>
                        <div className="text-sm font-medium">{member.email || '-'}</div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Dirección</label>
                        <div className="text-sm font-medium">{member.direccion || '-'}</div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {member.datosLaborales && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <label className="text-xs text-gray-500">Datos Laborales</label>
                    <div className="text-sm font-medium mt-1">{member.datosLaborales}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Estado de Cuota Social */}
            {socialQuotaStatus && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-800 flex items-center">
                    <CreditCard className="w-4 h-4 mr-2 text-gray-500" />
                    Estado de Cuota Social
                  </h3>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Estado Actual */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Estado Actual</h4>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-gray-500">Estado</label>
                          <div className={`text-sm font-medium flex items-center gap-2 ${
                            socialQuotaStatus.currentStatus === 'up-to-date' 
                              ? 'text-green-700' 
                              : socialQuotaStatus.currentStatus === 'behind'
                              ? 'text-red-700'
                              : 'text-gray-700'
                          }`}>
                            <span className={`inline-block w-2 h-2 rounded-full ${
                              socialQuotaStatus.currentStatus === 'up-to-date'
                                ? 'bg-green-500'
                                : socialQuotaStatus.currentStatus === 'behind'
                                ? 'bg-red-500'
                                : 'bg-gray-400'
                            }`}></span>
                            {socialQuotaStatus.currentStatus === 'up-to-date' ? 'Al día' : 
                             socialQuotaStatus.currentStatus === 'behind' ? 'Atrasado' : 'Desconocido'}
                          </div>
                        </div>
                        {socialQuotaStatus.monthsBehind > 0 && (
                          <div>
                            <label className="text-xs text-gray-500">Meses atrasados</label>
                            <div className="text-sm font-medium text-red-700">
                              {socialQuotaStatus.monthsBehind} mes{socialQuotaStatus.monthsBehind !== 1 ? 'es' : ''}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Último Pago */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Último Pago</h4>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-gray-500">Mes pagado</label>
                          <div className="text-sm font-medium">
                            {socialQuotaStatus.lastPaidMonthText || 'Sin registros'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Próximo Pago */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Próximo Pago</h4>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-gray-500">Mes sugerido</label>
                          <div className="text-sm font-medium text-blue-700">
                            {socialQuotaStatus.suggestedPaymentMonth}
                          </div>
                        </div>
                        {/* Mensaje de autocompletado eliminado por solicitud */}
                      </div>
                    </div>
                  </div>

                  {/* Botones de Gestión de Cuotas Anuales */}
                  {member && (member.subcategoria === 'Socio' || member.subcategoria === 'Socio Patrimonial') && (
                    <div className="mt-6 pt-4 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                            Gestión Anual
                          </h4>
                          <p className="text-xs text-gray-500">
                            Generar o revertir cuotas de todo el año
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowGenerateAnnualQuotasModal(true)}
                            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Generar Cuotas Anuales
                          </button>
                          <button
                            onClick={() => setShowRevertAnnualQuotasModal(true)}
                            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                          >
                            Revertir Cuotas
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Suscripciones Activas - Compacto */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center">
                  <RefreshCw className="w-4 h-4 mr-2 text-gray-500" />
                  Suscripciones Activas
                </h3>
              </div>

              <div className="p-4">
                {subs.length === 0 ? (
                  <div className="text-center py-6 text-gray-500">
                    <RefreshCw className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No hay suscripciones activas</p>
                    <p className="text-xs text-gray-400">Las suscripciones se crean desde &ldquo;Añadir servicio&rdquo;</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {subs.map((subscription) => {
                      const service = services.find(s => s.id === subscription.serviceId);
                      const serviceName = service?.nombre || 'Servicio desconocido';
                      
                      const statusColor = subscription.status === 'ACTIVE' 
                        ? 'bg-green-100 text-green-700'
                        : subscription.status === 'PAUSED'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-700';
                      
                      const statusText = subscription.status === 'ACTIVE'
                        ? 'Activa'
                        : subscription.status === 'PAUSED'
                        ? 'Pausada'
                        : 'Desconocido';

                      return (
                        <div key={subscription.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-100 hover:bg-gray-100 transition-colors">
                          <div className="flex items-center gap-3 flex-1">
                            <div className="w-6 h-6 bg-blue-100 rounded-md flex items-center justify-center">
                              <RefreshCw className="w-3 h-3 text-blue-600" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{serviceName}</span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                                  {statusText}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-gray-500 mt-0.5">
                                <span>{formatCurrency(subscription.price || 0)} • {subscription.periodicity === 'MONTHLY' ? 'Mensual' : 'Anual'}</span>
                                <span>Vencimiento: {subscription.nextChargeDate ? formatDate(subscription.nextChargeDate) : '-'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              className="px-2 py-1 text-xs border border-blue-200 text-blue-600 rounded hover:bg-blue-50 transition-colors"
                              onClick={() => openEditSubscriptionModal(subscription)}
                              title="Editar suscripción"
                            >
                              Editar
                            </button>
                            <button
                              className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50 transition-colors"
                              onClick={() => cancelSubscription(subscription)}
                              title="Cancelar y eliminar suscripción"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Historial de Pagos - Compacto */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center">
                  <CreditCard className="w-4 h-4 mr-2 text-gray-500" />
                  Historial de Pagos
                </h3>
              </div>
              <div className="p-4">
                {payments.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Fecha</th>
                            <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Concepto</th>
                            <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Forma Pago</th>
                            <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Monto</th>
                            <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Recibo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paymentsPage.map((payment) => (
                            <tr key={payment.id} className="border-b border-gray-100">
                              <td className="py-2 px-2 text-sm">{formatDate(payment.fecha)}</td>
                              <td className="py-2 px-2 text-sm">{payment.concepto}</td>
                              <td className="py-2 px-2 text-sm capitalize">{payment.formaPago}</td>
                              <td className="py-2 px-2 text-right font-medium text-sm">
                                {formatCurrency(payment.monto)}
                              </td>
                              <td className="py-2 px-2 text-sm">{payment.numeroRecibo || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Paginación compacta */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                      <div className="text-xs text-gray-500">
                        Página {payPageSafe} de {payTotalPages} • {payments.length} pagos
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={payPageSize}
                          onChange={(e) => {
                            setPayPageSize(Number(e.target.value));
                            setPayPage(1);
                          }}
                          className="px-2 py-1 border rounded text-xs"
                        >
                          <option value={5}>5</option>
                          <option value={10}>10</option>
                          <option value={20}>20</option>
                        </select>
                        <button
                          onClick={() => setPayPage((p) => Math.max(1, p - 1))}
                          className="px-2 py-1 border rounded hover:bg-gray-50 text-xs"
                          disabled={payPageSafe <= 1}
                        >
                          ‹
                        </button>
                        <button
                          onClick={() => setPayPage((p) => Math.min(payTotalPages, p + 1))}
                          className="px-2 py-1 border rounded hover:bg-gray-50 text-xs"
                          disabled={payPageSafe >= payTotalPages}
                        >
                          ›
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-gray-500 text-center py-6 text-sm">
                    No hay pagos registrados
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar (30%) */}
          <div className="xl:col-span-3 space-y-4">
            
            {/* Foto y métricas rápidas */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="p-4 text-center">
                {(() => {
                  const photoUrl = resolveMediaUrl(member.foto);
                  const src = photoUrl ? `${photoUrl}${photoUrl.includes('?') ? '&' : '?'}v=1` : '';
                  if (src && !photoError) {
                    return (
                      <img
                        src={src}
                        alt={`${member.nombres} ${member.apellidos}`}
                        className="w-20 h-20 rounded-full mx-auto object-cover mb-3 border-2 border-gray-200"
                        referrerPolicy="no-referrer"
                        onError={() => setPhotoError(true)}
                      />
                    );
                  }
                  return (
                    <div className="w-20 h-20 rounded-full mx-auto bg-gray-100 border-2 border-gray-200 flex items-center justify-center mb-3">
                      <User className="w-10 h-10 text-gray-400" />
                    </div>
                  );
                })()}
                <h4 className="font-medium text-sm text-gray-900">
                  {member.nombres} {member.apellidos}
                </h4>
                <p className="text-xs text-gray-500">{member.codigo}</p>
              </div>
              
              {/* Métricas compactas */}
              <div className="border-t border-gray-100 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Deuda Total</span>
                  <span className={`text-sm font-medium ${totalDeuda > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {totalDeuda > 0 ? formatCurrency(totalDeuda) : formatCurrency(0)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Servicios</span>
                  <span className="text-sm font-medium text-blue-600">{memberServices.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Último Pago</span>
                  <span className="text-xs font-medium">
                    {ultimoPago ? formatDate(ultimoPago.fecha) : 'Sin pagos'}
                  </span>
                </div>
                {saldoGlobal < 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Saldo a favor</span>
                    <span className="text-xs font-medium text-green-600">
                      {formatCurrency(Math.abs(saldoGlobal))}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Familiares - Compacto */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center">
                  <Users className="w-4 h-4 mr-2 text-gray-500" />
                  Familiares
                </h3>
                <button
                  type="button"
                  onClick={openFamilyModal}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Agregar Familiar"
                >
                  <Plus className="w-3 h-3 text-gray-500" />
                </button>
              </div>
              <div className="p-3">
                {familyLoading ? (
                  <div className="text-gray-500 text-xs">Cargando...</div>
                ) : familyMembers.length > 0 ? (
                  <div className="space-y-2">
                    {familyMembers.slice(0, 3).map((fam) => (
                      <div key={fam.id} className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">
                            {fam.nombres} {fam.apellidos}
                          </div>
                          <div className="text-xs text-gray-500">CI: {fam.ci}</div>
                          {fam.parentesco && (
                            <div className="text-xs text-gray-400">{fam.parentesco}</div>
                          )}
                        </div>
                        <button
                          onClick={() => deleteFamilyMember(fam.id, `${fam.nombres} ${fam.apellidos}`)}
                          className="px-1.5 py-0.5 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50 flex-shrink-0"
                          title="Eliminar familiar"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {familyMembers.length > 3 && (
                      <div className="text-xs text-gray-500 text-center pt-2 border-t border-gray-100">
                        +{familyMembers.length - 3} más
                      </div>
                    )}
                    <Link
                      href={`/admin/familiares?socio=${params.id}`}
                      className="block text-center text-xs text-blue-600 hover:text-blue-700 mt-2 pt-2 border-t border-gray-100"
                    >
                      Ver todos
                    </Link>
                  </div>
                ) : (
                  <div className="text-gray-500 text-xs text-center py-2">
                    No hay familiares asociados
                  </div>
                )}
              </div>
            </div>

            {/* Adjuntos - Completo con búsqueda y paginación */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">Adjuntos</h3>
                <button
                  onClick={openAttachModal}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Subir adjuntos"
                >
                  <Plus className="w-3 h-3 text-gray-500" />
                </button>
              </div>
              <div className="p-3">
                {/* Buscador y selector de filas */}
                <div className="space-y-2 mb-3">
                  <input
                    value={attachQ}
                    onChange={(e) => {
                      setAttachQ(e.target.value);
                      setAttachPage(1);
                    }}
                    placeholder="Buscar adjunto…"
                    className="px-2 py-1 border rounded w-full text-xs"
                  />
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-500">Filas:</label>
                    <select
                      value={attachPageSize}
                      onChange={(e) => {
                        setAttachPageSize(Number(e.target.value));
                        setAttachPage(1);
                      }}
                      className="px-2 py-1 border rounded text-xs"
                    >
                      <option value={5}>5</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                    </select>
                  </div>
                </div>

                {attachmentsLoading ? (
                  <div className="text-gray-500 text-xs">Cargando...</div>
                ) : filteredAtt.length === 0 ? (
                  <div className="text-gray-500 text-xs text-center py-2">
                    {attachQ ? 'No se encontraron adjuntos' : 'Sin adjuntos'}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {attRows.map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded border border-gray-100">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{a.name}</div>
                            <div className="text-xs text-gray-500">
                              {(a.size / 1024).toFixed(1)} KB • {new Date(a.uploadedAt).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                            >
                              Ver
                            </a>
                            <button
                              onClick={() => deleteAttachment(a.id)}
                              className="px-2 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Paginación de adjuntos */}
                    {attTotalPages > 1 && (
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                        <div className="text-xs text-gray-500">
                          Página {attPageSafe} de {attTotalPages} • {filteredAtt.length} adjuntos
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setAttachPage((p) => Math.max(1, p - 1))}
                            disabled={attPageSafe <= 1}
                            className="px-2 py-1 border rounded hover:bg-gray-50 text-xs disabled:opacity-50"
                          >
                            ‹
                          </button>
                          <button
                            onClick={() => setAttachPage((p) => Math.min(attTotalPages, p + 1))}
                            disabled={attPageSafe >= attTotalPages}
                            className="px-2 py-1 border rounded hover:bg-gray-50 text-xs disabled:opacity-50"
                          >
                            ›
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Gestión de movimientos - Compacto */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Gestión de movimientos</h3>
              <p className="text-xs text-gray-500">Editar o eliminar débitos y créditos</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowManageDebits(true)}
                className="px-2 py-1 text-xs rounded border hover:bg-gray-50"
              >
                Editar Débitos
              </button>
              <button
                onClick={() => setShowManageCredits(true)}
                className="px-2 py-1 text-xs rounded border hover:bg-gray-50"
              >
                Editar Créditos
              </button>
            </div>
          </div>
        </div>

        {/* Estado de cuenta (Movimientos) - Rediseñado */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center">
                <FileText className="w-4 h-4 mr-2 text-gray-500" />
                Estado de cuenta (Movimientos)
              </h3>
              <div className="flex gap-1">
                <button
                  onClick={exportMovementsToExcel}
                  className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                  title="Exportar Excel"
                >
                  📊 Excel
                </button>
                <button
                  onClick={exportMovementsToPDF}
                  className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                  title="Exportar PDF"
                >
                  📄 PDF
                </button>
              </div>
            </div>

            {/* Filtros compactos */}
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col">
                <label className="text-xs text-gray-500 mb-1">Desde</label>
                <input
                  type="date"
                  value={mvFrom}
                  onChange={(e) => {
                    setMvFrom(e.target.value);
                    setMvPage(1);
                  }}
                  className="px-2 py-1 border rounded text-xs"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-xs text-gray-500 mb-1">Hasta</label>
                <input
                  type="date"
                  value={mvTo}
                  onChange={(e) => {
                    setMvTo(e.target.value);
                    setMvPage(1);
                  }}
                  className="px-2 py-1 border rounded text-xs"
                />
              </div>
              <select
                value={mvType}
                onChange={(e) => {
                  setMvType(e.target.value as any);
                  setMvPage(1);
                }}
                className="px-2 py-1 border rounded text-xs"
              >
                <option value="ALL">Todos</option>
                <option value="DEBIT">Debe</option>
                <option value="CREDIT">Haber</option>
              </select>
              <select
                value={mvStatus}
                onChange={(e) => {
                  setMvStatus(e.target.value as any);
                  setMvPage(1);
                }}
                className="px-2 py-1 border rounded text-xs"
              >
                <option value="ALL">Todos estados</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="PARCIAL">Parcial</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
              <input
                type="text"
                value={mvQuery}
                onChange={(e) => {
                  setMvQuery(e.target.value);
                  setMvPage(1);
                }}
                placeholder="Buscar..."
                className="px-2 py-1 border rounded text-xs flex-1 min-w-0"
              />
              <button
                onClick={setCurrentMonth}
                className="px-2 py-1 border rounded hover:bg-gray-50 text-xs"
              >
                Mes actual
              </button>
              <button
                onClick={setCurrentYear}
                className="px-2 py-1 border rounded hover:bg-gray-50 text-xs"
              >
                Este año
              </button>
              <button
                onClick={clearMvFilters}
                className="px-2 py-1 border rounded hover:bg-gray-50 text-xs"
              >
                Limpiar
              </button>
            </div>
          </div>

          <div className="p-4">
            {movementsLoading ? (
              <div className="text-gray-500 py-6 text-center text-sm">Cargando movimientos...</div>
            ) : withRunning.length === 0 ? (
              <div className="text-gray-500 text-center py-6 text-sm">Sin movimientos</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Fecha</th>
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Concepto</th>
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Observaciones</th>
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Estado</th>
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Vence</th>
                        <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Debe</th>
                        <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Haber</th>
                        <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Saldo</th>
                        <th className="text-center py-2 px-2 text-xs font-medium text-gray-500">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Fila de transporte de páginas anteriores (solo en página 2+ Y cuando hay múltiples páginas) */}
                      {mvPageSafe > 1 && mvTotalPages > 1 && (
                        <tr className="bg-yellow-50 border-b border-yellow-200">
                          <td className="py-1.5 px-2 font-medium text-yellow-700 text-xs">—</td>
                          <td className="py-1.5 px-2 font-medium text-yellow-700 text-xs">TRANSPORTE</td>
                          <td className="py-1.5 px-2 font-medium text-yellow-700 text-xs">—</td>
                          <td className="py-1.5 px-2 font-medium text-yellow-700 text-xs">—</td>
                          <td className="py-1.5 px-2 font-medium text-yellow-700 text-xs">—</td>
                          <td className="py-1.5 px-2 text-right font-medium text-yellow-700 text-xs">
                            {transporteAnterior.debe > 0 ? formatCurrency(transporteAnterior.debe) : '-'}
                          </td>
                          <td className="py-1.5 px-2 text-right font-medium text-yellow-700 text-xs">
                            {transporteAnterior.haber > 0 ? formatCurrency(transporteAnterior.haber) : '-'}
                          </td>
                          <td className="py-1.5 px-2 text-right font-bold text-yellow-800 text-xs">
                            {formatCurrency(transporteAnterior.saldo)}
                          </td>
                          <td className="py-1.5 px-2 text-center font-medium text-yellow-700 text-xs">—</td>
                        </tr>
                      )}
                      {/* Filas normales de movimientos */}
                      {withRunningPage.map((m) => {
                        // Mostrar botón si es un débito con pagos asignados (paidAmount > 0)
                        const hasPayments = m.tipo === 'DEBIT' && Number(m.paidAmount || 0) > 0;

                        return (
                          <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-1.5 px-2 text-xs">{formatDate(m.fecha)}</td>
                            <td className="py-1.5 px-2 text-xs">{m.concepto}</td>
                            <td className="py-1.5 px-2 text-xs">{m.observaciones || '—'}</td>
                            <td className="py-1.5 px-2 text-xs">
                              {renderStatusChip(m)}
                            </td>
                            <td className="py-1.5 px-2 text-xs">
                              {m.tipo === 'DEBIT' && m.vencimiento ? formatDate(m.vencimiento) : '—'}
                            </td>
                            <td className="py-1.5 px-2 text-right text-xs">
                              {m.tipo === 'DEBIT' ? formatCurrency(m.monto) : '-'}
                            </td>
                            <td className="py-1.5 px-2 text-right text-xs">
                              {m.tipo === 'CREDIT' ? formatCurrency(m.monto) : '-'}
                            </td>
                            <td className="py-1.5 px-2 text-right font-medium text-xs">
                              {formatCurrency((m as any).saldo ?? 0)}
                            </td>
                            <td className="py-1.5 px-2 text-center text-xs">
                              {hasPayments ? (
                                <button
                                  onClick={() => loadRelatedCredits(m)}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                                  title="Ver pagos relacionados"
                                >
                                  <CreditCard className="w-3 h-3" />
                                  <span className="text-xs">Ver</span>
                                </button>
                              ) : m.tipo === 'DEBIT' ? (
                                <span className="text-gray-400 text-xs">Sin pagos</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      {/* Subtotal (Transporte) - solo cuando hay múltiples páginas */}
                      {mvTotalPages > 1 && (
                        <tr className="bg-blue-50 border-t border-blue-200">
                          <td colSpan={5} className="py-2 px-2 text-right font-medium text-blue-700 text-xs">
                            Subtotal (Transporte)
                          </td>
                          <td className="py-2 px-2 text-right font-medium text-blue-700 text-xs">
                            {formatCurrency(transporteDebe)}
                          </td>
                          <td className="py-2 px-2 text-right font-medium text-blue-700 text-xs">
                            {formatCurrency(transporteHaber)}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-blue-800 text-xs">
                            {formatCurrency(transporteSaldo)}
                          </td>
                          <td className="py-2 px-2"></td>
                        </tr>
                      )}
                      <tr className="bg-gray-50 border-t-2 border-gray-300">
                        <td colSpan={5} className="py-2 px-2 text-right font-semibold text-xs">
                          Totales
                        </td>
                        <td className="py-2 px-2 text-right font-semibold text-xs">
                          {formatCurrency(transporteDebe)}
                        </td>
                        <td className="py-2 px-2 text-right font-semibold text-xs">
                          {formatCurrency(transporteHaber)}
                        </td>
                        <td className="py-2 px-2 text-right font-bold text-xs">
                          {formatCurrency(transporteSaldo)}
                        </td>
                        <td className="py-2 px-2"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Paginación compacta */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-500">
                    Página {mvPageSafe} de {mvTotalPages} • {withRunning.length} movimientos
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs">Filas:</label>
                    <select
                      value={mvPageSize}
                      onChange={(e) => {
                        setMvPageSize(Number(e.target.value));
                        setMvPage(1);
                      }}
                      className="px-2 py-1 border rounded text-xs"
                    >
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                    </select>
                    <button
                      onClick={() => setMvPage((p) => Math.max(1, p - 1))}
                      className="px-2 py-1 border rounded hover:bg-gray-50 text-xs"
                      disabled={mvPageSafe <= 1}
                    >
                      ‹
                    </button>
                    <button
                      onClick={() => setMvPage((p) => Math.min(mvTotalPages, p + 1))}
                      className="px-2 py-1 border rounded hover:bg-gray-50 text-xs"
                      disabled={mvPageSafe >= mvTotalPages}
                    >
                      ›
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Observaciones del socio */}
        {member.observaciones && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Observaciones</h3>
              <p className="text-gray-700">{member.observaciones}</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal Asociar Familiar */}
      {showSearchFamilyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Asociar Familiar</h3>
              <button
                onClick={() => setShowSearchFamilyModal(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Socio titular */}
            <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
              <div className="font-medium">
                Socio titular: {member.nombres} {member.apellidos}
              </div>
              <div className="text-gray-600">Código: {member.codigo}</div>
            </div>

            {/* Form 2 col */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombres *
                </label>
                <input
                  type="text"
                  value={familyForm.nombres}
                  onChange={(e) =>
                    setFamilyForm((p) => ({ ...p, nombres: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ej. Ana María"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Apellidos *
                </label>
                <input
                  type="text"
                  value={familyForm.apellidos}
                  onChange={(e) =>
                    setFamilyForm((p) => ({ ...p, apellidos: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ej. Gómez Duarte"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CI *
                </label>
                <input
                  type="text"
                  value={familyForm.ci}
                  onChange={(e) =>
                    setFamilyForm((p) => ({ ...p, ci: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="1234567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Parentesco
                </label>
                <input
                  type="text"
                  value={familyForm.parentesco}
                  onChange={(e) =>
                    setFamilyForm((p) => ({ ...p, parentesco: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Hija, Esposo, etc."
                />
              </div>
            </div>

            {/* Mensajes */}
            {familyMsg && (
              <div className="mt-3 text-sm">
                <span
                  className={
                    familyMsg.toLowerCase().includes('correct')
                      ? 'text-green-600'
                      : 'text-red-600'
                  }
                >
                  {familyMsg}
                </span>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowSearchFamilyModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveFamilyMember}
                disabled={savingFamily}
                className={`px-4 py-2 rounded-lg text-white ${
                  savingFamily ? 'bg-primary-400' : 'bg-primary-500 hover:bg-primary-600'
                }`}
              >
                {savingFamily ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Adjuntos */}
      {showAttachModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Subir adjuntos</h3>
              <button
                onClick={closeAttachModal}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="file"
                multiple
                onChange={(e) => setAttachFiles(Array.from(e.target.files || []))}
                className="block w-full text-sm text-gray-700"
              />

              {/* Previews locales (solo imágenes) */}
              {attachFiles.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {attachFiles.slice(0, 9).map((f, i) => {
                    const isImg = (f as any).type?.startsWith('image/');
                    return (
                      <div
                        key={i}
                        className="border rounded p-1 h-20 flex items-center justify-center overflow-hidden"
                        title={(f as any).name}
                      >
                        {isImg ? (
                          // @ts-ignore - createObjectURL en runtime
                          <img
                            // @ts-ignore
                            src={URL.createObjectURL(f)}
                            // @ts-ignore
                            alt={(f as any).name}
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <span className="text-xs text-gray-600 text-center px-1">
                            {(f as any).name}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {attachMsg && (
                <div
                  className={`text-sm ${
                    attachMsg.includes('correct') ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {attachMsg}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeAttachModal} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={saveAttachments}
                disabled={uploadingAttach}
                className={`px-4 py-2 rounded-lg text-white ${
                  uploadingAttach ? 'bg-primary-400' : 'bg-primary-600 hover:bg-primary-700'
                }`}
              >
                {uploadingAttach ? 'Subiendo…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar movimiento (z alto) */}
      {showEditMv && editingMv && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Editar movimiento</h3>
              <button
                onClick={closeEditMovement}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1">Fecha</label>
                <input
                  type="date"
                  value={editForm.fecha}
                  onChange={(e) => setEditForm((p) => ({ ...p, fecha: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Tipo</label>
                <select
                  value={editForm.tipo}
                  onChange={(e) => setEditForm((p) => ({ ...p, tipo: e.target.value as any }))}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="DEBIT">Debe</option>
                  <option value="CREDIT">Haber</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm mb-1">Concepto</label>
                <input
                  type="text"
                  value={editForm.concepto}
                  onChange={(e) => setEditForm((p) => ({ ...p, concepto: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              {/* Fecha de vencimiento solo para DEBIT */}
              {editForm.tipo === 'DEBIT' && (
                <div className="md:col-span-2">
                  <label className="block text-sm mb-1">Fecha de vencimiento</label>
                  <input
                    type="date"
                    value={editForm.vencimiento}
                    onChange={(e) => setEditForm((p) => ({ ...p, vencimiento: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
              )}

              <div className="md:col-span-2">
                <label className="block text-sm mb-1">Monto</label>
                <input
                  type="text"
                  value={editForm.monto}
                  onChange={(e) => setEditForm((p) => ({ ...p, monto: gsFormat(e.target.value) }))}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm mb-1">Observaciones</label>
                <input
                  type="text"
                  value={editForm.observaciones}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, observaciones: e.target.value }))
                  }
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Texto libre"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeEditMovement}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveEditMovement}
                disabled={savingMv}
                className={`px-4 py-2 rounded-lg text-white ${
                  savingMv ? 'bg-primary-400' : 'bg-primary-600 hover:bg-primary-700'
                }`}
              >
                {savingMv ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar pago (z alto) */}
      {showEditPay && editingPay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Editar pago</h3>
              <button
                onClick={closeEditPayment}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1">Fecha</label>
                <input
                  type="date"
                  value={editPayForm.fecha}
                  onChange={(e) => setEditPayForm((p) => ({ ...p, fecha: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Monto</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={gsFormat(editPayForm.monto?.toString() || '')}
                  onChange={e => {
                    const formatted = gsFormat(e.target.value);
                    setEditPayForm((p) => ({ ...p, monto: gsParse(formatted).toString() }));
                  }}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm mb-1">Concepto</label>
                <input
                  type="text"
                  value={editPayForm.concepto}
                  onChange={(e) => setEditPayForm((p) => ({ ...p, concepto: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Forma de pago</label>
                <input
                  type="text"
                  value={editPayForm.formaPago}
                  onChange={(e) => setEditPayForm((p) => ({ ...p, formaPago: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">N° Recibo</label>
                <input
                  type="text"
                  value={editPayForm.numeroRecibo}
                  onChange={(e) =>
                    setEditPayForm((p) => ({ ...p, numeroRecibo: e.target.value }))
                  }
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              {/* Nuevos: Cobrador + Observaciones */}
              <div>
                <label className="block text-sm mb-1">Cobrador</label>
                <select
                  value={editPayForm.cobradorId}
                  onChange={(e) => setEditPayForm((p) => ({ ...p, cobradorId: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">Seleccionar</option>
                  {collectors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombres} {c.apellidos}{c.codigo ? ` • ${c.codigo}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm mb-1">Observaciones</label>
                <input
                  type="text"
                  value={editPayForm.observaciones}
                  onChange={(e) =>
                    setEditPayForm((p) => ({ ...p, observaciones: e.target.value }))
                  }
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeEditPayment}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveEditPayment}
                disabled={savingPay}
                className={`px-4 py-2 rounded-lg text-white ${
                  savingPay ? 'bg-primary-400' : 'bg-primary-600 hover:bg-primary-700'
                }`}
              >
                {savingPay ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modales de gestión por tipo */}
      {showManageDebits && (
        <ManageMovementsModal
          open={showManageDebits}
          onClose={() => setShowManageDebits(false)}
          type="DEBIT"
          memberId={member.id}
          allMovements={movements}
          onChanged={async () => {
            await loadMovements(member.id);
          }}
          onEditMovement={openEditMovement}
          onDeleteMovement={deleteMovement}
          onEditPaymentById={openEditPaymentById}
          onDeletePaymentById={deletePayment}
        />
      )}
      {showManageCredits && (
        <ManageMovementsModal
          open={showManageCredits}
          onClose={() => setShowManageCredits(false)}
          type="CREDIT"
          memberId={member.id}
          allMovements={movements}
          onChanged={async () => {
            await loadMovements(member.id);
          }}
          onEditMovement={openEditMovement}
          onDeleteMovement={deleteMovement}
          onEditPaymentById={openEditPaymentById}
          onDeletePaymentById={deletePayment}
        />
      )}

      {/* Modal Editar Suscripción */}
      {showEditSubscriptionModal && editingSubscription && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[65]">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Editar Suscripción</h3>
              <button
                onClick={closeEditSubscriptionModal}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Información actual de la suscripción */}
              <div className="p-3 bg-gray-50 rounded">
                <div className="font-medium">
                  {services.find(s => s.id === editingSubscription.serviceId)?.nombre || 'Servicio desconocido'}
                </div>
                <div className="text-sm text-gray-600">
                  Estado: {editingSubscription.status === 'ACTIVE' ? 'Activa' : 'Pausada'}
                </div>
              </div>

              {/* Formulario de edición */}
              <div>
                <label className="block text-sm mb-1 font-medium">
                  Servicio <span className="text-red-500">*</span>
                </label>
                <select
                  value={editSubscriptionForm.serviceId}
                  onChange={(e) => setEditSubscriptionForm(prev => ({ ...prev, serviceId: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">Seleccionar servicio</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.nombre} - {formatCurrency(service.precio)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1 font-medium">
                    Precio <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editSubscriptionForm.price ? gsFormat(editSubscriptionForm.price) : ''}
                    onChange={(e) => {
                      const raw = gsParse(e.target.value);
                      setEditSubscriptionForm(prev => ({ ...prev, price: String(raw) }));
                    }}
                    placeholder="0"
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 font-medium">Periodicidad</label>
                  <select
                    value={editSubscriptionForm.periodicity}
                    onChange={(e) => setEditSubscriptionForm(prev => ({ ...prev, periodicity: e.target.value as 'MONTHLY' | 'ANNUAL' }))}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="MONTHLY">Mensual</option>
                    <option value="ANNUAL">Anual</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm mb-1 font-medium">
                  Próximo cobro <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={editSubscriptionForm.nextChargeDate}
                  onChange={(e) => setEditSubscriptionForm(prev => ({ ...prev, nextChargeDate: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">Notas</label>
                <textarea
                  value={editSubscriptionForm.notes}
                  onChange={(e) => setEditSubscriptionForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Notas adicionales..."
                  rows={3}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              {editSubscriptionMsg && (
                <div className={`text-sm ${editSubscriptionMsg.includes('correctamente') ? 'text-green-600' : 'text-red-600'}`}>
                  {editSubscriptionMsg}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={closeEditSubscriptionModal} 
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                disabled={savingEditSubscription}
              >
                Cancelar
              </button>
              <button
                onClick={saveEditSubscription}
                disabled={savingEditSubscription || !editSubscriptionForm.serviceId || !editSubscriptionForm.price || !editSubscriptionForm.nextChargeDate}
                className={`px-4 py-2 rounded-lg text-white ${
                  savingEditSubscription || !editSubscriptionForm.serviceId || !editSubscriptionForm.price || !editSubscriptionForm.nextChargeDate
                    ? 'bg-gray-400' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {savingEditSubscription ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Agregar Familiar */}
      {showAddFamilyModal && (
        <div id="family-modal-overlay" className="fixed inset-0 bg-black/50 flex items-center justify-center z-[65]">
          <div id="family-modal-content" className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Agregar Familiar</h3>
              <button
                onClick={closeFamilyModal}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1 font-medium">
                  Nombres <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={familyForm.nombres}
                  onChange={(e) => setFamilyForm(prev => ({ ...prev, nombres: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Nombres del familiar"
                />
              </div>

              <div>
                <label className="block text-sm mb-1 font-medium">
                  Apellidos <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={familyForm.apellidos}
                  onChange={(e) => setFamilyForm(prev => ({ ...prev, apellidos: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Apellidos del familiar"
                />
              </div>

              <div>
                <label className="block text-sm mb-1 font-medium">
                  CI <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={familyForm.ci}
                  onChange={(e) => setFamilyForm(prev => ({ ...prev, ci: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Cédula de identidad"
                />
              </div>

              <div>
                <label className="block text-sm mb-1 font-medium">Parentesco</label>
                <select
                  value={familyForm.parentesco}
                  onChange={(e) => setFamilyForm(prev => ({ ...prev, parentesco: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">Seleccionar parentesco</option>
                  <option value="Cónyuge">Cónyuge</option>
                  <option value="Hijo/a">Hijo/a</option>
                  <option value="Padre">Padre</option>
                  <option value="Madre">Madre</option>
                  <option value="Hermano/a">Hermano/a</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1 font-medium">Fecha de nacimiento</label>
                <input
                  type="date"
                  value={familyForm.nacimiento || ''}
                  onChange={(e) => setFamilyForm(prev => ({ ...prev, nacimiento: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Fecha de nacimiento"
                />
              </div>

              <div>
                <label className="block text-sm mb-1 font-medium">Email</label>
                <input
                  type="email"
                  value={familyForm.email || ''}
                  onChange={(e) => setFamilyForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Email del familiar"
                />
              </div>

              <div>
                <label className="block text-sm mb-1 font-medium">Teléfono</label>
                <input
                  type="text"
                  value={familyForm.telefono || ''}
                  onChange={(e) => setFamilyForm(prev => ({ ...prev, telefono: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Teléfono del familiar"
                />
              </div>

              {familyMsg && (
                <div className={`text-sm ${familyMsg.includes('correctamente') ? 'text-green-600' : 'text-red-600'}`}>
                  {familyMsg}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={closeFamilyModal} 
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                disabled={savingFamily}
              >
                Cancelar
              </button>
              <button
                onClick={saveFamilyMember}
                disabled={savingFamily || !familyForm.nombres.trim() || !familyForm.apellidos.trim() || !familyForm.ci.trim()}
                className={`px-4 py-2 rounded-lg text-white ${
                  savingFamily || !familyForm.nombres.trim() || !familyForm.apellidos.trim() || !familyForm.ci.trim()
                    ? 'bg-gray-400' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {savingFamily ? 'Guardando…' : 'Agregar Familiar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pagos Relacionados */}
      {showRelatedPaymentsModal && selectedDebit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[65]">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Pagos Relacionados al Débito</h3>
              <button
                onClick={() => setShowRelatedPaymentsModal(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Información del Débito */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500">Fecha del Débito</label>
                  <div className="text-sm font-medium">{formatDate(selectedDebit.fecha)}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Estado</label>
                  <div className="text-sm font-medium">{renderStatusChip(selectedDebit)}</div>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500">Concepto</label>
                  <div className="text-sm font-medium">{selectedDebit.concepto}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Monto Total</label>
                  <div className="text-sm font-medium">{formatCurrency(selectedDebit.monto)}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Monto Pagado</label>
                  <div className="text-sm font-medium text-green-600">
                    {formatCurrency(selectedDebit.paidAmount || 0)}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Saldo Pendiente</label>
                  <div className="text-sm font-medium text-red-600">
                    {formatCurrency(Math.max(0, selectedDebit.monto - (selectedDebit.paidAmount || 0)))}
                  </div>
                </div>
                {selectedDebit.vencimiento && (
                  <div>
                    <label className="text-xs text-gray-500">Vencimiento</label>
                    <div className="text-sm font-medium">{formatDate(selectedDebit.vencimiento)}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Lista de Créditos/Pagos Relacionados */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center">
                <CreditCard className="w-4 h-4 mr-2" />
                Créditos y Pagos Asignados ({relatedCredits.length})
              </h4>

              {loadingRelatedCredits ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-2"></div>
                  Cargando pagos relacionados...
                </div>
              ) : relatedCredits.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No se encontraron pagos relacionados a este débito.
                </div>
              ) : (
                <div className="space-y-2">
                  {relatedCredits.map((credit, index) => (
                    <div 
                      key={credit.id} 
                      className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-gray-500">#{index + 1}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              credit.tipo === 'PAYMENT' 
                                ? 'bg-green-100 text-green-700 border border-green-200' 
                                : 'bg-blue-100 text-blue-700 border border-blue-200'
                            }`}>
                              {credit.tipo === 'PAYMENT' ? 'Pago' : 'Crédito'}
                            </span>
                          </div>
                          <div className="text-sm font-medium mb-1">{credit.concepto}</div>
                          <div className="text-xs text-gray-500 space-y-1">
                            <div>Fecha: {formatDate(credit.fecha)}</div>
                            {credit.formaPago && (
                              <div>Forma de pago: {credit.formaPago}</div>
                            )}
                            {credit.numeroRecibo && (
                              <div>Recibo: {credit.numeroRecibo}</div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500 mb-1">Monto Total</div>
                          <div className="text-sm font-medium">{formatCurrency(credit.monto)}</div>
                          <div className="text-xs text-green-600 font-medium mt-1">
                            Asignado: {formatCurrency(credit.allocatedAmount)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Resumen Total */}
              {!loadingRelatedCredits && relatedCredits.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold">Total Asignado</span>
                    <span className="text-lg font-bold text-green-600">
                      {formatCurrency(relatedCredits.reduce((sum, c) => sum + c.allocatedAmount, 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end mt-6">
              <button 
                onClick={() => setShowRelatedPaymentsModal(false)} 
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modales de Cuotas Anuales */}
      {member && (
        <>
          <GenerateAnnualQuotasModal
            open={showGenerateAnnualQuotasModal}
            onClose={() => setShowGenerateAnnualQuotasModal(false)}
            memberId={member.id}
            memberName={`${member.nombres} ${member.apellidos}`}
            memberCode={member.codigo}
            onSuccess={() => {
              loadMemberData();
              loadMovements(member.id);
            }}
          />
          <RevertAnnualQuotasModal
            open={showRevertAnnualQuotasModal}
            onClose={() => setShowRevertAnnualQuotasModal(false)}
            memberId={member.id}
            memberName={`${member.nombres} ${member.apellidos}`}
            memberCode={member.codigo}
            onSuccess={() => {
              loadMemberData();
              loadMovements(member.id);
            }}
          />
        </>
      )}
    </AdminLayout>
  );
}

// -------------------- Componente: Gestor centralizado de movimientos --------------------
function ManageMovementsModal({
  open,
  onClose,
  type,
  memberId,
  allMovements,
  onChanged,
  onEditMovement,
  onDeleteMovement,
  onEditPaymentById,
  onDeletePaymentById,
}: {
  open: boolean;
  onClose: () => void;
  type: 'DEBIT' | 'CREDIT';
  memberId: string;
  allMovements: Movement[];
  onChanged: () => Promise<void>;
  onEditMovement: (m: Movement) => void;
  onDeleteMovement: (id: string) => Promise<void> | void;
  onEditPaymentById: (paymentId: string) => Promise<void>;
  onDeletePaymentById: (paymentId: string) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filtrado solo + lista (sin alta rápida)
  const rows = useMemo(() => {
    return allMovements
      .filter((m) => m.tipo === type)
      .filter((m) =>
        q
          ? (m.concepto || '').toLowerCase().includes(q.toLowerCase()) ||
            (m.observaciones || '').toLowerCase().includes(q.toLowerCase())
          : true
      )
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [allMovements, type, q]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = rows.slice((pageSafe - 1) * pageSize, (pageSafe - 1) * pageSize + pageSize);

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            Gestionar {type === 'DEBIT' ? 'Débitos' : 'Créditos'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            ✕
          </button>
        </div>

        {/* Buscador + tamaño (sin alta rápida) */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar concepto u observación…"
            className="px-3 py-2 border rounded w-full"
          />
          <div className="flex items-center gap-2">
            <label className="text-sm">Filas:</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 border rounded"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </div>
        </div>

        {/* Lista */}
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2">Fecha</th>
                <th className="text-left py-2 px-2">Concepto</th>
                <th className="text-right py-2 px-2">Monto</th>
                <th className="text-left py-2 px-2">Observaciones</th>
                <th className="text-right py-2 px-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="py-2 px-2">{formatDate(m.fecha)}</td>
                  <td className="py-2 px-2">{m.concepto}</td>
                  <td className="py-2 px-2 text-right">{formatCurrency(m.monto)}</td>
                  <td className="py-2 px-2">{m.observaciones || '—'}</td>
                  <td className="py-2 px-2">
                    {m.origen === 'PAGO' && m.refId ? (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => onEditPaymentById(m.refId!)}
                          className="px-2 py-1 border rounded hover:bg-gray-50"
                          title="Editar"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => onDeletePaymentById(m.refId!)}
                          className="px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50"
                          title="Eliminar"
                        >
                          Eliminar
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => onEditMovement(m)}
                          className="px-2 py-1 border rounded hover:bg-gray-50"
                          title="Editar movimiento"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => onDeleteMovement(m.id)}
                          className="px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50"
                          title="Eliminar movimiento"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">
                    Sin movimientos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-600">
            Página {pageSafe} de {totalPages} • {rows.length} movs
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageSafe <= 1}
              className="px-2 py-1 border rounded hover:bg-gray-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={pageSafe >= totalPages}
              className="px-2 py-1 border rounded hover:bg-gray-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------- Export helpers --------------------
async function exportMovementsToExcel(this: void) {
  const ctx = (window as any).__mv_ctx as {
    withRunning: MovementWithSaldo[];
    totalDebe: number;
    totalHaber: number;
    saldo: number;
    member?: Member | null;
  };
  if (!ctx || !ctx.withRunning) {
    alert('No hay datos para exportar.');
    return;
  }
  const { utils, writeFile } = await import('xlsx');

  // Preparar datos del socio para el encabezado
  const memberInfo = [
    ['ESTADO DE CUENTA'],
    [],
    ['Nombre y Apellido:', `${ctx.member?.nombres ?? ''} ${ctx.member?.apellidos ?? ''}`],
    ['Nro de Socio:', ctx.member?.codigo ?? ''],
    ['Cédula:', ctx.member?.ci ?? ''],
    [],
  ];

  // Preparar movimientos con formato de miles
  const rows = ctx.withRunning.map((m) => ({
    Fecha: formatDate(m.fecha),
    Concepto: m.concepto,
    Observaciones: m.observaciones || '',
    Estado: m.tipo === 'DEBIT'
      ? (m.status ||
        (Number(m.paidAmount || 0) <= 0
          ? 'PENDIENTE'
          : Number(m.paidAmount || 0) >= Number(m.monto || 0)
          ? 'CANCELADO'
          : 'PARCIAL'))
      : '—',
    Vence: m.tipo === 'DEBIT' && m.vencimiento ? formatDate(m.vencimiento) : '—',
    Debe: m.tipo === 'DEBIT' ? (m.monto || 0).toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '',
    Haber: m.tipo === 'CREDIT' ? (m.monto || 0).toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '',
    Saldo: ((m as any).saldo ?? 0).toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  }));

  rows.push(
    {} as any,
    {
      Concepto: 'Totales',
      Debe: ctx.totalDebe.toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
      Haber: ctx.totalHaber.toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
      Saldo: ctx.saldo.toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    } as any
  );

  // Crear worksheet con información del socio primero
  const ws = utils.aoa_to_sheet(memberInfo);
  // Agregar los movimientos después del encabezado
  utils.sheet_add_json(ws, rows, { origin: -1, skipHeader: false });

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'EstadoCuenta');

  writeFile(
    wb,
    `estado-cuenta-${ctx.member?.codigo ?? ''}-${getTodayParaguay()}.xlsx`
  );
}

async function exportMovementsToPDF(this: void) {
  const ctx = (window as any).__mv_ctx as {
    withRunning: MovementWithSaldo[];
    totalDebe: number;
    totalHaber: number;
    saldo: number;
    member?: Member | null;
  };
  if (!ctx || !ctx.withRunning) {
    alert('No hay datos para exportar.');
    return;
  }
  const pdfMakeModule = await import('pdfmake/build/pdfmake');
  const pdfFontsModule = await import('pdfmake/build/vfs_fonts');
  const pdfMake = pdfMakeModule.default || pdfMakeModule;
  const pdfFonts = pdfFontsModule.default || pdfFontsModule;
  pdfMake.vfs = pdfFonts.vfs;

  const body: any[] = [
    [
      { text: 'Fecha', bold: true },
      { text: 'Concepto', bold: true },
      { text: 'Observaciones', bold: true },
      { text: 'Estado', bold: true },
      { text: 'Vence', bold: true },
      { text: 'Debe', bold: true, alignment: 'right' },
      { text: 'Haber', bold: true, alignment: 'right' },
      { text: 'Saldo', bold: true, alignment: 'right' },
    ],
  ];

  ctx.withRunning.forEach((m) => {
    const estado =
      m.tipo === 'DEBIT'
        ? (m.status ||
          (Number(m.paidAmount || 0) <= 0
            ? 'PENDIENTE'
            : Number(m.paidAmount || 0) >= Number(m.monto || 0)
            ? 'CANCELADO'
            : 'PARCIAL'))
        : '—';

    body.push([
      { text: formatDate(m.fecha) },
      { text: m.concepto },
      { text: m.observaciones || '' },
      { text: estado },
      { text: m.tipo === 'DEBIT' && m.vencimiento ? formatDate(m.vencimiento) : '—' },
      {
        text: m.tipo === 'DEBIT' ? formatCurrency(m.monto) : '-',
        alignment: 'right',
      },
      {
        text: m.tipo === 'CREDIT' ? formatCurrency(m.monto) : '-',
        alignment: 'right',
      },
      { text: formatCurrency((m as any).saldo ?? 0), alignment: 'right' },
    ]);
  });

  body.push([
    { text: 'Totales', colSpan: 5, alignment: 'right', bold: true },
    {},
    {},
    {},
    {},
    { text: formatCurrency(ctx.totalDebe), alignment: 'right', bold: true },
    { text: formatCurrency(ctx.totalHaber), alignment: 'right', bold: true },
    { text: formatCurrency(ctx.saldo), alignment: 'right', bold: true },
  ]);

  const docDefinition: any = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [30, 30, 30, 40],
    defaultStyle: { fontSize: 8 },
    content: [
      { text: 'Estado de Cuenta', style: 'header' },
      {
        text: `${ctx.member?.nombres ?? ''} ${ctx.member?.apellidos ?? ''} • ${
          ctx.member?.codigo ?? ''
        }`,
        margin: [0, 0, 0, 10],
      },
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body,
        },
        layout: 'lightHorizontalLines',
      },
    ],
    styles: {
      header: { fontSize: 12, bold: true, margin: [0, 0, 0, 8] },
    },
  };

  (pdfMake as any)
    .createPdf(docDefinition)
    .download(
      `estado-cuenta-${ctx.member?.codigo ?? ''}-${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`
    );
}

// Exponer contexto para exportadores (declaración TS)
declare global {
  interface Window {
    __mv_ctx?: any;
  }
}
