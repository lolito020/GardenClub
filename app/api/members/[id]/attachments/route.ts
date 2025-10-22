import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { nanoid } from 'nanoid';
import path from 'path';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Attachment = {
  id: string;
  memberId: string;
  nombre: string;
  url: string;       // ruta pública bajo /public
  mime: string;
  size: number;
  descripcion?: string;
  fecha: string;     // ISO
};

function sanitizeName(name: string) {
  return name.replace(/[^a-z0-9.\-_\s]/gi, '_');
}

// GET /api/members/:id/attachments
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });

  try {
    const db = await getDb();
    db.data.attachments ||= [];

    const memberId = params.id;
    const memberAttachments = db.data.attachments.filter(att => att.memberId === memberId);

    return NextResponse.json(memberAttachments);
  } catch (error) {
    console.error('Error getting member attachments:', error);
    return NextResponse.json({ ok: false, msg: 'Error al obtener adjuntos' }, { status: 500 });
  }
}

// POST /api/members/:id/attachments
// FormData:
//  - files: File | File[]  (puede venir "files" repetido)
//  - file:  File | File[]  (aceptamos también este alias, por compatibilidad)
//  - descripcion: string   (opcional)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });

  // ---- Chequeo de Content-Type para errores más claros
  const ct = req.headers.get('content-type') || '';
  const isMultipart = /multipart\/form-data/i.test(ct);
  const isUrlEncoded = /application\/x-www-form-urlencoded/i.test(ct);
  if (!isMultipart && !isUrlEncoded) {
    return NextResponse.json(
      {
        ok: false,
        msg: `Content-Type inválido. Se esperaba "multipart/form-data" (o "application/x-www-form-urlencoded"), se recibió: "${ct || 'N/A'}".`,
      },
      { status: 415 }
    );
  }

  try {
    const memberId = params.id;
    const form = await req.formData();

    // Aceptar tanto "files" como "file" (y en ambos casos, 1 o N archivos)
    const rawA = form.getAll('files');
    const rawB = form.getAll('file');
    const raw = [...rawA, ...rawB];

    const files: File[] = raw.filter((x: any): x is File => x && typeof x === 'object' && typeof x.arrayBuffer === 'function');

    const descripcion = (form.get('descripcion')?.toString() || '').trim();

    if (!files || files.length === 0) {
      return NextResponse.json({ ok: false, msg: 'No se recibieron archivos en los campos "files" o "file".' }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', memberId);
    await mkdir(uploadDir, { recursive: true });

    const db = await getDb();
    db.data.attachments ||= [];

    const saved: Attachment[] = [];

    for (const f of files) {
      const bytes = await f.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const original = sanitizeName((f as any).name || 'archivo');
      const ext = path.extname(original);
      const id = nanoid();
      const filename = `${Date.now()}_${id}${ext || ''}`;
      const filepath = path.join(uploadDir, filename);

      await writeFile(filepath, buffer);

      const publicUrl = `/uploads/${memberId}/${filename}`;
      const attachment: Attachment = {
        id,
        memberId,
        nombre: original,
        url: publicUrl,
        mime: (f as any).type || 'application/octet-stream',
        size: (f as any).size || buffer.byteLength,
        ...(descripcion ? { descripcion } : {}),
        fecha: new Date().toISOString(),
      };

      db.data.attachments.push(attachment);
      saved.push(attachment);
    }

    await db.write();
    return NextResponse.json(saved, { status: 201 });
  } catch (e: any) {
    console.error('POST /attachments error', e);
    return NextResponse.json({ ok: false, msg: e?.message || 'Error al subir adjuntos' }, { status: 500 });
  }
}

// DELETE /api/members/:id/attachments?attachmentId=XYZ
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const attachmentId = url.searchParams.get('attachmentId');
    if (!attachmentId) {
      return NextResponse.json({ ok: false, msg: 'attachmentId requerido' }, { status: 400 });
    }

    const db = await getDb();
    db.data.attachments ||= [];

    const list: Attachment[] = db.data.attachments;
    const idx = list.findIndex(a => a.id === attachmentId && a.memberId === params.id);
    if (idx === -1) {
      return NextResponse.json({ ok: false, msg: 'Adjunto no encontrado' }, { status: 404 });
    }

    const [removed] = list.splice(idx, 1);
    await db.write();

    // borrar del disco si existe
    const absPath = path.join(process.cwd(), 'public', removed.url.replace(/^\/+/, ''));
    try {
      await unlink(absPath);
    } catch {
      // si ya no existe, ignorar
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('DELETE /attachments error', e);
    return NextResponse.json({ ok: false, msg: e?.message || 'Error al eliminar adjunto' }, { status: 500 });
  }
}
