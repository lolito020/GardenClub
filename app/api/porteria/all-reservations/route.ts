import { NextRequest, NextResponse } from 'next/server';
import { getDb, Service, Resource } from '@/lib/db';
import { Venue } from '@/lib/types';
import { 
  PorteriaFilters, 
  PorteriaReservationsResponse,
  DEFAULT_PORTERIA_FILTERS 
} from '@/lib/porteria-types';
import {
  filterReservations,
  sortReservations,
  paginateReservations,
  convertToPorteriaView,
  validatePorteriaFilters
} from '@/lib/porteria-utils';

/**
 * 📋 API Endpoint: Todas las Reservas para Portería
 * 
 * GET /api/porteria/all-reservations
 * 
 * Query Parameters:
 * - servicios: string[] (IDs de servicios separados por coma)
 * - espacios: string[] (IDs de espacios separados por coma)
 * - fechaInicio: string (ISO date)
 * - fechaFin: string (ISO date)
 * - busqueda: string (término de búsqueda)
 * - tipoBusqueda: 'evento' | 'contacto' | 'nombre' | 'todos'
 * - estados: ReservationStatus[] (estados separados por coma)
 * - ordenarPor: 'fecha' | 'servicio' | 'contacto' | 'evento'
 * - orden: 'asc' | 'desc'
 * - pagina: number
 * - porPagina: number
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // 🔧 Parsear parámetros de consulta
    const filters: PorteriaFilters = {
      servicios: searchParams.get('servicios')?.split(',').filter(Boolean) || DEFAULT_PORTERIA_FILTERS.servicios,
      espacios: searchParams.get('espacios')?.split(',').filter(Boolean) || DEFAULT_PORTERIA_FILTERS.espacios,
      fechaInicio: searchParams.get('fechaInicio') || DEFAULT_PORTERIA_FILTERS.fechaInicio,
      fechaFin: searchParams.get('fechaFin') || DEFAULT_PORTERIA_FILTERS.fechaFin,
      busqueda: searchParams.get('busqueda') || DEFAULT_PORTERIA_FILTERS.busqueda,
      tipoBusqueda: (searchParams.get('tipoBusqueda') as PorteriaFilters['tipoBusqueda']) || DEFAULT_PORTERIA_FILTERS.tipoBusqueda,
      estados: (searchParams.get('estados')?.split(',') as PorteriaFilters['estados']) || DEFAULT_PORTERIA_FILTERS.estados,
      ordenarPor: (searchParams.get('ordenarPor') as PorteriaFilters['ordenarPor']) || DEFAULT_PORTERIA_FILTERS.ordenarPor,
      orden: (searchParams.get('orden') as PorteriaFilters['orden']) || DEFAULT_PORTERIA_FILTERS.orden,
      pagina: parseInt(searchParams.get('pagina') || '1'),
      porPagina: parseInt(searchParams.get('porPagina') || '20')
    };
    
    // ✅ Validar filtros
    const validationErrors = validatePorteriaFilters(filters);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { 
          error: 'Filtros inválidos', 
          details: validationErrors 
        }, 
        { status: 400 }
      );
    }
    
    // 📊 Cargar datos necesarios
    const db = await getDb();
    const allReservations = db.data.reservations || [];
    const services = db.data.services || [];
    const resources = db.data.resources || [];
    
    // Convertir resources a venues format (para compatibilidad)
    const venues = resources.map(r => ({
      id: r.id,
      nombre: r.nombre,
      descripcion: r.descripcion,
      activo: true
    }));
    
    // 🔍 Filtrar reservas según criterios
    let filteredReservations = filterReservations(allReservations, filters, services, venues);
    
    // 📊 Ordenar reservas
    filteredReservations = sortReservations(filteredReservations, filters.ordenarPor, filters.orden, services, venues);
    
    // 📄 Paginar resultados
    const { reservations: paginatedReservations, totalPages, total } = paginateReservations(
      filteredReservations,
      filters.pagina,
      filters.porPagina
    );
    
    // 🔄 Convertir a vista de portería
    const reservasPorteria = paginatedReservations.map(r => 
      convertToPorteriaView(r, services, venues)
    );
    
    // 📈 Preparar respuesta
    const response: PorteriaReservationsResponse = {
      reservas: reservasPorteria,
      total,
      pagina: filters.pagina,
      totalPaginas: totalPages,
      filtrosAplicados: filters
    };
    
    // 📊 Agregar headers de información
    const responseHeaders = new Headers();
    responseHeaders.set('X-Total-Count', total.toString());
    responseHeaders.set('X-Page', filters.pagina.toString());
    responseHeaders.set('X-Total-Pages', totalPages.toString());
    responseHeaders.set('X-Per-Page', filters.porPagina.toString());
    
    return NextResponse.json(response, { 
      status: 200,
      headers: responseHeaders 
    });
    
  } catch (error) {
    console.error('❌ Error en /api/porteria/all-reservations:', error);
    
    return NextResponse.json(
      { 
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido'
      }, 
      { status: 500 }
    );
  }
}

/**
 * 🔧 API Endpoint auxiliar: Obtener servicios y espacios para filtros
 * 
 * GET /api/porteria/all-reservations?metadata=true
 */
export async function OPTIONS(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    if (searchParams.get('metadata') === 'true') {
      const db = await getDb();
      
      // Servicios activos
      const serviciosDisponibles = (db.data.services || [])
        .filter((s: any) => s.activo)
        .map((s: any) => ({
          id: s.id,
          nombre: s.nombre,
          tipo: s.tipo || 'servicio'
        }));
      
      // Recursos/espacios disponibles
      const espaciosDisponibles = (db.data.resources || [])
        .map((r: any) => ({
          id: r.id,
          nombre: r.nombre,
          descripcion: r.descripcion
        }));
      
      return NextResponse.json({
        servicios: serviciosDisponibles,
        espacios: espaciosDisponibles,
        estadosDisponibles: [
          'ACTIVO',
          'CONFIRMED', 
          'CONFIRMADO',
          'PENDING',
          'PENDIENTE',
          'CULMINADO',
          'CANCELADO',
          'RESERVADO',
          'FINALIZADO',
          'HOLD'
        ],
        tiposBusqueda: [
          { value: 'todos', label: 'Todos los campos' },
          { value: 'evento', label: 'Solo eventos' },
          { value: 'contacto', label: 'Solo contacto' },
          { value: 'nombre', label: 'Solo nombre' }
        ],
        ordenamientos: [
          { value: 'fecha', label: 'Por fecha' },
          { value: 'servicio', label: 'Por servicio' },
          { value: 'contacto', label: 'Por contacto' },
          { value: 'evento', label: 'Por evento' }
        ]
      });
    }
    
    return NextResponse.json({ message: 'Endpoint de metadatos de portería' });
    
  } catch (error) {
    console.error('❌ Error en metadata de /api/porteria/all-reservations:', error);
    
    return NextResponse.json(
      { 
        error: 'Error obteniendo metadatos',
        message: error instanceof Error ? error.message : 'Error desconocido'
      }, 
      { status: 500 }
    );
  }
}