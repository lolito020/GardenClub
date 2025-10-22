'use client';

import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';
import { Plus, Edit, Trash2, ArrowLeft, ToggleLeft, ToggleRight } from 'lucide-react';
import Link from 'next/link';

interface Service {
  id: string;
  nombre: string;
  descripcion?: string;
  permiteAgendamiento?: boolean;
}

interface Venue {
  id: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  precioBaseHora: number;
  garantia: number;
  capacidad: number;
}

export default function ServicioEspaciosPage() {
  const params = useParams();
  const router = useRouter();
  const serviceId = params.id as string;

  const [service, setService] = useState<Service | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    precioBaseHora: '',
    garantia: '',
    capacidad: '',
    activo: true
  });

  useEffect(() => {
    loadData();
  }, [serviceId]);

  async function loadData() {
    try {
      // Cargar servicio
      const serviceRes = await AuthClient.authenticatedFetch(`/api/services/${serviceId}`);
      const serviceData = await serviceRes.json();
      
      if (!serviceRes.ok || !serviceData.permiteAgendamiento) {
        router.push('/admin/servicios');
        return;
      }
      
      setService(serviceData);

      // Cargar espacios/venues
      const venuesRes = await AuthClient.authenticatedFetch('/api/venues');
      const venuesData = await venuesRes.json();
      setVenues(Array.isArray(venuesData) ? venuesData : []);
      
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  function openModal(venue?: Venue) {
    if (venue) {
      setEditingVenue(venue);
      setForm({
        nombre: venue.nombre,
        descripcion: venue.descripcion || '',
        precioBaseHora: venue.precioBaseHora.toString(),
        garantia: venue.garantia.toString(),
        capacidad: venue.capacidad.toString(),
        activo: venue.activo
      });
    } else {
      setEditingVenue(null);
      setForm({
        nombre: '',
        descripcion: '',
        precioBaseHora: '',
        garantia: '0',
        capacidad: '1',
        activo: true
      });
    }
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingVenue(null);
    setForm({
      nombre: '',
      descripcion: '',
      precioBaseHora: '',
      garantia: '0',
      capacidad: '1',
      activo: true
    });
  }

  async function saveVenue() {
    if (!form.nombre || !form.precioBaseHora) {
      alert('Nombre y precio por hora son obligatorios');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre,
        descripcion: form.descripcion,
        precioBaseHora: Number(form.precioBaseHora),
        garantia: Number(form.garantia) || 0,
        capacidad: Number(form.capacidad) || 1,
        activo: form.activo
      };

      const url = editingVenue 
        ? `/api/venues/${editingVenue.id}`
        : '/api/venues';
      
      const method = editingVenue ? 'PATCH' : 'POST';

      const response = await AuthClient.authenticatedFetch(url, {
        method,
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok) {
        closeModal();
        await loadData();
      } else {
        alert(result.msg || 'Error al guardar el espacio');
      }
    } catch (error) {
      console.error('Error saving venue:', error);
      alert('Error al guardar el espacio');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(venueId: string, currentState: boolean) {
    try {
      const response = await AuthClient.authenticatedFetch(`/api/venues/${venueId}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !currentState })
      });
      
      if (response.ok) {
        await loadData();
      }
    } catch (error) {
      console.error('Error toggling venue:', error);
    }
  }

  async function deleteVenue(venueId: string, venueName: string) {
    if (!confirm(`¿Estás seguro de que quieres eliminar el espacio "${venueName}"?`)) {
      return;
    }

    try {
      const response = await AuthClient.authenticatedFetch(`/api/venues/${venueId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        await loadData();
        alert('Espacio eliminado correctamente');
      } else {
        const result = await response.json();
        alert(result.msg || 'Error al eliminar el espacio');
      }
    } catch (error) {
      console.error('Error deleting venue:', error);
      alert('Error al eliminar el espacio');
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

  if (!service) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <div className="text-gray-500">Servicio no encontrado o no permite agendamiento</div>
          <Link href="/admin/servicios" className="mt-4 text-primary-600 hover:underline">
            Volver a Servicios
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header con breadcrumb */}
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/admin/servicios" className="hover:text-primary-600">
              Servicios
            </Link>
            <span>/</span>
            <span className="font-medium">{service.nombre}</span>
            <span>/</span>
            <span>Espacios</span>
          </div>
          
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                Espacios para {service.nombre}
              </h1>
              <p className="text-gray-600">
                Administra los espacios físicos donde se puede reservar este servicio
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/admin/servicios"
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver
              </Link>
              <button
                onClick={() => openModal()}
                className="bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Nuevo Espacio
              </button>
            </div>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-gray-900">{venues.length}</div>
            <div className="text-sm text-gray-600">Total Espacios</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600">
              {venues.filter(v => v.activo).length}
            </div>
            <div className="text-sm text-gray-600">Espacios Activos</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">
              {venues.reduce((sum, v) => sum + v.capacidad, 0)}
            </div>
            <div className="text-sm text-gray-600">Capacidad Total</div>
          </div>
        </div>

        {/* Tabla de espacios */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Espacio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Precio/Hora
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Garantía
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Capacidad
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
                {venues.map((venue) => (
                  <tr key={venue.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {venue.nombre}
                        </div>
                        {venue.descripcion && (
                          <div className="text-sm text-gray-500">{venue.descripcion}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(venue.precioBaseHora)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatCurrency(venue.garantia)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {venue.capacidad} {venue.capacidad === 1 ? 'persona' : 'personas'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => toggleActive(venue.id, venue.activo)}
                        className={`p-1 rounded transition-colors ${
                          venue.activo 
                            ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50' 
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {venue.activo ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openModal(venue)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar espacio"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteVenue(venue.id, venue.nombre)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar espacio"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {venues.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-500 mb-4">
                No hay espacios configurados para este servicio
              </div>
              <button
                onClick={() => openModal()}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-primary-600 bg-primary-100 hover:bg-primary-200"
              >
                <Plus className="w-4 h-4 mr-2" />
                Crear primer espacio
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal para crear/editar espacio */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-lg shadow-lg">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold">
                {editingVenue ? 'Editar Espacio' : 'Nuevo Espacio'}
              </h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del Espacio *
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm(prev => ({ ...prev, nombre: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ej: Cancha de Tenis 1"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripción
                </label>
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm(prev => ({ ...prev, descripcion: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Descripción opcional del espacio"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Precio por Hora (Gs.) *
                  </label>
                  <input
                    type="number"
                    value={form.precioBaseHora}
                    onChange={(e) => setForm(prev => ({ ...prev, precioBaseHora: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="50000"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Garantía (Gs.)
                  </label>
                  <input
                    type="number"
                    value={form.garantia}
                    onChange={(e) => setForm(prev => ({ ...prev, garantia: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="100000"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Capacidad (personas)
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.capacidad}
                  onChange={(e) => setForm(prev => ({ ...prev, capacidad: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="4"
                />
              </div>
              
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={(e) => setForm(prev => ({ ...prev, activo: e.target.checked }))}
                    className="w-4 h-4 text-primary-600"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Espacio activo
                  </span>
                </label>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 p-6 border-t">
              <button
                onClick={closeModal}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveVenue}
                disabled={saving}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : (editingVenue ? 'Actualizar' : 'Crear')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}