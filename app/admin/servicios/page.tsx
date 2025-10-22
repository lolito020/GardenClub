'use client';
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';
import { Plus, Search, Edit, Eye, ToggleLeft, ToggleRight, MoreVertical, Trash2, FileSpreadsheet, FileText } from 'lucide-react';
import Link from 'next/link';

interface Service {
  id: string;
  nombre: string;
  descripcion?: string;
  precio: number;
  tipo: 'MENSUAL' | 'ANUAL' | 'UNICO';
  obligatorio?: boolean;
  aplicaA?: string[];
  comisionCobrador?: number;
  activo: boolean;
  categoria?: string;
  socios?: boolean;
  noSocios?: boolean;
  permiteAgendamiento?: boolean;
}

export default function ServiciosPage() {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterActivo, setFilterActivo] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    loadServices();
  }, []);

  async function loadServices() {
    try {
      const response = await AuthClient.authenticatedFetch('/api/services');
      const data = await response.json();
      setServices(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading services:', error);
      setServices([]);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(serviceId: string, currentState: boolean) {
    try {
      const response = await AuthClient.authenticatedFetch(`/api/services/${serviceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !currentState })
      });
      
      if (response.ok) {
        await loadServices();
      }
    } catch (error) {
      console.error('Error toggling service:', error);
    }
  }

  async function deleteService(serviceId: string, serviceName: string) {
    if (!confirm(`¿Estás seguro de que quieres eliminar el servicio "${serviceName}"?`)) {
      return;
    }

    try {
      const response = await AuthClient.authenticatedFetch(`/api/services/${serviceId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (response.ok) {
        await loadServices();
        setOpenMenuId(null);
        alert('Servicio eliminado correctamente');
      } else {
        alert(result.msg || 'Error al eliminar el servicio');
      }
    } catch (error) {
      console.error('Error deleting service:', error);
      alert('Error al eliminar el servicio');
    }
  }

  function toggleMenu(serviceId: string) {
    console.log('toggleMenu called with:', serviceId, 'current openMenuId:', openMenuId);
    setOpenMenuId(openMenuId === serviceId ? null : serviceId);
  }

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Element;
      if (!target.closest('[data-menu-container]')) {
        setOpenMenuId(null);
      }
    }
    
    if (openMenuId) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openMenuId]);

  const filteredServices = services.filter(service => {
    const matchesSearch = 
      service.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (service.descripcion && service.descripcion.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesTipo = !filterTipo || service.tipo === filterTipo;
    const matchesActivo = !filterActivo || 
      (filterActivo === 'activo' && service.activo) ||
      (filterActivo === 'inactivo' && !service.activo);
    
    return matchesSearch && matchesTipo && matchesActivo;
  });

  const getTipoBadge = (tipo: string) => {
    return (
      <span className="text-sm text-gray-900">
        {tipo}
      </span>
    );
  };

  // Función para exportar a Excel
  async function exportToExcel() {
    try {
      const XLSX = await import('xlsx');
      
      // Función para formatear precio con separador de miles
      const formatPrecio = (precio: number) => {
        return precio.toLocaleString('es-PY', { 
          minimumFractionDigits: 0,
          maximumFractionDigits: 0 
        });
      };
      
      // Preparar datos para exportación
      const data = filteredServices.map(service => ({
        'Servicio': service.nombre,
        'Precio': formatPrecio(service.precio),
        'Tipo': service.tipo,
        'Socios': service.socios ? 'SÍ' : 'NO',
        'No Socios': service.noSocios ? 'SÍ' : 'NO',
        'Agendamiento': service.permiteAgendamiento ? 'SÍ' : 'NO',
        'Comisión': service.comisionCobrador ? `${service.comisionCobrador}%` : '-'
      }));

      // Crear libro y hoja
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      // Ajustar ancho de columnas
      const colWidths = [
        { wch: 30 }, // Servicio
        { wch: 12 }, // Precio
        { wch: 10 }, // Tipo
        { wch: 10 }, // Socios
        { wch: 12 }, // No Socios
        { wch: 15 }, // Agendamiento
        { wch: 12 }, // Comisión
      ];
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'Servicios');

      // Generar archivo
      const fileName = `servicios-${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (error) {
      console.error('Error al exportar a Excel:', error);
      alert('Error al exportar a Excel');
    }
  }

  // Función para exportar a PDF
  async function exportToPDF() {
    try {
  const pdfMakeModule = await import('pdfmake/build/pdfmake');
  const pdfFontsModule = await import('pdfmake/build/vfs_fonts');
  const pdfMake = pdfMakeModule.default || pdfMakeModule;
  const pdfFonts = pdfFontsModule.default || pdfFontsModule;
  pdfMake.vfs = pdfFonts.vfs;

      // Preparar datos para la tabla
      const tableBody: any[] = [
        // Encabezados
        [
          { text: 'Servicio', style: 'tableHeader', bold: true },
          { text: 'Precio', style: 'tableHeader', bold: true, alignment: 'right' },
          { text: 'Tipo', style: 'tableHeader', bold: true },
          { text: 'Socios', style: 'tableHeader', bold: true, alignment: 'center' },
          { text: 'No Socios', style: 'tableHeader', bold: true, alignment: 'center' },
          { text: 'Agendamiento', style: 'tableHeader', bold: true, alignment: 'center' },
          { text: 'Comisión', style: 'tableHeader', bold: true, alignment: 'center' }
        ]
      ];

      // Agregar filas de datos
      filteredServices.forEach(service => {
        tableBody.push([
          { text: service.nombre, fontSize: 9 },
          { text: formatCurrency(service.precio), fontSize: 9, alignment: 'right' },
          { text: service.tipo, fontSize: 9 },
          { text: service.socios ? 'SÍ' : 'NO', fontSize: 9, alignment: 'center' },
          { text: service.noSocios ? 'SÍ' : 'NO', fontSize: 9, alignment: 'center' },
          { text: service.permiteAgendamiento ? 'SÍ' : 'NO', fontSize: 9, alignment: 'center' },
          { text: service.comisionCobrador ? `${service.comisionCobrador}%` : '-', fontSize: 9, alignment: 'center' }
        ]);
      });

      // Definir documento PDF
      const docDefinition: any = {
        pageSize: 'A4',
        pageOrientation: 'landscape',
        pageMargins: [30, 60, 30, 40],
        header: {
          margin: [30, 20, 30, 0],
          columns: [
            {
              text: 'Reporte de Servicios',
              style: 'header',
              fontSize: 16,
              bold: true
            },
            {
              text: new Date().toLocaleDateString('es-PY'),
              alignment: 'right',
              fontSize: 10,
              margin: [0, 5, 0, 0]
            }
          ]
        },
        content: [
          {
            text: `Total de servicios: ${filteredServices.length}`,
            margin: [0, 0, 0, 10],
            fontSize: 10
          },
          {
            table: {
              headerRows: 1,
              widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
              body: tableBody
            },
            layout: {
              fillColor: function (rowIndex: number) {
                return rowIndex === 0 ? '#f3f4f6' : (rowIndex % 2 === 0 ? '#f9fafb' : null);
              },
              hLineWidth: function () { return 0.5; },
              vLineWidth: function () { return 0.5; },
              hLineColor: function () { return '#e5e7eb'; },
              vLineColor: function () { return '#e5e7eb'; }
            }
          }
        ],
        styles: {
          header: {
            fontSize: 16,
            bold: true,
            margin: [0, 0, 0, 10]
          },
          tableHeader: {
            fontSize: 10,
            bold: true,
            fillColor: '#f3f4f6'
          }
        },
        defaultStyle: {
          fontSize: 9
        }
      };

      // Generar y descargar PDF
      const fileName = `servicios-${new Date().toISOString().slice(0, 10)}.pdf`;
      (pdfMake as any).createPdf(docDefinition).download(fileName);
    } catch (error) {
      console.error('Error al exportar a PDF:', error);
      alert('Error al exportar a PDF');
    }
  }

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
      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Servicios</h1>
          <p className="mt-1 text-sm text-gray-500">
            Administra los servicios disponibles en el club
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportToExcel}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            title="Exportar a Excel"
          >
            <FileSpreadsheet className="w-5 h-5" />
            Excel
          </button>
          <button
            onClick={exportToPDF}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
            title="Exportar a PDF"
          >
            <FileText className="w-5 h-5" />
            PDF
          </button>
          <button
            onClick={() => router.push('/admin/servicios/nuevo')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nuevo Servicio
          </button>
        </div>
      </div>        {/* Filtros y búsqueda */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Buscar
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Nombre o descripción..."
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
                <option value="MENSUAL">Mensual</option>
                <option value="ANUAL">Anual</option>
                <option value="UNICO">Único</option>
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
            
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterTipo('');
                  setFilterActivo('');
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Tabla de servicios */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Servicio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Precio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Socios
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    No Socios
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Agendamiento
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Comisión
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredServices.map((service) => (
                  <tr key={service.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                          {service.nombre}
                          {service.obligatorio && (
                            <span className="text-gray-900 text-xs">
                              Obligatorio
                            </span>
                          )}
                        </div>
                        {service.descripcion && (
                          <div className="text-sm text-gray-500">{service.descripcion}</div>
                        )}
                        {service.aplicaA && service.aplicaA.length > 0 && (
                          <div className="text-xs text-gray-400 mt-1">
                            Aplica a: {service.aplicaA.join(', ')}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(service.precio)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getTipoBadge(service.tipo)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm text-gray-900">
                        {service.socios ? 'SÍ' : 'NO'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm text-gray-900">
                        {service.noSocios ? 'SÍ' : 'NO'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm text-gray-900">
                        {service.permiteAgendamiento ? 'SÍ' : 'NO'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {service.comisionCobrador ? `${service.comisionCobrador}%` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="relative" data-menu-container>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('Toggling menu for service:', service.id);
                            toggleMenu(service.id);
                          }}
                          className="p-2 hover:bg-gray-50 rounded-full transition-colors border border-transparent hover:border-gray-200"
                          title="Más opciones"
                        >
                          <MoreVertical className="w-4 h-4 text-gray-500" />
                        </button>
                        
                        {openMenuId === service.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
                            <div className="py-1">
                              <Link
                                href={`/admin/servicios/${service.id}`}
                                className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                onClick={() => setOpenMenuId(null)}
                              >
                                Ver Detalles
                              </Link>
                              <Link
                                href={`/admin/servicios/${service.id}/editar`}
                                className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                onClick={() => setOpenMenuId(null)}
                              >
                                Editar
                              </Link>
                              <div className="border-t border-gray-100 my-1"></div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteService(service.id, service.nombre);
                                }}
                                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {filteredServices.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-500">
                {searchTerm || filterTipo || filterActivo
                  ? 'No se encontraron servicios con los filtros aplicados'
                  : 'No hay servicios registrados'}
              </div>
              {!searchTerm && !filterTipo && !filterActivo && (
                <Link
                  href="/admin/servicios/nuevo"
                  className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-primary-600 bg-primary-100 hover:bg-primary-200"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Crear primer servicio
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}