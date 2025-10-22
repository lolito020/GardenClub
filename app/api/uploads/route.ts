import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Opcional: podés agregar auth si querés que solo usuarios logueados suban:
// import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    // Si usás auth, descomentá:
    // const user = await requireAuth(req, ['admin', 'caja']);
    // if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const form = await req.formData();
    const file = form.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ ok: false, msg: 'No file uploaded' }, { status: 400 });
    }

    // Validaciones básicas
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ ok: false, msg: 'Tipo no permitido' }, { status: 400 });
    }
    const MAX_MB = 8;
    if (file.size > MAX_MB * 1024 * 1024) {
      return NextResponse.json({ ok: false, msg: `La imagen supera ${MAX_MB}MB` }, { status: 400 });
    }

    // Asegurar carpeta
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    // Nombre con extensión
    const extFromMime: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    };
    const ext =
      extFromMime[file.type] ||
      (file.name && path.extname(file.name)) ||
      '.bin';

    const filename = `${Date.now()}-${nanoid(8)}${ext}`;
    const outPath = path.join(uploadsDir, filename);

    // Guardar archivo
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(outPath, bytes);

    // Ruta pública servida por Next desde /public
    const publicPath = `/uploads/${filename}`;

    return NextResponse.json({ ok: true, path: publicPath }, { status: 201 });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ ok: false, error: 'Upload failed' }, { status: 500 });
  }
}
