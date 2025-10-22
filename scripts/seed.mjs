import { JSONFilePreset } from 'lowdb/node';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const dir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = await JSONFilePreset(path.join(dir, 'db.json'), {
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
  sequences: { 
    member: 0, 
    payment: 0, 
    collector: 0,
    family: 0,
    financing: 0,
    commission: 0
  }
});

const hash = (s) => bcrypt.hashSync(s, 10);

// Usuarios del sistema
db.data.users = [
  { 
    id: 'u1', 
    email: 'admin@gardenclub.py', 
    nombre: 'Administrador', 
    rol: 'admin', 
    passwordHash: hash('admin123'),
    activo: true,
    fechaCreacion: new Date().toISOString()
  },
  { 
    id: 'u2', 
    email: 'caja@gardenclub.py', 
    nombre: 'Usuario Caja', 
    rol: 'caja', 
    passwordHash: hash('caja123'),
    activo: true,
    fechaCreacion: new Date().toISOString()
  },
  { 
    id: 'u3', 
    email: 'porteria@gardenclub.py', 
    nombre: 'Portero', 
    rol: 'porteria', 
    passwordHash: hash('porteria123'),
    activo: true,
    fechaCreacion: new Date().toISOString()
  }
];

// Servicios del club
db.data.services = [
  {
    id: 's1',
    nombre: 'Cuota Social Mensual',
    descripcion: 'Cuota mensual obligatoria para todos los socios',
    precio: 150000,
    tipo: 'MENSUAL',
    obligatorio: true,
    aplicaA: ['Socio', 'Socio Patrimonial', 'Socio Vitalicio'],
    activo: true
  },
  {
    id: 's2',
    nombre: 'Cuota de Ingreso',
    descripcion: 'Pago único al ingresar como socio',
    precio: 500000,
    tipo: 'UNICO',
    obligatorio: false,
    aplicaA: ['Socio'],
    activo: true
  },
  {
    id: 's3',
    nombre: 'Natación',
    descripcion: 'Clases de natación mensuales',
    precio: 120000,
    tipo: 'MENSUAL',
    obligatorio: false,
    comisionCobrador: 12,
    activo: true
  },
  {
    id: 's4',
    nombre: 'Tenis',
    descripcion: 'Clases de tenis mensuales',
    precio: 100000,
    tipo: 'MENSUAL',
    obligatorio: false,
    comisionCobrador: 12,
    activo: true
  },
  {
    id: 's5',
    nombre: 'Alquiler Salón Social',
    descripcion: 'Alquiler del salón para eventos',
    precio: 800000,
    tipo: 'UNICO',
    obligatorio: false,
    activo: true
  }
];

// Cobradores
db.data.collectors = [
  {
    id: 'c1',
    codigo: 'COB-001',
    nombres: 'María',
    apellidos: 'González',
    ci: '3456789',
    telefono: '0981-123456',
    celular: '0981-123456',
    direccion: 'Asunción',
    email: 'maria.gonzalez@email.com',
    formaPago: 'transferencia',
    cuentaBanco: '1234567890',
    activo: true,
    fechaIngreso: '2024-01-15'
  },
  {
    id: 'c2',
    codigo: 'COB-002',
    nombres: 'Carlos',
    apellidos: 'Rodríguez',
    ci: '4567890',
    telefono: '0985-654321',
    celular: '0985-654321',
    direccion: 'Luque',
    email: 'carlos.rodriguez@email.com',
    formaPago: 'efectivo',
    activo: true,
    fechaIngreso: '2024-02-01'
  }
];

// Socios de ejemplo
db.data.members = [
  {
    id: 'm1',
    codigo: 'SOC-00001',
    nombres: 'Juan Carlos',
    apellidos: 'Pérez López',
    ci: '1234567',
    ruc: '1234567-8',
    categoria: 'Individual',
    subcategoria: 'Socio',
    direccion: 'Av. España 1234, Asunción',
    telefono: '021-123456',
    celular: '0981-123456',
    email: 'juan.perez@email.com',
    nacimiento: '1980-05-15',
    nacionalidad: 'Paraguaya',
    datosLaborales: 'Contador - Empresa ABC',
    alta: '2024-01-15',
    estado: 'AL_DIA',
    servicios: ['s1', 's3'],
    observaciones: 'Socio fundador'
  },
  {
    id: 'm2',
    codigo: 'SOC-00002',
    nombres: 'Ana María',
    apellidos: 'Gómez Silva',
    ci: '2345678',
    categoria: 'Familiar',
    subcategoria: 'Socio Vitalicio',
    direccion: 'Calle Real 567, Luque',
    telefono: '021-654321',
    celular: '0985-654321',
    email: 'ana.gomez@email.com',
    nacimiento: '1975-08-22',
    nacionalidad: 'Paraguaya',
    alta: '2024-02-01',
    estado: 'AL_DIA',
    servicios: ['s1'],
    familiaId: 'fam-001'
  },
  {
    id: 'm3',
    codigo: 'SOC-00003',
    nombres: 'Roberto',
    apellidos: 'Martínez',
    ci: '3456789',
    categoria: 'Individual',
    subcategoria: 'Socio',
    direccion: 'Barrio San Vicente, Capiatá',
    telefono: '021-789123',
    celular: '0987-789123',
    email: 'roberto.martinez@email.com',
    nacimiento: '1985-12-10',
    nacionalidad: 'Paraguaya',
    alta: '2024-03-01',
    estado: 'ATRASADO',
    servicios: ['s1', 's4']
  }
];

// Familiares
db.data.families = [
  {
    id: 'f1',
    grupoFamiliarId: 'fam-001',
    socioTitularId: 'm2',
    nombres: 'Pedro',
    apellidos: 'Gómez Silva',
    ci: '2345679',
    parentesco: 'Esposo',
    nacimiento: '1973-03-15',
    telefono: '0985-654322',
    email: 'pedro.gomez@email.com',
    activo: true
  },
  {
    id: 'f2',
    grupoFamiliarId: 'fam-001',
    socioTitularId: 'm2',
    nombres: 'Sofía',
    apellidos: 'Gómez Silva',
    ci: '2345680',
    parentesco: 'Hija',
    nacimiento: '2005-07-20',
    activo: true
  }
];

// Pagos de ejemplo
db.data.payments = [
  {
    id: 'PAY-000001',
    memberId: 'm1',
    fecha: '2024-01-15',
    monto: 150000,
    concepto: 'Cuota Social Enero 2024',
    formaPago: 'transferencia',
    numeroRecibo: 'REC-001'
  },
  {
    id: 'PAY-000002',
    memberId: 'm1',
    fecha: '2024-01-15',
    monto: 120000,
    concepto: 'Natación Enero 2024',
    formaPago: 'transferencia',
    cobradorId: 'c1',
    comisionCobrador: 14400,
    numeroRecibo: 'REC-002'
  },
  {
    id: 'PAY-000003',
    memberId: 'm2',
    fecha: '2024-02-01',
    monto: 150000,
    concepto: 'Cuota Social Febrero 2024',
    formaPago: 'efectivo',
    numeroRecibo: 'REC-003'
  }
];

// Actualizar secuencias
db.data.sequences = {
  member: 3,
  payment: 3,
  collector: 2,
  family: 2,
  financing: 0,
  commission: 0
};

await db.write();
console.log('✅ Base de datos inicializada con datos de ejemplo');
console.log('📊 Datos creados:');
console.log(`   - ${db.data.users.length} usuarios`);
console.log(`   - ${db.data.members.length} socios`);
console.log(`   - ${db.data.services.length} servicios`);
console.log(`   - ${db.data.collectors.length} cobradores`);
console.log(`   - ${db.data.families.length} familiares`);
console.log(`   - ${db.data.payments.length} pagos`);
console.log('');
console.log('🔑 Usuarios de prueba:');
console.log('   admin@gardenclub.py / admin123');
console.log('   caja@gardenclub.py / caja123');
console.log('   porteria@gardenclub.py / porteria123');