import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();
    return NextResponse.json({
      ok: true,
      counts: {
        users: db.data.users.length,
        members: db.data.members.length,
        services: db.data.services.length,
        payments: db.data.payments.length
      },
      sequences: db.data.sequences,
      setupMode: db.data.users.length === 0
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}