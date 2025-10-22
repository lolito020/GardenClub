// Endpoint: POST /api/refinancing/approve
// Aprueba o rechaza la refinanciación


import { getDb } from '../../../lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { refinancingId, approved, approvedBy = 'system' } = body;
    if (!refinancingId || typeof approved !== 'boolean') {
      return new Response(JSON.stringify({ error: 'refinancingId y approved requeridos' }), { status: 400 });
    }
    const db = await getDb();
    const refinancing = db.data.refinancings.find(r => r.id === refinancingId);
    if (!refinancing) {
      return new Response(JSON.stringify({ error: 'Refinanciación no encontrada' }), { status: 404 });
    }
    const now = new Date().toISOString();
    if (approved) {
      refinancing.status = 'APROBADA';
      refinancing.approvedBy = approvedBy;
      refinancing.approvedAt = now;
      refinancing.auditTrail.push({
        timestamp: now,
        action: 'APPROVED',
        userId: approvedBy,
        details: 'Refinanciación aprobada por junta directiva',
      });
    } else {
      refinancing.status = 'CANCELADA';
      refinancing.auditTrail.push({
        timestamp: now,
        action: 'REJECTED',
        userId: approvedBy,
        details: 'Refinanciación rechazada por junta directiva',
      });
    }
    refinancing.updatedAt = now;
    await db.write();
    return new Response(JSON.stringify(refinancing), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Error interno' }), { status: 500 });
  }
}
