'use client';

import React from 'react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import NotificationBell from './NotificationBell';

type UserPayload = { rol: string; nombre: string; email: string };

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserPayload | null>(null);
  const [setup, setSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('/api/auth/profile', { cache: 'no-store' });
        const data = await r.json();

        if (data.ok) {
          setUser(data.user);
          setSetup(data.setup || false);
        } else {
          // Si no hay sesión válida, ir a login
          router.push('/login');
          return;
        }
      } catch (error) {
        console.error('Error loading profile:', error);
        router.push('/login');
        return;
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      router.push('/login');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-gray-700 text-sm">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-red-600 text-sm">No autenticado. Redirigiendo...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header con menú horizontal */}
      <header className="bg-white shadow-sm border-b">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            {/* Logo y título */}
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-semibold text-gray-900">Garden Club Paraguayo</h1>
              <span className="text-sm text-gray-500">|</span>
              <span className="text-sm text-gray-600">{user.nombre}</span>
            </div>
            
            {/* Notificaciones, configuración y botón de cerrar sesión */}
            <div className="flex items-center gap-2">
              <NotificationBell />
              <Link href="/admin/configuracion-sistema" className="flex items-center">
                <span
                  className="material-icons text-gray-600 hover:text-blue-600 cursor-pointer text-2xl"
                  style={{ fontSize: 24 }}
                  title="Configuración"
                >
                  &#9881;
                </span>
              </Link>
              <button 
                onClick={handleLogout}
                className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1 rounded hover:bg-gray-100"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
        
        {/* Menú horizontal */}
        <nav className="px-6 py-2 bg-gray-50 border-t">
          <div className="flex items-center space-x-1">
            <Link className="menu-item" href="/admin/dashboard">
              <span>📊</span>
              Dashboard
            </Link>
            <Link className="menu-item" href="/admin/socios">
              <span>👥</span>
              Socios
            </Link>
            <Link className="menu-item" href="/admin/reservas">
              <span>🗓️</span>
              Reservas
            </Link>
            <Link className="menu-item" href="/admin/servicios">
              <span>🛎️</span>
              Servicios
            </Link>
            <Link className="menu-item" href="/admin/cobradores">
              <span>👤</span>
              Cobradores
            </Link>
            <Link className="menu-item" href="/admin/cobranzas">
              <span>💰</span>
              Cobranzas
            </Link>
            <Link className="menu-item" href="/admin/usuarios">
              <span>🔐</span>
              Usuarios
            </Link>
            {/* Eliminar menú Sistema */}
            <Link className="menu-item" href="/porteria">
              <span>🚪</span>
              Portería
            </Link>
          </div>
        </nav>
      </header>
      
      {/* Contenido principal */}
      <main 
        className="flex-1 min-h-screen"
        style={
          pathname === '/admin/dashboard' 
            ? {
                backgroundImage: 'url(/fondoapp.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundAttachment: 'fixed'
              }
            : {
                backgroundColor: '#f9fafb'
              }
        }
      >
        <div className="p-6">
        {setup && (
          <div className="mb-4 p-3 rounded bg-yellow-100 border border-yellow-300 text-sm">
            <b>Modo configuración:</b> No hay usuarios creados. Crea el primer usuario en{' '}
            <Link href="/admin/usuarios" className="underline">Usuarios</Link> para habilitar el login.
          </div>
        )}
        {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;