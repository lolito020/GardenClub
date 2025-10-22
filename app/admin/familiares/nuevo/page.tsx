'use client';
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, Upload } from 'lucide-react';
import Link from 'next/link';

interface Member {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
  ci: string;
  categoria: string;
}

export default function NuevoFamiliarPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
  const [members, setMembers] = useState<Member[]>([]);
  const [searchMember, setSearchMember] = useState('');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showMemberSearch, setShowMemberSearch] = useState(false);
  
  const [formData, setFormData] = useState({
    socioTitularId: '',
    nombres: '',
    apellidos: '',
    ci: '',
    parentesco: '',
    nacimiento: '',
    telefono: '',
    email: '',
    foto: ''
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
    loadMembers();
  }, []);

  async function loadMembers() {
    try {
      const response = await AuthClient.authenticatedFetch('/api/members');
      const data = await response.json();
      // Solo socios familiares pueden tener familiares
      setMembers(Array.isArray(data) ? data.filter(m => m.categoria === 'Familiar') : []);
    } catch (error) {
      console.error('Error loading members:', error);
      setMembers([]);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setLoading(true);

    try {
      const response = await AuthClient.authenticatedFetch('/api/families', {
        method: 'POST',
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        router.push('/admin/familiares');
      } else {
        setMsg(data.msg || 'Error al crear familiar');
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

  const selectMember = (member: Member) => {
    setSelectedMember(member);
    setFormData(prev => ({ ...prev, socioTitularId: member.id }));
    setShowMemberSearch(false);
    setSearchMember('');
  };

  const filteredMembers = members.filter(member =>
    member.nombres.toLowerCase().includes(searchMember.toLowerCase()) ||
    member.apellidos.toLowerCase().includes(searchMember.toLowerCase()) ||
    member.codigo.toLowerCase().includes(searchMember.toLowerCase()) ||
    member.ci.includes(searchMember)
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/admin/familiares"
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Nuevo Familiar</h1>
            <p className="text-gray-600">Registra un nuevo familiar de socio</p>
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
            {/* Selección de Socio Titular */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Socio Titular</h3>
              
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Socio Titular *
                </label>
                {selectedMember ? (
                  <div className="flex items-center justify-between p-3 border border-gray-300 rounded-lg bg-gray-50">
                    <div>
                      <div className="font-medium">{selectedMember.nombres} {selectedMember.apellidos}</div>
                      <div className="text-sm text-gray-500">{selectedMember.codigo} • CI: {selectedMember.ci}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMember(null);
                        setFormData(prev => ({ ...prev, socioTitularId: '' }));
                      }}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Buscar socio titular..."
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        value={searchMember}
                        onChange={(e) => {
                          setSearchMember(e.target.value);
                          setShowMemberSearch(e.target.value.length > 0);
                        }}
                        onFocus={() => setShowMemberSearch(searchMember.length > 0)}
                      />
                    </div>
                    
                    {showMemberSearch && filteredMembers.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredMembers.slice(0, 10).map(member => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => selectMember(member)}
                            className="w-full text-left p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                          >
                            <div className="font-medium">{member.nombres} {member.apellidos}</div>
                            <div className="text-sm text-gray-500">{member.codigo} • CI: {member.ci}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

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
                    placeholder="María"
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
                    placeholder="González"
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
                    placeholder="1234567"
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
                    placeholder="0981-123456"
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
                    placeholder="maria@email.com"
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
                      {uploadingPhoto ? 'Subiendo...' : 'Subir Foto'}
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

            {/* Botones */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Link
                href="/admin/familiares"
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={loading || !selectedMember}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                {loading ? 'Creando...' : 'Crear Familiar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}