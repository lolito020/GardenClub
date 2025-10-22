import { X, AlertTriangle, Trash2, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { AuthClient } from '@/lib/auth-client';

interface RevertAnnualQuotasModalProps {
  open: boolean;
  onClose: () => void;
  memberId: string;
  memberName: string;
  memberCode: string;
  onSuccess: () => void;
}

interface RevertResult {
  deleted: number;
  skipped: number;
  totalReverted: number;
  deletedDebits: Array<{
    id: string;
    month?: number;
    monthText?: string;
    amount: number;
  }>;
  skippedDebits: Array<{
    id: string;
    month?: number;
    monthText?: string;
    amount: number;
    status: string;
    reason: string;
  }>;
}

export default function RevertAnnualQuotasModal({
  open,
  onClose,
  memberId,
  memberName,
  memberCode,
  onSuccess
}: RevertAnnualQuotasModalProps) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RevertResult | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleRevert() {
    if (!confirm(`¿Está seguro de revertir las cuotas generadas para ${year}?\n\nSolo se eliminarán débitos PENDIENTES. Los débitos con pagos o refinanciados no se eliminarán.`)) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setResult(null);

    try {
      const response = await AuthClient.authenticatedFetch(
        `/api/members/${memberId}/generate-annual-quotas?year=${year}`,
        {
          method: 'DELETE'
        }
      );

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.msg);
        setResult(data.result);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 2000);
      } else {
        setError(data.msg || 'Error al revertir cuotas');
      }
    } catch (err: any) {
      setError('Error de conexión al revertir cuotas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (!loading) {
      onClose();
      setError('');
      setSuccess('');
      setResult(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Revertir Cuotas Anuales
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {memberName} ({memberCode})
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Selector de Año */}
          {!result && !success && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Año a revertir
              </label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value) || currentYear)}
                disabled={loading}
                min={2000}
                max={2099}
                step={1}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Ej: 2025"
              />
            </div>
          )}

          {/* Warning */}
          {!result && !success && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-800">Advertencia</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Esta acción eliminará todos los débitos de cuota social PENDIENTES generados para el año {year}.
                </p>
                <ul className="mt-2 text-sm text-yellow-700 space-y-1">
                  <li>• Los débitos con pagos (PARCIAL o CANCELADO) no se eliminarán</li>
                  <li>• Los débitos refinanciados no se eliminarán</li>
                  <li>• Esta acción no se puede deshacer</li>
                </ul>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">¡Éxito!</p>
                <p className="text-sm text-green-700 mt-1">{success}</p>
              </div>
            </div>
          )}

          {/* Result Details */}
          {result && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Resumen</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Débitos eliminados</p>
                    <p className="font-semibold text-green-700">{result.deleted}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Débitos omitidos</p>
                    <p className="font-semibold text-yellow-700">{result.skipped}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-gray-600">Total revertido</p>
                    <p className="font-semibold text-gray-900">
                      {formatCurrency(result.totalReverted)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Deleted Debits */}
              {result.deletedDebits.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">
                    Débitos eliminados ({result.deleted})
                  </h3>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                    <ul className="space-y-2 text-sm">
                      {result.deletedDebits.map((debit) => (
                        <li key={debit.id} className="flex justify-between items-center">
                          <span className="text-gray-700">
                            {debit.monthText || `Mes ${debit.month || '?'}`}
                          </span>
                          <span className="font-medium text-gray-900">
                            {formatCurrency(debit.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Skipped Debits */}
              {result.skippedDebits.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">
                    Débitos omitidos ({result.skipped})
                  </h3>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                    <ul className="space-y-2 text-sm">
                      {result.skippedDebits.map((debit) => (
                        <li key={debit.id} className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-700">
                              {debit.monthText || `Mes ${debit.month || '?'}`}
                            </span>
                            <span className="font-medium text-gray-900">
                              {formatCurrency(debit.amount)}
                            </span>
                          </div>
                          <p className="text-xs text-yellow-700">
                            {debit.reason}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {result ? 'Cerrar' : 'Cancelar'}
          </button>
          {!result && !success && (
            <button
              onClick={handleRevert}
              disabled={loading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Revirtiendo...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Revertir Cuotas
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
