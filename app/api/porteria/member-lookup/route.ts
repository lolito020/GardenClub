import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMemberStatus } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/porteria/member-lookup
 * Endpoint para consulta de portería: busca un socio por CI o código y retorna
 * información completa para portería (sin datos sensibles de pagos)
 */
export async function POST(req: NextRequest) {
  try {
    // Verificar que sea usuario con rol de portería o admin
    const user = await requireAuth(req, ['admin', 'porteria']);
    if (!user) {
      return NextResponse.json(
        { ok: false, msg: 'No autorizado. Acceso solo para portería.' },
        { status: 401 }
      );
    }

    const { ci, codigo } = await req.json();
    
    if (!ci && !codigo) {
      return NextResponse.json(
        { ok: false, msg: 'CI o código de socio requerido' },
        { status: 400 }
      );
    }

    const db = await getDb();
    
    // Buscar el socio por CI o código
    let member = null;
    if (ci) {
      member = db.data.members.find(m => m.ci === ci);
    } else if (codigo) {
      member = db.data.members.find(m => m.codigo === codigo);
    }

    if (!member) {
      return NextResponse.json(
        { ok: false, msg: 'Socio no encontrado' },
        { status: 404 }
      );
    }

    // Calcular estado real basado en movimientos
    const memberMovements = db.data.movements.filter(m => m.memberId === member.id);
    const realStatus = getMemberStatus(member, memberMovements);

    // Obtener servicios activos (suscripciones)
    const memberSubscriptions = db.data.memberSubscriptions.filter(s => s.memberId === member.id && s.status === 'ACTIVE');
    const activeServices = memberSubscriptions.map(sub => {
      const service = db.data.services.find(s => s.id === sub.serviceId);
      return {
        id: sub.serviceId,
        nombre: service?.nombre || 'Servicio desconocido',
        tipo: service?.tipo || 'UNKNOWN',
        fechaInicio: sub.startDate,
        proximoCobro: sub.nextChargeDate,
        periodicidad: sub.periodicity,
        autoDebit: sub.autoDebit
      };
    });

    // Obtener familiares autorizados
    const familyMembers = db.data.families.filter(f => f.socioTitularId === member.id && f.activo);

    // Obtener TODAS las reservas del socio (propias y como tercero)
    const allReservations = db.data.reservations || [];
    
    // Reservas propias (donde es el socio titular)
    const ownReservations = allReservations.filter(r => r.memberId === member.id);
    
    // Reservas como tercero (donde aparece como tercero autorizado)
    const thirdPartyReservations = allReservations.filter(r => 
      r.esParaTercero && 
      (r.terceroCedula === member.ci || 
       r.nombreContacto?.toLowerCase().includes(member.nombres.toLowerCase()) ||
       r.nombreContacto?.toLowerCase().includes(member.apellidos.toLowerCase()))
    );

    // Combinar y ordenar todas las reservas por fecha
    const allMemberReservations = [...ownReservations, ...thirdPartyReservations]
      .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
      .map(reservation => {
        // Obtener información del recurso/espacio
        const resource = db.data.resources?.find(r => r.id === reservation.resourceId);
        
        return {
          id: reservation.id,
          fecha: reservation.start,
          horaInicio: new Date(reservation.start).toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'}),
          horaFin: new Date(reservation.end).toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'}),
          espacio: resource?.nombre || reservation.resourceId,
          nombreContacto: reservation.nombreContacto,
          contacto: reservation.contacto,
          status: reservation.status,
          esPropia: reservation.memberId === member.id,
          esTercero: reservation.esParaTercero && reservation.memberId !== member.id,
          invitados: reservation.invitados,
          acontecimiento: reservation.acontecimiento,
          notas: reservation.notas
        };
      });

    // Preparar información del perfil (sin datos sensibles)
    const memberProfile = {
      id: member.id,
      codigo: member.codigo,
      nombres: member.nombres,
      apellidos: member.apellidos,
      ci: member.ci,
      categoria: member.categoria,
      subcategoria: member.subcategoria,
      telefono: member.telefono,
      celular: member.celular,
      email: member.email,
      direccion: member.direccion,
      foto: member.foto,
      fechaAlta: member.alta,
      estado: realStatus,
      // Estado de deudas (sin montos específicos)
      tieneDeudas: memberMovements.some(m => m.tipo === 'DEBIT' && m.status === 'PENDIENTE'),
      serviciosActivos: activeServices.length,
      observaciones: member.observaciones
    };

    return NextResponse.json({
      ok: true,
      member: memberProfile,
      activeServices,
      familyMembers: familyMembers.map(f => ({
        id: f.id,
        nombres: f.nombres,
        apellidos: f.apellidos,
        ci: f.ci,
        parentesco: f.parentesco,
        telefono: f.telefono,
        email: f.email
      })),
      reservations: allMemberReservations,
      stats: {
        totalReservations: allMemberReservations.length,
        ownReservations: ownReservations.length,
        thirdPartyReservations: thirdPartyReservations.length,
        activeServices: activeServices.length,
        familyMembers: familyMembers.length
      },
      searchedBy: user.email,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in porteria/member-lookup:', error);
    return NextResponse.json(
      { ok: false, msg: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}