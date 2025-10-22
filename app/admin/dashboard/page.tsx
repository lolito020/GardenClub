'use client';
import AdminLayout from '@/components/AdminLayout';
import { AuthClient } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle, 
  Calendar,
  CreditCard,
  UserCheck,
  Activity
} from 'lucide-react';
import Link from 'next/link';

interface DashboardData {
  totalSocios: number;
  sociosAlDia: number;
  sociosAtrasados: number;
  totalCobradoMes: number;
  totalComisionesMes: number;
  pagosPendientes: number;
  ultimosPagos: Array<{
    id: string;
    memberName: string;
    monto: number;
    concepto: string;
    fecha: string;
  }>;
  alertas: Array<{
    tipo: 'warning' | 'info' | 'error';
    mensaje: string;
  }>;
}

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      const response = await AuthClient.authenticatedFetch('/api/dashboard');
      const data = await response.json();
      setDashboardData(data);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Bloque de Total Socios eliminado */}
      </div>
    </AdminLayout>
  );
}