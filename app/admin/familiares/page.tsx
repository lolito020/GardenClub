'use client';
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/utils';
import { Plus, Search, Edit, Eye, Users, UserX } from 'lucide-react';
import Link from 'next/link';

interface Family {
  id: string;
  grupoFamiliarId: string;
  socioTitularId: string;
  nombres: string;
  apellidos: string;
  ci?: string;
  parentesco: string;
  nacimiento?: string;
  telefono?: string;
  email?: string;
  foto?: string;
  activo: boolean;
  // Datos enriquecidos
  socioTitularName?: string;
  socioTitularCode?: string;
}

export default function FamiliaresPage() {
  async function deleteFamily(familyId: string) {
    if (!window.confirm('¿Seguro que deseas eliminar este familiar?')) return;
    try {
      const response = await AuthClient.authenticatedFetch(`/api/families/${familyId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        await loadFamilies();
      } else {
        alert('No se pudo eliminar el familiar');
      }
    } catch (error) {
      alert('Error al eliminar familiar');
      console.error('Error deleting family:', error);
    }
  }
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterParentesco, setFilterParentesco] = useState('');
  const [filterActivo, setFilterActivo] = useState('');

  useEffect(() => {
    loadFamilies();
  }, []);

  async function loadFamilies() {
    try {
      const response = await AuthClient.authenticatedFetch('/api/families');
      const data = await response.json();
      setFamilies(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading families:', error);
      setFamilies([]);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(familyId: string, currentState: boolean) {
    try {
      const response = await AuthClient.authenticatedFetch(`/api/families/${familyId}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !currentState })
      });
      
      if (response.ok) {
        await loadFamilies();
      }
    } catch (error) {
      console.error('Error toggling family member:', error);
    }
  }

  const filteredFamilies = families.filter(family => {
    const matchesSearch = 
      family.nombres.toLowerCase().includes(searchTerm.toLowerCase()) ||
      family.apellidos.toLowerCase().includes(searchTerm.toLowerCase()) ||
      family.socioTitularName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      family.socioTitularCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (family.ci && family.ci.includes(searchTerm));
    
    const matchesParentesco = !filterParentesco || family.parentesco === filterParentesco;
    const matchesActivo = !filterActivo || 
      (filterActivo === 'activo' && family.activo) ||
      (filterActivo === 'inactivo' && !family.activo);
    
    return matchesSearch && matchesParentesco && matchesActivo;
  });

  const parentescos = [...new Set(families.map(f => f.parentesco))];

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
            <h1 className="text-2xl font-semibold text-gray-900">Gestión de Familiares</h1>
            <p className="text-gray-600">Administra los familiares de los socios del club</p>
          </div>
          <Link
            href="/admin/familiares/nuevo"
            className="bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo Familiar
          </Link>
        </div>

        {/* Filtros y búsqueda */}
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
                  placeholder="Nombre, socio titular o CI..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Parentesco
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={filterParentesco}
                onChange={(e) => setFilterParentesco(e.target.value)}
              >
                <option value="">Todos</option>
                {parentescos.map(parentesco => (
                  <option key={parentesco} value={parentesco}>{parentesco}</option>
                ))}
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
                  setFilterParentesco('');
                  setFilterActivo('');
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Estadística única: Total Familiares */}
        <div className="bg-white p-4 rounded-lg shadow mb-4">
          <span className="text-base font-semibold text-gray-900">Total Familiares: {families.length}</span>
        </div>

        {/* Tabla de familiares */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Familiar
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Socio Titular
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Parentesco
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contacto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nacimiento
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
                {filteredFamilies.map((family) => (
                  <tr key={family.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          {family.foto ? (
                            <img
                              className="h-10 w-10 rounded-full object-cover"
                              src={family.foto}
                              alt={`${family.nombres} ${family.apellidos}`}
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                              <span className="text-sm font-medium text-gray-700">
                                {family.nombres.charAt(0)}{family.apellidos.charAt(0)}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {family.nombres} {family.apellidos}
                          </div>
                          <div className="text-sm text-gray-500">
                            {family.ci ? `CI: ${family.ci}` : 'Sin CI'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {family.socioTitularName || 'N/A'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {family.socioTitularCode || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {family.parentesco}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{family.telefono || '-'}</div>
                      <div className="text-sm text-gray-500">{family.email || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {family.nacimiento ? formatDate(family.nacimiento) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => toggleActive(family.id, family.activo)}
                        className={`p-1 rounded ${family.activo ? 'text-green-600 hover:text-green-800' : 'text-gray-400 hover:text-gray-600'}`}
                      >
                        {family.activo ? <Users className="w-5 h-5" /> : <UserX className="w-5 h-5" />}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/familiares/${family.id}`}
                          className="text-primary-600 hover:text-primary-900 p-1"
                          title="Ver detalles"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link
                          href={`/admin/familiares/${family.id}/editar`}
                          className="text-gray-600 hover:text-gray-900 p-1"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => deleteFamily(family.id)}
                          className="text-red-600 hover:text-red-900 p-1"
                          title="Eliminar"
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {filteredFamilies.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-500">
                {searchTerm || filterParentesco || filterActivo
                  ? 'No se encontraron familiares con los filtros aplicados'
                  : 'No hay familiares registrados'}
              </div>
              {!searchTerm && !filterParentesco && !filterActivo && (
                <Link
                  href="/admin/familiares/nuevo"
                  className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-primary-600 bg-primary-100 hover:bg-primary-200"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Registrar primer familiar
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}