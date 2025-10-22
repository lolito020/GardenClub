import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { getDb } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const COOKIE_NAME = 'gcp_token';

export async function isSetupMode() {
  const db = await getDb();
  return db.data.users.length === 0;
}

export async function signIn(email: string, password: string) {
  const db = await getDb();

  // Modo configuración: si no hay usuarios, crear sesión ficticia admin
  if (db.data.users.length === 0) {
    const token = jwt.sign(
      { sub: 'setup-admin', rol: 'admin', nombre: 'Administrador (setup)', email: 'setup@local' },
      JWT_SECRET, { expiresIn: '8h' }
    );
    return { 
      token,
      user: { email: 'setup@local', rol: 'admin', nombre: 'Administrador (setup)' }
    };
  }

  const user = db.data.users.find(u => u.email === email);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  const token = jwt.sign(
    { sub: user.id, rol: user.rol, nombre: user.nombre, email: user.email },
    JWT_SECRET, { expiresIn: '8h' }
  );
  return { 
    token,
    user: { email: user.email, rol: user.rol, nombre: user.nombre }
  };
}

export { COOKIE_NAME };

export async function requireAuth(request?: NextRequest, roles?: string[]) {
  const db = await getDb();

  // Setup: sin usuarios → admin ficticio
  if (db.data.users.length === 0) {
    return { sub: 'setup-admin', rol: 'admin', nombre: 'Administrador (setup)', email: 'setup@local' };
  }

  if (!request) return null;
  
  const c = request.cookies.get(COOKIE_NAME)?.value;
  if (!c) return null;
  try {
    const payload = jwt.verify(c, JWT_SECRET) as any;
    if (roles && !roles.includes(payload.rol)) return null;
    return payload;
  } catch {
    return null;
  }
}