import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import { requireAuth, isSetupMode } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Permitir en setup mode; en normal, exigir admin
  if (!(await isSetupMode())) {
    const user = await requireAuth(req, ['admin']);
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  }

  const db = await getDb();
  // No devolver passwords
  const users = db.data.users.map(({ passwordHash, ...user }) => user);
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  try {
    // Permitir en setup mode; en normal, exigir admin
    if (!(await isSetupMode())) {
      const user = await requireAuth(req, ['admin']);
      if (!user) return NextResponse.json({ ok: false }, { status: 401 });
    }

    const { email, nombre, rol, password } = await req.json();

    if (!email || !password || !nombre || !rol) {
      return NextResponse.json({ ok: false, msg: 'Datos incompletos' }, { status: 400 });
    }

    const db = await getDb();
    
    // Verificar si el email ya existe
    const existingUser = db.data.users.find(u => u.email === email);
    if (existingUser) {
      return NextResponse.json({ ok: false, msg: 'El email ya está registrado' }, { status: 400 });
    }

    // Crear hash de la contraseña
    const passwordHash = bcrypt.hashSync(password, 10);

    const user = {
      id: nanoid(),
      email,
      nombre,
      rol,
      passwordHash,
      activo: true,
      fechaCreacion: new Date().toISOString()
    };

    db.data.users.push(user);
    await db.write();

    // Devolver usuario sin password
    const { passwordHash: _, ...userResponse } = user;
    return NextResponse.json({ ok: true, user: userResponse }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ ok: false, msg: 'Error al crear usuario' }, { status: 500 });
  }
}