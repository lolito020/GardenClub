'use client';
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ArrowLeft, Edit, Phone, Mail, MapPin, Calendar, User, DollarSign, TrendingUp, ToggleLeft, ToggleRight, CheckSquare, Square, X, Search, Filter, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText } from 'lucide-react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

type TipoCobrador = 'CLUB' | 'EXTERNO' | 'PROFESOR';

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
  tipoCobrador: TipoCobrador;
  comisionPorDefecto?: number;
  formaPago: 'efectivo' | 'transferencia' | 'cheque';
  cuentaBanco?: string;
  activo: boolean;
  fechaIngreso: string;
}

interface Payment {
  id: string;
  fecha: string;
  monto: number;
  concepto: string;
  memberName: string;
  comisionCobrador: number;
  comisionPagada: boolean;
}

interface CommissionSummary {
  cobrador: {
    id: string;
    nombres: string;
    apellidos: string;
    codigo: string;
    tipoCobrador: TipoCobrador;
  };
  totales: {
    generados: number;
    pendientes: number;
    pagados: number;
  };
  pagosPendientes: Array<{
    id: string;
    fecha: string;
    monto: number;
    comisionCobrador: number;
    concepto: string;
    socio: {
      codigo: string;
      nombres: string;
      apellidos: string;
    };
  }>;
  pagosPagados: Array<{
    id: string;
    fecha: string;
    monto: number;
    comisionCobrador: number;
    concepto: string;
    socio: {
      codigo: string;
      nombres: string;
      apellidos: string;
    };
  }>;
}

export default function CobradorDetailPage() {
  const params = useParams();
  const [collector, setCollector] = useState<Collector | null>(null);
  const [commissionData, setCommissionData] = useState<CommissionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set());
  const [showLiquidationModal, setShowLiquidationModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'pendientes' | 'pagadas'>('pendientes');
  const [liquidationForm, setLiquidationForm] = useState({
    formaPago: 'efectivo' as 'efectivo' | 'transferencia' | 'cheque',
    numeroRecibo: '',
    observaciones: ''
  });
  const [liquidating, setLiquidating] = useState(false);
  const [liquidationMsg, setLiquidationMsg] = useState('');
  
  // Estado para búsqueda de comisiones
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Estados para filtros de fecha
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  
  // Estados para paginación
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(50);

  useEffect(() => {
    if (params.id) {
      loadCollectorData();
    }
  }, [params.id]);

  // Resetear página cuando cambian los filtros o el tab
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFrom, dateTo, activeTab]);

  async function loadCollectorData() {
    try {
      const [collectorRes, commissionsRes] = await Promise.all([
        AuthClient.authenticatedFetch(`/api/collectors/${params.id}`),
        AuthClient.authenticatedFetch(`/api/collectors/${params.id}/commissions`)
      ]);

      const [collectorData, commissionsData] = await Promise.all([
        collectorRes.json(),
        commissionsRes.json()
      ]);

      if (collectorRes.ok) {
        setCollector(collectorData);
      }

      if (commissionsRes.ok) {
        setCommissionData(commissionsData);
      }
    } catch (error) {
      console.error('Error loading collector data:', error);
    } finally {
      setLoading(false);
    }
  }

  function togglePaymentSelection(paymentId: string) {
    setSelectedPayments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(paymentId)) {
        newSet.delete(paymentId);
      } else {
        newSet.add(paymentId);
      }
      return newSet;
    });
  }

  function selectAllPayments() {
    if (!commissionData) return;
    setSelectedPayments(new Set(commissionData.pagosPendientes.map(p => p.id)));
  }

  function clearSelection() {
    setSelectedPayments(new Set());
  }

  async function handleLiquidation() {
    if (selectedPayments.size === 0) {
      setLiquidationMsg('Selecciona al menos un pago');
      return;
    }

    setLiquidating(true);
    setLiquidationMsg('');

    try {
      const response = await AuthClient.authenticatedFetch('/api/commission-payments', {
        method: 'POST',
        body: JSON.stringify({
          cobradorId: params.id,
          paymentIds: Array.from(selectedPayments),
          formaPago: liquidationForm.formaPago,
          numeroRecibo: liquidationForm.numeroRecibo || undefined,
          observaciones: liquidationForm.observaciones || undefined
        })
      });

      const data = await response.json();

      if (response.ok) {
        setShowLiquidationModal(false);
        setSelectedPayments(new Set());
        setLiquidationForm({
          formaPago: 'efectivo',
          numeroRecibo: '',
          observaciones: ''
        });
        await loadCollectorData();
      } else {
        setLiquidationMsg(data.error || data.msg || 'Error al procesar liquidación');
      }
    } catch (error) {
      setLiquidationMsg('Error de conexión');
    } finally {
      setLiquidating(false);
    }
  }

  async function toggleActive() {
    if (!collector) return;
    
    try {
      const response = await AuthClient.authenticatedFetch(`/api/collectors/${collector.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !collector.activo })
      });
      
      if (response.ok) {
        setCollector(prev => prev ? { ...prev, activo: !prev.activo } : null);
      }
    } catch (error) {
      console.error('Error toggling collector:', error);
    }
  }

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

  // Funciones para filtros preset
  const setCurrentMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    setDateFrom(firstDay.toISOString().split('T')[0]);
    setDateTo(lastDay.toISOString().split('T')[0]);
  };

  const setCurrentYear = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), 0, 1);
    const lastDay = new Date(now.getFullYear(), 11, 31);
    
    setDateFrom(firstDay.toISOString().split('T')[0]);
    setDateTo(lastDay.toISOString().split('T')[0]);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  // Función para aplicar paginación a los datos filtrados
  const applyPagination = (data: any[]) => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return data.slice(startIndex, endIndex);
  };

  // Calcular total de páginas
  const getTotalPages = (totalItems: number) => {
    return Math.ceil(totalItems / rowsPerPage) || 1;
  };

  // Función para exportar a Excel
  const exportToExcel = () => {
    if (!commissionData || !collector) return;

    const dataToExport = activeTab === 'pendientes' 
      ? filterCommissions(commissionData.pagosPendientes)
      : filterCommissions(commissionData.pagosPagados || []);

    if (dataToExport.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    // Preparar datos para Excel
    const excelData = dataToExport.map(payment => ({
      'Fecha': formatDate(payment.fecha),
      'Código Socio': payment.socio.codigo,
      'Socio': `${payment.socio.nombres} ${payment.socio.apellidos}`,
      'Concepto': payment.concepto,
      'Monto': payment.monto,
      'Comisión': payment.comisionCobrador,
      'Estado': activeTab === 'pendientes' ? 'Pendiente' : 'Pagada'
    }));

    // Agregar fila de totales
    excelData.push({
      'Fecha': '',
      'Código Socio': '',
      'Socio': '',
      'Concepto': 'TOTAL',
      'Monto': dataToExport.reduce((sum, p) => sum + p.monto, 0),
      'Comisión': dataToExport.reduce((sum, p) => sum + p.comisionCobrador, 0),
      'Estado': ''
    });

    // Crear libro de Excel
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Comisiones ${activeTab}`);

    // Ajustar ancho de columnas
    worksheet['!cols'] = [
      { wch: 12 }, // Fecha
      { wch: 12 }, // Código Socio
      { wch: 30 }, // Socio
      { wch: 25 }, // Concepto
      { wch: 15 }, // Monto
      { wch: 15 }, // Comisión
      { wch: 12 }  // Estado
    ];

    // Descargar archivo
    const fileName = `Comisiones_${collector.nombres}_${collector.apellidos}_${activeTab}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Función para exportar a PDF
  const exportToPDF = async () => {
    if (!commissionData || !collector) return;

    const dataToExport = activeTab === 'pendientes'
      ? filterCommissions(commissionData.pagosPendientes)
      : filterCommissions(commissionData.pagosPagados || []);

    if (dataToExport.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    // Importar pdfmake dinámicamente
    const pdfmake = await import('pdfmake/build/pdfmake');
    const pdfFonts = await import('pdfmake/build/vfs_fonts');
    (pdfmake as any).default.vfs = (pdfFonts as any).default.vfs;

    // Encabezados y datos
    const headers = [
      'Fecha',
      'Código Socio',
      'Socio',
      'Concepto',
      'Monto',
      'Comisión'
    ];
    const formatNumber = (num: number) => num.toLocaleString('de-DE', { minimumFractionDigits: 0 });
    const tableRows = dataToExport.map(payment => [
      formatDate(payment.fecha),
      payment.socio.codigo,
      `${payment.socio.nombres} ${payment.socio.apellidos}`,
      payment.concepto,
      formatNumber(payment.monto),
      formatNumber(payment.comisionCobrador)
    ]);
    // Fila de totales
    tableRows.push([
      '',
      '',
      '',
      'TOTAL',
      formatNumber(dataToExport.reduce((sum, p) => sum + p.monto, 0)),
      formatNumber(dataToExport.reduce((sum, p) => sum + p.comisionCobrador, 0))
    ]);

    // Documento pdfmake
    const docDefinition = {
      pageOrientation: 'landscape',
      pageSize: 'A4',
      content: [
        { text: 'Reporte de Comisiones', style: 'header', alignment: 'center', margin: [0, 0, 0, 10] },
        { text: `Cobrador: ${collector.nombres} ${collector.apellidos}`, style: 'subheader', margin: [0, 0, 0, 2] },
        { text: `Código: ${collector.codigo}`, style: 'subheader', margin: [0, 0, 0, 2] },
        { text: `Estado: ${activeTab === 'pendientes' ? 'Comisiones Pendientes' : 'Comisiones Pagadas'}`, style: 'subheader', margin: [0, 0, 0, 2] },
        { text: `Fecha: ${new Date().toLocaleDateString('es-PY')}`, style: 'subheader', margin: [0, 0, 0, 10] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', '*', '*', 'auto', 'auto'],
            body: [headers, ...tableRows]
          },
          layout: 'lightHorizontalLines',
        }
      ],
      styles: {
        header: { fontSize: 16, bold: true },
        subheader: { fontSize: 10, margin: [0, 2, 0, 2] },
      },
      defaultStyle: {
        fontSize: 8
      }
    };

    // Descargar PDF
    const fileName = `Comisiones_${collector.nombres}_${collector.apellidos}_${activeTab}_${new Date().toISOString().split('T')[0]}.pdf`;
    (pdfmake as any).default.createPdf(docDefinition).download(fileName);
  };

  // Función para filtrar comisiones basado en búsqueda, fechas y montos
  const filterCommissions = (payments: any[]) => {
    return payments.filter(payment => {
      // Filtro de búsqueda por texto
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesSearch = 
          payment.concepto?.toLowerCase().includes(term) ||
          payment.socio?.nombres?.toLowerCase().includes(term) ||
          payment.socio?.apellidos?.toLowerCase().includes(term) ||
          payment.socio?.codigo?.toLowerCase().includes(term) ||
          payment.monto?.toString().includes(term) ||
          payment.comisionCobrador?.toString().includes(term);
        
        if (!matchesSearch) return false;
      }
      
      // Filtro de fecha desde
      if (dateFrom) {
        const paymentDate = new Date(payment.fecha);
        const fromDate = new Date(dateFrom);
        if (paymentDate < fromDate) return false;
      }
      
      // Filtro de fecha hasta
      if (dateTo) {
        const paymentDate = new Date(payment.fecha);
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999); // Incluir todo el día
        if (paymentDate > toDate) return false;
      }
      
      // amountFilter removed - no filtering by amount
      
      return true;
    });
  };

  const selectedTotal = commissionData?.pagosPendientes
    .filter(p => selectedPayments.has(p.id))
    .reduce((sum, p) => sum + p.comisionCobrador, 0) || 0;

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </div>
      </AdminLayout>
    );
  }

  if (!collector) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <div className="text-gray-500">Cobrador no encontrado</div>
          <Link href="/admin/cobradores" className="text-primary-600 hover:text-primary-800 mt-4 inline-block">
            ← Volver a Cobradores
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/cobradores"
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                {collector.nombres} {collector.apellidos}
              </h1>
              <p className="text-gray-600">{collector.codigo}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleActive}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                collector.activo 
                  ? 'bg-red-600 text-white hover:bg-red-700' 
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {collector.activo ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
              {collector.activo ? 'Desactivar' : 'Activar'}
            </button>
            <Link
              href={`/admin/cobradores/${collector.id}/editar`}
              className="bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 flex items-center gap-2"
            >
              <Edit className="w-4 h-4" />
              Editar
            </Link>
          </div>
        </div>

        {/* Estado y métricas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full mr-2 ${collector.activo ? 'bg-green-500' : 'bg-gray-500'}`}></div>
              <div>
                <div className="text-sm text-gray-600">Estado</div>
                <div className="font-medium">{collector.activo ? 'Activo' : 'Inactivo'}</div>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <div>
              <div className="text-xl font-bold text-green-600">
                {formatCurrency(commissionData?.totales.generados || 0)}
              </div>
              <div className="text-sm text-gray-600">Total Generado</div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <div>
              <div className="text-xl font-bold text-orange-600">
                {formatCurrency(commissionData?.totales.pendientes || 0)}
              </div>
              <div className="text-sm text-gray-600">Pendiente</div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <div>
              <div className="text-xl font-bold text-blue-600">
                {formatCurrency(commissionData?.totales.pagados || 0)}
              </div>
              <div className="text-sm text-gray-600">Pagado</div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Información Principal - Datos Personales e Información de Pago en una sola fila */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Datos Personales - 80% del ancho (4 de 5 columnas) */}
            <div className="lg:col-span-4 bg-white rounded-lg shadow">
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <User className="w-5 h-5 mr-2" />
                  Datos Personales
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Columna 1 */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-600">Nombres</label>
                      <div className="font-medium">{collector.nombres}</div>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Apellidos</label>
                      <div className="font-medium">{collector.apellidos}</div>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Cédula</label>
                      <div className="font-medium">{collector.ci}</div>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Tipo de Cobrador</label>
                      <div className="font-medium">{getTipoBadge(collector.tipoCobrador)}</div>
                    </div>
                    {(collector.tipoCobrador === 'EXTERNO' || collector.tipoCobrador === 'PROFESOR') && collector.comisionPorDefecto && (
                      <div>
                        <label className="text-sm text-gray-600">Comisión por Defecto</label>
                        <div className="font-medium">{collector.comisionPorDefecto}%</div>
                      </div>
                    )}
                  </div>

                  {/* Columna 2 */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-600">Fecha de Ingreso</label>
                      <div className="font-medium">{formatDate(collector.fechaIngreso)}</div>
                    </div>
                    {collector.telefono && (
                      <div>
                        <label className="text-sm text-gray-600">Teléfono</label>
                        <div className="font-medium">{collector.telefono}</div>
                      </div>
                    )}
                    {collector.celular && (
                      <div>
                        <label className="text-sm text-gray-600">Celular</label>
                        <div className="font-medium">{collector.celular}</div>
                      </div>
                    )}
                    {collector.email && (
                      <div>
                        <label className="text-sm text-gray-600">Email</label>
                        <div className="font-medium">{collector.email}</div>
                      </div>
                    )}
                    {collector.direccion && (
                      <div>
                        <label className="text-sm text-gray-600">Dirección</label>
                        <div className="font-medium">{collector.direccion}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Información de Pago - 20% del ancho (1 de 5 columnas) */}
            <div className="lg:col-span-1 bg-white rounded-lg shadow">
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  Información de Pago
                </h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm text-gray-600 block mb-1">Forma de Pago</span>
                    {getFormaPagoBadge(collector.formaPago)}
                  </div>
                  {collector.cuentaBanco && (
                    <div>
                      <span className="text-sm text-gray-600 block mb-1">Cuenta Bancaria</span>
                      <span className="font-medium text-sm break-all">{collector.cuentaBanco}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Gestión de Comisiones */}
        {collector.tipoCobrador !== 'CLUB' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold flex items-center">
                  Gestión de Comisiones
                </h3>
                {commissionData && commissionData.pagosPendientes.length > 0 && activeTab === 'pendientes' && (
                  <div className="flex gap-2">
                    <button
                      onClick={selectAllPayments}
                      className="text-sm text-primary-600 hover:text-primary-800"
                    >
                      Seleccionar Todos
                    </button>
                    {selectedPayments.size > 0 && (
                      <>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={clearSelection}
                          className="text-sm text-gray-600 hover:text-gray-800"
                        >
                          Limpiar
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={() => setShowLiquidationModal(true)}
                          className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                        >
                          Liquidar Seleccionados ({selectedPayments.size}) - {formatCurrency(selectedTotal)}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => setActiveTab('pendientes')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'pendientes'
                        ? 'border-primary-500 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Comisiones Pendientes
                    {commissionData && commissionData.pagosPendientes.length > 0 && (
                      <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        {commissionData.pagosPendientes.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('pagadas')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'pagadas'
                        ? 'border-primary-500 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Comisiones Pagadas
                    {commissionData && commissionData.pagosPagados && commissionData.pagosPagados.length > 0 && (
                      <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {commissionData.pagosPagados.length}
                      </span>
                    )}
                  </button>
                </nav>
              </div>

              {/* Filtros y Buscador */}
              <div className="mb-4 space-y-3">
                {/* Fila 1: Filtros de fecha y monto */}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Desde"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Hasta"
                  />
                  {/* amountFilter dropdown removed per UX request */}
                  <button
                    onClick={setCurrentMonth}
                    className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-xs"
                  >
                    Mes actual
                  </button>
                  <button
                    onClick={setCurrentYear}
                    className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-xs"
                  >
                    Este año
                  </button>
                  <button
                    onClick={clearFilters}
                    className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-xs text-gray-600"
                  >
                    Limpiar filtros
                  </button>
                </div>

                {/* Fila 2: Buscador y Exportación */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar por concepto, socio o monto..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                  </div>
                  <button
                    onClick={exportToExcel}
                    className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm whitespace-nowrap"
                    title="Exportar a Excel"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Excel
                  </button>
                  <button
                    onClick={exportToPDF}
                    className="flex items-center gap-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm whitespace-nowrap"
                    title="Exportar a PDF"
                  >
                    <FileText className="w-4 h-4" />
                    PDF
                  </button>
                </div>
              </div>

              {/* Contenido del Tab */}
              {activeTab === 'pendientes' && (
                <>
                  {(() => {
                    const filteredPendientes = commissionData ? filterCommissions(commissionData.pagosPendientes) : [];
                    const paginatedPendientes = applyPagination(filteredPendientes);
                    const totalPages = getTotalPages(filteredPendientes.length);
                    
                    return filteredPendientes.length > 0 ? (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-2 px-2 w-8"></th>
                                <th className="text-left py-2 px-3">Fecha</th>
                                <th className="text-left py-2 px-3">Socio</th>
                                <th className="text-left py-2 px-3">Concepto</th>
                                <th className="text-right py-2 px-3">Monto</th>
                                <th className="text-right py-2 px-3">Comisión</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginatedPendientes.map(payment => (
                                <tr key={payment.id} className="border-b hover:bg-gray-50">
                                  <td className="py-2 px-2">
                                    <button
                                      onClick={() => togglePaymentSelection(payment.id)}
                                      className="text-primary-600 hover:text-primary-800"
                                    >
                                      {selectedPayments.has(payment.id) ? (
                                        <CheckSquare className="w-5 h-5" />
                                      ) : (
                                        <Square className="w-5 h-5" />
                                      )}
                                    </button>
                                  </td>
                                  <td className="py-2 px-3">{formatDate(payment.fecha)}</td>
                                  <td className="py-2 px-3">
                                    {payment.socio.codigo} - {payment.socio.nombres} {payment.socio.apellidos}
                                  </td>
                                  <td className="py-2 px-3">{payment.concepto}</td>
                                  <td className="py-2 px-3 text-right font-medium">{formatCurrency(payment.monto)}</td>
                                  <td className="py-2 px-3 text-right font-medium text-green-600">
                                    {formatCurrency(payment.comisionCobrador)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 bg-gray-50">
                                <td className="py-3 px-2"></td>
                                <td className="py-3 px-3 font-semibold text-gray-700" colSpan={3}>
                                  Total ({filteredPendientes.length} pago{filteredPendientes.length !== 1 ? 's' : ''})
                                  {searchTerm && commissionData && filteredPendientes.length !== commissionData.pagosPendientes.length && (
                                    <span className="text-xs text-gray-500 ml-1">
                                      (filtrado de {commissionData.pagosPendientes.length})
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-right font-bold">
                                  {formatCurrency(filteredPendientes.reduce((sum, p) => sum + p.monto, 0))}
                                </td>
                                <td className="py-3 px-3 text-right font-bold text-green-600">
                                  {formatCurrency(filteredPendientes.reduce((sum, p) => sum + p.comisionCobrador, 0))}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        {/* Paginación */}
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                          <div className="text-xs text-gray-500">
                            Página {currentPage} de {totalPages} • {filteredPendientes.length} comisiones
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-600">Filas:</label>
                            <select
                              value={rowsPerPage}
                              onChange={(e) => {
                                setRowsPerPage(Number(e.target.value));
                                setCurrentPage(1);
                              }}
                              className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                            >
                              <option value={20}>20</option>
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                              <option value={200}>200</option>
                            </select>
                            <button
                              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                              disabled={currentPage <= 1}
                              className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                              disabled={currentPage >= totalPages}
                              className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-gray-500 text-center py-8">
                        {searchTerm ? `No se encontraron comisiones pendientes que coincidan con "${searchTerm}"` : 'No hay comisiones pendientes'}
                      </div>
                    );
                  })()}
                </>
              )}

              {activeTab === 'pagadas' && (
                <>
                  {(() => {
                    const filteredPagadas = commissionData && commissionData.pagosPagados ? filterCommissions(commissionData.pagosPagados) : [];
                    const paginatedPagadas = applyPagination(filteredPagadas);
                    const totalPages = getTotalPages(filteredPagadas.length);
                    
                    return filteredPagadas.length > 0 ? (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-2 px-3">Fecha</th>
                                <th className="text-left py-2 px-3">Socio</th>
                                <th className="text-left py-2 px-3">Concepto</th>
                                <th className="text-right py-2 px-3">Monto</th>
                                <th className="text-right py-2 px-3">Comisión</th>
                                <th className="text-center py-2 px-3">Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginatedPagadas.map(payment => (
                                <tr key={payment.id} className="border-b hover:bg-gray-50">
                                  <td className="py-2 px-3">{formatDate(payment.fecha)}</td>
                                  <td className="py-2 px-3">
                                    {payment.socio.codigo} - {payment.socio.nombres} {payment.socio.apellidos}
                                  </td>
                                  <td className="py-2 px-3">{payment.concepto}</td>
                                  <td className="py-2 px-3 text-right font-medium">{formatCurrency(payment.monto)}</td>
                                  <td className="py-2 px-3 text-right font-medium text-blue-600">
                                    {formatCurrency(payment.comisionCobrador)}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                      Pagada
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 bg-gray-50">
                                <td className="py-3 px-3 font-semibold text-gray-700" colSpan={3}>
                                  Total ({filteredPagadas.length} pago{filteredPagadas.length !== 1 ? 's' : ''})
                                  {searchTerm && commissionData && commissionData.pagosPagados && filteredPagadas.length !== commissionData.pagosPagados.length && (
                                    <span className="text-xs text-gray-500 ml-1">
                                      (filtrado de {commissionData.pagosPagados.length})
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-right font-bold">
                                  {formatCurrency(filteredPagadas.reduce((sum, p) => sum + p.monto, 0))}
                                </td>
                                <td className="py-3 px-3 text-right font-bold text-blue-600">
                                  {formatCurrency(filteredPagadas.reduce((sum, p) => sum + p.comisionCobrador, 0))}
                                </td>
                                <td className="py-3 px-3"></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        {/* Paginación */}
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                          <div className="text-xs text-gray-500">
                            Página {currentPage} de {totalPages} • {filteredPagadas.length} comisiones
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-600">Filas:</label>
                            <select
                              value={rowsPerPage}
                              onChange={(e) => {
                                setRowsPerPage(Number(e.target.value));
                                setCurrentPage(1);
                              }}
                              className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                            >
                              <option value={20}>20</option>
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                              <option value={200}>200</option>
                            </select>
                            <button
                              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                              disabled={currentPage <= 1}
                              className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                              disabled={currentPage >= totalPages}
                              className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-gray-500 text-center py-8">
                        {searchTerm ? `No se encontraron comisiones pagadas que coincidan con "${searchTerm}"` : 'No hay comisiones pagadas registradas'}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        )}

        {/* Modal de Liquidación */}
        {showLiquidationModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Liquidar Comisiones</h3>
                <button
                  onClick={() => setShowLiquidationModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {liquidationMsg && (
                <div className={`mb-4 p-3 rounded ${
                  liquidationMsg.includes('Error') 
                    ? 'bg-red-50 text-red-800 border border-red-200'
                    : 'bg-green-50 text-green-800 border border-green-200'
                }`}>
                  {liquidationMsg}
                </div>
              )}

              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Pagos seleccionados:</span>
                    <span className="font-medium">{selectedPayments.size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total a liquidar:</span>
                    <span className="font-bold text-green-600">{formatCurrency(selectedTotal)}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Forma de Pago *
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={liquidationForm.formaPago}
                    onChange={(e) => setLiquidationForm(prev => ({ 
                      ...prev, 
                      formaPago: e.target.value as 'efectivo' | 'transferencia' | 'cheque'
                    }))}
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Número de Recibo
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={liquidationForm.numeroRecibo}
                    onChange={(e) => setLiquidationForm(prev => ({ 
                      ...prev, 
                      numeroRecibo: e.target.value
                    }))}
                    placeholder="Ej: REC-001"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Observaciones
                  </label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    rows={3}
                    value={liquidationForm.observaciones}
                    onChange={(e) => setLiquidationForm(prev => ({ 
                      ...prev, 
                      observaciones: e.target.value
                    }))}
                    placeholder="Notas adicionales..."
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowLiquidationModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    disabled={liquidating}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleLiquidation}
                    disabled={liquidating}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {liquidating ? 'Procesando...' : 'Confirmar Liquidación'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}