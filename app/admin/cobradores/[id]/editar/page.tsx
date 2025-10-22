'use client';
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

type FormaPago = 'efectivo' | 'transferencia' | 'cheque';
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
  formaPago: FormaPago | FormaPago[]; // 🎯 Soportar ambos formatos
  cuentaBanco?: string;
  activo: boolean;
  fechaIngreso: string;
}

export default function EditarCobradorPage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [msg, setMsg] = useState('');
  const [collector, setCollector] = useState<Collector | null>(null);
  const [collectors, setCollectors] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    nombres: '',
    apellidos: '',
    ci: '',
    telefono: '',
    celular: '',
    direccion: '',
    email: '',
    tipoCobrador: 'EXTERNO' as TipoCobrador,
    comisionPorDefecto: '12.5',
    formasPago: ['efectivo'] as FormaPago[], // 🎯 Cambiado a array
    cuentaBanco: '',
    activo: true
  });
  
  // Verificar si ya existe un Garden Club (excluyendo el actual)
  const hasOtherGardenClub = collectors.some(c => c.tipoCobrador === 'CLUB' && c.id !== params.id);
  
  // 🎯 Nueva función para manejar checkboxes de formas de pago
  const handleFormaPagoToggle = (formaPago: FormaPago) => {
    setFormData(prev => {
      const current = prev.formasPago;
      const isSelected = current.includes(formaPago);
      
      if (isSelected) {
        // Remover - pero mantener al menos uno seleccionado
        return {
          ...prev,
          formasPago: current.length > 1 
            ? current.filter(fp => fp !== formaPago)
            : current
        };
      } else {
        // Agregar
        return {
          ...prev,
          formasPago: [...current, formaPago]
        };
      }
    });
  };

  useEffect(() => {
    if (params.id) {
      loadCollector();
      loadAllCollectors();
    }
  }, [params.id]);

  async function loadAllCollectors() {
    try {
      const response = await AuthClient.authenticatedFetch('/api/collectors');
      const data = await response.json();
      setCollectors(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading collectors:', error);
      setCollectors([]);
    }
  }

  async function loadCollector() {
    try {
      const response = await AuthClient.authenticatedFetch(`/api/collectors/${params.id}`);
      const data = await response.json();
      
      if (response.ok) {
        setCollector(data);
        
        // 🎯 Convertir formaPago a array si es string (backward compatibility)
        let formasPagoArray: FormaPago[];
        if (Array.isArray(data.formaPago)) {
          formasPagoArray = data.formaPago;
        } else if (data.formaPago) {
          formasPagoArray = [data.formaPago];
        } else {
          formasPagoArray = ['efectivo'];
        }
        
        setFormData({
          nombres: data.nombres,
          apellidos: data.apellidos,
          ci: data.ci,
          telefono: data.telefono || '',
          celular: data.celular || '',
          direccion: data.direccion || '',
          email: data.email || '',
          tipoCobrador: data.tipoCobrador || 'EXTERNO',
          comisionPorDefecto: data.comisionPorDefecto?.toString() || '12.5',
          formasPago: formasPagoArray,
          cuentaBanco: data.cuentaBanco || '',
          activo: data.activo
        });
      } else {
        setMsg('Cobrador no encontrado');
      }
    } catch (error) {
      setMsg('Error al cargar cobrador');
    } finally {
      setLoadingData(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setLoading(true);

    try {
      const dataToSend = {
        ...formData,
        comisionPorDefecto: (formData.tipoCobrador === 'EXTERNO' || formData.tipoCobrador === 'PROFESOR')
          ? parseFloat(formData.comisionPorDefecto) 
          : undefined
      };

      const response = await AuthClient.authenticatedFetch(`/api/collectors/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify(dataToSend)
      });

      const data = await response.json();

      if (response.ok) {
        router.push(`/admin/cobradores/${params.id}`);
      } else {
        setMsg(data.msg || 'Error al actualizar cobrador');
      }
    } catch (error) {
      setMsg('Error de conexión');
    } finally {
      setLoading(false);
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
        <div className="flex items-center gap-4">
          <Link
            href={`/admin/cobradores/${params.id}`}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Editar Cobrador</h1>
            <p className="text-gray-600">Modifica la información del cobrador</p>
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                    disabled={formData.tipoCobrador === 'CLUB'}
                  />
                  {formData.tipoCobrador === 'CLUB' && (
                    <p className="text-xs text-gray-500 mt-1">📌 Nombre predeterminado para cobrador institucional</p>
                  )}
                </div>

                {formData.tipoCobrador !== 'CLUB' && (
                  <>
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
                        Cédula de Identidad *
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        value={formData.ci}
                        onChange={(e) => setFormData(prev => ({ ...prev, ci: e.target.value }))}
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
                  </>
                )}
              </div>
            </div>

            {/* Información de Contacto - Solo para EXTERNO y PROFESOR */}
            {formData.tipoCobrador !== 'CLUB' && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Información de Contacto</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                      Celular
                    </label>
                    <input
                      type="tel"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      value={formData.celular}
                      onChange={(e) => setFormData(prev => ({ ...prev, celular: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dirección
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      value={formData.direccion}
                      onChange={(e) => setFormData(prev => ({ ...prev, direccion: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tipo de Cobrador, Comisiones e Información de Pago en una fila */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Tipo de Cobrador y Comisiones */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Tipo de Cobrador y Comisiones</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tipo de Cobrador *
                      </label>
                      <select
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        value={formData.tipoCobrador}
                        onChange={(e) => setFormData(prev => ({ ...prev, tipoCobrador: e.target.value as TipoCobrador }))}
                      >
                        <option value="EXTERNO">Externo</option>
                        <option value="PROFESOR">Profesor</option>
                        {/* Solo mostrar Garden Club si no hay otro CLUB o si este mismo es CLUB */}
                        {(!hasOtherGardenClub || formData.tipoCobrador === 'CLUB') && (
                          <option value="CLUB">Garden Club</option>
                        )}
                      </select>
                    </div>

                    {/* Comisión por defecto - Para EXTERNO y PROFESOR */}
                    {(formData.tipoCobrador === 'EXTERNO' || formData.tipoCobrador === 'PROFESOR') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Comisión % *
                        </label>
                        <input
                          type="number"
                          required={formData.tipoCobrador === 'EXTERNO' || formData.tipoCobrador === 'PROFESOR'}
                          min="0"
                          max="100"
                          step="0.1"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          value={formData.comisionPorDefecto}
                          onChange={(e) => setFormData(prev => ({ ...prev, comisionPorDefecto: e.target.value }))}
                          placeholder="12.5"
                        />
                      </div>
                    )}
                  </div>

                  {/* Bloque informativo eliminado por solicitud */}
                </div>
              </div>

              {/* Información de Pago - Solo para EXTERNO y PROFESOR */}
              {formData.tipoCobrador !== 'CLUB' && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Información de Pago</h3>
                  <div className="space-y-4">
                    {/* Formas de Pago - Checkboxes Múltiples */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Formas de Pago Aceptadas * <span className="text-xs text-gray-500">(Seleccione al menos una)</span>
                      </label>
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.formasPago.includes('efectivo')}
                            onChange={() => handleFormaPagoToggle('efectivo')}
                            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700">Efectivo</span>
                        </label>
                        
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.formasPago.includes('transferencia')}
                            onChange={() => handleFormaPagoToggle('transferencia')}
                            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700">Transferencia</span>
                        </label>
                        
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.formasPago.includes('cheque')}
                            onChange={() => handleFormaPagoToggle('cheque')}
                            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700">Cheque</span>
                        </label>
                      </div>
                      {formData.formasPago.length === 0 && (
                        <p className="text-xs text-red-600 mt-1">Debe seleccionar al menos una forma de pago</p>
                      )}
                    </div>

                    {/* Cuenta Bancaria - Solo si acepta transferencia */}
                    {formData.formasPago.includes('transferencia') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Cuenta Bancaria
                        </label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          value={formData.cuentaBanco}
                          onChange={(e) => setFormData(prev => ({ ...prev, cuentaBanco: e.target.value }))}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Mensaje informativo para Garden Club */}
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
                  <span className="ml-2 text-sm text-gray-700">Cobrador Activo</span>
                </label>
              </div>
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Link
                href={`/admin/cobradores/${params.id}`}
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