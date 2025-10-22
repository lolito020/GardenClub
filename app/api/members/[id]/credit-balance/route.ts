import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getMemberCreditBalance } from '@/lib/refund-helpers';

/**
 * GET /api/members/[id]/credit-balance
 * Obtiene el saldo de crédito disponible (notas de crédito no utilizadas)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAuth(req);
  const memberId = params.id;

  try {
    const creditBalance = await getMemberCreditBalance(memberId);

    return NextResponse.json({
      memberId,
      creditBalance,
      formatted: `Gs. ${creditBalance.toLocaleString('es-PY')}`
    });

  } catch (error) {
    console.error('Error getting credit balance:', error);
    return NextResponse.json(
      { msg: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}` },
      { status: 500 }
    );
  }
}
