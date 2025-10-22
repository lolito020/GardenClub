import { getLocalDateString, getCurrentLocalDate } from './timezone-config';

export interface ConceptoItem {
  id: string;
  servicioId: string;
  concepto: string;
  tipoServicio: 'MENSUAL' | 'ANUAL' | 'UNICO' | 'DIARIO';
  monto: string;
  dias?: number;
  vencimiento?: string;
  observaciones?: string;
  crearSuscripcion?: boolean;
  vencimientoManual?: boolean; // Flag para indicar si el vencimiento fue editado manualmente
  // Campos para reservas/agendamiento
  requiereReserva?: boolean;
  reservaVenueId?: string;
  reservaFecha?: string;
  reservaHoraInicio?: string;
  reservaHoraFin?: string;
  reservaObservaciones?: string;
  // Relación con otros conceptos (para hora extra)
  relatedToReservaConceptId?: string; // ID del concepto principal de reserva
  // Condición de pago para sistema unificado
  condicion?: 'CONTADO' | 'CREDITO';
}

export function cryptoRandom() {
  try { return String(Math.random().toString(36).slice(2, 9)); } catch { return Date.now().toString(36); }
}

export function createEmptyConcepto(condicion?: 'CONTADO' | 'CREDITO'): ConceptoItem {
  const today = getLocalDateString();
  const venc = getCurrentLocalDate(); 
  venc.setUTCDate(venc.getUTCDate() + 30);
  return {
    id: cryptoRandom(),
    servicioId: '',
    concepto: '',
    tipoServicio: 'MENSUAL',
    monto: '',
    dias: 1,
    vencimiento: venc.toISOString().slice(0, 10),
    observaciones: '',
    crearSuscripcion: false,
    vencimientoManual: false, // Por defecto, el vencimiento es automático
    condicion: condicion || 'CONTADO', // Por defecto CONTADO para compatibilidad
  };
}

export function getNumericValueSafe(v?: string | null) {
  if (!v) return '0';
  return String(v).replace(/\./g, '').replace(/,/g, '.');
}

export function calculateTotal(conceptos?: ConceptoItem[] | null): number {
  if (!conceptos || conceptos.length === 0) return 0;
  return conceptos.reduce((acc, c) => acc + (Number(getNumericValueSafe(c.monto)) || 0), 0);
}

export function hasDuplicateService(conceptos?: ConceptoItem[] | null): boolean {
  if (!conceptos) return false;
  const seen = new Set<string>();
  for (const c of conceptos) {
    if (!c.servicioId) continue;
    // Permitir duplicados si el concepto tiene reserva marcada
    if (c.requiereReserva) continue;
    if (seen.has(c.servicioId)) return true;
    seen.add(c.servicioId);
  }
  return false;
}

export function isServiceDuplicate(conceptos?: ConceptoItem[] | null, servicioId?: string, services?: any[]): boolean {
  if (!conceptos || !servicioId) return false;
  
  // ⚠️ Permitir múltiples conceptos de "Horas Extras"
  if (servicioId === 'HORAS_EXTRAS_TEMP') return false;
  
  // 🎯 Si el servicio tiene múltiples espacios disponibles, permitir duplicación
  if (services) {
    const servicio = services.find(s => s.id === servicioId);
    if (servicio) {
      // Contar espacios disponibles
      let cantidadEspacios = 0;
      
      // Nueva estructura: array de objetos Venue
      if (servicio.espaciosDisponibles && Array.isArray(servicio.espaciosDisponibles)) {
        cantidadEspacios = servicio.espaciosDisponibles.length;
      }
      // Estructura antigua: array de strings
      else if (servicio.espacios && Array.isArray(servicio.espacios)) {
        cantidadEspacios = servicio.espacios.length;
      }
      
      // Si tiene más de un espacio disponible, permitir hasta esa cantidad de conceptos
      if (cantidadEspacios > 1) {
        const count = conceptos.reduce((acc, c) => acc + (c.servicioId === servicioId ? 1 : 0), 0);
        return count >= cantidadEspacios; // Solo duplicado si ya alcanzó el máximo de espacios
      }
    }
  }
  
  const count = conceptos.reduce((acc, c) => acc + (c.servicioId === servicioId ? 1 : 0), 0);
  return count > 1;
}

export type ConceptValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * Calcula automáticamente el vencimiento basado en fecha base y tipo de servicio
 */
export function calcularVencimientoAutomatico(
  fechaBase: string, 
  tipoServicio: 'MENSUAL' | 'ANUAL' | 'UNICO' | 'DIARIO', 
  dias?: number
): string {
  if (!fechaBase) return getLocalDateString();
  
  const fecha = new Date(fechaBase);
  
  switch (tipoServicio) {
    case 'MENSUAL':
      // Sumar 1 mes exacto, manteniendo el día
      const originalDay = fecha.getDate();
      fecha.setMonth(fecha.getMonth() + 1);
      // Si el mes siguiente no tiene ese día, setMonth ajusta al último día del mes
      // Esto es el comportamiento esperado en pagos mensuales
      break;
    case 'ANUAL':
      fecha.setFullYear(fecha.getFullYear() + 1);
      break;
    case 'DIARIO':
      const diasAPagar = dias || 1;
      fecha.setDate(fecha.getDate() + diasAPagar);
      break;
    case 'UNICO':
      // Para servicios únicos, el vencimiento es el mismo día
      return fechaBase;
    default:
      fecha.setMonth(fecha.getMonth() + 1); // Default mensual
      break;
  }
  
  return fecha.toISOString().slice(0, 10);
}

/**
 * Actualiza el vencimiento de un concepto si no fue editado manualmente
 */
export function actualizarVencimientoSiEsAutomatico(
  concepto: ConceptoItem, 
  fechaBase: string, 
  nuevoTipo?: 'MENSUAL' | 'ANUAL' | 'UNICO' | 'DIARIO'
): ConceptoItem {
  // Si el vencimiento fue editado manualmente, no lo recalculamos
  if (concepto.vencimientoManual) {
    // Pero si cambió el tipo de servicio, sí lo recalculamos
    if (nuevoTipo && nuevoTipo !== concepto.tipoServicio) {
      const nuevoVencimiento = calcularVencimientoAutomatico(fechaBase, nuevoTipo, concepto.dias);
      return {
        ...concepto,
        tipoServicio: nuevoTipo,
        vencimiento: nuevoVencimiento,
        vencimientoManual: false // Reset manual flag cuando cambia el tipo
      };
    }
    return concepto;
  }
  
  // Calcular vencimiento automático
  const tipo = nuevoTipo || concepto.tipoServicio;
  const nuevoVencimiento = calcularVencimientoAutomatico(fechaBase, tipo, concepto.dias);
  
  return {
    ...concepto,
    ...(nuevoTipo && { tipoServicio: nuevoTipo }),
    vencimiento: nuevoVencimiento
  };
}

/**
 * Marca un concepto como editado manualmente
 */
export function marcarVencimientoComoManual(concepto: ConceptoItem, nuevoVencimiento: string): ConceptoItem {
  return {
    ...concepto,
    vencimiento: nuevoVencimiento,
    vencimientoManual: true
  };
}

export function areConceptsValid(conceptos?: ConceptoItem[] | null): ConceptValidationResult {
  const res: ConceptValidationResult = { valid: true, errors: [] };
  if (!conceptos || conceptos.length === 0) {
    res.valid = false;
    res.errors.push('No hay conceptos');
    return res;
  }

  // verificar cada concepto
  for (const c of conceptos) {
    if (!c.servicioId) {
      res.valid = false;
      res.errors.push('Servicio requerido');
    }
    const m = Number(getNumericValueSafe(c.monto));
    if (isNaN(m) || m <= 0) {
      res.valid = false;
      res.errors.push('Monto inválido');
    }
    if (c.tipoServicio === 'DIARIO' && (!c.dias || c.dias <= 0)) {
      res.valid = false;
      res.errors.push('Días inválidos para DIARIO');
    }
  }

  if (hasDuplicateService(conceptos)) {
    res.valid = false;
    res.errors.push('Servicios duplicados');
  }

  return res;
}
