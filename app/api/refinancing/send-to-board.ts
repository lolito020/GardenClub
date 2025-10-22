// Endpoint: POST /api/refinancing/send-to-board
// Genera PDF y envía a junta directiva


import { getDb } from '../../../lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { refinancingId, sentBy = 'system' } = body;
    if (!refinancingId) {
      return new Response(JSON.stringify({ error: 'refinancingId requerido' }), { status: 400 });
    }
    const db = await getDb();
    const refinancing = db.data.refinancings.find(r => r.id === refinancingId);
    if (!refinancing) {
      return new Response(JSON.stringify({ error: 'Refinanciación no encontrada' }), { status: 404 });
    }
    // Simular generación de PDF
    const pdfUrl = `/uploads/refinancing-${refinancing.id}.pdf`;
    refinancing.pdfUrl = pdfUrl;
    refinancing.status = 'PENDIENTE_APROBACION';
    refinancing.sentToBoard = true;
    refinancing.updatedAt = new Date().toISOString();
    refinancing.auditTrail.push({
      timestamp: refinancing.updatedAt,
      action: 'SENT_TO_BOARD',
      userId: sentBy,
      details: 'PDF generado y enviado a junta directiva',
    });
    await db.write();
    return new Response(JSON.stringify(refinancing), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Error interno' }), { status: 500 });
  }
}
