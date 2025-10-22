import { JSONFilePreset } from 'lowdb/node';
import fs from 'fs';
import path from 'path';

type Rol = 'admin'|'caja'|'cobranzas'|'consulta'|'porteria';
export type Subcategoria = 'Socio'|'Socio Patrimonial'|'Socio Vitalicio';
export type EstadoSocio = 'AL_DIA'|'ATRASADO'|'SUSPENDIDO';
export type FormaPago = 'efectivo'|'transferencia'|'tarjeta'|'cheque';
export type TipoServicio = 'MENSUAL'|'ANUAL'|'UNICO'|'DIARIO';

export interface Member {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
  ci: string;
  ruc?: string;
  categoria: 'Individual'|'Familiar';
  subcategoria: Subcategoria;
  direccion?: string;
  telefono?: string;
  celular?: string;
  email?: string;
  nacimiento?: string;
  nacionalidad?: string;
  datosLaborales?: string;
  alta: string; // Fecha de ingreso
  estado: EstadoSocio;
  foto?: string;
  familiaId?: string;
  servicios: string[]; // IDs de servicios asignados
  observaciones?: string;
}

export interface Payment {
  id: string;
  memberId: string;
  fecha: string;
  monto: number;
  concepto: string;
  formaPago: FormaPago;
  cobradorId?: string;
  comisionCobrador?: number;
  observaciones?: string;
  numeroRecibo?: string;
  
  // Para gestión de asignaciones
  allocations?: Array<{ 
    debitId?: string; 
    amount: number; 
    paymentId?: string;
    creditMovementId?: string;
  }>;
}

export interface Service {
  id: string;
  nombre: string;
  descripcion?: string;
  precio: number;
  tipo: TipoServicio;
  obligatorio?: boolean;
  aplicaA?: Subcategoria[]; // A qué subcategorías aplica
  comisionCobrador?: number; // % de comisión
  activo: boolean;
  categoria?: string;
}

export interface Collector {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
  ci: string;
  telefono?: string;
  celular?: string;
  direccion?: string;
  email?: string;
  formaPago: 'efectivo'|'transferencia'|'cheque'; // Cómo recibe sus comisiones
  cuentaBanco?: string;
  activo: boolean;
  fechaIngreso: string;
}

export interface Family {
  id: string;
  grupoFamiliarId: string;
  socioTitularId: string; // ID del socio principal
  nombres: string;
  apellidos: string;
  ci?: string;
  parentesco: string; // Esposo/a, Hijo/a, etc.
  nacimiento?: string;
  telefono?: string;
  email?: string;
  foto?: string;
  activo: boolean;
}

export interface Financing {
  id: string;
  memberId: string;
  montoTotal: number;
  cantidadCuotas: number;
  montoCuota: number;
  fechaInicio: string;
  fechaVencimiento: string;
  aprobadoPor: string; // Usuario que aprobó
  observaciones?: string;
  pagare?: string; // URL del documento
  estado: 'ACTIVO'|'PAGADO'|'CANCELADO';
  cuotasPagadas: number;
}

export interface CommissionPayment {
  id: string;
  cobradorId: string;
  fecha: string;
  monto: number;
  concepto: string;
  formaPago: FormaPago;
  periodo: string; // Ej: "2024-01" para enero 2024
}

export interface User {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  passwordHash: string;
  activo: boolean;
  fechaCreacion: string;
}

/* ====== MOVIMIENTOS ====== */
export type MovementType = 'DEBIT' | 'CREDIT';      // DEBIT = Debe, CREDIT = Haber
export type MovementSource = 'SERVICIO' | 'CUOTA' | 'PAGO' | 'AJUSTE' | 'SUSCRIPCION';

export interface Movement {
  id: string;
  memberId: string;
  fecha: string;      // ISO
  concepto: string;
  tipo: MovementType; // 'DEBIT'/'CREDIT'
  monto: number;      // positivo
  origen?: MovementSource;
  refId?: string;

  // NEW (para estado de cuenta y edición)
  observaciones?: string;
  paidAmount?: number;
  status?: 'PENDIENTE' | 'PARCIAL' | 'CANCELADO';
  vencimiento?: string; // YYYY-MM-DD o ISO
  
  // Para gestión de pagos
  allocations?: Array<{ 
    debitId?: string; 
    amount: number; 
    paymentId?: string;
    creditMovementId?: string;
  }>;
}

export interface Attachment {
  id: string;
  memberId: string;
  nombre: string;
  url: string;       // ruta pública bajo /public
  mime: string;
  size: number;
  descripcion?: string;
  fecha: string;     // ISO
}

/* ============ RESERVAS ============ */
export type ReservationStatus = 'ACTIVO'|'CULMINADO'|'CANCELADO'|'PENDIENTE'|'RESERVADO'|'CONFIRMADO'|'FINALIZADO'|'PENDING'|'HOLD'|'CONFIRMED';

export interface ReservationPayment {
  id: string;
  reservationId: string;
  fecha: string;
  monto: number;
  metodo: FormaPago;
  numeroRecibo?: string;
  observaciones?: string;
}

export interface Category {
  id: string;
  nombre: string;
}

export interface Reservation {
  id: string;
  resourceId: string;      // salón / recurso
  memberId?: string;       // opcional si es socio
  start: string;           // ISO
  end: string;             // ISO
  invitados?: number;
  nombreContacto: string;  // persona que reserva
  contacto: string;        // teléfono / email
  medioContacto: 'telefono'|'whatsapp'|'email'|'presencial'|'otro';
  adelanto?: number;
  montoTotal: number;
  depositoRequerido?: number; // depósito requerido
  pagado?: number;         // total pagado
  status: ReservationStatus;
  notas?: string;
  cancelReason?: string;   // razón de cancelación
  debitMovementId?: string; // 🔗 ID del movimiento de débito relacionado

  pagos: ReservationPayment[];

  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface Resource {
  id: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  precioBaseHora: number;
  garantia?: number;     // depósito (opcional)
  capacidad?: number;
}

/* ============ SUSCRIPCIONES ============ */
export type SubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';

export interface MemberSubscription {
  id: string;
  memberId: string;
  serviceId: string;
  /** Precio vigente de la suscripción (si difiere del servicio) */
  price?: number;
  /** Periodicidad declarativa (opcional): MENSUAL, ANUAL o DIARIO */
  periodicity?: 'MENSUAL' | 'ANUAL' | 'DIARIO';
  /** Cada cuántos días se genera el débito automático */
  cadenceDays: number;
  /** Si al llegar la fecha se crea débito automáticamente */
  autoDebit: boolean;
  /** Estado de la suscripción */
  status: SubscriptionStatus;
  /** Fecha de inicio de la suscripción (YYYY-MM-DD) */
  startDate: string;
  /** Próxima fecha en la que debería generarse débito (YYYY-MM-DD) */
  nextChargeDate: string;
  /** Nota libre */
  notes?: string;
}

/* ============ DB SCHEMA ============ */
export interface DbSchema {
  members: Member[];
  payments: Payment[];
  services: Service[];
  users: User[];
  collectors: Collector[];
  families: Family[];
  financing: Financing[];
  commissionPayments: CommissionPayment[];
  movements: Movement[];
  attachments: Attachment[];

  // NEW
  resources: Resource[];
  reservations: Reservation[];
  reservationPayments: ReservationPayment[];
  categories: Category[];

  // NEW: suscripciones
  memberSubscriptions: MemberSubscription[];

  sequences: {
    member: number;
    payment: number;
    collector: number;
    family: number;
    financing: number;
    commission: number;
    resource: number;
    reservation: number;
    reservationPayment: number;

    // NEW
    subscription: number;
    movement: number;
  };
}

let dbPromise: ReturnType<typeof JSONFilePreset<DbSchema>>;

function ensureDataDir() {
  const dir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'db.json');
}

export function getDb() {
  if (!dbPromise) {
    const file = ensureDataDir();
    dbPromise = JSONFilePreset<DbSchema>(file, {
      members: [],
      payments: [],
      services: [],
      users: [],
      collectors: [],
      families: [],
      financing: [],
      commissionPayments: [],
      movements: [],
      attachments: [],
      // NEW:
      resources: [],
      reservations: [],
      reservationPayments: [],
      categories: [],
      memberSubscriptions: [],
      sequences: {
        member: 0,
        payment: 0,
        collector: 0,
        family: 0,
        financing: 0,
        commission: 0,
        resource: 0,
        reservation: 0,
        reservationPayment: 0,
        // NEW
        subscription: 0,
        movement: 0,
      }
    });
  }
  return dbPromise;
}

/* ============ SECUENCIAS ============ */
export async function nextMemberCode() {
  const db = await getDb();
  db.data.sequences.member += 1;
  await db.write();
  return String(db.data.sequences.member);
}

export async function convertNoSocioToSocio(memberId: string) {
  const db = await getDb();
  
  // Buscar el miembro
  const memberIndex = db.data.members.findIndex(m => m.id === memberId);
  if (memberIndex === -1) {
    throw new Error('Member not found');
  }
  
  const member = db.data.members[memberIndex];
  
  // Verificar que sea no-socio
  if (member.subcategoria !== 'NO SOCIO' as any) {
    throw new Error('Member is not a no-socio');
  }
  
  // Obtener el siguiente código de socio
  const newCode = await nextMemberCode();
  
  // Actualizar el miembro
  db.data.members[memberIndex] = {
    ...member,
    codigo: newCode,
    categoria: 'Individual', // Por defecto Individual, pero podría ser Familiar
    subcategoria: 'Socio'
  };
  
  await db.write();
  return db.data.members[memberIndex];
}

export async function nextCollectorCode() {
  const db = await getDb();
  db.data.sequences.collector += 1;
  await db.write();
  return `COB-${String(db.data.sequences.collector).padStart(3, '0')}`;
}

export async function nextPaymentId() {
  const db = await getDb();
  db.data.sequences.payment += 1;
  await db.write();
  return `PAY-${String(db.data.sequences.payment).padStart(6, '0')}`;
}

export async function nextFamilyId() {
  const db = await getDb();
  db.data.sequences.family += 1;
  await db.write();
  return `FAM-${String(db.data.sequences.family).padStart(4, '0')}`;
}

export async function nextFinancingId() {
  const db = await getDb();
  db.data.sequences.financing += 1;
  await db.write();
  return `FIN-${String(db.data.sequences.financing).padStart(4, '0')}`;
}

export async function nextCommissionId() {
  const db = await getDb();
  db.data.sequences.commission += 1;
  await db.write();
  return `COM-${String(db.data.sequences.commission).padStart(6, '0')}`;
}

export async function nextResourceId() {
  const db = await getDb();
  db.data.sequences.resource += 1;
  await db.write();
  return `RESRC-${String(db.data.sequences.resource).padStart(4,'0')}`;
}

export async function nextReservationId() {
  const db = await getDb();
  db.data.sequences.reservation += 1;
  await db.write();
  return `RES-${String(db.data.sequences.reservation).padStart(6,'0')}`;
}

export async function nextReservationPaymentId() {
  const db = await getDb();
  db.data.sequences.reservationPayment += 1;
  await db.write();
  return `RESPAY-${String(db.data.sequences.reservationPayment).padStart(6,'0')}`;
}

/* NEW: IDs para suscripciones y movimientos creados por cron */
export async function nextSubscriptionId() {
  const db = await getDb();
  db.data.sequences.subscription += 1;
  await db.write();
  return `SUB-${String(db.data.sequences.subscription).padStart(6, '0')}`;
}

export async function nextMovementId() {
  const db = await getDb();
  db.data.sequences.movement += 1;
  await db.write();
  return `MOV-${String(db.data.sequences.movement).padStart(6, '0')}`;
}

/* ============ UTILIDADES RESERVAS ============ */
export function computeQuote(
  db: Awaited<ReturnType<typeof getDb>>,
  resourceId: string,
  startISO: string,
  endISO: string,
  invitados = 0
): { horas: number; monto: number } {
  const res = db.data.resources.find(r => r.id === resourceId);
  const precioBaseHora = res?.precioBaseHora ?? 0;

  const start = new Date(startISO).getTime();
  const end   = new Date(endISO).getTime();
  const horas = Math.max(1, Math.ceil((end - start) / (1000*60*60)));

  // Política simple: precio x hora * horas (+5% si > 100 invitados, por ejemplo)
  let monto = precioBaseHora * horas;
  if (invitados > 100) monto = Math.round(monto * 1.05);

  return { horas, monto };
}

export function hasReservationConflict(
  db: Awaited<ReturnType<typeof getDb>>,
  resourceId: string,
  startISO: string,
  endISO: string,
  ignoreId?: string
): boolean {
  const start = new Date(startISO).getTime();
  const end   = new Date(endISO).getTime();
  return db.data.reservations.some(r =>
    r.resourceId === resourceId &&
    r.id !== ignoreId &&
    Math.max(new Date(r.start).getTime(), start) < Math.min(new Date(r.end).getTime(), end) &&
    r.status !== 'CANCELADO'
  );
}

/* ============ OTRAS UTILIDADES GENERALES ============ */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    minimumFractionDigits: 0
  }).format(amount);
}

// (Placeholder) Cálculo de deuda del socio – lo ajustaremos luego
export function calculateMemberDebt(member: Member, movements: Movement[]): number {
  const today = new Date();
  
  let debt = 0;
  
  for (const movement of movements) {
    if (movement.memberId !== member.id) continue;
    
    if (movement.tipo === 'DEBIT') {
      // Calcular pendiente sin importar vencimiento
      const pendiente = movement.monto - (movement.paidAmount || 0);
      if (pendiente > 0) {
        debt += pendiente;
      }
    }
  }
  
  return Math.max(0, debt);
}

export function getMemberStatus(member: Member, movements: Movement[]): EstadoSocio {
  const debt = calculateMemberDebt(member, movements);
  return debt > 0 ? 'ATRASADO' : 'AL_DIA';
}

/* ============ FECHAS (helpers para suscripciones/cron) ============ */
export function toISODate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function addDays(d: Date | string, days: number): Date {
  const dt = typeof d === 'string' ? new Date(d) : new Date(d.getTime());
  dt.setDate(dt.getDate() + days);
  return dt;
}

export function startOfMonth(d: Date | string): Date {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Date(dt.getFullYear(), dt.getMonth(), 1);
}

export function endOfMonth(d: Date | string): Date {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Date(dt.getFullYear(), dt.getMonth() + 1, 0);
}

export function yyyymm(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}`;
}
