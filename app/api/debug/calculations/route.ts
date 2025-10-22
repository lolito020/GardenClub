import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Función para normalizar tipos
function normalizeTipoMovimiento(t: any): 'DEBIT' | 'CREDIT' {
  const u = String(t || '').toUpperCase();
  if (u === 'DEBIT' || u === 'DEBE') return 'DEBIT';
  if (u === 'CREDIT' || u === 'HABER') return 'CREDIT';
  return 'DEBIT';
}

function xround(num: number) {
  return Math.round((Number(num) || 0) * 100) / 100;
}

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const memberId = 'm1';
    
    // Obtener movimientos como lo hace cada página
    const movements = (db.data.movements || []).filter((m: any) => m.memberId === memberId);
    
    // Simular cálculo página principal
    const movsPrincipal = movements.map((mv: any, idx: number) => ({
      id: String(mv.id || `${memberId}-${idx}`),
      memberId: String(mv.memberId || memberId),
      fecha: mv.fecha || mv.date || new Date().toISOString(),
      concepto: String(mv.concepto || mv.description || ''),
      tipo: normalizeTipoMovimiento(mv.tipo || mv.type || ''),
      monto: Number(mv.monto || mv.amount || 0),
      origen: mv.origen || mv.source || undefined,
      refId: mv.refId || mv.referenceId || undefined,
      vencimiento: mv.vencimiento || mv.dueDate || undefined,
      paidAmount: Number(mv.paidAmount || 0),
    }));

    const deudaPrincipal = movsPrincipal
      .filter(x => normalizeTipoMovimiento(x.tipo as any) === 'DEBIT')
      .reduce((acc, d) => acc + Math.max(0, xround(d.monto) - xround(d.paidAmount || 0)), 0);

    // Simular cálculo página detalles
    const movsDetalles = movements.map((m: any, idx: number) => ({
      id: String(m.id || `${memberId}-${m.fecha || m.date || Date.now()}-${idx}`),
      memberId: String(m.memberId || memberId),
      fecha: m.fecha || m.date || m.createdAt || new Date().toISOString(),
      concepto: m.concepto || m.description || '',
      tipo: normalizeTipoMovimiento(m.tipo || m.type || ''),
      monto: Number(m.monto || m.amount || 0),
      origen: m.origen || m.source || undefined,
      refId: m.refId || m.referenceId || undefined,
      observaciones: m.observaciones || m.notes || '',
      paidAmount: Number(m.paidAmount || 0),
      status: m.status,
      vencimiento: m.vencimiento || m.dueDate || undefined,
    }));

    const deudaDetalles = movsDetalles
      .filter(x => normalizeTipoMovimiento(x.tipo as any) === 'DEBIT')
      .reduce((acc, d) => acc + Math.max(0, d.monto - (d.paidAmount || 0)), 0);

    // Calcular también el saldo global (método anterior de detalles)
    const totalDebe = movsDetalles
      .filter(r => r.tipo === 'DEBIT')
      .reduce((acc, r) => acc + r.monto, 0);
    
    const totalHaber = movsDetalles
      .filter(r => r.tipo === 'CREDIT')
      .reduce((acc, r) => acc + r.monto, 0);
    
    const saldoGlobal = totalDebe - totalHaber;
    const deudaSaldoGlobal = Math.max(0, saldoGlobal);

    return NextResponse.json({
      memberId,
      totalMovements: movements.length,
      rawMovements: movements,
      processedPrincipal: movsPrincipal.filter(x => normalizeTipoMovimiento(x.tipo as any) === 'DEBIT'),
      processedDetalles: movsDetalles.filter(x => normalizeTipoMovimiento(x.tipo as any) === 'DEBIT'),
      calculations: {
        metodoPrincipal: deudaPrincipal,
        metodoDetalles: deudaDetalles,
        metodoSaldoGlobal: deudaSaldoGlobal,
        totalDebe,
        totalHaber,
        saldoGlobal
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}