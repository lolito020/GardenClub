// lib/jsondb.ts
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export type MovementType = 'DEBIT' | 'CREDIT';
export type MovementSource = 'SERVICIO' | 'CUOTA' | 'PAGO' | 'AJUSTE';

export interface Movement {
  id: string;
  memberId: string;
  fecha: string; // YYYY-MM-DD o ISO
  concepto: string;
  tipo: MovementType;
  monto: number; // positivo
  origen?: MovementSource;
  refId?: string;
  observaciones?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Payment {
  id: string;
  memberId: string;
  fecha: string;
  concepto: string;
  formaPago?: string;
  numeroRecibo?: string;
  monto: number;
}

export interface JSONDB {
  // agrega aquí lo que ya tengas: members, services, attachments, etc.
  members?: any[];
  services?: any[];
  payments?: Payment[];
  movements?: Movement[];
  attachments?: any[];
  [key: string]: any;
}

function getDbPath() {
  // DATA/DB.json dentro del proyecto (respeta mayúsculas)
  const p = process.env.DB_JSON || path.join(process.cwd(), 'DATA', 'DB.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

async function ensureFile(p: string) {
  try {
    await fsp.access(p, fs.constants.F_OK);
  } catch {
    const empty: JSONDB = { members: [], services: [], payments: [], movements: [], attachments: [] };
    await atomicWriteJSON(p, empty);
  }
}

async function atomicWriteJSON(p: string, data: any) {
  const tmp = p + '.' + crypto.randomUUID() + '.tmp';
  const json = JSON.stringify(data, null, 2);
  await fsp.writeFile(tmp, json, 'utf8');
  await fsp.rename(tmp, p);
}

export async function readDB(): Promise<JSONDB> {
  const p = getDbPath();
  await ensureFile(p);
  const raw = await fsp.readFile(p, 'utf8');
  let data: JSONDB;
  try {
    data = JSON.parse(raw || '{}');
  } catch {
    data = {};
  }
  // migraciones suaves
  if (!Array.isArray(data.members)) data.members = [];
  if (!Array.isArray(data.services)) data.services = [];
  if (!Array.isArray(data.payments)) data.payments = [];
  if (!Array.isArray(data.movements)) data.movements = [];
  if (!Array.isArray(data.attachments)) data.attachments = [];
  return data;
}

export async function writeDB(mutator: (db: JSONDB) => void | Promise<void>): Promise<JSONDB> {
  const p = getDbPath();
  await ensureFile(p);
  // Nota: sin lock inter-proceso; para Bolt.new suele ser suficiente.
  const db = await readDB();
  await mutator(db);
  await atomicWriteJSON(p, db);
  return db;
}

// Utils comunes
export function normalizeDate(d: string) {
  // Acepta ISO; devuelve YYYY-MM-DD
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

export function newId() {
  return crypto.randomUUID();
}
