import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req, ['admin', 'consulta']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || 'mes';
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
    
    const db = await getDb();
    
    // Calcular métricas básicas
    const totalSocios = db.data.members.length;
    const sociosAlDia = db.data.members.filter(m => m.estado === 'AL_DIA').length;
    const sociosAtrasados = db.data.members.filter(m => m.estado === 'ATRASADO').length;
    
    // Filtrar pagos por período
    const startDate = new Date(month + '-01');
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    
    const pagosPeriodo = db.data.payments.filter(p => {
      const fechaPago = new Date(p.fecha);
      return fechaPago >= startDate && fechaPago <= endDate;
    });
    
    const totalCobrado = pagosPeriodo.reduce((sum, p) => sum + p.monto, 0);
    const totalComisiones = pagosPeriodo.reduce((sum, p) => sum + (p.comisionCobrador || 0), 0);
    
    // Pagos por mes (últimos 6 meses)
    const pagosPorMes = [];
    for (let i = 5; i >= 0; i--) {
      const fecha = new Date();
      fecha.setMonth(fecha.getMonth() - i);
      const mesStr = fecha.toISOString().slice(0, 7);
      
      const pagosDelMes = db.data.payments.filter(p => p.fecha.startsWith(mesStr));
      pagosPorMes.push({
        mes: fecha.toLocaleDateString('es-PY', { month: 'short', year: 'numeric' }),
        monto: pagosDelMes.reduce((sum, p) => sum + p.monto, 0),
        cantidad: pagosDelMes.length
      });
    }
    
    // Servicios más usados
    const serviciosCount: { [key: string]: { cantidad: number; ingresos: number } } = {};
    pagosPeriodo.forEach(pago => {
      if (!serviciosCount[pago.concepto]) {
        serviciosCount[pago.concepto] = { cantidad: 0, ingresos: 0 };
      }
      serviciosCount[pago.concepto].cantidad++;
      serviciosCount[pago.concepto].ingresos += pago.monto;
    });
    
    const serviciosMasUsados = Object.entries(serviciosCount)
      .map(([nombre, data]) => ({ nombre, ...data }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);
    
    // Cobradores más activos
    const cobradoresStats: { [key: string]: { pagos: number; comisiones: number } } = {};
    pagosPeriodo.forEach(pago => {
      if (pago.cobradorId) {
        const cobrador = db.data.collectors.find(c => c.id === pago.cobradorId);
        const nombre = cobrador ? `${cobrador.nombres} ${cobrador.apellidos}` : 'Cobrador desconocido';
        
        if (!cobradoresStats[nombre]) {
          cobradoresStats[nombre] = { pagos: 0, comisiones: 0 };
        }
        cobradoresStats[nombre].pagos++;
        cobradoresStats[nombre].comisiones += pago.comisionCobrador || 0;
      }
    });
    
    const cobradoresMasActivos = Object.entries(cobradoresStats)
      .map(([nombre, data]) => ({ nombre, ...data }))
      .sort((a, b) => b.pagos - a.pagos)
      .slice(0, 5);
    
    const reportData = {
      totalSocios,
      sociosAlDia,
      sociosAtrasados,
      totalCobrado,
      totalComisiones,
      pagosPorMes,
      serviciosMasUsados,
      cobradoresMasActivos
    };
    
    return NextResponse.json(reportData);
  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json({ ok: false, msg: 'Error al generar reporte' }, { status: 500 });
  }
}