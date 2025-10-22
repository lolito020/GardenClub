'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setEmail('admin@gardenclub.py');
    setPassword('admin123');
  }, []);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return null;
  }

  async function onSubmit(e: any) {
    e.preventDefault();
    setMsg('');
    setLoading(true);

    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await r.json();

      if (data.ok) {
        // Redirigir según el rol
        if (data.user.rol === 'admin') {
          router.push('/admin');
        } else if (data.user.rol === 'porteria') {
          router.push('/porteria');
        } else {
          router.push('/admin');
        }
      } else {
        setMsg(data.msg || 'Credenciales inválidas');
      }
    } catch (error) {
      setMsg('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded-xl shadow w-80">
        <h1 className="text-xl font-semibold mb-4">Garden Club Paraguayo</h1>
        <input
          className="border p-2 w-full mb-2 rounded"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          required
          disabled={loading}
        />
        <input
          className="border p-2 w-full mb-4 rounded"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Contraseña"
          required
          disabled={loading}
        />
        <button 
          className="bg-primary-500 text-white w-full py-2 rounded hover:bg-primary-600 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
        {msg && <p className="text-red-600 mt-2 text-sm">{msg}</p>}
        <div className="mt-4 text-xs text-gray-500">
          <p>Usuario demo: admin@gardenclub.py</p>
          <p>Contraseña: admin123</p>
        </div>
      </form>
    </div>
  );
}