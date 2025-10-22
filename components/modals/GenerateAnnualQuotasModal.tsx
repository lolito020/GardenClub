import { X, Calendar, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils';
import { AuthClient } from '@/lib/auth-client';
import type { AnnualQuotaAnalysis } from '@/lib/annual-quota-generator';

interface GenerateAnnualQuotasModalProps {
  open: boolean;
  onClose: () => void;
  memberId: string;
  memberName: string;
  memberCode: string;
  onSuccess: () => void;
}

export default function GenerateAnnualQuotasModal({
  open,
  onClose,
  memberId,
  memberName,
  memberCode,
  onSuccess
}: GenerateAnnualQuotasModalProps) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<AnnualQuotaAnalysis | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Cargar análisis cuando se abre el modal o cambia el año
  useEffect(() => {
    if (open && memberId) {
      loadAnalysis();
    }
  }, [open, memberId, year]);

  async function loadAnalysis() {
    setAnalyzing(true);
    setError('');
    setSuccess('');
    setAnalysis(null);

    try {
      const response = await AuthClient.authenticatedFetch(
        `/api/members/${memberId}/generate-annual-quotas?year=${year}`
      );
      const data = await response.json();

      if (response.ok) {
        setAnalysis(data.analysis);
      } else {
        setError(data.msg || 'Error al analizar cuotas');
      }
    } catch (err: any) {
      setError('Error de conexión al analizar cuotas');
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGenerate() {
    if (!analysis || !analysis.canGenerate) return;

    setGenerating(true);
    setError('');
    setSuccess('');

    try {
      const response = await AuthClient.authenticatedFetch(
        `/api/members/${memberId}/generate-annual-quotas`,
        {
          method: 'POST',
          body: JSON.stringify({ year })
        }
      );

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.msg);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      } else {
        setError(data.msg || 'Error al generar cuotas');
      }
    } catch (err: any) {
      setError('Error de conexión al generar cuotas');
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  function handleClose() {
    if (!generating) {
      onClose();
      setError('');
      setSuccess('');
      setAnalysis(null);
    }
  }

  const monthNames = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Generar Cuotas Sociales Anuales
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {memberName} ({memberCode})
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={generating}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Selector de Año */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Año
            </label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value) || currentYear)}
              disabled={generating}
              min={2000}
              max={2099}
              step={1}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Ej: 2025"
            />
          </div>

          {/* Loading State */}
          {analyzing && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              <span className="ml-3 text-gray-600">Analizando...</span>
            </div>
          )}

          {/* Errors */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
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

          {/* Analysis Results */}
          {analysis && !analyzing && (
            <>
              {/* Warnings */}
              {analysis.warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-800">Advertencias</p>
                      <ul className="mt-2 space-y-1">
                        {analysis.warnings.map((warning, idx) => (
                          <li key={idx} className="text-sm text-yellow-700">• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Calendar View */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">
                  Estado de meses - {year}
                </h3>
                <div className="grid grid-cols-6 gap-2">
                  {monthNames.map((monthName, index) => {
                    const monthNumber = index + 1;
                    const existingDebit = analysis.existingDebits.find(d => d.month === monthNumber);
                    const isMissing = analysis.missingMonths.includes(monthNumber);
                    
                    let statusColor = 'bg-gray-100 text-gray-400 border-gray-200';
                    let statusIcon = null;
                    let statusText = 'N/A';

                    if (existingDebit) {
                      if (existingDebit.status === 'CANCELADO') {
                        statusColor = 'bg-green-100 text-green-700 border-green-300';
                        statusIcon = <CheckCircle2 className="w-3 h-3" />;
                        statusText = 'Pagado';
                      } else if (existingDebit.status === 'PARCIAL') {
                        statusColor = 'bg-yellow-100 text-yellow-700 border-yellow-300';
                        statusIcon = <AlertCircle className="w-3 h-3" />;
                        statusText = 'Parcial';
                      } else {
                        statusColor = 'bg-orange-100 text-orange-700 border-orange-300';
                        statusIcon = <AlertCircle className="w-3 h-3" />;
                        statusText = 'Pendiente';
                      }
                    } else if (isMissing) {
                      statusColor = 'bg-blue-50 text-blue-700 border-blue-200';
                      statusIcon = <Calendar className="w-3 h-3" />;
                      statusText = 'A crear';
                    }

                    return (
                      <div
                        key={index}
                        className={`border rounded-lg p-2 text-center ${statusColor}`}
                        title={statusText}
                      >
                        <div className="text-xs font-medium">{monthName}</div>
                        {statusIcon && (
                          <div className="flex justify-center mt-1">
                            {statusIcon}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-medium text-gray-900">Resumen</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Meses con débitos</p>
                    <p className="font-semibold text-gray-900">{analysis.existingDebits.length}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Meses a generar</p>
                    <p className="font-semibold text-blue-700">{analysis.monthsToGenerate}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Monto por mes</p>
                    <p className="font-semibold text-gray-900">
                      {formatCurrency(analysis.totalAmountToGenerate / Math.max(analysis.monthsToGenerate, 1))}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Total a generar</p>
                    <p className="font-semibold text-blue-700">
                      {formatCurrency(analysis.totalAmountToGenerate)}
                    </p>
                  </div>
                </div>
              </div>

              {/* No puede generar */}
              {!analysis.canGenerate && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-800">Información</p>
                    <p className="text-sm text-blue-700 mt-1">
                      Ya existen débitos para todos los meses de {year}. No hay nada que generar.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
          <button
            onClick={handleClose}
            disabled={generating}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleGenerate}
            disabled={!analysis || !analysis.canGenerate || generating || analyzing}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Generando...
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4" />
                Generar {analysis?.monthsToGenerate || 0} Cuotas
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
