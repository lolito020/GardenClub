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
  status?: 'PENDIENTE' | 'PARCIAL' | 'CANCELADO' | 'REFINANCIADO';
  vencimiento?: string;
  // Nuevos campos para tipo DIARIO
  tipoServicio?: ServiceType;
  diasPagados?: number;
}

export interface Venue {
  id: string;
  nombre: string;
  descripcion?: string;
  activo?: boolean;
  precioBaseHora?: number;
  garantia?: number;
  capacidad?: number;
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
  // Campos para reservas/agendamiento (soporte para ambos nombres)
  agendamiento?: boolean;  // Nombre usado en la base de datos
  permiteAgendamiento?: boolean;  // Alias alternativo
  // Campos para horas extras
  permiteHorasExtras?: boolean;
  precioHoraExtra?: number;
  // Espacios disponibles para el servicio
  espaciosDisponibles?: Venue[];
  espacios?: string[]; // Formato antiguo (nombres de espacios)
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

/* ============ REFINANCIACIÓN DE DEUDAS ============ */
export type RefinancingStatus = 
  | 'DRAFT'                // Borrador, aún no confirmada
  | 'PENDIENTE_APROBACION' // Enviada a junta directiva
  | 'APROBADA'            // Aprobada por junta directiva
  | 'ACTIVA'              // En ejecución (débitos generados)
  | 'COMPLETADA'          // Todas las cuotas pagadas
  | 'CANCELADA'           // Cancelada antes de ejecutar
  | 'ANULADA';            // Anulada con rollback después de ejecutar

export type InstallmentStatus = 
  | 'PENDIENTE'           // Cuota pendiente de pago
  | 'PAGADA'              // Cuota completamente pagada
  | 'PARCIAL'             // Cuota con pago parcial
  | 'VENCIDA'             // Cuota vencida sin pagar
  | 'ANULADA';            // Cuota anulada (por cancelación de refinanciación)

export interface RefinancingInstallment {
  number: number;         // Número de cuota (1, 2, 3...)
  dueDate: string;        // Fecha de vencimiento (YYYY-MM-DD)
  amount: number;         // Monto de la cuota
  status: InstallmentStatus;
  paidAmount?: number;    // Monto pagado de esta cuota
  debitMovementId?: string; // ID del movimiento DEBIT generado para esta cuota
}

export interface OriginalDebitSnapshot {
  id: string;             // ID del débito original
  monto: number;          // Monto original del débito
  paidAmount: number;     // Monto pagado antes de la refinanciación
  vencimiento?: string;   // Fecha de vencimiento original
  concepto: string;       // Concepto del débito original
  fecha: string;          // Fecha de creación del débito original
}

export interface RefinancingAuditEntry {
  timestamp: string;      // ISO timestamp
  action: string;         // Acción realizada (ej: 'CREATED', 'APPROVED', 'EXECUTED', 'CANCELLED')
  userId?: string;        // Usuario que realizó la acción
  details?: string;       // Detalles adicionales de la acción
  previousData?: any;     // Estado anterior (para rollbacks)
}

export interface Refinancing {
  id: string;
  memberId: string;
  
  // Deudas originales refinanciadas
  originalDebitIds: string[];           // IDs de los débitos originales
  originalDebitsSnapshot: OriginalDebitSnapshot[]; // Snapshot para rollback
  
  // Parámetros del plan
  principal: number;                    // Monto total a refinanciar
  downPaymentPercent: number;          // Porcentaje de anticipo (0-100)
  downPaymentAmount: number;           // Monto del anticipo
  installments: number;                // Cantidad de cuotas (1-12)
  installmentAmount: number;           // Monto por cuota (calculado)
  startDueDate: string;               // Fecha de vencimiento de la primera cuota
  
  // Cronograma de pagos
  schedule: RefinancingInstallment[];
  
  // Estados y metadatos
  status: RefinancingStatus;
  approvalRequired: boolean;           // Si requiere aprobación de junta directiva
  sentToBoard: boolean;               // Si fue enviada a la junta directiva
  approvedBy?: string;                // Usuario que aprobó (si aplica)
  approvedAt?: string;                // Fecha de aprobación
  
  // Archivos y documentación
  pdfUrl?: string;                    // URL del PDF generado (carta-compromiso)
  
  // Auditoría y observaciones
  observations?: string;              // Observaciones del plan
  auditTrail: RefinancingAuditEntry[]; // Historial de cambios
  
  // Campos técnicos
  executedAt?: string;                // Fecha de ejecución (cuando se generaron los débitos)
  cancelledAt?: string;               // Fecha de cancelación
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface RefinancingCalculation {
  principal: number;
  downPaymentPercent: number;
  downPaymentAmount: number;
  installments: number;
  installmentAmount: number;
  remainingAfterDownPayment: number;
  totalInInstallments: number;
  adjustmentCents: number;           // Centavos de ajuste por redondeo
  schedule: Array<{
    number: number;
    dueDate: string;
    amount: number;
  }>;
}

export interface RefinancingValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
