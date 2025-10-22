'use client';
import AdminLayout from '@/components/AdminLayout';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Rol = 'admin' | 'caja' | 'cobranzas' | 'consulta' | 'porteria';

export default function UsuariosPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<Rol>('admin');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      const r = await fetch('/api/users');
      const d = await r.json();
      setItems(Array.isArray(d) ? d : []);
    } catch (error) {
      console.error('Error loading users:', error);
      setItems([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function crear(e: any) {
    e.preventDefault();
    setMsg('');
    setLoading(true);

    try {
      const r = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, nombre, rol, password })
      });

      const data = await r.json();

      if (data.ok) {
        setEmail('');
        setNombre('');
        setPassword('');
        await load();
        setMsg('Usuario creado exitosamente');

        // Si era el primer usuario, redirigir al login después de un momento
        if (items.length === 0) {
          setTimeout(() => {
            setMsg('Primer usuario creado. Redirigiendo al login...');
            setTimeout(() => {
              router.push('/login');
            }, 1500);
          }, 1000);
        }
      } else {
        setMsg(data.msg || 'Error al crear usuario');
      }
    } catch (error) {
      setMsg('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Gestión de Usuarios</h1>

        {items.length === 0 && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-800 mb-2">¡Bienvenido!</h3>
            <p className="text-blue-700">
              No hay usuarios registrados. Crea el primer usuario (Administrador) para activar el sistema de login.
            </p>
          </div>
        )}

        {msg && (
          <div className={`p-4 rounded-lg ${
            msg.includes('exitosamente') || msg.includes('creado')
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {msg}
          </div>
        )}

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">
            {items.length === 0 ? 'Crear Primer Usuario (Administrador)' : 'Crear Nuevo Usuario'}
          </h2>
          
          <form onSubmit={crear} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre completo
              </label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Ej: Juan Pérez"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="admin@club.py"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rol
              </label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={rol}
                onChange={e => setRol(e.target.value as Rol)}
                disabled={loading}
              >
                <option value="admin">Administrador</option>
                <option value="caja">Caja</option>
                <option value="cobranzas">Cobranzas</option>
                <option value="consulta">Consulta</option>
                <option value="porteria">Portería</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contraseña
              </label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Mínimo 6 caracteres"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-primary-500 text-white px-6 py-2 rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creando...' : 'Crear Usuario'}
            </button>
          </form>
        </div>

        {items.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Usuarios Registrados</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Nombre</th>
                      <th className="text-left py-2">Email</th>
                      <th className="text-center py-2">Rol</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(u => (
                      <tr key={u.id} className="border-b">
                        <td className="py-2">{u.nombre}</td>
                        <td className="py-2">{u.email}</td>
                        <td className="py-2 text-center">
                          <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm">
                            {u.rol}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}