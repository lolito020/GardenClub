// Utilidades para el manejo de servicios, precios y fechas del nuevo sistema
import { Service, Member, ServiceType, PaymentItem } from './types';
import { getCurrentLocalDate, formatLocalDate } from './timezone-config';

/**
 * Verifica si un servicio está disponible para un tipo de miembro específico
 * Considera los campos: socios, noSocios y agendamiento
 */
export function esServicioDisponiblePara(
  service: Service,
  member?: Member | null,
  isNoSocio: boolean = false
): boolean {
  // Si no hay contexto de miembro, mostrar todos los servicios
  if (!member && !isNoSocio) {
    return true;
  }

  const esSocio = !isNoSocio && member?.subcategoria !== 'NO SOCIO';
  const esNoSocio = isNoSocio || member?.subcategoria === 'NO SOCIO';

  // REGLA ESPECIAL: Si el servicio tiene agendamiento activo
  if (service.agendamiento === true) {
    // Para socios: SIEMPRE está disponible (ignora el campo "socios")
    if (esSocio) {
      return true;
    }
    // Para no socios: solo si noSocios === true
    if (esNoSocio) {
      return service.noSocios === true;
    }
  }

  // REGLA ESTÁNDAR: Sin agendamiento, validar normalmente
  if (esSocio) {
    return service.socios === true;
  }

  if (esNoSocio) {
    return service.noSocios === true;
  }

  return false;
}

/**
 * Obtiene el precio correcto según el tipo de miembro (socio/no socio)
 */
export function getPrecioSegunTipoMiembro(
  service: Service, 
  member?: Member | null, 
  isNoSocio: boolean = false
): number {
  // Si es explícitamente no socio o el miembro tiene subcategoría NO SOCIO
  if (isNoSocio || member?.subcategoria === 'NO SOCIO') {
    // Verificar si el servicio está disponible para no socios
    if (!service.noSocios && !service.agendamiento) {
      throw new Error(`El servicio "${service.nombre}" no está disponible para no socios`);
    }
    
    // Usar precio específico para no socios, o precio base si no existe
    return service.precioNoSocio ?? service.precio;
  }
  
  // Para socios regulares
  if (member && member.subcategoria !== 'NO SOCIO') {
    // Verificar si el servicio está disponible para socios (agendamiento siempre permite socios)
    if (!service.socios && !service.agendamiento) {
      throw new Error(`El servicio "${service.nombre}" no está disponible para socios`);
    }
    
    // Usar precio específico para socios, o precio base si no existe
    return service.precioSocio ?? service.precio;
  }
  
  // Por defecto, usar precio base
  return service.precio;
}

/**
 * Calcula la fecha de vencimiento según el tipo de servicio y días
 */
export function calcularVencimiento(
  fechaBase: Date,
  tipoServicio: ServiceType,
  dias?: number
): Date {
  const vencimiento = new Date(fechaBase);
  
  switch (tipoServicio) {
    case 'MENSUAL':
      vencimiento.setDate(vencimiento.getDate() + 30);
      break;
    case 'ANUAL':
      vencimiento.setDate(vencimiento.getDate() + 365);
      break;
    case 'DIARIO':
      const diasAPagar = dias || 1;
      vencimiento.setDate(vencimiento.getDate() + diasAPagar);
      break;
    case 'UNICO':
      // Para únicos, el vencimiento puede ser el mismo día
      // No modificamos la fecha
      break;
    default:
      throw new Error(`Tipo de servicio no válido: ${tipoServicio}`);
  }
  
  return vencimiento;
}

/**
 * Calcula los días entre dos fechas (usado para tipo DIARIO)
 */
export function calcularDiasEntreFechas(fechaInicio: Date, fechaFin: Date): number {
  const diffTime = fechaFin.getTime() - fechaInicio.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays); // Mínimo 1 día
}

/**
 * Valida un ítem de pago antes de procesarlo
 */
export function validarPaymentItem(item: PaymentItem, service: Service): string[] {
  const errores: string[] = [];
  
  // Validar tipo de servicio
  if (!['MENSUAL', 'ANUAL', 'UNICO', 'DIARIO'].includes(item.tipo)) {
    errores.push(`Tipo de servicio no válido: ${item.tipo}`);
  }
  
  // Validar monto
  if (!item.monto || item.monto <= 0) {
    errores.push('El monto debe ser mayor a 0');
  }
  
  // Validar días para tipo DIARIO
  if (item.tipo === 'DIARIO') {
    if (!item.dias || item.dias < 1) {
      errores.push('Para tipo DIARIO se requiere al menos 1 día');
    }
  }
  
  // Validar fecha de vencimiento
  if (!item.vencimiento) {
    errores.push('La fecha de vencimiento es obligatoria');
  } else {
    const vencimiento = new Date(item.vencimiento);
    if (isNaN(vencimiento.getTime())) {
      errores.push('Fecha de vencimiento no válida');
    }
  }
  
  return errores;
}

/**
 * Convierte ServiceType a periodicidad de suscripción
 */
export function convertirTipoAPeriodicidad(tipo: ServiceType): 'MONTHLY' | 'ANNUAL' | 'DAILY' | null {
  switch (tipo) {
    case 'MENSUAL':
      return 'MONTHLY';
    case 'ANUAL':
      return 'ANNUAL';
    case 'DIARIO':
      return 'DAILY';
    case 'UNICO':
      return null; // Los únicos no generan suscripción
    default:
      return null;
  }
}

/**
 * Crea un PaymentItem por defecto al seleccionar un servicio
 */
export function crearPaymentItemDefault(
  service: Service, 
  member?: Member | null, 
  isNoSocio: boolean = false
): PaymentItem {
  const fechaActual = getCurrentLocalDate();
  const tipoDefault = service.tipo || 'UNICO';
  const diasDefault = tipoDefault === 'DIARIO' ? 1 : undefined;
  
  // Calcular precio según tipo de miembro
  const precioCalculado = getPrecioSegunTipoMiembro(service, member, isNoSocio);
  
  // Calcular vencimiento
  const vencimiento = calcularVencimiento(fechaActual, tipoDefault, diasDefault);
  
  return {
    serviceId: service.id,
    serviceName: service.nombre,
    tipo: tipoDefault,
    monto: precioCalculado,
    vencimiento: vencimiento.toISOString().split('T')[0], // Formato YYYY-MM-DD
    dias: diasDefault
  };
}

/**
 * Formatea una fecha para mostrar en la UI
 */
export function formatearFecha(fecha: string | Date): string {
  return formatLocalDate(fecha, false);
}

/**
 * Convierte fecha de formato DD/MM/YYYY a ISO string
 */
export function convertirFechaAISO(fechaStr: string): string {
  const [dia, mes, año] = fechaStr.split('/');
  return new Date(parseInt(año), parseInt(mes) - 1, parseInt(dia)).toISOString().split('T')[0];
}

/**
 * Genera código único para miembro no socio
 */
export function generarCodigoNoSocio(): string {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `NS${timestamp}${random}`;
}