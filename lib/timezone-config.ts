/**
 * Configuración de Zona Horaria del Sistema
 * 
 * Este archivo centraliza la configuración de zona horaria para todo el sistema.
 * Paraguay usa UTC-4 (hora estándar) o UTC-3 (horario de verano).
 */

export const TIMEZONE_CONFIG = {
  // Zona horaria de Paraguay
  name: 'America/Asuncion',
  
  // Offset en horas respecto a UTC (negativo para oeste)
  // Paraguay: UTC-4 en invierno, UTC-3 en verano
  // Por simplicidad, usamos UTC-3 (horario de verano)
  offsetHours: -3,
  
  // Descripción
  description: 'Paraguay (UTC-3)',
};

/**
 * Obtiene la fecha y hora actual ajustada a la zona horaria configurada
 * @returns Date object con la hora local de Paraguay
 */
export function getCurrentLocalDate(): Date {
  // Usar Intl.DateTimeFormat para obtener las partes de fecha en Paraguay
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { 
    timeZone: TIMEZONE_CONFIG.name,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  const parts = formatter.formatToParts(now);
  const partsObj = Object.fromEntries(parts.map(part => [part.type, part.value]));
  
  // Crear fecha en Paraguay timezone
  return new Date(
    parseInt(partsObj.year),
    parseInt(partsObj.month) - 1, // month es 0-indexed
    parseInt(partsObj.day),
    parseInt(partsObj.hour),
    parseInt(partsObj.minute),
    parseInt(partsObj.second)
  );
}

/**
 * Convierte una fecha a string en formato YYYY-MM-DD para inputs de tipo date
 * @param date - Fecha a convertir (si no se proporciona, usa la fecha actual local)
 * @returns String en formato YYYY-MM-DD
 */
export function getLocalDateString(date?: Date): string {
  if (date) {
    // Si se proporciona fecha, usarla directamente
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } else {
    // Si no se proporciona fecha, usar fecha actual en Paraguay
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { 
      timeZone: TIMEZONE_CONFIG.name,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    return formatter.format(now); // Devuelve YYYY-MM-DD directamente
  }
}

/**
 * Convierte una fecha a string en formato YYYY-MM-DDTHH:mm para inputs de tipo datetime-local
 * @param date - Fecha a convertir (si no se proporciona, usa la fecha actual local)
 * @returns String en formato YYYY-MM-DDTHH:mm
 */
export function getLocalDateTimeString(date?: Date): string {
  const localDate = date || getCurrentLocalDate();
  return localDate.toISOString().slice(0, 16);
}

/**
 * Formatea una fecha para mostrar en formato legible
 * @param date - Fecha a formatear (puede ser string ISO o Date)
 * @param includeTime - Si debe incluir la hora
 * @returns String formateado (ej: "15/10/2025" o "15/10/2025 15:30")
 */
export function formatLocalDate(date: string | Date, includeTime: boolean = false): string {
  let dateObj: Date;
  
  if (typeof date === 'string') {
    // Si es un string solo fecha (YYYY-MM-DD), tratarlo como fecha local, no UTC
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split('-').map(Number);
      dateObj = new Date(year, month - 1, day); // Crear como fecha local
    } else {
      // Si es un string con hora o formato ISO completo
      dateObj = new Date(date);
    }
  } else {
    dateObj = date;
  }
  
  if (includeTime) {
    // Formato completo con hora
    return dateObj.toLocaleString('es-PY', { 
      timeZone: TIMEZONE_CONFIG.name,
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } else {
    // Solo fecha - si ya es una fecha local, no aplicar timezone conversion
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // Para fechas en formato YYYY-MM-DD, formatear directamente
      const [year, month, day] = date.split('-');
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    } else {
      // Para otros casos, usar toLocaleDateString con timezone
      return dateObj.toLocaleDateString('es-PY', { 
        timeZone: TIMEZONE_CONFIG.name,
        day: '2-digit',
        month: '2-digit', 
        year: 'numeric'
      });
    }
  }
}

/**
 * Convierte una fecha string del servidor a Date local
 * @param isoString - String en formato ISO del servidor
 * @returns Date object ajustado a zona horaria local
 */
export function parseServerDate(isoString: string): Date {
  const serverDate = new Date(isoString);
  // El servidor guarda en UTC, ajustamos a hora local
  return new Date(serverDate.getTime() + (TIMEZONE_CONFIG.offsetHours * 60 * 60 * 1000));
}

/**
 * Obtiene el inicio del día actual en hora local
 * @returns Date con hora 00:00:00 local
 */
export function getStartOfLocalDay(): Date {
  const today = getCurrentLocalDate();
  return new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
    0, 0, 0, 0
  ));
}

/**
 * Obtiene el fin del día actual en hora local
 * @returns Date con hora 23:59:59 local
 */
export function getEndOfLocalDay(): Date {
  const today = getCurrentLocalDate();
  return new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
    23, 59, 59, 999
  ));
}

/**
 * Verifica si una fecha es hoy (en hora local)
 * @param date - Fecha a verificar
 * @returns true si la fecha es hoy
 */
export function isToday(date: string | Date): boolean {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const today = getCurrentLocalDate();
  
  return (
    dateObj.getUTCDate() === today.getUTCDate() &&
    dateObj.getUTCMonth() === today.getUTCMonth() &&
    dateObj.getUTCFullYear() === today.getUTCFullYear()
  );
}

/**
 * Obtiene la fecha de mañana en hora local
 * @returns Date del día siguiente
 */
export function getTomorrow(): Date {
  const today = getCurrentLocalDate();
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow;
}
