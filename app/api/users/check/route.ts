import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();
    const userCount = db.data.users.length;
    return NextResponse.json({ userCount, hasUsers: userCount > 0 });
  } catch (error) {
    console.error('Error checking users:', error);
    return NextResponse.json({ userCount: 0, hasUsers: false }, { status: 500 });
  }
}