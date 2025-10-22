// 🔧 Funciones utilitarias para la funcionalidad de Portería
// Basado en análisis de app/admin/reservas/page.tsx

import { 
  Reservation, 
  ReservationStatus,
  Service,
  Resource 
} from './db';
import { Venue } from './types';
import {
  PorteriaReservationView,
  ReservationServiceInfo,
  EventInfo,
  ContactInfo,
  StatusInfo,
  PorteriaFilters,
  PORTERIA_STATUS_MAP,
  PORTERIA_EVENT_MAP,
  PORTERIA_CONTACT_MAP
} from './porteria-types';

// 💰 Formatear moneda
export const formatCurrency = (amount: number): string => {
  if (amount === 0) return 'Gs. 0';
  return `Gs. ${Math.abs(amount).toLocaleString('de-DE')}`;
};

// 🕐 Formatear hora
export const formatHour = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
};

// 📅 Formatear fecha
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

// 📅 Formatear fecha compacta (para tabla)
export const formatDateCompact = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short'
  });
};

// 🕒 Calcular tiempo real de finalización con horas extra
export const getActualEndTime = (reservation: Reservation): string => {
  if (!reservation.horaExtra || !reservation.cantidadHorasExtra) {
    return reservation.end;
  }
  
  const endTime = new Date(reservation.end);
  endTime.setHours(endTime.getHours() + (reservation.cantidadHorasExtra || 0));
  return endTime.toISOString();
};

// 🏢 Obtener información del servicio/espacio para una reserva
export const getReservationServiceInfo = (
  reservation: Reservation,
  services: Service[] = [],
  venues: Venue[] = []
): ReservationServiceInfo => {
  // Buscar el servicio por resourceId
  const service = services.find(s => s.id === reservation.resourceId);
  const venue = venues.find(v => v.id === reservation.resourceId);
  
  // Si es un venue directo
  if (venue && !service) {
    return {
      serviceName: venue.nombre,
      spaceName: venue.nombre,
      hasSpace: false,
      service: undefined,
      venue
    };
  }
  
  // Si es un servicio con espacios
  if (service) {
    // En el sistema actual, los servicios no tienen espaciosDisponibles
    // Los espacios se manejan directamente como resources
    return {
      serviceName: service.nombre,
      spaceName: service.nombre,
      hasSpace: false,
      service,
      venue: undefined
    };
  }
  
  // Fallback si no se encuentra nada
  return {
    serviceName: 'Servicio Desconocido',
    spaceName: 'Espacio Desconocido',
    hasSpace: false,
    service: undefined,
    venue: undefined
  };
};

// 🎉 Obtener información del evento
export const getEventInfo = (reservation: Reservation): EventInfo => {
  if (!reservation.acontecimiento) {
    return {
      tipo: null,
      tipoDisplay: '',
      persona: '',
      descripcion: '',
      icono: ''
    };
  }
  
  const eventConfig = PORTERIA_EVENT_MAP[reservation.acontecimiento];
  let persona = '';
  let descripcion = reservation.otrosDescripcion;
  
  switch (reservation.acontecimiento) {
    case '15_anos':
      persona = reservation.quinceaneraFocusNombre || '';
      break;
    case 'boda':
      persona = reservation.noviosNombres || '';
      break;
    case 'cumpleanos':
      persona = reservation.cumpleaneroNombre || '';
      break;
    case 'otros':
      persona = reservation.otrosNombrePersona || '';
      break;
  }
  
  return {
    tipo: reservation.acontecimiento,
    tipoDisplay: eventConfig.display,
    persona,
    descripcion,
    icono: eventConfig.icono
  };
};

// 📞 Obtener información de contacto
export const getContactInfo = (reservation: Reservation): ContactInfo => {
  const contactConfig = PORTERIA_CONTACT_MAP[reservation.medioContacto];
  
  return {
    nombre: reservation.nombreContacto || '',
    telefono: reservation.medioContacto === 'telefono' || reservation.medioContacto === 'whatsapp' 
      ? reservation.contacto 
      : undefined,
    email: reservation.medioContacto === 'email' ? reservation.contacto : undefined,
    medio: reservation.medioContacto,
    medioDisplay: contactConfig.display,
    contactoCompleto: reservation.contacto 
      ? `${contactConfig.display}: ${reservation.contacto}` 
      : ''
  };
};

// 🎨 Obtener información de estilo para un estado
export const getStatusInfo = (status: ReservationStatus): StatusInfo => {
  return PORTERIA_STATUS_MAP[status] || {
    label: status,
    className: 'bg-gray-100 text-gray-800 border-gray-300',
    color: '#374151',
    bgColor: '#f3f4f6'
  };
};

// 🔄 Convertir reserva a vista de portería
export const convertToPorteriaView = (
  reservation: Reservation,
  services: Service[] = [],
  venues: Venue[] = []
): PorteriaReservationView => {
  const serviceInfo = getReservationServiceInfo(reservation, services, venues);
  const eventInfo = getEventInfo(reservation);
  const contactInfo = getContactInfo(reservation);
  
  return {
    ...reservation,
    // Información del servicio/espacio
    serviceName: serviceInfo.serviceName,
    spaceName: serviceInfo.spaceName,
    hasSpace: serviceInfo.hasSpace,
    
    // Información del evento
    eventoDisplay: eventInfo.tipo ? `${eventInfo.icono} ${eventInfo.tipoDisplay}` : '',
    eventoPersona: eventInfo.persona,
    
    // Información de contacto
    contactoDisplay: contactInfo.nombre,
    medioContactoDisplay: contactInfo.contactoCompleto,
    
    // Fechas formateadas
    fechaDisplay: formatDateCompact(reservation.start),
    horarioDisplay: `${formatHour(reservation.start)} - ${formatHour(getActualEndTime(reservation))}`,
    duracionDisplay: reservation.horaExtra && reservation.cantidadHorasExtra 
      ? `+${reservation.cantidadHorasExtra}h extra` 
      : 'Sin horas extra'
  };
};

// 🔍 Filtrar reservas según criterios de portería
export const filterReservations = (
  reservations: Reservation[],
  filters: PorteriaFilters,
  services: Service[] = [],
  venues: Venue[] = []
): Reservation[] => {
  let filtered = [...reservations];
  
  // Filtro por servicios
  if (filters.servicios.length > 0) {
    filtered = filtered.filter(r => {
      const serviceInfo = getReservationServiceInfo(r, services, venues);
      return filters.servicios.some(filtroServicio => 
        serviceInfo.serviceName.toLowerCase().includes(filtroServicio.toLowerCase()) ||
        (serviceInfo.service?.id === filtroServicio)
      );
    });
  }
  
  // Filtro por espacios
  if (filters.espacios.length > 0) {
    filtered = filtered.filter(r => {
      const serviceInfo = getReservationServiceInfo(r, services, venues);
      return filters.espacios.some(filtroEspacio => 
        serviceInfo.spaceName.toLowerCase().includes(filtroEspacio.toLowerCase()) ||
        (serviceInfo.venue?.id === filtroEspacio)
      );
    });
  }
  
  // Filtro por rango de fechas
  if (filters.fechaInicio) {
    const fechaInicio = new Date(filters.fechaInicio);
    filtered = filtered.filter(r => new Date(r.start) >= fechaInicio);
  }
  
  if (filters.fechaFin) {
    const fechaFin = new Date(filters.fechaFin);
    fechaFin.setHours(23, 59, 59, 999); // Final del día
    filtered = filtered.filter(r => new Date(r.start) <= fechaFin);
  }
  
  // Filtro por estados
  if (filters.estados.length > 0) {
    filtered = filtered.filter(r => filters.estados.includes(r.status));
  }
  
  // Filtro por búsqueda
  if (filters.busqueda.trim()) {
    const searchTerm = filters.busqueda.toLowerCase().trim();
    
    filtered = filtered.filter(r => {
      switch (filters.tipoBusqueda) {
        case 'evento':
          const eventInfo = getEventInfo(r);
          return eventInfo.tipoDisplay.toLowerCase().includes(searchTerm) ||
                 eventInfo.persona.toLowerCase().includes(searchTerm);
        
        case 'contacto':
          const contactInfo = getContactInfo(r);
          return contactInfo.nombre.toLowerCase().includes(searchTerm) ||
                 (contactInfo.telefono && contactInfo.telefono.includes(searchTerm)) ||
                 (contactInfo.email && contactInfo.email.toLowerCase().includes(searchTerm));
        
        case 'nombre':
          return (r.nombreContacto || '').toLowerCase().includes(searchTerm);
        
        case 'todos':
        default:
          const serviceInfo = getReservationServiceInfo(r, services, venues);
          const eventInfoAll = getEventInfo(r);
          const contactInfoAll = getContactInfo(r);
          
          return serviceInfo.serviceName.toLowerCase().includes(searchTerm) ||
                 serviceInfo.spaceName.toLowerCase().includes(searchTerm) ||
                 eventInfoAll.tipoDisplay.toLowerCase().includes(searchTerm) ||
                 eventInfoAll.persona.toLowerCase().includes(searchTerm) ||
                 contactInfoAll.nombre.toLowerCase().includes(searchTerm) ||
                 (contactInfoAll.telefono && contactInfoAll.telefono.includes(searchTerm)) ||
                 (r.notas && r.notas.toLowerCase().includes(searchTerm));
      }
    });
  }
  
  return filtered;
};

// 📊 Ordenar reservas según criterio
export const sortReservations = (
  reservations: Reservation[],
  orderBy: PorteriaFilters['ordenarPor'],
  order: PorteriaFilters['orden'],
  services: Service[] = [],
  venues: Venue[] = []
): Reservation[] => {
  const sorted = [...reservations].sort((a, b) => {
    let comparison = 0;
    
    switch (orderBy) {
      case 'fecha':
        comparison = new Date(a.start).getTime() - new Date(b.start).getTime();
        break;
        
      case 'servicio':
        const serviceA = getReservationServiceInfo(a, services, venues);
        const serviceB = getReservationServiceInfo(b, services, venues);
        comparison = serviceA.serviceName.localeCompare(serviceB.serviceName);
        break;
        
      case 'contacto':
        comparison = (a.nombreContacto || '').localeCompare(b.nombreContacto || '');
        break;
        
      case 'evento':
        const eventA = getEventInfo(a);
        const eventB = getEventInfo(b);
        comparison = eventA.tipoDisplay.localeCompare(eventB.tipoDisplay);
        break;
        
      default:
        comparison = 0;
    }
    
    return order === 'desc' ? -comparison : comparison;
  });
  
  return sorted;
};

// 📄 Paginar reservas
export const paginateReservations = (
  reservations: Reservation[],
  page: number,
  perPage: number
): {
  reservations: Reservation[];
  totalPages: number;
  total: number;
} => {
  const total = reservations.length;
  const totalPages = Math.ceil(total / perPage);
  const startIndex = (page - 1) * perPage;
  const endIndex = startIndex + perPage;
  
  return {
    reservations: reservations.slice(startIndex, endIndex),
    totalPages,
    total
  };
};

// 🔍 Validar filtros de portería
export const validatePorteriaFilters = (filters: PorteriaFilters): string[] => {
  const errors: string[] = [];
  
  if (filters.fechaInicio && filters.fechaFin) {
    const inicio = new Date(filters.fechaInicio);
    const fin = new Date(filters.fechaFin);
    
    if (inicio > fin) {
      errors.push('La fecha de inicio no puede ser posterior a la fecha de fin');
    }
    
    // Validar que no sea un rango muy amplio (más de 1 año)
    const diffTime = Math.abs(fin.getTime() - inicio.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 365) {
      errors.push('El rango de fechas no puede ser mayor a 1 año');
    }
  }
  
  if (filters.porPagina < 1 || filters.porPagina > 100) {
    errors.push('La cantidad por página debe estar entre 1 y 100');
  }
  
  if (filters.pagina < 1) {
    errors.push('La página debe ser mayor a 0');
  }
  
  return errors;
};

// 🚀 Crear filtros por defecto para un rango específico
export const createDefaultFiltersForRange = (
  rangeType: 'hoy' | 'semana' | 'mes' | 'personalizado',
  customStart?: string,
  customEnd?: string
): Partial<PorteriaFilters> => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (rangeType) {
    case 'hoy':
      return {
        fechaInicio: today.toISOString().split('T')[0],
        fechaFin: today.toISOString().split('T')[0]
      };
      
    case 'semana':
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      return {
        fechaInicio: startOfWeek.toISOString().split('T')[0],
        fechaFin: endOfWeek.toISOString().split('T')[0]
      };
      
    case 'mes':
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      return {
        fechaInicio: startOfMonth.toISOString().split('T')[0],
        fechaFin: endOfMonth.toISOString().split('T')[0]
      };
      
    case 'personalizado':
      return {
        fechaInicio: customStart || '',
        fechaFin: customEnd || ''
      };
      
    default:
      return {};
  }
};

// 📈 Generar estadísticas rápidas
export const generatePorteriaStats = (
  reservations: Reservation[],
  services: Service[] = [],
  venues: Venue[] = []
) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const reservasHoy = reservations.filter(r => {
    const reservaDate = new Date(r.start);
    return reservaDate.toDateString() === today.toDateString();
  });
  
  const reservasSemana = reservations.filter(r => {
    const reservaDate = new Date(r.start);
    return reservaDate >= startOfWeek && reservaDate <= endOfWeek;
  });
  
  const reservasMes = reservations.filter(r => {
    const reservaDate = new Date(r.start);
    return reservaDate >= startOfMonth;
  });
  
  const reservasActivasHoy = reservasHoy.filter(r => 
    ['ACTIVO', 'CONFIRMED', 'CONFIRMADO'].includes(r.status)
  );
  
  // Próximas reservas (siguientes 7 días)
  const next7Days = new Date(today);
  next7Days.setDate(today.getDate() + 7);
  const proximasReservas = reservations
    .filter(r => {
      const reservaDate = new Date(r.start);
      return reservaDate > now && reservaDate <= next7Days && 
             ['ACTIVO', 'CONFIRMED', 'CONFIRMADO'].includes(r.status);
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 5)
    .map(r => convertToPorteriaView(r, services, venues));
  
  // Servicios más usados (último mes)
  const serviciosCount = new Map<string, { name: string; count: number }>();
  reservasMes.forEach(r => {
    const serviceInfo = getReservationServiceInfo(r, services, venues);
    const key = serviceInfo.service?.id || r.resourceId;
    const existing = serviciosCount.get(key) || { name: serviceInfo.serviceName, count: 0 };
    serviciosCount.set(key, { name: existing.name, count: existing.count + 1 });
  });
  
  const serviciosMasUsados = Array.from(serviciosCount.entries())
    .map(([id, data]) => ({
      servicioId: id,
      serviceName: data.name,
      count: data.count
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  return {
    totalReservasHoy: reservasHoy.length,
    totalReservasSemana: reservasSemana.length,
    totalReservasMes: reservasMes.length,
    reservasActivasHoy: reservasActivasHoy.length,
    proximasReservas,
    serviciosMasUsados
  };
};