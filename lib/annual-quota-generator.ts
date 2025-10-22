/**
 * Generador de Cuotas Sociales Anuales
 * 
 * Este módulo maneja la lógica de generación automática de débitos
 * de cuota social mensual para un período anual completo.
 */

import { getCurrentLocalDate, getLocalDateString } from './timezone-config';

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

// ID del servicio de Cuota Social Mensual
export const SOCIAL_QUOTA_SERVICE_ID = 's1';

export interface MonthlyQuotaDebit {
  memberId: string;
  fecha: string;
  concepto: string;
  tipo: 'DEBIT';
  monto: number;
  origen: 'SERVICIO';
  refId: string;
  serviceId: string;
  tipoServicio: 'MENSUAL';
  observaciones: string;
  vencimiento: string;
  metadata: {
    generationType: 'ANNUAL_BATCH';
    batchYear: number;
    batchId: string;
    monthNumber: number;
    monthCode: string;
  };
}

export interface ExistingMonthDebit {
  month: number; // 1-12
  monthCode: string; // "2025-01"
  monthText: string; // "enero 2025"
  debitId: string;
  status: 'PENDIENTE' | 'PARCIAL' | 'CANCELADO' | 'REFINANCIADO';
  monto: number;
  paidAmount: number;
  vencimiento: string;
  createdAt: string;
}

export interface AnnualQuotaAnalysis {
  year: number;
  memberId: string;
  memberCode: string;
  memberName: string;
  subcategoria: string;
  fechaAlta: string;
  
  // Análisis de meses
  existingDebits: ExistingMonthDebit[];
  missingMonths: number[]; // [3, 4, 5, ...] meses sin débito
  canGenerate: boolean;
  canRevert: boolean;
  
  // Estimaciones
  monthsToGenerate: number;
  totalAmountToGenerate: number;
  revertableDebits: string[]; // IDs de débitos que se pueden revertir
  
  // Mensajes
  warnings: string[];
  errors: string[];
}

/**
 * Capitaliza la primera letra de un string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Obtiene el nombre del mes en español
 */
export function getMonthName(monthNumber: number): string {
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Mes inválido: ${monthNumber}`);
  }
  return MONTHS_ES[monthNumber - 1];
}

/**
 * Obtiene el código del mes (YYYY-MM)
 */
export function getMonthCode(year: number, month: number): string {
  return `${year}-${month.toString().padStart(2, '0')}`;
}

/**
 * Obtiene el último día del mes
 */
export function getLastDayOfMonth(year: number, month: number): string {
  const date = new Date(year, month, 0); // day 0 = último día del mes anterior
  return `${year}-${month.toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

/**
 * Extrae el mes de un débito usando múltiples estrategias
 */
export function extractMonthFromDebit(debit: any): string | null {
  // Prioridad 1: Metadata (si fue generado automáticamente)
  if (debit.metadata?.monthCode) {
    return debit.metadata.monthCode;
  }
  
  // Prioridad 2: Observaciones
  if (debit.observaciones) {
    const obsMatch = debit.observaciones.match(
      /mes de (\w+)\s+(\d{4})|(\w+)\s+(\d{4})/i
    );
    if (obsMatch) {
      const monthName = (obsMatch[1] || obsMatch[3]).toLowerCase();
      const year = obsMatch[2] || obsMatch[4];
      const monthIndex = MONTHS_ES.indexOf(monthName);
      if (monthIndex !== -1) {
        return `${year}-${(monthIndex + 1).toString().padStart(2, '0')}`;
      }
    }
  }
  
  // Prioridad 3: Concepto
  if (debit.concepto) {
    const conceptMatch = debit.concepto.match(
      /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{4})/i
    );
    if (conceptMatch) {
      const monthName = conceptMatch[1].toLowerCase();
      const year = conceptMatch[2];
      const monthIndex = MONTHS_ES.indexOf(monthName);
      if (monthIndex !== -1) {
        return `${year}-${(monthIndex + 1).toString().padStart(2, '0')}`;
      }
    }
  }
  
  // Prioridad 4: Fecha de vencimiento (menos confiable)
  if (debit.vencimiento) {
    const dueDate = new Date(debit.vencimiento);
    const month = dueDate.getUTCMonth() + 1;
    const year = dueDate.getUTCFullYear();
    return `${year}-${month.toString().padStart(2, '0')}`;
  }
  
  return null;
}

/**
 * Verifica si un débito es de cuota social mensual
 */
export function isMonthlyQuotaDebit(debit: any): boolean {
  // Verificación 1: Por ID del servicio (más confiable)
  if (debit.refId === SOCIAL_QUOTA_SERVICE_ID || 
      debit.serviceId === SOCIAL_QUOTA_SERVICE_ID) {
    return true;
  }
  
  // Verificación 2: Por texto (fallback para débitos antiguos)
  const text = `${debit.concepto || ''} ${debit.observaciones || ''}`.toLowerCase();
  const isQuota = text.includes('cuota social') || text.includes('cuota mensual');
  const isMonthly = debit.tipoServicio === 'MENSUAL';
  
  return isQuota && isMonthly;
}

/**
 * Analiza los débitos de cuota social de un socio para un año específico
 */
export function analyzeAnnualQuotas(
  member: any,
  movements: any[],
  year: number,
  servicePrecio: number
): AnnualQuotaAnalysis {
  const analysis: AnnualQuotaAnalysis = {
    year,
    memberId: member.id,
    memberCode: member.codigo,
    memberName: `${member.nombres} ${member.apellidos}`,
    subcategoria: member.subcategoria,
    fechaAlta: member.alta,
    existingDebits: [],
    missingMonths: [],
    canGenerate: false,
    canRevert: false,
    monthsToGenerate: 0,
    totalAmountToGenerate: 0,
    revertableDebits: [],
    warnings: [],
    errors: []
  };

  // Validación 1: Subcategoría
  if (member.subcategoria === 'Socio Vitalicio') {
    analysis.errors.push('Los socios vitalicios no pagan cuota social mensual');
    return analysis;
  }

  if (!['Socio', 'Socio Patrimonial'].includes(member.subcategoria)) {
    analysis.errors.push(`La subcategoría "${member.subcategoria}" no aplica cuota social mensual`);
    return analysis;
  }

  // Validación 2: Fecha de alta
  const altaDate = new Date(member.alta);
  const altaYear = altaDate.getFullYear();
  const altaMonth = altaDate.getMonth() + 1;

  if (altaYear > year) {
    analysis.errors.push(`El socio ingresó en ${altaYear}, no puede generar cuotas para ${year}`);
    return analysis;
  }

  // Determinar mes de inicio (si ingresó durante el año solicitado)
  const startMonth = (altaYear === year) ? altaMonth : 1;

  // Filtrar débitos de cuota social del año especificado
  const quotaDebits = movements.filter(m => {
    if (m.tipo !== 'DEBIT') return false;
    if (!isMonthlyQuotaDebit(m)) return false;
    
    const monthCode = extractMonthFromDebit(m);
    if (!monthCode) return false;
    
    const [debitYear] = monthCode.split('-').map(Number);
    return debitYear === year;
  });

  // Mapear débitos existentes por mes
  const monthMap = new Map<number, any>();
  
  for (const debit of quotaDebits) {
    const monthCode = extractMonthFromDebit(debit);
    if (!monthCode) continue;
    
    const [, monthStr] = monthCode.split('-');
    const month = parseInt(monthStr, 10);
    
    // Si hay duplicados, mantener el más reciente
    if (!monthMap.has(month) || 
        new Date(debit.createdAt || debit.fecha) > new Date(monthMap.get(month)!.createdAt || monthMap.get(month)!.fecha)) {
      monthMap.set(month, debit);
    }
  }

  // Construir lista de débitos existentes
  for (const [month, debit] of monthMap.entries()) {
    analysis.existingDebits.push({
      month,
      monthCode: getMonthCode(year, month),
      monthText: `${getMonthName(month)} ${year}`,
      debitId: debit.id,
      status: debit.status || 'PENDIENTE',
      monto: debit.monto,
      paidAmount: debit.paidAmount || 0,
      vencimiento: debit.vencimiento,
      createdAt: debit.createdAt || debit.fecha
    });

    // Verificar si se puede revertir (solo PENDIENTE)
    if (debit.status === 'PENDIENTE' && (debit.paidAmount || 0) === 0) {
      analysis.revertableDebits.push(debit.id);
    }
  }

  // Determinar meses faltantes
  for (let month = startMonth; month <= 12; month++) {
    if (!monthMap.has(month)) {
      analysis.missingMonths.push(month);
    }
  }

  // Calcular totales
  analysis.monthsToGenerate = analysis.missingMonths.length;
  analysis.totalAmountToGenerate = analysis.monthsToGenerate * servicePrecio;
  analysis.canGenerate = analysis.monthsToGenerate > 0;
  analysis.canRevert = analysis.revertableDebits.length > 0;

  // Advertencias
  if (altaYear === year && altaMonth > 1) {
    analysis.warnings.push(
      `El socio ingresó en ${getMonthName(altaMonth)} ${year}, ` +
      `se generarán cuotas desde ${getMonthName(altaMonth)} hasta diciembre`
    );
  }

  if (analysis.monthsToGenerate === 0 && analysis.existingDebits.length === 12) {
    analysis.warnings.push(`Ya existen débitos para todos los meses de ${year}`);
  }

  if (monthMap.size > 12) {
    analysis.warnings.push('Se detectaron débitos duplicados para algunos meses');
  }

  return analysis;
}

/**
 * Genera los objetos de débito para los meses faltantes
 */
export function generateMonthlyQuotaDebits(
  analysis: AnnualQuotaAnalysis,
  servicePrecio: number
): MonthlyQuotaDebit[] {
  if (!analysis.canGenerate) {
    return [];
  }

  const batchId = `BATCH-${analysis.year}-${Date.now()}`;
  const currentDate = getLocalDateString();
  const debits: MonthlyQuotaDebit[] = [];

  for (const month of analysis.missingMonths) {
    const monthName = getMonthName(month);
    const monthCode = getMonthCode(analysis.year, month);
    const vencimiento = getLastDayOfMonth(analysis.year, month);
    const firstDayOfMonth = `${analysis.year}-${month.toString().padStart(2, '0')}-01`;

    debits.push({
      memberId: analysis.memberId,
      fecha: `${firstDayOfMonth}T12:00:00.000Z`,
      concepto: `Cuota Social Mensual - ${capitalize(monthName)} ${analysis.year}`,
      tipo: 'DEBIT',
      monto: servicePrecio,
      origen: 'SERVICIO',
      refId: SOCIAL_QUOTA_SERVICE_ID,
      serviceId: SOCIAL_QUOTA_SERVICE_ID,
      tipoServicio: 'MENSUAL',
      observaciones: `Mes de ${monthName} ${analysis.year}`,
      vencimiento: `${vencimiento}T12:00:00.000Z`,
      metadata: {
        generationType: 'ANNUAL_BATCH',
        batchYear: analysis.year,
        batchId,
        monthNumber: month,
        monthCode
      }
    });
  }

  return debits;
}

/**
 * Valida que un miembro pueda recibir cuotas anuales
 */
export function validateMemberForAnnualQuotas(member: any): {
  valid: boolean;
  error?: string;
} {
  if (!member) {
    return { valid: false, error: 'Socio no encontrado' };
  }

  if (member.subcategoria === 'Socio Vitalicio') {
    return { valid: false, error: 'Los socios vitalicios están exentos de cuota social' };
  }

  if (!['Socio', 'Socio Patrimonial'].includes(member.subcategoria)) {
    return { valid: false, error: 'Solo aplica para socios y socios patrimoniales' };
  }

  return { valid: true };
}
