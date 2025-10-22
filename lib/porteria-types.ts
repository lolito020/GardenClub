// 📋 Tipos específicos para la funcionalidad de Portería
// Basado en análisis de app/admin/reservas/page.tsx

import { Reservation, ReservationStatus, Service } from './db';
import { Venue } from './types';

// 🔍 Tipos de filtros de búsqueda
export type SearchType = 'evento' | 'contacto' | 'nombre' | 'todos';

// 📅 Filtros para la vista "Todas las Reservas" en Portería
export interface PorteriaFilters {
  // Filtro por servicios (múltiple selección)
  servicios: string[];
  
  // Filtro por espacios (múltiple selección)  
  espacios: string[];
  
  // Rango de fechas
  fechaInicio: string;    // ISO date string
  fechaFin: string;       // ISO date string
  
  // Búsqueda libre
  busqueda: string;
  tipoBusqueda: SearchType;
  
  // Estados de reserva (múltiple selección)
  estados: ReservationStatus[];
  
  // Ordenamiento
  ordenarPor: 'fecha' | 'servicio' | 'contacto' | 'evento';
  orden: 'asc' | 'desc';
  
  // Paginación
  pagina: number;
  porPagina: number;
}

// 📊 Datos extendidos de reserva para la tabla de portería
export interface PorteriaReservationView extends Reservation {
  // Información del servicio/espacio calculada
  serviceName: string;
  spaceName: string;
  hasSpace: boolean;
  
  // Información del evento formateada
  eventoDisplay: string;
  eventoPersona: string;
  
  // Información de contacto formateada
  contactoDisplay: string;
  medioContactoDisplay: string;
  
  // Fechas formateadas para display
  fechaDisplay: string;
  horarioDisplay: string;
  duracionDisplay: string;
}

// 🎯 Resultado de la API de reservas para portería
export interface PorteriaReservationsResponse {
  reservas: PorteriaReservationView[];
  total: number;
  pagina: number;
  totalPaginas: number;
  filtrosAplicados: PorteriaFilters;
}

// 📋 Información del servicio y espacio para una reserva
export interface ReservationServiceInfo {
  serviceName: string;
  spaceName: string;  
  hasSpace: boolean;
  service?: Service;
  venue?: Venue;
}

// 🎨 Información de estilo para estados de reserva
export interface StatusInfo {
  label: string;
  className: string;
  color: string;
  bgColor: string;
}

// 📈 Estadísticas rápidas para dashboard de portería
export interface PorteriaStats {
  totalReservasHoy: number;
  totalReservasSemana: number;
  totalReservasMes: number;
  reservasActivasHoy: number;
  proximasReservas: PorteriaReservationView[];
  serviciosMasUsados: {
    servicioId: string;
    serviceName: string;
    count: number;
  }[];
}

// 🔧 Configuración de la tabla de reservas para portería
export interface PorteriaTableConfig {
  mostrarColumnas: {
    fecha: boolean;
    servicio: boolean;
    evento: boolean;
    contacto: boolean;
    acciones: boolean;
  };
  compacta: boolean;
  exportable: boolean;
  seleccionMultiple: boolean;
}

// 📱 Configuración responsive para portería
export interface PorteriaResponsiveConfig {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  columnasVisibles: string[];
}

// 🎯 Props para componentes de filtros de portería
export interface PorteriaFiltersProps {
  filtros: PorteriaFilters;
  onFiltrosChange: (filtros: PorteriaFilters) => void;
  servicios: Service[];
  espacios: Venue[];
  loading?: boolean;
  onReset?: () => void;
}

// 🗃️ Props para la tabla de reservas de portería
export interface PorteriaTableProps {
  reservas: PorteriaReservationView[];
  loading?: boolean;
  config: PorteriaTableConfig;
  responsive: PorteriaResponsiveConfig;
  onReservaClick?: (reserva: PorteriaReservationView) => void;
  onDetallesClick?: (reserva: PorteriaReservationView) => void;
}

// 🎉 Información específica de eventos
export interface EventInfo {
  tipo: '15_anos' | 'boda' | 'cumpleanos' | 'otros' | null;
  tipoDisplay: string;
  persona: string;
  descripcion?: string;
  icono: string;
}

// 📞 Información específica de contacto  
export interface ContactInfo {
  nombre: string;
  telefono?: string;
  email?: string;
  medio: 'telefono' | 'whatsapp' | 'email' | 'presencial' | 'otro';
  medioDisplay: string;
  contactoCompleto: string;
}

// 🚀 Configuración inicial por defecto para filtros de portería
export const DEFAULT_PORTERIA_FILTERS: PorteriaFilters = {
  servicios: [],
  espacios: [],
  fechaInicio: '',
  fechaFin: '',
  busqueda: '',
  tipoBusqueda: 'todos',
  estados: ['ACTIVO'],
  ordenarPor: 'fecha',
  orden: 'desc',
  pagina: 1,
  porPagina: 20
};

// 🎨 Configuración por defecto para la tabla de portería  
export const DEFAULT_PORTERIA_TABLE_CONFIG: PorteriaTableConfig = {
  mostrarColumnas: {
    fecha: true,
    servicio: true,
    evento: true,
    contacto: true,
    acciones: true
  },
  compacta: false,
  exportable: false,
  seleccionMultiple: false
};

// 📋 Mapeo de estados de reserva para portería
export const PORTERIA_STATUS_MAP: Record<ReservationStatus, StatusInfo> = {
  'ACTIVO': {
    label: 'Activo',
    className: 'bg-green-100 text-green-800 border-green-300',
    color: '#065f46',
    bgColor: '#d1fae5'
  },
  'CONFIRMED': {
    label: 'Confirmado', 
    className: 'bg-blue-100 text-blue-800 border-blue-300',
    color: '#1e40af',
    bgColor: '#dbeafe'
  },
  'CONFIRMADO': {
    label: 'Confirmado', 
    className: 'bg-blue-100 text-blue-800 border-blue-300',
    color: '#1e40af',
    bgColor: '#dbeafe'
  },
  'PENDING': {
    label: 'Pendiente',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    color: '#92400e',
    bgColor: '#fef3c7'
  },
  'PENDIENTE': {
    label: 'Pendiente',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    color: '#92400e',
    bgColor: '#fef3c7'
  },
  'CULMINADO': {
    label: 'Culminado',
    className: 'bg-gray-100 text-gray-800 border-gray-300',
    color: '#374151',
    bgColor: '#f3f4f6'
  },
  'CANCELADO': {
    label: 'Cancelado',
    className: 'bg-red-100 text-red-800 border-red-300',
    color: '#dc2626',
    bgColor: '#fee2e2'
  },
  'RESERVADO': {
    label: 'Reservado',
    className: 'bg-purple-100 text-purple-800 border-purple-300',
    color: '#7c3aed',
    bgColor: '#e9d5ff'
  },
  'FINALIZADO': {
    label: 'Finalizado',
    className: 'bg-gray-100 text-gray-800 border-gray-300', 
    color: '#374151',
    bgColor: '#f3f4f6'
  },
  'HOLD': {
    label: 'En Espera',
    className: 'bg-orange-100 text-orange-800 border-orange-300',
    color: '#ea580c', 
    bgColor: '#fed7aa'
  }
};

// 🎯 Mapeo de tipos de evento para portería
export const PORTERIA_EVENT_MAP = {
  '15_anos': {
    display: 'Quinceañera',
    icono: '🎉',
    color: 'text-pink-600'
  },
  'boda': {
    display: 'Boda',
    icono: '💒',
    color: 'text-rose-600'
  },
  'cumpleanos': {
    display: 'Cumpleaños',
    icono: '🎂',
    color: 'text-blue-600'
  },
  'otros': {
    display: 'Otro Evento',
    icono: '🎪',
    color: 'text-purple-600'
  }
} as const;

// 📞 Mapeo de medios de contacto para portería
export const PORTERIA_CONTACT_MAP = {
  'telefono': {
    display: 'Teléfono',
    icono: '📞',
    color: 'text-blue-600'
  },
  'whatsapp': {
    display: 'WhatsApp', 
    icono: '📱',
    color: 'text-green-600'
  },
  'email': {
    display: 'Email',
    icono: '📧',
    color: 'text-gray-600'
  },
  'presencial': {
    display: 'Presencial',
    icono: '🏢',
    color: 'text-indigo-600'
  },
  'otro': {
    display: 'Otro',
    icono: '📋',
    color: 'text-gray-500'
  }
} as const;