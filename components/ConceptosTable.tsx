'use client';
import { Trash2, Plus } from 'lucide-react';

import { ConceptoItem } from '@/lib/concept-helpers';
import { Service, Venue, Member } from '@/lib/types';
import { esServicioDisponiblePara } from '@/lib/service-utils';

interface ConceptosTableProps {
  conceptos: ConceptoItem[];
  services: Service[];
  selectedMember?: Member | null;
  showFormValidation: boolean;
  vencimientoDefault?: string;
  onAddConcepto: () => void;
  onUpdateConcepto: (id: string, field: keyof ConceptoItem, value: any) => void;
  onRemoveConcepto: (id: string) => void;
  formatNumberWithSeparator: (value: string) => string;
  getNumericValueSafe: (value: string) => string;
  isServiceDuplicate: (conceptos: ConceptoItem[], servicioId: string, services: Service[]) => boolean;
  onServiceSelection?: (conceptoId: string, servicioId: string) => Promise<void>;
  title?: string;
  buttonColor?: string;
  onOpenReservaModal?: (conceptoId: string) => void;
  modoReservaUnica?: boolean;
  onToggleModoReserva?: () => void;
  canShowMultiReserva?: boolean;
  conceptosConReservaCount?: number;
}

export default function ConceptosTable({
  conceptos,
  services,
  selectedMember,
  showFormValidation,
  vencimientoDefault,
  onAddConcepto,
  onUpdateConcepto,
  onRemoveConcepto,
  formatNumberWithSeparator,
  getNumericValueSafe,
  isServiceDuplicate,
  onServiceSelection,
  title = "Conceptos",
  buttonColor = "",
  onOpenReservaModal,
  modoReservaUnica = false,
  onToggleModoReserva,
  canShowMultiReserva = false,
  conceptosConReservaCount = 0
}: ConceptosTableProps) {

  return (
    <div className="mb-4 bg-white p-3 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-800">{title}</h4>
        
        <div className="flex items-center gap-2">
          {/* Selector de modo de reserva */}
          {canShowMultiReserva && onToggleModoReserva && (
            <div className="flex items-center gap-2 bg-gray-50 rounded-md px-2 py-1 border border-gray-200">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`modo-reserva-${title}`}
                  checked={!modoReservaUnica}
                  onChange={() => !modoReservaUnica || onToggleModoReserva()}
                  className="w-3 h-3 text-gray-600 border-gray-300 focus:ring-gray-500"
                />
                <span className="text-xs font-medium text-gray-700">Reserva Individual</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`modo-reserva-${title}`}
                  checked={modoReservaUnica}
                  onChange={() => modoReservaUnica || onToggleModoReserva()}
                  className="w-3 h-3 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="text-xs font-medium text-gray-700">Reserva Única</span>
                {modoReservaUnica && conceptosConReservaCount > 0 && (
                  <span className="text-xs text-blue-600 font-semibold">({conceptosConReservaCount})</span>
                )}
              </label>
            </div>
          )}
          
          <button
            type="button"
            onClick={onAddConcepto}
            className={`inline-flex items-center gap-2 px-3 py-1.5 ${buttonColor} text-white rounded-md text-sm hover:opacity-90 transition-colors`}
          >
            <Plus size={14} /> Añadir concepto
          </button>
        </div>
      </div>

      {/* Siempre mostrar la tabla, incluso si no hay conceptos */}
      <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left p-1 font-medium text-gray-700 min-w-[180px]">Servicio</th>
                <th className="text-left p-1 font-medium text-gray-700 min-w-[80px]">Tipo</th>
                <th className="text-left p-1 font-medium text-gray-700 min-w-[100px]">Monto</th>
                <th className="text-left p-1 font-medium text-gray-700 min-w-[110px]">Vencimiento</th>
                <th className="text-center p-1 font-medium text-gray-700 min-w-[50px]">Días</th>
                <th className="text-center p-1 font-medium text-gray-700 min-w-[80px]">Suscripción</th>
                <th className="text-center p-1 font-medium text-gray-700 min-w-[120px]">Espacios</th>
                <th className="text-center p-1 font-medium text-gray-700 min-w-[80px]">Reserva</th>
                <th className="text-center p-1 font-medium text-gray-700 min-w-[50px]">Acción</th>
              </tr>
            </thead>
            <tbody>
              {conceptos.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                  {/* Servicio */}
                  <td className="p-1">
                    <select
                      value={c.servicioId}
                      onChange={async (e) => {
                        const servicioId = e.target.value;
                        
                        // Si hay función personalizada para manejar selección (con suscripciones)
                        if (onServiceSelection) {
                          await onServiceSelection(c.id, servicioId);
                          return;
                        }
                        
                        // Fallback: comportamiento original
                        const svc = services.find(s => s.id === servicioId);
                        const montoDefault = svc ? String(selectedMember?.subcategoria === 'NO SOCIO' ? (svc.precioNoSocio ?? svc.precio) : (svc.precioSocio ?? svc.precio)) : '';
                        
                        // Actualizar datos básicos del servicio
                        onUpdateConcepto(c.id, 'servicioId', servicioId);
                        onUpdateConcepto(c.id, 'concepto', svc?.nombre || '');
                        onUpdateConcepto(c.id, 'monto', montoDefault ? formatNumberWithSeparator(montoDefault) : '');
                        
                        // Actualizar tipo de servicio
                        if (svc?.tipo) {
                          onUpdateConcepto(c.id, 'tipoServicio', svc.tipo);
                        }
                      }}
                      className={`w-full px-1 py-1 text-[13px] border rounded focus:outline-none focus:ring-1 ${
                        showFormValidation && !c.servicioId
                          ? 'border-red-300 focus:ring-red-500'
                          : showFormValidation && c.servicioId && isServiceDuplicate(conceptos, c.servicioId, services)
                          ? 'border-amber-300 focus:ring-amber-500'
                          : 'border-gray-300 focus:ring-blue-500'
                      }`}
                    >
                      <option value="">— Seleccionar —</option>
                      {services
                        .filter(s => {
                          // 1. Validar disponibilidad según tipo de miembro
                          const isNoSocio = selectedMember?.subcategoria === 'NO SOCIO';
                          if (!esServicioDisponiblePara(s, selectedMember, isNoSocio)) {
                            return false;
                          }
                          // 2. ⚠️ Permitir múltiples conceptos de "Horas Extras" (pueden ser diferentes)
                          const esHoraExtra = s.nombre.toUpperCase().includes('HORA EXTRA') || s.nombre.toUpperCase().includes('HORAS EXTRA');
                          if (esHoraExtra) return true;
                          // 3. Permitir duplicados si la casilla reserva está tildada
                          if (c.requiereReserva) return true;
                          // 4. Para conceptos normales, mantener la restricción
                          return !conceptos.some(x => x.servicioId === s.id && x.id !== c.id && !x.requiereReserva);
                        })
                        .map(s => (
                          <option key={s.id} value={s.id}>{s.nombre}</option>
                        ))}
                    </select>
                    {showFormValidation && !c.servicioId && (
                      <div className="text-xs text-red-600 mt-1">Requerido</div>
                    )}
                    {showFormValidation && c.servicioId && !c.requiereReserva && isServiceDuplicate(conceptos, c.servicioId, services) && (
                      <div className="text-xs text-amber-700 mt-1">Servicio repetido</div>
                    )}
                  </td>

                  {/* Tipo */}
                  <td className="p-1">
                    <select
                      value={c.tipoServicio}
                      onChange={(e) => onUpdateConcepto(c.id, 'tipoServicio', e.target.value)}
                      className="w-full px-1 py-1 text-[13px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="MENSUAL">Mensual</option>
                      <option value="ANUAL">Anual</option>
                      <option value="UNICO">Único</option>
                      <option value="DIARIO">Diario</option>
                    </select>
                  </td>

                  {/* Monto */}
                  <td className="p-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={c.monto}
                      onChange={(e) => onUpdateConcepto(c.id, 'monto', formatNumberWithSeparator(e.target.value))}
                      className={`w-24 px-1 py-1 text-[13px] border rounded focus:outline-none focus:ring-1 ${
                        showFormValidation && (!c.monto || parseFloat(getNumericValueSafe(c.monto)) <= 0)
                          ? 'border-red-300 focus:ring-red-500'
                          : 'border-gray-300 focus:ring-blue-500'
                      }`}
                      placeholder="50.000"
                    />
                    {showFormValidation && (!c.monto || parseFloat(getNumericValueSafe(c.monto)) <= 0) && (
                      <div className="text-xs text-red-600 mt-1">Requerido</div>
                    )}
                  </td>

                  {/* Vencimiento */}
                  <td className="p-1">
                    <input
                      type="date"
                      value={(() => {
                        // Si tiene reserva propia, usar su fecha
                        if (c.requiereReserva && c.reservaFecha) {
                          return c.reservaFecha.slice(0, 10);
                        }
                        // Si es hora extra relacionada con una reserva, buscar la fecha del concepto principal
                        if (c.relatedToReservaConceptId) {
                          const relatedConcept = conceptos.find(x => x.id === c.relatedToReservaConceptId);
                          if (relatedConcept?.reservaFecha) {
                            return relatedConcept.reservaFecha.slice(0, 10);
                          }
                        }
                        // Por defecto, usar vencimiento normal
                        return c.vencimiento || vencimientoDefault || '';
                      })()}
                      onChange={(e) => onUpdateConcepto(c.id, 'vencimiento', e.target.value)}
                      className="w-full px-1 py-1 text-[13px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>

                  {/* Días (solo para DIARIO) */}
                  <td className="p-1 text-center">
                    {c.tipoServicio === 'DIARIO' ? (
                      <input
                        type="number"
                        min={1}
                        value={c.dias || 1}
                        onChange={(e) => onUpdateConcepto(c.id, 'dias', Math.max(1, parseInt(e.target.value) || 1))}
                        className={`w-12 px-1 py-1 text-[13px] border rounded focus:outline-none focus:ring-1 text-center ${
                          showFormValidation && c.tipoServicio === 'DIARIO' && (!c.dias || c.dias <= 0)
                            ? 'border-red-300 focus:ring-red-500'
                            : 'border-gray-300 focus:ring-blue-500'
                        }`}
                      />
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                    {showFormValidation && c.tipoServicio === 'DIARIO' && (!c.dias || c.dias <= 0) && (
                      <div className="text-xs text-red-600 mt-1">Requerido</div>
                    )}
                  </td>

                  {/* Suscripción */}
                  <td className="p-1 text-center">
                    <label className="inline-flex items-center">
                      <input
                        type="checkbox"
                        checked={c.crearSuscripcion || false}
                        onChange={(e) => onUpdateConcepto(c.id, 'crearSuscripcion', e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="sr-only">Crear suscripción</span>
                    </label>
                  </td>

                  {/* Espacios */}
                  <td className="p-1 text-center">
                    {(() => {
                      const servicio = services.find(s => s.id === c.servicioId);
                      const requiereReserva = (c as any).requiereReserva;
                      
                      if (!requiereReserva || !c.servicioId) {
                        return <span className="text-gray-400 text-xs">—</span>;
                      }
                      
                      // Obtener espacios disponibles (nueva estructura o antigua)
                      let espaciosDisponibles: Venue[] = [];
                      
                      if (servicio?.espaciosDisponibles && servicio.espaciosDisponibles.length > 0) {
                        // Nueva estructura: array de objetos Venue
                        espaciosDisponibles = servicio.espaciosDisponibles;
                      } else if (servicio?.espacios && servicio.espacios.length > 0) {
                        // Estructura antigua: array de strings (nombres)
                        espaciosDisponibles = servicio.espacios.map((nombre: string, index: number) => ({
                          id: `espacio-${servicio.id}-${index}`,
                          nombre: nombre,
                          descripcion: '',
                          activo: true
                        }));
                      }
                      
                      if (espaciosDisponibles.length === 0) {
                        return <span className="text-gray-400 text-xs">—</span>;
                      }
                      
                      return (
                        <select
                          value={(() => {
                            const currentValue = (c as any).reservaVenueId;
                            const servicio = services.find(s => s.id === c.servicioId);
                            
                            // 🔍 Debug: verificar incongruencias
                            if (currentValue) {
                              const espacioValido = espaciosDisponibles.find(e => e.id === currentValue);
                              if (!espacioValido) {
                                console.warn(`⚠️ Concepto ${c.concepto} (${servicio?.nombre}) tiene venueId ${currentValue} que no está en espacios disponibles:`, espaciosDisponibles.map(e => e.nombre));
                                // Si el espacio guardado no está disponible para este servicio, seleccionar el primero disponible
                                if (espaciosDisponibles.length > 0) {
                                  const primerEspacio = espaciosDisponibles[0].id;
                                  setTimeout(() => onUpdateConcepto(c.id, 'reservaVenueId', primerEspacio), 0);
                                  return primerEspacio;
                                }
                                return '';
                              }
                              return currentValue;
                            }
                            
                            // Si no hay valor y hay espacios disponibles, seleccionar el primero automáticamente
                            if (espaciosDisponibles.length > 0) {
                              const primerEspacio = espaciosDisponibles[0].id;
                              console.log(`✅ Auto-seleccionando primer espacio para ${c.concepto} (${servicio?.nombre}): ${espaciosDisponibles[0].nombre}`);
                              setTimeout(() => onUpdateConcepto(c.id, 'reservaVenueId', primerEspacio), 0);
                              return primerEspacio;
                            }
                            
                            return '';
                          })()}
                          onChange={(e) => onUpdateConcepto(c.id, 'reservaVenueId', e.target.value)}
                          className="w-full px-1 py-1 text-[13px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {espaciosDisponibles.length === 0 && (
                            <option value="">Sin espacios disponibles</option>
                          )}
                          {espaciosDisponibles.map(espacio => (
                            <option key={espacio.id} value={espacio.id}>{espacio.nombre}</option>
                          ))}
                        </select>
                      );
                    })()}
                  </td>

                  {/* Reserva */}
                  <td className="p-1 text-center">
                    {(() => {
                      const servicio = services.find(s => s.id === c.servicioId);
                      const permiteReserva = servicio?.permiteAgendamiento;
                      
                      if (!permiteReserva) {
                        return <span className="text-gray-400 text-xs">—</span>;
                      }
                      
                      const tieneReserva = (c as any).requiereReserva;
                      // Solo considerar que está configurada si tiene fecha/hora de reserva, no solo si tiene espacio seleccionado
                      const reservaConfigurada = tieneReserva && (c as any).reservaFechaHora;
                      
                      return (
                        <div className="flex flex-col items-center gap-1">
                          <label className="inline-flex items-center">
                            <input
                              type="checkbox"
                              checked={tieneReserva || false}
                              onChange={(e) => onUpdateConcepto(c.id, 'requiereReserva' as keyof ConceptoItem, e.target.checked)}
                              className="w-3 h-3 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                            />
                            <span className="sr-only">Requiere reserva</span>
                          </label>
                          {tieneReserva && !modoReservaUnica && (
                            <button
                              type="button"
                              onClick={() => onOpenReservaModal?.(c.id)}
                              className={`text-xs px-1 py-0.5 rounded transition-colors ${
                                reservaConfigurada 
                                  ? 'text-green-700' 
                                  : 'text-purple-700'
                              }`}
                              title={reservaConfigurada ? 'Editar reserva existente' : 'Configurar nueva reserva'}
                            >
                              {reservaConfigurada ? 'Editar' : 'Agendar'}
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  {/* Botón Eliminar */}
                  <td className="p-1 text-center">
                    <button
                      type="button"
                      onClick={() => onRemoveConcepto(c.id)}
                      className="inline-flex items-center justify-center w-6 h-6 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Eliminar concepto"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </div>
  );
}