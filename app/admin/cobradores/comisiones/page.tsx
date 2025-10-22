'use client';
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { DollarSign, TrendingUp, Users, AlertCircle, Eye } from 'lucide-react';
import Link from 'next/link';

type TipoCobrador = 'CLUB' | 'EXTERNO' | 'PROFESOR';

interface CobradorComision {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
  tipoCobrador: TipoCobrador;
  activo: boolean;
  totales: {
    generados: number;
    pendientes: number;
    pagados: number;
  };
  cantidadPagosPendientes: number;
}

export default function ComisionesGeneralPage() {
  const [cobradores, setCobradores] = useState<CobradorComision[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTipo, setFilterTipo] = useState<string>('');
  const [filterEstado, setFilterEstado] = useState<string>('');

  useEffect(() => {
    loadComisionesData();
  }, []);

  async function loadComisionesData() {
    try {
      // Cargar todos los cobradores
      const collectorsRes = await AuthClient.authenticatedFetch('/api/collectors');
      const collectorsData = await collectorsRes.json();

      if (!Array.isArray(collectorsData)) {
        setCobradores([]);
        return;
      }

      // Para cada cobrador, obtener sus comisiones
      const comisionesPromises = collectorsData.map(async (collector: any) => {
        try {
          const commissionsRes = await AuthClient.authenticatedFetch(
            `/api/collectors/${collector.id}/commissions`
          );
          const commissionsData = await commissionsRes.json();

          return {
            id: collector.id,
            codigo: collector.codigo,
            nombres: collector.nombres,
            apellidos: collector.apellidos,
            tipoCobrador: collector.tipoCobrador || 'EXTERNO',
            activo: collector.activo,
            totales: commissionsData.totales || { generados: 0, pendientes: 0, pagados: 0 },
            cantidadPagosPendientes: commissionsData.pagosPendientes?.length || 0
          };
        } catch (error) {
          console.error(`Error loading commissions for ${collector.codigo}:`, error);
          return {
            id: collector.id,
            codigo: collector.codigo,
            nombres: collector.nombres,
            apellidos: collector.apellidos,
            tipoCobrador: collector.tipoCobrador || 'EXTERNO',
            activo: collector.activo,
            totales: { generados: 0, pendientes: 0, pagados: 0 },
            cantidadPagosPendientes: 0
          };
        }
      });

      const comisionesData = await Promise.all(comisionesPromises);
      setCobradores(comisionesData);
    } catch (error) {
      console.error('Error loading comisiones:', error);
      setCobradores([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredCobradores = cobradores.filter(cobrador => {
    // Excluir tipo CLUB ya que no tienen comisiones
    if (cobrador.tipoCobrador === 'CLUB') return false;

    const matchesTipo = !filterTipo || cobrador.tipoCobrador === filterTipo;
    const matchesEstado = !filterEstado || 
      (filterEstado === 'activo' && cobrador.activo) ||
      (filterEstado === 'inactivo' && !cobrador.activo) ||
      (filterEstado === 'pendientes' && cobrador.totales.pendientes > 0);

    return matchesTipo && matchesEstado;
  });

  const totalesGlobales = filteredCobradores.reduce(
    (acc, cobrador) => ({
      generados: acc.generados + cobrador.totales.generados,
      pendientes: acc.pendientes + cobrador.totales.pendientes,
      pagados: acc.pagados + cobrador.totales.pagados
    }),
    { generados: 0, pendientes: 0, pagados: 0 }
  );

  const getTipoBadge = (tipo: TipoCobrador) => {
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
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[tipo]}`}>
        {labels[tipo]}
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
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard de Comisiones</h1>
          <p className="text-gray-600">Vista general de todas las comisiones de cobradores</p>
        </div>

        {/* Totales Globales */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 mb-1">Cobradores con Comisiones</div>
                <div className="text-2xl font-bold text-gray-900">{filteredCobradores.length}</div>
              </div>
              <Users className="w-8 h-8 text-gray-400" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 mb-1">Total Generado</div>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(totalesGlobales.generados)}
                </div>
              </div>
              <DollarSign className="w-8 h-8 text-green-400" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 mb-1">Pendiente de Pago</div>
                <div className="text-2xl font-bold text-orange-600">
                  {formatCurrency(totalesGlobales.pendientes)}
                </div>
              </div>
              <AlertCircle className="w-8 h-8 text-orange-400" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 mb-1">Total Pagado</div>
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(totalesGlobales.pagados)}
                </div>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-400" />
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Cobrador
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={filterTipo}
                onChange={(e) => setFilterTipo(e.target.value)}
              >
                <option value="">Todos (Externo + Profesor)</option>
                <option value="EXTERNO">Solo Externos</option>
                <option value="PROFESOR">Solo Profesores</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estado
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={filterEstado}
                onChange={(e) => setFilterEstado(e.target.value)}
              >
                <option value="">Todos los estados</option>
                <option value="activo">Solo Activos</option>
                <option value="pendientes">Con Pendientes</option>
                <option value="inactivo">Inactivos</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilterTipo('');
                  setFilterEstado('');
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Tabla de Cobradores */}
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
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Generado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pendiente
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pagado
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pagos Pendientes
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCobradores.map((cobrador) => (
                  <tr key={cobrador.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {cobrador.nombres} {cobrador.apellidos}
                        </div>
                        <div className="text-sm text-gray-500">{cobrador.codigo}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getTipoBadge(cobrador.tipoCobrador)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        cobrador.activo 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {cobrador.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-medium text-green-600">
                        {formatCurrency(cobrador.totales.generados)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className={`text-sm font-medium ${
                        cobrador.totales.pendientes > 0 
                          ? 'text-orange-600' 
                          : 'text-gray-400'
                      }`}>
                        {formatCurrency(cobrador.totales.pendientes)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-medium text-blue-600">
                        {formatCurrency(cobrador.totales.pagados)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {cobrador.cantidadPagosPendientes > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                          {cobrador.cantidadPagosPendientes}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Link
                        href={`/admin/cobradores/${cobrador.id}`}
                        className="text-primary-600 hover:text-primary-900 inline-flex items-center gap-1"
                      >
                        <Eye className="w-4 h-4" />
                        <span className="text-sm">Ver detalle</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredCobradores.length === 0 && (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <div className="text-gray-500">
                {filterTipo || filterEstado
                  ? 'No se encontraron cobradores con los filtros aplicados'
                  : 'No hay cobradores con comisiones registrados'}
              </div>
            </div>
          )}
        </div>

        {/* Leyenda */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <strong>Nota:</strong> Los cobradores tipo "Club" no aparecen en esta lista ya que no generan comisiones. 
              Solo se muestran los cobradores tipo "Externo" y "Profesor" que sí reciben comisiones por los pagos cobrados.
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
