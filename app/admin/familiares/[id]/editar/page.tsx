'use client';
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Upload } from 'lucide-react';
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
}

export default function EditarFamiliarPage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [msg, setMsg] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [family, setFamily] = useState<Family | null>(null);
  
  const [formData, setFormData] = useState({
    nombres: '',
    apellidos: '',
    ci: '',
    parentesco: '',
    nacimiento: '',
    telefono: '',
    email: '',
    foto: '',
    activo: true
  });

  const parentescos = [
    'Esposo/a',
    'Hijo/a',
    'Padre/Madre',
    'Hermano/a',
    'Abuelo/a',
    'Nieto/a',
    'Otro'
  ];

  useEffect(() => {
    if (params.id) {
      loadFamily();
    }
  }, [params.id]);

  async function loadFamily() {
    try {
      const response = await AuthClient.authenticatedFetch(`/api/families/${params.id}`);
      const data = await response.json();
      
      if (response.ok) {
        setFamily(data);
        setFormData({
          nombres: data.nombres,
          apellidos: data.apellidos,
          ci: data.ci || '',
          parentesco: data.parentesco,
          nacimiento: data.nacimiento || '',
          telefono: data.telefono || '',
          email: data.email || '',
          foto: data.foto || '',
          activo: data.activo
        });
      } else {
        setMsg('Familiar no encontrado');
      }
    } catch (error) {
      setMsg('Error al cargar familiar');
    } finally {
      setLoadingData(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setLoading(true);

    try {
      const response = await AuthClient.authenticatedFetch(`/api/families/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        router.push(`/admin/familiares/${params.id}`);
      } else {
        setMsg(data.msg || 'Error al actualizar familiar');
      }
    } catch (error) {
      setMsg('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);

      const response = await fetch('/api/uploads', {
        method: 'POST',
        body: formDataUpload
      });

      const data = await response.json();
      if (data.ok) {
        setFormData(prev => ({ ...prev, foto: data.path }));
      } else {
        setMsg('Error al subir la foto');
      }
    } catch (error) {
      setMsg('Error al subir la foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loadingData) {
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

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href={`/admin/familiares/${params.id}`}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Editar Familiar</h1>
            <p className="text-gray-600">Modifica la información del familiar</p>
          </div>
        </div>

        {msg && (
          <div className={`p-4 rounded-lg ${
            msg.includes('Error') 
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-green-50 text-green-800 border border-green-200'
          }`}>
            {msg}
          </div>
        )}

        {/* Formulario */}
        <div className="bg-white rounded-lg shadow">
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Información Personal */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Información Personal</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombres *
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.nombres}
                    onChange={(e) => setFormData(prev => ({ ...prev, nombres: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Apellidos *
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.apellidos}
                    onChange={(e) => setFormData(prev => ({ ...prev, apellidos: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cédula de Identidad
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.ci}
                    onChange={(e) => setFormData(prev => ({ ...prev, ci: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Parentesco *
                  </label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.parentesco}
                    onChange={(e) => setFormData(prev => ({ ...prev, parentesco: e.target.value }))}
                  >
                    <option value="">Seleccionar parentesco</option>
                    {parentescos.map(parentesco => (
                      <option key={parentesco} value={parentesco}>{parentesco}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de Nacimiento
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.nacimiento}
                    onChange={(e) => setFormData(prev => ({ ...prev, nacimiento: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.telefono}
                    onChange={(e) => setFormData(prev => ({ ...prev, telefono: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Foto del Familiar
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                      id="photo-upload"
                      disabled={uploadingPhoto}
                    />
                    <label
                      htmlFor="photo-upload"
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Upload className="w-4 h-4" />
                      {uploadingPhoto ? 'Subiendo...' : 'Cambiar Foto'}
                    </label>
                    {formData.foto && (
                      <img
                        src={formData.foto}
                        alt="Preview"
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Estado */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Estado</h3>
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    checked={formData.activo}
                    onChange={(e) => setFormData(prev => ({ ...prev, activo: e.target.checked }))}
                  />
                  <span className="ml-2 text-sm text-gray-700">Familiar Activo</span>
                </label>
              </div>
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Link
                href={`/admin/familiares/${params.id}`}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                {loading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}