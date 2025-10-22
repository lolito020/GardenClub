'use client';

import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useEffect, useMemo, useState, useRef } from 'react';
import { formatCurrency } from '@/lib/utils';
import { getLocalDateString } from '@/lib/timezone-config';
// ...existing code...
import APAFileUploadModal from '@/components/modals/APAFileUploadModal';

type ReservationStatus = 'ACTIVO' | 'CULMINADO' | 'CANCELADO' | 'HOLD' | 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELED';

interface Venue {
  id: string; nombre: string; color?: string; activo: boolean;
  precioBaseHora?: number; garantia?: number; capacidad?: number;
  descripcion?: string;
}
interface Reservation {
  id: string; 
  resourceId: string; // Cambiado de venueId
  memberId?: string;
  nombreContacto: string; // Cambiado de nombreCliente
  contacto: string; // teléfono/email
  medioContacto: 'telefono'|'whatsapp'|'email'|'presencial'|'otro';
  invitados?: number; // Cambiado de asistentes
  start: string; // Cambiado de inicio
  end: string; // Cambiado de fin
  status: ReservationStatus;
  montoTotal: number; // Cambiado de total
  adelanto?: number; // Nuevo campo
  pagado?: number;
  notas?: string;
  pagos?: ReservationPayment[]; // Array de pagos realizados
  debitMovementId?: string; // 🔗 ID del movimiento de débito relacionado
  
  // 🎉 Nuevos campos para datos completos del evento/acontecimiento
  acontecimiento?: string; // quinceañera | boda | cumpleanos | otros
  quinceaneraFocusNombre?: string; // Para quinceañeras
  noviosNombres?: string; // Para bodas
  cumpleaneroNombre?: string; // Para cumpleaños
  otrosDescripcion?: string; // Para otros eventos
  otrosNombrePersona?: string; // Para otros eventos

  // 👤 Reserva para tercero
  esParaTercero?: boolean;
  terceroNombre?: string;
  terceroCedula?: string;
  terceroTelefono?: string;
  terceroRuc?: string;

  // 📝 Información adicional
  cantidadPersonas?: number;
  observacionesGenerales?: string;

  // 🕐 Hora extra
  horaExtra?: boolean;
  cantidadHorasExtra?: number;
  montoHorasExtra?: number;

  // 📋 Requisitos APA
  requiereApa?: boolean;
  apaEstado?: 'PENDIENTE' | 'APROBADO' | 'NO_APLICA' | 'ENTREGADO';
  apaComprobante?: string; // URL del archivo subido
  apaObservaciones?: string; // Comentarios del administrador
  apaFechaEntrega?: string; // Fecha de entrega por el usuario
  apaFechaRevision?: string; // Fecha de revisión por admin
  
  createdAt: string;
  updatedAt: string;
}
interface ReservationPayment {
  id: string; reservationId: string; fecha: string; monto: number; metodo: string;
  numeroRecibo?: string; observaciones?: string;
}

export default function ReservasPage() {
  // Handlers de exportación
  function handleExportExcel() {
    // Exportar los datos filtrados de reservas a Excel
    import('xlsx').then(XLSX => {
      // Preparar los datos para la hoja
      const data = reservas.map(r => {
        // Evento + nombre de persona
        let evento = '';
        if (r.acontecimiento) {
          if (r.acontecimiento === '15_anos') evento = 'Quinceañera';
          else if (r.acontecimiento === 'boda') evento = 'Boda';
          else if (r.acontecimiento === 'cumpleanos') evento = 'Cumpleaños';
          else evento = 'Otro';
        }
        let nombreEvento = r.quinceaneraFocusNombre || r.noviosNombres || r.cumpleaneroNombre || r.otrosNombrePersona || '';
        const eventoCompleto = evento ? (nombreEvento ? `${evento} - ${nombreEvento}` : evento) : '';
        
        // Contacto: nombre - acontecimiento
        let contacto = r.nombreContacto || '';
        let acontecimiento = r.acontecimiento || '';
        // Mapear el acontecimiento al nombre legible
        const acontecimientoDisplay = acontecimiento === '15_anos' ? '15 años' : 
                                       acontecimiento === 'cumpleanos' ? 'Cumpleaños' : 
                                       acontecimiento === 'boda' ? 'Boda' : 
                                       acontecimiento === 'otros' ? 'Otro' : 
                                       acontecimiento;
        const contactoCompleto = acontecimientoDisplay ? `${contacto} - ${acontecimientoDisplay}` : contacto;
        
        return {
          'Fecha': new Date(r.start).toLocaleDateString('es-ES'),
          'Horario': `${formatHour(r.start)} - ${formatHour(r.end)}`,
          'Servicio/Espacio': (() => {
            const info = getReservationServiceInfo(r);
            return info.hasSpace ? `${info.serviceName} - ${info.spaceName}` : info.serviceName;
          })(),
          'Evento': eventoCompleto,
          'Contacto': contactoCompleto,
          'Teléfono': r.contacto || '',
          'Monto': r.montoTotal || 0,
          'Saldo': (r.montoTotal || 0) - (relatedPayments[r.id]?.totalPagado || 0),
          'APA': r.requiereApa ? r.apaEstado || 'Pendiente' : 'No aplica',
        };
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Reservas');
      XLSX.writeFile(wb, `reservas_${new Date().toISOString().slice(0,10)}.xlsx`);
    });
  }

  async function handleExportPDF() {
    // Exportar los datos filtrados de reservas a PDF horizontal A4 usando pdfmake
    try {
      const pdfmake = await import('pdfmake/build/pdfmake');
      const pdfFonts = await import('pdfmake/build/vfs_fonts');
      (pdfmake as any).default.vfs = (pdfFonts as any).default.vfs;

      // Preparar datos para la tabla
      const formatNumber = (num: number) => {
        return num.toLocaleString('de-DE', { minimumFractionDigits: 0 });
      };
      const data = reservas.map(r => {
        // Evento + nombre de persona
        let evento = '';
        if (r.acontecimiento) {
          if (r.acontecimiento === '15_anos') evento = 'Quinceañera';
          else if (r.acontecimiento === 'boda') evento = 'Boda';
          else if (r.acontecimiento === 'cumpleanos') evento = 'Cumpleaños';
          else evento = 'Otro';
        }
        let nombreEvento = r.quinceaneraFocusNombre || r.noviosNombres || r.cumpleaneroNombre || r.otrosNombrePersona || '';
        const eventoCompleto = evento ? (nombreEvento ? `${evento} - ${nombreEvento}` : evento) : '';

        // Contacto: nombre - acontecimiento
        let contacto = r.nombreContacto || '';
        let acontecimiento = r.acontecimiento || '';
        // Mapear el acontecimiento al nombre legible
        const acontecimientoDisplay = acontecimiento === '15_anos' ? '15 años' : 
                                       acontecimiento === 'cumpleanos' ? 'Cumpleaños' : 
                                       acontecimiento === 'boda' ? 'Boda' : 
                                       acontecimiento === 'otros' ? 'Otro' : 
                                       acontecimiento;
        const contactoCompleto = acontecimientoDisplay ? `${contacto} - ${acontecimientoDisplay}` : contacto;

        // Formatear monto y saldo con separador de miles
        const monto = formatNumber(r.montoTotal || 0);
        const saldo = formatNumber((r.montoTotal || 0) - (relatedPayments[r.id]?.totalPagado || 0));

        return [
          new Date(r.start).toLocaleDateString('es-ES'),
          `${formatHour(r.start)} - ${formatHour(r.end)}`,
          (() => {
            const info = getReservationServiceInfo(r);
            return info.hasSpace ? `${info.serviceName} - ${info.spaceName}` : info.serviceName;
          })(),
          eventoCompleto,
          contactoCompleto,
          r.contacto || '',
          monto,
          saldo,
          r.requiereApa ? r.apaEstado || 'Pendiente' : 'No aplica',
        ];
      });

      // Encabezados
      const headers = [
        'Fecha',
        'Horario',
        'Servicio/Espacio',
        'Evento',
        'Contacto',
        'Teléfono',
        'Monto',
        'Saldo',
        'APA',
      ];

      // Documento pdfmake
      const docDefinition = {
        pageOrientation: 'landscape',
        pageSize: 'A4',
        content: [
          { text: 'Reporte de Reservas', style: 'header', alignment: 'center', margin: [0, 0, 0, 10] },
          { text: `Fecha de exportación: ${new Date().toLocaleDateString('es-PY')}`, style: 'subheader', margin: [0, 0, 0, 10] },
          {
            table: {
              headerRows: 1,
              widths: ['auto', 'auto', '*', '*', '*', 'auto', 'auto', 'auto', 'auto'],
              body: [headers, ...data]
            },
            layout: 'lightHorizontalLines',
          }
        ],
        styles: {
          header: { fontSize: 16, bold: true },
          subheader: { fontSize: 10, margin: [0, 2, 0, 2] },
        },
        defaultStyle: {
          fontSize: 7
        }
      };

      // Descargar PDF
      const fileName = `reservas_${new Date().toISOString().slice(0,10)}.pdf`;
      (pdfmake as any).default.createPdf(docDefinition).download(fileName);
    } catch (error) {
      console.error('Error al generar PDF:', error);
      alert('Error al generar el PDF. Verifique que pdfmake esté instalado.');
    }
  }
  const [venues, setVenues] = useState<Venue[]>([]);
  const [reservas, setReservas] = useState<Reservation[]>([]);
  const [allReservas, setAllReservas] = useState<Reservation[]>([]); // Todas las reservas del mes para el calendario
  const [members, setMembers] = useState<{id:string, codigo:string, nombres:string, apellidos:string, subcategoria:string}[]>([]);
  const [services, setServices] = useState<{id:string, nombre:string, precioHoraExtra?:number, espacios?:string[], espaciosDisponibles?:any[]}[]>([]);
  const [loading, setLoading] = useState(true);

  // 🎯 Nuevos filtros para servicios y espacios
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>('');
  
  // filtros antiguos (mantener por compatibilidad)
  const [venueId, setVenueId] = useState<string>('');
  const [q, setQ] = useState<string>('');
  const [searchType, setSearchType] = useState<'contacto' | 'evento'>('contacto');
  
  // filtro de fecha específica
  const [selectedDate, setSelectedDate] = useState<string>('');
  
  // vista de historial
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyReservas, setHistoryReservas] = useState<Reservation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  
  // pagos relacionados 🔗
  const [relatedPayments, setRelatedPayments] = useState<Record<string, { totalPagado: number; pagosCount: number }>>({});

  // calendario (vista mensual simple)
  const [current, setCurrent] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // modales
  const [showModal, setShowModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAPAModal, setShowAPAModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Estados para modal de cancelación
  const [cancelForm, setCancelForm] = useState({
    cancelReason: '', // Texto libre
    refundType: 'TOTAL' as 'NINGUNO' | 'TOTAL' | 'PARCIAL',
    refundAmount: '',
    penaltyAmount: '',
  });
  const [totalPagadoReserva, setTotalPagadoReserva] = useState(0); // Para mostrar en el modal
  const [cancellationPolicies, setCancellationPolicies] = useState<any[]>([]);
  const [form, setForm] = useState({
    resourceId: '',
    fecha: getLocalDateString(),
    inicioHora: '19:00',
    finHora: '23:00',
    memberId: '', // ID del socio/miembro seleccionado
    nombreContacto: '',
    contacto: '',
    medioContacto: 'telefono' as 'telefono' | 'email' | 'whatsapp' | 'presencial' | 'otro',
    invitados: '',
    adelanto: '',
    montoTotal: '',
    status: 'ACTIVO' as ReservationStatus,
    notas: '',
    requiereApa: false, // Campo para APA
    // Campos de evento
    acontecimiento: '',
    quinceaneraFocusNombre: '',
    noviosNombres: '',
    cumpleaneroNombre: '',
    otrosNombrePersona: '',
    otrosDescripcion: '',
    // Campos de tercero
    esParaTercero: false,
    terceroNombre: '',
    terceroCedula: '',
    terceroTelefono: '',
    terceroRuc: '',
    // Campos adicionales
    cantidadPersonas: '',
    observacionesGenerales: '',
    // Campos de hora extra
    horaExtra: false,
    cantidadHorasExtra: 1,
    montoHorasExtra: 0,
    // Campos APA
    apaEstado: 'PENDIENTE',
  });

  // Estados para autocompletado de socios
  const [memberSearch, setMemberSearch] = useState('');
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // menu de fila
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{top: number, left: number} | null>(null);
  
  // tooltip del calendario
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{top: number, left: number} | null>(null);
  const [calendarMode, setCalendarMode] = useState<'year' | 'month'>('year'); // Vista de calendario: año completo o mes individual
  
  const toggleMenu = (id: string, event?: React.MouseEvent) => {
    if (openMenuId === id) {
      setOpenMenuId(null);
      setMenuPosition(null);
      return;
    }

    setOpenMenuId(id);
    if (!event) return;

    // Preferir event.currentTarget (el botón) ya que es más fiable que event.target
    const el = (event.currentTarget || event.target) as HTMLElement;
    const rect = el.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = 120; // Altura estimada del menú
    
    // Calcular posición inicial (debajo y a la izquierda del botón)
    let left = rect.left - menuWidth + rect.width;
    let top = rect.bottom + 4;
    
    // Si no hay espacio a la derecha, alinear hacia la izquierda
    if (left < 8) {
      left = rect.right - menuWidth;
    }
    
    // Si no hay espacio abajo, mostrar arriba
    if (top + menuHeight > window.innerHeight - 8) {
      top = rect.top - menuHeight - 4;
    }
    
    // Asegurar que no se salga de los bordes
    const finalLeft = Math.min(Math.max(left, 8), window.innerWidth - menuWidth - 8);
    const finalTop = Math.max(top, 8);

    setMenuPosition({ top: finalTop, left: finalLeft });
  };

  // Función para manejar hover del calendario
  const handleDayHover = (dayKey: string, event: React.MouseEvent) => {
    // Usar directamente las reservas del día (ya están correctamente filtradas)
    const dayReservations = reservasByDay.get(dayKey) || [];
    if (dayReservations.length === 0) return;

    setHoveredDay(dayKey);

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const tooltipWidth = 450;
    const tooltipHeight = Math.min(dayReservations.length * 40 + 60, 400);

    let left = rect.right + 8;
    let top = rect.top;

    // Si no hay espacio a la derecha, mostrar a la izquierda
    if (left + tooltipWidth > window.innerWidth - 8) {
      left = rect.left - tooltipWidth - 8;
    }

    // Si no hay espacio abajo, ajustar hacia arriba
    if (top + tooltipHeight > window.innerHeight - 8) {
      top = window.innerHeight - tooltipHeight - 8;
    }

    setTooltipPosition({ top, left });
  };

  const handleDayLeave = () => {
    setHoveredDay(null);
    setTooltipPosition(null);
  };

  useEffect(() => { loadVenues(); loadMembers(); loadServices(); }, []);
  useEffect(() => { fetchReservas(); }, [venueId, current, q, searchType, selectedServiceId, selectedSpaceId, selectedDate]);
  useEffect(() => { 
    if (showHistoryModal) {
      fetchHistory(); 
    }
  }, [showHistoryModal]);

  // Cerrar menú de acciones y tooltip al hacer clic fuera o al hacer scroll/resize
  useEffect(() => {
    function handleGlobalClick(e: MouseEvent) {
      const target = e.target as Node;
      // Si hay un menú abierto, cerrarlo cuando se haga click fuera de cualquier botón/menu
      if (openMenuId) {
        // encontrar el botón abierto por id no es trivial aquí, así que cerramos si el target no es botón ni dentro de un botón
        if (!(target instanceof Element && (target.closest('button') || target.closest('.menu-action')))) {
          setOpenMenuId(null);
          setMenuPosition(null);
        }
      }
    }
    function handleGlobalScroll() {
      if (openMenuId) {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
      if (hoveredDay) {
        handleDayLeave();
      }
    }
    function handleGlobalResize() {
      if (openMenuId) {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
      if (hoveredDay) {
        handleDayLeave();
      }
    }
    document.addEventListener('mousedown', handleGlobalClick);
    window.addEventListener('scroll', handleGlobalScroll, true);
    window.addEventListener('resize', handleGlobalResize);
    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('scroll', handleGlobalScroll, true);
      window.removeEventListener('resize', handleGlobalResize);
    };
  }, [openMenuId, hoveredDay]);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowMemberDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadVenues() {
    try {
      const res = await AuthClient.authenticatedFetch('/api/venues');
      const data = await res.json();
      setVenues(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length && !venueId) setVenueId(data[0].id);
    } catch (e) { console.error(e); }
  }

  async function loadMembers() {
    try {
      const res = await AuthClient.authenticatedFetch('/api/members');
      const data = await res.json();
      if (Array.isArray(data)) {
        setMembers(data.map(m => ({
          id: m.id,
          codigo: m.codigo,
          nombres: m.nombres,
          apellidos: m.apellidos,
          subcategoria: m.subcategoria || ''
        })));
      }
    } catch (e) { console.error(e); }
  }

  async function loadServices() {
    try {
      const res = await AuthClient.authenticatedFetch('/api/services');
      const data = await res.json();
      if (Array.isArray(data)) {
        // Filtrar solo servicios que permiten agendamiento
        const reservableServices = data.filter(s => s.permiteAgendamiento === true);
        setServices(reservableServices.map(s => ({
          id: s.id,
          nombre: s.nombre,
          espacios: s.espacios, // estructura antigua
          espaciosDisponibles: s.espaciosDisponibles // estructura nueva
        })));
      }
    } catch (e) { console.error(e); }
  }

  // 🎯 Obtener espacios disponibles de un servicio
  const getServiceSpaces = (serviceId: string) => {
    const service = services.find(s => s.id === serviceId);
    if (!service) return [];
    
    // 1. Usar espaciosDisponibles si existe (nueva estructura)
    if (service.espaciosDisponibles && service.espaciosDisponibles.length > 0) {
      return service.espaciosDisponibles.map(espacio => ({
        id: espacio.id,
        nombre: espacio.nombre
      }));
    }
    
    // 2. Usar espacios si existe (estructura antigua)
    if (service.espacios && service.espacios.length > 0) {
      return service.espacios.map((nombreEspacio, index) => ({
        id: `${serviceId}-espacio-${index}`,
        nombre: nombreEspacio
      }));
    }
    
    // 3. Sin espacios configurados
    return [];
  };

  // 🕒 Función para actualizar estados de reservas automáticamente
  async function updateExpiredReservations() {
    try {
      const res = await AuthClient.authenticatedFetch('/api/reservas/update-expired', {
        method: 'POST',
      });
      
      if (res.ok) {
        const result = await res.json();
        if (result.updatedCount > 0) {
          console.log(`🕒 ${result.message}`);
        }
      }
      
    } catch (error) {
      console.warn('Error actualizando estados de reservas:', error);
    }
  }

  // 🔄 Función para actualización manual con feedback visual
  const [isUpdatingExpired, setIsUpdatingExpired] = useState(false);
  
  async function handleManualUpdateExpired() {
    if (isUpdatingExpired) return;
    
    setIsUpdatingExpired(true);
    try {
      const res = await AuthClient.authenticatedFetch('/api/reservas/update-expired', {
        method: 'POST',
      });
      
      if (res.ok) {
        const result = await res.json();
        if (result.updatedCount > 0) {
          alert(`✅ Se actualizaron ${result.updatedCount} reservas expiradas a estado CULMINADO`);
          // Recargar las reservas para mostrar los cambios
          await fetchReservas();
        } else {
          alert('ℹ️ No hay reservas expiradas para actualizar');
        }
      } else {
        throw new Error('Error en la respuesta del servidor');
      }
    } catch (error) {
      console.error('Error actualizando estados de reservas:', error);
      alert('❌ Error al actualizar estados de reservas');
    } finally {
      setIsUpdatingExpired(false);
    }
  }

  // 🔄 Resetear espacio cuando cambie el servicio
  const handleServiceChange = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    setSelectedSpaceId(''); // Resetear espacio cuando cambie servicio
  };

  // 🏷️ Obtener nombre del servicio/espacio de una reserva
  const getReservationServiceInfo = (reservation: Reservation) => {
    // Buscar en todos los servicios un espacio que coincida con el resourceId
    for (const service of services) {
      // Buscar en espaciosDisponibles (nueva estructura)
      if (service.espaciosDisponibles && service.espaciosDisponibles.length > 0) {
        const espacio = service.espaciosDisponibles.find(e => e.id === reservation.resourceId);
        if (espacio) {
          return { serviceName: service.nombre, spaceName: espacio.nombre, hasSpace: true };
        }
      }
      
      // Buscar en espacios (estructura antigua)
      if (service.espacios && service.espacios.length > 0) {
          // Permitir ambos formatos: 's4-espacio-0' y 'espacio-s4-0'
          const espacioIndex = service.espacios.findIndex((_, index) => {
            const formato1 = `${service.id}-espacio-${index}`;
            const formato2 = `espacio-${service.id}-${index}`;
            return (
              formato1 === reservation.resourceId ||
              formato2 === reservation.resourceId
            );
          });
          if (espacioIndex >= 0) {
            return { serviceName: service.nombre, spaceName: service.espacios[espacioIndex], hasSpace: true };
          }
      }
    }
    
    // 🎯 Nuevo fallback: mapear por patrón del resourceId
    const resourceId = reservation.resourceId;
    if (resourceId) {
      // Detectar formato "servicio-sX" - mapeo directo por ID de servicio
      if (resourceId.startsWith('servicio-')) {
        const serviceId = resourceId.replace('servicio-', '');
        const service = services.find(s => s.id === serviceId);
        if (service) {
          return { serviceName: service.nombre, spaceName: service.nombre, hasSpace: true };
        }
      }
      
      // Detectar servicios por patrón del resourceId
      if (resourceId.includes('tenis')) {
        const tenisService = services.find(s => s.nombre.toLowerCase().includes('tenis'));
        if (tenisService) {
          // Extraer nombre del espacio del resourceId
          const spaceName = resourceId.replace(/^.*?-/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          return { serviceName: tenisService.nombre, spaceName: spaceName || 'Cancha 1', hasSpace: true };
        }
        return { serviceName: 'Tenis', spaceName: 'Cancha 1', hasSpace: true };
      }
      
      if (resourceId.includes('natacion') || resourceId.includes('piscina')) {
        const natacionService = services.find(s => s.nombre.toLowerCase().includes('natación'));
        if (natacionService) {
          const spaceName = resourceId.replace(/^.*?-/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          return { serviceName: natacionService.nombre, spaceName: spaceName || 'Piscina 1', hasSpace: true };
        }
        return { serviceName: 'Natación', spaceName: 'Piscina 1', hasSpace: true };
      }
      
      if (resourceId.includes('salon') || resourceId.includes('social')) {
        const salonService = services.find(s => s.nombre.toLowerCase().includes('salón') || s.nombre.toLowerCase().includes('social'));
        if (salonService) {
          const spaceName = resourceId.replace(/^.*?-/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          return { serviceName: salonService.nombre, spaceName: spaceName || 'Salón Social', hasSpace: true };
        }
        return { serviceName: 'Alquiler Salón Social', spaceName: 'Salón Social', hasSpace: true };
      }
    }
    
    // Fallback: usar venue si no se encuentra servicio
    const venue = venues.find(v => v.id === reservation.resourceId);
    if (venue) {
      return { serviceName: venue.nombre, spaceName: venue.nombre, hasSpace: false };
    }
    
    return { serviceName: 'Servicio no especificado', spaceName: 'Espacio no especificado', hasSpace: false };
  };

  async function fetchReservas() {
    setLoading(true);
    try {
      // PRIMERO: Actualizar reservas expiradas automáticamente
      await updateExpiredReservations();
      
      // rango mes
      const from = new Date(current.getFullYear(), current.getMonth(), 1).toISOString().slice(0,10);
      const to = new Date(current.getFullYear(), current.getMonth()+1, 0).toISOString().slice(0,10);
      const qs = new URLSearchParams();
      
      // 🎯 Filtros por servicio y espacio en lugar de venue
      if (selectedServiceId) {
        // Si hay servicio seleccionado, filtrar por espacios de ese servicio
        const serviceSpaces = getServiceSpaces(selectedServiceId);
        if (selectedSpaceId) {
          // Espacio específico seleccionado
          qs.set('venueId', selectedSpaceId);
        } else if (serviceSpaces.length > 0) {
          // Servicio con espacios: filtrar por todos los espacios del servicio
          const spaceIds = serviceSpaces.map(s => s.id).join(',');
          qs.set('venueIds', spaceIds); // Note: esto requeriría actualizar el API para soportar múltiples IDs
        }
        // Si el servicio no tiene espacios, no filtrar por venue (mostrar todas)
      } else if (venueId) {
        // Fallback: usar filtro de venue si no hay filtro de servicio
        qs.set('venueId', venueId);
      }
      
      if (q) {
        qs.set('q', q);
        qs.set('searchType', searchType);
      }
      
      // Siempre traer todas las reservas del mes para mostrar en el calendario
      // El filtro por fecha específica se hace del lado del cliente
      qs.set('from', from); 
      qs.set('to', to);
      
      // Filtrar solo reservas activas en la vista principal
      qs.set('status', 'ACTIVO');
      const res = await AuthClient.authenticatedFetch(`/api/reservas?${qs.toString()}`);
      const data = await res.json();
      const reservasData = Array.isArray(data) ? data : [];
      
      // Filtrar solo reservas activas del lado del cliente también
      let reservasActivas = reservasData.filter(r => 
        r.status === 'ACTIVO' || r.status === 'ACTIVE' || r.status === 'CONFIRMED' || r.status === 'PENDING'
      );
      
      // Guardar todas las reservas del mes para el calendario
      setAllReservas(reservasActivas);
      
      // Si hay una fecha específica seleccionada, filtrar también del lado del cliente para la tabla
      if (selectedDate) {
        const reservasFiltradas = reservasActivas.filter(r => {
          const reservaDate = new Date(r.start).toISOString().slice(0, 10);
          return reservaDate === selectedDate;
        });
        setReservas(reservasFiltradas);
      } else {
        setReservas(reservasActivas);
      }
      
      // 🔗 Cargar pagos relacionados para cada reserva
      const paymentsData: Record<string, { totalPagado: number; pagosCount: number }> = {};
      for (const reserva of reservasData) {
        if (reserva.debitMovementId && reserva.memberId) {
          paymentsData[reserva.id] = await getRelatedPayments(reserva);
        } else {
          paymentsData[reserva.id] = { totalPagado: reserva.adelanto || 0, pagosCount: 0 };
        }
      }
      setRelatedPayments(paymentsData);
    } catch (e) {
      console.error(e); setReservas([]);
    } finally { setLoading(false); }
  }

  async function fetchHistory() {
    setHistoryLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set('includeHistory', 'true'); // Traer historial (culminadas y canceladas)
      if (historySearch) qs.set('q', historySearch);
      const res = await AuthClient.authenticatedFetch(`/api/reservas?${qs.toString()}`);
      const data = await res.json();
      const historialData = Array.isArray(data) ? data : [];
      // Filtrar solo reservas culminadas y canceladas para el historial
      const reservasHistorial = historialData.filter(r => 
        r.status === 'CULMINADO' || r.status === 'CANCELADO' || 
        r.status === 'COMPLETED' || r.status === 'CANCELED'
      );
      setHistoryReservas(reservasHistorial);
    } catch (e) {
      console.error(e); 
      setHistoryReservas([]);
    } finally { 
      setHistoryLoading(false); 
    }
  }

  // 🔗 Función para obtener pagos relacionados a través del movimiento de débito
  async function getRelatedPayments(reservation: Reservation): Promise<{ totalPagado: number; pagosCount: number }> {
    // Soporta multiple debitMovementIds (servicio + horas extra) o el campo legacy debitMovementId
    const debitIds: string[] = [];
    if (Array.isArray((reservation as any).debitMovementIds) && (reservation as any).debitMovementIds.length) {
      debitIds.push(...(reservation as any).debitMovementIds);
    }
    if (reservation.debitMovementId) debitIds.push(reservation.debitMovementId);

    if (!debitIds.length || !reservation.memberId) {
      return { totalPagado: reservation.adelanto || 0, pagosCount: 0 };
    }

    try {
      // Obtener movimientos del socio para buscar pagos relacionados al débito
      const res = await AuthClient.authenticatedFetch(`/api/members/${reservation.memberId}/movements?pageSize=1000`);
      
      if (!res.ok) {
        console.error(`❌ API Error ${res.status}:`, await res.text());
        return { totalPagado: reservation.adelanto || 0, pagosCount: 0 };
      }
      
      const data = await res.json();
      const movements = Array.isArray(data) ? data : (data.items || []);

      // Buscar pagos que referencien cualquiera de los debitIds de la reserva
      const relatedPayments = movements.filter((mov: any) => 
        mov.tipo === 'CREDIT' && 
        mov.allocations?.some((alloc: any) => debitIds.includes(alloc.debitId))
      );

      // Sumar solo las allocations específicas para este débito, no el monto total del pago
      const totalPagado = relatedPayments.reduce((sum: number, pago: any) => {
        if (!pago.allocations) return sum;
        
        // Sumar solo las allocations que correspondan a cualquiera de los debitIds de la reserva
        const allocationsParaReserva = pago.allocations
          .filter((alloc: any) => debitIds.includes(alloc.debitId))
          .reduce((allocSum: number, alloc: any) => allocSum + Math.abs(alloc.amount || 0), 0);
        
        return sum + allocationsParaReserva;
      }, 0);
      
      const adelantoPago = reservation.adelanto || 0;
      
      return { 
        totalPagado: totalPagado + adelantoPago, 
        pagosCount: relatedPayments.length + (adelantoPago > 0 ? 1 : 0)
      };
    } catch (error) {
      console.error('Error obteniendo pagos relacionados:', error);
      return { totalPagado: reservation.adelanto || 0, pagosCount: 0 };
    }
  }

  // 📋 Función para manejar la actualización del archivo APA
  const handleAPAFileUploaded = async (fileUrl: string, newStatus?: string) => {
    if (!selectedReservation) return;
    
    try {
      // Actualizar la reserva en el estado local inmediatamente
      setReservas(prevReservas => 
        prevReservas.map(r => 
          r.id === selectedReservation.id 
            ? { 
                ...r, 
                apaComprobante: fileUrl, 
                apaEstado: (newStatus as any) || r.apaEstado,
                apaFechaEntrega: newStatus === 'ENTREGADO' ? new Date().toISOString() : r.apaFechaEntrega
              }
            : r
        )
      );
      
      // Actualizar también la reserva seleccionada si está en el modal de detalles
      if (showDetailsModal && selectedReservation) {
        setSelectedReservation(prev => prev ? {
          ...prev,
          apaComprobante: fileUrl,
          apaEstado: (newStatus as any) || prev.apaEstado,
          apaFechaEntrega: newStatus === 'ENTREGADO' ? new Date().toISOString() : prev.apaFechaEntrega
        } : null);
      }
      
      console.log(`✅ Archivo APA actualizado para reserva ${selectedReservation.id}:`, { fileUrl, newStatus });
      
    } catch (error) {
      console.error('Error actualizando estado local después del archivo APA:', error);
    }
  };

  function prevMonth() {
    const d = new Date(current); d.setMonth(d.getMonth()-1); setCurrent(d);
  }
  function nextMonth() {
    const d = new Date(current); d.setMonth(d.getMonth()+1); setCurrent(d);
  }

  // calendario mensual: matriz de días
  // Matriz de meses para mostrar los 12 meses del año
  const monthsMatrix = useMemo(() => {
    const year = current.getFullYear();
    const months: { month: number; matrix: Date[][] }[] = [];
    for (let m = 0; m < 12; m++) {
      const first = new Date(year, m, 1);
      const start = new Date(first); start.setDate(first.getDate() - ((first.getDay()+6)%7)); // lunes
      const weeks: Date[][] = [];
      for (let w=0; w<6; w++) {
        const row: Date[] = [];
        for (let d=0; d<7; d++) {
          const day = new Date(start); day.setDate(start.getDate() + (w*7 + d));
          row.push(new Date(day));
        }
        weeks.push(row);
      }
      months.push({ month: m, matrix: weeks });
    }
    return months;
  }, [current]);

  function dayKey(d: Date) { return d.toISOString().slice(0,10); }

  // reservas por día (solo las que tocan el día) - usar todas las reservas para el calendario
  const reservasByDay = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of allReservas) {
      const i = new Date(r.start), f = new Date(r.end);
      for (let d = new Date(i); d <= f; d.setDate(d.getDate()+1)) {
        const k = dayKey(d);
        const arr = map.get(k) || [];
        if (!arr.find(x => x.id === r.id)) arr.push(r);
        map.set(k, arr);
      }
    }
    return map;
  }, [allReservas]);

  // Función para detectar días con conflictos u ocupación alta
  const getDayStatus = useMemo(() => {
    const statusMap = new Map<string, 'busy' | 'available' | 'conflict' | 'special'>();
    
    for (const [dayKey, dayReservations] of reservasByDay) {
      const activeReservations = dayReservations.filter(r => r.status !== 'CANCELED');
      
      if (activeReservations.length === 0) {
        statusMap.set(dayKey, 'available');
        continue;
      }

      // Verificar si hay reservas especiales (eventos importantes)
      const hasSpecialEvents = activeReservations.some(r => 
        r.acontecimiento === 'boda' || 
        r.acontecimiento === '15_anos' ||
        (r.horaExtra && (r.cantidadHorasExtra || 0) > 2) ||
        (r.requiereApa && r.apaEstado === 'PENDIENTE')
      );

      // Verificar si hay conflictos horarios
      const hasConflicts = activeReservations.some((r1, i) => 
        activeReservations.slice(i + 1).some(r2 => 
          r1.resourceId === r2.resourceId &&
          new Date(r1.start) < new Date(r2.end) && 
          new Date(r1.end) > new Date(r2.start)
        )
      );

      if (hasConflicts) {
        statusMap.set(dayKey, 'conflict');
      } else if (hasSpecialEvents) {
        statusMap.set(dayKey, 'special');
      } else if (activeReservations.length >= 3) {
        statusMap.set(dayKey, 'busy');
      } else {
        statusMap.set(dayKey, 'available');
      }
    }
    
    return statusMap;
  }, [reservasByDay]);

  function statusChip(s: ReservationStatus | string) {
    const base = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shadow-sm';
    
    // Normalizar el valor del status
    let normalizedStatus = s;
    if (s === 'ACTIVE' || s === 'RESERVADO' || s === 'PENDING') {
      normalizedStatus = 'ACTIVO';
    } else if (s === 'COMPLETED') {
      normalizedStatus = 'CULMINADO';  
    } else if (s === 'CANCELED') {
      normalizedStatus = 'CANCELADO';
    }
    
    const styles: Record<string,string> = {
      ACTIVO:'bg-emerald-100 border border-emerald-200 text-emerald-700',
      CULMINADO:'bg-blue-100 border border-blue-200 text-blue-700',
      CANCELADO:'bg-red-100 border border-red-200 text-red-700',
      HOLD:'bg-amber-100 border border-amber-200 text-amber-700',
      PENDING:'bg-slate-100 border border-slate-200 text-slate-700',
      CONFIRMED:'bg-emerald-100 border border-emerald-200 text-emerald-700',
      COMPLETED:'bg-blue-100 border border-blue-200 text-blue-700',
      CANCELED:'bg-red-100 border border-red-200 text-red-700',
    };

    const labels: Record<string,string> = {
      ACTIVO: 'Activo',
      CULMINADO: 'Culminado', 
      CANCELADO: 'Cancelado',
      HOLD: 'En Espera',
      PENDING: 'Pendiente',
      CONFIRMED: 'Confirmada',
      COMPLETED: 'Completada',
      CANCELED: 'Cancelada',
    };

    const icons: Record<string,string> = {
      ACTIVO: '✅',
      CULMINADO: '🏁', 
      CANCELADO: '❌',
      HOLD: '⏳',
      PENDING: '⏱️',
      CONFIRMED: '✅',
      COMPLETED: '🏁',
      CANCELED: '❌',
    };
    
    const statusToUse = normalizedStatus as string;
    const style = styles[statusToUse] || 'bg-slate-100 border border-slate-200 text-slate-700';
    const label = labels[statusToUse] || statusToUse;
    const icon = icons[statusToUse] || '•';
    
    return (
      <span className={`${base} ${style}`}>
        <span className="text-[10px]">{icon}</span>
        <span>{label}</span>
      </span>
    );
  }

  function getStatusInfo(s: ReservationStatus | string) {
    // Normalizar el valor del status
    let normalizedStatus = s;
    if (s === 'ACTIVE' || s === 'RESERVADO' || s === 'PENDING') {
      normalizedStatus = 'ACTIVO';
    } else if (s === 'COMPLETED') {
      normalizedStatus = 'CULMINADO';  
    } else if (s === 'CANCELED') {
      normalizedStatus = 'CANCELADO';
    }
    
    const styles: Record<string,string> = {
      ACTIVO:'bg-emerald-100 border-emerald-300 text-emerald-800',
      CULMINADO:'bg-blue-100 border-blue-300 text-blue-800',
      CANCELADO:'bg-red-100 border-red-300 text-red-800',
      HOLD:'bg-amber-100 border-amber-300 text-amber-800',
      PENDING:'bg-slate-100 border-slate-300 text-slate-800',
      CONFIRMED:'bg-emerald-100 border-emerald-300 text-emerald-800',
      COMPLETED:'bg-blue-100 border-blue-300 text-blue-800',
      CANCELED:'bg-red-100 border-red-300 text-red-800',
    };
    const labels: Record<string,string> = {
      ACTIVO: 'Activo',
      CULMINADO: 'Culminado',
      CANCELADO: 'Cancelado',
      HOLD: 'En Espera',
      PENDING: 'Pendiente',
      CONFIRMED: 'Confirmada',
      COMPLETED: 'Completada',
      CANCELED: 'Cancelada',
    };
    
    const statusToUse = normalizedStatus as string;
    const className = styles[statusToUse] || 'bg-gray-100 border-gray-300 text-gray-800';
    const label = labels[statusToUse] || statusToUse;
    
    return { className, label };
  }

  async function deleteReservationPermanently(id: string) {
    try {
      const response = await AuthClient.authenticatedFetch(`/api/reservas/${id}?permanent=true`, {
        method: 'DELETE',
      });
      if (response.ok) {
        // Recargar historial
        fetchHistory();
      } else {
        alert('Error al eliminar la reserva');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al eliminar la reserva');
    }
  }

  function formatHour(iso: string) {
    const d = new Date(iso);
    return d.toTimeString().slice(0,5);
  }

  // Función helper para calcular la hora real de fin incluyendo horas extra
  function getActualEndTime(reservation: Reservation): string {
    const endDate = new Date(reservation.end);
    
    // Si tiene horas extra, agregamos las horas adicionales
    if (reservation.horaExtra && reservation.cantidadHorasExtra) {
      endDate.setHours(endDate.getHours() + reservation.cantidadHorasExtra);
    }
    
    return endDate.toISOString();
  }

  // Funciones para autocompletado de socios
  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members.slice(0, 10); // Mostrar los primeros 10 si no hay búsqueda
    const search = memberSearch.toLowerCase();
    return members.filter(m => 
      m.nombres.toLowerCase().includes(search) ||
      m.apellidos.toLowerCase().includes(search) ||
      m.codigo.toLowerCase().includes(search)
    ).slice(0, 10); // Limitar a 10 resultados
  }, [memberSearch, members]);

  function selectMember(member: typeof members[0]) {
    setForm(f => ({
      ...f,
      memberId: member.id,
      nombreContacto: `${member.nombres} ${member.apellidos}`
    }));
    setMemberSearch(`${member.nombres} ${member.apellidos} (${member.codigo})`);
    setShowMemberDropdown(false);
  }

  function clearMemberSelection() {
    setForm(f => ({...f, memberId: '', nombreContacto: ''}));
    setMemberSearch('');
  }

  // Funciones para modales avanzados
  function openDetailsModal(reservation: Reservation) {
    setSelectedReservation(reservation);
    setShowDetailsModal(true);
  }

  function openEditModal(reservation: Reservation) {
    setSelectedReservation(reservation);
    // Precargar el formulario con datos de la reserva
    const start = new Date(reservation.start);
    const end = new Date(reservation.end);
    setForm({
      resourceId: reservation.resourceId,
      fecha: start.toISOString().slice(0,10),
      inicioHora: start.toTimeString().slice(0,5),
      finHora: end.toTimeString().slice(0,5),
      memberId: reservation.memberId || '',
      nombreContacto: reservation.nombreContacto || '',
      contacto: reservation.contacto || '',
      medioContacto: reservation.medioContacto || 'telefono',
      invitados: reservation.invitados?.toString() || '',
      adelanto: reservation.adelanto?.toString() || '',
      montoTotal: reservation.montoTotal?.toString() || '',
      status: reservation.status,
      notas: reservation.notas || '',
      requiereApa: reservation.requiereApa || false,
      // Campos de evento
      acontecimiento: reservation.acontecimiento || '',
      quinceaneraFocusNombre: reservation.quinceaneraFocusNombre || '',
      noviosNombres: reservation.noviosNombres || '',
      cumpleaneroNombre: reservation.cumpleaneroNombre || '',
      otrosNombrePersona: reservation.otrosNombrePersona || '',
      otrosDescripcion: reservation.otrosDescripcion || '',
      // Campos de tercero
      esParaTercero: reservation.esParaTercero || false,
      terceroNombre: reservation.terceroNombre || '',
      terceroCedula: reservation.terceroCedula || '',
      terceroTelefono: reservation.terceroTelefono || '',
      terceroRuc: reservation.terceroRuc || '',
      // Campos adicionales
      cantidadPersonas: reservation.cantidadPersonas?.toString() || '',
      observacionesGenerales: reservation.observacionesGenerales || '',
      // Campos de hora extra
      horaExtra: reservation.horaExtra || false,
      cantidadHorasExtra: reservation.cantidadHorasExtra || 1,
      montoHorasExtra: reservation.montoHorasExtra || 0,
      // Campos APA
      apaEstado: reservation.apaEstado || 'PENDIENTE',
    });
    
    // Si hay miembro asociado, cargar su info en el search
    if (reservation.memberId) {
      const member = members.find(m => m.id === reservation.memberId);
      if (member) {
        setMemberSearch(`${member.nombres} ${member.apellidos} (${member.codigo})`);
      }
    } else {
      setMemberSearch('');
    }
    
    setShowEditModal(true);
  }

  function closeModals() {
    setShowDetailsModal(false);
    setShowEditModal(false);
    setShowCancelModal(false);
    setSelectedReservation(null);
    setMemberSearch('');
    setShowMemberDropdown(false);
    setCancelForm({
      cancelReason: '',
      refundType: 'TOTAL',
      refundAmount: '',
      penaltyAmount: '',
    });
    setTotalPagadoReserva(0); // Reset total pagado
  }

  // Función para abrir modal de cancelación (NUEVO SISTEMA MANUAL)
  async function openCancelModal(reservation: Reservation) {
    setSelectedReservation(reservation);
    setShowCancelModal(true);
    
    // Calcular total pagado para mostrar en el modal
    const paymentInfo = await getRelatedPayments(reservation);
    setTotalPagadoReserva(paymentInfo.totalPagado);
    
    // Si no hay pagos, forzar tipo "NINGUNO"
    if (paymentInfo.totalPagado === 0) {
      setCancelForm(prev => ({ ...prev, refundType: 'NINGUNO' }));
    }
  }

  // Función para confirmar cancelación (NUEVO SISTEMA MANUAL)
  async function handleConfirmCancellation() {
    if (!selectedReservation) return;
    
    if (!cancelForm.cancelReason.trim()) {
      alert('Por favor ingrese un motivo para la cancelación');
      return;
    }

    // Validar montos para reembolso parcial
    if (cancelForm.refundType === 'PARCIAL') {
      const refundAmount = parseFloat(cancelForm.refundAmount || '0');
      const penaltyAmount = parseFloat(cancelForm.penaltyAmount || '0');
      
      if (refundAmount <= 0 && penaltyAmount <= 0) {
        alert('Para reembolso parcial debe especificar ambos montos');
        return;
      }

      const total = refundAmount + penaltyAmount;
      if (Math.abs(total - totalPagadoReserva) > 1) {
        alert(`La suma de reembolso (${refundAmount}) + penalización (${penaltyAmount}) debe ser igual al total pagado (${totalPagadoReserva})`);
        return;
      }
    }

    // Mensaje de confirmación
    let confirmMsg = `¿Confirmar cancelación de reserva?\n\nTipo de reembolso: ${cancelForm.refundType}`;
    confirmMsg += `\nTotal reserva: Gs. ${selectedReservation.montoTotal.toLocaleString('es-PY')}`;
    confirmMsg += `\nTotal pagado: Gs. ${totalPagadoReserva.toLocaleString('es-PY')}`;
    
    if (cancelForm.refundType === 'NINGUNO') {
      confirmMsg += `\n\nEl club retendrá: Gs. ${totalPagadoReserva.toLocaleString('es-PY')}`;
    } else if (cancelForm.refundType === 'TOTAL') {
      confirmMsg += `\n\nSe devolverá al socio: Gs. ${totalPagadoReserva.toLocaleString('es-PY')}`;
    } else if (cancelForm.refundType === 'PARCIAL') {
      confirmMsg += `\n\nReembolso al socio: Gs. ${parseFloat(cancelForm.refundAmount || '0').toLocaleString('es-PY')}`;
      confirmMsg += `\nPenalización (club retiene): Gs. ${parseFloat(cancelForm.penaltyAmount || '0').toLocaleString('es-PY')}`;
    }

    if (!confirm(confirmMsg)) return;

    setSaving(true);
    try {
      const payload: any = {
        cancelReason: cancelForm.cancelReason,
        refundType: cancelForm.refundType,
      };

      if (cancelForm.refundType === 'PARCIAL') {
        payload.refundAmount = parseFloat(cancelForm.refundAmount || '0');
        payload.penaltyAmount = parseFloat(cancelForm.penaltyAmount || '0');
      }

      const response = await AuthClient.authenticatedFetch(`/api/reservas/${selectedReservation.id}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.msg || 'Error al cancelar reserva');
      }

      const result = await response.json();
      const details = result.cancellationDetails;
      
      alert(`✅ Reserva cancelada exitosamente\n\n` +
        `Tipo de reembolso: ${details.refundType}\n` +
        `Monto total reserva: Gs. ${details.totalAmount.toLocaleString('es-PY')}\n` +
        `Total pagado: Gs. ${details.totalPagado.toLocaleString('es-PY')}\n` +
        `Reembolso al socio: Gs. ${details.refundAmount.toLocaleString('es-PY')}\n` +
        `Penalización (club retiene): Gs. ${details.penaltyAmount.toLocaleString('es-PY')}\n` +
        `Pagos eliminados: ${details.deletedPayments}\n` +
        `Movimientos creados: ${details.movementsCreated}`
      );

      closeModals();
      await fetchReservas();
    } catch (error) {
      console.error('Error canceling reservation:', error);
      alert(`❌ Error: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setSaving(false);
    }
  }

  // Función para verificar disponibilidad
  async function checkAvailability(resourceId: string, start: Date, end: Date, excludeId?: string): Promise<boolean> {
    try {
      const res = await AuthClient.authenticatedFetch(`/api/reservas/availability`, {
        method: 'POST',
        body: JSON.stringify({
          resourceId,
          start: start.toISOString(),
          end: end.toISOString(),
          excludeId
        })
      });
      
      const data = await res.json();
      return res.ok && data.available;
    } catch (e) {
      console.error('Error checking availability:', e);
      return false;
    }
  }

  // Función para mostrar conflictos
  function showConflictWarning(conflicts: any[]) {
    const conflictList = conflicts.map(c => 
      `• ${c.nombreContacto || 'Sin nombre'} - ${formatHour(c.start)}-${formatHour(c.end)}`
    ).join('\n');
    
    return confirm(`⚠️ CONFLICTO DE HORARIOS\n\nYa hay reservas en este horario:\n${conflictList}\n\n¿Deseas continuar de todas formas?`);
  }

  // Validaciones robustas
  function validateReservationForm(): string[] {
    const errors: string[] = [];
    
    if (!form.resourceId) errors.push('Debe seleccionar un salón');
    if (!form.fecha) errors.push('Debe seleccionar una fecha');
    if (!form.inicioHora) errors.push('Debe especificar hora de inicio');
    if (!form.finHora) errors.push('Debe especificar hora de fin');
    
    if (form.fecha && form.inicioHora && form.finHora) {
      const start = new Date(`${form.fecha}T${form.inicioHora}:00`);
      let end = new Date(`${form.fecha}T${form.finHora}:00`);
      // Si la hora de fin es menor o igual a la de inicio, sumar un día a la fecha de fin
      if (end <= start) {
        end.setDate(end.getDate() + 1);
      }
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        errors.push('Las fechas y horas no son válidas');
      } else {
        // Validar que no sea en el pasado (con margen de 1 hora)
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        if (start < oneHourAgo) {
          errors.push('No se pueden crear reservas en el pasado');
        }
        // Validar duración mínima y máxima
        const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        if (durationHours < 0.5) errors.push('La duración mínima es de 30 minutos');
        if (durationHours > 24) errors.push('La duración máxima es de 24 horas');
      }
    }
    
    // Validar campos numéricos
    if (form.invitados && (isNaN(Number(form.invitados)) || Number(form.invitados) < 0)) {
      errors.push('El número de invitados debe ser válido');
    }
    
    if (form.montoTotal && (isNaN(Number(form.montoTotal)) || Number(form.montoTotal) < 0)) {
      errors.push('El monto total debe ser válido');
    }
    
    if (form.adelanto && (isNaN(Number(form.adelanto)) || Number(form.adelanto) < 0)) {
      errors.push('El adelanto debe ser válido');
    }
    
    if (form.adelanto && form.montoTotal && Number(form.adelanto) > Number(form.montoTotal)) {
      errors.push('El adelanto no puede ser mayor al monto total');
    }
    
    // Validar que tenga al menos un contacto
    if (!form.nombreContacto?.trim() && !form.contacto?.trim()) {
      errors.push('Debe especificar al menos un nombre de contacto o información de contacto');
    }
    
    return errors;
  }

  async function updateReservation() {
    if (!selectedReservation) return;
    
    // Validar formulario
    const validationErrors = validateReservationForm();
    if (validationErrors.length > 0) {
      return alert('Errores en el formulario:\n\n• ' + validationErrors.join('\n• '));
    }

    const start = new Date(`${form.fecha}T${form.inicioHora}:00`);
    const end = new Date(`${form.fecha}T${form.finHora}:00`);

    // Verificar disponibilidad solo si cambió el horario o salón
    const originalStart = new Date(selectedReservation.start);
    const originalEnd = new Date(selectedReservation.end);
    const hasTimeChanged = start.getTime() !== originalStart.getTime() || 
                          end.getTime() !== originalEnd.getTime() ||
                          form.resourceId !== selectedReservation.resourceId;

    if (hasTimeChanged) {
      // Verificar conflictos
      const conflictingReservations = reservas.filter(r => 
        r.id !== selectedReservation.id && 
        r.resourceId === form.resourceId &&
        r.status !== 'CANCELED' &&
        new Date(r.start) < end && 
        new Date(r.end) > start
      );

      if (conflictingReservations.length > 0) {
        if (!showConflictWarning(conflictingReservations)) {
          return; // Usuario decidió no continuar
        }
      }
    }
    
    setSaving(true);
    try {
      // Si requiere APA, aseguramos el estado plano correcto
      // --- INICIO: lógica para hora extra ---
      let montoHorasExtra: number | undefined = undefined;
      let cantidadHorasExtra: number | undefined = undefined;
      // Buscar el servicio y espacio actual
      const currentService = services.find(s => s.id === selectedServiceId);
      let precioHoraExtra: number | undefined = undefined;
      if (currentService) {
        // Buscar espacio seleccionado
        let espacio = undefined;
        if (currentService.espaciosDisponibles && currentService.espaciosDisponibles.length > 0) {
          espacio = currentService.espaciosDisponibles.find(e => e.id === form.resourceId);
          if (espacio && typeof espacio.precioHoraExtra === 'number') {
            precioHoraExtra = espacio.precioHoraExtra;
          }
        }
        // Si no se encontró en espacio, usar el del servicio
        if (typeof precioHoraExtra !== 'number' && typeof currentService.precioHoraExtra === 'number') {
          precioHoraExtra = currentService.precioHoraExtra;
        }
      }
      // Si el usuario activó horaExtra, usar el precio
      if (selectedReservation?.horaExtra) {
        cantidadHorasExtra = selectedReservation.cantidadHorasExtra || 1;
        if (typeof precioHoraExtra === 'number') {
          montoHorasExtra = cantidadHorasExtra * precioHoraExtra;
        }
      }
      // --- FIN lógica hora extra ---

      const payload: any = {
        resourceId: form.resourceId,
        start: start.toISOString(),
        end: end.toISOString(),
        memberId: form.memberId || undefined,
        nombreContacto: form.nombreContacto || undefined,
        contacto: form.contacto || undefined,
        medioContacto: form.medioContacto,
        invitados: form.invitados ? Number(form.invitados) : undefined,
        adelanto: form.adelanto ? Number(form.adelanto) : undefined,
        montoTotal: form.montoTotal ? Number(form.montoTotal) : undefined,
        status: form.status,
        notas: form.notas || undefined,
        // Hora extra
        horaExtra: form.horaExtra || false,
        cantidadHorasExtra: form.horaExtra ? form.cantidadHorasExtra : undefined,
        montoHorasExtra: form.horaExtra ? form.montoHorasExtra : undefined,
        // Campos de evento
        acontecimiento: form.acontecimiento || undefined,
        quinceaneraFocusNombre: form.quinceaneraFocusNombre || undefined,
        noviosNombres: form.noviosNombres || undefined,
        cumpleaneroNombre: form.cumpleaneroNombre || undefined,
        otrosNombrePersona: form.otrosNombrePersona || undefined,
        otrosDescripcion: form.otrosDescripcion || undefined,
        // Campos de tercero
        esParaTercero: form.esParaTercero || false,
        terceroNombre: form.terceroNombre || undefined,
        terceroCedula: form.terceroCedula || undefined,
        terceroTelefono: form.terceroTelefono || undefined,
        terceroRuc: form.terceroRuc || undefined,
        // Campos adicionales
        cantidadPersonas: form.cantidadPersonas ? Number(form.cantidadPersonas) : undefined,
        observacionesGenerales: form.observacionesGenerales || undefined,
      };
      if (form.requiereApa) {
        payload.requiereApa = true;
        payload.apaEstado = form.apaEstado || 'PENDIENTE';
      } else {
        payload.requiereApa = false;
        payload.apaEstado = 'NO_APLICA';
      }
      
      const res = await AuthClient.authenticatedFetch(`/api/reservas/${selectedReservation.id}`, {
        method: 'PATCH', 
        body: JSON.stringify(payload),
      });
      
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error(data);
        return alert(data?.msg || 'No se pudo actualizar la reserva');
      }
      
      alert('Reserva actualizada exitosamente');
      closeModals();
      await fetchReservas();
    } catch (e: any) {
      console.error(e); 
      alert(e?.message || 'Error actualizando reserva');
    } finally { 
      setSaving(false); 
    }
  }

  // Funciones stub para mantener compatibilidad (ya no se usan)
  function closeNew() { /* no-op */ }
  function saveNew() { /* no-op */ }

  // cancelar
  async function cancelReservation(id: string) {
    const reservation = reservas.find(r => r.id === id);
    if (!reservation) {
      alert('No se encontró la reserva');
      return;
    }

    const confirmMessage = `¿Confirmas cancelar esta reserva?\n\n` +
      `📅 Fecha: ${new Date(reservation.start).toLocaleDateString('es-ES')}\n` +
      `⏰ Horario: ${formatHour(reservation.start)} - ${formatHour(reservation.end)}\n` +
      `👤 Cliente: ${reservation.nombreContacto || 'Sin nombre'}\n` +
      `💰 Monto: ${formatCurrency(reservation.montoTotal || 0)}`;

    const ok = confirm(confirmMessage);
    if (!ok) return;
    
    try {
      console.log(`🔄 Cancelando reserva ${id}...`);
      
      const res = await AuthClient.authenticatedFetch(`/api/reservas/${id}`, { 
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData.msg || `Error ${res.status}: ${res.statusText}`;
        throw new Error(errorMessage);
      }
      
      const result = await res.json();
      console.log('✅ Reserva cancelada:', result);
      
      // Mostrar mensaje de éxito
      alert(`✅ Reserva cancelada exitosamente\n\nID: ${id}\nCliente: ${reservation.nombreContacto}`);
      
      // Recargar las reservas
      await fetchReservas();
      
    } catch(e: any) {
      console.error('❌ Error al cancelar reserva:', e);
      alert(`❌ No se pudo cancelar la reserva\n\nError: ${e?.message || 'Error desconocido'}\n\nID de reserva: ${id}`);
    }
  }

  return (
    <AdminLayout>
      <>
      <div className="space-y-6">
        {/* Encabezado */}
        <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Reservas</h1>
              {!loading && (
                <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                  {reservas.length} {reservas.length === 1 ? 'reserva' : 'reservas'}
                </div>
              )}
            </div>
            <p className="text-slate-600 mt-1 text-sm sm:text-base">Gestioná salones, reservas y pagos parciales con facilidad</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowHistoryModal(true)}
              className="inline-flex items-center px-3 sm:px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105"
            >
              {/* History icon restored */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="hidden sm:inline">Historial de Reservas</span>
              <span className="sm:hidden">Historial</span>
            </button>
          </div>
        </div>



        {/* Controles de Navegación del Calendario */}
        <div className="bg-gradient-to-r from-white to-slate-50 p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200 backdrop-blur-sm">
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <button 
                onClick={() => setCalendarMode('year')}
                className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 ${
                  calendarMode === 'year'
                    ? 'bg-white text-slate-900 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Vista anual - Ver todos los 12 meses"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span className="hidden sm:inline">Año Completo</span>
              </button>
              <button 
                onClick={() => setCalendarMode('month')}
                className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 ${
                  calendarMode === 'month'
                    ? 'bg-white text-slate-900 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Vista mensual - Un mes específico"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>
                <span className="hidden sm:inline">Mes Individual</span>
              </button>
            </div>
            <button onClick={prevMonth} className="border border-slate-300 rounded-lg p-2.5 hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 text-slate-600 hover:text-slate-900" title="Mes anterior">
              {/* ChevronLeft icon restored */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            {/* Selector de Mes */}
            <select
              value={current.getMonth()}
              onChange={e => {
                const newMonth = parseInt(e.target.value, 10);
                setCurrent(new Date(current.getFullYear(), newMonth, 1));
              }}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 mr-2"
              aria-label="Seleccionar mes"
              title="Seleccionar mes"
            >
              {Array.from({length: 12}).map((_, i) => (
                <option key={i} value={i}>{new Date(2000, i, 1).toLocaleString('es-ES', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())}</option>
              ))}
            </select>
            {/* Selector de Año */}
            <select
              value={current.getFullYear()}
              onChange={e => {
                const newYear = parseInt(e.target.value, 10);
                setCurrent(new Date(newYear, current.getMonth(), 1));
              }}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
              aria-label="Seleccionar año"
              title="Seleccionar año"
            >
              {(() => {
                const currentYear = new Date().getFullYear();
                // Rango dinámico: desde el año actual hasta 10 años en el futuro
                // Si estamos en 2025, muestra 2025-2035
                // Si estamos en 2030, muestra 2030-2040, etc.
                const startYear = Math.max(2025, currentYear); // Nunca mostrar años anteriores a 2025
                const yearsToShow = 11; // 11 años (actual + 10 futuros)
                
                return Array.from({length: yearsToShow}).map((_, i) => {
                  const year = startYear + i;
                  return <option key={year} value={year}>{year}</option>;
                });
              })()}
            </select>
            <button onClick={nextMonth} className="border border-slate-300 rounded-lg p-2.5 hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 text-slate-600 hover:text-slate-900" title="Mes siguiente">
              {/* ChevronRight icon restored */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        {/* Calendario - Vista anual o mensual */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
          {calendarMode === 'year' ? (
            /* Vista de 12 meses en 3 filas de 4 columnas */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {monthsMatrix.map(({ month, matrix }) => (
                <div key={month} className="border rounded-lg p-3 bg-white shadow-sm">
                  <div className="text-center mb-2">
                    <span className="font-bold text-slate-900 text-sm">{new Date(current.getFullYear(), month).toLocaleString('es-ES', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())}</span>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-xs font-medium text-slate-500 mb-2">
                    {['L','M','X','J','V','S','D'].map(d => <div key={d} className="text-center py-1">{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {matrix.map((row, wi) => (
                      <div key={wi} className="contents">
                        {row.map((day, di) => {
                          const isOther = day.getMonth() !== month;
                          const key = dayKey(day);
                          const dayItems = reservasByDay.get(key) || [];
                          const dayStatus = getDayStatus.get(key);
                          
                          // Colores de fondo para el diseño mejorado
                          let dayBgClass = '';
                          let borderClass = 'border-slate-200';
                          
                          if (!isOther && dayItems.length > 0) {
                            switch (dayStatus) {
                              case 'conflict':
                                dayBgClass = 'bg-gradient-to-br from-red-50 to-red-100';
                                borderClass = 'border-red-300';
                                break;
                              case 'special':
                                dayBgClass = 'bg-gradient-to-br from-purple-50 to-purple-100';
                                borderClass = 'border-purple-300';
                                break;
                              case 'busy':
                                dayBgClass = 'bg-gradient-to-br from-amber-50 to-amber-100';
                                borderClass = 'border-amber-300';
                                break;
                              default:
                                dayBgClass = 'bg-gradient-to-br from-emerald-50 to-emerald-100';
                                borderClass = 'border-emerald-300';
                                break;
                            }
                          }
                          
                          return (
                            <div 
                              key={di} 
                              className={`h-8 border rounded flex items-center justify-center text-xs font-medium cursor-pointer hover:shadow-sm transition-all duration-200 relative ${
                                isOther 
                                  ? 'text-slate-300 bg-slate-50' 
                                  : dayItems.length > 0 
                                    ? `${dayBgClass} ${borderClass} text-slate-700 hover:shadow-md` 
                                    : 'text-slate-600 bg-white hover:bg-slate-50 border-slate-200'
                              } ${selectedDate === key ? 'ring-2 ring-blue-600 bg-blue-100 border-blue-400 shadow-md' : ''}`}
                              title={!isOther ? (
                                selectedDate === key ? 
                                  `${dayItems.length} reserva(s) - Clic para quitar filtro` : 
                                  (dayItems.length > 0 ? `${dayItems.length} reserva(s) - Clic para filtrar` : 'Clic para ver reservas de este día')
                              ) : ''}
                              onClick={!isOther ? () => {
                                // Si la fecha ya está seleccionada, quitarla (toggle)
                                if (selectedDate === key) {
                                  setSelectedDate('');
                                } else {
                                  setSelectedDate(key);
                                }
                              } : undefined}
                              onMouseEnter={!isOther && dayItems.length > 0 ? (e) => handleDayHover(key, e) : undefined}
                              onMouseLeave={handleDayLeave}
                            >
                              <span className="relative">
                                {day.getDate()}
                                {!isOther && dayItems.length > 0 && (
                                  <span className="absolute -top-1 -right-1 min-w-[12px] h-3 bg-blue-500 rounded-full text-[8px] text-white flex items-center justify-center px-0.5 font-bold">
                                    {dayItems.length > 9 ? '9+' : dayItems.length}
                                  </span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Vista de un solo mes */
            <div className="max-w-4xl mx-auto">
              <div className="border rounded-lg p-4 bg-white shadow-sm">
                <div className="text-center mb-4">
                  <span className="font-bold text-slate-900 text-xl">{current.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}</span>
                </div>
                <div className="grid grid-cols-7 gap-2 text-sm font-medium text-slate-500 mb-3">
                  {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map(d => <div key={d} className="text-center py-2">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {monthsMatrix.find(m => m.month === current.getMonth())?.matrix.map((row, wi) => (
                    <div key={wi} className="contents">
                      {row.map((day, di) => {
                        const isCurrentMonth = day.getMonth() === current.getMonth();
                        const key = dayKey(day);
                        const dayItems = reservasByDay.get(key) || [];
                        const dayStatus = getDayStatus.get(key);
                        
                        // Colores de fondo para el diseño mejorado
                        let dayBgClass = '';
                        let borderClass = 'border-slate-200';
                        
                        if (isCurrentMonth && dayItems.length > 0) {
                          switch (dayStatus) {
                            case 'conflict':
                              dayBgClass = 'bg-gradient-to-br from-red-50 to-red-100';
                              borderClass = 'border-red-300';
                              break;
                            case 'special':
                              dayBgClass = 'bg-gradient-to-br from-purple-50 to-purple-100';
                              borderClass = 'border-purple-300';
                              break;
                            case 'busy':
                              dayBgClass = 'bg-gradient-to-br from-amber-50 to-amber-100';
                              borderClass = 'border-amber-300';
                              break;
                            default:
                              dayBgClass = 'bg-gradient-to-br from-emerald-50 to-emerald-100';
                              borderClass = 'border-emerald-300';
                              break;
                          }
                        }
                        
                        return (
                          <div 
                            key={di} 
                            className={`h-16 border rounded-lg flex flex-col items-center justify-center text-sm font-medium cursor-pointer hover:shadow-sm transition-all duration-200 relative ${
                              !isCurrentMonth
                                ? 'text-slate-300 bg-slate-50' 
                                : dayItems.length > 0 
                                  ? `${dayBgClass} ${borderClass} text-slate-700 hover:shadow-md` 
                                  : 'text-slate-600 bg-white hover:bg-slate-50 border-slate-200'
                            } ${selectedDate === key ? 'ring-2 ring-blue-600 bg-blue-100 border-blue-400 shadow-md' : ''}`}
                            title={isCurrentMonth ? (
                              selectedDate === key ? 
                                `${dayItems.length} reserva(s) - Clic para quitar filtro` : 
                                (dayItems.length > 0 ? `${dayItems.length} reserva(s) - Clic para filtrar` : 'Clic para ver reservas de este día')
                            ) : ''}
                            onClick={isCurrentMonth ? () => {
                              // Si la fecha ya está seleccionada, quitarla (toggle)
                              if (selectedDate === key) {
                                setSelectedDate('');
                              } else {
                                setSelectedDate(key);
                              }
                            } : undefined}
                            onMouseEnter={isCurrentMonth && dayItems.length > 0 ? (e) => handleDayHover(key, e) : undefined}
                            onMouseLeave={handleDayLeave}
                          >
                            <span className="relative text-lg">
                              {day.getDate()}
                              {isCurrentMonth && dayItems.length > 0 && (
                                <span className="absolute -top-2 -right-2 min-w-[16px] h-4 bg-blue-500 rounded-full text-[10px] text-white flex items-center justify-center px-1 font-bold">
                                  {dayItems.length > 9 ? '9+' : dayItems.length}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 🎯 Filtros para Reservas Activas */}
        <div className="bg-gradient-to-r from-white to-slate-50 p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200 space-y-4 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-4 sm:items-end backdrop-blur-sm">
          <div className="min-w-[180px]">
            <label className="text-sm font-semibold text-slate-700 mb-2 block">Servicios</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <select 
                value={selectedServiceId} 
                onChange={(e) => handleServiceChange(e.target.value)} 
                className="w-full border border-slate-300 rounded-lg pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 appearance-none bg-white hover:border-slate-400 hover:shadow-sm"
              >
                <option value="">Todos los servicios</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
          
          {/* 🎯 Campo Espacios - Solo se muestra si hay un servicio seleccionado y tiene espacios */}
          {selectedServiceId && getServiceSpaces(selectedServiceId).length > 0 && (
            <div className="min-w-[180px]">
              <label className="text-sm font-semibold text-slate-700 mb-2 block">Espacios</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <select 
                  value={selectedSpaceId} 
                  onChange={(e) => setSelectedSpaceId(e.target.value)} 
                  className="w-full border border-slate-300 rounded-lg pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 appearance-none bg-white hover:border-slate-400 hover:shadow-sm"
                >
                  <option value="">Todos los espacios</option>
                  {getServiceSpaces(selectedServiceId).map(space => (
                    <option key={space.id} value={space.id}>{space.nombre}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          )}
          
          <div className="min-w-[160px]">
            <label className="text-sm font-semibold text-slate-700 mb-2 block">Fecha específica</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <input 
                type="date"
                value={selectedDate} 
                onChange={(e)=> setSelectedDate(e.target.value)} 
                className="w-full border border-slate-300 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white hover:border-slate-400 hover:shadow-sm" 
              />
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  title="Limpiar fecha"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-semibold text-slate-700 mb-2 block">Buscar</label>
            <div className="flex gap-2">
              {/* Selector de tipo de búsqueda */}
              <div className="w-32">
                <select 
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value as 'contacto' | 'evento')}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white hover:border-slate-400 hover:shadow-sm"
                >
                  <option value="contacto">Contacto</option>
                  <option value="evento">Evento</option>
                </select>
              </div>
              
              {/* Campo de búsqueda */}
              <div className="relative flex-1">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input 
                  value={q} 
                  onChange={(e)=> setQ(e.target.value)} 
                  placeholder={searchType === 'contacto' ? "Buscar por cliente, teléfono, email..." : "Buscar por tipo de evento, descripción..."} 
                  className="w-full border border-slate-300 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white hover:border-slate-400 hover:shadow-sm" 
                />
                {q && (
                  <button
                    onClick={() => setQ('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    title="Limpiar búsqueda"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Listado */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Botones de exportación */}
          <div className="flex flex-wrap gap-2 items-center justify-end px-4 pt-4 pb-2">
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition-colors text-sm font-semibold"
            >
              Excel
            </button>
            <button
              onClick={handleExportPDF}
              className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg shadow hover:bg-red-700 transition-colors text-sm font-semibold"
            >
              PDF
            </button>
          </div>
          {loading ? (
            <div className="p-12 text-center">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="relative">
                  <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-semibold text-slate-700">Cargando reservas</p>
                  <p className="text-sm text-slate-500">Obteniendo información actualizada...</p>
                </div>
              </div>
            </div>
          ) : reservas.length === 0 ? (
            <div className="p-12 text-center">
              <div className="flex flex-col items-center justify-center space-y-6">
                <div className="relative">
                  <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
                  </div>
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" fill="none"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35" /></svg>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-slate-700">Sin reservas para este período</h3>
                  <p className="text-slate-500 max-w-md mx-auto">
                    No se encontraron reservas con los filtros actuales. Las nuevas reservas aparecerán aquí automáticamente.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <span>Tip: Intenta cambiar los filtros o el período de fechas</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                  <tr className="text-xs uppercase tracking-wide text-slate-700">
                    <th className="px-3 sm:px-6 py-4 text-left font-bold">
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Fecha & Horario
                      </div>
                    </th>
                    <th className="hidden lg:table-cell px-6 py-4 text-left font-bold">
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        Servicio/Espacio
                      </div>
                    </th>
                    <th className="hidden lg:table-cell px-6 py-4 text-left font-bold">
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                        </svg>
                        Evento
                      </div>
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-left font-bold">
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Contacto
                      </div>
                    </th>
                    <th className="hidden lg:table-cell px-6 py-4 text-left font-bold">
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                        </svg>
                        Monto
                      </div>
                    </th>
                    <th className="hidden lg:table-cell px-6 py-4 text-left font-bold">
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Saldo
                      </div>
                    </th>
                    <th className="hidden sm:table-cell px-6 py-4 text-center font-bold">
                      <div className="flex items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        APA
                      </div>
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-right font-bold">
                      <div className="flex items-center justify-end gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                        Acciones
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {reservas.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-all duration-200 hover:shadow-sm border-b border-slate-100">
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <div className="flex items-center gap-2">
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-bold text-slate-900">
                              {new Date(r.start).toLocaleDateString('es-ES', { 
                                day: '2-digit', 
                                month: 'short' 
                              })}
                            </div>
                            <div className="text-xs text-slate-600">
                              {formatHour(r.start)}–{formatHour(getActualEndTime(r))}
                              <span className="text-slate-400 ml-1">
                                ({r.horaExtra && r.cantidadHorasExtra ? `${r.cantidadHorasExtra}h` : '0h'})
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden lg:table-cell px-6 py-4">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {(() => {
                              const serviceInfo = getReservationServiceInfo(r);
                              return (
                                <div>
                                  <div className="font-semibold text-slate-900">{serviceInfo.serviceName}</div>
                                  {serviceInfo.hasSpace && serviceInfo.spaceName !== serviceInfo.serviceName && (
                                    <div className="text-xs text-slate-500">{serviceInfo.spaceName}</div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </td>
                      <td className="hidden lg:table-cell px-6 py-4">
                        {r.acontecimiento ? (
                          <div>
                            <div className="text-sm font-medium capitalize text-slate-900">
                              {r.acontecimiento === '15_anos' ? 'Quinceañera' : 
                               r.acontecimiento === 'boda' ? 'Boda' : 
                               r.acontecimiento === 'cumpleanos' ? 'Cumpleaños' : 'Otro'}
                            </div>
                            <div className="text-xs text-slate-500 truncate max-w-[120px]">
                              {r.quinceaneraFocusNombre || r.noviosNombres || r.cumpleaneroNombre || r.otrosNombrePersona || ''}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs italic text-slate-400">Sin especificar</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <div className="flex items-center gap-1 sm:gap-2">
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{r.nombreContacto || '—'}</div>
                            <div className="sm:hidden text-[10px] text-slate-500">
                              {(() => {
                                const serviceInfo = getReservationServiceInfo(r);
                                return serviceInfo.serviceName === serviceInfo.spaceName 
                                  ? serviceInfo.serviceName 
                                  : `${serviceInfo.serviceName} - ${serviceInfo.spaceName}`;
                              })()}
                            </div>
                            {r.esParaTercero && (
                              <div className="md:hidden text-[10px] text-purple-600 font-medium">
                                👤 Para: {r.terceroNombre}
                              </div>
                            )}
                            {r.acontecimiento && (
                              <div className="text-[10px] text-blue-600 font-medium">
                                Evento especial: {
                                  r.acontecimiento === '15_anos' ? '15 años' : 
                                  r.acontecimiento === 'cumpleanos' ? 'Cumpleaños' : 
                                  r.acontecimiento === 'boda' ? 'Boda' : 
                                  r.acontecimiento === 'otros' ? 'Otro' : 
                                  r.acontecimiento
                                }
                              </div>
                            )}
                            <div className="text-xs text-slate-500">
                              {r.contacto ? `${r.medioContacto}: ${r.contacto}` : '—'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden lg:table-cell px-6 py-4 text-sm">
                        <div className="space-y-1">
                          <div className="font-semibold text-slate-900">
                            {formatCurrency(r.montoTotal || 0)}
                          </div>
                          {Number(r.adelanto) > 0 ? (
                            <div className="text-xs text-green-600 font-medium">
                              Adelanto: {formatCurrency(Number(r.adelanto))}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="hidden lg:table-cell px-6 py-4 text-sm">
                        <div className="space-y-1">
                          <div className="font-semibold text-amber-700">
                            {formatCurrency((r.montoTotal || 0) - (relatedPayments[r.id]?.totalPagado || 0))}
                          </div>
                          {relatedPayments[r.id]?.totalPagado > 0 && (
                            <div className="text-xs text-green-600 font-medium">
                              Pagado: {formatCurrency(relatedPayments[r.id].totalPagado)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-6 py-4 text-center">
                        {r.requiereApa ? (
                          <div className="flex flex-col items-center gap-1">
                            <button 
                              onClick={() => {
                                setSelectedReservation(r);
                                setShowAPAModal(true);
                              }}
                              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium transition-all duration-200 hover:scale-105 cursor-pointer ${
                                r.apaEstado === 'APROBADO' ? 'bg-green-100 text-green-800 hover:bg-green-200' :
                                r.apaEstado === 'ENTREGADO' ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' :
                                'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                              }`}
                              title={
                                r.apaEstado === 'APROBADO' ? 'APA Aprobado - Clic para gestionar' :
                                r.apaEstado === 'ENTREGADO' ? 'APA Entregado - Clic para gestionar' :
                                'APA Pendiente - Clic para gestionar'
                              }
                            >
                              {r.apaEstado === 'APROBADO' ? '✅' :
                               r.apaEstado === 'ENTREGADO' ? '📤' :
                               '⏳'}
                            </button>
                            {r.apaComprobante && (
                              <a
                                href={r.apaComprobante}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800"
                                title="Ver comprobante APA"
                              >
                                Ver archivo
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">No aplica</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <div className="group relative">
                            <button 
                              onClick={() => openDetailsModal(r)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-sm"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-10">
                              Ver detalles completos
                            </div>
                          </div>
                          <div className="group relative">
                            <button 
                              onClick={() => openEditModal(r)}
                              className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-sm"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-10">
                              Editar información
                            </div>
                          </div>
                          <div className="group relative">
                            <button 
                              onClick={() => openCancelModal(r)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-sm"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                            <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-10">
                              Cancelar reserva
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal de Edición */}
        {showEditModal && selectedReservation && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={closeModals}>
            <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold text-slate-800">Editar Reserva</h3>
                <button onClick={closeModals} className="text-gray-400 hover:text-gray-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4 space-y-4">
                {/* Información básica - 3 columnas */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Servicio/Espacio *</label>
                    <select 
                      value={form.resourceId} 
                      onChange={(e) => setForm(p => ({...p, resourceId: e.target.value}))}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Seleccionar —</option>
                      {venues.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fecha *</label>
                    <input 
                      type="date" 
                      value={form.fecha} 
                      onChange={(e) => setForm(p => ({...p, fecha: e.target.value}))}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Horario</label>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <input 
                        type="time" 
                        value={form.inicioHora} 
                        onChange={(e) => setForm(p => ({...p, inicioHora: e.target.value}))}
                        className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm"
                        placeholder="Inicio"
                      />
                      <input 
                        type="time" 
                        value={form.finHora} 
                        onChange={(e) => setForm(p => ({...p, finHora: e.target.value}))}
                        className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm"
                        placeholder="Fin"
                      />
                    </div>
                  </div>
                </div>

                {/* Contacto */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contacto</label>
                    <input 
                      type="text" 
                      value={form.nombreContacto} 
                      onChange={(e) => setForm(p => ({...p, nombreContacto: e.target.value}))}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Nombre del contacto"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Teléfono</label>
                    <input 
                      type="text" 
                      value={form.contacto} 
                      onChange={(e) => setForm(p => ({...p, contacto: e.target.value}))}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Número de teléfono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Estado</label>
                    <select 
                      value={form.status || 'ACTIVO'} 
                      onChange={(e) => setForm(p => ({...p, status: e.target.value as any}))}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="ACTIVO">Activo</option>
                      <option value="CONFIRMED">Confirmado</option>
                      <option value="PENDING">Pendiente</option>
                      <option value="CULMINADO">Culminado</option>
                      <option value="CANCELADO">Cancelado</option>
                    </select>
                  </div>
                </div>

                {/* Información financiera */}
                <div className="bg-slate-50 rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">💰 Información Financiera</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs text-gray-500">Monto Total (Gs.)</label>
                      <input 
                        type="text" 
                        value={form.montoTotal ? parseInt(form.montoTotal).toLocaleString('de-DE') : ''} 
                        onChange={(e) => {
                          const value = e.target.value.replace(/\./g, '');
                          if (/^\d*$/.test(value)) {
                            setForm(p => ({...p, montoTotal: value}));
                          }
                        }}
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Pagos Realizados (Gs.)</label>
                      <p className="mt-1 text-sm font-medium text-gray-900 py-2">
                        {formatCurrency(relatedPayments[selectedReservation.id]?.totalPagado || 0)}
                        {relatedPayments[selectedReservation.id]?.pagosCount > 0 && selectedReservation.montoTotal && (
                          <span className="text-gray-500 text-xs ml-1">
                            ({Math.round((relatedPayments[selectedReservation.id].totalPagado / selectedReservation.montoTotal) * 100)}%)
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Saldo</label>
                      <p className="mt-1 text-sm font-bold text-amber-700 py-2">
                        {formatCurrency(Math.max(0, (parseInt(form.montoTotal.replace(/\./g, '')) || 0) - (relatedPayments[selectedReservation.id]?.totalPagado || 0)))}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Información del evento */}
                <div className="bg-blue-50 rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">🎉 Información del Evento</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-blue-600">Tipo de Evento</label>
                      <select 
                        value={form.acontecimiento || ''} 
                        onChange={(e) => setForm(p => ({...p, acontecimiento: e.target.value}))}
                        className="mt-1 w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Sin evento específico</option>
                        <option value="15_anos">Quinceañera</option>
                        <option value="boda">Boda</option>
                        <option value="cumpleanos">Cumpleaños</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-blue-600">Nombre de la persona</label>
                      <input 
                        type="text" 
                        value={form.quinceaneraFocusNombre || form.noviosNombres || form.cumpleaneroNombre || form.otrosNombrePersona || ''} 
                        onChange={(e) => {
                          const value = e.target.value;
                          setForm(p => {
                            const newForm = {...p};
                            if (form.acontecimiento === '15_anos') newForm.quinceaneraFocusNombre = value;
                            else if (form.acontecimiento === 'boda') newForm.noviosNombres = value;
                            else if (form.acontecimiento === 'cumpleanos') newForm.cumpleaneroNombre = value;
                            else newForm.otrosNombrePersona = value;
                            return newForm;
                          });
                        }}
                        className="mt-1 w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Nombre de la quinceañera, novios, etc."
                      />
                    </div>
                  </div>
                  {form.acontecimiento === 'otro' && (
                    <div className="mt-2">
                      <label className="text-xs text-blue-600">Descripción del evento</label>
                      <input 
                        type="text" 
                        value={form.otrosDescripcion || ''} 
                        onChange={(e) => setForm(p => ({...p, otrosDescripcion: e.target.value}))}
                        className="mt-1 w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Describe el tipo de evento"
                      />
                    </div>
                  )}
                </div>

                {/* Información de tercero */}
                <div className="bg-purple-50 rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                    👤 Reserva para Tercero
                    <label className="flex items-center text-xs">
                      <input 
                        type="checkbox" 
                        checked={form.esParaTercero || false}
                        onChange={(e) => setForm(p => ({...p, esParaTercero: e.target.checked}))}
                        className="mr-1"
                      />
                      Es para tercero
                    </label>
                  </h4>
                  {form.esParaTercero && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-purple-600">Nombre</label>
                        <input 
                          type="text" 
                          value={form.terceroNombre || ''} 
                          onChange={(e) => setForm(p => ({...p, terceroNombre: e.target.value}))}
                          className="mt-1 w-full px-3 py-2 border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="Nombre del tercero"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-purple-600">Cédula</label>
                        <input 
                          type="text" 
                          value={form.terceroCedula || ''} 
                          onChange={(e) => setForm(p => ({...p, terceroCedula: e.target.value}))}
                          className="mt-1 w-full px-3 py-2 border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="Número de cédula"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-purple-600">Teléfono</label>
                        <input 
                          type="text" 
                          value={form.terceroTelefono || ''} 
                          onChange={(e) => setForm(p => ({...p, terceroTelefono: e.target.value}))}
                          className="mt-1 w-full px-3 py-2 border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="Teléfono del tercero"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-purple-600">RUC</label>
                        <input 
                          type="text" 
                          value={form.terceroRuc || ''} 
                          onChange={(e) => setForm(p => ({...p, terceroRuc: e.target.value}))}
                          className="mt-1 w-full px-3 py-2 border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="RUC del tercero"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Información adicional */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-green-50 rounded-lg p-3">
                    <h4 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">📝 Info Adicional</h4>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-green-600">Cantidad de Personas</label>
                        <input 
                          type="number" 
                          value={form.cantidadPersonas || ''} 
                          onChange={(e) => setForm(p => ({...p, cantidadPersonas: e.target.value}))}
                          className="mt-1 w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="Número de invitados"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-green-600">Observaciones</label>
                        <textarea 
                          value={form.observacionesGenerales || ''} 
                          onChange={(e) => setForm(p => ({...p, observacionesGenerales: e.target.value}))}
                          className="mt-1 w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                          rows={2}
                          placeholder="Observaciones generales"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Hora extra y APA */}
                  <div className="bg-amber-50 rounded-lg p-3">
                    <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">🔧 Extras y Requisitos</h4>
                    <div className="space-y-2">
                      <label className="flex items-center text-xs text-amber-600">
                        <input 
                          type="checkbox" 
                          checked={form.horaExtra || false}
                          onChange={(e) => setForm(p => ({...p, horaExtra: e.target.checked}))}
                          className="mr-2"
                        />
                        Requiere horas extra
                      </label>
                      {form.horaExtra && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-amber-600">Cantidad (horas)</label>
                            <input 
                              type="number" 
                              value={form.cantidadHorasExtra || 1} 
                              onChange={(e) => setForm(p => ({...p, cantidadHorasExtra: parseInt(e.target.value)}))}
                              className="mt-1 w-full px-2 py-1 border border-amber-300 rounded-md text-sm"
                              min="1"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-amber-600">Monto Extra (Gs.)</label>
                            <input 
                              type="text" 
                              value={form.montoHorasExtra ? parseInt(form.montoHorasExtra.toString()).toLocaleString('de-DE') : '0'} 
                              onChange={(e) => {
                                const value = e.target.value.replace(/\./g, '');
                                if (/^\d*$/.test(value)) {
                                  setForm(p => ({...p, montoHorasExtra: parseInt(value) || 0}));
                                }
                              }}
                              className="mt-1 w-full px-2 py-1 border border-amber-300 rounded-md text-sm"
                            />
                          </div>
                        </div>
                      )}
                      <label className="flex items-center text-xs text-amber-600">
                        <input 
                          type="checkbox" 
                          checked={form.requiereApa || false}
                          onChange={(e) => setForm(p => ({...p, requiereApa: e.target.checked}))}
                          className="mr-2"
                        />
                        Requiere APA
                      </label>
                      {form.requiereApa && (
                        <div>
                          <label className="text-xs text-amber-600">Estado APA</label>
                          <select 
                            value={form.apaEstado || 'PENDIENTE'} 
                            onChange={(e) => setForm(p => ({...p, apaEstado: e.target.value}))}
                            className="mt-1 w-full px-2 py-1 border border-amber-300 rounded-md text-sm"
                          >
                            <option value="PENDIENTE">Pendiente</option>
                            <option value="ENTREGADO">Entregado</option>
                            <option value="APROBADO">Aprobado</option>
                            <option value="RECHAZADO">Rechazado</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Notas */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">📝 Notas</label>
                  <textarea 
                    value={form.notas} 
                    onChange={(e) => setForm(p => ({...p, notas: e.target.value}))}
                    className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Notas adicionales sobre la reserva"
                  />
                </div>
              </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
              <button 
                onClick={closeModals} 
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => updateReservation()} 
                disabled={saving} 
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 inline animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M4 12a8 8 0 018-8" />
                    </svg>
                    Actualizando…
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Actualizar Reserva
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalles */}
      {showDetailsModal && selectedReservation && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={closeModals}>
          <div className="w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-white rounded-lg shadow" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-800">📋 Detalles de Reserva</h3>
              <button onClick={closeModals} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors" aria-label="Cerrar">
                {/* X icon restored */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 space-y-3">
              {/* Información básica - 3 columnas compactas */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
                <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Servicio/Espacio</label>
              <p className="text-sm font-medium text-gray-900">{(() => {
                const serviceInfo = getReservationServiceInfo(selectedReservation);
                return serviceInfo.hasSpace ? `${serviceInfo.serviceName} - ${serviceInfo.spaceName}` : serviceInfo.serviceName;
              })()}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fecha</label>
                  <p className="text-sm font-medium text-gray-900">{new Date(selectedReservation.start).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Horario</label>
                  <p className="text-sm font-medium text-gray-900">
                    {formatHour(selectedReservation.start)} - {formatHour(getActualEndTime(selectedReservation))}
                    <span className="text-gray-500 text-xs ml-1">
                      ({selectedReservation.horaExtra && selectedReservation.cantidadHorasExtra ? `+${selectedReservation.cantidadHorasExtra}h extra` : 'Sin horas extra'})
                    </span>
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contacto</label>
                  <p className="text-sm font-medium text-gray-900">{selectedReservation.nombreContacto || '—'}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Medio</label>
                  <p className="text-sm text-gray-700">
                    {selectedReservation.contacto ? 
                      `${selectedReservation.medioContacto}: ${selectedReservation.contacto}` : '—'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Estado</label>
                  <div className="mt-0.5">
                    {statusChip(selectedReservation.status)}
                  </div>
                </div>
              </div>

              {/* Información financiera - 4 columnas */}
              <div className="bg-slate-50 rounded-lg p-3">
                <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">💰 Información Financiera</h4>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
                  <div>
                    <label className="text-xs text-gray-500">Monto Total</label>
                    <p className="text-sm font-bold text-gray-900">{formatCurrency(selectedReservation.montoTotal || 0)}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Pagos Realizados</label>
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(relatedPayments[selectedReservation.id]?.totalPagado || 0)}
                      {relatedPayments[selectedReservation.id]?.pagosCount > 0 && selectedReservation.montoTotal && (
                        <span className="text-gray-500 text-xs ml-1">
                          ({Math.round((relatedPayments[selectedReservation.id].totalPagado / selectedReservation.montoTotal) * 100)}%)
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Saldo</label>
                    <p className="text-sm font-bold text-amber-700">
                      {formatCurrency((selectedReservation.montoTotal || 0) - (relatedPayments[selectedReservation.id]?.totalPagado || 0))}
                    </p>
                  </div>
                </div>
              </div>
              {/* Información combinada de eventos, terceros, extras y APA */}
              <div className="space-y-3">
                {/* 🎉 Evento */}
                {selectedReservation.acontecimiento && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                      🎉 Información del Evento
                    </h4>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
                      <div>
                        <label className="text-xs text-blue-600">Tipo</label>
                        <p className="text-sm font-medium text-blue-900 capitalize">
                          {selectedReservation.acontecimiento === '15_anos' ? 'Quinceañera' : 
                           selectedReservation.acontecimiento === 'boda' ? 'Boda' : 
                           selectedReservation.acontecimiento === 'cumpleanos' ? 'Cumpleaños' : 'Otro'}
                        </p>
                      </div>
                      {selectedReservation.quinceaneraFocusNombre && (
                        <div>
                          <label className="text-xs text-blue-600">Quinceañera</label>
                          <p className="text-sm text-blue-900">{selectedReservation.quinceaneraFocusNombre}</p>
                        </div>
                      )}
                      {selectedReservation.noviosNombres && (
                        <div>
                          <label className="text-xs text-blue-600">Novios</label>
                          <p className="text-sm text-blue-900">{selectedReservation.noviosNombres}</p>
                        </div>
                      )}
                      {selectedReservation.cumpleaneroNombre && (
                        <div>
                          <label className="text-xs text-blue-600">Cumpleañero/a</label>
                          <p className="text-sm text-blue-900">{selectedReservation.cumpleaneroNombre}</p>
                        </div>
                      )}
                      {selectedReservation.otrosNombrePersona && (
                        <div>
                          <label className="text-xs text-blue-600">Contacto evento</label>
                          <p className="text-sm text-blue-900">{selectedReservation.otrosNombrePersona}</p>
                        </div>
                      )}
                    </div>
                    {selectedReservation.otrosDescripcion && (
                      <div className="mt-2">
                        <label className="text-xs text-blue-600">Descripción</label>
                        <p className="text-sm text-blue-900">{selectedReservation.otrosDescripcion}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 👤 Tercero */}
                {selectedReservation.esParaTercero && (
                  <div className="bg-purple-50 rounded-lg p-3">
                    <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                      👤 Reserva para Tercero
                    </h4>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1">
                      {selectedReservation.terceroNombre && (
                        <div>
                          <label className="text-xs text-purple-600">Nombre</label>
                          <p className="text-sm font-medium text-purple-900">{selectedReservation.terceroNombre}</p>
                        </div>
                      )}
                      {selectedReservation.terceroCedula && (
                        <div>
                          <label className="text-xs text-purple-600">Cédula</label>
                          <p className="text-sm text-purple-900">{selectedReservation.terceroCedula}</p>
                        </div>
                      )}
                      {selectedReservation.terceroTelefono && (
                        <div>
                          <label className="text-xs text-purple-600">Teléfono</label>
                          <p className="text-sm text-purple-900">{selectedReservation.terceroTelefono}</p>
                        </div>
                      )}
                      {selectedReservation.terceroRuc && (
                        <div>
                          <label className="text-xs text-purple-600">RUC</label>
                          <p className="text-sm text-purple-900">{selectedReservation.terceroRuc}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 📝 Información adicional, 🕐 Hora extra, 📋 APA - Todo en una fila */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {/* Información adicional */}
                  {(selectedReservation.cantidadPersonas || selectedReservation.observacionesGenerales) && (
                    <div className="bg-green-50 rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">📝 Info Adicional</h4>
                      <div className="space-y-1">
                        {selectedReservation.cantidadPersonas && (
                          <div>
                            <label className="text-xs text-green-600">Personas</label>
                            <p className="text-sm font-medium text-green-900">{selectedReservation.cantidadPersonas}</p>
                          </div>
                        )}
                        {selectedReservation.observacionesGenerales && (
                          <div>
                            <label className="text-xs text-green-600">Observaciones</label>
                            <p className="text-sm text-green-900">{selectedReservation.observacionesGenerales}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Hora extra y APA juntos */}
                  {(selectedReservation.horaExtra || selectedReservation.requiereApa) && (
                    <div className="bg-amber-50 rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">🔧 Extras y Requisitos</h4>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {selectedReservation.horaExtra && (
                          <>
                            <div>
                              <label className="text-xs text-amber-600">Horas Extra</label>
                              <p className="text-sm font-medium text-amber-900">{selectedReservation.cantidadHorasExtra || 0}h</p>
                            </div>
                            <div>
                              <label className="text-xs text-amber-600">Monto Extra</label>
                              <p className="text-sm font-bold text-amber-900">{formatCurrency(selectedReservation.montoHorasExtra || 0)}</p>
                            </div>
                          </>
                        )}
                        {selectedReservation.requiereApa && (
                          <>
                            <div className="col-span-2">
                              <label className="text-xs text-amber-600">Estado APA</label>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  selectedReservation.apaEstado === 'APROBADO' ? 'bg-green-100 text-green-800' :
                                  selectedReservation.apaEstado === 'ENTREGADO' ? 'bg-blue-100 text-blue-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {selectedReservation.apaEstado === 'APROBADO' ? '✅ Aprobado' :
                                   selectedReservation.apaEstado === 'ENTREGADO' ? '📤 Entregado' :
                                   '⏳ Pendiente'}
                                </span>
                                <button
                                  onClick={() => setShowAPAModal(true)}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-amber-600 text-white text-xs rounded-md hover:bg-amber-700 transition-colors"
                                >
                                  {/* FileText icon removed for corporate look */}
                                  Gestionar
                                </button>
                              </div>
                              {selectedReservation.apaComprobante && (
                                <div className="mt-1">
                                  <a
                                    href={selectedReservation.apaComprobante}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                  >
                                    {/* Eye icon removed for corporate look */}
                                    Ver comprobante
                                  </a>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notas - si existen */}
              {selectedReservation.notas && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">📝 Notas</label>
                  <p className="text-sm text-gray-700 mt-1">{selectedReservation.notas}</p>
                </div>
              )}

              {/* Información de creación/actualización - compacta */}
              <div className="text-xs text-gray-500 pt-2 border-t border-gray-200 grid grid-cols-2 gap-4">
                <div>
                  <span className="font-medium">Creada:</span> {new Date(selectedReservation.createdAt).toLocaleDateString()}
                </div>
                <div>
                  <span className="font-medium">Actualizada:</span> {new Date(selectedReservation.updatedAt).toLocaleDateString()}
                </div>
              </div>
            </div>
            
            <div className="p-3 border-t bg-slate-50 flex justify-end gap-2">
              <button onClick={closeModals} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors">
                Cerrar
              </button>
              <button 
                onClick={() => {closeModals(); openEditModal(selectedReservation);}} 
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
              >
                Editar Reserva
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Historial */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowHistoryModal(false)}>
          <div className="w-full max-w-6xl bg-white rounded-lg shadow max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">📋 Historial de Reservas</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Reservas culminadas y canceladas
                  </p>
                </div>
                <button 
                  onClick={() => setShowHistoryModal(false)} 
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Filtros */}
              <div className="mb-4">
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Buscar en historial
                    </label>
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && fetchHistory()}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Buscar por contacto, notas, etc..."
                    />
                  </div>
                  <button
                    onClick={fetchHistory}
                    disabled={historyLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {historyLoading ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
              </div>

              {/* Tabla de Historial */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Fecha</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Servicio/Espacio</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Contacto</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Monto</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">APA</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Estado</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-600">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {historyLoading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12">
                          <div className="flex flex-col items-center justify-center space-y-3">
                            {/* Loader2 icon removed for corporate look */}
                            <p className="text-sm font-medium text-slate-600">Cargando historial...</p>
                          </div>
                        </td>
                      </tr>
                    ) : historyReservas.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                          No se encontraron reservas en el historial
                        </td>
                      </tr>
                    ) : (
                      historyReservas.map(r => {
                        const serviceInfo = getReservationServiceInfo(r);
                        const d = new Date(r.start);
                        return (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2">
                              <div className="text-sm font-medium">{d.toLocaleDateString()}</div>
                              <div className="text-xs text-gray-500">
                                {formatHour(r.start)}–{formatHour(getActualEndTime(r))}
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <div className="text-sm font-medium">{serviceInfo.serviceName}</div>
                              {serviceInfo.serviceName !== serviceInfo.spaceName && (
                                <div className="text-xs text-gray-500">{serviceInfo.spaceName}</div>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              <div className="text-sm font-medium">{r.nombreContacto || '—'}</div>
                              {r.contacto && (
                                <div className="text-xs text-gray-500">{r.medioContacto}: {r.contacto}</div>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              <div className="text-sm font-medium text-gray-900">
                                {formatCurrency(r.montoTotal || 0)}
                              </div>
                              {Number(r.adelanto) > 0 && (
                                <div className="text-xs text-green-600">
                                  Adelanto: {formatCurrency(Number(r.adelanto))}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {r.requiereApa ? (
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  r.apaEstado === 'APROBADO' ? 'bg-green-100 text-green-800' :
                                  r.apaEstado === 'ENTREGADO' ? 'bg-blue-100 text-blue-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {r.apaEstado === 'APROBADO' ? '✅' :
                                   r.apaEstado === 'ENTREGADO' ? '📤' :
                                   '⏳'}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`border px-2 py-0.5 rounded text-xs font-medium ${getStatusInfo(r.status).className}`}>
                                {getStatusInfo(r.status).label}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button
                                onClick={() => {
                                  if (confirm('¿Estás seguro de eliminar permanentemente esta reserva del historial?')) {
                                    deleteReservationPermanently(r.id);
                                  }
                                }}
                                className="text-red-600 hover:text-red-800 text-sm font-medium"
                              >
                                Eliminar
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Menú de acciones flotante */}
      {openMenuId && menuPosition && (
        <div
          className="menu-action"
          style={{
            position: 'fixed',
            top: menuPosition.top,
            left: menuPosition.left,
            minWidth: '12rem',
            background: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
            border: '1px solid #e5e7eb',
            zIndex: 9999,
          }}
        >
          <button
            onClick={() => { 
              setOpenMenuId(null); 
              setMenuPosition(null); 
              const reservation = reservas.find(r => r.id === openMenuId);
              if (reservation) openDetailsModal(reservation);
            }}
            className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors duration-200"
          >
            {/* Eye icon removed for corporate look */}
            Ver Detalles
          </button>
          <button
            onClick={() => { 
              setOpenMenuId(null); 
              setMenuPosition(null); 
              const reservation = reservas.find(r => r.id === openMenuId);
              if (reservation) openEditModal(reservation);
            }}
            className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm text-blue-600 hover:bg-blue-50 transition-colors duration-200"
          >
            {/* Edit3 icon removed for corporate look */}
            Editar
          </button>
          <button
            onClick={() => { 
              setOpenMenuId(null); 
              setMenuPosition(null); 
              const reservation = reservas.find(r => r.id === openMenuId);
              if (reservation) openCancelModal(reservation);
            }}
            className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors duration-200 border-t border-slate-100"
          >
            {/* XCircle icon removed for corporate look */}
            Cancelar Reserva
          </button>
        </div>
      )}

      {/* Tooltip del calendario */}
      {hoveredDay && tooltipPosition && (
        <div
          className="fixed bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-4"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            width: '450px',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-slate-900">
              {new Date(hoveredDay + 'T00:00:00').toLocaleDateString('es-ES', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long' 
              })}
            </h4>
            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full font-medium">
              {reservasByDay.get(hoveredDay)?.length || 0} reservas
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto space-y-2">
            {(reservasByDay.get(hoveredDay) || []).map(r => {
              const serviceInfo = getReservationServiceInfo(r);
              const statusInfo = getStatusInfo(r.status);
              
              // Determinar el nombre del espacio a mostrar
              const espacioNombre = serviceInfo.serviceName === serviceInfo.spaceName 
                ? serviceInfo.serviceName 
                : (serviceInfo.hasSpace ? serviceInfo.spaceName : serviceInfo.serviceName);
              
              // Determinar el evento si existe
              const eventoTexto = r.acontecimiento 
                ? (r.acontecimiento === '15_anos' ? '🎉 Quinceañera' : 
                   r.acontecimiento === 'boda' ? '🎉 Boda' : 
                   r.acontecimiento === 'cumpleanos' ? '🎉 Cumpleaños' : '🎉 Evento')
                : null;
              
              return (
                <div 
                  key={r.id} 
                  className="border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 cursor-pointer transition-colors duration-200"
                  onClick={() => {
                    handleDayLeave();
                    openDetailsModal(r);
                  }}
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-medium text-slate-900 truncate">{espacioNombre}</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-600 whitespace-nowrap">
                        {formatHour(r.start)} - {formatHour(getActualEndTime(r))}
                      </span>
                      {eventoTexto && (
                        <>
                          <span className="text-slate-400">•</span>
                          <span className="text-blue-600 truncate">{eventoTexto}</span>
                        </>
                      )}
                    </div>
                    <span className={`border px-2 py-0.5 rounded-md text-xs font-medium ml-2 whitespace-nowrap ${statusInfo.className}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Modal APA File Upload */}
      {showAPAModal && selectedReservation && (
        <APAFileUploadModal
          reservationId={selectedReservation.id}
          currentFile={selectedReservation.apaComprobante}
          currentStatus={selectedReservation.apaEstado}
          isAdmin={true} // TODO: Verificar rol de usuario actual
          onClose={() => {
            setShowAPAModal(false);
            setSelectedReservation(null);
          }}
          onFileUploaded={handleAPAFileUploaded}
        />
      )}

      {/* 💳 Modal de Cancelación y Reembolso */}
      {showCancelModal && selectedReservation && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={closeModals}>
          <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-red-50">
              <h3 className="text-lg font-semibold text-red-800 flex items-center gap-2">
                ❌ Cancelar Reserva
              </h3>
              <button 
                onClick={closeModals} 
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Información de la reserva */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h4 className="font-semibold text-slate-700 mb-2">Datos de la Reserva</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-500">Espacio:</span>
                    <p className="font-medium">{(() => {
                      const serviceInfo = getReservationServiceInfo(selectedReservation);
                      return serviceInfo.hasSpace ? `${serviceInfo.serviceName} - ${serviceInfo.spaceName}` : serviceInfo.serviceName;
                    })()}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Fecha:</span>
                    <p className="font-medium">{new Date(selectedReservation.start).toLocaleDateString('es-ES')}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Contacto:</span>
                    <p className="font-medium">{selectedReservation.nombreContacto}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Monto Total:</span>
                    <p className="font-bold text-lg">{formatCurrency(selectedReservation.montoTotal)}</p>
                  </div>
                </div>
              </div>

              {/* Formulario de cancelación (NUEVO SISTEMA MANUAL) */}
              <div className="space-y-4">
                {/* Motivo de cancelación */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Motivo de Cancelación *
                  </label>
                  <textarea
                    value={cancelForm.cancelReason}
                    onChange={(e) => setCancelForm(prev => ({ ...prev, cancelReason: e.target.value }))}
                    placeholder="Explique el motivo de la cancelación..."
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Tipo de reembolso */}
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-slate-700 mb-3">
                    Tipo de Reembolso *
                  </label>
                  <div className="space-y-3">
                    {/* Opción: Sin reembolso */}
                    <label className="flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
                           style={{ borderColor: cancelForm.refundType === 'NINGUNO' ? '#dc2626' : '#e2e8f0' }}>
                      <input
                        type="radio"
                        name="refundType"
                        value="NINGUNO"
                        checked={cancelForm.refundType === 'NINGUNO'}
                        onChange={(e) => setCancelForm(prev => ({ ...prev, refundType: 'NINGUNO', refundAmount: '', penaltyAmount: '' }))}
                        className="mt-1 w-4 h-4 text-red-600"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">Sin Reembolso</div>
                        <p className="text-xs text-slate-600 mt-1">
                          El club retiene todo lo pagado: {formatCurrency(totalPagadoReserva)}. Se crea un débito de penalización.
                        </p>
                        {totalPagadoReserva < selectedReservation.montoTotal && (
                          <p className="text-xs text-amber-600 mt-1">
                            ⚠️ Total reserva: {formatCurrency(selectedReservation.montoTotal)} | Pagado: {formatCurrency(totalPagadoReserva)}
                          </p>
                        )}
                      </div>
                    </label>

                    {/* Opción: Reembolso total */}
                    <label className={`flex items-start gap-3 p-3 border-2 rounded-lg transition-colors ${
                      totalPagadoReserva === 0 
                        ? 'opacity-50 cursor-not-allowed bg-slate-100' 
                        : 'cursor-pointer hover:bg-slate-50'
                    }`}
                           style={{ borderColor: cancelForm.refundType === 'TOTAL' ? '#16a34a' : '#e2e8f0' }}>
                      <input
                        type="radio"
                        name="refundType"
                        value="TOTAL"
                        checked={cancelForm.refundType === 'TOTAL'}
                        onChange={(e) => setCancelForm(prev => ({ ...prev, refundType: 'TOTAL', refundAmount: '', penaltyAmount: '' }))}
                        disabled={totalPagadoReserva === 0}
                        className="mt-1 w-4 h-4 text-green-600 disabled:opacity-50"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">Reembolso Total</div>
                        <p className="text-xs text-slate-600 mt-1">
                          {totalPagadoReserva === 0 
                            ? '❌ No disponible: No hay pagos registrados' 
                            : `Se devuelve todo lo pagado: ${formatCurrency(totalPagadoReserva)} al socio. El club no retiene nada.`
                          }
                        </p>
                        {totalPagadoReserva > 0 && totalPagadoReserva < selectedReservation.montoTotal && (
                          <p className="text-xs text-amber-600 mt-1">
                            ⚠️ Total reserva: {formatCurrency(selectedReservation.montoTotal)} | Pagado: {formatCurrency(totalPagadoReserva)}
                          </p>
                        )}
                      </div>
                    </label>

                    {/* Opción: Reembolso parcial */}
                    <label className={`flex items-start gap-3 p-3 border-2 rounded-lg transition-colors ${
                      totalPagadoReserva === 0 
                        ? 'opacity-50 cursor-not-allowed bg-slate-100' 
                        : 'cursor-pointer hover:bg-slate-50'
                    }`}
                           style={{ borderColor: cancelForm.refundType === 'PARCIAL' ? '#2563eb' : '#e2e8f0' }}>
                      <input
                        type="radio"
                        name="refundType"
                        value="PARCIAL"
                        checked={cancelForm.refundType === 'PARCIAL'}
                        onChange={(e) => setCancelForm(prev => ({ ...prev, refundType: 'PARCIAL' }))}
                        disabled={totalPagadoReserva === 0}
                        className="mt-1 w-4 h-4 text-blue-600 disabled:opacity-50"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">Reembolso Parcial</div>
                        <p className="text-xs text-slate-600 mt-1">
                          {totalPagadoReserva === 0
                            ? '❌ No disponible: No hay pagos registrados'
                            : 'Se devuelve una parte al socio y el club retiene el resto como penalización.'
                          }
                        </p>
                        
                        {cancelForm.refundType === 'PARCIAL' && (
                          <div className="mt-3 space-y-3 pl-3 border-l-2 border-blue-300">
                            {totalPagadoReserva === 0 && (
                              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800">
                                ⚠️ No hay pagos registrados. No se puede hacer reembolso parcial.
                              </div>
                            )}
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">
                                Monto a Reembolsar (Gs.)
                              </label>
                              <input
                                type="text"
                                value={cancelForm.refundAmount}
                                onChange={(e) => {
                                  const value = e.target.value.replace(/\D/g, '');
                                  const refund = parseInt(value || '0');
                                  const penalty = totalPagadoReserva - refund; // ⚠️ Usar totalPagado
                                  setCancelForm(prev => ({ 
                                    ...prev, 
                                    refundAmount: value,
                                    penaltyAmount: penalty.toString()
                                  }));
                                }}
                                placeholder="0"
                                className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">
                                Penalización / Club Retiene (Gs.)
                              </label>
                              <input
                                type="text"
                                value={cancelForm.penaltyAmount}
                                onChange={(e) => {
                                  const value = e.target.value.replace(/\D/g, '');
                                  const penalty = parseInt(value || '0');
                                  const refund = totalPagadoReserva - penalty; // ⚠️ Usar totalPagado
                                  setCancelForm(prev => ({ 
                                    ...prev, 
                                    penaltyAmount: value,
                                    refundAmount: refund.toString()
                                  }));
                                }}
                                placeholder="0"
                                className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 text-sm"
                              />
                            </div>
                            <div className="bg-blue-50 rounded p-2 text-xs text-blue-800">
                              <strong>Total:</strong> {formatCurrency((parseInt(cancelForm.refundAmount || '0') + parseInt(cancelForm.penaltyAmount || '0')))}
                              <span className="text-blue-600 ml-2">(debe ser igual a {formatCurrency(totalPagadoReserva)})</span>
                            </div>
                            {totalPagadoReserva < selectedReservation.montoTotal && (
                              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
                                ℹ️ <strong>Nota:</strong> Total reserva: {formatCurrency(selectedReservation.montoTotal)} | Total pagado: {formatCurrency(totalPagadoReserva)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t bg-slate-50">
              <button
                onClick={closeModals}
                disabled={saving}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmCancellation}
                disabled={saving || !cancelForm.cancelReason.trim()}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {saving ? 'Procesando...' : '✅ Confirmar Cancelación'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      </div>
      </>
    </AdminLayout>
  );
}

