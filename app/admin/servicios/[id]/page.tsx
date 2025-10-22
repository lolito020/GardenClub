'use client';
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';
import {
  ArrowLeft,
  Edit,
  ToggleLeft,
  ToggleRight,
  Users,
  DollarSign,
  Calendar,
  Info,
  Tag,
} from 'lucide-react';
import Link from 'next/link';

type TipoServicio = 'MENSUAL' | 'ANUAL' | 'UNICO';
type Subcategoria = 'Socio' | 'Socio Patrimonial' | 'Socio Vitalicio';

interface Service {
  id: string;
  nombre: string;
  descripcion?: string;
  precio: number;
  tipo: TipoServicio;
  obligatorio?: boolean;
  aplicaA?: Subcategoria[];
  comisionCobrador?: number;
  activo: boolean;
  categoria?: string;
  socios?: boolean;
  noSocios?: boolean;
}

export default function ServicioDetailPage() {
  const params = useParams();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    sociosUsando: 0,
    ingresosMes: 0,
    comisionesPagadas: 0,
  });

  useEffect(() => {
    if (params.id) {
      loadServiceData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function loadServiceData() {
    try {
      const response = await AuthClient.authenticatedFetch(`/api/services/${params.id}`);
      const data = await response.json();

      if (response.ok) {
        setService(data);
        // Si luego calculas métricas reales desde backend, solo reemplaza estos ceros
        setStats({
          sociosUsando: 0,
          ingresosMes: 0,
          comisionesPagadas: 0,
        });
      }
    } catch (error) {
      console.error('Error loading service:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive() {
    if (!service) return;

    try {
      const response = await AuthClient.authenticatedFetch(`/api/services/${service.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !service.activo }),
      });

      if (response.ok) {
        setService((prev) => (prev ? { ...prev, activo: !prev.activo } : null));
      }
    } catch (error) {
      console.error('Error toggling service:', error);
    }
  }

  const getTipoBadge = (tipo: string) => {
    return (
      <span className="text-black font-medium text-sm">{tipo}</span>
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

  if (!service) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <div className="text-gray-500">Servicio no encontrado</div>
          <Link
            href="/admin/servicios"
            className="text-primary-600 hover:text-primary-800 mt-4 inline-block"
          >
            ← Volver a Servicios
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
            <Link href="/admin/servicios" className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{service.nombre}</h1>
              <p className="text-gray-600">Detalles del servicio</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleActive}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                service.activo ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {service.activo ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
              {service.activo ? 'Desactivar' : 'Activar'}
            </button>
            <Link
              href={`/admin/servicios/${service.id}/editar`}
              className="bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 flex items-center gap-2"
            >
              <Edit className="w-4 h-4" />
              Editar
            </Link>
          </div>
        </div>


  <div className="grid grid-cols-1 gap-6">
          {/* Información Principal */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="p-8">
                <h3 className="text-xl font-bold mb-6 flex items-center text-gray-900 border-b border-gray-200 pb-4">
                  <Info className="w-6 h-6 mr-3 text-primary-600" />
                  Información del Servicio
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Nombre</label>
                    <div className="text-lg font-semibold text-black">{service.nombre}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Precio</label>
                    <div className="text-lg font-bold text-black">{formatCurrency(service.precio)}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</label>
                    <div className="mt-2">{getTipoBadge(service.tipo)}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Comisión Cobrador</label>
                    <div className="text-lg font-semibold text-black">
                      {service.comisionCobrador ? `${service.comisionCobrador}%` : 'Sin comisión'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Para Socios</label>
                    <div className="text-lg font-semibold text-black">{service.socios ? 'SÍ' : 'NO'}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Para No Socios</label>
                    <div className="text-lg font-semibold text-black">{service.noSocios ? 'SÍ' : 'NO'}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Servicio Obligatorio</label>
                    <div className="text-lg font-semibold text-black">{service.obligatorio ? 'Sí' : 'No'}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</label>
                    <div className="mt-2">
                      <span className={`inline-flex px-3 py-1.5 rounded-lg text-sm font-semibold ${service.activo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {service.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                      <Tag className="w-4 h-4" /> Categoría
                    </label>
                    <div className="text-lg font-semibold text-black">
                      {service.categoria ? service.categoria : '—'}
                    </div>
                  </div>
                  {service.aplicaA && service.aplicaA.length > 0 && (
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Aplica a</label>
                      <div className="text-lg font-semibold text-black">
                        {service.aplicaA.join(', ')}
                      </div>
                    </div>
                  )}
                </div>

                {service.descripcion && (
                  <div className="mt-8 pt-6 border-t border-gray-200 space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Descripción</label>
                    <div className="text-base leading-relaxed text-black">{service.descripcion}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Panel lateral */}
          <div className="space-y-6">

          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
