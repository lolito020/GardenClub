import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const db = await getDb();
    
    // Métricas básicas
    const totalSocios = db.data.members.length;
    const sociosAlDia = db.data.members.filter(m => m.estado === 'AL_DIA').length;
    const sociosAtrasados = db.data.members.filter(m => m.estado === 'ATRASADO').length;
    
    // Pagos del mes actual
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const pagosMes = db.data.payments.filter(p => {
      const fechaPago = new Date(p.fecha);
      return fechaPago >= startOfMonth && fechaPago <= endOfMonth;
    });
    
    const totalCobradoMes = pagosMes.reduce((sum, p) => sum + p.monto, 0);
    const totalComisionesMes = pagosMes.reduce((sum, p) => sum + (p.comisionCobrador || 0), 0);
    
    // Últimos 5 pagos
    const ultimosPagos = db.data.payments
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, 5)
      .map(pago => {
        const member = db.data.members.find(m => m.id === pago.memberId);
        return {
          id: pago.id,
          memberName: member ? `${member.nombres} ${member.apellidos}` : 'Socio no encontrado',
          monto: pago.monto,
          concepto: pago.concepto,
          fecha: pago.fecha
        };
      });
    
    // Generar alertas
    const alertas = [];
    
    if (sociosAtrasados > 0) {
      alertas.push({
        tipo: 'warning' as const,
        mensaje: `Hay ${sociosAtrasados} socios con pagos atrasados que requieren seguimiento.`
      });
    }
    
    if (totalSocios > 0 && (sociosAlDia / totalSocios) < 0.8) {
      alertas.push({
        tipo: 'error' as const,
        mensaje: 'El porcentaje de socios al día es menor al 80%. Se recomienda intensificar las cobranzas.'
      });
    }
    
    if (pagosMes.length === 0) {
      alertas.push({
        tipo: 'info' as const,
        mensaje: 'No se han registrado pagos este mes. Verificar el sistema de cobranzas.'
      });
    }
    
    const dashboardData = {
      totalSocios,
      sociosAlDia,
      sociosAtrasados,
      totalCobradoMes,
      totalComisionesMes,
      pagosPendientes: sociosAtrasados, // Simplificado
      ultimosPagos,
      alertas
    };
    
    return NextResponse.json(dashboardData);
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    return NextResponse.json({ ok: false, msg: 'Error al cargar datos del dashboard' }, { status: 500 });
  }
}