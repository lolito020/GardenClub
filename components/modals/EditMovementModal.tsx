'use client';
import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, Save } from 'lucide-react';
import { gsFormat, gsParse } from '@/lib/utils';



// Función para normalizar fechas en formato YYYY-MM-DD
function normalizeDateForInput(dateString: string): string {
  if (!dateString) return '';
  // Si ya está en formato YYYY-MM-DD, usarla directamente
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }
  // Si tiene hora, extraer solo la fecha
  if (dateString.includes('T')) {
    return dateString.split('T')[0];
  }
  // Si es una fecha completa, intentar parsearla
  try {
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch (e) {
    console.warn('Error parsing date:', dateString, e);
  }
  return '';
}
import { AuthClient } from '@/lib/auth-client';

interface Movement {
  id: string;
  memberId: string;
  fecha: string;
  concepto: string;
  tipo: 'DEBIT' | 'CREDIT';
  monto: number;
  observaciones?: string;
  vencimiento?: string;
  status?: string;
  paidAmount?: number;
}

interface Payment {
  id: string;
  memberId: string;
  fecha: string;
  concepto: string;
  monto: number;
  formaPago: string;
  cobradorId?: string;
  numeroRecibo?: string;
  observaciones?: string;
  allocations?: Array<{ debitId: string; amount: number }>;
}

interface FormData {
  fecha: string;
  concepto: string;
  monto: string;
  observaciones: string;
  vencimiento?: string;
  formaPago?: string;
  cobradorId?: string;
  numeroRecibo?: string;
}

interface Service {
  id: string;
  nombre: string;
  precio: number;
}

interface Collector {
  id: string;
  nombres: string;
  apellidos: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  movement: Movement | Payment;
  type: 'DEBIT' | 'CREDIT';
  onSuccess: () => void;
}

export default function EditMovementModal({ isOpen, onClose, memberId, movement, type, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [pendingDebits, setPendingDebits] = useState<Movement[]>([]);
  const [allocRows, setAllocRows] = useState<Array<{ 
    debitId: string; 
    concepto: string; 
    pendiente: number; 
    apply: string; 
    selected: boolean 
  }>>([]);

  const [formData, setFormData] = useState<FormData>(() => {
    if (type === 'DEBIT') {
      const mov = movement as Movement;
      const normalizedDate = normalizeDateForInput(mov.fecha);
      console.log('🔍 DEBIT - Fecha original:', mov.fecha);
      console.log('🔍 DEBIT - Fecha normalizada:', normalizedDate);
      console.log('🔍 DEBIT - Monto original:', mov.monto);
      return {
        fecha: normalizedDate,
        concepto: mov.concepto,
        monto: mov.monto.toString(),
        vencimiento: mov.vencimiento ? normalizeDateForInput(mov.vencimiento) : '',
        observaciones: mov.observaciones || ''
      };
    } else {
      const pay = movement as Payment;
      const normalizedDate = normalizeDateForInput(pay.fecha);
      console.log('🔍 CREDIT - Fecha original:', pay.fecha);
      console.log('🔍 CREDIT - Fecha normalizada:', normalizedDate);
      console.log('🔍 CREDIT - Monto original:', pay.monto);
      return {
        fecha: normalizedDate,
        concepto: pay.concepto,
        monto: pay.monto.toString(),
        formaPago: pay.formaPago,
        cobradorId: pay.cobradorId || '',
        numeroRecibo: pay.numeroRecibo || '',
        observaciones: pay.observaciones || ''
      };
    }
  });

  useEffect(() => {
    if (isOpen && type === 'CREDIT') {
      loadCreditData();
    }
  }, [isOpen, type, memberId]);



  async function loadCreditData() {
    try {
      const [servicesRes, collectorsRes, debitsRes] = await Promise.all([
        AuthClient.authenticatedFetch('/api/services'),
        AuthClient.authenticatedFetch('/api/collectors'),
        AuthClient.authenticatedFetch(`/api/members/${memberId}/movements?type=DEBIT`)
      ]);

      const [servicesData, collectorsData, debitsData] = await Promise.all([
        servicesRes.json(),
        collectorsRes.json(),
        debitsRes.json()
      ]);

      setServices(Array.isArray(servicesData) ? servicesData : []);
      setCollectors(Array.isArray(collectorsData) ? collectorsData : []);
      
      const debits = Array.isArray(debitsData.items) ? debitsData.items : [];
      const pendingDebits = debits.filter((d: Movement) => 
        d.tipo === 'DEBIT' && (d.paidAmount || 0) < d.monto
      );
      setPendingDebits(pendingDebits);

      // Initialize allocation rows based on current payment allocations
      const currentAllocations = (movement as Payment).allocations || [];
      setAllocRows(pendingDebits.map((d: Movement) => {
        const existing = currentAllocations.find(a => a.debitId === d.id);
        return {
          debitId: d.id,
          concepto: d.concepto,
          pendiente: d.monto - (d.paidAmount || 0),
          apply: existing ? existing.amount.toString() : '',
          selected: !!existing
        };
      }));
    } catch (error) {
      console.error('Error loading credit data:', error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      let response;
      
      if (type === 'DEBIT') {
        const payload = {
          fecha: formData.fecha,
          concepto: formData.concepto,
          monto: parseFloat(formData.monto),
          vencimiento: formData.vencimiento || undefined,
          observaciones: formData.observaciones || undefined
        };

        response = await AuthClient.authenticatedFetch(`/api/members/${memberId}/movements/${movement.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      } else {
        const allocations = allocRows
          .filter(row => row.selected && parseFloat(row.apply || '0') > 0)
          .map(row => ({ debitId: row.debitId, amount: parseFloat(row.apply) }));

        const payload = {
          fecha: formData.fecha,
          concepto: formData.concepto,
          monto: parseFloat(formData.monto),
          formaPago: formData.formaPago,
          cobradorId: formData.cobradorId || undefined,
          numeroRecibo: formData.numeroRecibo || undefined,
          observaciones: formData.observaciones || undefined,
          allocations
        };
        
        console.log('📅 Enviando fecha:', formData.fecha);
        console.log('💰 Enviando monto:', formData.monto, 'parseFloat:', parseFloat(formData.monto));

        response = await AuthClient.authenticatedFetch(`/api/payments/${movement.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      }

      if (response.ok) {
        onSuccess();
      } else {
        const data = await response.json();
        alert(data.msg || 'Error al guardar');
      }
    } catch (error) {
      console.error('Error saving:', error);
      alert('Error al guardar');
    } finally {
      setLoading(false);
    }
  }

  const selectService = (service: Service) => {
    setFormData(prev => ({
      ...prev,
      concepto: service.nombre,
      monto: service.precio.toString()
    }));
  };

  const autoDistribute = () => {
    const total = parseFloat(formData.monto || '0');
    if (total <= 0) return;

    let remaining = total;
    const updated = allocRows.map(row => {
      if (!row.selected) return { ...row, apply: '' };
      
      const canApply = Math.min(remaining, row.pendiente);
      const apply = canApply > 0 ? canApply : 0;
      remaining = Math.max(0, remaining - apply);
      
      return { ...row, apply: apply > 0 ? apply.toString() : '' };
    });
    
    setAllocRows(updated);
  };

  const totalApplied = allocRows.reduce((sum, row) => 
    sum + (row.selected ? parseFloat(row.apply || '0') : 0), 0
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl bg-white rounded-lg shadow-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-lg font-semibold">
            {type === 'DEBIT' ? 'Editar Débito' : 'Editar Crédito/Pago'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Campos básicos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha *
                </label>
                <input
                  type="date"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={formData.fecha}
                  onChange={(e) => setFormData(prev => ({ ...prev, fecha: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto (Gs.) *
                </label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={gsFormat(formData.monto || '')}
                  onChange={e => {
                    // Solo permitir números y formatear con punto
                    console.log('[MONTO PRINCIPAL] Valor input:', e.target.value);
                    console.log('[MONTO PRINCIPAL] gsFormat:', gsFormat(e.target.value));
                    const formatted = gsFormat(e.target.value);
                    setFormData(prev => ({ ...prev, monto: gsParse(formatted).toString() }));
                  }}
                  placeholder="0"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Concepto *
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={formData.concepto}
                  onChange={(e) => setFormData(prev => ({ ...prev, concepto: e.target.value }))}
                />
                {type === 'CREDIT' && services.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Servicios rápidos:</p>
                    <div className="flex flex-wrap gap-1">
                      {services.slice(0, 4).map(service => (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => selectService(service)}
                          className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                        >
                          {service.nombre}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Campos específicos para DEBIT */}
              {type === 'DEBIT' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de Vencimiento
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.vencimiento}
                    onChange={(e) => setFormData(prev => ({ ...prev, vencimiento: e.target.value }))}
                  />
                </div>
              )}

              {/* Campos específicos para CREDIT */}
              {type === 'CREDIT' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Forma de Pago *
                    </label>
                    <select
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      value={formData.formaPago}
                      onChange={(e) => setFormData(prev => ({ ...prev, formaPago: e.target.value }))}
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cobrador
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      value={formData.cobradorId}
                      onChange={(e) => setFormData(prev => ({ ...prev, cobradorId: e.target.value }))}
                    >
                      <option value="">Caja Interna</option>
                      {collectors.map(collector => (
                        <option key={collector.id} value={collector.id}>
                          {collector.nombres} {collector.apellidos}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Número de Recibo
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      value={formData.numeroRecibo}
                      onChange={(e) => setFormData(prev => ({ ...prev, numeroRecibo: e.target.value }))}
                    />
                  </div>
                </>
              )}

              <div className={type === 'DEBIT' ? 'md:col-span-2' : ''}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observaciones
                </label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={formData.observaciones}
                  onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
                />
              </div>
            </div>

            {/* Asignar a débitos (solo para CREDIT) */}
            {type === 'CREDIT' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-medium text-gray-900">Asignar a débitos del socio</h4>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">Aplicado:</span>
                    <span className="font-semibold">Gs. {gsFormat(totalApplied.toString())}</span>
                    <span className="text-gray-400">/</span>
                    <span className="font-semibold">Gs. {gsFormat(formData.monto || '0')}</span>
                    <button
                      type="button"
                      onClick={autoDistribute}
                      className="ml-3 px-3 py-1.5 border rounded hover:bg-gray-50"
                    >
                      Autodistribuir
                    </button>
                  </div>
                </div>

                {allocRows.length === 0 ? (
                  <div className="p-3 rounded border text-sm text-gray-600 bg-gray-50">
                    Este socio no tiene débitos pendientes.
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-2 text-left">Sel.</th>
                          <th className="p-2 text-left">Concepto</th>
                          <th className="p-2 text-left">Fecha</th>
                          <th className="p-2 text-right">Pendiente</th>
                          <th className="p-2 text-right">Aplicar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allocRows.map((row, idx) => {
                          const debit = pendingDebits.find(d => d.id === row.debitId);
                          return (
                            <tr key={row.debitId} className="border-t">
                              <td className="p-2">
                                <input
                                  type="checkbox"
                                  checked={row.selected}
                                  onChange={(e) => {
                                    const updated = [...allocRows];
                                    updated[idx] = { ...row, selected: e.target.checked };
                                    setAllocRows(updated);
                                  }}
                                />
                              </td>
                              <td className="p-2">{row.concepto}</td>
                              <td className="p-2">{debit ? normalizeDateForInput(debit.fecha) : '-'}</td>
                              <td className="p-2 text-right">Gs. {gsFormat(row.pendiente.toString())}</td>
                              <td className="p-2 text-right">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={gsFormat(row.apply?.toString() || '')}
                                  onChange={e => {
                                    // Solo permitir números y formatear con punto
                                    const formatted = gsFormat(e.target.value);
                                    const parsed = gsParse(formatted);
                                    console.log('[MONTO TABLA] idx:', idx, 'Valor input:', e.target.value);
                                    console.log('[MONTO TABLA] gsFormat:', formatted, 'gsParse:', parsed);
                                    const updated = [...allocRows];
                                    updated[idx] = { ...row, apply: parsed.toString() };
                                    setAllocRows(updated);
                                  }}
                                  className="w-32 px-2 py-1 border rounded text-right"
                                  placeholder="0"
                                  disabled={!row.selected}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-6 border-t flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}