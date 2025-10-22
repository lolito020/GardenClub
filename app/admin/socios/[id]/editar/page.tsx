'use client';
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Upload } from 'lucide-react';
import Link from 'next/link';

type Categoria = 'Individual' | 'Familiar';
type Subcategoria = 'Socio' | 'Socio Patrimonial' | 'Socio Vitalicio';
type EstadoSocio = 'AL_DIA' | 'ATRASADO' | 'SUSPENDIDO';

interface Member {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
  ci: string;
  ruc?: string;
  categoria: Categoria;
  subcategoria: Subcategoria;
  direccion?: string;
  telefono?: string;
  celular?: string;
  email?: string;
  nacimiento?: string;
  nacionalidad?: string;
  datosLaborales?: string;
  alta: string;
  estado: EstadoSocio;
  foto?: string;
  observaciones?: string;
}

export default function EditarSocioPage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [msg, setMsg] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [ciError, setCiError] = useState('');
  
  const [formData, setFormData] = useState({
    nombres: '',
    apellidos: '',
    ci: '',
    ruc: '',
    categoria: 'Individual' as Categoria,
    subcategoria: 'Socio' as Subcategoria,
    direccion: '',
    telefono: '',
    celular: '',
    email: '',
    nacimiento: '',
    nacionalidad: 'Paraguaya',
    datosLaborales: '',
    alta: '',
    estado: 'AL_DIA' as EstadoSocio,
    foto: '',
    observaciones: '',
    aplicarCuotaIngreso: false
  });

  useEffect(() => {
    if (params.id) {
      loadMemberData();
    }
  }, [params.id]);

  async function loadMemberData() {
    try {
      const response = await AuthClient.authenticatedFetch(`/api/members/${params.id}`);
      const data = await response.json();
      
      if (response.ok) {
        setMember(data);
        setFormData({
          nombres: data.nombres,
          apellidos: data.apellidos,
          ci: data.ci,
          ruc: data.ruc || '',
          categoria: data.categoria,
          subcategoria: data.subcategoria,
          direccion: data.direccion || '',
          telefono: data.telefono || '',
          celular: data.celular || '',
          email: data.email || '',
          nacimiento: data.nacimiento || '',
          nacionalidad: data.nacionalidad || 'Paraguaya',
          datosLaborales: data.datosLaborales || '',
          alta: data.alta,
          estado: data.estado,
          foto: data.foto || '',
          observaciones: data.observaciones || '',
          aplicarCuotaIngreso: data.aplicarCuotaIngreso || false
        });
      } else {
        setMsg('Socio no encontrado');
      }
    } catch (error) {
      setMsg('Error al cargar socio');
    } finally {
      setLoadingData(false);
    }
  }

  // Función para verificar si existe otro miembro con la misma CI (excluyendo el actual)
  const validateCI = async (ci: string) => {
    if (!ci || ci.trim().length === 0 || !member) {
      setCiError('');
      return;
    }

    // No validar si es la misma CI del socio actual
    if (ci.trim() === member.ci) {
      setCiError('');
      return;
    }

    try {
      const response = await AuthClient.authenticatedFetch(`/api/members?ci=${encodeURIComponent(ci.trim())}`);
      const data = await response.json();
      
      if (response.ok && Array.isArray(data) && data.length > 0) {
        // Filtrar el miembro actual de los resultados
        const otherMembers = data.filter(m => m.id !== member.id);
        
        if (otherMembers.length > 0) {
          const existingMember = otherMembers[0];
          setCiError(`Ya existe un ${existingMember.subcategoria === 'NO SOCIO' ? 'no-socio' : 'socio'} registrado con la CI ${ci}: ${existingMember.nombres} ${existingMember.apellidos} (${existingMember.codigo})`);
        } else {
          setCiError('');
        }
      } else {
        setCiError('');
      }
    } catch (error) {
      console.error('Error validating CI:', error);
      setCiError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    
    // Verificar si hay error de CI duplicado
    if (ciError) {
      setMsg('Por favor, corrija los errores antes de continuar.');
      return;
    }
    
    setLoading(true);

    try {
      const response = await AuthClient.authenticatedFetch(`/api/members/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        router.push(`/admin/socios/${params.id}`);
      } else {
        setMsg(data.msg || 'Error al actualizar socio');
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

  // Validaciones básicas
  const MAX_MB = 8;
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type)) {
    setMsg('El archivo debe ser una imagen (jpg, png, webp, gif).');
    return;
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    setMsg(`La imagen no puede superar ${MAX_MB}MB.`);
    return;
  }

  setUploadingPhoto(true);
  setMsg('');

  // Preview inmediato para mejor UX (no persiste, solo visual)
  try {
    const localPreview = URL.createObjectURL(file);
    setFormData(prev => ({ ...prev, foto: localPreview }));
  } catch {}

  try {
    const form = new FormData();
    form.append('file', file);

    // Timeout defensivo (30s)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    const res = await AuthClient.authenticatedFetch('/api/uploads', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });

    clearTimeout(timer);

    let data: any = {};
    try {
      data = await res.json();
    } catch {
      // si el backend no envía JSON legible
      throw new Error('Respuesta inválida del servidor');
    }

    if (!res.ok || !data?.ok || !data?.path) {
      throw new Error(data?.msg || 'No se pudo subir la foto');
    }

    // Guardamos la ruta que devuelve el server (persistible al guardar el socio)
    setFormData(prev => ({ ...prev, foto: data.path }));
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      setMsg('La subida tardó demasiado. Intentalo de nuevo.');
    } else {
      setMsg(err?.message || 'Error al subir la foto');
    }
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

  if (!member) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <div className="text-gray-500">Socio no encontrado</div>
          <Link href="/admin/socios" className="text-primary-600 hover:text-primary-800 mt-4 inline-block">
            ← Volver a Socios
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
          <Link href={`/admin/socios/${params.id}`} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Editar Socio</h1>
            <p className="text-gray-600">Modifica la información del socio</p>
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
          <form onSubmit={handleSubmit} className="p-6 space-y-8">
            {/* Información Personal */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Información Personal</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombres *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.nombres}
                    onChange={(e) => setFormData(prev => ({ ...prev, nombres: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Apellidos *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.apellidos}
                    onChange={(e) => setFormData(prev => ({ ...prev, apellidos: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cédula de Identidad *</label>
                  <input
                    type="text"
                    required
                    className={`w-full px-3 py-1.5 border rounded-md focus:outline-none focus:ring-2 ${
                      ciError ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-primary-500'
                    }`}
                    value={formData.ci}
                    onChange={(e) => {
                      const newCi = e.target.value;
                      setFormData(prev => ({ ...prev, ci: newCi }));
                      setTimeout(() => validateCI(newCi), 500);
                    }}
                    onBlur={(e) => validateCI((e.target as HTMLInputElement).value)}
                  />
                  {ciError && <p className="mt-1 text-sm text-red-600">{ciError}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">RUC</label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.ruc}
                    onChange={(e) => setFormData(prev => ({ ...prev, ruc: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Nacimiento</label>
                  <input
                    type="date"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.nacimiento}
                    onChange={(e) => setFormData(prev => ({ ...prev, nacimiento: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nacionalidad</label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.nacionalidad}
                    onChange={(e) => setFormData(prev => ({ ...prev, nacionalidad: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Categorización */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Categorización</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
                  <select
                    required
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.categoria}
                    onChange={(e) => setFormData(prev => ({ ...prev, categoria: e.target.value as Categoria }))}
                  >
                    <option value="Individual">Individual</option>
                    <option value="Familiar">Familiar</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subcategoría *</label>
                  <select
                    required
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.subcategoria}
                    onChange={(e) => setFormData(prev => ({ ...prev, subcategoria: e.target.value as Subcategoria }))}
                  >
                    <option value="Socio">Socio</option>
                    <option value="Socio Patrimonial">Socio Patrimonial</option>
                    <option value="Socio Vitalicio">Socio Vitalicio</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado *</label>
                  <select
                    required
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.estado}
                    onChange={(e) => setFormData(prev => ({ ...prev, estado: e.target.value as EstadoSocio }))}
                  >
                    <option value="AL_DIA">Al Día</option>
                    <option value="ATRASADO">Atrasado</option>
                    <option value="SUSPENDIDO">Suspendido</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Información de Contacto */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Información de Contacto</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.direccion}
                    onChange={(e) => setFormData(prev => ({ ...prev, direccion: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input
                    type="tel"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.telefono}
                    onChange={(e) => setFormData(prev => ({ ...prev, telefono: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Celular</label>
                  <input
                    type="tel"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.celular}
                    onChange={(e) => setFormData(prev => ({ ...prev, celular: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Información Adicional */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Información Adicional</h3>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-start">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Alta *</label>
                  <input
                    type="date"
                    required
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.alta}
                    onChange={(e) => setFormData(prev => ({ ...prev, alta: e.target.value }))}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Datos Laborales</label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.datosLaborales}
                    onChange={(e) => setFormData(prev => ({ ...prev, datosLaborales: e.target.value }))}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.observaciones}
                    onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
                  />
                </div>

                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Foto</label>
                  <div className="flex items-center gap-2">
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
                      className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 disabled:opacity-50 text-sm"
                    >
                      <Upload className="w-4 h-4" />
                      {uploadingPhoto ? 'Subiendo...' : 'Cambiar Foto'}
                    </label>
                  </div>
                  {formData.foto && (
                    <img src={formData.foto} alt="Preview" className="w-10 h-10 rounded-full object-cover mt-2" />
                  )}
                </div>

                <div className="md:col-span-6">
                  <label className="flex items-center gap-2 cursor-pointer mt-2">
                    <input
                      type="checkbox"
                      checked={formData.aplicarCuotaIngreso}
                      onChange={(e) => setFormData(prev => ({ ...prev, aplicarCuotaIngreso: e.target.checked }))}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Aplicar Cuota de Ingreso (Gs. 15.000.000)</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1">Se creará automáticamente un débito por la cuota de ingreso al guardar los cambios</p>
                </div>
              </div>
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Link href={`/admin/socios/${params.id}`} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancelar</Link>
              <button type="submit" disabled={loading || !!ciError} className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}