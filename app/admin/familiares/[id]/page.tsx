'use client';
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatDate, calculateAge } from '@/lib/utils';
import { ArrowLeft, Edit, Phone, Mail, User, Calendar, Users, UserX } from 'lucide-react';
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

export default function FamiliarDetailPage() {
  const params = useParams();
  const [family, setFamily] = useState<Family | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      loadFamilyData();
    }
  }, [params.id]);

  async function loadFamilyData() {
    try {
      const response = await AuthClient.authenticatedFetch(`/api/families/${params.id}`);
      const data = await response.json();
      
      if (response.ok) {
        // Enriquecer con datos del socio titular
        const memberResponse = await AuthClient.authenticatedFetch(`/api/members/${data.socioTitularId}`);
        if (memberResponse.ok) {
          const memberData = await memberResponse.json();
          data.socioTitularName = `${memberData.nombres} ${memberData.apellidos}`;
          data.socioTitularCode = memberData.codigo;
        }
        setFamily(data);
      }
    } catch (error) {
      console.error('Error loading family data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive() {
    if (!family) return;
    
    try {
      const response = await AuthClient.authenticatedFetch(`/api/families/${family.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !family.activo })
      });
      
      if (response.ok) {
        setFamily(prev => prev ? { ...prev, activo: !prev.activo } : null);
      }
    } catch (error) {
      console.error('Error toggling family member:', error);
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

  if (!family) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <div className="text-gray-500">Familiar no encontrado</div>
          <Link href="/admin/familiares" className="text-primary-600 hover:text-primary-800 mt-4 inline-block">
            ← Volver a Familiares
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const edad = family.nacimiento ? calculateAge(family.nacimiento) : null;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/familiares"
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                {family.nombres} {family.apellidos}
              </h1>
              <p className="text-gray-600">{family.parentesco}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleActive}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                family.activo 
                  ? 'bg-red-600 text-white hover:bg-red-700' 
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {family.activo ? <UserX className="w-4 h-4" /> : <Users className="w-4 h-4" />}
              {family.activo ? 'Desactivar' : 'Activar'}
            </button>
            <Link
              href={`/admin/familiares/${family.id}/editar`}
              className="bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 flex items-center gap-2"
            >
              <Edit className="w-4 h-4" />
              Editar
            </Link>
          </div>
        </div>

        {/* Estado */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full mr-2 ${family.activo ? 'bg-green-500' : 'bg-gray-500'}`}></div>
              <div>
                <div className="text-sm text-gray-600">Estado</div>
                <div className="font-medium">{family.activo ? 'Activo' : 'Inactivo'}</div>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <Users className="w-6 h-6 text-blue-600 mr-2" />
              <div>
                <div className="text-sm text-gray-600">Parentesco</div>
                <div className="font-medium">{family.parentesco}</div>
              </div>
            </div>
          </div>
          
          {edad && (
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <Calendar className="w-6 h-6 text-purple-600 mr-2" />
                <div>
                  <div className="text-sm text-gray-600">Edad</div>
                  <div className="font-medium">{edad} años</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Información Principal */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow">
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <User className="w-5 h-5 mr-2" />
                  Información Personal
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-600">Nombres</label>
                    <div className="font-medium">{family.nombres}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Apellidos</label>
                    <div className="font-medium">{family.apellidos}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Cédula</label>
                    <div className="font-medium">{family.ci || 'No registrada'}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Parentesco</label>
                    <div className="font-medium">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {family.parentesco}
                      </span>
                    </div>
                  </div>
                  {family.nacimiento && (
                    <>
                      <div>
                        <label className="text-sm text-gray-600">Fecha de Nacimiento</label>
                        <div className="font-medium">{formatDate(family.nacimiento)}</div>
                      </div>
                      <div>
                        <label className="text-sm text-gray-600">Edad</label>
                        <div className="font-medium">{edad} años</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Información de Contacto */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Phone className="w-5 h-5 mr-2" />
                  Información de Contacto
                </h3>
                <div className="space-y-3">
                  {family.telefono ? (
                    <div className="flex items-center">
                      <Phone className="w-4 h-4 mr-2 text-gray-400" />
                      <span>{family.telefono}</span>
                    </div>
                  ) : (
                    <div className="text-gray-500">No hay teléfono registrado</div>
                  )}
                  
                  {family.email ? (
                    <div className="flex items-center">
                      <Mail className="w-4 h-4 mr-2 text-gray-400" />
                      <span>{family.email}</span>
                    </div>
                  ) : (
                    <div className="text-gray-500">No hay email registrado</div>
                  )}
                </div>
              </div>
            </div>

            {/* Información del Socio Titular */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Users className="w-5 h-5 mr-2" />
                  Socio Titular
                </h3>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{family.socioTitularName || 'Socio no encontrado'}</div>
                    <div className="text-sm text-gray-500">{family.socioTitularCode || 'N/A'}</div>
                  </div>
                  {family.socioTitularId && (
                    <Link
                      href={`/admin/socios/${family.socioTitularId}`}
                      className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                    >
                      Ver Socio →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Panel lateral */}
          <div className="space-y-6">
            {/* Foto */}
            <div className="bg-white rounded-lg shadow p-6 text-center">
              {family.foto ? (
                <img
                  src={family.foto}
                  alt={`${family.nombres} ${family.apellidos}`}
                  className="w-32 h-32 rounded-full mx-auto object-cover mb-4"
                />
              ) : (
                <div className="w-32 h-32 rounded-full mx-auto bg-gray-300 flex items-center justify-center mb-4">
                  <User className="w-16 h-16 text-gray-500" />
                </div>
              )}
              <h4 className="font-semibold">{family.nombres} {family.apellidos}</h4>
              <p className="text-sm text-gray-600">{family.parentesco}</p>
            </div>

            {/* Información Adicional */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4">Información Adicional</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-600">Grupo Familiar</label>
                    <div className="font-medium">{family.grupoFamiliarId}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Estado</label>
                    <div className="font-medium">
                      <span className={`px-2 py-1 rounded text-sm ${
                        family.activo 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {family.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}