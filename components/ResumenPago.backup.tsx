'use client';

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

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Resumen */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-2">📊 Resumen</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Monto Total:</span>
              <span className="font-medium">Gs. {totalConceptos > 0 ? parseInt(String(totalConceptos)).toLocaleString('es-PY') : '0'}</span>
            </div>
            
            {condicion === 'CONTADO' && (
              <div className="flex justify-between text-green-700">
                <span>Estado:</span>
                <span className="font-medium">PAGO COMPLETO</span>
              </div>
            )}
            
            {condicion === 'CREDITO' && (
              <>
                {permitirPagosParc && pagoAplicado ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Pago Aplicado:</span>
                      <span className="font-medium text-green-600">Gs. {pagoAplicadoNum.toLocaleString('es-PY')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Saldo Pendiente:</span>
                      <span className="font-medium text-orange-600">Gs. {saldoPendiente.toLocaleString('es-PY')}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-orange-700">
                    <span>Estado:</span>
                    <span className="font-medium">PENDIENTE DE PAGO</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Botones */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onProcessPayment}
            disabled={saving || !isFormValid}
            className={`px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
              condicion === 'CONTADO' 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {saving ? 'Guardando...' : (condicion === 'CONTADO' ? '� Registrar Pago Completo' : '� Registrar Servicio')}
          </button>
          
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}