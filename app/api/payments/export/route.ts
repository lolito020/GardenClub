import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'excel';
    
    const db = await getDb();
    
    // Enriquecer pagos con información de socios y cobradores
    const enrichedPayments = db.data.payments.map(payment => {
      const member = db.data.members.find(m => m.id === payment.memberId);
      const collector = payment.cobradorId ? db.data.collectors.find(c => c.id === payment.cobradorId) : null;
      
      return {
        ...payment,
        memberName: member ? `${member.nombres} ${member.apellidos}` : 'Socio no encontrado',
        memberCode: member?.codigo || 'N/A',
        cobradorName: collector ? `${collector.nombres} ${collector.apellidos}` : 'Caja Interna'
      };
    });
    
    if (format === 'excel') {
      const csvData = [
        ['Fecha', 'Socio', 'Código', 'Concepto', 'Monto', 'Forma Pago', 'Cobrador', 'Comisión', 'Recibo'].join(','),
        ...enrichedPayments.map(p => [
          p.fecha,
          p.memberName,
          p.memberCode,
          p.concepto,
          p.monto,
          p.formaPago,
          p.cobradorName,
          p.comisionCobrador || 0,
          p.numeroRecibo || ''
        ].join(','))
      ].join('\n');
      
      return new NextResponse(csvData, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="cobranzas.csv"'
        }
      });
    }
    
    return NextResponse.json(enrichedPayments);
  } catch (error) {
    console.error('Error exporting payments:', error);
    return NextResponse.json({ ok: false, msg: 'Error al exportar pagos' }, { status: 500 });
  }
}