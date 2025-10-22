// Utilidades para el manejo automático de cuotas sociales
import { getCurrentLocalDate } from './timezone-config';

export interface SocialQuotaStatus {
  lastPaidMonth: string | null; // "2024-08" formato
  lastPaidMonthText: string | null; // "agosto 2024" formato
  currentStatus: 'up-to-date' | 'behind' | 'unknown';
  monthsBehind: number;
  suggestedPaymentMonth: string; // "septiembre 2024" formato
  suggestedPaymentMonthCode: string; // "2024-09" formato
}

export interface Movement {
  id: string;
  fecha: string;
  concepto: string;
  observaciones?: string;
  monto: number;
  tipo: 'debito' | 'credito';
  socio_id: string;
}

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/**
 * Convierte un código de mes (2024-08) a texto en español (agosto 2024)
 */
export function monthCodeToText(monthCode: string): string {
  const [year, month] = monthCode.split('-');
  const monthIndex = parseInt(month, 10) - 1;
  
  if (monthIndex < 0 || monthIndex > 11) {
    return monthCode; // fallback
  }
  
  return `${MONTHS_ES[monthIndex]} ${year}`;
}

/**
 * Convierte texto de mes en español a código (agosto 2024 -> 2024-08)
 */
export function monthTextToCode(monthText: string): string | null {
  const regex = /(\w+)\s+(\d{4})/;
  const match = monthText.toLowerCase().match(regex);
  
  if (!match) return null;
  
  const [, monthName, year] = match;
  const monthIndex = MONTHS_ES.findIndex(m => m === monthName);
  
  if (monthIndex === -1) return null;
  
  const monthNumber = (monthIndex + 1).toString().padStart(2, '0');
  return `${year}-${monthNumber}`;
}

/**
 * Extrae el mes de pago de las observaciones de un movimiento de cuota social
 */
export function extractPaymentMonthFromObservation(observation: string): string | null {
  // Patrones comunes:
  // "Pago de cuota social mes de agosto 2024"
  // "Cuota social agosto 2024" 
  // "Pago cuota social - agosto 2024"
  
  const patterns = [
    /mes de (\w+)\s+(\d{4})/i,
    /cuota social\s+(\w+)\s+(\d{4})/i,
    /cuota social\s*-\s*(\w+)\s+(\d{4})/i,
    /(\w+)\s+(\d{4})\s*-?\s*cuota/i
  ];
  
  for (const pattern of patterns) {
    const match = observation.match(pattern);
    if (match) {
      const monthName = match[1].toLowerCase();
      const year = match[2];
      
      const monthIndex = MONTHS_ES.findIndex(m => m === monthName);
      if (monthIndex !== -1) {
        const monthNumber = (monthIndex + 1).toString().padStart(2, '0');
        return `${year}-${monthNumber}`;
      }
    }
  }
  
  return null;
}

/**
 * Analiza los movimientos de un socio para determinar su estado de cuota social
 */
export function analyzeSocialQuotaStatus(movements: Movement[]): SocialQuotaStatus {
  // Filtrar solo movimientos de cuota social (créditos que indican pagos)
  const socialQuotaPayments = movements.filter(movement => {
    if (movement.tipo !== 'credito') return false;
    
    // Buscar indicadores de cuota social en concepto u observaciones
    const text = `${movement.concepto} ${movement.observaciones || ''}`.toLowerCase();
    return text.includes('cuota social') || text.includes('cuota mensual');
  });
  
  // Extraer meses pagados de las observaciones
  const paidMonths: { monthCode: string; date: string }[] = [];
  
  for (const payment of socialQuotaPayments) {
    if (payment.observaciones) {
      const monthCode = extractPaymentMonthFromObservation(payment.observaciones);
      if (monthCode) {
        paidMonths.push({
          monthCode,
          date: payment.fecha
        });
      }
    }
  }
  
  // Ordenar por mes (más reciente primero)
  paidMonths.sort((a, b) => b.monthCode.localeCompare(a.monthCode));
  
  if (paidMonths.length === 0) {
    return {
      lastPaidMonth: null,
      lastPaidMonthText: null,
      currentStatus: 'unknown',
      monthsBehind: 0,
      suggestedPaymentMonth: monthCodeToText(getCurrentMonthCode()),
      suggestedPaymentMonthCode: getCurrentMonthCode()
    };
  }
  
  const lastPaidMonthCode = paidMonths[0].monthCode;
  const currentMonthCode = getCurrentMonthCode();
  
  // Calcular meses de diferencia
  const monthsBehind = calculateMonthsDifference(lastPaidMonthCode, currentMonthCode);
  
  let currentStatus: 'up-to-date' | 'behind' | 'unknown';
  if (monthsBehind <= 0) {
    currentStatus = 'up-to-date';
  } else {
    currentStatus = 'behind';
  }
  
  // Sugerir el próximo mes a pagar
  const suggestedMonthCode = getNextMonthCode(lastPaidMonthCode);
  
  return {
    lastPaidMonth: lastPaidMonthCode,
    lastPaidMonthText: monthCodeToText(lastPaidMonthCode),
    currentStatus,
    monthsBehind: Math.max(0, monthsBehind),
    suggestedPaymentMonth: monthCodeToText(suggestedMonthCode),
    suggestedPaymentMonthCode: suggestedMonthCode
  };
}

/**
 * Obtiene el código del mes actual (YYYY-MM)
 */
function getCurrentMonthCode(): string {
  const now = getCurrentLocalDate();
  const year = now.getUTCFullYear();
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Obtiene el código del siguiente mes
 */
function getNextMonthCode(monthCode: string): string {
  const [year, month] = monthCode.split('-').map(Number);
  const date = new Date(year, month - 1); // month es 0-indexed en Date
  date.setMonth(date.getMonth() + 1);
  
  const nextYear = date.getFullYear();
  const nextMonth = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${nextYear}-${nextMonth}`;
}

/**
 * Calcula la diferencia en meses entre dos códigos de mes
 */
function calculateMonthsDifference(fromMonth: string, toMonth: string): number {
  const [fromYear, fromM] = fromMonth.split('-').map(Number);
  const [toYear, toM] = toMonth.split('-').map(Number);
  
  const fromDate = new Date(fromYear, fromM - 1);
  const toDate = new Date(toYear, toM - 1);
  
  const diffTime = toDate.getTime() - fromDate.getTime();
  const diffMonths = Math.round(diffTime / (1000 * 60 * 60 * 24 * 30.44)); // Aproximado
  
  return diffMonths;
}

/**
 * Genera el texto de observación para el próximo pago de cuota social
 */
export function generateSocialQuotaObservation(memberCode: string, movements: Movement[]): string {
  const status = analyzeSocialQuotaStatus(movements);
  return `Pago de cuota social mes de ${status.suggestedPaymentMonth}`;
}