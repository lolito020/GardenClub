import { NextRequest, NextResponse } from 'next/server';
import { convertNoSocioToSocio } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const memberId = params.id;
    const updatedMember = await convertNoSocioToSocio(memberId);
    
    return NextResponse.json({ 
      ok: true, 
      member: updatedMember,
      message: `No-socio convertido a socio con código ${updatedMember.codigo}`
    });
    
  } catch (error) {
    console.error('Error converting no-socio to socio:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Member not found') {
        return NextResponse.json({ 
          ok: false, 
          error: 'Miembro no encontrado' 
        }, { status: 404 });
      }
      
      if (error.message === 'Member is not a no-socio') {
        return NextResponse.json({ 
          ok: false, 
          error: 'El miembro no es un no-socio' 
        }, { status: 400 });
      }
    }
    
    return NextResponse.json({ 
      ok: false, 
      error: 'Error interno del servidor' 
    }, { status: 500 });
  }
}