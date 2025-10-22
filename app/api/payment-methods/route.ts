import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

interface PaymentMethod {
  id: string;
  nombre: string;
  activo?: boolean;
  descripcion?: string;
}

// GET /api/payment-methods
export async function GET(req: NextRequest) {
  await requireAuth(req);

  // Métodos de pago predeterminados del sistema
  const paymentMethods: PaymentMethod[] = [
    { id: 'efectivo', nombre: 'Efectivo', activo: true, descripcion: 'Pago en efectivo' },
    { id: 'transferencia', nombre: 'Transferencia', activo: true, descripcion: 'Transferencia bancaria' },
    { id: 'tarjeta', nombre: 'Tarjeta', activo: true, descripcion: 'Pago con tarjeta de crédito/débito' },
    { id: 'cheque', nombre: 'Cheque', activo: true, descripcion: 'Pago con cheque' },
    { id: 'pos', nombre: 'POS', activo: true, descripcion: 'Pago con terminal POS' },
  ];

  return NextResponse.json(paymentMethods);
}