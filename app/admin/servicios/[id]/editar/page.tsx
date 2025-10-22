'use client';
import { gsFormat, gsParse } from "@/lib/utils";
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Settings, Pencil, Trash2, X } from 'lucide-react';
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
  permiteAgendamiento?: boolean;
  permiteHorasExtras?: boolean;
  precioHoraExtra?: number;
}

interface Category {
  id: string;
  nombre: string;
}

export default function EditarServicioPage() {
  const params = useParams() as { id?: string };
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [msg, setMsg] = useState('');
  const [service, setService] = useState<Service | null>(null);

  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    precio: '',
    tipo: 'MENSUAL' as TipoServicio,
    obligatorio: false,
    aplicaA: [] as Subcategoria[],
    comisionCobrador: '',
    activo: true,
    categoria: '',
    socios: true,
    noSocios: false,
    permiteAgendamiento: false,
    permiteHorasExtras: false,
    precioHoraExtra: '',
  });

  const subcategorias: Subcategoria[] = ['Socio', 'Socio Patrimonial', 'Socio Vitalicio'];

  // Categorías
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [catsLoading, setCatsLoading] = useState(false);

  // Modal Administrar Categorías
  const [showAdminCat, setShowAdminCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [savingCat, setSavingCat] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Gestión de espacios
  const [espacios, setEspacios] = useState<string[]>([]);
  const [nuevoEspacio, setNuevoEspacio] = useState('');
  const [editandoEspacio, setEditandoEspacio] = useState<number | null>(null);
  const [editandoNombre, setEditandoNombre] = useState('');

  useEffect(() => {
    loadCategorias();
  }, []);

  useEffect(() => {
    if (params?.id) {
      loadService();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  async function loadCategorias() {
    setCatsLoading(true);
    try {
      const res = await AuthClient.authenticatedFetch('/api/categories');
      const data = await res.json();
      setCategorias(Array.isArray(data) ? (data as Category[]) : []);
    } catch (e) {
      console.error('Error cargando categorías:', e);
      setCategorias([]);
    } finally {
      setCatsLoading(false);
    }
  }

  async function loadService() {
    try {
      const response = await AuthClient.authenticatedFetch(`/api/services/${params!.id}`);
      const data = await response.json();

      if (response.ok) {
        const s: Service = data;
        setService(s);
        setFormData({
          nombre: s.nombre,
          descripcion: s.descripcion || '',
          precio: s.precio?.toString?.() || '',
          tipo: s.tipo,
          obligatorio: !!s.obligatorio,
          aplicaA: s.aplicaA || [],
          comisionCobrador: s.comisionCobrador?.toString() || '',
          activo: !!s.activo,
          categoria: s.categoria || '',
          socios: s.socios ?? true,
          noSocios: s.noSocios ?? false,
          permiteAgendamiento: s.permiteAgendamiento ?? false,
          permiteHorasExtras: (s as any).permiteHorasExtras ?? false,
          precioHoraExtra: (s as any).precioHoraExtra?.toString() || '',
        });
        // Cargar espacios asociados (simulado como array en descripción por simplicidad)
        setEspacios((s as any).espacios || []);
      } else {
        setMsg(data?.msg || 'Servicio no encontrado');
      }
    } catch (error) {
      console.error(error);
      setMsg('Error al cargar servicio');
    } finally {
      setLoadingData(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setLoading(true);

    // Validación adicional para horas extras
    if (formData.permiteHorasExtras && !formData.precioHoraExtra) {
      setMsg('Error: Debe especificar el precio por hora extra');
      setLoading(false);
      return;
    }

    try {
      const serviceData = {
        ...formData,
        precio: gsParse(formData.precio),
        comisionCobrador: formData.comisionCobrador
          ? parseFloat(formData.comisionCobrador)
          : undefined,
        espacios: formData.permiteAgendamiento ? espacios : undefined,
        precioHoraExtra: formData.permiteHorasExtras && formData.precioHoraExtra 
          ? gsParse(formData.precioHoraExtra) 
          : undefined,
      };

      const response = await AuthClient.authenticatedFetch(`/api/services/${params!.id}`, {
        method: 'PATCH',
        body: JSON.stringify(serviceData),
      });

      const data = await response.json();

      if (response.ok) {
        router.push('/admin/servicios');
      } else {
        setMsg(data.msg || 'Error al actualizar servicio');
      }
    } catch (error) {
      console.error(error);
      setMsg('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleAplicaAChange = (subcategoria: Subcategoria, checked: boolean) => {
    if (checked) {
      setFormData((prev) => ({
        ...prev,
        aplicaA: [...prev.aplicaA, subcategoria],
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        aplicaA: prev.aplicaA.filter((s) => s !== subcategoria),
      }));
    }
  };

  // Crear categoría rápida (prompt)
  const handleNuevaCategoria = async () => {
    const nueva = prompt('Nombre de nueva categoría:');
    if (!nueva) return;

    try {
      const res = await AuthClient.authenticatedFetch('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ nombre: nueva }),
      });
      const data = await res.json();
      if (res.ok) {
        await loadCategorias();
        setFormData((prev) => ({ ...prev, categoria: data.categoria?.nombre || nueva }));
      } else {
        alert(data.msg || 'No se pudo crear la categoría');
      }
    } catch (e) {
      console.error(e);
      alert('Error al crear categoría');
    }
  };

  // --- Gestión de Espacios ---
  const agregarEspacio = () => {
    if (nuevoEspacio.trim() && !espacios.includes(nuevoEspacio.trim())) {
      setEspacios(prev => [...prev, nuevoEspacio.trim()]);
      setNuevoEspacio('');
    }
  };

  const eliminarEspacio = (index: number) => {
    setEspacios(prev => prev.filter((_, i) => i !== index));
  };

  const iniciarEdicionEspacio = (index: number) => {
    setEditandoEspacio(index);
    setEditandoNombre(espacios[index]);
  };

  const guardarEdicionEspacio = () => {
    if (editandoNombre.trim() && editandoEspacio !== null) {
      setEspacios(prev => prev.map((espacio, i) => 
        i === editandoEspacio ? editandoNombre.trim() : espacio
      ));
      setEditandoEspacio(null);
      setEditandoNombre('');
    }
  };

  const cancelarEdicionEspacio = () => {
    setEditandoEspacio(null);
    setEditandoNombre('');
  };

  // Función para formatear números con separador de miles
  const formatNumberWithSeparator = (value: string) => {
    const numericValue = value.replace(/[^\d]/g, '');
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  // --- Acciones del modal "Administrar Categorías" ---
  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    setSavingCat(true);
    try {
      const res = await AuthClient.authenticatedFetch('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ nombre: newCatName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.msg || 'No se pudo crear la categoría');
      setNewCatName('');
      await loadCategorias();
    } catch (e: any) {
      alert(e?.message || 'Error al crear categoría');
    } finally {
      setSavingCat(false);
    }
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditingName(cat.nombre);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const saveEdit = async () => {
    if (!editingId || !editingName.trim()) return;
    setSavingCat(true);
    try {
      const res = await AuthClient.authenticatedFetch(`/api/categories/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({ nombre: editingName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.msg || 'No se pudo editar la categoría');
      await loadCategorias();
      // Actualiza selección si la categoría editada estaba seleccionada por nombre
      const oldName = categorias.find((c) => c.id === editingId)?.nombre;
      if (formData.categoria && data.categoria?.nombre && oldName === formData.categoria) {
        setFormData((prev) => ({ ...prev, categoria: data.categoria.nombre }));
      }
      cancelEdit();
    } catch (e: any) {
      alert(e?.message || 'Error al editar categoría');
    } finally {
      setSavingCat(false);
    }
  };

  const deleteCategory = async (cat: Category) => {
    const ok = confirm(`¿Eliminar la categoría "${cat.nombre}"?`);
    if (!ok) return;
    setSavingCat(true);
    try {
      const res = await AuthClient.authenticatedFetch(`/api/categories/${cat.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.msg || 'No se pudo eliminar la categoría');
      await loadCategorias();
      if (formData.categoria === cat.nombre) {
        setFormData((prev) => ({ ...prev, categoria: '' }));
      }
    } catch (e: any) {
      alert(e?.message || 'Error al eliminar categoría');
    } finally {
      setSavingCat(false);
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

  if (!service) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <div className="text-gray-500">Servicio no encontrado</div>
          <Link href="/admin/servicios" className="text-primary-600 hover:text-primary-800 mt-4 inline-block">
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
        <div className="flex items-center gap-4">
          <Link href="/admin/servicios" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Editar Servicio</h1>
            <p className="text-gray-600">Modifica la información del servicio</p>
          </div>
        </div>

        {msg && (
          <div className={`p-4 rounded-lg ${
            msg.includes('Error') ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'
          }`}>
            {msg}
          </div>
        )}

        {/* Formulario */}
        <div className="bg-white rounded-lg shadow">
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Información básica */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Información Básica</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Servicio *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.nombre}
                    onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                    placeholder="Ej: Cuota Social Mensual"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.descripcion}
                    onChange={(e) => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
                    placeholder="Descripción detallada del servicio"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio (Gs.) *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    min="0"
                    step="1000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={gsFormat(formData.precio || '')}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setFormData(prev => ({ ...prev, precio: gsParse(raw).toString() }));
                    }}
                    placeholder="150.000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Servicio *</label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.tipo}
                    onChange={(e) => setFormData(prev => ({ ...prev, tipo: e.target.value as TipoServicio }))}
                  >
                    <option value="MENSUAL">Mensual</option>
                    <option value="ANUAL">Anual</option>
                    <option value="UNICO">Único</option>
                  </select>
                </div>

                {/* Categoría */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría del Servicio *</label>
                  <div className="flex gap-2">
                    <select
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      value={formData.categoria}
                      onChange={(e) => setFormData(prev => ({ ...prev, categoria: e.target.value }))}
                    >
                      <option value="">Seleccionar categoría</option>
                      {categorias.map((cat) => (
                        <option key={cat.id} value={cat.nombre}>
                          {cat.nombre}
                        </option>
                      ))}
                    </select>

                    {/* Botón rápido (+) */}
                    <button
                      type="button"
                      onClick={handleNuevaCategoria}
                      className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm flex items-center gap-1"
                      title="Crear categoría rápida"
                    >
                      <Plus className="w-4 h-4" />
                    </button>

                    {/* Botón Administrar (modal) */}
                    <button
                      type="button"
                      onClick={() => setShowAdminCat(true)}
                      className="px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm flex items-center gap-1"
                      title="Administrar categorías"
                    >
                      <Settings className="w-4 h-4" />
                      <span className="hidden sm:inline">Administrar</span>
                    </button>
                  </div>
                  {catsLoading && <p className="text-xs text-gray-500 mt-1">Cargando categorías…</p>}
                </div>

                {/* Disponibilidad para Socios/No Socios */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Disponibilidad del Servicio *
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Para Socios
                      </label>
                      <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        value={formData.socios ? 'true' : 'false'}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            socios: e.target.value === 'true',
                          }))
                        }
                      >
                        <option value="true">SÍ</option>
                        <option value="false">NO</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Para No Socios
                      </label>
                      <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        value={formData.noSocios ? 'true' : 'false'}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            noSocios: e.target.value === 'true',
                          }))
                        }
                      >
                        <option value="true">SÍ</option>
                        <option value="false">NO</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Indica si el servicio está disponible para socios, no socios, o ambos
                  </p>
                </div>

                {/* Agendamiento */}
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.permiteAgendamiento}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          permiteAgendamiento: e.target.checked,
                          // Reset campos de horas extras si se deshabilita agendamiento
                          permiteHorasExtras: e.target.checked ? prev.permiteHorasExtras : false,
                          precioHoraExtra: e.target.checked ? prev.precioHoraExtra : '',
                        }))
                      }
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      📅 Permite Agendamiento
                    </span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1 ml-6">
                    Permite reservar fecha y horario específicos para este servicio (ej: alquiler de salones)
                  </p>
                </div>

                {/* Horas Extras - Solo si permite agendamiento */}
                {formData.permiteAgendamiento && (
                  <div className="ml-6 space-y-3 p-4">
                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={formData.permiteHorasExtras}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              permiteHorasExtras: e.target.checked,
                              precioHoraExtra: e.target.checked ? prev.precioHoraExtra : '',
                            }))
                          }
                          className="w-4 h-4 text-orange-600 bg-gray-100 border-gray-300 rounded focus:ring-orange-500"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          ⏰ Permite Horas Extras
                        </span>
                      </label>
                      <p className="text-xs text-gray-500 mt-1 ml-6">
                        Permite cobrar horas adicionales después del horario normal (ej: eventos que se extienden)
                      </p>
                    </div>

                    {/* Campo Precio Hora Extra */}
                    {formData.permiteHorasExtras && (
                      <div className="ml-6">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Precio por Hora Extra (Gs.) *
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          required={formData.permiteHorasExtras}
                          value={gsFormat(formData.precioHoraExtra)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setFormData(prev => ({ ...prev, precioHoraExtra: gsParse(raw).toString() }));
                          }}
                          placeholder="50.000"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Precio que se cobrará por cada hora adicional fuera del horario normal
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Configuración avanzada */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Configuración</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Comisión Cobrador (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={formData.comisionCobrador}
                    onChange={(e) => setFormData(prev => ({ ...prev, comisionCobrador: e.target.value }))}
                    placeholder="12.5"
                  />
                  <p className="text-xs text-gray-500 mt-1">Porcentaje de comisión para cobradores externos</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Aplica a Subcategorías</label>
                  <div className="space-y-2">
                    {subcategorias.map(subcategoria => (
                      <label key={subcategoria} className="flex items-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          checked={formData.aplicaA.includes(subcategoria)}
                          onChange={(e) => handleAplicaAChange(subcategoria, e.target.checked)}
                        />
                        <span className="ml-2 text-sm text-gray-700">{subcategoria}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Si no seleccionas ninguna, aplicará a todas</p>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      checked={formData.obligatorio}
                      onChange={(e) => setFormData(prev => ({ ...prev, obligatorio: e.target.checked }))}
                    />
                    <span className="ml-2 text-sm text-gray-700">Servicio Obligatorio</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      checked={formData.activo}
                      onChange={(e) => setFormData(prev => ({ ...prev, activo: e.target.checked }))}
                    />
                    <span className="ml-2 text-sm text-gray-700">Servicio Activo</span>
                  </label>
                </div>

                {/* Gestión de Espacios - Solo si permite agendamiento */}
                {formData.permiteAgendamiento && (
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Espacios Disponibles</h3>
                    
                    {/* Agregar nuevo espacio */}
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        value={nuevoEspacio}
                        onChange={(e) => setNuevoEspacio(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && agregarEspacio()}
                        placeholder="Ej: Tenis 1, Cancha Principal, etc."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      <button
                        type="button"
                        onClick={agregarEspacio}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Agregar
                      </button>
                    </div>

                    {/* Lista de espacios */}
                    {espacios.length > 0 ? (
                      <div className="space-y-2">
                        {espacios.map((espacio, index) => (
                          <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                            {editandoEspacio === index ? (
                              <>
                                <input
                                  type="text"
                                  value={editandoNombre}
                                  onChange={(e) => setEditandoNombre(e.target.value)}
                                  onKeyPress={(e) => e.key === 'Enter' && guardarEdicionEspacio()}
                                  className="flex-1 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                                />
                                <button
                                  type="button"
                                  onClick={guardarEdicionEspacio}
                                  className="px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelarEdicionEspacio}
                                  className="px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="flex-1 text-sm font-medium text-gray-900">{espacio}</span>
                                <button
                                  type="button"
                                  onClick={() => iniciarEdicionEspacio(index)}
                                  className="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded text-sm"
                                  title="Editar"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => eliminarEspacio(index)}
                                  className="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-sm"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                        <p className="text-sm">No hay espacios configurados</p>
                        <p className="text-xs mt-1">Agrega espacios como &ldquo;Cancha 1&rdquo;, &ldquo;Salón Principal&rdquo;, etc.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Link href="/admin/servicios" className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
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

      {/* Modal Administrar Categorías */}
      {showAdminCat && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 sm:p-6"
          onClick={() => setShowAdminCat(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-cat-title"
        >
          <div
            className="w-full max-w-2xl bg-white rounded-lg shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 sm:p-6 border-b">
              <h3 id="admin-cat-title" className="text-lg font-semibold">Administrar Categorías</h3>
              <button
                onClick={() => setShowAdminCat(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Crear nueva */}
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Nueva categoría"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
                <button
                  onClick={handleCreateCategory}
                  disabled={savingCat || !newCatName.trim()}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4 inline mr-1" />
                  Crear
                </button>
              </div>

              {/* Lista */}
              <div className="border rounded-lg divide-y">
                {categorias.length === 0 ? (
                  <div className="p-4 text-gray-500">No hay categorías.</div>
                ) : (
                  categorias.map((cat) => (
                    <div key={cat.id} className="p-3 flex items-center gap-3">
                      {editingId === cat.id ? (
                        <>
                          <input
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                          />
                          <button
                            onClick={saveEdit}
                            disabled={savingCat || !editingName.trim()}
                            className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="flex-1">
                            <div className="font-medium">{cat.nombre}</div>
                            <button
                              onClick={() => {
                                setFormData((prev) => ({ ...prev, categoria: cat.nombre }));
                                setShowAdminCat(false);
                              }}
                              className="text-sm text-primary-600 hover:text-primary-800"
                            >
                              Usar en el formulario
                            </button>
                          </div>

                          <button
                            onClick={() => startEdit(cat)}
                            className="px-2 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteCategory(cat)}
                            className="px-2 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 sm:p-6 border-t">
              <button
                onClick={() => setShowAdminCat(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
