// 📋 Componente de Tabla para la Vista de Todas las Reservas de Portería
// Basado en análisis de app/admin/reservas/page.tsx

'use client';

import { useState, useMemo } from 'react';
import { 
  PorteriaTableProps,
  PorteriaReservationView,
  StatusInfo,
  EventInfo
} from '@/lib/porteria-types';
import {
  formatCurrency,
  formatHour,
  formatDate,
  getStatusInfo,
  getEventInfo,
  getContactInfo
} from '@/lib/porteria-utils';

export default function PorteriaTable({ 
  reservas, 
  loading = false, 
  config, 
  responsive,
  onReservaClick,
  onDetallesClick
}: PorteriaTableProps) {

  // 🎯 Estado para reserva seleccionada en modal
  const [selectedReservation, setSelectedReservation] = useState<PorteriaReservationView | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // 📱 Columnas visibles según configuración responsive
  const columnasVisibles = useMemo(() => {
    if (responsive.isMobile) {
      return ['fecha', 'contacto']; // Solo esenciales en móvil
    }
    if (responsive.isTablet) {
      return ['fecha', 'servicio', 'contacto']; // Más info en tablet
    }
    return ['fecha', 'servicio', 'evento', 'contacto']; // Todas en desktop
  }, [responsive]);

  // 🎨 Función para obtener chip de estado
  const StatusChip = ({ status }: { status: string }) => {
    const statusInfo = getStatusInfo(status as any);
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${statusInfo.className}`}>
        {statusInfo.label}
      </span>
    );
  };

  // 🎉 Función para mostrar información de evento
  const EventDisplay = ({ reservation }: { reservation: PorteriaReservationView }) => {
    if (!reservation.acontecimiento) {
      return <span className="text-xs italic text-slate-400">Sin especificar</span>;
    }

    const eventInfo = getEventInfo(reservation);
    return (
      <div>
        <div className="text-sm font-medium text-slate-900">
          {eventInfo.icono} {eventInfo.tipoDisplay}
        </div>
        {eventInfo.persona && (
          <div className="text-xs text-slate-500 truncate max-w-[120px]">
            {eventInfo.persona}
          </div>
        )}
      </div>
    );
  };

  // 📞 Función para mostrar información de contacto
  const ContactDisplay = ({ reservation }: { reservation: PorteriaReservationView }) => {
    const contactInfo = getContactInfo(reservation);
    
    return (
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate">
          {contactInfo.nombre || '—'}
        </div>
        
        {/* Información adicional en móvil */}
        {responsive.isMobile && (
          <>
            <div className="text-xs text-slate-500">
              {reservation.serviceName}
            </div>
            {reservation.acontecimiento && (
              <div className="text-xs text-blue-600 font-medium">
                {getEventInfo(reservation).icono} {getEventInfo(reservation).tipoDisplay}
              </div>
            )}
          </>
        )}
        
        {/* Información de contacto */}
        <div className="text-xs text-slate-500">
          {contactInfo.contactoCompleto || '—'}
        </div>
      </div>
    );
  };

  // 📱 Función para abrir detalles
  const handleDetallesClick = (reserva: PorteriaReservationView) => {
    setSelectedReservation(reserva);
    setShowDetailsModal(true);
    if (onDetallesClick) {
      onDetallesClick(reserva);
    }
  };

  // 🔄 Función para cerrar modales
  const closeModal = () => {
    setShowDetailsModal(false);
    setSelectedReservation(null);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
      {/* Header de tabla */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            Todas las Reservas
          </h3>
          
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>{reservas.length} reservas</span>
            {loading && (
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span>Cargando...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabla de reservas */}
      {loading ? (
        <div className="p-12 text-center">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-lg font-medium text-slate-600">Cargando reservas...</p>
          </div>
        </div>
      ) : reservas.length === 0 ? (
        <div className="p-12 text-center">
          <div className="flex flex-col items-center justify-center space-y-6">
            <div className="relative">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-slate-700">Sin reservas para mostrar</h3>
              <p className="text-slate-500 max-w-md mx-auto">
                No se encontraron reservas con los filtros actuales. Intenta ajustar los criterios de búsqueda.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-wide text-slate-700">
                {/* Fecha & Horario */}
                {columnasVisibles.includes('fecha') && (
                  <th className="px-3 sm:px-6 py-4 text-left font-bold">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Fecha & Horario
                    </div>
                  </th>
                )}

                {/* Servicio/Espacio */}
                {columnasVisibles.includes('servicio') && (
                  <th className="hidden lg:table-cell px-6 py-4 text-left font-bold">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      Servicio/Espacio
                    </div>
                  </th>
                )}

                {/* Evento */}
                {columnasVisibles.includes('evento') && (
                  <th className="hidden lg:table-cell px-6 py-4 text-left font-bold">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                      </svg>
                      Evento
                    </div>
                  </th>
                )}

                {/* Contacto */}
                {columnasVisibles.includes('contacto') && (
                  <th className="px-3 sm:px-6 py-4 text-left font-bold">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Contacto
                    </div>
                  </th>
                )}

                {/* Acciones */}
                <th className="px-3 sm:px-6 py-4 text-right font-bold">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {reservas.map((reserva) => (
                <tr 
                  key={reserva.id} 
                  className={`hover:bg-slate-50 transition-all duration-200 hover:shadow-sm border-b border-slate-100 ${
                    onReservaClick ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => onReservaClick && onReservaClick(reserva)}
                >
                  {/* Fecha & Horario */}
                  {columnasVisibles.includes('fecha') && (
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-bold text-slate-900">
                            {reserva.fechaDisplay}
                          </div>
                          <div className="text-xs text-slate-600">
                            {reserva.horarioDisplay}
                          </div>
                          <div className="text-xs text-slate-400">
                            {reserva.duracionDisplay}
                          </div>
                        </div>
                        <StatusChip status={reserva.status} />
                      </div>
                    </td>
                  )}

                  {/* Servicio/Espacio */}
                  {columnasVisibles.includes('servicio') && (
                    <td className="hidden lg:table-cell px-6 py-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {reserva.serviceName}
                        </div>
                        {reserva.hasSpace && reserva.spaceName !== reserva.serviceName && (
                          <div className="text-xs text-slate-500">{reserva.spaceName}</div>
                        )}
                      </div>
                    </td>
                  )}

                  {/* Evento */}
                  {columnasVisibles.includes('evento') && (
                    <td className="hidden lg:table-cell px-6 py-4">
                      <EventDisplay reservation={reserva} />
                    </td>
                  )}

                  {/* Contacto */}
                  {columnasVisibles.includes('contacto') && (
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <ContactDisplay reservation={reserva} />
                    </td>
                  )}

                  {/* Acciones */}
                  <td className="px-3 sm:px-6 py-3 sm:py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDetallesClick(reserva);
                        }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-sm"
                        title="Ver detalles completos"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Detalles Simplificado para Portería */}
      {showDetailsModal && selectedReservation && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto bg-white rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-800">📋 Detalles de Reserva</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Información básica */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Servicio/Espacio</label>
                  <p className="text-sm font-medium text-gray-900">
                    {selectedReservation.serviceName}
                    {selectedReservation.hasSpace && selectedReservation.spaceName !== selectedReservation.serviceName && (
                      <span className="text-gray-500"> - {selectedReservation.spaceName}</span>
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Estado</label>
                  <div className="mt-1">
                    <StatusChip status={selectedReservation.status} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fecha</label>
                  <p className="text-sm font-medium text-gray-900">{formatDate(selectedReservation.start)}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Horario</label>
                  <p className="text-sm font-medium text-gray-900">{selectedReservation.horarioDisplay}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contacto</label>
                  <p className="text-sm font-medium text-gray-900">{selectedReservation.nombreContacto || '—'}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Teléfono</label>
                  <p className="text-sm text-gray-700">{selectedReservation.contacto || '—'}</p>
                </div>
              </div>

              {/* Evento si existe */}
              {selectedReservation.acontecimiento && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">🎉 Evento Especial</h4>
                  <EventDisplay reservation={selectedReservation} />
                </div>
              )}

              {/* Información adicional */}
              {(selectedReservation.cantidadPersonas || selectedReservation.notas) && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">📝 Información Adicional</h4>
                  {selectedReservation.cantidadPersonas && (
                    <div className="mb-2">
                      <span className="text-sm font-medium">Cantidad de personas: </span>
                      <span className="text-sm text-gray-700">{selectedReservation.cantidadPersonas}</span>
                    </div>
                  )}
                  {selectedReservation.notas && (
                    <div>
                      <span className="text-sm font-medium">Notas: </span>
                      <span className="text-sm text-gray-700">{selectedReservation.notas}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-slate-50 flex justify-end">
              <button onClick={closeModal} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}