'use client';

import AdminLayout from '@/components/AdminLayout';
import { useState, useEffect } from 'react';
import { Clock, Save, Globe, Info } from 'lucide-react';
import { getCurrentLocalDate, formatLocalDate, TIMEZONE_CONFIG } from '@/lib/timezone-config';

interface TimezoneOption {
  name: string;
  offset: number;
  description: string;
}

const AVAILABLE_TIMEZONES: TimezoneOption[] = [
  { name: 'America/Asuncion', offset: -3, description: 'Paraguay (UTC-3)' },
  { name: 'America/Asuncion', offset: -4, description: 'Paraguay - Invierno (UTC-4)' },
  { name: 'America/Buenos_Aires', offset: -3, description: 'Argentina (UTC-3)' },
  { name: 'America/Sao_Paulo', offset: -3, description: 'Brasil (UTC-3)' },
  { name: 'America/Montevideo', offset: -3, description: 'Uruguay (UTC-3)' },
  { name: 'America/Santiago', offset: -3, description: 'Chile - Verano (UTC-3)' },
  { name: 'America/Santiago', offset: -4, description: 'Chile - Invierno (UTC-4)' },
  { name: 'UTC', offset: 0, description: 'UTC (UTC+0)' },
];

export default function ConfiguracionSistemaPage() {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [selectedTimezone, setSelectedTimezone] = useState<TimezoneOption>(
    AVAILABLE_TIMEZONES.find(tz => tz.offset === TIMEZONE_CONFIG.offsetHours) || AVAILABLE_TIMEZONES[0]
  );
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // Actualizar reloj cada segundo
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getCurrentLocalDate());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    
    try {
      const response = await fetch('/api/config/timezone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedTimezone.name,
          offset: selectedTimezone.offset,
          description: selectedTimezone.description,
        }),
        credentials: 'include',
      });

      if (response.ok) {
        setMsg('✅ Configuración guardada correctamente. Se aplicará en el próximo reinicio del servidor.');
      } else {
        setMsg('❌ Error al guardar la configuración');
      }
    } catch (error) {
      console.error('Error:', error);
      setMsg('❌ Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (date: Date) => {
    // Usar toLocaleTimeString con la zona horaria configurada
    return date.toLocaleTimeString('es-PY', {
      timeZone: TIMEZONE_CONFIG.name,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              Configuración de Fecha y Hora del Sistema
            </h1>
          </div>
          <p className="text-gray-600 ml-12">
            Configura la zona horaria que se aplicará a todo el sistema
          </p>
        </div>

        {/* Reloj en Tiempo Real */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-sm border border-blue-200 p-8">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm mb-4">
              <Globe className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-600">
                {TIMEZONE_CONFIG.description}
              </span>
            </div>
            
            <div className="text-6xl font-bold text-gray-900 mb-2 font-mono">
              {formatTime(currentTime)}
            </div>
            
            <div className="text-2xl text-gray-700">
              {formatLocalDate(currentTime, false)}
            </div>
          </div>
        </div>

        {/* Información Actual */}
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Configuración Actual:</p>
              <ul className="space-y-1 ml-4">
                <li>• Zona Horaria: <span className="font-mono">{TIMEZONE_CONFIG.name}</span></li>
                <li>• Offset: <span className="font-mono">UTC{TIMEZONE_CONFIG.offsetHours >= 0 ? '+' : ''}{TIMEZONE_CONFIG.offsetHours}</span></li>
                <li>• Descripción: {TIMEZONE_CONFIG.description}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Formulario de Configuración */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Cambiar Zona Horaria
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Seleccionar Zona Horaria
              </label>
              <select
                value={`${selectedTimezone.name}|${selectedTimezone.offset}`}
                onChange={(e) => {
                  const [name, offset] = e.target.value.split('|');
                  const tz = AVAILABLE_TIMEZONES.find(
                    t => t.name === name && t.offset === parseInt(offset)
                  );
                  if (tz) setSelectedTimezone(tz);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {AVAILABLE_TIMEZONES.map((tz, index) => (
                  <option 
                    key={index} 
                    value={`${tz.name}|${tz.offset}`}
                  >
                    {tz.description} (UTC{tz.offset >= 0 ? '+' : ''}{tz.offset})
                  </option>
                ))}
              </select>
            </div>

            {/* Vista Previa */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Vista Previa con nueva configuración:
              </p>
              <div className="space-y-2 text-sm text-gray-600">
                <p>• Zona Horaria: <span className="font-mono">{selectedTimezone.name}</span></p>
                <p>• Offset: <span className="font-mono">UTC{selectedTimezone.offset >= 0 ? '+' : ''}{selectedTimezone.offset}</span></p>
                <p>• Descripción: {selectedTimezone.description}</p>
                <p>• Hora local actual: <span className="font-mono font-semibold">
                  {new Date().toLocaleTimeString('es-PY', {
                    timeZone: selectedTimezone.name,
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </span></p>
              </div>
            </div>

            {/* Mensaje */}
            {msg && (
              <div className={`p-4 rounded-lg ${
                msg.includes('✅') 
                  ? 'bg-green-50 text-green-800 border border-green-200' 
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {msg}
              </div>
            )}

            {/* Botón Guardar */}
            <button
              onClick={handleSave}
              disabled={saving || selectedTimezone.offset === TIMEZONE_CONFIG.offsetHours}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              <Save className="w-5 h-5" />
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>

            {/* Advertencia */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-1">⚠️ Importante:</p>
                  <ul className="space-y-1 ml-4">
                    <li>• Los cambios se aplicarán después de reiniciar el servidor</li>
                    <li>• Todas las fechas y horas del sistema usarán la nueva zona horaria</li>
                    <li>• Los datos existentes no se modificarán, solo cómo se muestran</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
