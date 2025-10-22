import React from 'react';

interface ResumenPagoProps {
  condicion: 'CONTADO' | 'CREDITO';
  conceptos: any[];
  pagoAplicado?: string;
  permitirPagosParc?: boolean;
  calculateTotal: (conceptos: any[]) => number;
  getNumericValue: (value: string) => string;
  onProcessPayment: () => void;
  isFormValid: boolean;
  saving: boolean;
  onCancel: () => void;
}

export default function ResumenPago({
  condicion,
  conceptos,
  pagoAplicado,
  permitirPagosParc,
  calculateTotal,
  getNumericValue,
  onProcessPayment,
  isFormValid,
  saving,
  onCancel
}: ResumenPagoProps) {
  const totalConceptos = calculateTotal(conceptos);
  const pagoAplicadoNum = pagoAplicado ? parseInt(getNumericValue(pagoAplicado)) : 0;
  const saldoPendiente = totalConceptos - pagoAplicadoNum;

  // Función auxiliar para determinar el estado de pago
  const getEstadoPago = () => {
    if (condicion === 'CONTADO') {
      return { texto: 'PAGO COMPLETO', color: 'text-green-700 bg-green-50 border-green-200' };
    } else if (condicion === 'CREDITO') {
      if (permitirPagosParc && pagoAplicadoNum > 0) {
        if (pagoAplicadoNum >= totalConceptos) {
          return { texto: 'PAGO COMPLETO', color: 'text-green-700 bg-green-50 border-green-200' };
        } else {
          return { texto: 'PAGO PARCIAL', color: 'text-blue-700 bg-blue-50 border-blue-200' };
        }
      } else {
        return { texto: 'PENDIENTE', color: 'text-orange-700 bg-orange-50 border-orange-200' };
      }
    }
    return { texto: 'PENDIENTE', color: 'text-gray-700 bg-gray-50 border-gray-200' };
  };

  const estadoPago = getEstadoPago();

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Resumen de Pago</h4>
      
      {/* Layout compacto en una sola fila */}
      <div className="flex flex-wrap items-center gap-4 justify-between">
        
        {/* Información de montos y conceptos en la misma línea */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Monto Total */}
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-gray-200">
            <span className="text-xs text-gray-600">Total:</span>
            <span className="font-semibold text-gray-900">
              Gs. {totalConceptos > 0 ? parseInt(String(totalConceptos)).toLocaleString('es-PY') : '0'}
            </span>
          </div>

          {/* Estado */}
          <div className={`px-3 py-2 rounded-lg border text-center ${estadoPago.color}`}>
            <span className="text-xs font-medium">{estadoPago.texto}</span>
          </div>

          {/* Información de conceptos y tipo de pago inline */}
          {Array.isArray(conceptos) && conceptos.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-gray-600">
              <span>📋 {conceptos.length} concepto{conceptos.length !== 1 ? 's' : ''}</span>
              {condicion === 'CONTADO' && <span>✅ Pago inmediato</span>}
              {condicion === 'CREDITO' && !permitirPagosParc && <span>📝 A crédito</span>}
              {condicion === 'CREDITO' && permitirPagosParc && <span>💰 Con pago parcial</span>}
            </div>
          )}

          {/* Pago Aplicado (solo si hay) */}
          {(condicion === 'CREDITO' && permitirPagosParc && pagoAplicadoNum > 0) && (
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-gray-200">
              <span className="text-xs text-gray-600">Pagado:</span>
              <span className="font-semibold text-green-600">
                Gs. {pagoAplicadoNum.toLocaleString('es-PY')}
              </span>
            </div>
          )}

          {/* Saldo Pendiente (solo si hay pago parcial) */}
          {(condicion === 'CREDITO' && permitirPagosParc && pagoAplicadoNum > 0 && saldoPendiente > 0) && (
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-gray-200">
              <span className="text-xs text-gray-600">Saldo:</span>
              <span className="font-semibold text-orange-600">
                Gs. {saldoPendiente.toLocaleString('es-PY')}
              </span>
            </div>
          )}
        </div>

        {/* Botones de acción */}
        <div className="flex items-center gap-2">
          <button
            onClick={onProcessPayment}
            disabled={saving || !isFormValid}
            className={`px-4 py-2 rounded-lg text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              condicion === 'CONTADO' 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                Guardando...
              </span>
            ) : (
              condicion === 'CONTADO' ? 'Pagar' : 'Registrar'
            )}
          </button>
          
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}