'use client';
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { getLocalDateString } from '@/lib/timezone-config';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload } from 'lucide-react';
import Link from 'next/link';

type Categoria = 'Individual' | 'Familiar';
type Subcategoria = 'Socio' | 'Socio Patrimonial' | 'Socio Vitalicio';
type EstadoSocio = 'AL_DIA' | 'ATRASADO' | 'SUSPENDIDO';

export default function NuevoSocioPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
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
    alta: getLocalDateString(),
    estado: 'AL_DIA' as EstadoSocio,
    foto: '',
    observaciones: '',
    aplicarCuotaIngreso: false
  });

  // Función para verificar si existe un miembro con la misma CI
  const validateCI = async (ci: string) => {
    if (!ci || ci.trim().length === 0) {
      setCiError('');
      return;
    }

    try {
      const response = await AuthClient.authenticatedFetch(`/api/members?ci=${encodeURIComponent(ci.trim())}`);
      const data = await response.json();
      
      if (response.ok && Array.isArray(data) && data.length > 0) {
        const existingMember = data[0];
        setCiError(`Ya existe un ${existingMember.subcategoria === 'NO SOCIO' ? 'no-socio' : 'socio'} registrado con la CI ${ci}: ${existingMember.nombres} ${existingMember.apellidos} (${existingMember.codigo})`);
      } else {
        setCiError('');
      }
    } catch (error) {
      console.error('Error validating CI:', error);
      // No mostramos error en caso de problemas de conectividad para no bloquear el usuario
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
      // Crear el socio
      const response = await AuthClient.authenticatedFetch('/api/members', {
        method: 'POST',
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        // Si se seleccionó aplicar la cuota de ingreso, crear el débito
        if (formData.aplicarCuotaIngreso && data.member?.id) {
          try {
            // Usar la fecha de alta tal como está, sin modificar ni convertir
            const fechaAlta = formData.alta;
            const debitResponse = await AuthClient.authenticatedFetch('/api/movements', {
              method: 'POST',
              body: JSON.stringify({
                memberId: data.member.id,
                fecha: fechaAlta,
                concepto: 'Cuota de Ingreso',
                tipo: 'DEBIT',
                monto: 15000000,
                origen: 'SERVICIO',
                refId: 's2', // ID del servicio "Cuota de Ingreso"
                observaciones: 'Cuota de ingreso aplicada automáticamente al crear el socio',
                vencimiento: fechaAlta
              })
            });

            if (!debitResponse.ok) {
              const debitError = await debitResponse.json();
              console.error('Error al crear débito de cuota de ingreso:', debitError);
              setMsg('Socio creado exitosamente, pero hubo un error al crear la cuota de ingreso. Puede agregarla manualmente.');
              setTimeout(() => router.push('/admin/socios'), 2000);
              return;
            }
          } catch (debitError) {
            console.error('Error al crear débito:', debitError);
            setMsg('Socio creado exitosamente, pero hubo un error al crear la cuota de ingreso. Puede agregarla manualmente.');
            setTimeout(() => router.push('/admin/socios'), 2000);
            return;
          }
        }
        
        router.push('/admin/socios');
      } else {
        setMsg(data.msg || 'Error al crear socio');
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
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/uploads', {
        method: 'POST',
        body: formData
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

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/admin/socios"
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Nuevo Socio</h1>
            <p className="text-gray-600">Registra un nuevo socio en el club</p>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombres *
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.nombres}
                    onChange={(e) => setFormData(prev => ({ ...prev, nombres: e.target.value }))}
                    placeholder="Juan Carlos"
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
                    placeholder="Pérez López"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cédula de Identidad *
                  </label>
                  <input
                    type="text"
                    required
                    className={`w-full px-3 py-1.5 border rounded-md focus:outline-none focus:ring-2 ${
                      ciError 
                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                        : 'border-gray-300 focus:ring-primary-500'
                    }`}
                    value={formData.ci}
                    onChange={(e) => {
                      const newCi = e.target.value;
                      setFormData(prev => ({ ...prev, ci: newCi }));
                      // Validar CI con debounce
                      setTimeout(() => validateCI(newCi), 500);
                    }}
                    onBlur={(e) => validateCI(e.target.value)}
                    placeholder="1234567"
                  />
                  {ciError && (
                    <p className="mt-1 text-sm text-red-600">{ciError}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    RUC
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.ruc}
                    onChange={(e) => setFormData(prev => ({ ...prev, ruc: e.target.value }))}
                    placeholder="1234567-8"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de Nacimiento
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.nacimiento}
                    onChange={(e) => setFormData(prev => ({ ...prev, nacimiento: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nacionalidad
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.nacionalidad}
                    onChange={(e) => setFormData(prev => ({ ...prev, nacionalidad: e.target.value }))}
                    placeholder="Paraguaya"
                  />
                </div>
              </div>
            </div>

            {/* Categorización */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Categorización</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Categoría *
                  </label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subcategoría *
                  </label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.subcategoria}
                    onChange={(e) => setFormData(prev => ({ ...prev, subcategoria: e.target.value as Subcategoria }))}
                  >
                    <option value="Socio">Socio</option>
                    <option value="Socio Patrimonial">Socio Patrimonial</option>
                    <option value="Socio Vitalicio">Socio Vitalicio</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Estado *
                  </label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dirección
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.direccion}
                    onChange={(e) => setFormData(prev => ({ ...prev, direccion: e.target.value }))}
                    placeholder="Av. España 1234, Asunción"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.telefono}
                    onChange={(e) => setFormData(prev => ({ ...prev, telefono: e.target.value }))}
                    placeholder="021-123456"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Celular
                  </label>
                  <input
                    type="tel"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.celular}
                    onChange={(e) => setFormData(prev => ({ ...prev, celular: e.target.value }))}
                    placeholder="0981-123456"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="juan.perez@email.com"
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
                    placeholder="Contador - Empresa ABC"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.observaciones}
                    onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
                    placeholder="Notas adicionales sobre el socio..."
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
                      {uploadingPhoto ? 'Subiendo...' : 'Subir Foto'}
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
                  <p className="text-xs text-gray-500 mt-1">Se creará automáticamente un débito por la cuota de ingreso al crear el socio</p>
                </div>
              </div>
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Link
                href="/admin/socios"
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={loading || !!ciError}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creando...' : 'Crear Socio'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}