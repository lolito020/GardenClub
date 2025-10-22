import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req, ['admin', 'consulta']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'excel';
    const idsParam = searchParams.get('ids');
    
    const db = await getDb();
    let members = db.data.members;
    
    // Filter by provided IDs if present
    if (idsParam) {
      const requestedIds = idsParam.split(',');
      members = members.filter(m => requestedIds.includes(m.id));
    }
    
    if (format === 'excel') {
      // Calculate debt for each member
      const membersWithDebt = members.map(m => {
        const movements = db.data.movements.filter(mov => mov.memberId === m.id);
        
        // Calculate total pending debt
        const totalDebt = movements
          .filter(mov => mov.status === 'PENDIENTE')
          .reduce((sum, mov) => {
            if (mov.tipo === 'DEBIT') {
              return sum + (mov.monto - (mov.paidAmount || 0));
            }
            return sum;
          }, 0);
        
        // Format debt with thousands separator (dot)
        const deudaFormateada = totalDebt.toLocaleString('es-PY', { 
          minimumFractionDigits: 0,
          maximumFractionDigits: 0 
        });
        
        return {
          'Nro de Socio': m.codigo,
          'Nombre y Apellido': `${m.nombres} ${m.apellidos}`,
          'Cédula': m.ci,
          'Categoría': m.categoria,
          'Estado': m.estado,
          'Deuda': deudaFormateada
        };
      });
      
      // Create Excel workbook using xlsx library
      const worksheet = XLSX.utils.json_to_sheet(membersWithDebt);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Socios');
      
      // Generate Excel file as buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      return new NextResponse(excelBuffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="socios.xlsx"'
        }
      });
    }
    
    return NextResponse.json(members);
  } catch (error) {
    console.error('Error exporting members:', error);
    return NextResponse.json({ ok: false, msg: 'Error al exportar socios' }, { status: 500 });
  }
}