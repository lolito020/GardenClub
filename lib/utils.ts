// Client-safe utility functions
import { formatLocalDate, getCurrentLocalDate, getLocalDateString } from './timezone-config';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    minimumFractionDigits: 0
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  // Usar la función centralizada de timezone
  return formatLocalDate(date, false);
}

export function formatDateTime(date: string | Date): string {
  // Usar la función centralizada de timezone
  return formatLocalDate(date, true);
}

export function calculateAge(birthDate: string): number {
  const today = getCurrentLocalDate();
  const birth = new Date(birthDate);
  const birthLocal = new Date(birth.getTime() + (3 * 60 * 60 * 1000)); // Ajustar a hora local
  
  let age = today.getUTCFullYear() - birthLocal.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birthLocal.getUTCMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < birthLocal.getUTCDate())) {
    age--;
  }
  
  return age;
}

/**
 * Obtiene la fecha actual en zona horaria local configurada
 * en formato YYYY-MM-DD
 * @deprecated Use getLocalDateString() from timezone-config instead
 */
export function getTodayParaguay(): string {
  return getLocalDateString();
}

/**
 * Obtiene la fecha y hora actual en zona horaria local configurada
 * @deprecated Use getCurrentLocalDate() from timezone-config instead
 */
export function getNowParaguay(): Date {
  return getCurrentLocalDate();
}

export function generateReceiptNumber(): string {
  const now = getCurrentLocalDate();
  const year = now.getUTCFullYear().toString().slice(-2);
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = now.getUTCDate().toString().padStart(2, '0');
  const time = now.getTime().toString().slice(-4);
  
  return `REC-${year}${month}${day}-${time}`;
}

// Funciones para manejo de números y formato guaraní
export function gsFormat(value: string): string {
  // Remover todo excepto números
  const numbers = value.replace(/\D/g, '');
  if (!numbers) return '';
  
  // Agregar separadores de miles
  return numbers.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function gsParse(value: string): number {
  // Remover puntos y convertir a número
  const numbers = value.replace(/\./g, '');
  return parseInt(numbers) || 0;
}

export function xround(value: number): number {
  return Math.round(value);
}