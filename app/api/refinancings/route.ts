import { NextRequest, NextResponse } from 'next/server';
import { getDb, nextRefinancingId } from '@/lib/db';
import { Refinancing } from '@/lib/types';

// GET /api/refinancings - List all refinancings
export async function GET(req: NextRequest) {
  const db = await getDb();
  return NextResponse.json(db.data.refinancings || []);
}

// POST /api/refinancings - Create a new refinancing
export async function POST(req: NextRequest) {
  const db = await getDb();
  const data = await req.json();
  const id = await nextRefinancingId();
  const refinancing: Refinancing = { ...data, id };
  db.data.refinancings.push(refinancing);
  await db.write();
  return NextResponse.json(refinancing);
}
