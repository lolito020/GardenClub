// 🎯 Componente de Filtros Compactos para Portería - Diseño Especificado por Usuario
// Primera fila: Servicios, Fecha específica, Buscar (tipo + campo)
// Segunda fila: Filtros rápidos (rangos), Estados, Ordenamiento

'use client';

import { useState, useEffect } from 'react';
import { 
  PorteriaFilters, 
  PorteriaFiltersProps,
  DEFAULT_PORTERIA_FILTERS,
  SearchType
} from '@/lib/porteria-types';
import { createDefaultFiltersForRange } from '@/lib/porteria-utils';

export default function CompactPorteriaFilters({ 
  filtros, 
  onFiltrosChange, 
  servicios = [], 
  espacios = [], 
  loading = false, 
  onReset 
}: PorteriaFiltersProps) {
  
  // 📅 Estado para rangos de fecha predefinidos
  const [rangoSeleccionado, setRangoSeleccionado] = useState<'hoy' | 'semana' | 'mes' | 'personalizado'>('personalizado');

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
    { value: 'contacto', label: 'Contacto' },
    { value: 'evento', label: 'Evento' },
    { value: 'todos', label: 'Ambos' }
  ];

  // 🎨 Opciones de estado (exactamente los mismos que en página de reservas)
    // 🎨 Opciones de estado (solo los realmente usados)
    const estadosDisponibles = [
      { value: 'ACTIVO', label: 'Activo' },
      { value: 'CULMINADO', label: 'Culminado' },
      { value: 'CANCELADO', label: 'Cancelado' }
    ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-4">
      {/* 🔥 PRIMERA FILA - Servicios, Fecha específica, Buscar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
        {/* Servicios */}
        <div className="lg:col-span-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Servicios
          </label>
          <select
            value={filtros.servicios.length > 0 ? filtros.servicios[0] : ''}
            onChange={(e) => {
              const valor = e.target.value;
              handleFiltroChange('servicios', valor ? [valor] : []);
            }}
            disabled={loading}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50"
          >
            <option value="">Todos los servicios</option>
            {servicios.map((servicio: any) => (
              <option key={servicio.id} value={servicio.id}>
                {servicio.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Fecha específica */}
        <div className="lg:col-span-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Fecha específica
          </label>
          <input
            type="date"
            value={filtros.fechaInicio}
            onChange={(e) => {
              const fecha = e.target.value;
              handleFiltroChange('fechaInicio', fecha);
              handleFiltroChange('fechaFin', fecha); // Misma fecha para inicio y fin
              setRangoSeleccionado('personalizado');
            }}
            disabled={loading}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50"
          />
        </div>

        {/* Buscar - Tipo de búsqueda + Campo */}
        <div className="lg:col-span-5 grid grid-cols-5 gap-2">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buscar
            </label>
            <select
              value={filtros.tipoBusqueda}
              onChange={(e) => handleFiltroChange('tipoBusqueda', e.target.value as SearchType)}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50"
            >
              {tiposBusqueda.map(tipo => (
                <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
              ))}
            </select>
          </div>
          <div className="col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              &nbsp;
            </label>
            <input
              type="text"
              value={filtros.busqueda}
              onChange={(e) => handleFiltroChange('busqueda', e.target.value)}
              placeholder={`Buscar ${filtros.tipoBusqueda === 'contacto' ? 'contacto' : 
                              filtros.tipoBusqueda === 'evento' ? 'evento' : 'contacto/evento'}...`}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50"
            />
          </div>
        </div>

        {/* Botón limpiar */}
        <div className="lg:col-span-1">
          <button
            onClick={handleReset}
            disabled={loading}
            className="w-full px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors duration-200 disabled:opacity-50"
            title="Limpiar filtros"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* 🔥 SEGUNDA FILA - Filtros rápidos, Estados, Ordenamiento */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end pt-2 border-t border-gray-100">
        {/* Filtros rápidos - Rango de fecha */}
        <div className="lg:col-span-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Rango de fecha
          </label>
          <div className="flex gap-1">
            {[
              { key: 'hoy', label: 'Hoy' },
              { key: 'semana', label: 'Semana' },
              { key: 'mes', label: 'Mes' }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleRangoFecha(key as any)}
                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors duration-200 ${
                  rangoSeleccionado === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => {
                setRangoSeleccionado('personalizado');
                handleFiltroChange('fechaInicio', '');
                handleFiltroChange('fechaFin', '');
              }}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors duration-200 ${
                rangoSeleccionado === 'personalizado'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Todas
            </button>
          </div>
        </div>

        {/* Estados de Reserva */}
        <div className="lg:col-span-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Estado
          </label>
          <select
            value={filtros.estados.length > 0 ? filtros.estados[0] : ''}
            onChange={(e) => {
              const valor = e.target.value;
              handleFiltroChange('estados', valor ? [valor] : []);
            }}
            disabled={loading}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50"
          >
            <option value="">Todos los estados</option>
            {estadosDisponibles.map(estado => (
              <option key={estado.value} value={estado.value}>
                {estado.label}
              </option>
            ))}
          </select>
        </div>

        {/* Ordenamiento - Ordenar por */}
        <div className="lg:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ordenar por
          </label>
          <select
            value={filtros.ordenarPor}
            onChange={(e) => handleFiltroChange('ordenarPor', e.target.value as PorteriaFilters['ordenarPor'])}
            disabled={loading}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50"
          >
            <option value="fecha">Fecha</option>
            <option value="servicio">Servicio</option>
            <option value="contacto">Contacto</option>
            <option value="evento">Evento</option>
          </select>
        </div>

        {/* Ordenamiento - Dirección */}
        <div className="lg:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dirección
          </label>
          <select
            value={filtros.orden}
            onChange={(e) => handleFiltroChange('orden', e.target.value as PorteriaFilters['orden'])}
            disabled={loading}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50"
          >
            <option value="asc">Ascendente</option>
            <option value="desc">Descendente</option>
          </select>
        </div>

        {/* Indicador de carga/resultados */}
        <div className="lg:col-span-1">
          <div className="text-center">
            {loading ? (
              <div className="inline-flex items-center justify-center w-8 h-8">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="text-xs text-gray-500 font-medium">
                {/* Aquí podrías mostrar el número de resultados si está disponible */}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 📊 Indicadores de filtros activos (compacto) */}
      {(filtros.busqueda || filtros.servicios.length > 0 || filtros.fechaInicio || filtros.estados.length > 0) && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-500 font-medium">Filtros activos:</span>
          
          {filtros.fechaInicio && (
            <span className="inline-flex items-center px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
              📅 {filtros.fechaInicio}
              {filtros.fechaFin && filtros.fechaFin !== filtros.fechaInicio && ` - ${filtros.fechaFin}`}
            </span>
          )}
          
          {filtros.busqueda && (
            <span className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
              🔍 "{filtros.busqueda}"
            </span>
          )}
          
          {filtros.servicios.length > 0 && (
            <span className="inline-flex items-center px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">
              🏢 {servicios.find(s => s.id === filtros.servicios[0])?.nombre || 'Servicio'}
            </span>
          )}
          
          {filtros.estados.length > 0 && (
            <span className="inline-flex items-center px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">
              📋 {estadosDisponibles.find(e => e.value === filtros.estados[0])?.label || 'Estado'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}