import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'garden-club-secret-key-2024';
const CONFIG_FILE = path.join(process.cwd(), 'lib', 'timezone-config.ts');

export async function POST(req: NextRequest) {
  try {
    // Verificar autenticación
    const cookieStore = await cookies();
    const token = cookieStore.get('gcp_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return NextResponse.json(
        { error: 'Token inválido' },
        { status: 401 }
      );
    }

    // Solo admin puede cambiar configuración del sistema
    if (decoded.role !== 'admin') {
      return NextResponse.json(
        { error: 'No tienes permisos para modificar la configuración del sistema' },
        { status: 403 }
      );
    }

    const { name, offset, description } = await req.json();

    if (!name || typeof offset !== 'number' || !description) {
      return NextResponse.json(
        { error: 'Datos inválidos' },
        { status: 400 }
      );
    }

    // Leer el archivo actual
    const currentConfig = fs.readFileSync(CONFIG_FILE, 'utf-8');

    // Actualizar las líneas específicas
    const updatedConfig = currentConfig
      .replace(
        /name: '[^']*'/,
        `name: '${name}'`
      )
      .replace(
        /offsetHours: -?\d+/,
        `offsetHours: ${offset}`
      )
      .replace(
        /description: '[^']*'/,
        `description: '${description}'`
      );

    // Guardar el archivo
    fs.writeFileSync(CONFIG_FILE, updatedConfig, 'utf-8');

    return NextResponse.json({
      success: true,
      message: 'Configuración actualizada correctamente',
      config: { name, offset, description }
    });

  } catch (error) {
    console.error('Error al actualizar configuración:', error);
    return NextResponse.json(
      { error: 'Error al actualizar configuración' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    // Verificar autenticación
    const cookieStore = await cookies();
    const token = cookieStore.get('gcp_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    try {
      jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return NextResponse.json(
        { error: 'Token inválido' },
        { status: 401 }
      );
    }

    // Leer configuración actual
    const configContent = fs.readFileSync(CONFIG_FILE, 'utf-8');
    
    // Extraer valores con regex
    const nameMatch = configContent.match(/name: '([^']*)'/);
    const offsetMatch = configContent.match(/offsetHours: (-?\d+)/);
    const descriptionMatch = configContent.match(/description: '([^']*)'/);

    const config = {
      name: nameMatch ? nameMatch[1] : 'America/Asuncion',
      offset: offsetMatch ? parseInt(offsetMatch[1]) : -3,
      description: descriptionMatch ? descriptionMatch[1] : 'Paraguay (UTC-3)',
    };

    return NextResponse.json(config);

  } catch (error) {
    console.error('Error al leer configuración:', error);
    return NextResponse.json(
      { error: 'Error al leer configuración' },
      { status: 500 }
    );
  }
}
