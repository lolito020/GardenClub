'use client';
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { Plus, Search, Calendar, DollarSign, Receipt, Filter, Download, FileText, TrendingUp } from 'lucide-react';
import Link from 'next/link';

interface Payment {
  id: string;
  memberId: string;
  memberName?: string;
  memberCode?: string;
  fecha: string;
  monto: number;
  concepto: string;
  formaPago: 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque';
  cobradorId?: string;
  cobradorName?: string;
  comisionCobrador?: number;
  observaciones?: string;
  numeroRecibo?: string;
}

export default function CobranzasPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFormaPago, setFilterFormaPago] = useState('');
  const [filterFecha, setFilterFecha] = useState('');
  const [filterCobrador, setFilterCobrador] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    loadPayments();
  }, []);

  async function loadPayments() {
    try {
      const response = await AuthClient.authenticatedFetch('/api/payments');
      const data = await response.json();
      setPayments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading payments:', error);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = 
      payment.concepto.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.memberName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.memberCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.numeroRecibo?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFormaPago = !filterFormaPago || payment.formaPago === filterFormaPago;
    const matchesFecha = !filterFecha || payment.fecha.startsWith(filterFecha);
    const matchesCobrador = !filterCobrador || payment.cobradorId === filterCobrador;
    const matchesDateFrom = !dateFrom || payment.fecha >= dateFrom;
    const matchesDateTo = !dateTo || payment.fecha <= dateTo;
    
    return matchesSearch && matchesFormaPago && matchesFecha && matchesCobrador && matchesDateFrom && matchesDateTo;
  });

  const exportPayments = async (format: 'excel' | 'pdf') => {
    try {
      const response = await AuthClient.authenticatedFetch(`/api/payments/export?format=${format}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cobranzas-${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'csv' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error exporting payments:', error);
    }
  };

  const getFormaPagoBadge = (formaPago: string) => {
    const styles = {
      'efectivo': 'bg-green-100 text-green-800',
      'transferencia': 'bg-blue-100 text-blue-800',
      'tarjeta': 'bg-purple-100 text-purple-800',
      'cheque': 'bg-orange-100 text-orange-800'
    };
    
    const labels = {
      'efectivo': 'Efectivo',
      'transferencia': 'Transferencia',
      'tarjeta': 'Tarjeta',
      'cheque': 'Cheque'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[formaPago as keyof typeof styles] || 'bg-gray-100 text-gray-800'}`}>
        {labels[formaPago as keyof typeof labels] || formaPago}
      </span>
    );
  };

  const totalCobrado = filteredPayments.reduce((sum, payment) => sum + payment.monto, 0);
  const totalComisiones = filteredPayments.reduce((sum, payment) => sum + (payment.comisionCobrador || 0), 0);

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
            <h1 className="text-2xl font-semibold text-gray-900">Gestión de Cobranzas</h1>
            <p className="text-gray-600">Administra los pagos y cobranzas del club</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/reportes"
              className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 flex items-center gap-2"
            >
              <TrendingUp className="w-4 h-4" />
              Reportes
            </Link>
            <button
              onClick={() => exportPayments('excel')}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Excel
            </button>
            <Link
              href="/admin/cobranzas/nuevo"
              className="bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Nuevo Pago
            </Link>
          </div>
        </div>

        {/* Filtros y búsqueda */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Filtros de Búsqueda</h3>
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="flex items-center gap-2 text-primary-600 hover:text-primary-800"
            >
              <Filter className="w-4 h-4" />
              {showAdvancedFilters ? 'Ocultar Filtros' : 'Filtros Avanzados'}
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Buscar
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Concepto, socio, recibo..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
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
                value={filterCobrador}
                onChange={(e) => setFilterCobrador(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="interno">Caja Interna</option>
                {/* Aquí se cargarían los cobradores dinámicamente */}
              </select>
            </div>
            
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterFormaPago('');
                  setFilterFecha('');
                  setFilterCobrador('');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
          
          {showAdvancedFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha Desde
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha Hasta
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mes/Año
                </label>
                <input
                  type="month"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={filterFecha}
                  onChange={(e) => setFilterFecha(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Análisis rápido */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Análisis de Cobranzas</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {filteredPayments.filter(p => p.formaPago === 'efectivo').length}
                </div>
                <div className="text-sm text-gray-600">Pagos en Efectivo</div>
              </div>
            </div>
            <div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {filteredPayments.filter(p => p.formaPago === 'transferencia').length}
                </div>
                <div className="text-sm text-gray-600">Transferencias</div>
              </div>
            </div>
            <div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {filteredPayments.filter(p => p.cobradorId).length}
                </div>
                <div className="text-sm text-gray-600">Por Cobradores</div>
              </div>
            </div>
            <div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {((totalComisiones / totalCobrado) * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">% Comisiones</div>
              </div>
            </div>
          </div>
        </div>

        {/* Estadísticas rápidas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <DollarSign className="w-8 h-8 text-green-600 mr-3" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{formatCurrency(totalCobrado)}</div>
                <div className="text-sm text-gray-600">Total Cobrado</div>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-gray-900">{filteredPayments.length}</div>
            <div className="text-sm text-gray-600">Total Pagos</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(totalComisiones)}</div>
            <div className="text-sm text-gray-600">Comisiones</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">
              {filteredPayments.filter(p => p.formaPago === 'efectivo').length}
            </div>
            <div className="text-sm text-gray-600">Pagos Efectivo</div>
          </div>
        </div>

        {/* Tabla de pagos */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Socio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Concepto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Monto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Forma Pago
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cobrador
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Recibo
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(payment.fecha).toLocaleDateString('es-PY')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {payment.memberName || 'N/A'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {payment.memberCode || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{payment.concepto}</div>
                      {payment.observaciones && (
                        <div className="text-sm text-gray-500">{payment.observaciones}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(payment.monto)}
                      </div>
                      {payment.comisionCobrador && (
                        <div className="text-xs text-orange-600">
                          Comisión: {formatCurrency(payment.comisionCobrador)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getFormaPagoBadge(payment.formaPago)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payment.cobradorName || 'Caja Interna'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payment.numeroRecibo || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {filteredPayments.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-500">
                {searchTerm || filterFormaPago || filterFecha || filterCobrador
                  ? 'No se encontraron pagos con los filtros aplicados'
                  : 'No hay pagos registrados'}
              </div>
              {!searchTerm && !filterFormaPago && !filterFecha && !filterCobrador && (
                <Link
                  href="/admin/cobranzas/nuevo"
                  className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-primary-600 bg-primary-100 hover:bg-primary-200"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Registrar primer pago
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}