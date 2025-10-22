'use client';
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { Plus, Search, Edit, Eye, ToggleLeft, ToggleRight, Phone, Mail } from 'lucide-react';
import Link from 'next/link';

interface Collector {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
  ci: string;
  telefono?: string;
  celular?: string;
  direccion?: string;
  email?: string;
  tipoCobrador: 'CLUB' | 'EXTERNO' | 'PROFESOR';
  comisionPorDefecto?: number;
  formaPago: 'efectivo' | 'transferencia' | 'cheque' | ('efectivo' | 'transferencia' | 'cheque')[]; // Soporte para array
  cuentaBanco?: string;
  activo: boolean;
  fechaIngreso: string;
}

export default function CobradoresPage() {
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActivo, setFilterActivo] = useState('');
  const [filterFormaPago, setFilterFormaPago] = useState('');
  const [filterTipo, setFilterTipo] = useState('');

  useEffect(() => {
    loadCollectors();
  }, []);

  async function loadCollectors() {
    try {
      const response = await AuthClient.authenticatedFetch('/api/collectors');
      const data = await response.json();
      setCollectors(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading collectors:', error);
      setCollectors([]);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(collectorId: string, currentState: boolean) {
    try {
      const response = await AuthClient.authenticatedFetch(`/api/collectors/${collectorId}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !currentState })
      });
      
      if (response.ok) {
        await loadCollectors();
      }
    } catch (error) {
      console.error('Error toggling collector:', error);
    }
  }

  const filteredCollectors = collectors.filter(collector => {
    const matchesSearch = 
      collector.nombres.toLowerCase().includes(searchTerm.toLowerCase()) ||
      collector.apellidos.toLowerCase().includes(searchTerm.toLowerCase()) ||
      collector.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      collector.ci.includes(searchTerm);
    
    const matchesActivo = !filterActivo || 
      (filterActivo === 'activo' && collector.activo) ||
      (filterActivo === 'inactivo' && !collector.activo);
    
    const matchesFormaPago = !filterFormaPago || collector.formaPago === filterFormaPago;
    
    const matchesTipo = !filterTipo || collector.tipoCobrador === filterTipo;
    
    return matchesSearch && matchesActivo && matchesFormaPago && matchesTipo;
  });

  const getTipoBadge = (tipo: string) => {
    const styles = {
      'CLUB': 'bg-gray-100 text-gray-800',
      'EXTERNO': 'bg-purple-100 text-purple-800',
      'PROFESOR': 'bg-blue-100 text-blue-800'
    };
    
    const labels = {
      'CLUB': 'Garden Club',
      'EXTERNO': 'Externo',
      'PROFESOR': 'Profesor'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[tipo as keyof typeof styles] || 'bg-gray-100 text-gray-800'}`}>
        {labels[tipo as keyof typeof labels] || tipo}
      </span>
    );
  };

  const getFormaPagoBadge = (formaPago: string) => {
    const styles = {
      'efectivo': 'bg-green-100 text-green-800',
      'transferencia': 'bg-blue-100 text-blue-800',
      'cheque': 'bg-orange-100 text-orange-800'
    };
    
    const labels = {
      'efectivo': 'Efectivo',
      'transferencia': 'Transferencia',
      'cheque': 'Cheque'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[formaPago as keyof typeof styles] || 'bg-gray-100 text-gray-800'}`}>
        {labels[formaPago as keyof typeof labels] || formaPago}
      </span>
    );
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Gestión de Cobradores</h1>
            <p className="text-gray-600">Administra los cobradores externos del club</p>
          </div>
          <Link
            href="/admin/cobradores/nuevo"
            className="bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo Cobrador
          </Link>
        </div>

        {/* Filtros y búsqueda */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Buscar
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Nombre, código o CI..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={filterTipo}
                onChange={(e) => setFilterTipo(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="EXTERNO">Externos</option>
                <option value="PROFESOR">Profesores</option>
                <option value="CLUB">Club</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estado
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={filterActivo}
                onChange={(e) => setFilterActivo(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="activo">Activos</option>
                <option value="inactivo">Inactivos</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Forma de Pago
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={filterFormaPago}
                onChange={(e) => setFilterFormaPago(e.target.value)}
              >
                <option value="">Todas</option>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterActivo('');
                  setFilterFormaPago('');
                  setFilterTipo('');
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Estadística compacta */}
        <div className="bg-white px-4 py-2 rounded-lg shadow">
          <p className="text-sm text-gray-700">
            Total Cobradores: <span className="font-semibold text-gray-900">{collectors.length}</span>
          </p>
        </div>

        {/* Tabla de cobradores */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cobrador
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contacto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Forma de Pago
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha Ingreso
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCollectors.map((collector) => (
                  <tr key={collector.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {collector.nombres} {collector.apellidos}
                        </div>
                        <div className="text-sm text-gray-500">
                          {collector.codigo} • CI: {collector.ci}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm text-gray-900">
                          {collector.tipoCobrador === 'CLUB' ? 'Garden Club' : 
                           collector.tipoCobrador === 'EXTERNO' ? 'Externo' : 
                           collector.tipoCobrador === 'PROFESOR' ? 'Profesor' : 
                           collector.tipoCobrador || 'EXTERNO'}
                        </div>
                        {collector.tipoCobrador === 'EXTERNO' && collector.comisionPorDefecto && (
                          <div className="text-xs text-gray-900 mt-1">
                            {collector.comisionPorDefecto}% comisión
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="space-y-1">
                        {collector.celular && (
                          <div className="flex items-center text-sm text-gray-900">
                            <Phone className="w-3 h-3 mr-1" />
                            {collector.celular}
                          </div>
                        )}
                        {collector.email && (
                          <div className="flex items-center text-sm text-gray-900">
                            <Mail className="w-3 h-3 mr-1" />
                            {collector.email}
                          </div>
                        )}
                        {collector.direccion && (
                          <div className="text-sm text-gray-900">{collector.direccion}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm text-gray-900">
                          {(() => {
                            if (collector.tipoCobrador === 'CLUB') {
                              return 'Todos los métodos';
                            }
                            
                            if (Array.isArray(collector.formaPago)) {
                              const labels = {
                                'efectivo': 'Efectivo',
                                'transferencia': 'Transferencia', 
                                'cheque': 'Cheque'
                              };
                              return collector.formaPago.map(fp => labels[fp as keyof typeof labels] || fp).join(', ');
                            }
                            
                            // Formato antiguo (string único)
                            return collector.formaPago === 'efectivo' ? 'Efectivo' : 
                                   collector.formaPago === 'transferencia' ? 'Transferencia' : 
                                   collector.formaPago === 'cheque' ? 'Cheque' : 
                                   collector.formaPago;
                          })()}
                        </div>
                        {collector.cuentaBanco && (
                          <div className="text-xs text-gray-900 mt-1">
                            {collector.cuentaBanco}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(collector.fechaIngreso).toLocaleDateString('es-PY')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => toggleActive(collector.id, collector.activo)}
                        className={`p-1 rounded ${collector.activo ? 'text-green-600 hover:text-green-800' : 'text-gray-400 hover:text-gray-600'}`}
                      >
                        {collector.activo ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/cobradores/${collector.id}`}
                          className="text-primary-600 hover:text-primary-900 p-1"
                          title="Ver detalles"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link
                          href={`/admin/cobradores/${collector.id}/editar`}
                          className="text-gray-600 hover:text-gray-900 p-1"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {filteredCollectors.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-500">
                {searchTerm || filterActivo || filterFormaPago
                  ? 'No se encontraron cobradores con los filtros aplicados'
                  : 'No hay cobradores registrados'}
              </div>
              {!searchTerm && !filterActivo && !filterFormaPago && (
                <Link
                  href="/admin/cobradores/nuevo"
                  className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-primary-600 bg-primary-100 hover:bg-primary-200"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Crear primer cobrador
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}