'use client';
import React, { useState, useEffect } from 'react';
import { AuthClient } from '@/lib/auth-client';
import { 
  Search, Calendar, Users, Phone, Mail, MapPin, User, 
  Clock, CheckCircle2, XCircle, AlertTriangle, CalendarDays, 
  Home, UserCheck, Shield
} from 'lucide-react';

interface MemberProfile {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
  ci: string;
  categoria: string;
  subcategoria: string;
  telefono?: string;
  celular?: string;
  email?: string;
  direccion?: string;
  estado: string;
  tieneDeudas: boolean;
  serviciosActivos: number;
}

interface ActiveService {
  id: string;
  nombre: string;
  tipo: string;
  fechaInicio: string;
  proximoCobro: string;
  autoDebit: boolean;
}

interface FamilyMember {
  id: string;
  nombres: string;
  apellidos: string;
  ci?: string;
  parentesco: string;
  telefono?: string;
  email?: string;
}

interface MemberReservation {
  id: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  espacio: string;
  servicio: string;
  status: string;
}

interface MemberLookupResponse {
  ok: boolean;
  member: MemberProfile;
  activeServices: ActiveService[];
  familyMembers: FamilyMember[];
  reservations: MemberReservation[];
  stats: {
    totalReservations: number;
    ownReservations: number;
    thirdPartyReservations: number;
    activeServices: number;
    familyMembers: number;
  };
}

interface DailyReservation {
  id: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  espacio: string;
  nombreContacto: string;
  contacto: string;
  status: string;
}

interface DailyReservationsResponse {
  ok: boolean;
  today: DailyReservation[];
  tomorrow: DailyReservation[];
  stats: {
    totalToday: number;
    totalTomorrow: number;
    mostUsedSpace: string;
    peakHour: string;
  };
}

export default function Porteria() {
  // Estados básicos
  const [searchText, setSearchText] = useState('');
  const [memberData, setMemberData] = useState<MemberLookupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Estados para reservas diarias
  const [dailyReservations, setDailyReservations] = useState<DailyReservationsResponse | null>(null);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [showDailyView, setShowDailyView] = useState(false);

  // Verificar autenticación
  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (!AuthClient.isAuthenticated()) {
          window.location.href = '/login';
          return;
        }
        
        // Verificar perfil del usuario
        const response = await AuthClient.authenticatedFetch('/api/auth/profile');
        if (response.ok) {
          const profile = await response.json();
          if (profile && (profile.role === 'admin' || profile.role === 'porteria')) {
            setIsAuthenticated(true);
          } else {
            window.location.href = '/login';
          }
        } else {
          window.location.href = '/login';
        }
      } catch (error) {
        window.location.href = '/login';
      } finally {
        setAuthLoading(false);
      }
    };
    
    checkAuth();
  }, []);

  // Cargar reservas diarias al cambiar vista
  useEffect(() => {
    if (showDailyView && !dailyReservations) {
      loadDailyReservations();
    }
  }, [showDailyView]);

  // Función para buscar socio
  async function searchMember(searchData: any) {
    if (showDailyView) {
      setShowDailyView(false);
    }
    
    setLoading(true);
    setError('');
    setMemberData(null);
    
    try {
      const response = await fetch('/api/porteria/member-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchData)
      });
      
      const result = await response.json();
      
      if (result.ok) {
        setMemberData(result);
      } else {
        setError(result.msg || 'Error al buscar socio');
      }
    } catch (error) {
      console.error('Error searching member:', error);
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  // Función para cargar reservas diarias
  async function loadDailyReservations() {
    setLoadingDaily(true);
    
    try {
      const response = await fetch('/api/porteria/daily-reservations');
      const result = await response.json();
      
      if (result.ok) {
        setDailyReservations(result);
      }
    } catch (error) {
      console.error('Error loading daily reservations:', error);
    } finally {
      setLoadingDaily(false);
    }
  }

  // Manejar envío de formulario
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchText.trim()) {
      const searchData = searchText.includes('@') 
        ? { email: searchText }
        : isNaN(Number(searchText))
          ? { codigo: searchText }
          : { ci: searchText };
      
      searchMember(searchData);
    }
  };

  // Atajos de teclado
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setShowDailyView(false);
        document.getElementById('search-input')?.focus();
      } else if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        setShowDailyView(true);
        if (!dailyReservations) {
          loadDailyReservations();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [dailyReservations]);

  // Mostrar loading mientras verifica autenticación
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-gray-600">Verificando acceso...</div>
        </div>
      </div>
    );
  }

  // Si no está autenticado, no mostrar nada (se redirige)
  if (!isAuthenticated) {
    return null;
  }

  return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center">
                <Shield className="w-8 h-8 text-blue-600 mr-3" />
                <h1 className="text-2xl font-bold text-gray-900">Sistema de Portería</h1>
              </div>
              
              {/* Navegación */}
              <div className="flex space-x-4">
                <button
                  onClick={() => setShowDailyView(false)}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    !showDailyView 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Search className="w-4 h-4 inline mr-2" />
                  Buscar Socio
                </button>
                <button
                  onClick={() => {
                    setShowDailyView(true);
                    if (!dailyReservations) loadDailyReservations();
                  }}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    showDailyView 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Calendar className="w-4 h-4 inline mr-2" />
                  Reservas del Día
                </button>
              </div>
            </div>
            
            {/* Atajos de teclado */}
            <div className="pb-4">
              <div className="text-sm text-gray-500">
                <span className="bg-gray-100 px-2 py-1 rounded">Ctrl+F</span> Búsqueda | 
                <span className="bg-gray-100 px-2 py-1 rounded ml-2">Ctrl+D</span> Vista Diaria
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {!showDailyView ? (
            // Vista de búsqueda
            <div>
              {/* Formulario de búsqueda */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                <form onSubmit={handleSearch}>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <input
                        id="search-input"
                        type="text"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        placeholder="Buscar por CI, código de socio, o email..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading || !searchText.trim()}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Buscando...' : 'Buscar'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Mensajes de error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <div className="flex">
                    <XCircle className="w-5 h-5 text-red-400 mr-2" />
                    <span className="text-red-800">{error}</span>
                  </div>
                </div>
              )}

              {/* Resultado de búsqueda */}
              {memberData && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">
                        {memberData.member.nombres} {memberData.member.apellidos}
                      </h2>
                      <div className="flex items-center mt-2 space-x-4">
                        <span className="text-sm text-gray-500">
                          CI: {memberData.member.ci}
                        </span>
                        <span className="text-sm text-gray-500">
                          Código: {memberData.member.codigo}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          memberData.member.estado === 'ACTIVO' 
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {memberData.member.estado}
                        </span>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-lg font-semibold text-gray-900">
                        {memberData.member.categoria}
                      </div>
                      <div className="text-sm text-gray-500">
                        {memberData.member.subcategoria}
                      </div>
                    </div>
                  </div>

                  {/* Información de contacto */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Información de Contacto</h3>
                      <div className="space-y-3">
                        {memberData.member.telefono && (
                          <div className="flex items-center">
                            <Phone className="w-4 h-4 text-gray-400 mr-3" />
                            <span className="text-sm text-gray-600">{memberData.member.telefono}</span>
                          </div>
                        )}
                        {memberData.member.celular && (
                          <div className="flex items-center">
                            <Phone className="w-4 h-4 text-gray-400 mr-3" />
                            <span className="text-sm text-gray-600">{memberData.member.celular} (Celular)</span>
                          </div>
                        )}
                        {memberData.member.email && (
                          <div className="flex items-center">
                            <Mail className="w-4 h-4 text-gray-400 mr-3" />
                            <span className="text-sm text-gray-600">{memberData.member.email}</span>
                          </div>
                        )}
                        {memberData.member.direccion && (
                          <div className="flex items-center">
                            <MapPin className="w-4 h-4 text-gray-400 mr-3" />
                            <span className="text-sm text-gray-600">{memberData.member.direccion}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Estadísticas</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">{memberData.stats.activeServices}</div>
                          <div className="text-sm text-blue-600">Servicios Activos</div>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">{memberData.stats.totalReservations}</div>
                          <div className="text-sm text-green-600">Reservas Totales</div>
                        </div>
                        <div className="text-center p-3 bg-purple-50 rounded-lg">
                          <div className="text-2xl font-bold text-purple-600">{memberData.stats.familyMembers}</div>
                          <div className="text-sm text-purple-600">Familiares</div>
                        </div>
                        <div className="text-center p-3 bg-yellow-50 rounded-lg">
                          <div className="text-2xl font-bold text-yellow-600">{memberData.stats.ownReservations}</div>
                          <div className="text-sm text-yellow-600">Reservas Propias</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Servicios activos */}
                  {memberData.activeServices && memberData.activeServices.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Servicios Activos</h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Servicio</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Inicio</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Próximo Cobro</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {memberData.activeServices.map((service) => (
                              <tr key={service.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{service.nombre}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{service.tipo}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{service.fechaInicio}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{service.proximoCobro}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Familiares */}
                  {memberData.familyMembers && memberData.familyMembers.length > 0 && (
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Grupo Familiar</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {memberData.familyMembers.map((family) => (
                          <div key={family.id} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-gray-900">{family.nombres} {family.apellidos}</h4>
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{family.parentesco}</span>
                            </div>
                            {family.ci && (
                              <p className="text-sm text-gray-600">CI: {family.ci}</p>
                            )}
                            {family.telefono && (
                              <p className="text-sm text-gray-600">Tel: {family.telefono}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            // Vista de reservas diarias
            <div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Reservas del Día</h2>
                
                {loadingDaily ? (
                  <div className="text-center py-8">
                    <div className="text-gray-500">Cargando reservas...</div>
                  </div>
                ) : dailyReservations ? (
                  <div>
                    {/* Estadísticas */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                      <div className="text-center p-4 bg-blue-50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">{dailyReservations.stats.totalToday}</div>
                        <div className="text-sm text-blue-600">Reservas Hoy</div>
                      </div>
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{dailyReservations.stats.totalTomorrow}</div>
                        <div className="text-sm text-green-600">Reservas Mañana</div>
                      </div>
                      <div className="text-center p-4 bg-purple-50 rounded-lg">
                        <div className="text-lg font-bold text-purple-600">{dailyReservations.stats.mostUsedSpace}</div>
                        <div className="text-sm text-purple-600">Espacio Más Usado</div>
                      </div>
                      <div className="text-center p-4 bg-yellow-50 rounded-lg">
                        <div className="text-lg font-bold text-yellow-600">{dailyReservations.stats.peakHour}</div>
                        <div className="text-sm text-yellow-600">Hora Pico</div>
                      </div>
                    </div>

                    {/* Reservas de hoy */}
                    <div className="mb-8">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Reservas de Hoy</h3>
                      {dailyReservations.today.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hora</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Espacio</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contacto</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teléfono</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {dailyReservations.today.map((reservation) => (
                                <tr key={reservation.id}>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {reservation.horaInicio} - {reservation.horaFin}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{reservation.espacio}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{reservation.nombreContacto}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{reservation.contacto}</td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                      reservation.status === 'ACTIVO' 
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-gray-100 text-gray-800'
                                    }`}>
                                      {reservation.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-gray-500 text-center py-4">No hay reservas para hoy</p>
                      )}
                    </div>

                    {/* Reservas de mañana */}
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Reservas de Mañana</h3>
                      {dailyReservations.tomorrow.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hora</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Espacio</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contacto</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teléfono</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {dailyReservations.tomorrow.map((reservation) => (
                                <tr key={reservation.id}>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {reservation.horaInicio} - {reservation.horaFin}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{reservation.espacio}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{reservation.nombreContacto}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{reservation.contacto}</td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                      reservation.status === 'ACTIVO' 
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-gray-100 text-gray-800'
                                    }`}>
                                      {reservation.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-gray-500 text-center py-4">No hay reservas para mañana</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-gray-500">No se pudieron cargar las reservas</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
  );
}