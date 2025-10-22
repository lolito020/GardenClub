'use client';

import AdminLayout from '@/components/AdminLayout';
import RefinancingModal from '@/components/modals/RefinancingModal';
import { AuthClient } from '@/lib/auth-client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCurrency, gsFormat, gsParse, xround, getTodayParaguay, formatDate } from '@/lib/utils';
import { ServiceType, PaymentItem, Service } from '@/lib/types';
import { 
  getPrecioSegunTipoMiembro, 
  calcularVencimiento, 
  calcularDiasEntreFechas,
  crearPaymentItemDefault,
  convertirTipoAPeriodicidad,
  esServicioDisponiblePara
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
  status?: 'PENDIENTE' | 'PARCIAL' | 'CANCELADO' | 'REFINANCIADO';
  allocations?: Array<{ 
    debitId?: string; 
    amount: number; 
    paymentId?: string;
    creditMovementId?: string;
  }>;
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
  tipoCobrador?: 'CLUB' | 'EXTERNO' | 'PROFESOR';
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
      // Solo marcar como atrasado si el vencimiento es ANTES de hoy
      if (v.getTime() < hoy.getTime()) return 'ATRASADO';
    }
  }
  return 'AL_DIA';
}

function addDays(isoDate: string | null | undefined, days: number) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
  const [searchField, setSearchField] = useState<'codigo' | 'ci' | 'nombre'>('nombre');
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
  const [modoReservaUnica, setModoReservaUnica] = useState(false);
  const [reservaForm, setReservaForm] = useState({
    // Datos básicos existentes
    venueId: '',
    fecha: getTodayParaguay(),
    inicioHora: '19:00',
    finHora: '03:00',
    observaciones: '',
    
    // Datos del socio (editables cuando falten)
    cedula: '',
    telefono: '',
    ruc: '',
    
    // Reserva a favor de tercero
    esParaTercero: false,
    terceroNombre: '',
    terceroCedula: '',
    terceroTelefono: '',
    terceroRuc: '',
    
    // Datos del evento
    horaExtra: false,
    cantidadHorasExtra: '',
    montoHorasExtra: '',
    
    // Acontecimiento
    acontecimiento: '',
    quinceaneraFocusNombre: '',
    noviosNombres: '',
    cumpleaneroNombre: '',
    otrosDescripcion: '',
    otrosNombrePersona: '',
    
    // Información adicional
    cantidadPersonas: '',
    observacionesGenerales: '',
    requiereApa: true
  });

  // Estados para modal de multi-reserva (múltiples espacios)
  const [showMultiReservaModal, setShowMultiReservaModal] = useState(false);
  const [selectedConceptsForReserva, setSelectedConceptsForReserva] = useState<string[]>([]);
  const [multiReservaForm, setMultiReservaForm] = useState({
    // Datos básicos comunes
    venueId: '',
    fecha: getTodayParaguay(),
    inicioHora: '19:00',
    finHora: '03:00',
    observaciones: '',
    
    // Configuración individual
    configuracionIndividual: false,
    
    // Datos del socio (editables cuando falten)
    cedula: '',
    telefono: '',
    ruc: '',
    
    // Reserva a favor de tercero
    esParaTercero: false,
    terceroNombre: '',
    terceroCedula: '',
    terceroTelefono: '',
    terceroRuc: '',
    
    // Datos del evento
    horaExtra: false,
    cantidadHorasExtra: '',
    montoHorasExtra: '',
    
    // Acontecimiento
    acontecimiento: '',
    quinceaneraFocusNombre: '',
    noviosNombres: '',
    cumpleaneroNombre: '',
    otrosDescripcion: '',
    otrosNombrePersona: '',
    
    // Información adicional
    cantidadPersonas: '',
    observacionesGenerales: '',
    requiereApa: true,
    
    // Configuraciones individuales por concepto
    configuracionesIndividuales: {} as { [conceptoId: string]: {
      inicioHora: string;
      finHora: string;
      horaExtra: boolean;
      cantidadHorasExtra: string;
      montoHorasExtra: string;
    }}
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
    
    // LISTA UNIFICADA DE CONCEPTOS - eliminando conceptosContado[] y conceptosCredito[]
    conceptos: ConceptoItem[];
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
    // LISTA UNIFICADA: Un solo concepto inicial
    conceptos: [
      {
        id: cryptoRandom(),
        servicioId: '',
        concepto: '',
        tipoServicio: 'MENSUAL',
        monto: '',
        dias: 1,
        vencimiento: addDays(getTodayParaguay(), 30),
        observaciones: '',
        condicion: 'CONTADO', // Condición inicial por defecto
      }
    ],
  });

  // Función auxiliar para crear concepto vacío con vencimiento automático
  function createEmptyConceptoWithDate(fechaBase?: string, condicion?: 'CONTADO' | 'CREDITO') {
    const concepto = createEmptyConcepto(condicion || unifiedForm.condicion);
    const fecha = fechaBase || unifiedForm.fecha || getTodayParaguay();
    
    // Calcular vencimiento automático para MENSUAL por defecto
    const vencimientoAutomatico = calcularVencimientoAutomatico(fecha, 'MENSUAL');
    return {
      ...concepto,
      vencimiento: vencimientoAutomatico,
      vencimientoManual: false // Marcar como automático
    };
  }

  // 🕐 Función para crear concepto de Hora Extra automáticamente
  function createHoraExtraConcepto(cantidadHoras: number, montoTotal: number, observaciones?: string, relatedConceptId?: string): ConceptoItem {
    // 🎯 Buscar servicio de "HORAS EXTRAS" (debería existir por loadServices)
    let horaExtraService = services.find(s => 
      s.nombre.toUpperCase().includes('HORA EXTRA') || s.nombre.toUpperCase().includes('HORAS EXTRA')
    );
    

    
    // Fallback: Si por alguna razón no existe, usar el ID conocido
    const servicioId = horaExtraService?.id || 'HORAS_EXTRAS_TEMP';
    
    if (!horaExtraService) {
      console.warn('⚠️ Servicio Horas Extras no encontrado, usando ID fallback:', servicioId);
    }
    
    return {
      id: cryptoRandom(),
      servicioId: servicioId,
      concepto: `HORA EXTRA (${cantidadHoras}h)`,
      tipoServicio: 'UNICO',
      monto: formatNumberWithSeparator(montoTotal.toString()),
      dias: 1,
      vencimiento: unifiedForm.fecha || getTodayParaguay(),
      observaciones: observaciones || `Hora extra - ${cantidadHoras} hora(s)`,
      vencimientoManual: false,
      relatedToReservaConceptId: relatedConceptId // Relacionar con concepto principal
    };
  }

  // 🔍 Función para verificar si ya existe un concepto de hora extra relacionado con una reservación
  function existeHoraExtraRelacionada(relatedConceptId: string): ConceptoItem | null {
    const conceptos = unifiedForm.conceptos;
    
    if (!conceptos || !relatedConceptId) return null;
    
    const horaExtraExistente = conceptos.find(concepto => {
      const esHoraExtra = concepto.concepto.toUpperCase().includes('HORA EXTRA') || 
                         concepto.tipoServicio === 'UNICO' && concepto.concepto.includes('h');
      const mismaRelacion = concepto.relatedToReservaConceptId === relatedConceptId;
      
      return esHoraExtra && mismaRelacion;
    });
    
    return horaExtraExistente || null;
  }

  // � Función para verificar si ya existe un concepto de hora extra similar (fallback)
  function existeHoraExtraSimilar(cantidadHoras: number, montoTotal: number, observaciones?: string): boolean {
    const conceptos = unifiedForm.conceptos;
    
    if (!conceptos) return false;
    
    return conceptos.some(concepto => {
      const esHoraExtra = concepto.concepto.toUpperCase().includes('HORA EXTRA') || 
                         concepto.tipoServicio === 'UNICO' && concepto.concepto.includes(`${cantidadHoras}h`);
      const mismoMonto = parseFloat(getNumericValueSafe(concepto.monto)) === montoTotal;
      // Comparar con las observaciones para mayor precisión
      const mismasObservaciones = observaciones && concepto.observaciones && 
                                 concepto.observaciones.includes(observaciones.substring(0, 20));
      
      return esHoraExtra && mismoMonto && mismasObservaciones;
    });
  }

  // 🔄 Función para actualizar hora extra existente en lugar de crear duplicado
  function updateExistingHoraExtra(cantidadHoras: number, montoTotal: number, observaciones?: string, relatedConceptId?: string) {
    setUnifiedForm(prev => {
      const updateConceptos = (conceptos: ConceptoItem[] = []) => conceptos.map(c => {
        const esHoraExtra = c.concepto.toUpperCase().includes('HORA EXTRA') || 
                           c.tipoServicio === 'UNICO' && c.concepto.includes('h');
        
        // 🎯 Actualizar solo si es hora extra Y está relacionado con esta reservación
        const debeActualizar = esHoraExtra && (
          (relatedConceptId && c.relatedToReservaConceptId === relatedConceptId) || 
          (!relatedConceptId && !c.relatedToReservaConceptId) // Caso fallback
        );
        
        if (debeActualizar) {
          return {
            ...c,
            concepto: `HORA EXTRA (${cantidadHoras}h)`,
            monto: formatNumberWithSeparator(montoTotal.toString()),
            observaciones: observaciones || `Hora extra - ${cantidadHoras} hora(s)`,
            relatedToReservaConceptId: relatedConceptId
          };
        }
        return c;
      });

      return { ...prev, conceptos: updateConceptos(prev.conceptos) };
    });
    
    return null; // Retornar null ya que se actualizó existente
  }

  // �🔄 Función para agregar concepto de hora extra a la sección actual
  // 🗑️ Función para eliminar conceptos de horas extra relacionados
  function removeHoraExtraConceptos(relatedConceptIds: string[]) {
    console.log('🗑️ Eliminando conceptos de horas extra relacionados:', relatedConceptIds);
    
    setUnifiedForm(prev => {
      const conceptosActualizados = prev.conceptos.filter(c => {
        const isHoraExtra = c.concepto.toLowerCase().includes('hora extra');
        const isRelated = relatedConceptIds.some(relatedId => 
          (c as any).relatedConceptoId === relatedId
        );
        
        if (isHoraExtra && isRelated) {
          console.log(`🗑️ Eliminando hora extra: ${c.concepto} (ID: ${c.id})`);
          return false;
        }
        return true;
      });
      
      return { ...prev, conceptos: conceptosActualizados };
    });
  }

  function addHoraExtraConcepto(cantidadHoras: number, montoTotal: number, observaciones?: string, relatedConceptId?: string) {
    // 🎯 PRIMERO: Verificar si ya existe hora extra relacionada con esta reservación
    if (relatedConceptId) {
      const horaExtraExistente = existeHoraExtraRelacionada(relatedConceptId);
      if (horaExtraExistente) {
        console.warn('Ya existe concepto de hora extra para esta reservación, actualizando existente');
        return updateExistingHoraExtra(cantidadHoras, montoTotal, observaciones, relatedConceptId);
      }
    }
    
    // 🔍 SEGUNDO: Verificar si existe concepto similar (fallback para casos sin relación)
    if (existeHoraExtraSimilar(cantidadHoras, montoTotal, observaciones)) {
      console.warn('Ya existe un concepto de hora extra similar, actualizando existente');
      return updateExistingHoraExtra(cantidadHoras, montoTotal, observaciones, relatedConceptId);
    }
    
    const horaExtraConcepto = createHoraExtraConcepto(cantidadHoras, montoTotal, observaciones, relatedConceptId);
    
    setUnifiedForm(prev => {
      const arr = (prev.conceptos || []).concat(horaExtraConcepto);
      return { ...prev, conceptos: arr };
    });
    
    return horaExtraConcepto;
  }

  // Helpers para manipular conceptos dentro de unifiedForm
  function addConceptoToSection(section: 'CONTADO' | 'CREDITO') {
    // Los conceptos siempre usan la condición global actual del formulario
    const newC = createEmptyConceptoWithDate(undefined, unifiedForm.condicion);
    setUnifiedForm(prev => {
      const arr = (prev.conceptos || []).concat(newC);
      return { ...prev, conceptos: arr };
    });
  }

  function removeConceptoFromSection(section: 'CONTADO' | 'CREDITO', id: string) {
    setUnifiedForm(prev => {
      const arr = (prev.conceptos || []).filter(c => c.id !== id);
      
      // Si se eliminan todos los conceptos, agregar uno vacío con la condición actual
      if (arr.length === 0) {
        arr.push(createEmptyConceptoWithDate(undefined, prev.condicion));
      }
      
      return { ...prev, conceptos: arr };
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
      
      return ({ ...prev, conceptos: updateConceptos(prev.conceptos) });
    });
  }

  // Recalcula vencimiento de todos los conceptos al cambiar la fecha global
  function handleFechaGlobalChange(newFecha: string) {
    // Asegurar que la fecha se mantiene en zona horaria Paraguay
    // cuando viene del input date, puede estar afectada por timezone del navegador
    let fechaProcessed = newFecha;
    if (newFecha) {
      // Si viene del input date, asegurar que se mantiene como YYYY-MM-DD
      // sin conversión de timezone
      const dateOnly = newFecha.split('T')[0]; // Solo la parte de fecha
      fechaProcessed = dateOnly;
    }
    
    setUnifiedForm(prev => {
      const updateVencs = (conceptos: ConceptoItem[] = []) => conceptos.map(c => {
        // Solo recalcular si el vencimiento no fue editado manualmente
        return actualizarVencimientoSiEsAutomatico(c, fechaProcessed, c.tipoServicio);
      });
      return {
        ...prev,
        fecha: fechaProcessed,
        conceptos: updateVencs(prev.conceptos)
      };
    });
  }

  // Funciones auxiliares para filtrar conceptos por condición
  function getConceptosByCondicion(condicion: 'CONTADO' | 'CREDITO'): ConceptoItem[] {
    return (unifiedForm.conceptos || []).filter(c => c.condicion === condicion);
  }

  function getAllConceptos(): ConceptoItem[] {
    return unifiedForm.conceptos || [];
  }

  // Función para manejar selección de servicio con verificación de suscripciones
  async function handleUnifiedServiceSelection(conceptoId: string, servicioId: string) {
    const svc = services.find(s => s.id === servicioId);
    if (!svc || !selectedMemberForService) return;

    const montoDefault = selectedMemberForService.subcategoria === 'NO SOCIO' 
      ? (svc.precioNoSocio ?? svc.precio) 
      : (svc.precioSocio ?? svc.precio);

    // Determinar la sección (CONTADO/CREDITO) basada en la condición actual
    const seccion = unifiedForm.condicion || 'CONTADO';

    // Actualizar datos básicos del servicio
    updateConceptoInSection(seccion, conceptoId, 'servicioId', servicioId);
    updateConceptoInSection(seccion, conceptoId, 'concepto', svc.nombre);
    updateConceptoInSection(seccion, conceptoId, 'monto', formatNumberWithSeparator(String(montoDefault)));
    updateConceptoInSection(seccion, conceptoId, 'tipoServicio', svc.tipo);

    // Verificar si hay suscripción activa y calcular vencimiento
    if (svc.tipo !== 'UNICO') {
      const sub = await findActiveSubscription(selectedMemberForService.id, servicioId);
      if (sub) {
        // Si hay suscripción activa, usar su nextChargeDate como vencimiento
        const nextChargeDate = subDue(sub);
        if (nextChargeDate) {
          updateConceptoInSection(seccion, conceptoId, 'vencimiento', nextChargeDate, true);
        }
      }
      // Si no hay suscripción, el vencimiento se calcula automáticamente por tipoServicio
    }
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

  // Estados para análisis de cuota social
  const [currentMemberMovements, setCurrentMemberMovements] = useState<Movement[]>([]);

  // Estados para el modal de deudas pendientes
  const [showDebtsModal, setShowDebtsModal] = useState(false);
  const [selectedMemberForDebts, setSelectedMemberForDebts] = useState<Member | null>(null);

  // Estado para el modal de refinanciación
  const [showRefinancingModal, setShowRefinancingModal] = useState(false);
  
  // Estados para el historial de refinanciaciones
  const [showRefinancingHistoryModal, setShowRefinancingHistoryModal] = useState(false);
  const [refinancingsHistory, setRefinancingsHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');
  
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

  // Auto-completar observaciones cuando se selecciona Cuota Social
  useEffect(() => {
    // Solo ejecutar si hay conceptos y movimientos cargados
    if (!selectedMemberForService || currentMemberMovements.length === 0) return;
    
    const allConceptos = getAllConceptos();
    
    // Verificar si hay algún concepto de cuota social
    const hasSocialQuota = allConceptos.some(concepto => {
      const service = services.find(s => s.id === concepto.servicioId);
      if (!service) return false;
      
      const name = service.nombre.toLowerCase();
      return name.includes('cuota social') || 
             name.includes('cuota mensual') ||
             name.includes('mensualidad');
    });
    
    // Si hay cuota social y las observaciones están vacías, auto-completar
    if (hasSocialQuota && !unifiedForm.observaciones) {
      const memberCode = selectedMemberForService.codigo || '';
      
      // Convertir movements al formato esperado
      const formattedMovements = currentMemberMovements.map(m => ({
        id: m.id,
        fecha: m.fecha,
        concepto: m.concepto,
        observaciones: m.observaciones || '',
        monto: m.monto,
        tipo: (m.tipo === 'CREDIT' ? 'credito' : 'debito') as 'credito' | 'debito',
        socio_id: m.memberId
      }));
      
      // Importar la función de generación de observaciones
      import('@/lib/social-quota-utils').then(({ generateSocialQuotaObservation }) => {
        const autoObservation = generateSocialQuotaObservation(memberCode, formattedMovements);
        setUnifiedForm(prev => ({ ...prev, observaciones: autoObservation }));
      });
    }
  }, [unifiedForm.conceptos, services, selectedMemberForService, currentMemberMovements, unifiedForm.observaciones]);

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
                status: mv.status ?? 'PENDIENTE',
                allocations: mv.allocations || [],
              }));
              
              // Función para calcular paidAmount dinámico basado en allocations
              const calculatePaidAmountForDebit = (debit: Movement, allMovements: Movement[]): number => {
                if (!debit || debit.tipo !== 'DEBIT') return 0;
                let total = 0;
                for (const mov of allMovements) {
                  if (mov.allocations && Array.isArray(mov.allocations)) {
                    for (const alloc of mov.allocations) {
                      if (alloc.debitId === debit.id) {
                        total += Number(alloc.amount || 0);
                      }
                    }
                  }
                }
                return total;
              };
              
              const debitos = movs.filter(x => normalizeTipoMovimiento(x.tipo as any) === 'DEBIT');
              const creditos = movs.filter(x => normalizeTipoMovimiento(x.tipo as any) === 'CREDIT');
              
              // Calcular deuda correctamente: usar allocations para calcular paidAmount dinámico
              const deudaReal = debitos
                .filter(d => d.status !== 'REFINANCIADO' && d.status !== 'CANCELADO')
                .reduce((acc, d) => {
                  const paidDynamic = calculatePaidAmountForDebit(d, movs);
                  return acc + Math.max(0, xround(d.monto) - xround(paidDynamic));
                }, 0);
              
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

  // Función helper para obtener el cobrador Garden Club
  const getGardenClubCollector = () => {
    return collectors.find(c => c.tipoCobrador === 'CLUB');
  };

  async function loadServices() {
    try {
      const res = await AuthClient.authenticatedFetch('/api/services');
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      let activeServices = list.filter((s: any) => s.activo !== false);
      
      // 🎯 Asegurar que siempre exista el servicio "Horas Extras"
      const tieneHoraExtra = activeServices.some(s => 
        s.nombre.toUpperCase().includes('HORA EXTRA') || s.nombre.toUpperCase().includes('HORAS EXTRA')
      );
      
      if (!tieneHoraExtra) {
        console.log('⚠️ Agregando servicio "Horas Extras" automáticamente');
        const horaExtraService = {
          id: 'HORAS_EXTRAS_TEMP',
          nombre: 'Horas Extras',
          precio: 0,
          tipo: 'UNICO',
          activo: true,
          descripcion: 'Servicio para conceptos de hora extra',
          permiteAgendamiento: false
        };
        activeServices.push(horaExtraService);
      }
      
      setServices(activeServices);
    } catch (e) {
      console.error('Error loading services:', e);
      // Incluso en caso de error, asegurar que existe el servicio de horas extras
      setServices([{
        id: 'HORAS_EXTRAS_TEMP',
        nombre: 'Horas Extras',
        precio: 0,
        tipo: 'UNICO',
        activo: true,
        descripcion: 'Servicio para conceptos de hora extra',
        permiteAgendamiento: false
      }]);
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
    return sub?.nextChargeDate || sub?.validUntil || sub?.nextDueDate || sub?.dueDate || sub?.vencimiento;
  }
  async function findActiveSubscription(memberId: string, serviceId: string) {
    try {
      const res = await AuthClient.authenticatedFetch(`/api/members/${encodeURIComponent(memberId)}/subscriptions`);
      const data = await res.json().catch(()=>({}));
      let arr = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
      
      // Filtrar por serviceId y status ACTIVE
      arr = arr.filter((s: any) => 
        String(s.serviceId) === String(serviceId) && 
        s.status === 'ACTIVE'
      );
      
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

    // Cargar movimientos del socio para análisis de cuota social
    await loadMemberMovements(member.id);
    
    // 🎯 MEJORA: Preseleccionar cobrador Garden Club automáticamente
    const gardenClubCollector = getGardenClubCollector();
    const defaultCobradorId = gardenClubCollector?.id || '';
    
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
      cobradorId: defaultCobradorId, // 🎯 Preseleccionar Garden Club
      numeroRecibo: '',
      referencia: '',
      permitirPagosParc: false,
      presupuestoDeudas: '',
      // Garantizar que al abrir el modal haya siempre un concepto inicial visible
      conceptos: [ 
        createEmptyConceptoWithDate(undefined, 'CONTADO')
      ],
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
    
    // 🎯 MEJORA: Preseleccionar cobrador Garden Club al resetear
    const gardenClubCollector = getGardenClubCollector();
    const defaultCobradorId = gardenClubCollector?.id || '';
    
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
      cobradorId: defaultCobradorId, // 🎯 Preseleccionar Garden Club
      numeroRecibo: '',
      referencia: '',
      permitirPagosParc: false,
      presupuestoDeudas: '',
      conceptos: [ 
        createEmptyConceptoWithDate(undefined, 'CONTADO')
      ],
    });
  };

  // ===== Modal de Reservas =====
  const handleOpenReservaModal = (conceptoId: string) => {
    setReservaConceptoId(conceptoId);
    
    // Buscar el concepto para ver si ya tiene datos de reserva y el servicio seleccionado
    const conceptos = unifiedForm.conceptos;
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
      // Cargar datos existentes completos
      setReservaForm(prev => ({
        ...getDefaultReservaForm(),
        // Datos básicos
        venueId: (concepto as any).reservaVenueId || '',
        fecha: (concepto as any).reservaFecha || getTodayParaguay(),
        inicioHora: (concepto as any).reservaHoraInicio || '19:00',
        finHora: (concepto as any).reservaHoraFin || '23:00',
        observaciones: (concepto as any).reservaObservaciones || '',
        
        // Datos del socio
        cedula: (concepto as any).reservaCedula || selectedMemberForService?.ci || '',
        telefono: (concepto as any).reservaTelefono || selectedMemberForService?.telefono || '',
        ruc: (concepto as any).reservaRuc || '',
        
        // Reserva para tercero
        esParaTercero: (concepto as any).reservaEsParaTercero || false,
        terceroNombre: (concepto as any).reservaTerceroNombre || '',
        terceroCedula: (concepto as any).reservaTerceroCedula || '',
        terceroTelefono: (concepto as any).reservaTerceroTelefono || '',
        terceroRuc: (concepto as any).reservaTerceroRuc || '',
        
        // Datos del evento
        horaExtra: (concepto as any).reservaHoraExtra || false,
        cantidadHorasExtra: (concepto as any).reservaCantidadHorasExtra || '',
        montoHorasExtra: (concepto as any).reservaMontoHorasExtra || '',
        
        // Acontecimiento
        acontecimiento: (concepto as any).reservaAcontecimiento || '',
        quinceaneraFocusNombre: (concepto as any).reservaQuinceaneraFocusNombre || '',
        noviosNombres: (concepto as any).reservaNoviosNombres || '',
        cumpleaneroNombre: (concepto as any).reservaCumpleaneroNombre || '',
        otrosDescripcion: (concepto as any).reservaOtrosDescripcion || '',
        otrosNombrePersona: (concepto as any).reservaOtrosNombrePersona || '',
        
        // Información adicional
        cantidadPersonas: (concepto as any).reservaCantidadPersonas || '',
        observacionesGenerales: (concepto as any).reservaObservacionesGenerales || '',
      }));
    } else {
      // Valores por defecto con datos del socio
      setReservaForm(prev => ({
        ...getDefaultReservaForm(),
        venueId: availableVenues.length > 0 ? availableVenues[0].id : '',
        cedula: selectedMemberForService?.ci || '',
        telefono: selectedMemberForService?.telefono || '',
      }));
    }
    
    // 🔄 Actualizar la lista de venues disponibles para este servicio específico
    setVenues(availableVenues);
    console.log(`🎯 Modal abierto para servicio: ${concepto?.servicioId} con ${availableVenues.length} espacio(s) disponible(s)`);
    setShowReservaModal(true);
  };

  const handleCloseReservaModal = () => {
    setShowReservaModal(false);
    setReservaConceptoId('');
    setReservaForm(getDefaultReservaForm());
    
    // 🔄 Restaurar venues originales cuando se cierre el modal
    loadVenues();
  };

  // Función para validar disponibilidad de horario
  const validateReservaAvailability = async (venueId: string, fecha: string, inicioHora: string, finHora: string) => {
    try {
      // Crear fechas completas con hora para la validación
      const startDateTime = new Date(`${fecha}T${inicioHora}:00`);
      let endDateTime = new Date(`${fecha}T${finHora}:00`);
      
      // Si la hora de fin es menor o igual a la de inicio, sumar un día
      if (endDateTime <= startDateTime) {
        endDateTime.setDate(endDateTime.getDate() + 1);
      }
      
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
    // Validar hora fin antes de cualquier guardado
    const toMinutes = (h: string) => {
      const [hh, mm] = h.split(":").map(Number);
      return hh * 60 + mm;
    };
    const finMin = toMinutes(reservaForm.finHora);
    const inicioMin = toMinutes(reservaForm.inicioHora);
    const bloqueado = (finMin > 180 && finMin < 480);
    const cruzaMedianoche = finMin < inicioMin;
    
    if (bloqueado && !cruzaMedianoche) {
      // Solo bloquear si no cruza medianoche
      alert("La hora de fin debe ser hasta las 03:00 am. Posterior a esa hora se cobra como hora extra.");
      return;
    }

    // Validaciones básicas
    if (!reservaConceptoId || !reservaForm.venueId || !reservaForm.fecha) {
      alert('Por favor complete todos los campos requeridos (Espacio, Fecha)');
      return;
    }

    // Validar datos del tercero si está habilitado
    if (reservaForm.esParaTercero && !reservaForm.terceroNombre.trim()) {
      alert('Por favor ingrese el nombre del tercero');
      return;
    }

    // Validar acontecimiento obligatorio
    if (!reservaForm.acontecimiento) {
      alert('Por favor seleccione un acontecimiento');
      return;
    }

    // Validar campos dependientes del acontecimiento
    if (reservaForm.acontecimiento === '15_anos' && !reservaForm.quinceaneraFocusNombre.trim()) {
      alert('Por favor ingrese el nombre de la quinceañera');
      return;
    }
    if (reservaForm.acontecimiento === 'boda' && !reservaForm.noviosNombres.trim()) {
      alert('Por favor ingrese los nombres de los novios');
      return;
    }
    if (reservaForm.acontecimiento === 'cumpleanos' && !reservaForm.cumpleaneroNombre.trim()) {
      alert('Por favor ingrese el nombre del cumpleañer@');
      return;
    }
    if (reservaForm.acontecimiento === 'otros' && !reservaForm.otrosDescripcion.trim()) {
      alert('Por favor ingrese la descripción del acontecimiento');
      return;
    }

    // Validar horas extra
    if (reservaForm.horaExtra && (!reservaForm.cantidadHorasExtra || !reservaForm.montoHorasExtra)) {
      alert('Por favor complete cantidad y monto de las horas extra');
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
      // Actualizar el concepto con TODOS los datos de reserva
      const section = unifiedForm.condicion;
      const conceptos = unifiedForm.conceptos;
      
      if (conceptos) {
        const concepto = conceptos.find(c => c.id === reservaConceptoId);
        if (concepto) {
          // Datos básicos de reserva
          updateConceptoInSection(section, reservaConceptoId, 'reservaVenueId' as any, reservaForm.venueId);
          updateConceptoInSection(section, reservaConceptoId, 'reservaFecha' as any, reservaForm.fecha);
          updateConceptoInSection(section, reservaConceptoId, 'reservaHoraInicio' as any, reservaForm.inicioHora);
          updateConceptoInSection(section, reservaConceptoId, 'reservaHoraFin' as any, reservaForm.finHora);
          updateConceptoInSection(section, reservaConceptoId, 'reservaObservaciones' as any, reservaForm.observaciones);
          
          // Calcular fecha de fin si cruza medianoche
          const toMinutes = (h: string) => {
            const [hh, mm] = h.split(":").map(Number);
            return hh * 60 + mm;
          };
          const finMin = toMinutes(reservaForm.finHora);
          const inicioMin = toMinutes(reservaForm.inicioHora);
          const cruzaMedianoche = finMin < inicioMin;
          
          if (cruzaMedianoche) {
            const fechaInicio = new Date(reservaForm.fecha);
            const fechaFin = new Date(fechaInicio);
            fechaFin.setDate(fechaFin.getDate() + 1);
            updateConceptoInSection(section, reservaConceptoId, 'reservaFechaFin' as any, fechaFin.toISOString().slice(0, 10));
          } else {
            // Si no cruza medianoche, limpiar reservaFechaFin
            updateConceptoInSection(section, reservaConceptoId, 'reservaFechaFin' as any, '');
          }
          
          // Datos del socio
          updateConceptoInSection(section, reservaConceptoId, 'reservaCedula' as any, reservaForm.cedula);
          updateConceptoInSection(section, reservaConceptoId, 'reservaTelefono' as any, reservaForm.telefono);
          updateConceptoInSection(section, reservaConceptoId, 'reservaRuc' as any, reservaForm.ruc);
          
          // Reserva para tercero
          updateConceptoInSection(section, reservaConceptoId, 'reservaEsParaTercero' as any, reservaForm.esParaTercero);
          updateConceptoInSection(section, reservaConceptoId, 'reservaTerceroNombre' as any, reservaForm.terceroNombre);
          updateConceptoInSection(section, reservaConceptoId, 'reservaTerceroCedula' as any, reservaForm.terceroCedula);
          updateConceptoInSection(section, reservaConceptoId, 'reservaTerceroTelefono' as any, reservaForm.terceroTelefono);
          updateConceptoInSection(section, reservaConceptoId, 'reservaTerceroRuc' as any, reservaForm.terceroRuc);
          
          // Datos del evento
          updateConceptoInSection(section, reservaConceptoId, 'reservaHoraExtra' as any, reservaForm.horaExtra);
          updateConceptoInSection(section, reservaConceptoId, 'reservaCantidadHorasExtra' as any, reservaForm.cantidadHorasExtra);
          updateConceptoInSection(section, reservaConceptoId, 'reservaMontoHorasExtra' as any, reservaForm.montoHorasExtra);
          
          // Acontecimiento
          updateConceptoInSection(section, reservaConceptoId, 'reservaAcontecimiento' as any, reservaForm.acontecimiento);
          updateConceptoInSection(section, reservaConceptoId, 'reservaQuinceaneraFocusNombre' as any, reservaForm.quinceaneraFocusNombre);
          updateConceptoInSection(section, reservaConceptoId, 'reservaNoviosNombres' as any, reservaForm.noviosNombres);
          updateConceptoInSection(section, reservaConceptoId, 'reservaCumpleaneroNombre' as any, reservaForm.cumpleaneroNombre);
          updateConceptoInSection(section, reservaConceptoId, 'reservaOtrosDescripcion' as any, reservaForm.otrosDescripcion);
          updateConceptoInSection(section, reservaConceptoId, 'reservaOtrosNombrePersona' as any, reservaForm.otrosNombrePersona);
          
          // Información adicional
          updateConceptoInSection(section, reservaConceptoId, 'reservaCantidadPersonas' as any, reservaForm.cantidadPersonas);
          updateConceptoInSection(section, reservaConceptoId, 'reservaObservacionesGenerales' as any, reservaForm.observacionesGenerales);
          
          // 📋 Requisitos APA
          updateConceptoInSection(section, reservaConceptoId, 'requiereApa' as any, reservaForm.requiereApa);
        }
      }

      // Preparar datos para mensajes
      const venueName = venues.find(v => v.id === reservaForm.venueId)?.nombre || 'Espacio seleccionado';
      const eventDate = formatDate(reservaForm.fecha);

      // 🕐 CREAR CONCEPTO DE HORA EXTRA AUTOMÁTICAMENTE si está configurado
  let horaExtraCreada = false;
      if (reservaForm.horaExtra && reservaForm.cantidadHorasExtra && reservaForm.montoHorasExtra) {
        try {
          const cantidadHoras = parseFloat(reservaForm.cantidadHorasExtra);
          const montoTotal = parseFloat(getNumericValueSafe(reservaForm.montoHorasExtra));
          
          if (cantidadHoras > 0 && montoTotal > 0) {
            const observacionesExtra = `Hora extra para ${venueName} - ${eventDate} (${reservaForm.inicioHora}-${reservaForm.finHora})`;
            const conceptoCreado = addHoraExtraConcepto(cantidadHoras, montoTotal, observacionesExtra, reservaConceptoId);
            horaExtraCreada = conceptoCreado !== null;
            
            // Si se creó hora extra pero no existe el servicio, agregarlo temporalmente
            if (horaExtraCreada) {
              const existeServicio = services.some(s => 
                s.nombre.toUpperCase().includes('HORA EXTRA') || s.nombre.toUpperCase().includes('HORAS EXTRA')
              );
              
              if (!existeServicio) {
                setServices(prev => [
                  ...prev,
                  {
                    id: 'HORA_EXTRA_FALLBACK',
                    nombre: 'Horas Extras',
                    precio: 0,
                    tipo: 'UNICO',
                    activo: true,
                    descripcion: 'Servicio temporal para Horas Extras'
                  }
                ]);
              }
              
              // Forzar actualización visual de la tabla de conceptos
              setUnifiedForm(prev => ({ ...prev }));
            }
          }
        } catch (error) {
          console.error('Error creating hora extra concepto:', error);
        }
      }

      // Forzar actualización visual de la tabla de conceptos
      setUnifiedForm(prev => {
        // Si se creó hora extra, ya está agregada por addHoraExtraConcepto
        // Solo forzamos un nuevo objeto para disparar el re-render
        return { ...prev };
      });

      handleCloseReservaModal();

      // Mensaje de confirmación mejorado
      const eventType = reservaForm.acontecimiento ? 
        ({ '15_anos': '15 años', 'boda': 'Boda', 'cumpleanos': 'Cumpleaños', 'otros': 'Otros' }[reservaForm.acontecimiento] || '') : 
        'Sin especificar';

      const horaExtraMsg = horaExtraCreada ? '\n\n🕐 ¡Concepto de Hora Extra agregado automáticamente!' : '';

      alert(`✅ Configuración de reserva guardada exitosamente!\n\n📍 ${venueName}\n📅 ${eventDate}\n🕐 ${reservaForm.inicioHora} - ${reservaForm.finHora}\n🎉 ${eventType}${horaExtraMsg}\n\nLa reserva se creará automáticamente al procesar el pago.`);
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

      // Extraer los items correctamente según la estructura de respuesta
      let arr: any[] = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : [];
      
      // Si no hay datos, intentar endpoint alternativo (fallback)
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
        status: m.status || 'PENDIENTE', // Incluir el estado
        refinancingId: m.refinancingId // Incluir ID de refinanciación
      } as any)).filter(d => {
        // Filtrar débitos que no estén refinanciados y tengan saldo pendiente
        const status = (d as any).status || 'PENDIENTE';
        const isPending = (d.paidAmount || 0) < (d.monto || 0);
        // Excluir solo débitos refinanciados
        if (status === 'REFINANCIADO') {
          return false;
        }
        // Solo incluir si tiene saldo pendiente
        if (!isPending) {
          return false;
        }
        return true;
      });
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

  // ===== Cargar movimientos del socio para análisis de cuota social =====
  async function loadMemberMovements(memberId: string) {
    try {
      // Cargar todos los movimientos del socio (tanto débitos como créditos)
      let res = await AuthClient.authenticatedFetch(`/api/members/${memberId}/movements?pageSize=1000`);
      if (!res.ok) {
        res = await AuthClient.authenticatedFetch(`/api/movements?memberId=${encodeURIComponent(memberId)}&pageSize=1000`);
      }
      
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        throw new Error('Error al cargar movimientos');
      }
      
      const raw = await res.json();
      const arr: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
      
      const movements: Movement[] = arr.map((mv: any) => ({
        id: String(mv.id ?? ''),
        memberId: String(mv.memberId ?? memberId),
        fecha: mv.fecha ?? mv.date ?? new Date().toISOString(),
        concepto: String(mv.concepto ?? mv.description ?? ''),
        tipo: normalizeTipoMovimiento(mv.tipo ?? mv.type ?? ''),
        monto: Number(mv.monto ?? mv.amount ?? 0),
        origen: mv.origen ?? mv.source ?? undefined,
        refId: mv.refId ?? mv.referenceId ?? undefined,
        vencimiento: mv.vencimiento ?? mv.dueDate ?? undefined,
        paidAmount: Number(mv.paidAmount ?? 0),
        observaciones: mv.observaciones ?? mv.observations ?? '',
      }));
      
      setCurrentMemberMovements(movements);
    } catch (e) {
      console.error('Error loading member movements for social quota analysis:', e);
      setCurrentMemberMovements([]);
    }
  }

  // ===== Historial de refinanciaciones =====
  async function loadRefinancingsHistory(memberId: string) {
    setLoadingHistory(true);
    setHistoryError('');
    try {
      const response = await AuthClient.authenticatedFetch(`/api/refinancing/history?memberId=${encodeURIComponent(memberId)}`);
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const refinancings = await response.json();
      
      // Ordenar por fecha de creación (más recientes primero)
      refinancings.sort((a: any, b: any) => {
        const aDate = new Date(a.createdAt || a.updatedAt).getTime();
        const bDate = new Date(b.createdAt || b.updatedAt).getTime();
        return bDate - aDate;
      });
      
      setRefinancingsHistory(refinancings);
    } catch (error) {
      console.error('Error loading refinancings history:', error);
      setHistoryError(error instanceof Error ? error.message : 'Error al cargar el historial');
      setRefinancingsHistory([]);
    } finally {
      setLoadingHistory(false);
    }
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
        
        // Para suscripciones existentes, usar directamente el nextChargeDate de la suscripción
        // Este ya es el vencimiento correcto que se actualizará automáticamente al pagar
        if (currentDue) {
          vencimiento = currentDue;
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

  // Obtener servicios disponibles para un ítem específico
  // Filtra por: 1) servicios ya seleccionados, 2) disponibilidad según tipo de miembro
  function getAvailableServices(currentIdx: number) {
    // IDs de servicios ya seleccionados (excepto el actual)
    const selectedServiceIds = payItems
      .map((item, idx) => idx !== currentIdx ? item.servicioId : '')
      .filter(id => id !== '');
    
    return services.filter(service => {
      // 1. Evitar duplicados - No mostrar servicios ya seleccionados
      if (selectedServiceIds.includes(service.id)) {
        return false;
      }
      
      // 2. Validar disponibilidad según tipo de miembro
      // Considera: socios, noSocios y agendamiento
      const isNoSocio = selectedMemberForService?.subcategoria === 'NO SOCIO';
      return esServicioDisponiblePara(service, selectedMemberForService, isNoSocio);
    });
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
      `¿Eliminar al socio ${member.nombres} ${member.apellidos}? Esta acción eliminará el socio y todos sus datos relacionados (movimientos, pagos, reservas, etc.). Esta acción no se puede deshacer.`
    );
    if (!confirmDelete) return;
    
    try {
      // Siempre usar force=true para eliminar en cascada todos los datos relacionados
      const response = await AuthClient.authenticatedFetch(`/api/members/${memberId}?force=true`, { method: 'DELETE' });
      const data = await response.json();
      console.log('Delete response:', { status: response.status, data });
      
      if (response.ok) {
        setDeleteMsg('Socio y todos sus datos eliminados correctamente');
        await loadMembersAndLedgers();
        setTimeout(() => setDeleteMsg(''), 3000);
      } else {
        setDeleteMsg(data.msg || 'Error al eliminar socio');
        setTimeout(() => setDeleteMsg(''), 8000);
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
      let matchesSearch = true;
      if (searchTerm.trim() !== '') {
        if (searchField === 'codigo') {
          matchesSearch = member.codigo.toLowerCase().includes(text);
        } else if (searchField === 'ci') {
          matchesSearch = Boolean(member.ci && member.ci.toLowerCase().includes(text));
        } else {
          // nombre y apellido
          matchesSearch = member.nombres.toLowerCase().includes(text) || member.apellidos.toLowerCase().includes(text);
        }
      }
      
      const estadoCalc = memberDebtMap[member.id]?.estadoCalc ?? (member.estado as any);
      const matchesCategoria = !filterCategoria || member.categoria === filterCategoria;
      const matchesEstado = !filterEstado || estadoCalc === filterEstado;
      const matchesSubcategoria = !filterSubcategoria || member.subcategoria === filterSubcategoria;

      return matchesSearch && matchesCategoria && matchesEstado && matchesSubcategoria;
    });
  }, [members, memberDebtMap, searchTerm, searchField, filterCategoria, filterEstado, filterSubcategoria]);

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const start = (pageSafe - 1) * pageSize;

  // ===== Funciones para Multi-Reserva =====
  const getConceptosWithReserva = (conceptos: ConceptoItem[]) => {
    return conceptos.filter(c => {
      const servicio = services.find(s => s.id === c.servicioId);
      return servicio?.permiteAgendamiento && (c as any).requiereReserva;
    });
  };

  // 🔍 Nueva función: obtener conceptos que YA TIENEN reserva guardada
  const getConceptosWithReservaExistente = (conceptos: ConceptoItem[]) => {
    return conceptos.filter(c => {
      const servicio = services.find(s => s.id === c.servicioId);
      const tieneReservaRequerida = servicio?.permiteAgendamiento && (c as any).requiereReserva;
      const tieneReservaGuardada = !!(c as any).reservaVenueId;
      return tieneReservaRequerida && tieneReservaGuardada;
    });
  };

  const canShowMultiReservaButton = (conceptos: ConceptoItem[]) => {
    const conceptosConReserva = getConceptosWithReserva(conceptos);
    return conceptosConReserva.length >= 2;
  };

  // Helper para resetear el formulario de reserva
  const getDefaultReservaForm = () => ({
    venueId: '',
    fecha: getTodayParaguay(),
    inicioHora: '19:00',
    finHora: '03:00',
    observaciones: '',
    cedula: '',
    telefono: '',
    ruc: '',
    esParaTercero: false,
    terceroNombre: '',
    terceroCedula: '',
    terceroTelefono: '',
    terceroRuc: '',
    horaExtra: false,
    cantidadHorasExtra: '',
    montoHorasExtra: '',
    acontecimiento: '',
    quinceaneraFocusNombre: '',
    noviosNombres: '',
    cumpleaneroNombre: '',
    otrosDescripcion: '',
    otrosNombrePersona: '',
    cantidadPersonas: '',
    observacionesGenerales: '',
    requiereApa: true
  });

  const openMultiReservaModal = (conceptos: ConceptoItem[]) => {
    console.log('🚀 Abriendo modal de reserva múltiple para', conceptos.length, 'conceptos');
    console.log('📋 Conceptos recibidos:', conceptos.map(c => ({
      id: c.id,
      servicio: c.concepto,
      tieneReservaVenueId: !!(c as any).reservaVenueId,
      reservaHoraInicio: (c as any).reservaHoraInicio,
      reservaHoraFin: (c as any).reservaHoraFin,
      reservaHoraExtra: (c as any).reservaHoraExtra,
      reservaConfiguracionIndividual: (c as any).reservaConfiguracionIndividual
    })));
    
    const conceptosConReserva = getConceptosWithReserva(conceptos);
    console.log('🎯 Conceptos que requieren reserva:', conceptosConReserva.map(c => c.id));
    if (conceptosConReserva.length < 2) return;
    
    setSelectedConceptsForReserva(conceptosConReserva.map(c => c.id));
    
    // 🎯 VERIFICAR SI YA EXISTE RESERVA CONFIGURADA
    const conceptosConReservaExistente = getConceptosWithReservaExistente(conceptosConReserva);
    console.log(`🔍 Conceptos: ${conceptosConReserva.length} requieren reserva, ${conceptosConReservaExistente.length} ya tienen reserva guardada`);
    
    const primerConceptoConReserva = conceptosConReservaExistente.length > 0 ? conceptosConReservaExistente[0] : null;
    
    if (primerConceptoConReserva) {
      console.log('🔄 Cargando reserva múltiple existente:', {
        venue: (primerConceptoConReserva as any).reservaVenueId,
        fecha: (primerConceptoConReserva as any).reservaFecha,
        horaExtra: (primerConceptoConReserva as any).reservaHoraExtra
      });
    } else {
      console.log('❌ No se encontró concepto con reservaVenueId');
    }
    
    // Cargar datos existentes si hay reserva, sino usar valores por defecto
    setMultiReservaForm({
      // Datos básicos comunes
      venueId: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaVenueId || '' : '',
      fecha: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaFecha || getTodayParaguay() : getTodayParaguay(),
      inicioHora: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaHoraInicio || '19:00' : '19:00',
      finHora: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaHoraFin || '03:00' : '03:00',
      observaciones: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaObservaciones || '' : '',
      
      // Configuración individual - usar la marca guardada o detectar por diferencias
      configuracionIndividual: primerConceptoConReserva ? (() => {
        // 🎯 MÉTODO 1: Buscar la marca guardada en CUALQUIER concepto, no solo el primero
        let marcaGuardada = (primerConceptoConReserva as any).reservaConfiguracionIndividual;
        
        // Si el primer concepto no tiene la marca, buscar en todos los conceptos
        if (marcaGuardada === undefined) {
          for (const concepto of conceptos) {
            const marcaEnConcepto = (concepto as any).reservaConfiguracionIndividual;
            if (marcaEnConcepto !== undefined) {
              marcaGuardada = marcaEnConcepto;
              console.log('✅ Encontrada marca de configuracionIndividual en concepto', concepto.id, ':', marcaGuardada);
              break;
            }
          }
        }
        
        if (marcaGuardada !== undefined) {
          console.log('✅ Usando marca guardada de configuracionIndividual:', marcaGuardada);
          return marcaGuardada;
        }
        
        // 🔍 MÉTODO 2: Detectar por diferencias (fallback para reservas guardadas antes de esta mejora)
        if (conceptosConReservaExistente.length === 0) return false;
        
        // Si solo hay un concepto, es configuración global
        if (conceptosConReservaExistente.length === 1) {
          console.log('📝 Un solo concepto = configuración global');
          return false;
        }
        
        // Verificar si hay diferencias entre configuraciones
        const configuraciones = conceptosConReservaExistente.map(concepto => ({
          horaExtra: (concepto as any).reservaHoraExtra || false,
          cantidadHoras: (concepto as any).reservaCantidadHorasExtra || '',
          monto: (concepto as any).reservaMontoHorasExtra || ''
        }));
        
        const primeraConfig = configuraciones[0];
        const hayDiferencias = configuraciones.some(config => 
          config.horaExtra !== primeraConfig.horaExtra ||
          config.cantidadHoras !== primeraConfig.cantidadHoras ||
          config.monto !== primeraConfig.monto
        );
        
        console.log(`🔍 Detectando por diferencias: ${hayDiferencias ? 'Individual' : 'Global'}`);
        
        return hayDiferencias;
      })() : false,
      
      // Datos del socio (editables cuando falten) 
      cedula: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaCedula || selectedMemberForService?.ci || '' : selectedMemberForService?.ci || '',
      telefono: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaTelefono || selectedMemberForService?.telefono || '' : selectedMemberForService?.telefono || '',
      ruc: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaRuc || '' : '',
      
      // Reserva a favor de tercero
      esParaTercero: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaEsParaTercero || false : false,
      terceroNombre: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaTerceroNombre || '' : '',
      terceroCedula: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaTerceroCedula || '' : '',
      terceroTelefono: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaTerceroTelefono || '' : '',
      terceroRuc: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaTerceroRuc || '' : '',
      
      // Datos del evento
      horaExtra: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaHoraExtra || false : false,
      cantidadHorasExtra: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaCantidadHorasExtra || '' : '',
      montoHorasExtra: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaMontoHorasExtra || '' : '',
      
      // Acontecimiento
      acontecimiento: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaAcontecimiento || '' : '',
      quinceaneraFocusNombre: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaQuinceaneraFocusNombre || '' : '',
      noviosNombres: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaNoviosNombres || '' : '',
      cumpleaneroNombre: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaCumpleaneroNombre || '' : '',
      otrosDescripcion: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaOtrosDescripcion || '' : '',
      otrosNombrePersona: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaOtrosNombrePersona || '' : '',
      
      // Información adicional
      cantidadPersonas: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaCantidadPersonas || '' : '',
      observacionesGenerales: primerConceptoConReserva ? (primerConceptoConReserva as any).reservaObservacionesGenerales || '' : '',
      requiereApa: primerConceptoConReserva ? (primerConceptoConReserva as any).requiereApa !== undefined ? (primerConceptoConReserva as any).requiereApa : true : true,
      
      // Configuraciones individuales por concepto - cargar según la marca o detección
      configuracionesIndividuales: primerConceptoConReserva ? (() => {
        const configs: any = {};
        
        // Usar la misma lógica que para configuracionIndividual - buscar en todos los conceptos
        let marcaGuardada = (primerConceptoConReserva as any).reservaConfiguracionIndividual;
        
        // Si el primer concepto no tiene la marca, buscar en todos los conceptos
        if (marcaGuardada === undefined) {
          for (const concepto of conceptos) {
            const marcaEnConcepto = (concepto as any).reservaConfiguracionIndividual;
            if (marcaEnConcepto !== undefined) {
              marcaGuardada = marcaEnConcepto;
              console.log('🔍 Encontrada marca de configuracionIndividual en concepto', concepto.id, ':', marcaGuardada);
              break;
            }
          }
        }
        
        let hayConfigIndividual = false;
        
        console.log('🔍 Cargando configuraciones individuales:', {
          marcaGuardada,
          conceptosConReserva: conceptosConReserva.length,
          conceptosConReservaExistente: conceptosConReservaExistente.length,
          todosLosConceptos: conceptos.map(c => ({
            id: c.id,
            tieneReservaVenueId: !!(c as any).reservaVenueId,
            inicioHora: (c as any).reservaHoraInicio,
            finHora: (c as any).reservaHoraFin,
            horaExtra: (c as any).reservaHoraExtra,
            cantidadHoras: (c as any).reservaCantidadHorasExtra,
            monto: (c as any).reservaMontoHorasExtra
          }))
        });
        
        if (marcaGuardada !== undefined) {
          hayConfigIndividual = marcaGuardada;
          console.log('✅ Usando marca guardada de configuracionIndividual:', marcaGuardada);
        } else {
          // Detectar por diferencias (fallback)
          if (conceptosConReservaExistente.length > 1) {
            const configuraciones = conceptosConReservaExistente.map(concepto => ({
              horaExtra: (concepto as any).reservaHoraExtra || false,
              cantidadHoras: (concepto as any).reservaCantidadHorasExtra || '',
              monto: (concepto as any).reservaMontoHorasExtra || ''
            }));
            
            const primeraConfig = configuraciones[0];
            hayConfigIndividual = configuraciones.some(config => 
              config.horaExtra !== primeraConfig.horaExtra ||
              config.cantidadHoras !== primeraConfig.cantidadHoras ||
              config.monto !== primeraConfig.monto
            );
            console.log('🔍 Detectando por diferencias:', { hayDiferencias: hayConfigIndividual, configuraciones });
          }
        }
        
        if (hayConfigIndividual) {
          // Cargar TODAS las configuraciones individuales para TODOS los conceptos que requieren reserva
          conceptosConReserva.forEach(concepto => {
            // Buscar configuración guardada en TODOS los conceptos, no solo en conceptosConReservaExistente
            const conceptoConConfigGuardada = conceptos.find(c => c.id === concepto.id);
            
            // Verificar si tiene configuración guardada (no importa si tiene reservaVenueId)
            const tieneConfigGuardada = conceptoConConfigGuardada && (
              (conceptoConConfigGuardada as any).reservaHoraInicio ||
              (conceptoConConfigGuardada as any).reservaHoraFin ||
              (conceptoConConfigGuardada as any).reservaHoraExtra ||
              (conceptoConConfigGuardada as any).reservaCantidadHorasExtra ||
              (conceptoConConfigGuardada as any).reservaMontoHorasExtra
            );
            
            if (tieneConfigGuardada) {
              // Usar configuración guardada
              configs[concepto.id] = {
                inicioHora: (conceptoConConfigGuardada as any).reservaHoraInicio || '19:00',
                finHora: (conceptoConConfigGuardada as any).reservaHoraFin || '03:00',
                horaExtra: (conceptoConConfigGuardada as any).reservaHoraExtra || false,
                cantidadHorasExtra: (conceptoConConfigGuardada as any).reservaCantidadHorasExtra || '',
                montoHorasExtra: (conceptoConConfigGuardada as any).reservaMontoHorasExtra || ''
              };
              console.log(`✅ Cargando config guardada para concepto ${concepto.id}:`, configs[concepto.id]);
            } else {
              // Usar configuración por defecto para conceptos sin configuración previa
              configs[concepto.id] = {
                inicioHora: '19:00',
                finHora: '03:00',
                horaExtra: false,
                cantidadHorasExtra: '',
                montoHorasExtra: ''
              };
              console.log(`🆕 Usando config por defecto para concepto ${concepto.id}`);
            }
          });
          console.log('📋 Configuraciones individuales cargadas para', Object.keys(configs).length, 'conceptos:', configs);
        } else {
          console.log('🌐 Usando configuración global');
        }
        
        return configs;
      })() : {}
    });
    
    setShowMultiReservaModal(true);
  };

  const validateMultiReservaForm = () => {
    const errors: string[] = [];
    
    // ✅ Comentado: Los espacios vienen precargados de la ventana de cobranza
    // if (!multiReservaForm.venueId) {
    //   errors.push('Debe seleccionar un espacio');
    // }
    
    if (!multiReservaForm.fecha) {
      errors.push('Debe seleccionar una fecha');
    } else {
      // 🌎 Ajuste para zona horaria Paraguay (-03:00)
      const fechaSeleccionada = new Date(multiReservaForm.fecha + 'T00:00:00-03:00');
      const hoy = new Date();
      // Comparar solo fechas, no horas
      const fechaHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
      const fechaEvento = new Date(fechaSeleccionada.getFullYear(), fechaSeleccionada.getMonth(), fechaSeleccionada.getDate());
      
      if (fechaEvento < fechaHoy) {
        errors.push('La fecha no puede ser anterior a hoy');
      }
    }
    
    if (!multiReservaForm.inicioHora || !multiReservaForm.finHora) {
      errors.push('Debe especificar hora de inicio y fin');
    } else {
      // 🕒 Lógica mejorada para eventos que cruzan medianoche (ej: 19:00-03:00)
      const inicioHora = multiReservaForm.inicioHora;
      const finHora = multiReservaForm.finHora;
      
      // Convertir horas a minutos para comparación más fácil
      const [inicioH, inicioM] = inicioHora.split(':').map(Number);
      const [finH, finM] = finHora.split(':').map(Number);
      
      const inicioMinutos = inicioH * 60 + inicioM;
      const finMinutos = finH * 60 + finM;
      
      // ✅ Permitir eventos que cruzan medianoche (fin < inicio indica día siguiente)
      // Solo validar que no sean la misma hora
      if (inicioMinutos === finMinutos) {
        errors.push('La hora de inicio y fin no pueden ser iguales');
      }
      
      // ⏰ Validar duración mínima (ej: al menos 1 hora)
      let duracionMinutos = finMinutos - inicioMinutos;
      if (duracionMinutos <= 0) {
        duracionMinutos += 24 * 60; // Sumar 24 horas si cruza medianoche
      }
      
      if (duracionMinutos < 60) {
        errors.push('El evento debe tener una duración mínima de 1 hora');
      }
    }

    // Validar acontecimiento obligatorio
    if (!multiReservaForm.acontecimiento) {
      errors.push('Debe seleccionar un acontecimiento');
    }

    // Validar campos dependientes del acontecimiento
    if (multiReservaForm.acontecimiento === '15_anos' && !multiReservaForm.quinceaneraFocusNombre.trim()) {
      errors.push('Debe ingresar el nombre de la quinceañera');
    }
    if (multiReservaForm.acontecimiento === 'boda' && !multiReservaForm.noviosNombres.trim()) {
      errors.push('Debe ingresar los nombres de los novios');
    }
    if (multiReservaForm.acontecimiento === 'cumpleanos' && !multiReservaForm.cumpleaneroNombre.trim()) {
      errors.push('Debe ingresar el nombre del cumpleañer@');
    }
    if (multiReservaForm.acontecimiento === 'otros' && !multiReservaForm.otrosDescripcion.trim()) {
      errors.push('Debe ingresar la descripción del acontecimiento');
    }
    
    return errors;
  };
  const end = start + pageSize;
  const pageMembers = filteredMembers.slice(start, end);

  const exportToExcel = async () => {
    try {
      // Send filtered member IDs to backend
      const memberIds = filteredMembers.map(m => m.id).join(',');
      const response = await AuthClient.authenticatedFetch(`/api/members/export?format=excel&ids=${encodeURIComponent(memberIds)}`);
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
    const conceptos = unifiedForm.conceptos || [];

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
  // CONTADO requiere método de pago y cobrador
  if (!unifiedForm.metodoPago) return false;
  if (!unifiedForm.cobradorId) return false;
    } else if (unifiedForm.condicion === 'CREDITO') {
      // CREDITO con pago parcial requiere validaciones adicionales
      if (unifiedForm.permitirPagosParc) {
        if (!unifiedForm.pagoAplicado) return false; // Si permite pago parcial, debe tener monto
        const pagoAplicado = parseFloat(getNumericValue(unifiedForm.pagoAplicado));
        if (isNaN(pagoAplicado) || pagoAplicado <= 0) return false;
        // calcular total actual
        const total = calculateTotal(unifiedForm.conceptos) || parseFloat(getNumericValue(unifiedForm.monto || '0'));
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

    // === VALIDACIÓN: Verificar suscripciones activas ===
    const conceptos = unifiedForm.conceptos || [];
    const warnings: string[] = [];
    
    for (const c of conceptos) {
      if (c.servicioId && c.tipoServicio !== 'UNICO') {
        const sub = await findActiveSubscription(selectedMemberForService.id, c.servicioId);
        if (sub) {
          const service = services.find(s => s.id === c.servicioId);
          const serviceName = service?.nombre || 'Servicio';
          const vencimientoActual = sub.nextChargeDate ? formatDate(sub.nextChargeDate) : 'N/A';
          warnings.push(`ℹ️ ${serviceName}: Suscripción activa (vence: ${vencimientoActual})`);
        }
      }
    }

    // Si hay advertencias, mostrar confirmación al usuario
    if (warnings.length > 0) {
      const message = 
        '📋 Información de Suscripciones:\n\n' +
        warnings.join('\n') +
        '\n\n✅ Este pago se registrará normalmente y las fechas de vencimiento se actualizarán automáticamente sumando el período correspondiente.\n\n' +
        '¿Deseas continuar?';
      
      if (!window.confirm(message)) {
        setSaving(false);
        return;
      }
    }

    setSaving(true);
    try {
      // Multi-concept flow: crear un débito por cada concepto y luego un pago que asigne los montos

  const createdDebits: { id: string; amount: number; conceptoName: string; conceptoId?: string; relatedToReservaConceptId?: string }[] = [];

      for (const c of conceptos) {
        const montoNum = parseFloat(getNumericValueSafe(c.monto));
        const tipo = c.tipoServicio;
        const days = tipo === 'ANUAL' ? 365 : tipo === 'MENSUAL' ? 30 : (c.dias || 1);

        // Crear suscripción por concepto si aplica (por-concepto o flag global)
        // Pero SOLO si no existe ya una suscripción activa
        if ((c.crearSuscripcion || unifiedForm.crearSuscripcion) && tipo !== 'UNICO') {
          const existingSub = await findActiveSubscription(selectedMemberForService.id, c.servicioId);
          
          if (!existingSub) {
            // No existe suscripción activa, crear una nueva
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
          // Si ya existe suscripción activa, no crear nueva (se actualizará automáticamente al pagar)
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
  createdDebits.push({ id: newDebitId, amount: montoNum, conceptoName: c.concepto || 'Servicio', conceptoId: c.id, relatedToReservaConceptId: (c as any).relatedToReservaConceptId || undefined });
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
            // Usar reservaFechaFin si está disponible (eventos que cruzan medianoche)
            let fechaFin = (c as any).reservaFechaFin || c.reservaFecha;
            let endDateTime = new Date(`${fechaFin}T${c.reservaHoraFin || '23:00'}:00`);
            
            // Si la hora de fin es menor o igual a la de inicio y no hay fecha fin explícita, sumar un día
            if (endDateTime <= startDateTime && !(c as any).reservaFechaFin) {
              endDateTime.setDate(endDateTime.getDate() + 1);
            }
            
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
              // Asegurar que el monto total incluya horas extra si están presentes
              montoTotal: (function(){
                const base = parseFloat(getNumericValueSafe(c.monto)) || 0;
                const horasExtra = (c as any).reservaMontoHorasExtra ? Number(getNumericValueSafe((c as any).reservaMontoHorasExtra)) : 0;
                return base + horasExtra;
              })(),
              status: 'ACTIVO',
              notas: c.reservaObservaciones || c.observaciones || '',
              createdBy: 'system',
              
              // 🎉 Datos del evento/acontecimiento
              acontecimiento: (c as any).reservaAcontecimiento || undefined,
              quinceaneraFocusNombre: (c as any).reservaQuinceaneraFocusNombre || undefined,
              noviosNombres: (c as any).reservaNoviosNombres || undefined,
              cumpleaneroNombre: (c as any).reservaCumpleaneroNombre || undefined,
              otrosDescripcion: (c as any).reservaOtrosDescripcion || undefined,
              otrosNombrePersona: (c as any).reservaOtrosNombrePersona || undefined,

              // 👤 Reserva para tercero
              esParaTercero: (c as any).reservaEsParaTercero || undefined,
              terceroNombre: (c as any).reservaTerceroNombre || undefined,
              terceroCedula: (c as any).reservaTerceroCedula || undefined,
              terceroTelefono: (c as any).reservaTerceroTelefono || undefined,
              terceroRuc: (c as any).reservaTerceroRuc || undefined,

              // 📝 Información adicional
              cantidadPersonas: (c as any).reservaCantidadPersonas ? Number((c as any).reservaCantidadPersonas) : undefined,
              observacionesGenerales: (c as any).reservaObservacionesGenerales || undefined,

              // 🕐 Hora extra
              horaExtra: (c as any).reservaHoraExtra || undefined,
              cantidadHorasExtra: (c as any).reservaCantidadHorasExtra ? Number((c as any).reservaCantidadHorasExtra) : undefined,
              montoHorasExtra: (c as any).reservaMontoHorasExtra ? Number(getNumericValueSafe((c as any).reservaMontoHorasExtra)) : undefined,

              // 📋 Requisitos APA (si requiere APA, iniciar como PENDIENTE)
              requiereApa: (c as any).requiereApa || undefined,
              apaEstado: (c as any).requiereApa ? 'PENDIENTE' : undefined,

              // 🔗 CRÍTICO: Vincular la reserva a todos los débitos relacionados (servicio + horas extra)
              debitMovementIds: (function(){
                const ids = createdDebits
                  .filter(d => d.conceptoId === c.id || d.relatedToReservaConceptId === c.id)
                  .map(d => d.id);
                return ids.length ? ids : undefined;
              })(),
              // Mantener compatibilidad: primer id como debitMovementId si existe
              debitMovementId: (function(){
                const id = createdDebits.find(d => d.conceptoId === c.id || d.relatedToReservaConceptId === c.id)?.id;
                return id || undefined;
              })()
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

    // === VALIDACIÓN: Verificar suscripciones activas ===
    const conceptos = unifiedForm.conceptos || [];
    const warnings: string[] = [];
    
    for (const c of conceptos) {
      if (c.servicioId && c.tipoServicio !== 'UNICO') {
        const sub = await findActiveSubscription(selectedMemberForService.id, c.servicioId);
        if (sub) {
          const service = services.find(s => s.id === c.servicioId);
          const serviceName = service?.nombre || 'Servicio';
          const vencimientoActual = sub.nextChargeDate ? formatDate(sub.nextChargeDate) : 'N/A';
          warnings.push(`ℹ️ ${serviceName}: Suscripción activa (vence: ${vencimientoActual})`);
        }
      }
    }

    // Si hay advertencias, mostrar confirmación al usuario
    if (warnings.length > 0) {
      const message = 
        '📋 Información de Suscripciones:\n\n' +
        warnings.join('\n') +
        '\n\n✅ El débito se registrará normalmente. Cuando se pague, las fechas de vencimiento se actualizarán automáticamente sumando el período correspondiente.\n\n' +
        '¿Deseas continuar?';
      
      if (!window.confirm(message)) {
        setSaving(false);
        return;
      }
    }

    setSaving(true);
    try {
      // Multi-concept flow para crédito: crear débitos por cada concepto

  const createdDebits: { id: string; amount: number; conceptoName: string; conceptoId?: string; relatedToReservaConceptId?: string }[] = [];

      for (const c of conceptos) {
        const montoNum = parseFloat(getNumericValueSafe(c.monto));
        const tipo = c.tipoServicio;
        const days = tipo === 'ANUAL' ? 365 : tipo === 'MENSUAL' ? 30 : (c.dias || 1);

        // Crear suscripción por concepto si aplica (por-concepto o flag global)
        // Pero SOLO si no existe ya una suscripción activa
        if ((c.crearSuscripcion || unifiedForm.crearSuscripcion) && tipo !== 'UNICO') {
          const existingSub = await findActiveSubscription(selectedMemberForService.id, c.servicioId);
          
          if (!existingSub) {
            // No existe suscripción activa, crear una nueva
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
          // Si ya existe suscripción activa, no crear nueva (se actualizará automáticamente al pagar)
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
  createdDebits.push({ id: newDebitId, amount: montoNum, conceptoName: c.concepto || 'Servicio', conceptoId: c.id, relatedToReservaConceptId: (c as any).relatedToReservaConceptId || undefined });
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
            // Usar reservaFechaFin si está disponible (eventos que cruzan medianoche)
            let fechaFin = (c as any).reservaFechaFin || c.reservaFecha;
            let endDateTime = new Date(`${fechaFin}T${c.reservaHoraFin || '23:00'}:00`);
            
            // Si la hora de fin es menor o igual a la de inicio y no hay fecha fin explícita, sumar un día
            if (endDateTime <= startDateTime && !(c as any).reservaFechaFin) {
              endDateTime.setDate(endDateTime.getDate() + 1);
            }
            
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
              // Asegurar que el monto total incluya horas extra si están presentes
              montoTotal: (function(){
                const base = parseFloat(getNumericValueSafe(c.monto)) || 0;
                const horasExtra = (c as any).reservaMontoHorasExtra ? Number(getNumericValueSafe((c as any).reservaMontoHorasExtra)) : 0;
                return base + horasExtra;
              })(),
              status: 'ACTIVO',
              notas: c.reservaObservaciones || c.observaciones || '',
              createdBy: 'system',
              
              // 🎉 Datos del evento/acontecimiento
              acontecimiento: (c as any).reservaAcontecimiento || undefined,
              quinceaneraFocusNombre: (c as any).reservaQuinceaneraFocusNombre || undefined,
              noviosNombres: (c as any).reservaNoviosNombres || undefined,
              cumpleaneroNombre: (c as any).reservaCumpleaneroNombre || undefined,
              otrosDescripcion: (c as any).reservaOtrosDescripcion || undefined,
              otrosNombrePersona: (c as any).reservaOtrosNombrePersona || undefined,

              // 👤 Reserva para tercero
              esParaTercero: (c as any).reservaEsParaTercero || undefined,
              terceroNombre: (c as any).reservaTerceroNombre || undefined,
              terceroCedula: (c as any).reservaTerceroCedula || undefined,
              terceroTelefono: (c as any).reservaTerceroTelefono || undefined,
              terceroRuc: (c as any).reservaTerceroRuc || undefined,

              // 📝 Información adicional
              cantidadPersonas: (c as any).reservaCantidadPersonas ? Number((c as any).reservaCantidadPersonas) : undefined,
              observacionesGenerales: (c as any).reservaObservacionesGenerales || undefined,

              // 🕐 Hora extra
              horaExtra: (c as any).reservaHoraExtra || undefined,
              cantidadHorasExtra: (c as any).reservaCantidadHorasExtra ? Number((c as any).reservaCantidadHorasExtra) : undefined,
              montoHorasExtra: (c as any).reservaMontoHorasExtra ? Number(getNumericValueSafe((c as any).reservaMontoHorasExtra)) : undefined,

              // 📋 Requisitos APA (si requiere APA, iniciar como PENDIENTE)
              requiereApa: (c as any).requiereApa || undefined,
              apaEstado: (c as any).requiereApa ? 'PENDIENTE' : undefined,

              // 🔗 CRÍTICO: Vincular la reserva a todos los débitos relacionados (servicio + horas extra)
              debitMovementIds: (function(){
                const ids = createdDebits
                  .filter(d => d.conceptoId === c.id || d.relatedToReservaConceptId === c.id)
                  .map(d => d.id);
                return ids.length ? ids : undefined;
              })(),
              // Mantener compatibilidad: primer id como debitMovementId si existe
              debitMovementId: (function(){
                const id = createdDebits.find(d => d.conceptoId === c.id || d.relatedToReservaConceptId === c.id)?.id;
                return id || undefined;
              })()
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
        const today = getTodayParaguay();
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
        const today = getTodayParaguay();
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
              <div className="flex flex-row gap-2 items-center">
                <div className="relative w-2/5">
                  <select
                    className="w-full h-[42px] px-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-700 focus:border-gray-700 text-sm"
                    value={searchField}
                    onChange={e => { setSearchField(e.target.value as any); setPage(1); }}
                  >
                    <option value="codigo">Nro. de socio</option>
                    <option value="ci">Cédula</option>
                    <option value="nombre">Nombre y Apellido</option>
                  </select>
                </div>
                <div className="relative w-3/5">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder={
                      searchField === 'codigo' ? 'Ej: 1234' :
                      searchField === 'ci' ? 'Ej: 1234567' :
                      'Nombre o Apellido...'
                    }
                    className="w-full h-[42px] pl-10 pr-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-700 focus:border-gray-700"
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                  />
                </div>
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
                  setSearchField('nombre');
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
                            {/* Deudas Pendientes moved to Cobranza modal header */}
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
                <div className="flex items-center gap-4">
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
                  {selectedMemberForService && (
                    <button
                      onClick={() => { 
                        setSelectedMemberForDebts(selectedMemberForService); 
                        setShowDebtsModal(true);
                        loadPendingDebits(selectedMemberForService.id);
                        
                        // 🎯 MEJORA: Preseleccionar cobrador Garden Club y fecha automáticamente
                        const today = getTodayParaguay();
                        const gardenClubCollector = getGardenClubCollector();
                        const defaultCobradorId = gardenClubCollector?.id || '';
                        
                        setDebtPaymentForm(prev => ({
                          ...prev,
                          fecha: today,
                          cobradorId: defaultCobradorId // 🎯 Preseleccionar Garden Club
                        }));
                      }}
                      className="px-3 py-1.5 text-sm text-amber-700 hover:underline transition-colors border border-amber-200 rounded-md"
                    >
                      Deudas Pendientes
                    </button>
                  )}
                </div>
                <button onClick={handleCloseCobranzaModal} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* ===== FORMULARIO UNIFICADO ===== */}
              <div className="space-y-3">
                
                {/* ===== 1. DATOS DEL SERVICIO (Campos globales únicos) ===== */}
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  
                  <table className="w-full">
                    <tbody>
                      <tr>
                        <td className="align-top pr-3" style={{width: '15%'}}>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de cobro o servicio*</label>
                          <input
                            type="date"
                            value={unifiedForm.fecha}
                            onChange={(e) => handleFechaGlobalChange(e.target.value)}
                            className="w-44 px-3 min-h-[42px] py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-gray-800"
                          />
                          {showFormValidation && !unifiedForm.fecha && (
                            <p className="text-xs text-red-600 mt-1">Fecha requerida</p>
                          )}
                        </td>
                        <td className="align-top pr-3" style={{width: '65%'}}>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Observaciones</label>
                          <textarea
                            value={unifiedForm.observaciones}
                            onChange={(e) => setUnifiedForm(prev => ({ ...prev, observaciones: e.target.value }))}
                            className="w-full px-3 h-[42px] border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-gray-800 resize-none"
                            placeholder="Observaciones adicionales..."
                          />
                            {/* Indicador visual eliminado por solicitud */}
                        </td>
                        <td className="align-top" style={{width: '20%'}}>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Condición</label>
                          <div className="flex items-center gap-4 h-full" style={{minHeight: '42px', alignItems: 'center'}}>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="condicion"
                                value="CONTADO"
                                checked={unifiedForm.condicion === 'CONTADO'}
                                onChange={() => {
                                  setShowFormValidation(false);
                                  setUnifiedForm(prev => ({ 
                                    ...prev, 
                                    condicion: 'CONTADO',
                                    pagoAplicado: prev.monto // En contado, pago aplicado = monto total
                                  }));
                                }}
                                className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500"
                              />
                              <span className="text-sm font-medium text-gray-900">Al Contado</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="condicion"
                                value="CREDITO"
                                checked={unifiedForm.condicion === 'CREDITO'}
                                onChange={() => {
                                  setShowFormValidation(false);
                                  setUnifiedForm(prev => ({ 
                                    ...prev, 
                                    condicion: 'CREDITO',
                                    pagoAplicado: '' // En crédito, el pago es opcional
                                  }));
                                }}
                                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                              />
                              <span className="text-sm font-medium text-gray-900">A Crédito</span>
                            </label>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                </div>

                {/* ===== 2. CONDICIÓN DE PAGO (CONTADO/CREDITO) ===== */}
                {unifiedForm.condicion === 'CONTADO' && (
                  <div className="rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      Pago Inmediato (Contado)
                    </h3>
                    {/* ===== Lista de conceptos para CONTADO (múltiples) ===== */}
                    <ConceptosTable
                      conceptos={getAllConceptos()}
                      services={services}
                      selectedMember={selectedMemberForService}
                      showFormValidation={showFormValidation}
                      vencimientoDefault={unifiedForm.vencimiento}
                      onAddConcepto={() => addConceptoToSection('CONTADO')}
                      onUpdateConcepto={(id, field, value) => updateConceptoInSection('CONTADO', id, field, value)}
                      onRemoveConcepto={(id) => removeConceptoFromSection('CONTADO', id)}
                      formatNumberWithSeparator={formatNumberWithSeparator}
                      getNumericValueSafe={getNumericValueSafe}
                      isServiceDuplicate={(conceptos, servicioId) => isServiceDuplicate(conceptos, servicioId, services)}
                      onServiceSelection={handleUnifiedServiceSelection}
                      title="Conceptos a pagar"
                      buttonColor="bg-green-600"
                      onOpenReservaModal={handleOpenReservaModal}
                      modoReservaUnica={modoReservaUnica}
                      onToggleModoReserva={() => setModoReservaUnica(!modoReservaUnica)}
                      canShowMultiReserva={canShowMultiReservaButton(getAllConceptos())}
                      conceptosConReservaCount={getConceptosWithReserva(getAllConceptos()).length}
                    />

                    {/* Botón de Multi-Reserva para CONTADO */}
                    {canShowMultiReservaButton(getAllConceptos()) && modoReservaUnica && (
                      <div className="mb-4 flex justify-center">
                        <button
                          type="button"
                          onClick={() => {
                            setUnifiedForm(currentState => {
                              openMultiReservaModal(currentState.conceptos || []);
                              return currentState;
                            });
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm shadow-sm"
                        >
                          {(() => {
                            const conceptosConReserva = getConceptosWithReserva(getAllConceptos());
                            const tieneReservasExistentes = conceptosConReserva.some(c => (c as any).reservaFechaHora);
                            
                            if (tieneReservasExistentes) {
                              return 'Editar reservación';
                            }
                            return 'Crear reserva';
                          })()}
                          <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
                            {getConceptosWithReserva(getAllConceptos()).length}
                          </span>
                        </button>
                      </div>
                    )}

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
                        {showFormValidation && !unifiedForm.metodoPago && (
                          <p className="text-xs text-red-600 mt-1">Método de pago requerido</p>
                        )}
                      </div>

                      {/* Cobrador */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Cobrador *</label>
                        <select
                          value={unifiedForm.cobradorId}
                          onChange={(e) => setUnifiedForm(prev => ({ ...prev, cobradorId: e.target.value }))}
                          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                            showFormValidation
                              ? (unifiedForm.cobradorId
                                  ? 'border-gray-300 focus:ring-green-500 focus:border-green-500'
                                  : 'border-red-300 focus:ring-red-500 focus:border-red-500')
                              : 'border-gray-300 focus:ring-green-500 focus:border-green-500'
                          }`}
                        >
                          <option value="">— Seleccionar cobrador —</option>
                          {collectors.map(cobrador => (
                            <option key={cobrador.id} value={cobrador.id}>{cobrador.nombres}</option>
                          ))}
                        </select>
                        {showFormValidation && !unifiedForm.cobradorId && (
                          <p className="text-xs text-red-600 mt-1">Cobrador requerido</p>
                        )}
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
                  <div className="rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      Configuración de Crédito
                    </h3>

                    {/* ===== Lista de conceptos para CREDITO (múltiples) ===== */}
                    <ConceptosTable
                      conceptos={getAllConceptos()}
                      services={services}
                      selectedMember={selectedMemberForService}
                      showFormValidation={showFormValidation}
                      vencimientoDefault={unifiedForm.vencimiento}
                      onAddConcepto={() => addConceptoToSection('CREDITO')}
                      onUpdateConcepto={(id, field, value) => updateConceptoInSection('CREDITO', id, field, value)}
                      onRemoveConcepto={(id) => removeConceptoFromSection('CREDITO', id)}
                      formatNumberWithSeparator={formatNumberWithSeparator}
                      getNumericValueSafe={getNumericValueSafe}
                      isServiceDuplicate={(conceptos, servicioId) => isServiceDuplicate(conceptos, servicioId, services)}
                      onServiceSelection={handleUnifiedServiceSelection}
                      title="Conceptos (Crédito)"
                      buttonColor="bg-blue-600"
                      onOpenReservaModal={handleOpenReservaModal}
                      modoReservaUnica={modoReservaUnica}
                      onToggleModoReserva={() => setModoReservaUnica(!modoReservaUnica)}
                      canShowMultiReserva={canShowMultiReservaButton(getAllConceptos())}
                      conceptosConReservaCount={getConceptosWithReserva(getAllConceptos()).length}
                    />

                    {/* Botón de Multi-Reserva para CRÉDITO */}
                    {canShowMultiReservaButton(getAllConceptos()) && modoReservaUnica && (
                      <div className="mb-4 flex justify-center">
                        <button
                          type="button"
                          onClick={() => {
                            setUnifiedForm(currentState => {
                              openMultiReservaModal(currentState.conceptos || []);
                              return currentState;
                            });
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm"
                        >
                          {(() => {
                            const conceptosConReserva = getConceptosWithReserva(getAllConceptos());
                            const tieneReservasExistentes = conceptosConReserva.some(c => (c as any).reservaFechaHora);
                            
                            if (tieneReservasExistentes) {
                              return 'Editar reservación';
                            }
                            return 'Crear reserva';
                          })()}
                          <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
                            {getConceptosWithReserva(getAllConceptos()).length}
                          </span>
                        </button>
                      </div>
                    )}
                    
                    {/* Pagos Parciales */}
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          id="permitirPagosParc"
                          checked={unifiedForm.permitirPagosParc}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            // 🎯 MEJORA: Preseleccionar Garden Club cuando se activa pago parcial
                            const gardenClubCollector = getGardenClubCollector();
                            const defaultCobradorId = gardenClubCollector?.id || '';
                            
                            setUnifiedForm(prev => ({ 
                              ...prev, 
                              permitirPagosParc: isChecked, 
                              pagoAplicado: isChecked ? prev.pagoAplicado : '',
                              cobradorId: isChecked && !prev.cobradorId ? defaultCobradorId : prev.cobradorId, // Preseleccionar solo si no hay cobrador
                              metodoPago: isChecked && !prev.metodoPago ? (paymentMethods[0]?.id || 'efectivo') : prev.metodoPago // Preseleccionar método de pago también
                            }));
                          }}
                          className="w-4 h-4 text-blue-600"
                        />
                        <label htmlFor="permitirPagosParc" className="text-sm font-medium text-gray-700">
                          Aplicar pago parcial ahora
                        </label>
                      </div>
                      
                      {unifiedForm.permitirPagosParc && (
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 mt-3 p-3 bg-white rounded-lg border border-blue-200">
                          {/* Monto del Pago Parcial */}
                          <div className="min-w-0">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Monto Pago (Gs.) *</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={unifiedForm.pagoAplicado}
                              onChange={(e) => {
                                const formatted = formatNumberWithSeparator(e.target.value);
                                setUnifiedForm(prev => ({ ...prev, pagoAplicado: formatted }));
                              }}
                              className={`w-full px-2 py-2 border rounded-md focus:outline-none focus:ring-2 text-xs ${
                                showFormValidation
                                  ? (unifiedForm.pagoAplicado && parseFloat(getNumericValue(unifiedForm.pagoAplicado)) > 0 && parseFloat(getNumericValue(unifiedForm.pagoAplicado)) <= calculateTotal(getAllConceptos())
                                      ? 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                                      : 'border-red-300 focus:ring-red-500 focus:border-red-500')
                                  : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                              }`}
                              placeholder="25.000"
                            />
                            {/* Mostrar mensaje de monto mayor al total solo si supera la suma de todos los conceptos */}
                            {(() => {
                              const totalConceptos = calculateTotal(getAllConceptos());
                              const pago = parseFloat(getNumericValue(unifiedForm.pagoAplicado));
                              return unifiedForm.pagoAplicado && pago > totalConceptos;
                            })() && (
                              <p className="text-xs text-red-600 mt-1">No puede superar el monto total</p>
                            )}
                            {/* Mostrar mensaje de monto <= 0 solo si la validación está activa */}
                            {showFormValidation && unifiedForm.pagoAplicado && parseFloat(getNumericValue(unifiedForm.pagoAplicado)) <= 0 && (
                              <p className="text-xs text-red-600 mt-1">Monto debe ser mayor a 0</p>
                            )}
                          </div>

                          {/* Método de Pago Parcial */}
                          <div className="min-w-0">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Método de Pago *</label>
                            <select
                              value={unifiedForm.metodoPago}
                              onChange={(e) => setUnifiedForm(prev => ({ ...prev, metodoPago: e.target.value as any }))}
                              className="w-full px-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs"
                            >
                              <option value="">— Seleccionar método —</option>
                              <option value="EFECTIVO">Efectivo</option>
                              <option value="TRANSFERENCIA">Transferencia</option>
                              <option value="TARJETA">Tarjeta</option>
                              <option value="CHEQUE">Cheque</option>
                            </select>
                          </div>

                          {/* Cobrador */}
                          <div className="min-w-0">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Cobrador *</label>
                            <select
                              value={unifiedForm.cobradorId}
                              onChange={(e) => setUnifiedForm(prev => ({ ...prev, cobradorId: e.target.value }))}
                              className={`w-full px-2 py-2 border rounded-md focus:outline-none focus:ring-2 text-xs ${
                                showFormValidation
                                  ? (unifiedForm.cobradorId
                                      ? 'border-gray-300 focus:ring-green-500 focus:border-green-500'
                                      : 'border-red-300 focus:ring-red-500 focus:border-red-500')
                                  : 'border-gray-300 focus:ring-green-500 focus:border-green-500'
                              }`}
                            >
                              <option value="">— Seleccionar cobrador —</option>
                              {collectors.map((cobrador) => (
                                <option key={cobrador.id} value={cobrador.id}>{cobrador.nombres}</option>
                              ))}
                            </select>
                          </div>

                          {/* Referencia Pago Parcial */}
                          <div className="min-w-0">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Referencia</label>
                            <input
                              type="text"
                              value={unifiedForm.referencia}
                              onChange={(e) => setUnifiedForm(prev => ({ ...prev, referencia: e.target.value }))}
                              className="w-full px-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs"
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
                  conceptos={getAllConceptos()}
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
            <div className="border-b border-gray-200 px-6 py-3 bg-white flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="border border-gray-300 p-1.5 rounded-lg">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-black">Gestión de Deudas Pendientes</h2>
                    <p className="text-black text-sm">
                      {selectedMemberForDebts.nombres} {selectedMemberForDebts.apellidos} 
                      <span className="ml-2 text-gray-600">• Código: {selectedMemberForDebts.codigo}</span>
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
                  className="text-black hover:text-gray-600 transition-colors"
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
              <div className="border border-gray-200 rounded-lg p-4 mb-4">
                <h3 className="text-base font-semibold text-black mb-3">Datos del Pago</h3>
                
                {/* Primera fila - 5 campos principales */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
                  {/* Fecha de Pago */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">Fecha de Pago *</label>
                    <input
                      type="date"
                      value={debtPaymentForm.fecha}
                      onChange={(e) => setDebtPaymentForm(prev => ({ ...prev, fecha: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                    />
                  </div>

                  {/* Método de Pago */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">Método de Pago *</label>
                    <select
                      value={debtPaymentForm.metodoPago}
                      onChange={(e) => setDebtPaymentForm(prev => ({ ...prev, metodoPago: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
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
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
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
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
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
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
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
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                      placeholder="Observaciones adicionales sobre el pago..."
                    />
                  </div>
                  {/* Columna vacía para mantener el ancho reducido */}
                  <div></div>
                </div>


              </div>




              {/* Lista de Débitos Pendientes */}
              <div className="bg-white border border-gray-200 rounded-lg">
                <div className="px-3 py-2 border-b border-gray-200 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-black">📋 Detalle de Débitos Pendientes</span>
                      <span className="text-gray-400">•</span>
                      <span className="text-black font-medium">
                        Deuda Total Gs.{(
                          memberDebtMap[selectedMemberForDebts.id]?.saldo || 
                          selectedMemberForDebts.deudaTotal || 0
                        ).toLocaleString('es-PY')}
                      </span>
                      <span className="text-gray-400">•</span>
                      <span className="text-black font-medium">
                        Débitos Pendientes {pendingDebits.length}
                      </span>
                      <span className="text-gray-400">•</span>
                      <span className="text-black font-medium">
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
                        className="px-2 py-1 border border-gray-300 text-black rounded hover:bg-gray-50 transition-colors text-xs font-medium"
                      >
                        ✓ Todo
                      </button>
                      <button
                        onClick={() => setSelectedDebits([])}
                        title="Limpiar Selección"
                        className="px-2 py-1 border border-gray-300 text-black rounded hover:bg-gray-50 transition-colors text-xs"
                      >
                        🧹
                      </button>
                      <button
                        onClick={() => loadPendingDebits(selectedMemberForDebts.id)}
                        disabled={loadingDebits}
                        title="Actualizar Lista"
                        className="px-2 py-1 border border-gray-300 text-black rounded hover:bg-gray-50 transition-colors text-xs disabled:opacity-50"
                      >
                        {loadingDebits ? '⟳' : '🔄'}
                      </button>
                      <button
                        onClick={() => {
                          loadRefinancingsHistory(selectedMemberForDebts.id);
                          setShowRefinancingHistoryModal(true);
                        }}
                        title="Ver Historial de Refinanciaciones"
                        className="px-2 py-1 border border-gray-300 text-black rounded hover:bg-gray-50 transition-colors text-xs font-medium"
                      >
                        📋 Historial Refinanciaciones
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
                      <thead className="bg-white border-b border-gray-200">
                        <tr>
                          <th className="px-2 py-3 text-left font-semibold text-black w-8">
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
                              className="w-4 h-4 text-gray-600 bg-gray-100 border-gray-300 rounded focus:ring-gray-500 focus:ring-2"
                            />
                          </th>
                          <th className="px-3 py-3 text-left font-semibold text-black min-w-[150px]">Descripción</th>
                          <th className="px-3 py-3 text-left font-semibold text-black w-20">Fecha</th>
                          <th className="px-3 py-3 text-left font-semibold text-black w-24">Vencimiento</th>
                          <th className="px-3 py-3 text-center font-semibold text-black w-20">Días Atraso</th>
                          <th className="px-3 py-3 text-center font-semibold text-black w-16">Estado</th>
                          <th className="px-3 py-3 text-right font-semibold text-black w-28">Saldo Pendiente</th>
                          <th className="px-3 py-3 text-right font-semibold text-black w-24">Pagado</th>
                          <th className="px-3 py-3 text-center font-semibold text-black w-32">Monto a Pagar</th>
                        </tr>
                      </thead>

                      {/* Cuerpo de la Tabla */}
                      <tbody className="divide-y divide-gray-200">
                        {pendingDebits.map((debit, index) => {
                          const saldoPendiente = (debit.monto || 0) - (debit.paidAmount || 0);
                          const fechaVenc = debit.vencimiento ? new Date(debit.vencimiento) : null;
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const vencimientoDate = fechaVenc ? new Date(fechaVenc) : null;
                          if (vencimientoDate) vencimientoDate.setHours(0, 0, 0, 0);
                          const isVencido = vencimientoDate && vencimientoDate < today;
                          const isSelected = selectedDebits.includes(debit.id);
                          const diasVencido = fechaVenc ? Math.floor((new Date().getTime() - fechaVenc.getTime()) / (1000 * 60 * 60 * 24)) : 0;

                          return (
                            <tr 
                              key={debit.id}
                              className={`transition-all hover:bg-gray-50 ${
                                isSelected 
                                  ? 'bg-gray-100 border-l-4 border-gray-400' 
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
                                  className="w-4 h-4 text-gray-600 bg-gray-100 border-gray-300 rounded focus:ring-gray-500 focus:ring-2"
                                />
                              </td>

                              {/* Descripción */}
                              <td className="px-3 py-3">
                                <label 
                                  htmlFor={`debt-${debit.id}`}
                                  className="font-medium text-black cursor-pointer block"
                                >
                                  {debit.concepto || 'Sin concepto'}
                                </label>
                              </td>

                              {/* Fecha */}
                              <td className="px-3 py-3 text-black">
                                {debit.fecha ? new Date(debit.fecha).toLocaleDateString('es-PY') : 'N/A'}
                              </td>

                              {/* Vencimiento */}
                              <td className={`px-3 py-3 ${isVencido ? 'text-black font-medium' : 'text-black'}`}>
                                {debit.vencimiento ? new Date(debit.vencimiento).toLocaleDateString('es-PY') : 'N/A'}
                              </td>

                              {/* Días de Atraso */}
                              <td className="px-3 py-3 text-center">
                                {isVencido && diasVencido > 0 ? (
                                  <span className="text-black font-medium">
                                    {diasVencido}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>

                              {/* Estado */}
                              <td className="px-3 py-3 text-center">
                                {isVencido ? (
                                  <span className="text-black text-xs font-medium">
                                    VENCIDO
                                  </span>
                                ) : (
                                  <span className="text-black text-xs font-medium">
                                    AL DÍA
                                  </span>
                                )}
                              </td>

                              {/* Saldo Pendiente */}
                              <td className="px-3 py-3 text-right">
                                <span className={`font-bold ${isSelected ? 'text-black' : 'text-black'}`}>
                                  Gs.{saldoPendiente.toLocaleString('es-PY')}
                                </span>
                              </td>

                              {/* Pagado */}
                              <td className="px-3 py-3 text-right text-black">
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
                                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
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
                      <div className="text-gray-500 mb-2 text-sm">No se encontraron débitos pendientes</div>
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
                  <div className="border border-gray-200 rounded-lg p-4 mx-4 shadow-sm bg-white">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-black flex items-center gap-2">
                        📊 Resumen del Pago
                      </h4>
                      <span className="text-xs border border-gray-300 text-black px-2 py-1 rounded-full font-medium">
                        {selectedDebits.length} débito{selectedDebits.length !== 1 ? 's' : ''} seleccionado{selectedDebits.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                      {/* Total Adeudado */}
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="text-xs text-black mb-1">Total Adeudado</div>
                        <div className="text-lg font-bold text-black">
                          Gs.{totalSelectedDebts.toLocaleString('es-PY')}
                        </div>
                      </div>

                      {/* Total a Pagar */}
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="text-xs text-black mb-1">Total a Pagar</div>
                        <div className="text-lg font-bold text-black">
                          Gs.{totalIndividualAmounts.toLocaleString('es-PY')}
                        </div>
                      </div>

                      {/* Saldo Restante */}
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="text-xs text-black mb-1">Saldo Restante</div>
                        <div className={`text-lg font-bold ${remainingBalance <= 0 ? 'text-black' : 'text-black'}`}>
                          Gs.{remainingBalance.toLocaleString('es-PY')}
                        </div>
                      </div>

                      {/* Método de Pago */}
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="text-xs text-black mb-1">Método de Pago</div>
                        <div className="text-sm font-medium text-black">
                          {debtPaymentForm.metodoPago || 'No seleccionado'}
                        </div>
                      </div>
                    </div>

                    {/* Indicador de Estado del Pago */}
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {remainingBalance <= 0 ? (
                        <div className="flex items-center gap-2 text-black border border-gray-300 px-3 py-2 rounded-lg text-sm">
                          <span className="text-lg">✅</span>
                          <div>
                            <div className="font-semibold">Pago Completo</div>
                            <div className="text-xs text-black">Se saldarán todos los débitos seleccionados</div>
                          </div>
                        </div>
                      ) : totalIndividualAmounts > 0 ? (
                        <div className="flex items-center gap-2 text-black border border-gray-300 px-3 py-2 rounded-lg text-sm">
                          <span className="text-lg">💡</span>
                          <div>
                            <div className="font-semibold">Pago Parcial</div>
                            <div className="text-xs text-black">Quedará un saldo pendiente de Gs.{remainingBalance.toLocaleString('es-PY')}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-black border border-gray-300 px-3 py-2 rounded-lg text-sm">
                          <span className="text-lg">ℹ️</span>
                          <div>
                            <div className="font-semibold">Sin Pagos Definidos</div>
                            <div className="text-xs text-black">Ingrese los montos a pagar para cada débito</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer con Acciones - Fijo en la parte inferior */}
            <div className="bg-white border-t border-gray-200 px-4 py-3 flex-shrink-0">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-black">
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
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded text-black hover:bg-gray-50 transition-colors"
                  >
                    Cerrar
                  </button>
                  
                  {selectedDebits.length > 0 && (
                    <>
                      <button
                        onClick={() => setShowRefinancingModal(true)}
                        className="px-4 py-1.5 text-sm border border-gray-300 text-black rounded hover:bg-gray-50 transition-colors font-medium"
                      >
                        ♻️ Refinanciar deuda
                      </button>
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
                        className="px-4 py-1.5 text-sm border border-gray-300 text-black rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-200 transition-colors font-medium"
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

      {/* === Modal de Refinanciación === */}
      {showRefinancingModal && selectedMemberForDebts && (
        <RefinancingModal
          isOpen={showRefinancingModal}
          onClose={() => setShowRefinancingModal(false)}
          memberId={selectedMemberForDebts.id}
          member={selectedMemberForDebts}
          debits={pendingDebits.filter(d => selectedDebits.includes(d.id))}
          onSuccess={() => {
            setShowRefinancingModal(false);
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
            loadMembersAndLedgers();
            // Recargar débitos pendientes para reflejar la refinanciación
            if (selectedMemberForDebts?.id) {
              loadPendingDebits(selectedMemberForDebts.id);
            }
          }}
        />
      )}

      {/* === Modal de Historial de Refinanciaciones === */}
      {showRefinancingHistoryModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && setShowRefinancingHistoryModal(false)}
        >
          <div
            className="w-full max-w-4xl max-h-[90vh] overflow-hidden bg-white rounded-2xl shadow-2xl border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">📋 Historial de Refinanciaciones</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedMemberForDebts?.nombres} {selectedMemberForDebts?.apellidos}
                  </p>
                </div>
                <button 
                  onClick={() => setShowRefinancingHistoryModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Content */}
              <div className="max-h-[70vh] overflow-y-auto">
                {loadingHistory ? (
                  <div className="p-8 text-center">
                    <div className="text-gray-500 text-sm">⟳ Cargando historial...</div>
                  </div>
                ) : historyError ? (
                  <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
                    <div className="text-red-800 text-sm">❌ Error: {historyError}</div>
                    <button
                      onClick={() => loadRefinancingsHistory(selectedMemberForDebts!.id)}
                      className="mt-2 px-3 py-1 bg-red-100 text-red-800 rounded text-xs hover:bg-red-200"
                    >
                      🔄 Reintentar
                    </button>
                  </div>
                ) : refinancingsHistory.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="text-gray-500 text-sm">📄 No hay refinanciaciones registradas para este socio.</div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {refinancingsHistory.map((refinancing) => (
                      <div key={refinancing.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-gray-900">ID: {refinancing.id}</span>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                refinancing.status === 'ACTIVA' ? 'bg-green-100 text-green-800' :
                                refinancing.status === 'COMPLETADA' ? 'bg-blue-100 text-blue-800' :
                                refinancing.status === 'ANULADA' ? 'bg-red-100 text-red-800' :
                                refinancing.status === 'CANCELADA' ? 'bg-orange-100 text-orange-800' :
                                refinancing.status === 'APROBADA' ? 'bg-purple-100 text-purple-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {refinancing.status}
                              </span>
                            </div>
                            <div className="text-sm text-gray-600">
                              Creado: {new Date(refinancing.createdAt).toLocaleDateString('es-PY')}
                              {refinancing.executedAt && (
                                <> | Ejecutado: {new Date(refinancing.executedAt).toLocaleDateString('es-PY')}</>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {refinancing.status === 'ACTIVA' && (
                              <button
                                onClick={async () => {
                                  if (confirm('¿Está seguro de cancelar esta refinanciación? Esta acción revertirá todos los pagos y restaurará las deudas originales.')) {
                                    try {
                                      const response = await AuthClient.authenticatedFetch(`/api/refinancing/cancel`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          refinancingId: refinancing.id,
                                          cancelledBy: 'admin'
                                        })
                                      });
                                      
                                      if (response.ok) {
                                        alert('Refinanciación cancelada exitosamente');
                                        loadRefinancingsHistory(selectedMemberForDebts!.id);
                                        loadPendingDebits(selectedMemberForDebts!.id);
                                      } else {
                                        const error = await response.json();
                                        alert(`Error: ${error.error || 'No se pudo cancelar la refinanciación'}`);
                                      }
                                    } catch (error) {
                                      console.error('Error cancelling refinancing:', error);
                                      alert('Error de conexión al cancelar la refinanciación');
                                    }
                                  }
                                }}
                                className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs hover:bg-red-200 transition-colors"
                                title="Cancelar refinanciación"
                              >
                                🗑️ Cancelar
                              </button>
                            )}
                            <button
                              className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs hover:bg-purple-200 transition-colors"
                              title="Generar PDF"
                              onClick={async () => {
                                // Lógica para generar PDF reutilizando la de RefinancingModal
                                try {
                                  const jsPDF = (await import('jspdf')).default;
                                  // Utilidades de formato
                                  const formatCurrency = (n: number) => n?.toLocaleString('es-PY', { style: 'currency', currency: 'PYG', minimumFractionDigits: 0 })?.replace('₲', 'Gs.') ?? 'Gs.0';
                                  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('es-PY') : '';
                                  const member = selectedMemberForDebts;
                                  const debits = refinancing.originalDebitsSnapshot || [];
                                  const calculation = {
                                    principal: refinancing.principal,
                                    downPaymentAmount: refinancing.downPaymentAmount,
                                    totalInInstallments: refinancing.totalInInstallments,
                                    installmentAmount: refinancing.installmentAmount,
                                    schedule: refinancing.schedule || []
                                  };
                                  // --- Copia de la lógica de PDF del modal ---
                                  const doc = new jsPDF('portrait', 'mm', 'a4');
                                  const pageWidth = doc.internal.pageSize.width;
                                  const pageHeight = doc.internal.pageSize.height;
                                  const primaryColor = [41, 128, 185] as const;
                                  const secondaryColor = [52, 73, 94] as const;
                                  const accentColor = [46, 204, 113] as const;
                                  const lightGray = [245, 246, 250] as const;
                                  const borderGray = [218, 223, 228] as const;
                                  let yPosition = 25;
                                  const lineHeight = 4.5;
                                  const smallLineHeight = 3.5;
                                  const centerText = (text: string, y: number, fontSize: number = 12, isBold: boolean = false) => {
                                    doc.setFontSize(fontSize);
                                    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
                                    const textWidth = doc.getTextWidth(text);
                                    const x = (pageWidth - textWidth) / 2;
                                    doc.text(text, x, y);
                                  };
                                  const checkNewPage = (requiredSpace: number = 30) => {
                                    if (yPosition + requiredSpace > pageHeight - 20) {
                                      doc.addPage();
                                      yPosition = 25;
                                      return true;
                                    }
                                    return false;
                                  };
                                  // Encabezado
                                  doc.setFillColor(...primaryColor);
                                  doc.rect(0, 0, pageWidth, 15, 'F');
                                  doc.setTextColor(255, 255, 255);
                                  doc.setFontSize(14);
                                  doc.setFont('helvetica', 'bold');
                                  centerText('CLUB SOCIAL DEPORTIVO', 10, 14, true);
                                  doc.setDrawColor(...primaryColor);
                                  doc.setLineWidth(0.8);
                                  doc.line(20, 18, pageWidth - 20, 18);
                                  doc.setTextColor(...secondaryColor);
                                  centerText('SOLICITUD DE REFINANCIACIÓN', 28, 16, true);
                                  yPosition = 38;
                                  doc.setFontSize(9);
                                  doc.setTextColor(...secondaryColor);
                                  const nombreCompleto = `${member?.nombres || ''} ${member?.apellidos || ''}`.trim();
                                  const cedula = member?.ci || '';
                                  const codigo = member?.codigo || '';
                                  doc.setFillColor(...lightGray);
                                  doc.rect(20, yPosition - 5, pageWidth - 40, 15, 'F');
                                  doc.setDrawColor(...borderGray);
                                  doc.rect(20, yPosition - 5, pageWidth - 40, 15);
                                  doc.setFont('helvetica', 'bold');
                                  doc.text('SOCIO:', 25, yPosition);
                                  doc.setFont('helvetica', 'normal');
                                  doc.text(nombreCompleto || 'Información no disponible', 45, yPosition);
                                  doc.setFont('helvetica', 'bold');
                                  doc.text('C.I.N°:', 25, yPosition + 5);
                                  doc.setFont('helvetica', 'normal');
                                  doc.text(cedula || 'No disponible', 45, yPosition + 5);
                                  doc.setFont('helvetica', 'bold');
                                  doc.text('CÓDIGO:', 120, yPosition);
                                  doc.setFont('helvetica', 'normal');
                                  doc.text(codigo || 'No disponible', 145, yPosition);
                                  doc.setFont('helvetica', 'bold');
                                  doc.text('FECHA:', 120, yPosition + 5);
                                  doc.setFont('helvetica', 'normal');
                                  doc.text(new Date(refinancing.createdAt).toLocaleDateString('es-PY'), 145, yPosition + 5);
                                  yPosition += 15;
                                  // Débitos a refinanciar
                                  checkNewPage(40);
                                  yPosition += 8;
                                  doc.setFontSize(11);
                                  doc.setTextColor(...primaryColor);
                                  doc.setFont('helvetica', 'bold');
                                  doc.text('1. DÉBITOS A REFINANCIAR', 20, yPosition);
                                  yPosition += 6;
                                  const tableHeaderY = yPosition;
                                  const rowHeight = 6;
                                  doc.setFillColor(...primaryColor);
                                  doc.rect(20, tableHeaderY, pageWidth - 40, rowHeight, 'F');
                                  doc.setTextColor(255, 255, 255);
                                  doc.setFontSize(9);
                                  doc.text('CONCEPTO', 22, tableHeaderY + 4);
                                  doc.text('MONTO', 130, tableHeaderY + 4);
                                  doc.text('VENCIMIENTO', 160, tableHeaderY + 4);
                                  yPosition = tableHeaderY + rowHeight;
                                  doc.setTextColor(...secondaryColor);
                                  doc.setFont('helvetica', 'normal');
                                  debits.forEach((debit: any, index: number) => {
                                    if (index > 0 && index % 8 === 0) {
                                      checkNewPage(40);
                                      yPosition += 10;
                                    }
                                    if (index % 2 === 0) {
                                      doc.setFillColor(...lightGray);
                                      doc.rect(20, yPosition, pageWidth - 40, rowHeight, 'F');
                                    }
                                    doc.setDrawColor(...borderGray);
                                    doc.rect(20, yPosition, pageWidth - 40, rowHeight);
                                    const conceptText = (debit.concepto?.length > 45 ? debit.concepto.substring(0, 42) + '...' : debit.concepto) || '';
                                    doc.text(conceptText, 22, yPosition + 4);
                                    doc.text(formatCurrency(debit.monto - (debit.paidAmount || 0)), 130, yPosition + 4);
                                    doc.text(debit.vencimiento ? formatDate(debit.vencimiento) : 'N/A', 160, yPosition + 4);
                                    yPosition += rowHeight;
                                  });
                                  doc.setFillColor(...secondaryColor);
                                  doc.rect(20, yPosition, pageWidth - 40, rowHeight, 'F');
                                  doc.setTextColor(255, 255, 255);
                                  doc.setFont('helvetica', 'bold');
                                  doc.text('TOTAL A REFINANCIAR:', 22, yPosition + 4);
                                  doc.text(formatCurrency(refinancing.principal), 130, yPosition + 4);
                                  yPosition += rowHeight + 8;
                                  // Términos de refinanciación
                                  checkNewPage(30);
                                  doc.setTextColor(...primaryColor);
                                  doc.setFontSize(11);
                                  doc.setFont('helvetica', 'bold');
                                  doc.text('2. TÉRMINOS DE REFINANCIACIÓN', 20, yPosition);
                                  yPosition += 6;
                                  const termsData = [
                                    ['Cantidad de Cuotas:', `${refinancing.installments} cuotas`],
                                    ['Porcentaje Inicial:', `${refinancing.downPaymentPercent}%`],
                                    ['Monto Cuota Inicial:', formatCurrency(refinancing.downPaymentAmount)],
                                    ['Fecha Primera Cuota:', formatDate(refinancing.startDueDate)],
                                    ['Monto por Cuota:', formatCurrency(refinancing.installmentAmount)]
                                  ];
                                  termsData.forEach(([label, value], index) => {
                                    const rowY = yPosition + (index * 8);
                                    if (index % 2 === 0) {
                                      doc.setFillColor(...lightGray);
                                      doc.rect(20, rowY, pageWidth - 40, 8, 'F');
                                    }
                                    doc.setDrawColor(...borderGray);
                                    doc.rect(20, rowY, pageWidth - 40, 8);
                                    doc.setTextColor(...secondaryColor);
                                    doc.setFontSize(9);
                                    doc.setFont('helvetica', 'bold');
                                    doc.text(label, 25, rowY + 5);
                                    doc.setFont('helvetica', 'normal');
                                    const valueX = pageWidth - 45 - doc.getTextWidth(value);
                                    doc.text(value, valueX, rowY + 5);
                                  });
                                  yPosition += (termsData.length * 8) + 4;
                                  // Cronograma de pagos
                                  checkNewPage(50);
                                  doc.setTextColor(...primaryColor);
                                  doc.setFontSize(11);
                                  doc.setFont('helvetica', 'bold');
                                  doc.text('3. CRONOGRAMA DE PAGOS', 20, yPosition);
                                  yPosition += 6;
                                  if (refinancing.schedule) {
                                    const scheduleItems = refinancing.schedule;
                                    const usesTwoColumns = scheduleItems.length > 8;
                                    if (usesTwoColumns) {
                                      const itemsPerColumn = Math.ceil(scheduleItems.length / 2);
                                      const colWidth = (pageWidth - 50) / 2;
                                      doc.setFillColor(...primaryColor);
                                      doc.rect(20, yPosition, colWidth, 6, 'F');
                                      doc.rect(20 + colWidth + 10, yPosition, colWidth, 6, 'F');
                                      doc.setTextColor(255, 255, 255);
                                      doc.setFontSize(8);
                                      doc.text('CUOTA', 25, yPosition + 4);
                                      doc.text('MONTO', 60, yPosition + 4);
                                      doc.text('VENCIMIENTO', 95, yPosition + 4);
                                      doc.text('CUOTA', 25 + colWidth + 10, yPosition + 4);
                                      doc.text('MONTO', 60 + colWidth + 10, yPosition + 4);
                                      doc.text('VENCIMIENTO', 95 + colWidth + 10, yPosition + 4);
                                      yPosition += 6;
                                      const startY = yPosition;
                                      scheduleItems.forEach((installment: any, index: number) => {
                                        const rowY = startY + (Math.floor(index % itemsPerColumn) * 4);
                                        if (index < itemsPerColumn) {
                                          if (index % 2 === 0) {
                                            doc.setFillColor(...lightGray);
                                            doc.rect(20, rowY, colWidth, 4, 'F');
                                          }
                                          doc.setDrawColor(...borderGray);
                                          doc.rect(20, rowY, colWidth, 4);
                                          doc.setTextColor(...secondaryColor);
                                          doc.text(`${installment.number}`, 25, rowY + 2.5);
                                          doc.text(formatCurrency(installment.amount), 60, rowY + 2.5);
                                          doc.text(formatDate(installment.dueDate), 95, rowY + 2.5);
                                        } else {
                                          const rightIndex = index - itemsPerColumn;
                                          const rightRowY = startY + (rightIndex * 4);
                                          if (rightIndex % 2 === 0) {
                                            doc.setFillColor(...lightGray);
                                            doc.rect(20 + colWidth + 10, rightRowY, colWidth, 4, 'F');
                                          }
                                          doc.setDrawColor(...borderGray);
                                          doc.rect(20 + colWidth + 10, rightRowY, colWidth, 4);
                                          doc.setTextColor(...secondaryColor);
                                          doc.text(`${installment.number}`, 25 + colWidth + 10, rightRowY + 2.5);
                                          doc.text(formatCurrency(installment.amount), 60 + colWidth + 10, rightRowY + 2.5);
                                          doc.text(formatDate(installment.dueDate), 95 + colWidth + 10, rightRowY + 2.5);
                                        }
                                      });
                                      yPosition = startY + (itemsPerColumn * 4) + 8;
                                    } else {
                                      doc.setFillColor(...primaryColor);
                                      doc.rect(20, yPosition, pageWidth - 40, 6, 'F');
                                      doc.setTextColor(255, 255, 255);
                                      doc.setFontSize(8);
                                      doc.text('CUOTA', 25, yPosition + 4);
                                      doc.text('MONTO', 70, yPosition + 4);
                                      doc.text('VENCIMIENTO', 120, yPosition + 4);
                                      yPosition += 6;
                                      scheduleItems.forEach((installment: any, index: number) => {
                                        if (index % 2 === 0) {
                                          doc.setFillColor(...lightGray);
                                          doc.rect(20, yPosition, pageWidth - 40, 5, 'F');
                                        }
                                        doc.setDrawColor(...borderGray);
                                        doc.rect(20, yPosition, pageWidth - 40, 5);
                                        doc.setTextColor(...secondaryColor);
                                        doc.setFontSize(8);
                                        doc.text(`${installment.number}`, 25, yPosition + 3);
                                        doc.text(formatCurrency(installment.amount), 70, yPosition + 3);
                                        doc.text(formatDate(installment.dueDate), 120, yPosition + 3);
                                        yPosition += 5;
                                      });
                                      yPosition += 4;
                                    }
                                  }
                                  // Resumen financiero
                                  checkNewPage(25);
                                  doc.setTextColor(...primaryColor);
                                  doc.setFontSize(11);
                                  doc.setFont('helvetica', 'bold');
                                  doc.text('4. RESUMEN FINANCIERO', 20, yPosition);
                                  yPosition += 6;
                                  doc.setFillColor(...lightGray);
                                  doc.rect(20, yPosition, pageWidth - 40, 20, 'F');
                                  doc.setDrawColor(...primaryColor);
                                  doc.rect(20, yPosition, pageWidth - 40, 20);
                                  
                                  // Calcular el total financiado en cuotas correctamente
                                  let totalFinanciadoEnCuotas = 0;
                                  if (refinancing.schedule && refinancing.schedule.length > 0) {
                                    // Calcular basado en el cronograma real
                                    totalFinanciadoEnCuotas = refinancing.schedule.reduce((sum: number, installment: any) => {
                                      return sum + (installment.amount || 0);
                                    }, 0);
                                  } else if (refinancing.installmentAmount && refinancing.installments) {
                                    // Calcular basado en monto por cuota x número de cuotas
                                    totalFinanciadoEnCuotas = refinancing.installmentAmount * refinancing.installments;
                                  } else {
                                    // Fallback: principal - anticipo
                                    totalFinanciadoEnCuotas = (refinancing.principal || 0) - (refinancing.downPaymentAmount || 0);
                                  }
                                  
                                  const summaryData = [
                                    ['Total Principal Refinanciado:', formatCurrency(refinancing.principal)],
                                    ['Cuota Inicial:', formatCurrency(refinancing.downPaymentAmount)],
                                    ['Total Financiado en Cuotas:', formatCurrency(totalFinanciadoEnCuotas)],
                                    ['Número Total de Cuotas:', `${refinancing.installments} cuotas`],
                                    ['Monto por Cuota:', formatCurrency(refinancing.installmentAmount)]
                                  ];
                                  summaryData.forEach(([label, value], index) => {
                                    const itemY = yPosition + 5 + (index * 3.5);
                                    doc.setFontSize(9);
                                    doc.setFont('helvetica', 'bold');
                                    doc.setTextColor(...secondaryColor);
                                    doc.text(label, 25, itemY);
                                    doc.setFont('helvetica', 'normal');
                                    doc.setTextColor(...secondaryColor);
                                    const valueX = pageWidth - 45 - doc.getTextWidth(value);
                                    doc.text(value, valueX, itemY);
                                  });
                                  yPosition += 25;
                                  // Firmas
                                  checkNewPage(35);
                                  doc.setTextColor(...primaryColor);
                                  doc.setFontSize(11);
                                  doc.setFont('helvetica', 'bold');
                                  doc.text('5. AUTORIZACIONES', 20, yPosition);
                                  yPosition += 8;
                                  const signatureWidth = (pageWidth - 60) / 2;
                                  doc.setDrawColor(...borderGray);
                                  doc.rect(25, yPosition, signatureWidth, 25);
                                  doc.setFontSize(9);
                                  doc.setTextColor(...secondaryColor);
                                  doc.setFont('helvetica', 'bold');
                                  doc.text('FIRMA DEL SOCIO', 25 + (signatureWidth / 2) - (doc.getTextWidth('FIRMA DEL SOCIO') / 2), yPosition + 8);
                                  doc.setFont('helvetica', 'normal');
                                  doc.setFontSize(8);
                                  doc.text('Acepto los términos y condiciones de esta', 25 + 5, yPosition + 15);
                                  doc.text('refinanciación y me comprometo a su cumplimiento.', 25 + 5, yPosition + 19);
                                  doc.rect(35 + signatureWidth, yPosition, signatureWidth, 25);
                                  doc.setFont('helvetica', 'bold');
                                  doc.text('AUTORIZACIÓN DEL CLUB', 35 + signatureWidth + (signatureWidth / 2) - (doc.getTextWidth('AUTORIZACIÓN DEL CLUB') / 2), yPosition + 8);
                                  doc.setFont('helvetica', 'normal');
                                  doc.setFontSize(8);
                                  doc.text('Visto Bueno y Autorización de la', 35 + signatureWidth + 5, yPosition + 15);
                                  doc.text('Administración del Club', 35 + signatureWidth + 5, yPosition + 19);
                                  yPosition += 32;
                                  doc.setDrawColor(...borderGray);
                                  doc.line(20, yPosition, pageWidth - 20, yPosition);
                                  yPosition += 3;
                                  doc.setFontSize(7);
                                  doc.setTextColor(...secondaryColor);
                                  centerText(`Documento generado automáticamente el ${new Date().toLocaleString('es-PY')} - Página 1 de 1`, yPosition);
                                  const memberName = member ? `${member.nombres} ${member.apellidos}`.trim() : 'Sin_Nombre';
                                  const cleanName = memberName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').replace(/\s+/g, '_');
                                  const memberNumber = member?.codigo || 'Sin_Codigo';
                                  const todayDate = new Date(refinancing.createdAt).toLocaleDateString('es-PY', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
                                  const fileName = `Refinanciacion_${cleanName}_${memberNumber}_${todayDate}.pdf`;
                                  doc.save(fileName);
                                } catch (error) {
                                  alert('Error al generar PDF: ' + (error instanceof Error ? error.message : error));
                                }
                              }}
                            >
                              📄 Generar PDF
                            </button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Principal:</span>
                            <div className="font-medium">Gs.{refinancing.principal?.toLocaleString('es-PY') || 0}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Anticipo:</span>
                            <div className="font-medium">Gs.{refinancing.downPaymentAmount?.toLocaleString('es-PY') || 0}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Cuotas:</span>
                            <div className="font-medium">{refinancing.installments || 0}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Estado Cuotas:</span>
                            <div className="font-medium">
                              {refinancing.schedule ? (
                                <>
                                  {refinancing.schedule.filter((c: any) => c.status === 'PAGADA').length} pagadas / {refinancing.schedule.length} total
                                </>
                              ) : (
                                'N/A'
                              )}
                            </div>
                          </div>
                        </div>

                        {refinancing.observations && (
                          <div className="mt-2 text-sm text-gray-600">
                            <span className="font-medium">Observaciones:</span> {refinancing.observations}
                          </div>
                        )}

                        {refinancing.schedule && refinancing.schedule.length > 0 && (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                              Ver cronograma de cuotas
                            </summary>
                            <div className="mt-2 overflow-x-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="bg-gray-50">
                                    <th className="border border-gray-300 px-2 py-1 text-left">#</th>
                                    <th className="border border-gray-300 px-2 py-1 text-left">Vencimiento</th>
                                    <th className="border border-gray-300 px-2 py-1 text-right">Importe</th>
                                    <th className="border border-gray-300 px-2 py-1 text-right">Pagado</th>
                                    <th className="border border-gray-300 px-2 py-1 text-center">Estado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {refinancing.schedule.map((cuota: any) => (
                                    <tr key={cuota.number} className="hover:bg-gray-50">
                                      <td className="border border-gray-300 px-2 py-1">{cuota.number}</td>
                                      <td className="border border-gray-300 px-2 py-1">
                                        {new Date(cuota.dueDate).toLocaleDateString('es-PY')}
                                      </td>
                                      <td className="border border-gray-300 px-2 py-1 text-right">
                                        Gs.{cuota.amount?.toLocaleString('es-PY') || 0}
                                      </td>
                                      <td className="border border-gray-300 px-2 py-1 text-right">
                                        Gs.{cuota.paidAmount?.toLocaleString('es-PY') || 0}
                                      </td>
                                      <td className="border border-gray-300 px-2 py-1 text-center">
                                        <span className={`px-1 py-0.5 text-xs rounded ${
                                          cuota.status === 'PAGADA' ? 'bg-green-100 text-green-800' :
                                          cuota.status === 'PARCIAL' ? 'bg-yellow-100 text-yellow-800' :
                                          cuota.status === 'VENCIDA' ? 'bg-red-100 text-red-800' :
                                          'bg-gray-100 text-gray-800'
                                        }`}>
                                          {cuota.status}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        )}

                        {/* Deudas refinanciadas (snapshot) */}
                        {refinancing.originalDebitsSnapshot && refinancing.originalDebitsSnapshot.length > 0 && (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                              Ver deudas refinanciadas
                            </summary>
                            <div className="mt-2 overflow-x-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="bg-gray-50">
                                    <th className="border border-gray-300 px-2 py-1 text-left">#</th>
                                    <th className="border border-gray-300 px-2 py-1 text-left">Concepto</th>
                                    <th className="border border-gray-300 px-2 py-1 text-right">Monto original</th>
                                    <th className="border border-gray-300 px-2 py-1 text-right">Pagado antes</th>
                                    <th className="border border-gray-300 px-2 py-1 text-left">Vencimiento</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {refinancing.originalDebitsSnapshot.map((deuda: any, idx: number) => (
                                    <tr key={deuda.id || idx} className="hover:bg-gray-50">
                                      <td className="border border-gray-300 px-2 py-1">{idx + 1}</td>
                                      <td className="border border-gray-300 px-2 py-1">{deuda.concepto}</td>
                                      <td className="border border-gray-300 px-2 py-1 text-right">Gs.{deuda.monto?.toLocaleString('es-PY') || 0}</td>
                                      <td className="border border-gray-300 px-2 py-1 text-right">Gs.{deuda.paidAmount?.toLocaleString('es-PY') || 0}</td>
                                      <td className="border border-gray-300 px-2 py-1">{deuda.vencimiento ? new Date(deuda.vencimiento).toLocaleDateString('es-PY') : '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="mt-6 pt-4 border-t border-gray-200 flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  {refinancingsHistory.length > 0 && `${refinancingsHistory.length} refinanciación(es) encontrada(s)`}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadRefinancingsHistory(selectedMemberForDebts!.id)}
                    disabled={loadingHistory}
                    className="px-3 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors text-sm disabled:opacity-50"
                  >
                    {loadingHistory ? '⟳' : '🔄'} Actualizar
                  </button>
                  <button
                    onClick={() => setShowRefinancingHistoryModal(false)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm"
                  >
                    Cerrar
                  </button>
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
            className="w-full max-w-4xl max-h-[95vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">📅 Configurar Reserva</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Complete todos los detalles para la reserva del servicio
                  </p>
                </div>
                <button 
                  onClick={handleCloseReservaModal} 
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                {/* 1. Datos del Socio */}
                <div className="border border-gray-200 rounded-lg p-3">
                  <h4 className="text-xs font-medium text-gray-900 mb-2 flex items-center gap-2">
                    👤 Datos del Socio
                  </h4>
                  <div className="grid grid-cols-[3fr_1fr_1.5fr_2fr_2fr_1.2fr] gap-3 items-end">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nombre y Apellido</label>
                      <input
                        type="text"
                        value={`${selectedMemberForService?.nombres || ''} ${selectedMemberForService?.apellidos || ''}`}
                        disabled
                        className="w-full px-2 py-1 text-[13px] border border-gray-300 rounded bg-gray-50 text-gray-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">N° de Socio</label>
                      <input
                        type="text"
                        value={selectedMemberForService?.codigo || ''}
                        disabled
                        className="w-full px-2 py-1 text-[13px] border border-gray-300 rounded bg-gray-50 text-gray-600 text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Cédula</label>
                      <input
                        type="text"
                        value={reservaForm.cedula || selectedMemberForService?.ci || ''}
                        onChange={(e) => setReservaForm(prev => ({ ...prev, cedula: e.target.value }))}
                        placeholder="Ingrese cédula"
                        className="w-full px-2 py-1 text-[13px] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nro de Teléfono</label>
                      <input
                        type="text"
                        value={reservaForm.telefono || selectedMemberForService?.telefono || ''}
                        onChange={(e) => setReservaForm(prev => ({ ...prev, telefono: e.target.value }))}
                        placeholder="Ingrese teléfono"
                        className="w-full px-2 py-1 text-[13px] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">RUC (Opcional)</label>
                      <input
                        type="text"
                        value={reservaForm.ruc}
                        onChange={(e) => setReservaForm(prev => ({ ...prev, ruc: e.target.value }))}
                        placeholder="Ingrese RUC"
                        className="w-full px-2 py-1 text-[13px] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
                      <div className={`w-full px-2 py-1 text-[13px] border border-gray-300 rounded text-center font-medium ${
                        (memberDebtMap[selectedMemberForService?.id || '']?.estadoCalc ?? selectedMemberForService?.estado) === 'AL_DIA' 
                          ? 'bg-green-50 text-green-700 border-green-200' 
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {(memberDebtMap[selectedMemberForService?.id || '']?.estadoCalc ?? selectedMemberForService?.estado) === 'AL_DIA' 
                          ? 'Al día' 
                          : 'Atrasado'
                        }
                      </div>
                    </div>
                  </div>
                </div>
                  </div>

                {/* 2. Reserva a favor de tercero */}
                <div className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      id="esParaTercero"
                      checked={reservaForm.esParaTercero}
                      onChange={(e) => setReservaForm(prev => ({ ...prev, esParaTercero: e.target.checked }))}
                      className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                    />
                    <label htmlFor="esParaTercero" className="text-xs font-medium text-gray-900">
                      🎭 ¿Reserva a favor de un tercero?
                    </label>
                    </div>
                    
                  {reservaForm.esParaTercero && (
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Nombre y Apellido *</label>
                        <input
                          type="text"
                          value={reservaForm.terceroNombre}
                          onChange={(e) => setReservaForm(prev => ({ ...prev, terceroNombre: e.target.value }))}
                          placeholder="Nombre completo del tercero"
                          className="w-full px-2 py-1 text-[13px] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Cédula (Opcional)</label>
                        <input
                          type="text"
                          value={reservaForm.terceroCedula}
                          onChange={(e) => setReservaForm(prev => ({ ...prev, terceroCedula: e.target.value }))}
                          placeholder="Cédula del tercero"
                          className="w-full px-2 py-1 text-[13px] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono (Opcional)</label>
                        <input
                          type="text"
                          value={reservaForm.terceroTelefono}
                          onChange={(e) => setReservaForm(prev => ({ ...prev, terceroTelefono: e.target.value }))}
                          placeholder="Teléfono del tercero"
                          className="w-full px-2 py-1 text-[13px] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">RUC (Opcional)</label>
                        <input
                          type="text"
                          value={reservaForm.terceroRuc}
                          onChange={(e) => setReservaForm(prev => ({ ...prev, terceroRuc: e.target.value }))}
                          placeholder="RUC del tercero"
                          className="w-full px-2 py-1 text-[13px] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>
                    )}
                  </div>

                {/* 3, 4 y 5. Servicios, Datos del Evento y Acontecimiento - En una fila */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 3. Servicios y Espacios */}
                  <div className="border border-gray-200 rounded-lg p-3">
                    <h4 className="text-xs font-medium text-gray-900 mb-2 flex items-center gap-2">
                      🏢 Servicios y Espacios
                    </h4>
                    {(() => {
                      const concepto = getAllConceptos()
                        .find(c => c.id === reservaConceptoId);
                      const servicio = services.find(s => s.id === concepto?.servicioId);
                      
                      return (
                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Servicio</label>
                            <input
                              type="text"
                              value={servicio?.nombre || 'Servicio no encontrado'}
                              disabled
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-gray-50 text-gray-600"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Espacio *</label>
                            <input
                              type="text"
                              value={(() => {
                                // Obtener el espacio preseleccionado del concepto
                                const selectedVenue = venues.find(v => v.id === reservaForm.venueId);
                                if (selectedVenue) {
                                  return selectedVenue.nombre;
                                }
                                // Si no se encuentra en venues, buscar en espacios del servicio (estructura antigua)
                                if (servicio?.espacios && servicio.espacios.length > 0) {
                                  const espacioIndex = servicio.espacios.findIndex((_, index) => `espacio-${servicio.id}-${index}` === reservaForm.venueId);
                                  if (espacioIndex >= 0) {
                                    return servicio.espacios[espacioIndex];
                                  }
                                }
                                return 'Espacio seleccionado previamente';
                              })()}
                              disabled
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-gray-50 text-gray-600"
                            />
                          </div>
                          <div className="bg-purple-100 p-2 rounded text-xs">
                            <strong>💰 Pagos:</strong> {(() => {
                              const conceptos = getAllConceptos();
                              const concepto = conceptos.find(c => c.id === reservaConceptoId);
                              const servicio = services.find(s => s.id === concepto?.servicioId);
                              const monto = concepto?.monto ? parseInt(concepto.monto.replace(/[^\d]/g, '')) : 0;
                              return `${servicio?.nombre || 'N/A'} - Gs.${monto.toLocaleString('es-PY')}`;
                            })()}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 4. Datos del Evento */}
                  <div className="border border-gray-200 rounded-lg p-3">
                    <h4 className="text-xs font-medium text-gray-900 mb-2 flex items-center gap-2">
                      🎉 Datos del Evento
                    </h4>
                    <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Fecha del Evento *</label>
                          <input
                            type="date"
                            value={reservaForm.fecha}
                            onChange={(e) => setReservaForm(prev => ({ ...prev, fecha: e.target.value }))}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Hora de Inicio *</label>
                            <input
                              type="time"
                              value={reservaForm.inicioHora}
                              onChange={(e) => setReservaForm(prev => ({ ...prev, inicioHora: e.target.value }))}
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Hora de Fin *</label>
                            <input
                              type="time"
                              max="03:00"
                              value={reservaForm.finHora}
                              onChange={(e) => setReservaForm(prev => ({ ...prev, finHora: e.target.value }))}
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                          </div>
                        </div>

                        {/* Hora Extra */}
                        <div className="space-y-2">
                          {(() => {
                            const concepto = getAllConceptos()
                              .find(c => c.id === reservaConceptoId);
                            const servicio = services.find(s => s.id === concepto?.servicioId);
                            const permiteHorasExtras = (servicio as any)?.permiteHorasExtras;
                            const precioHoraExtra = (servicio as any)?.precioHoraExtra;
                            
                            return (
                              <>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id="horaExtra"
                                    checked={reservaForm.horaExtra}
                                    disabled={!permiteHorasExtras}
                                    onChange={(e) => {
                                      if (e.target.checked && permiteHorasExtras) {
                                        // Al activar, inicializar con 1 hora y el precio configurado
                                        const montoDefault = precioHoraExtra ? formatNumberWithSeparator(precioHoraExtra.toString()) : '';
                                        setReservaForm(prev => ({ 
                                          ...prev, 
                                          horaExtra: true,
                                          cantidadHorasExtra: '1',
                                          montoHorasExtra: montoDefault
                                        }));
                                      } else {
                                        setReservaForm(prev => ({ 
                                          ...prev, 
                                          horaExtra: false,
                                          cantidadHorasExtra: '',
                                          montoHorasExtra: ''
                                        }));
                                      }
                                    }}
                                    className={`w-3 h-3 border-gray-300 rounded focus:ring-green-500 ${
                                      permiteHorasExtras ? 'text-green-600' : 'text-gray-400'
                                    }`}
                                  />
                                  <label htmlFor="horaExtra" className={`text-xs ${
                                    permiteHorasExtras ? 'text-gray-700' : 'text-gray-400'
                                  }`}>
                                    ⏰ Hora extra
                                  </label>
                                </div>
                                
                                {!permiteHorasExtras && (
                                  <div className="bg-amber-50 border border-amber-200 rounded-md p-2">
                                    <p className="text-xs text-amber-700">
                                      ⚠️ El servicio no permite horas extras
                                    </p>
                                  </div>
                                )}
                                
                                {reservaForm.horaExtra && permiteHorasExtras && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">Horas</label>
                                      <input
                                        type="number"
                                        min="1"
                                        step="0.5"
                                        value={reservaForm.cantidadHorasExtra}
                                        onChange={(e) => {
                                          const horas = parseFloat(e.target.value) || 0;
                                          const montoTotal = horas * (precioHoraExtra || 0);
                                          const montoFormateado = montoTotal > 0 ? formatNumberWithSeparator(montoTotal.toString()) : '';
                                          
                                          setReservaForm(prev => ({ 
                                            ...prev, 
                                            cantidadHorasExtra: e.target.value,
                                            montoHorasExtra: montoFormateado
                                          }));
                                        }}
                                        placeholder="Ej: 2"
                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">Monto (Gs.)</label>
                                      <input
                                        type="text"
                                        value={reservaForm.montoHorasExtra}
                                        disabled
                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-gray-50 text-gray-600"
                                        placeholder="Calculado automáticamente"
                                      />
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                  {/* 5. Acontecimiento */}
                  <div className="border border-gray-200 rounded-lg p-3">
                    <h4 className="text-xs font-medium text-gray-900 mb-2 flex items-center gap-2">
                      🎊 Acontecimiento
                    </h4>
                    <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de Evento</label>
                          <select
                            value={reservaForm.acontecimiento}
                            onChange={(e) => {
                              setReservaForm(prev => ({ 
                                ...prev, 
                                acontecimiento: e.target.value,
                                // Reset campos dependientes
                                quinceaneraFocusNombre: '',
                                noviosNombres: '',
                                cumpleaneroNombre: '',
                                otrosDescripcion: '',
                                otrosNombrePersona: ''
                              }));
                            }}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-pink-500"
                          >
                            <option value="">— Seleccionar tipo —</option>
                            <option value="15_anos">15 años</option>
                            <option value="boda">Boda</option>
                            <option value="cumpleanos">Cumpleaños</option>
                            <option value="otros">Otros</option>
                          </select>
                        </div>

                        {/* Campos dependientes del acontecimiento */}
                        {reservaForm.acontecimiento === '15_anos' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre de la Quinceañera</label>
                            <input
                              type="text"
                              value={reservaForm.quinceaneraFocusNombre}
                              onChange={(e) => setReservaForm(prev => ({ ...prev, quinceaneraFocusNombre: e.target.value }))}
                              placeholder="Nombre completo de la quinceañera"
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-pink-500"
                            />
                          </div>
                        )}

                        {reservaForm.acontecimiento === 'boda' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Nombres de los Novios</label>
                            <input
                              type="text"
                              value={reservaForm.noviosNombres}
                              onChange={(e) => setReservaForm(prev => ({ ...prev, noviosNombres: e.target.value }))}
                              placeholder="Ej: Juan Pérez y María González"
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-pink-500"
                            />
                          </div>
                        )}

                        {reservaForm.acontecimiento === 'cumpleanos' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre del/la Cumpleañer@</label>
                            <input
                              type="text"
                              value={reservaForm.cumpleaneroNombre}
                              onChange={(e) => setReservaForm(prev => ({ ...prev, cumpleaneroNombre: e.target.value }))}
                              placeholder="Nombre del/la cumpleañer@"
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-pink-500"
                            />
                          </div>
                        )}

                        {reservaForm.acontecimiento === 'otros' && (
                          <div className="space-y-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
                              <input
                                type="text"
                                value={reservaForm.otrosDescripcion}
                                onChange={(e) => setReservaForm(prev => ({ ...prev, otrosDescripcion: e.target.value }))}
                                placeholder="Descripción del evento"
                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-pink-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre de la Persona (Opcional)</label>
                              <input
                                type="text"
                                value={reservaForm.otrosNombrePersona}
                                onChange={(e) => setReservaForm(prev => ({ ...prev, otrosNombrePersona: e.target.value }))}
                                placeholder="Nombre de la persona relacionada"
                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-pink-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                </div>

                {/* 6. Información Adicional */}
                <div className="border border-gray-200 rounded-lg p-3">
                  <h4 className="text-xs font-medium text-gray-900 mb-2 flex items-center gap-2">
                    📝 Información Adicional
                  </h4>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad de Personas (Aproximada)</label>
                      <input
                        type="number"
                        min="1"
                        value={reservaForm.cantidadPersonas}
                        onChange={(e) => setReservaForm(prev => ({ ...prev, cantidadPersonas: e.target.value }))}
                        placeholder="Ej: 50"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="requiereApa"
                        checked={reservaForm.requiereApa !== false}
                        onChange={e => setReservaForm(prev => ({ ...prev, requiereApa: e.target.checked }))}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="requiereApa" className="text-xs font-medium text-gray-700 select-none">Requiere APA?</label>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Observaciones Generales</label>
                      <textarea
                        rows={1}
                        value={reservaForm.observacionesGenerales}
                        onChange={(e) => setReservaForm(prev => ({ ...prev, observacionesGenerales: e.target.value }))}
                        placeholder="Detalles adicionales, requerimientos especiales, contactos importantes, etc."
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none"
                      />
                    </div>
                  </div>
                </div>

              {/* Info */}

              {/* Botones */}
              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-200">
                <button
                  onClick={handleSaveReserva}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  💾 Guardar reserva
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

      {/* === Modal de Multi-Reserva === */}
      {showMultiReservaModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && setShowMultiReservaModal(false)}
        >
          <div
            className="w-full max-w-[52.8rem] max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">📅 Reserva Múltiple de Espacios</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Configure una reserva única para {selectedConceptsForReserva.length} espacios simultáneamente
                  </p>
                </div>
                <button 
                  onClick={() => setShowMultiReservaModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Formulario Compacto - Misma estructura que reserva individual */}
              <div className="space-y-3">
                {/* 1. Datos del Socio - Una sola fila compacta */}
                <div className="border border-gray-200 rounded-lg p-3">
                  <h4 className="text-xs font-medium text-gray-900 mb-2 flex items-center gap-2">
                    👤 Datos del Socio
                  </h4>
                  <div className="grid grid-cols-[3fr_1fr_1.5fr_2fr_2fr_1.2fr] gap-3 items-end">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nombre y Apellido</label>
                      <input
                        type="text"
                        value={selectedMemberForService ? `${selectedMemberForService.nombres} ${selectedMemberForService.apellidos}` : ''}
                        disabled
                        className="w-full px-2 py-1 text-[13px] border border-gray-300 rounded bg-gray-50 text-gray-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">N° de Socio</label>
                      <input
                        type="text"
                        value={selectedMemberForService?.codigo || ''}
                        disabled
                        className="w-full px-2 py-1 text-[13px] border border-gray-300 rounded bg-gray-50 text-gray-600 text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Cédula</label>
                      <input
                        type="text"
                        value={multiReservaForm.cedula || selectedMemberForService?.ci || ''}
                        onChange={(e) => setMultiReservaForm(prev => ({ ...prev, cedula: e.target.value }))}
                        placeholder="Ingrese cédula"
                        className="w-full px-2 py-1 text-[13px] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nro de Teléfono</label>
                      <input
                        type="text"
                        value={multiReservaForm.telefono || selectedMemberForService?.telefono || ''}
                        onChange={(e) => setMultiReservaForm(prev => ({ ...prev, telefono: e.target.value }))}
                        placeholder="Ingrese teléfono"
                        className="w-full px-2 py-1 text-[13px] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">RUC (Opcional)</label>
                      <input
                        type="text"
                        value={multiReservaForm.ruc}
                        onChange={(e) => setMultiReservaForm(prev => ({ ...prev, ruc: e.target.value }))}
                        placeholder="Ingrese RUC"
                        className="w-full px-2 py-1 text-[13px] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
                      <div className={`w-full px-2 py-1 text-[13px] border border-gray-300 rounded text-center font-medium ${
                        (memberDebtMap[selectedMemberForService?.id || '']?.estadoCalc ?? selectedMemberForService?.estado) === 'AL_DIA' 
                          ? 'bg-green-50 text-green-700 border-green-200' 
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {(memberDebtMap[selectedMemberForService?.id || '']?.estadoCalc ?? selectedMemberForService?.estado) === 'AL_DIA' 
                          ? 'Al día' 
                          : 'Atrasado'
                        }
                      </div>
                    </div>
                  </div>
                </div>

                {/* Layout reorganizado - Tres columnas lado a lado */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  {/* 2. Reserva a favor de un tercero */}
                  <div className="border border-gray-200 rounded-lg p-2">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        id="esParaTerceroMulti"
                        checked={multiReservaForm.esParaTercero}
                        onChange={(e) => setMultiReservaForm(prev => ({ ...prev, esParaTercero: e.target.checked }))}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="esParaTerceroMulti" className="text-xs font-medium text-gray-700 select-none">
                        🤝 Reserva a favor de un tercero
                      </label>
                    </div>
                    
                    {multiReservaForm.esParaTercero && (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Nombre Completo *</label>
                          <input
                            type="text"
                            value={multiReservaForm.terceroNombre}
                            onChange={(e) => setMultiReservaForm(prev => ({ ...prev, terceroNombre: e.target.value }))}
                            placeholder="Nombre completo del tercero"
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Cédula</label>
                          <input
                            type="text"
                            value={multiReservaForm.terceroCedula}
                            onChange={(e) => setMultiReservaForm(prev => ({ ...prev, terceroCedula: e.target.value }))}
                            placeholder="Cédula del tercero"
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono</label>
                          <input
                            type="text"
                            value={multiReservaForm.terceroTelefono}
                            onChange={(e) => setMultiReservaForm(prev => ({ ...prev, terceroTelefono: e.target.value }))}
                            placeholder="Teléfono del tercero"
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">RUC (Opcional)</label>
                          <input
                            type="text"
                            value={multiReservaForm.terceroRuc}
                            onChange={(e) => setMultiReservaForm(prev => ({ ...prev, terceroRuc: e.target.value }))}
                            placeholder="RUC del tercero"
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                
                  {/* 🏢 Servicios y Espacios - Columna izquierda */}
                  <div className="border border-gray-200 rounded-lg p-2">
                    <h4 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                      🏢 Servicios y Espacios
                    </h4>
                    <div className="space-y-2">
                      <p className="text-xs text-gray-600 mb-2">
                        {selectedConceptsForReserva.length} concepto(s) seleccionado(s) para reserva:
                      </p>
                      
                      {/* Tabla de Servicios y Espacios */}
                      <div className="border border-gray-200 rounded overflow-hidden">
                        {/* Encabezados */}
                        <div className="grid grid-cols-2 bg-gray-100 border-b border-gray-200">
                          <div className="px-2 py-1 text-xs font-semibold text-gray-700 border-r border-gray-200">
                            Servicio
                          </div>
                          <div className="px-2 py-1 text-xs font-semibold text-gray-700">
                            Espacio
                          </div>
                        </div>
                        
                        {/* Filas de datos */}
                        <div className="max-h-16 overflow-y-auto">
                          {selectedConceptsForReserva.map(conceptoId => {
                            const concepto = getAllConceptos()
                              .find(c => c.id === conceptoId);
                            const servicio = services.find(s => s.id === concepto?.servicioId);
                            
                            // Buscar el espacio seleccionado desde el modal de cobranza
                            let espacioSeleccionado = null;
                            
                            if (concepto?.reservaVenueId) {
                              // 1. Buscar primero en venues globales
                              espacioSeleccionado = venues.find(v => v.id === concepto.reservaVenueId);
                              
                              // 2. Si no se encuentra, buscar en espacios disponibles del servicio
                              if (!espacioSeleccionado && servicio) {
                                // Nueva estructura: array de objetos Venue
                                if (servicio.espaciosDisponibles && servicio.espaciosDisponibles.length > 0) {
                                  espacioSeleccionado = servicio.espaciosDisponibles.find((esp: any) => esp.id === concepto.reservaVenueId);
                                }
                                // Estructura antigua: array de strings convertido a objetos
                                else if ((servicio as any).espacios && (servicio as any).espacios.length > 0) {
                                  const espaciosAntiguos = (servicio as any).espacios.map((nombre: string, index: number) => ({
                                    id: `espacio-${servicio.id}-${index}`,
                                    nombre: nombre,
                                    descripcion: '',
                                    activo: true
                                  }));
                                  espacioSeleccionado = espaciosAntiguos.find((esp: any) => esp.id === concepto.reservaVenueId);
                                }
                              }
                            }
                            
                            return (
                              <div key={conceptoId} className="grid grid-cols-2 border-b border-gray-100 last:border-b-0 hover:bg-blue-25">
                                <div className="px-2 py-1 text-xs text-gray-700 border-r border-gray-100 flex items-center">
                                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0 mr-1"></span>
                                  <span className="font-medium truncate">{servicio?.nombre || 'Servicio no encontrado'}</span>
                                </div>
                                <div className="px-2 py-1 text-xs text-gray-700 flex items-center">
                                  {espacioSeleccionado ? (
                                    <span className="truncate font-medium">
                                      {espacioSeleccionado.nombre}
                                      {espacioSeleccionado.capacidad ? ` (${espacioSeleccionado.capacidad} pers.)` : ''}
                                    </span>
                                  ) : concepto?.reservaVenueId ? (
                                    <span className="truncate">
                                      {servicio?.nombre || 'Servicio no encontrado'}
                                    </span>
                                  ) : (
                                    <span className="truncate">
                                      {servicio?.nombre || 'Sin espacio asignado'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* 📝 Información Adicional - Columna derecha */}
                  <div className="border border-gray-200 rounded-lg p-2">
                    <h4 className="text-xs font-medium text-gray-900 mb-2 flex items-center gap-2">
                      📝 Información Adicional
                    </h4>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad de Personas</label>
                        <input
                          type="number"
                          min="1"
                          value={multiReservaForm.cantidadPersonas}
                          onChange={(e) => setMultiReservaForm(prev => ({ ...prev, cantidadPersonas: e.target.value }))}
                          placeholder="Ej: 50"
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Requiere APA</label>
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="checkbox"
                            id="requiereApaMulti"
                            checked={multiReservaForm.requiereApa !== false}
                            onChange={e => setMultiReservaForm(prev => ({ ...prev, requiereApa: e.target.checked }))}
                            className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <label htmlFor="requiereApaMulti" className="text-xs font-medium text-gray-700 select-none">Sí</label>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Observaciones</label>
                        <textarea
                          rows={2}
                          value={multiReservaForm.observacionesGenerales}
                          onChange={(e) => setMultiReservaForm(prev => ({ ...prev, observacionesGenerales: e.target.value }))}
                          placeholder="Detalles adicionales..."
                          className="w-full px-1 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500 resize-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ⚙️ Configuración Avanzada - Bloque completo debajo */}
                <div className="space-y-1 mb-3">
                  {/* ⚙️ Configuración Avanzada - Columna completa */}
                  <div className="border border-gray-200 rounded-lg p-2">
                    <h4 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                      ⚙️ Configuración Avanzada
                    </h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          id="configuracionIndividualCheck"
                          checked={multiReservaForm.configuracionIndividual}
                          onChange={(e) => {
                            const isIndividual = e.target.checked;
                            
                            if (!isIndividual && multiReservaForm.horaExtra) {
                              // CAMBIO DE INDIVIDUAL A GLOBAL: Auto-calcular monto total
                              let montoTotalPorHora = 0;
                              let serviciosConHoraExtra = 0;
                              
                              selectedConceptsForReserva.forEach(conceptoId => {
                                const concepto = getAllConceptos()
                                  .find(c => c.id === conceptoId);
                                const servicio = services.find(s => s.id === concepto?.servicioId);
                                if (servicio?.permiteHorasExtras && servicio?.precioHoraExtra) {
                                  montoTotalPorHora += servicio.precioHoraExtra;
                                  serviciosConHoraExtra++;
                                }
                              });
                              
                              if (serviciosConHoraExtra > 0) {
                                const horas = parseFloat(multiReservaForm.cantidadHorasExtra) || 1;
                                const montoTotal = horas * montoTotalPorHora;
                                const montoFormateado = formatNumberWithSeparator(montoTotal.toString());
                                
                                console.log('💰 Auto-calculando monto global:', {
                                  horas,
                                  servicios: serviciosConHoraExtra,
                                  montoPorHora: montoTotalPorHora,
                                  montoTotal,
                                  montoFormateado
                                });
                                
                                setMultiReservaForm(prev => ({ 
                                  ...prev, 
                                  configuracionIndividual: isIndividual,
                                  cantidadHorasExtra: horas.toString(),
                                  montoHorasExtra: montoFormateado
                                }));
                                return;
                              }
                            }
                            
                            // Cambio normal sin auto-cálculo
                            setMultiReservaForm(prev => ({ ...prev, configuracionIndividual: isIndividual }));
                          }}
                          className="w-3 h-3 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                        />
                        <label htmlFor="configuracionIndividualCheck" className="text-xs font-medium text-gray-700 select-none">
                          Configuración individual por servicio
                        </label>
                      </div>
                      <p className="text-xs text-gray-600">
                        Permite configurar horarios y horas extra específicos para cada servicio seleccionado.
                      </p>
                    </div>
                  </div>

                  {/* 🔧 Configuración Individual por Servicio - Solo si está activada */}
                  {multiReservaForm.configuracionIndividual && (
                    <div className="border border-gray-200 rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                        🔧 Configuración Individual por Servicio
                      </h4>
                      <div className="space-y-2">
                        <p className="text-xs text-gray-600 mb-3">
                          Configure horarios y horas extra específicos para cada servicio:
                        </p>
                        
                        {/* Tabla de configuración individual */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-700">Servicio</th>
                                <th className="border border-gray-200 px-3 py-2 text-center font-medium text-gray-700">Inicio</th>
                                <th className="border border-gray-200 px-3 py-2 text-center font-medium text-gray-700">Fin</th>
                                <th className="border border-gray-200 px-3 py-2 text-center font-medium text-gray-700">Extra</th>
                                <th className="border border-gray-200 px-3 py-2 text-center font-medium text-gray-700">Cantidad</th>
                                <th className="border border-gray-200 px-3 py-2 text-center font-medium text-gray-700">Monto (Gs.)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedConceptsForReserva.map(conceptoId => {
                                const concepto = getAllConceptos()
                                  .find(c => c.id === conceptoId);
                                const servicio = services.find(s => s.id === concepto?.servicioId);
                                const config = multiReservaForm.configuracionesIndividuales[conceptoId] || {
                                  inicioHora: multiReservaForm.inicioHora || '19:00',
                                  finHora: multiReservaForm.finHora || '03:00',
                                  horaExtra: false,
                                  cantidadHorasExtra: '',
                                  montoHorasExtra: ''
                                };
                                
                                return (
                                  <tr key={conceptoId} className="hover:bg-gray-25">
                                    {/* Servicio */}
                                    <td className="border border-gray-200 px-3 py-2 font-medium text-gray-800">
                                      {servicio?.nombre}
                                    </td>
                                    
                                    {/* Inicio */}
                                    <td className="border border-gray-200 px-3 py-2 text-center">
                                      <input
                                        type="time"
                                        value={config.inicioHora}
                                        onChange={(e) => {
                                          setMultiReservaForm(prev => ({
                                            ...prev,
                                            configuracionesIndividuales: {
                                              ...prev.configuracionesIndividuales,
                                              [conceptoId]: { ...config, inicioHora: e.target.value }
                                            }
                                          }));
                                        }}
                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-center"
                                      />
                                    </td>
                                    
                                    {/* Fin */}
                                    <td className="border border-gray-200 px-3 py-2 text-center">
                                      <input
                                        type="time"
                                        value={config.finHora}
                                        onChange={(e) => {
                                          setMultiReservaForm(prev => ({
                                            ...prev,
                                            configuracionesIndividuales: {
                                              ...prev.configuracionesIndividuales,
                                              [conceptoId]: { ...config, finHora: e.target.value }
                                            }
                                          }));
                                        }}
                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-center"
                                      />
                                    </td>
                                    
                                    {/* Extra */}
                                    <td className="border border-gray-200 px-3 py-2 text-center">
                                      {servicio?.permiteHorasExtras && servicio?.precioHoraExtra ? (
                                        <input
                                          type="checkbox"
                                          checked={config.horaExtra}
                                          onChange={(e) => {
                                            setMultiReservaForm(prev => ({
                                              ...prev,
                                              configuracionesIndividuales: {
                                                ...prev.configuracionesIndividuales,
                                                [conceptoId]: { 
                                                  ...config, 
                                                  horaExtra: e.target.checked,
                                                  cantidadHorasExtra: e.target.checked ? '1' : '',
                                                  montoHorasExtra: e.target.checked ? formatNumberWithSeparator((servicio?.precioHoraExtra || 0).toString()) : ''
                                                }
                                              }
                                            }));
                                          }}
                                          className="w-4 h-4 border-gray-300 rounded focus:ring-orange-500 text-orange-600"
                                        />
                                      ) : (
                                        <div 
                                          className="flex items-center justify-center cursor-help"
                                          title={`${servicio?.nombre || 'Servicio'} no permite hora extra o no tiene precio configurado`}
                                        >
                                          <span className="text-red-500 text-xs">❌</span>
                                        </div>
                                      )}
                                    </td>
                                    
                                    {/* Cantidad */}
                                    <td className="border border-gray-200 px-3 py-2 text-center">
                                      {config.horaExtra && servicio?.permiteHorasExtras && servicio?.precioHoraExtra ? (
                                        <div className="flex items-center justify-center gap-1">
                                          <input
                                            type="number"
                                            min="1"
                                            step="0.5"
                                            value={config.cantidadHorasExtra}
                                            onChange={(e) => {
                                              const horas = parseFloat(e.target.value) || 0;
                                              const precioHoraExtra = servicio?.precioHoraExtra || 50000; // Usar precio específico del servicio
                                              const montoTotal = horas * precioHoraExtra;
                                              const montoFormateado = montoTotal > 0 ? formatNumberWithSeparator(montoTotal.toString()) : '';
                                              
                                              setMultiReservaForm(prev => ({
                                                ...prev,
                                                configuracionesIndividuales: {
                                                  ...prev.configuracionesIndividuales,
                                                  [conceptoId]: { 
                                                    ...config, 
                                                    cantidadHorasExtra: e.target.value,
                                                    montoHorasExtra: montoFormateado
                                                  }
                                                }
                                              }));
                                            }}
                                            placeholder="1"
                                            className="w-16 px-2 py-1 text-xs border border-gray-300 rounded text-center"
                                          />
                                          <span className="text-gray-500 text-xs">hrs</span>
                                        </div>
                                      ) : (
                                        <span className="text-gray-400">—</span>
                                      )}
                                    </td>
                                    
                                    {/* Monto */}
                                    <td className="border border-gray-200 px-3 py-2 text-center">
                                      {config.horaExtra && servicio?.permiteHorasExtras && servicio?.precioHoraExtra ? (
                                        <input
                                          type="text"
                                          value={config.montoHorasExtra}
                                          disabled
                                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-gray-50 text-gray-600 text-center"
                                          placeholder="Auto"
                                        />
                                      ) : !servicio?.permiteHorasExtras || !servicio?.precioHoraExtra ? (
                                        <span className="text-red-400 text-xs">Sin config.</span>
                                      ) : (
                                        <span className="text-gray-400">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tres columnas: Horas Extra, Datos del Evento y Acontecimiento */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* ⏰ Horas Extra - Solo si NO es configuración individual */}
                    {!multiReservaForm.configuracionIndividual && (
                      <div className="border border-gray-200 rounded-lg p-3">
                        <h4 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                          ⏰ Horas Extra
                        </h4>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="horaExtraMulti"
                              checked={multiReservaForm.horaExtra}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  // Calcular monto total sumando horas extra solo de servicios que las permiten
                                  let montoTotalPorHora = 0;
                                  let serviciosConHoraExtra = 0;
                                  selectedConceptsForReserva.forEach(conceptoId => {
                                    const concepto = getAllConceptos()
                                      .find(c => c.id === conceptoId);
                                    const servicio = services.find(s => s.id === concepto?.servicioId);
                                    if (servicio?.permiteHorasExtras && servicio?.precioHoraExtra) {
                                      montoTotalPorHora += servicio.precioHoraExtra;
                                      serviciosConHoraExtra++;
                                    }
                                  });
                                  
                                  // Solo habilitar si hay al menos un servicio con hora extra
                                  if (serviciosConHoraExtra === 0) {
                                    alert('❌ Ninguno de los servicios seleccionados permite horas extra o no tienen precio configurado.\n\nDebe configurar los precios de hora extra en la página de Editar Servicios primero.');
                                    return;
                                  }
                                  
                                  const montoFormateado = formatNumberWithSeparator(montoTotalPorHora.toString());
                                  setMultiReservaForm(prev => ({ 
                                    ...prev, 
                                    horaExtra: true,
                                    cantidadHorasExtra: '1',
                                    montoHorasExtra: montoFormateado
                                  }));
                                } else {
                                  setMultiReservaForm(prev => ({ 
                                    ...prev, 
                                    horaExtra: false,
                                    cantidadHorasExtra: '',
                                    montoHorasExtra: ''
                                  }));
                                }
                              }}
                              className="w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"
                            />
                            <label htmlFor="horaExtraMulti" className="text-xs font-medium text-gray-700">
                              ¿Hora extra? (después de las 03:00)
                            </label>
                          </div>
                          
                          {/* Información de servicios con/sin hora extra */}
                          <div className="text-xs text-gray-600 pl-6">
                            {(() => {
                              const serviciosConHoraExtra: string[] = [];
                              const serviciosSinHoraExtra: string[] = [];
                              
                              selectedConceptsForReserva.forEach(conceptoId => {
                                const concepto = getAllConceptos()
                                  .find(c => c.id === conceptoId);
                                const servicio = services.find(s => s.id === concepto?.servicioId);
                                
                                if (servicio?.permiteHorasExtras && servicio?.precioHoraExtra) {
                                  serviciosConHoraExtra.push(`${servicio.nombre} (${formatNumberWithSeparator(servicio.precioHoraExtra.toString())} Gs/h)`);
                                } else {
                                  serviciosSinHoraExtra.push(servicio?.nombre || 'Desconocido');
                                }
                              });
                              
                              return (
                                <div className="space-y-1">
                                  {serviciosConHoraExtra.length > 0 && (
                                    <div>✅ <strong>Con hora extra:</strong> {serviciosConHoraExtra.join(', ')}</div>
                                  )}
                                  {serviciosSinHoraExtra.length > 0 && (
                                    <div className="text-red-600">❌ <strong>Sin configurar:</strong> {serviciosSinHoraExtra.join(', ')}</div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                          
                          <div className="flex items-center gap-2">
                          </div>
                          
                          {multiReservaForm.horaExtra && (
                            <div className="grid grid-cols-2 gap-2 pl-6">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad (horas)</label>
                                <input
                                  type="number"
                                  min="1"
                                  step="0.5"
                                  value={multiReservaForm.cantidadHorasExtra}
                                  onChange={(e) => {
                                    const horas = parseFloat(e.target.value) || 0;
                                    
                                    // Calcular monto total sumando horas extra solo de servicios configurados
                                    let montoTotalPorHora = 0;
                                    selectedConceptsForReserva.forEach(conceptoId => {
                                      const concepto = getAllConceptos()
                                        .find(c => c.id === conceptoId);
                                      const servicio = services.find(s => s.id === concepto?.servicioId);
                                      if (servicio?.permiteHorasExtras && servicio?.precioHoraExtra) {
                                        montoTotalPorHora += servicio.precioHoraExtra;
                                      }
                                    });
                                    
                                    const montoTotal = horas * montoTotalPorHora;
                                    const montoFormateado = montoTotal > 0 ? formatNumberWithSeparator(montoTotal.toString()) : '';
                                    
                                    setMultiReservaForm(prev => ({ 
                                      ...prev, 
                                      cantidadHorasExtra: e.target.value,
                                      montoHorasExtra: montoFormateado
                                    }));
                                  }}
                                  placeholder="Ej: 2"
                                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-yellow-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Monto (Gs.)</label>
                                <input
                                  type="text"
                                  value={multiReservaForm.montoHorasExtra}
                                  disabled
                                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-gray-50 text-gray-600"
                                  placeholder="Calculado automáticamente"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 🎉 Datos del Evento */}
                    <div className="border border-gray-200 rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                        🎉 Datos del Evento
                      </h4>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Fecha</label>
                          <input
                            type="date"
                            value={multiReservaForm.fecha}
                            onChange={(e) => setMultiReservaForm(prev => ({ ...prev, fecha: e.target.value }))}
                            className="w-full px-1 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                          />
                        </div>
                        
                        {/* Solo mostrar horarios si NO está activada la configuración individual */}
                        {!multiReservaForm.configuracionIndividual && (
                          <div className="grid grid-cols-2 gap-1">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Inicio</label>
                              <input
                                type="time"
                                value={multiReservaForm.inicioHora}
                                onChange={(e) => setMultiReservaForm(prev => ({ ...prev, inicioHora: e.target.value }))}
                                className="w-full px-1 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Fin</label>
                              <input
                                type="time"
                                value={multiReservaForm.finHora}
                                onChange={(e) => setMultiReservaForm(prev => ({ ...prev, finHora: e.target.value }))}
                                className="w-full px-1 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 🎊 Acontecimiento */}
                    <div className="border border-gray-200 rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                        🎊 Acontecimiento
                      </h4>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de Evento</label>
                          <select
                            value={multiReservaForm.acontecimiento}
                            onChange={(e) => setMultiReservaForm(prev => ({ ...prev, acontecimiento: e.target.value }))}
                            className="w-full px-1 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-pink-500"
                          >
                            <option value="">— Seleccionar —</option>
                            <option value="15_anos">🎂 15 años</option>
                            <option value="boda">💒 Boda</option>
                            <option value="cumpleanos">🎉 Cumple</option>
                            <option value="otros">🎪 Otros</option>
                          </select>
                        </div>

                        {/* Campos específicos del acontecimiento */}
                        {multiReservaForm.acontecimiento === '15_anos' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Quinceañera</label>
                            <input
                              type="text"
                              value={multiReservaForm.quinceaneraFocusNombre}
                              onChange={(e) => setMultiReservaForm(prev => ({ ...prev, quinceaneraFocusNombre: e.target.value }))}
                              placeholder="Nombre completo"
                              className="w-full px-1 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-pink-500"
                            />
                          </div>
                        )}

                        {multiReservaForm.acontecimiento === 'boda' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Novios</label>
                            <input
                              type="text"
                              value={multiReservaForm.noviosNombres}
                              onChange={(e) => setMultiReservaForm(prev => ({ ...prev, noviosNombres: e.target.value }))}
                              placeholder="Juan y María"
                              className="w-full px-1 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-pink-500"
                            />
                          </div>
                        )}

                        {multiReservaForm.acontecimiento === 'cumpleanos' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Cumpleañer@</label>
                            <input
                              type="text"
                              value={multiReservaForm.cumpleaneroNombre}
                              onChange={(e) => setMultiReservaForm(prev => ({ ...prev, cumpleaneroNombre: e.target.value }))}
                              placeholder="Nombre"
                              className="w-full px-1 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-pink-500"
                            />
                          </div>
                        )}

                        {multiReservaForm.acontecimiento === 'otros' && (
                          <div className="space-y-1">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
                              <input
                                type="text"
                                value={multiReservaForm.otrosDescripcion}
                                onChange={(e) => setMultiReservaForm(prev => ({ ...prev, otrosDescripcion: e.target.value }))}
                                placeholder="Tipo de evento"
                                className="w-full px-1 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-pink-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Persona</label>
                              <input
                                type="text"
                                value={multiReservaForm.otrosNombrePersona}
                                onChange={(e) => setMultiReservaForm(prev => ({ ...prev, otrosNombrePersona: e.target.value }))}
                                placeholder="Nombre (opcional)"
                                className="w-full px-1 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-pink-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botones */}
              <div className="flex items-center gap-3 mt-6 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    // Validar formulario
                    const validationErrors = validateMultiReservaForm();
                    if (validationErrors.length > 0) {
                      alert('❌ Errores de validación:\n\n' + validationErrors.join('\n'));
                      return;
                    }
                    
                    // Buscar el venue seleccionado para obtener su nombre
                    const selectedVenue = venues.find(v => v.id === multiReservaForm.venueId);
                    const venueName = selectedVenue?.nombre || 'Espacio no encontrado';
                    
                    // Aplicar la configuración a todos los conceptos seleccionados
                    let totalHorasExtraCreadas = 0;
                    let montoTotalHorasExtra = 0;
                    
                    // 🔧 GUARDADO OPTIMIZADO: Una sola operación de estado
                    setUnifiedForm(prev => {
                      const nuevoEstado = { ...prev };
                      
                      selectedConceptsForReserva.forEach(conceptoId => {
                        // Buscar el concepto en la lista unificada
                        const concepto = prev.conceptos?.find(c => c.id === conceptoId);
                        
                        // 🔧 Calcular fechas correctas para eventos que cruzan medianoche
                        const calcularFechas = () => {
                          const fechaBase = multiReservaForm.fecha;
                          const horaInicio = multiReservaForm.inicioHora;
                          const horaFin = multiReservaForm.finHora;
                          
                          // Convertir horas a minutos para comparar
                          const [inicioH, inicioM] = horaInicio.split(':').map(Number);
                          const [finH, finM] = horaFin.split(':').map(Number);
                          const inicioMinutos = inicioH * 60 + inicioM;
                          const finMinutos = finH * 60 + finM;
                          
                          let fechaInicio = fechaBase;
                          let fechaFin = fechaBase;
                          
                          // Si hora fin < hora inicio, el evento cruza medianoche
                          if (finMinutos < inicioMinutos) {
                            // Sumar un día a la fecha de fin
                            const fechaFinObj = new Date(fechaBase + 'T00:00:00');
                            fechaFinObj.setDate(fechaFinObj.getDate() + 1);
                            fechaFin = fechaFinObj.toISOString().split('T')[0];
                          }
                          
                          return { fechaInicio, fechaFin };
                        };
                        
                        const { fechaInicio, fechaFin } = calcularFechas();
                        
                        // 🔧 Verificar si este concepto puede usar el venue seleccionado
                        let venueIdParaEsteConcepto = multiReservaForm.venueId;
                        if (concepto) {
                          const servicio = services.find(s => s.id === concepto.servicioId);
                          if (servicio) {
                            // Verificar si el venue está disponible para este servicio
                            let tieneVenueDisponible = false;
                            
                            // Verificar en espacios disponibles del servicio
                            if ((servicio as any).espaciosDisponibles && (servicio as any).espaciosDisponibles.length > 0) {
                              tieneVenueDisponible = (servicio as any).espaciosDisponibles.some((esp: any) => esp.id === multiReservaForm.venueId);
                            }
                            // Verificar en espacios antiguos
                            else if ((servicio as any).espacios && (servicio as any).espacios.length > 0) {
                              tieneVenueDisponible = (servicio as any).espacios.some((_: string, index: number) => 
                                `${servicio.id}-espacio-${index}` === multiReservaForm.venueId
                              );
                            }
                            // Si no tiene espacios configurados, puede usar venues globales
                            else {
                              tieneVenueDisponible = venues.some(v => v.id === multiReservaForm.venueId);
                            }
                            
                            // Si no tiene el venue disponible, no asignar venueId (dejará que se auto-seleccione)
                            if (!tieneVenueDisponible) {
                              console.warn(`⚠️ Servicio ${servicio.nombre} no tiene disponible el venue ${multiReservaForm.venueId}`);
                              venueIdParaEsteConcepto = ''; // Dejar vacío para que se auto-seleccione
                            }
                          }
                        }
                        
                        const datosReserva = {
                          reservaVenueId: venueIdParaEsteConcepto,
                          reservaFecha: fechaInicio,
                          reservaHoraInicio: multiReservaForm.inicioHora,
                          reservaHoraFin: multiReservaForm.finHora,
                          // Fechas completas para eventos que cruzan medianoche
                          reservaFechaInicio: fechaInicio,
                          reservaFechaFin: fechaFin,
                          reservaObservaciones: multiReservaForm.observaciones,
                          requiereApa: multiReservaForm.requiereApa,
                          // Datos del socio
                          reservaCedula: multiReservaForm.cedula,
                          reservaTelefono: multiReservaForm.telefono,
                          reservaRuc: multiReservaForm.ruc,
                          // Datos de tercero
                          reservaEsParaTercero: multiReservaForm.esParaTercero,
                          reservaTerceroNombre: multiReservaForm.terceroNombre,
                          reservaTerceroCedula: multiReservaForm.terceroCedula,
                          reservaTerceroTelefono: multiReservaForm.terceroTelefono,
                          reservaTerceroRuc: multiReservaForm.terceroRuc,
                          // Datos del evento
                          reservaAcontecimiento: multiReservaForm.acontecimiento,
                          reservaQuinceaneraFocusNombre: multiReservaForm.quinceaneraFocusNombre,
                          reservaNoviosNombres: multiReservaForm.noviosNombres,
                          reservaCumpleaneroNombre: multiReservaForm.cumpleaneroNombre,
                          reservaOtrosDescripcion: multiReservaForm.otrosDescripcion,
                          reservaOtrosNombrePersona: multiReservaForm.otrosNombrePersona,
                          reservaCantidadPersonas: multiReservaForm.cantidadPersonas,
                          reservaObservacionesGenerales: multiReservaForm.observacionesGenerales,
                          // ⭐ Configuraciones de hora extra 
                          reservaHoraExtra: multiReservaForm.horaExtra,
                          reservaCantidadHorasExtra: multiReservaForm.cantidadHorasExtra,
                          reservaMontoHorasExtra: multiReservaForm.montoHorasExtra,
                          // ⭐ Marca para distinguir entre configuración global vs individual
                          reservaConfiguracionIndividual: multiReservaForm.configuracionIndividual
                        };
                        
                        // ⭐ Agregar configuraciones individuales si existen
                        const configIndividual = multiReservaForm.configuracionesIndividuales[conceptoId];
                        if (configIndividual) {
                          // Horarios individuales con recálculo de fechas si es necesario
                          if (configIndividual.inicioHora) {
                            datosReserva.reservaHoraInicio = configIndividual.inicioHora;
                          }
                          if (configIndividual.finHora) {
                            datosReserva.reservaHoraFin = configIndividual.finHora;
                            
                            // Recalcular fechas para esta configuración individual
                            const horaInicio = configIndividual.inicioHora || multiReservaForm.inicioHora;
                            const horaFin = configIndividual.finHora;
                            
                            const [inicioH, inicioM] = horaInicio.split(':').map(Number);
                            const [finH, finM] = horaFin.split(':').map(Number);
                            const inicioMinutos = inicioH * 60 + inicioM;
                            const finMinutos = finH * 60 + finM;
                            
                            if (finMinutos < inicioMinutos) {
                              // Este concepto individual cruza medianoche
                              const fechaFinObj = new Date(fechaInicio + 'T00:00:00');
                              fechaFinObj.setDate(fechaFinObj.getDate() + 1);
                              const fechaFinIndividual = fechaFinObj.toISOString().split('T')[0];
                              datosReserva.reservaFechaFin = fechaFinIndividual;
                            } else {
                              datosReserva.reservaFechaFin = fechaFin;
                            }
                          }
                          // Horas extra individuales
                          datosReserva.reservaHoraExtra = configIndividual.horaExtra || datosReserva.reservaHoraExtra;
                          datosReserva.reservaCantidadHorasExtra = configIndividual.cantidadHorasExtra || datosReserva.reservaCantidadHorasExtra;
                          datosReserva.reservaMontoHorasExtra = configIndividual.montoHorasExtra || datosReserva.reservaMontoHorasExtra;
                        }
                        
                        if (concepto) {
                          console.log(`💾 Guardando reserva múltiple para concepto ${concepto.condicion} ${conceptoId}:`, datosReserva);
                          nuevoEstado.conceptos = nuevoEstado.conceptos?.map(c => 
                            c.id === conceptoId ? { ...c, ...datosReserva } : c
                          );
                        }
                      });
                      
                      return nuevoEstado;
                    });
                    
                    // ⚡ GESTIÓN DE TRANSICIONES DE HORAS EXTRA
                    // Identificar si estamos cambiando de configuración individual a global o viceversa
                    const conceptosSeleccionados = getAllConceptos()
                      .filter(c => selectedConceptsForReserva.includes(c.id));
                    const conceptosConReservaExistente = getConceptosWithReservaExistente(conceptosSeleccionados);
                    const configActualIndividual = multiReservaForm.configuracionIndividual;
                    
                    // Detectar si ya existen conceptos de hora extra para determinar la configuración previa
                    const todosLosConceptos = getAllConceptos();
                    const conceptosHoraExtraExistentes = todosLosConceptos.filter(c => 
                      c.concepto.toLowerCase().includes('hora extra')
                    );
                    
                    // Determinar configuración previa basada en los conceptos existentes
                    let configPreviaIndividual = false;
                    if (conceptosHoraExtraExistentes.length > 0) {
                      // Si hay múltiples conceptos de hora extra con relatedConceptoId, era individual
                      // Si hay un concepto sin relatedConceptoId específico, era global
                      const conceptosIndividuales = conceptosHoraExtraExistentes.filter(c => 
                        (c as any).relatedConceptoId && selectedConceptsForReserva.includes((c as any).relatedConceptoId)
                      );
                      configPreviaIndividual = conceptosIndividuales.length > 0;
                    }
                    
                    console.log('⚡ Analizando transición de horas extra:', {
                      configPreviaIndividual,
                      configActualIndividual,
                      conceptosHoraExtraExistentes: conceptosHoraExtraExistentes.length,
                      cambioDeConfiguracion: configPreviaIndividual !== configActualIndividual
                    });
                    
                    // Si hay cambio de configuración O ya existen conceptos de hora extra, limpiar todo
                    if ((configPreviaIndividual !== configActualIndividual && conceptosHoraExtraExistentes.length > 0) || 
                        (conceptosHoraExtraExistentes.length > 0 && (configActualIndividual || (!configActualIndividual && multiReservaForm.horaExtra)))) {
                      console.log('🔄 Limpiando TODOS los conceptos de horas extra anteriores...');
                      
                      // Eliminar TODOS los conceptos de hora extra existentes
                      setUnifiedForm(prev => {
                        const conceptosOriginales = prev.conceptos.length;
                        const conceptosLimpios = prev.conceptos.filter(c => {
                          const isHoraExtra = c.concepto.toLowerCase().includes('hora extra');
                          if (isHoraExtra) {
                            console.log(`🗑️ Eliminando hora extra ${c.condicion}: ${c.concepto}`);
                          }
                          return !isHoraExtra;
                        });
                        console.log(`📊 Conceptos: ${conceptosOriginales} → ${conceptosLimpios.length}`);
                        
                        return { ...prev, conceptos: conceptosLimpios };
                      });
                    }
                    
                    // 🕐 CREAR CONCEPTOS DE HORA EXTRA
                    console.log('🕐 Creando conceptos de hora extra:', {
                      configuracionIndividual: multiReservaForm.configuracionIndividual,
                      horaExtraGlobal: multiReservaForm.horaExtra,
                      selectedConceptsCount: selectedConceptsForReserva.length
                    });
                    
                    if (multiReservaForm.configuracionIndividual) {
                      console.log('👥 MODO INDIVIDUAL: Creando conceptos individuales por servicio');
                      // 1️⃣ CONFIGURACIÓN INDIVIDUAL por servicio
                      selectedConceptsForReserva.forEach(conceptoId => {
                        const config = multiReservaForm.configuracionesIndividuales[conceptoId];
                        if (config && config.horaExtra && config.cantidadHorasExtra && config.montoHorasExtra) {
                          try {
                            const cantidadHoras = parseFloat(config.cantidadHorasExtra);
                            const montoServicio = parseFloat(getNumericValueSafe(config.montoHorasExtra));
                            
                            if (cantidadHoras > 0 && montoServicio > 0) {
                              // Buscar el servicio para obtener su nombre
                              const concepto = getAllConceptos()
                                .find(c => c.id === conceptoId);
                              const servicio = services.find(s => s.id === concepto?.servicioId);
                              
                              const fechaFormateada = new Date(multiReservaForm.fecha + 'T12:00:00').toLocaleDateString('es-PY');
                              const observacionesExtra = `Hora extra para ${servicio?.nombre || 'Servicio'} - ${venueName} - ${fechaFormateada}`;
                              console.log(`➕ Creando concepto INDIVIDUAL para ${servicio?.nombre}: ${cantidadHoras}h x ${montoServicio}`);
                              const conceptoCreado = addHoraExtraConcepto(cantidadHoras, montoServicio, observacionesExtra, conceptoId);
                              
                              if (conceptoCreado !== null) {
                                totalHorasExtraCreadas++;
                                montoTotalHorasExtra += montoServicio;
                                console.log(`✅ Concepto INDIVIDUAL creado: ID ${conceptoCreado}`);
                              }
                            }
                          } catch (error) {
                            console.error('Error creating hora extra concepto for', conceptoId, error);
                          }
                        }
                      });
                    } else if (multiReservaForm.horaExtra && multiReservaForm.cantidadHorasExtra && multiReservaForm.montoHorasExtra) {
                      console.log('🌍 MODO GLOBAL: Creando UN concepto global para todas las reservas');
                      // 2️⃣ CONFIGURACIÓN GLOBAL para todas las reservas
                      try {
                        const cantidadHoras = parseFloat(multiReservaForm.cantidadHorasExtra);
                        const montoServicio = parseFloat(getNumericValueSafe(multiReservaForm.montoHorasExtra));
                        
                        if (cantidadHoras > 0 && montoServicio > 0) {
                          const fechaFormateada = new Date(multiReservaForm.fecha + 'T12:00:00').toLocaleDateString('es-PY');
                          const observacionesExtra = `Hora extra global - ${venueName} - ${fechaFormateada}`;
                          console.log(`➕ Creando concepto GLOBAL: ${cantidadHoras}h x ${montoServicio}`);
                          const conceptoCreado = addHoraExtraConcepto(cantidadHoras, montoServicio, observacionesExtra);
                          
                          if (conceptoCreado !== null) {
                            totalHorasExtraCreadas++;
                            console.log(`✅ Concepto GLOBAL creado: ID ${conceptoCreado}`);
                            montoTotalHorasExtra += montoServicio;
                          }
                        }
                      } catch (error) {
                        console.error('Error creating global hora extra concepto:', error);
                      }
                    }
                    
                    
                    setShowMultiReservaModal(false);
                    
                    // Generar información detallada de los espacios asignados
                    let espaciosInfo = '';
                    selectedConceptsForReserva.forEach(conceptoId => {
                      const concepto = getAllConceptos()
                        .find(c => c.id === conceptoId);
                      const servicio = services.find(s => s.id === concepto?.servicioId);
                      
                      // Obtener el espacio asignado de la misma manera que en la tabla
                      let espacioSeleccionado = null;
                      
                      // Buscar desde las configuraciones del modal de cobranza (misma lógica que en la tabla)
                      if ((concepto as any)?.reservaVenueId) {
                        if ((servicio as any)?.espaciosDisponibles) {
                          espacioSeleccionado = (servicio as any).espaciosDisponibles.find(
                            (esp: any) => esp.id === (concepto as any).reservaVenueId
                          );
                        }
                        if (!espacioSeleccionado) {
                          espacioSeleccionado = venues.find(v => v.id === (concepto as any).reservaVenueId);
                        }
                      }
                      
                      // Fallback a auto-selección
                      if (!espacioSeleccionado && (servicio as any)?.espaciosDisponibles?.length > 0) {
                        espacioSeleccionado = (servicio as any).espaciosDisponibles[0];
                      }
                      
                      const nombreEspacio = espacioSeleccionado?.nombre || 'Espacio por asignar';
                      espaciosInfo += `📍 ${servicio?.nombre || 'Servicio'}: ${nombreEspacio}\n`;
                    });
                    
                    // Mensaje de confirmación con información de horas extra
                    // Formatear fecha correctamente evitando problemas de zona horaria
                    const fechaFormateada = new Date(multiReservaForm.fecha + 'T12:00:00').toLocaleDateString('es-PY');
                    let successMessage = `✅ Reserva múltiple configurada exitosamente!\n\n${espaciosInfo}📅 ${fechaFormateada}\n🕐 ${multiReservaForm.inicioHora} - ${multiReservaForm.finHora}\n🎯 ${selectedConceptsForReserva.length} espacios configurados`;
                    
                    if (totalHorasExtraCreadas > 0) {
                      successMessage += `\n\n🕐 ¡${totalHorasExtraCreadas} concepto(s) de Hora Extra agregados automáticamente!\n💰 Monto total horas extra: ${formatNumberWithSeparator(montoTotalHorasExtra.toString())} Gs.`;
                    }
                    
                    alert(successMessage);
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  💾 Guardar reserva
                </button>
                <button
                  onClick={() => setShowMultiReservaModal(false)}
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
