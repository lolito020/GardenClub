// 🔍 Componente de Filtros para la Vista de Todas las Reservas de Portería
// Basado en análisis de app/admin/reservas/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { 
  PorteriaFilters, 
  PorteriaFiltersProps,
  DEFAULT_PORTERIA_FILTERS,
  SearchType
} from '@/lib/porteria-types';
import { Service, Resource } from '@/lib/db';
import { Venue } from '@/lib/types';
import { createDefaultFiltersForRange } from '@/lib/porteria-utils';

export default function PorteriaFiltersComponent({ 
  filtros, 
  onFiltrosChange, 
  servicios = [], 
  espacios = [], 
  loading = false, 
  onReset 
}: PorteriaFiltersProps) {
  
  // 📅 Estado para rangos de fecha predefinidos
  const [rangoSeleccionado, setRangoSeleccionado] = useState<'hoy' | 'semana' | 'mes' | 'personalizado'>('personalizado');
  
  // 🔄 Estados de carga para selectores
  const [loadingServicios, setLoadingServicios] = useState(false);
  const [loadingEspacios, setLoadingEspacios] = useState(false);

  // 📊 Manejar cambio de filtros
  const handleFiltroChange = (campo: keyof PorteriaFilters, valor: any) => {
    const nuevosFiltros = { ...filtros, [campo]: valor };
    onFiltrosChange(nuevosFiltros);
  };

  // 📅 Manejar cambio de rango de fecha
  const handleRangoFecha = (tipo: typeof rangoSeleccionado) => {
    setRangoSeleccionado(tipo);
    
    if (tipo !== 'personalizado') {
      const rangoFiltros = createDefaultFiltersForRange(tipo);
      handleFiltroChange('fechaInicio', rangoFiltros.fechaInicio || '');
      handleFiltroChange('fechaFin', rangoFiltros.fechaFin || '');
    }
  };

  // 🔄 Reset filtros
  const handleReset = () => {
    if (onReset) {
      onReset();
    } else {
      onFiltrosChange(DEFAULT_PORTERIA_FILTERS);
    }
    setRangoSeleccionado('personalizado');
  };

  // 🎯 Opciones de tipo de búsqueda
  const tiposBusqueda: { value: SearchType; label: string }[] = [
    { value: 'todos', label: 'Todos los campos' },
    { value: 'evento', label: 'Solo eventos' },
    { value: 'contacto', label: 'Solo contacto' },
    { value: 'nombre', label: 'Solo nombre' }
  ];

  // 🎨 Opciones de estado (solo los realmente usados)
  const estadosDisponibles = [
    { value: 'ACTIVO', label: 'Activo', color: 'bg-green-100 text-green-800' },
    { value: 'CULMINADO', label: 'Culminado', color: 'bg-gray-100 text-gray-800' },
    { value: 'CANCELADO', label: 'Cancelado', color: 'bg-red-100 text-red-800' }
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
      {/* Header de filtros */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.414A1 1 0 013 6.707V4z" />
          </svg>
          <h3 className="text-lg font-semibold text-slate-800">Filtros de Búsqueda</h3>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={loading}
            className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors duration-200 disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Limpiar
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 📅 Filtros de fecha - Primera fila */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Rango de Fechas
          </h4>
          
          {/* Botones de rango rápido */}
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { key: 'hoy', label: 'Hoy' },
              { key: 'semana', label: 'Esta Semana' },
              { key: 'mes', label: 'Este Mes' },
              { key: 'personalizado', label: 'Personalizado' }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleRangoFecha(key as any)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors duration-200 ${
                  rangoSeleccionado === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-blue-700 hover:bg-blue-100 border border-blue-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Selectores de fecha */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-blue-700 mb-1">Fecha Inicio</label>
              <input
                type="date"
                value={filtros.fechaInicio}
                onChange={(e) => {
                  handleFiltroChange('fechaInicio', e.target.value);
                  setRangoSeleccionado('personalizado');
                }}
                disabled={loading}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-blue-700 mb-1">Fecha Fin</label>
              <input
                type="date"
                value={filtros.fechaFin}
                onChange={(e) => {
                  handleFiltroChange('fechaFin', e.target.value);
                  setRangoSeleccionado('personalizado');
                }}
                disabled={loading}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* 🔍 Filtros de búsqueda - Segunda fila */}
        <div className="bg-green-50 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Búsqueda de Texto
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-green-700 mb-1">Término de búsqueda</label>
              <input
                type="text"
                value={filtros.busqueda}
                onChange={(e) => handleFiltroChange('busqueda', e.target.value)}
                placeholder="Buscar por evento, contacto, nombre..."
                disabled={loading}
                className="w-full px-3 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-green-700 mb-1">Buscar en</label>
              <select
                value={filtros.tipoBusqueda}
                onChange={(e) => handleFiltroChange('tipoBusqueda', e.target.value as SearchType)}
                disabled={loading}
                className="w-full px-3 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm disabled:opacity-50"
              >
                {tiposBusqueda.map(tipo => (
                  <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 🏢 Filtros de servicios y espacios - Tercera fila */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Servicios */}
          <div className="bg-purple-50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-purple-800 mb-3 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Servicios {loadingServicios && <span className="text-xs">(cargando...)</span>}
            </h4>
            
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {servicios.length === 0 ? (
                <p className="text-xs text-purple-600">No hay servicios disponibles</p>
              ) : (
                servicios.map((servicio: any) => (
                  <label key={servicio.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={filtros.servicios.includes(servicio.id)}
                      onChange={(e) => {
                        const nuevosServicios = e.target.checked
                          ? [...filtros.servicios, servicio.id]
                          : filtros.servicios.filter(id => id !== servicio.id);
                        handleFiltroChange('servicios', nuevosServicios);
                      }}
                      disabled={loading}
                      className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-purple-300 rounded"
                    />
                    <span className="text-purple-800 truncate">{servicio.nombre}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Espacios */}
          <div className="bg-amber-50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
              </svg>
              Espacios {loadingEspacios && <span className="text-xs">(cargando...)</span>}
            </h4>
            
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {espacios.length === 0 ? (
                <p className="text-xs text-amber-600">No hay espacios disponibles</p>
              ) : (
                espacios.map((espacio: any) => (
                  <label key={espacio.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={filtros.espacios.includes(espacio.id)}
                      onChange={(e) => {
                        const nuevosEspacios = e.target.checked
                          ? [...filtros.espacios, espacio.id]
                          : filtros.espacios.filter(id => id !== espacio.id);
                        handleFiltroChange('espacios', nuevosEspacios);
                      }}
                      disabled={loading}
                      className="w-4 h-4 text-amber-600 focus:ring-amber-500 border-amber-300 rounded"
                    />
                    <span className="text-amber-800 truncate">{espacio.nombre}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 🎯 Filtros de estados y ordenamiento - Cuarta fila */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Estados */}
          <div className="bg-slate-50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Estados de Reserva
            </h4>
            
            <div className="grid grid-cols-2 gap-2">
              {estadosDisponibles.map(estado => (
                <label key={estado.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={filtros.estados.includes(estado.value as any)}
                    onChange={(e) => {
                      const nuevosEstados = e.target.checked
                        ? [...filtros.estados, estado.value as any]
                        : filtros.estados.filter(est => est !== estado.value);
                      handleFiltroChange('estados', nuevosEstados);
                    }}
                    disabled={loading}
                    className="w-4 h-4 text-slate-600 focus:ring-slate-500 border-slate-300 rounded"
                  />
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${estado.color}`}>
                    {estado.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Ordenamiento */}
          <div className="bg-indigo-50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-indigo-800 mb-3 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
              </svg>
              Ordenamiento
            </h4>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-indigo-700 mb-1">Ordenar por</label>
                <select
                  value={filtros.ordenarPor}
                  onChange={(e) => handleFiltroChange('ordenarPor', e.target.value as PorteriaFilters['ordenarPor'])}
                  disabled={loading}
                  className="w-full px-3 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm disabled:opacity-50"
                >
                  <option value="fecha">Por fecha</option>
                  <option value="servicio">Por servicio</option>
                  <option value="contacto">Por contacto</option>
                  <option value="evento">Por evento</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-indigo-700 mb-1">Dirección</label>
                <select
                  value={filtros.orden}
                  onChange={(e) => handleFiltroChange('orden', e.target.value as PorteriaFilters['orden'])}
                  disabled={loading}
                  className="w-full px-3 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm disabled:opacity-50"
                >
                  <option value="asc">Ascendente</option>
                  <option value="desc">Descendente</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* 📊 Resumen de filtros aplicados */}
        {(filtros.busqueda || filtros.servicios.length > 0 || filtros.espacios.length > 0 || filtros.fechaInicio || filtros.fechaFin) && (
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-3 border border-blue-200">
            <h4 className="text-sm font-semibold text-blue-800 mb-2">Filtros Aplicados:</h4>
            <div className="flex flex-wrap gap-2 text-xs">
              {filtros.fechaInicio && (
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                  Desde: {filtros.fechaInicio}
                </span>
              )}
              {filtros.fechaFin && (
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                  Hasta: {filtros.fechaFin}
                </span>
              )}
              {filtros.busqueda && (
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full">
                  Búsqueda: "{filtros.busqueda}"
                </span>
              )}
              {filtros.servicios.length > 0 && (
                <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full">
                  Servicios: {filtros.servicios.length}
                </span>
              )}
              {filtros.espacios.length > 0 && (
                <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded-full">
                  Espacios: {filtros.espacios.length}
                </span>
              )}
              {filtros.estados.length < estadosDisponibles.length && (
                <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full">
                  Estados: {filtros.estados.length}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}