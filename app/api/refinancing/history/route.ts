// Endpoint: GET /api/refinancing/history?memberId=...
// Lista el historial de refinanciaciones de un socio

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('memberId');
    
    if (!memberId) {
      return NextResponse.json({ error: 'memberId requerido' }, { status: 400 });
    }
    
    const db = await getDb();
    const refinancings = db.data.refinancings?.filter(r => r.memberId === memberId) || [];
    
    console.log(`🔍 Refinanciaciones encontradas para miembro ${memberId}:`, refinancings.length);
    
    return NextResponse.json(refinancings);
  } catch (err: any) {
    console.error('Error en /api/refinancing/history:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}