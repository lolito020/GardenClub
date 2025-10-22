export type MovementType = 'DEBIT' | 'CREDIT';
export type MovementSource = 'SERVICIO' | 'CUOTA' | 'PAGO' | 'AJUSTE' | 'SUSCRIPCION';
export type ServiceType = 'MENSUAL' | 'ANUAL' | 'UNICO' | 'DIARIO';
export type MemberSubcategory = 'SOCIO' | 'NO SOCIO' | string;

export interface Movement {
  id: string;
  memberId: string;
  fecha: string; // ISO
  concepto: string;
  tipo: MovementType;
  monto: number;
  origen?: MovementSource;
  refId?: string;
  observaciones?: string;
  paidAmount?: number;
  status?: 'PENDIENTE' | 'PARCIAL' | 'CANCELADO';
  vencimiento?: string;
  // Nuevos campos para tipo DIARIO
  tipoServicio?: ServiceType;
  diasPagados?: number;
}

export interface Service {
  id: string;
  nombre: string;
  descripcion?: string;
  precio: number;
  // Nuevos campos para precios diferenciados
  precioSocio?: number;
  precioNoSocio?: number;
  tipo: ServiceType;
  obligatorio?: boolean;
  aplicaA?: string[];
  comisionCobrador?: number;
  activo: boolean;
  categoria?: string;
  socios?: boolean;
  noSocios?: boolean;
  // Nuevo campo para reservas/agendamiento
  permiteAgendamiento?: boolean;
}

export interface Member {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
  cedula?: string;
  ruc?: string;
  fechaNacimiento?: string;
  nacionalidad?: string;
  categoria?: string;
  subcategoria?: MemberSubcategory;
  estado?: string;
  direccion?: string;
  telefono?: string;
  celular?: string;
  email?: string;
  fechaAlta?: string;
  foto?: string;
  datosLaborales?: string;
  observaciones?: string;
  servicios?: string[];
}

export type SubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';
export type SubscriptionPeriodicity = 'MONTHLY' | 'ANNUAL' | 'DAILY';

export interface MemberSubscription {
  id: string;
  memberId: string;
  serviceId: string;
  price?: number;
  periodicity?: SubscriptionPeriodicity; // Extendido para incluir DAILY
  cadenceDays: number;        // cada cuántos días generar débito (si querés más granularidad)
  autoDebit: boolean;         // si genera débito automático
  status: SubscriptionStatus; // estado de la suscripción
  startDate: string;
  nextChargeDate: string;
  validUntil?: string;        // Nuevo campo para fecha de vencimiento
  notes?: string;
}

// Nuevas interfaces para el flujo de pago
export interface PaymentItem {
  serviceId: string;
  serviceName: string;
  tipo: ServiceType;
  monto: number;
  vencimiento?: string;
  dias?: number; // Solo para tipo DIARIO
  subscriptionId?: string;
}

export interface NonMemberRegistration {
  nombres: string;
  apellidos: string;
  cedula: string;
  ruc: string;
  fechaNacimiento?: string;
  nacionalidad?: string;
  categoria?: string;
  direccion?: string;
  telefono?: string;
  celular?: string;
  email?: string;
  datosLaborales?: string;
  observaciones?: string;
}
