'use client'

import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/components/AdminLayout';

export default function SociosPage() {
  const [test, setTest] = useState('');

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1>Test Page</h1>
      </div>
    </AdminLayout>
  );
}