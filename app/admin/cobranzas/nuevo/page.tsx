'use client';
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import { getLocalDateString } from '@/lib/timezone-config';

type FormaPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque';

interface Member {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
  ci: string;
}

interface Service {
  id: string;
  nombre: string;
  precio: number;
  comisionCobrador?: number;
}

interface Collector {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
}

type MovementType = 'DEBIT' | 'CREDIT';
interface Movement {
  id: string;
  memberId: string;
  fecha: string;
  concepto: string;
  tipo: MovementType;
  monto: number;
  paidAmount?: number; // nuevo
  status?: 'PENDIENTE' | 'PARCIAL' | 'CANCELADO';
}

export default function NuevoPagoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  
  const [members, setMembers] = useState<Member[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  
  const [searchMember, setSearchMember] = useState('');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showMemberSearch, setShowMemberSearch] = useState(false);

  const [pendingDebits, setPendingDebits] = useState<Movement[]>([]);
  const [allocRows, setAllocRows] = useState<Array<{ debitId: string; concepto: string; pendiente: number; apply: string; selected: boolean }>>([]);

  const [formData, setFormData] = useState({
    memberId: '',
    fecha: getLocalDateString(),
    monto: '',
    concepto: '',
    formaPago: 'efectivo' as FormaPago,
    cobradorId: '',
    observaciones: '',
    numeroRecibo: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [membersRes, servicesRes, collectorsRes] = await Promise.all([
        AuthClient.authenticatedFetch('/api/members'),
        AuthClient.authenticatedFetch('/api/services'),
        AuthClient.authenticatedFetch('/api/collectors')
      ]);

      const [membersData, servicesData, collectorsData] = await Promise.all([
        membersRes.json(),
        servicesRes.json(),
        collectorsRes.json()
      ]);

      setMembers(Array.isArray(membersData) ? membersData : []);
      setServices(Array.isArray(servicesData) ? servicesData.filter((s: any) => s.activo !== false) : []);
      setCollectors(Array.isArray(collectorsData) ? collectorsData.filter((c: any) => c.activo !== false) : []);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  async function loadMemberPendingDebits(memberId: string) {
    try {
      const res = await AuthClient.authenticatedFetch(`/api/members/${memberId}/movements?type=DEBIT`);
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json() : [];
      const arr: any[] = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
      // Pendientes/parciales
      const debits: Movement[] = arr
        .map((m: any) => ({
          id: m.id,
          memberId: m.memberId,
          fecha: m.fecha,
          concepto: m.concepto,
          tipo: (m.tipo || 'DEBIT') as MovementType,
          monto: Number(m.monto || 0),
          paidAmount: Number(m.paidAmount || 0),
          status: m.status || undefined,
        }))
        .filter(d => d.tipo === 'DEBIT' && (Number(d.paidAmount || 0) < Number(d.monto || 0)));

      // Orden por fecha ascendente (FIFO)
      debits.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

      setPendingDebits(debits);
      setAllocRows(debits.map(d => ({
        debitId: d.id,
        concepto: d.concepto,
        pendiente: Math.max(0, d.monto - (d.paidAmount || 0)),
        apply: '',
        selected: false,
      })));
    } catch (e) {
      console.error('Error pending debits', e);
      setPendingDebits([]);
      setAllocRows([]);
    }
  }

  const selectMember = (member: Member) => {
    setSelectedMember(member);
    setFormData(prev => ({ ...prev, memberId: member.id }));
    setShowMemberSearch(false);
    setSearchMember('');
    loadMemberPendingDebits(member.id);
  };

  const selectService = (service: Service) => {
    setFormData(prev => ({
      ...prev,
      concepto: service.nombre,
      monto: service.precio != null ? String(service.precio) : prev.monto
    }));
  };

  const filteredMembers = members.filter(member =>
    member.nombres.toLowerCase().includes(searchMember.toLowerCase()) ||
    member.apellidos.toLowerCase().includes(searchMember.toLowerCase()) ||
    member.codigo.toLowerCase().includes(searchMember.toLowerCase()) ||
    member.ci.includes(searchMember)
  );

  // Autodistribuir (FIFO)
  const autoDistribute = () => {
    const total = Number(formData.monto || 0);
    if (!(total > 0)) return;

    let remain = total;
    const next = allocRows.map(r => {
      if (!r.selected) return { ...r, apply: '' };
      const can = Math.min(remain, r.pendiente);
      const apply = can > 0 ? can : 0;
      remain = Math.max(0, remain - apply);
      return { ...r, apply: apply ? String(apply) : '' };
    });
    setAllocRows(next);
  };

  const totalApplied = allocRows.reduce((acc, r) => acc + (r.selected ? Number(r.apply || 0) : 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setLoading(true);

    try {
      // Preparar allocations (solo filas seleccionadas con monto > 0)
      const allocations = allocRows
        .filter(r => r.selected && Number(r.apply || 0) > 0)
        .map(r => ({ debitId: r.debitId, amount: Number(r.apply) }));

      const paymentData: any = {
        ...formData,
        monto: parseFloat(formData.monto),
      };

      // Enviamos allocations si hay (opcional)
      if (allocations.length > 0) {
        paymentData.allocations = allocations;
      }

      const response = await AuthClient.authenticatedFetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify(paymentData)
      });

      const data = await response.json();

      if (response.ok) {
        router.push('/admin/cobranzas');
      } else {
        setMsg(data.msg || 'Error al registrar pago');
      }
    } catch (error) {
      setMsg('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/admin/cobranzas" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Nuevo Pago</h1>
            <p className="text-gray-600">Registra un nuevo pago o cobranza</p>
          </div>
        </div>

        {msg && (
          <div className={`p-4 rounded-lg ${
            msg.includes('Error') ? 'bg-red-50 text-red-800 border border-red-200'
                                  : 'bg-green-50 text-green-800 border border-green-200'
          }`}>{msg}</div>
        )}

        {/* Formulario */}
        <div className="bg-white rounded-lg shadow">
          <form onSubmit={handleSubmit} className="p-6 space-y-8">
            {/* Socio */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Información del Socio</h3>
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Socio *</label>
                {selectedMember ? (
                  <div className="flex items-center justify-between p-3 border border-gray-300 rounded-lg bg-gray-50">
                    <div>
                      <div className="font-medium">{selectedMember.nombres} {selectedMember.apellidos}</div>
                      <div className="text-sm text-gray-500">{selectedMember.codigo} • CI: {selectedMember.ci}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMember(null);
                        setFormData(prev => ({ ...prev, memberId: '' }));
                        setPendingDebits([]);
                        setAllocRows([]);
                      }}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Buscar socio por nombre, código o CI..."
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        value={searchMember}
                        onChange={(e) => {
                          setSearchMember(e.target.value);
                          setShowMemberSearch(e.target.value.length > 0);
                        }}
                        onFocus={() => setShowMemberSearch(searchMember.length > 0)}
                      />
                    </div>
                    {showMemberSearch && filteredMembers.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredMembers.slice(0, 10).map(member => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => selectMember(member)}
                            className="w-full text-left p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                          >
                            <div className="font-medium">{member.nombres} {member.apellidos}</div>
                            <div className="text-sm text-gray-500">{member.codigo} • CI: {member.ci}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Información del Pago */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Información del Pago</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                  <input
                    type="date"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.fecha}
                    onChange={(e) => setFormData(prev => ({ ...prev, fecha: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pago *</label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.formaPago}
                    onChange={(e) => setFormData(prev => ({ ...prev, formaPago: e.target.value as FormaPago }))}
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Concepto *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.concepto}
                    onChange={(e) => setFormData(prev => ({ ...prev, concepto: e.target.value }))}
                    placeholder="Cuota social, Tenis, Natación, etc."
                  />
                  {/* Servicios rápidos */}
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
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto (Gs.) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.monto}
                    onChange={(e) => setFormData(prev => ({ ...prev, monto: e.target.value }))}
                    placeholder="150000"
                  />
                  {formData.monto && (
                    <p className="text-xs text-gray-500 mt-1">
                      {formatCurrency(parseFloat(formData.monto) || 0)}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cobrador</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.cobradorId}
                    onChange={(e) => setFormData(prev => ({ ...prev, cobradorId: e.target.value }))}
                  >
                    <option value="">Caja Interna</option>
                    {collectors.map(collector => (
                      <option key={collector.id} value={collector.id}>
                        {collector.nombres} {collector.apellidos} ({collector.codigo})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número de Recibo</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.numeroRecibo}
                    onChange={(e) => setFormData(prev => ({ ...prev, numeroRecibo: e.target.value }))}
                    placeholder="REC-001"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.observaciones}
                    onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
                    placeholder="Notas adicionales sobre el pago..."
                  />
                </div>
              </div>
            </div>

            {/* ===== Asignar a Débitos ===== */}
            {selectedMember && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-medium text-gray-900">Asignar a débitos del socio</h3>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">Aplicado:</span>
                    <span className="font-semibold">{formatCurrency(totalApplied)}</span>
                    <span className="text-gray-400">/</span>
                    <span className="font-semibold">{formatCurrency(Number(formData.monto || 0))}</span>
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
                                    const next = [...allocRows];
                                    next[idx] = { ...row, selected: e.target.checked };
                                    setAllocRows(next);
                                  }}
                                />
                              </td>
                              <td className="p-2">{row.concepto}</td>
                              <td className="p-2">{debit ? new Date(debit.fecha).toLocaleDateString() : '-'}</td>
                              <td className="p-2 text-right">{formatCurrency(row.pendiente)}</td>
                              <td className="p-2 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  step="1000"
                                  value={row.apply}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const next = [...allocRows];
                                    next[idx] = { ...row, apply: val };
                                    setAllocRows(next);
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
                <p className="text-xs text-gray-500 mt-2">
                  Podés aplicar el pago a uno o varios débitos. Si dejás este bloque vacío, el pago se registra sin asignación (podrás asignarlo luego desde editar pago).
                </p>
              </div>
            )}

            {/* Resumen comisión (igual que tenías) */}
            {formData.monto && formData.cobradorId && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Resumen del Pago</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Monto:</span>
                    <span className="font-medium">{formatCurrency(parseFloat(formData.monto))}</span>
                  </div>
                  {(() => {
                    const service = services.find(s => s.nombre === formData.concepto);
                    const comision = service?.comisionCobrador ? (parseFloat(formData.monto) * service.comisionCobrador) / 100 : 0;
                    if (comision > 0) {
                      return (
                        <div className="flex justify-between text-orange-600">
                          <span>Comisión Cobrador ({service?.comisionCobrador}%):</span>
                          <span className="font-medium">{formatCurrency(comision)}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}

            {/* Botones */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Link href="/admin/cobranzas" className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={loading || !selectedMember}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                {loading ? 'Registrando...' : 'Registrar Pago'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
