import { NextRequest, NextResponse } from 'next/server';
import { getDb, nextMovementId } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { getCurrentLocalDate } from '@/lib/timezone-config';
import {
  analyzeAnnualQuotas,
  generateMonthlyQuotaDebits,
  validateMemberForAnnualQuotas,
  SOCIAL_QUOTA_SERVICE_ID,
  type AnnualQuotaAnalysis
} from '@/lib/annual-quota-generator';

export const dynamic = 'force-dynamic';

/**
 * GET /api/members/[id]/generate-annual-quotas
 * Analiza el estado de las cuotas anuales de un socio
 * 
 * Query params:
 * - year: Año a analizar (default: año actual)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) {
    return NextResponse.json({ ok: false, msg: 'No autorizado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : getCurrentLocalDate().getUTCFullYear();

    // Validar año
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { ok: false, msg: 'Año inválido' },
        { status: 400 }
      );
    }

    const db = await getDb();
    
    // Obtener socio
    const member = db.data.members?.find((m: any) => m.id === params.id);
    if (!member) {
      return NextResponse.json(
        { ok: false, msg: 'Socio no encontrado' },
        { status: 404 }
      );
    }

    // Validar que el socio pueda tener cuotas anuales
    const validation = validateMemberForAnnualQuotas(member);
    if (!validation.valid) {
      return NextResponse.json(
        { ok: false, msg: validation.error },
        { status: 400 }
      );
    }

    // Obtener servicio de cuota social
    const service = db.data.services?.find((s: any) => s.id === SOCIAL_QUOTA_SERVICE_ID);
    if (!service) {
      return NextResponse.json(
        { ok: false, msg: 'Servicio de cuota social no encontrado' },
        { status: 500 }
      );
    }

    // Obtener movimientos del socio
    const movements = db.data.movements?.filter((m: any) => m.memberId === params.id) || [];

    // Analizar estado de cuotas anuales
    const analysis = analyzeAnnualQuotas(member, movements, year, service.precio);

    return NextResponse.json({
      ok: true,
      analysis
    });
  } catch (error: any) {
    console.error('Error al analizar cuotas anuales:', error);
    return NextResponse.json(
      { ok: false, msg: 'Error al analizar cuotas anuales', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/members/[id]/generate-annual-quotas
 * Genera los débitos de cuota social para un año completo
 * 
 * Body:
 * - year: Año para generar (default: año actual)
 * - force: Forzar generación incluso si ya existen algunos meses (default: false)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) {
    return NextResponse.json({ ok: false, msg: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { year: yearParam, force = false } = body;
    const year = yearParam || getCurrentLocalDate().getUTCFullYear();

    // Validar año
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { ok: false, msg: 'Año inválido' },
        { status: 400 }
      );
    }

    const db = await getDb();
    
    // Obtener socio
    const member = db.data.members?.find((m: any) => m.id === params.id);
    if (!member) {
      return NextResponse.json(
        { ok: false, msg: 'Socio no encontrado' },
        { status: 404 }
      );
    }

    // Validar que el socio pueda tener cuotas anuales
    const validation = validateMemberForAnnualQuotas(member);
    if (!validation.valid) {
      return NextResponse.json(
        { ok: false, msg: validation.error },
        { status: 400 }
      );
    }

    // Obtener servicio de cuota social
    const service = db.data.services?.find((s: any) => s.id === SOCIAL_QUOTA_SERVICE_ID);
    if (!service) {
      return NextResponse.json(
        { ok: false, msg: 'Servicio de cuota social no encontrado' },
        { status: 500 }
      );
    }

    if (!service.activo) {
      return NextResponse.json(
        { ok: false, msg: 'El servicio de cuota social está inactivo' },
        { status: 400 }
      );
    }

    // Obtener movimientos del socio
    const movements = db.data.movements?.filter((m: any) => m.memberId === params.id) || [];

    // Analizar estado de cuotas anuales
    const analysis = analyzeAnnualQuotas(member, movements, year, service.precio);

    // Verificar si hay errores
    if (analysis.errors.length > 0) {
      return NextResponse.json(
        { ok: false, msg: analysis.errors.join('; '), errors: analysis.errors },
        { status: 400 }
      );
    }

    // Verificar si se puede generar
    if (!analysis.canGenerate && !force) {
      return NextResponse.json(
        { 
          ok: false, 
          msg: `No hay meses pendientes para generar en ${year}`,
          analysis 
        },
        { status: 400 }
      );
    }

    // Generar débitos
    const debitsToCreate = generateMonthlyQuotaDebits(analysis, service.precio);

    if (debitsToCreate.length === 0) {
      return NextResponse.json(
        { 
          ok: false, 
          msg: 'No se generaron débitos', 
          analysis 
        },
        { status: 400 }
      );
    }

    // Crear débitos en la base de datos
    db.data.movements = db.data.movements || [];
    const createdDebits = [];
    const createdAt = getCurrentLocalDate().toISOString();

    for (const debit of debitsToCreate) {
      const movement = {
        id: await nextMovementId(),
        ...debit,
        createdAt,
        paidAmount: 0,
        status: 'PENDIENTE' as const
      };

      db.data.movements.push(movement);
      createdDebits.push({
        id: movement.id,
        month: debit.metadata.monthNumber,
        monthText: debit.metadata.monthCode,
        monthName: debit.concepto.split(' - ')[1], // "Enero 2025"
        amount: debit.monto,
        dueDate: debit.vencimiento
      });
    }

    // Guardar cambios
    await db.write();

    // Log de auditoría
    console.log(`✅ Cuotas anuales generadas para ${member.codigo} - ${member.nombres} ${member.apellidos}`);
    console.log(`   Año: ${year}`);
    console.log(`   Meses generados: ${createdDebits.length}`);
    console.log(`   Monto total: Gs. ${analysis.totalAmountToGenerate.toLocaleString('es-PY')}`);

    return NextResponse.json({
      ok: true,
      msg: `Se generaron ${createdDebits.length} débitos de cuota social para ${year}`,
      generated: createdDebits,
      totalGenerated: createdDebits.length,
      totalAmount: analysis.totalAmountToGenerate,
      skipped: analysis.existingDebits.map(d => d.monthText),
      analysis
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error al generar cuotas anuales:', error);
    return NextResponse.json(
      { ok: false, msg: 'Error al generar cuotas anuales', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/members/[id]/generate-annual-quotas
 * Revierte (elimina) los débitos de cuota social PENDIENTES de un año
 * 
 * Query params:
 * - year: Año a revertir (default: año actual)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) {
    return NextResponse.json({ ok: false, msg: 'No autorizado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : getCurrentLocalDate().getUTCFullYear();

    // Validar año
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { ok: false, msg: 'Año inválido' },
        { status: 400 }
      );
    }

    const db = await getDb();
    
    // Obtener socio
    const member = db.data.members?.find((m: any) => m.id === params.id);
    if (!member) {
      return NextResponse.json(
        { ok: false, msg: 'Socio no encontrado' },
        { status: 404 }
      );
    }

    // Obtener servicio de cuota social
    const service = db.data.services?.find((s: any) => s.id === SOCIAL_QUOTA_SERVICE_ID);
    if (!service) {
      return NextResponse.json(
        { ok: false, msg: 'Servicio de cuota social no encontrado' },
        { status: 500 }
      );
    }

    // Obtener movimientos del socio
    const movements = db.data.movements?.filter((m: any) => m.memberId === params.id) || [];

    // Analizar estado de cuotas anuales
    const analysis = analyzeAnnualQuotas(member, movements, year, service.precio);

    // Verificar si hay débitos para revertir
    if (!analysis.canRevert || analysis.revertableDebits.length === 0) {
      return NextResponse.json(
        { 
          ok: false, 
          msg: `No hay débitos pendientes para revertir en ${year}`,
          analysis 
        },
        { status: 400 }
      );
    }

    // Eliminar débitos pendientes
    const deletedDebits: Array<{ id: string; month?: number; monthText?: string; amount: number }> = [];
    const skippedDebits: Array<{ id: string; month?: number; monthText?: string; reason: string }> = [];
    const initialCount = db.data.movements.length;

    db.data.movements = db.data.movements.filter((m: any) => {
      if (analysis.revertableDebits.includes(m.id)) {
        // Obtener info antes de eliminar
        const monthInfo = analysis.existingDebits.find(d => d.debitId === m.id);
        deletedDebits.push({
          id: m.id,
          month: monthInfo?.month,
          monthText: monthInfo?.monthText,
          amount: m.monto
        });
        return false; // Eliminar
      }
      
      // Verificar si es un débito de cuota social del año pero NO se puede eliminar
      const existingDebit = analysis.existingDebits.find(d => d.debitId === m.id);
      if (existingDebit && existingDebit.status !== 'PENDIENTE') {
        skippedDebits.push({
          id: m.id,
          month: existingDebit.month,
          monthText: existingDebit.monthText,
          reason: `Tiene pagos aplicados (status: ${existingDebit.status})`
        });
      }
      
      return true; // Mantener
    });

    const finalCount = db.data.movements.length;
    const actuallyDeleted = initialCount - finalCount;

    if (actuallyDeleted === 0) {
      return NextResponse.json(
        { 
          ok: false, 
          msg: 'No se pudo eliminar ningún débito',
          skipped: skippedDebits
        },
        { status: 400 }
      );
    }

    // Guardar cambios
    await db.write();

    const totalAmount = deletedDebits.reduce((sum, d) => sum + d.amount, 0);

    // Log de auditoría
    console.log(`⚠️  Cuotas anuales revertidas para ${member.codigo} - ${member.nombres} ${member.apellidos}`);
    console.log(`   Año: ${year}`);
    console.log(`   Débitos eliminados: ${deletedDebits.length}`);
    console.log(`   Monto total: Gs. ${totalAmount.toLocaleString('es-PY')}`);

    return NextResponse.json({
      ok: true,
      msg: `Se revirtieron ${deletedDebits.length} débitos de cuota social de ${year}`,
      deleted: deletedDebits,
      totalDeleted: deletedDebits.length,
      totalAmount,
      skipped: skippedDebits
    });

  } catch (error: any) {
    console.error('Error al revertir cuotas anuales:', error);
    return NextResponse.json(
      { ok: false, msg: 'Error al revertir cuotas anuales', error: error.message },
      { status: 500 }
    );
  }
}
