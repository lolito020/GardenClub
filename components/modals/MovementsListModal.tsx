'use client';
import { useState, useEffect } from 'react';
import { X, Edit, Trash2, Plus } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { AuthClient } from '@/lib/auth-client';
import EditMovementModal from './EditMovementModal';
import RefinancingModal from './RefinancingModal';

interface Movement {
  id: string;
  memberId: string;
  fecha: string;
  concepto: string;
  tipo: 'DEBIT' | 'CREDIT';
  monto: number;
  observaciones?: string;
  vencimiento?: string;
  status?: string;
  paidAmount?: number;
}

interface Payment {
  id: string;
  memberId: string;
  fecha: string;
  concepto: string;
  monto: number;
  formaPago: string;
  cobradorId?: string;
  numeroRecibo?: string;
  observaciones?: string;
  allocations?: Array<{ debitId: string; amount: number }>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  type: 'DEBIT' | 'CREDIT';
  onUpdate: () => void;
}

export default function MovementsListModal({ isOpen, onClose, memberId, type, onUpdate }: Props) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<Movement | Payment | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  // Selección múltiple para refinanciación
  const [selectedDebits, setSelectedDebits] = useState<string[]>([]);
  const [showRefinanceModal, setShowRefinanceModal] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, memberId, type]);

  async function loadData() {
    setLoading(true);
    try {
      if (type === 'DEBIT') {
        const response = await AuthClient.authenticatedFetch(`/api/members/${memberId}/movements?type=DEBIT`);
        const data = await response.json();
        setMovements(Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : []);
      } else {
        const response = await AuthClient.authenticatedFetch(`/api/payments?memberId=${memberId}`);
        const data = await response.json();
        setPayments(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(item: Movement | Payment) {
    const confirmMsg = type === 'DEBIT' 
      ? '¿Eliminar este débito?'
      : '¿Eliminar este pago? Esto también eliminará las asignaciones a débitos.';

    if (!confirm(confirmMsg)) return;

    try {
      let response;
      let cascade = false;
      let retried = false;
      do {
        if (type === 'DEBIT') {
          const url = `/api/movements/${item.id}` + (cascade ? '?cascade=true' : '');
          response = await AuthClient.authenticatedFetch(url, {
            method: 'DELETE'
          });
        } else {
          response = await AuthClient.authenticatedFetch(`/api/payments/${item.id}`, {
            method: 'DELETE'
          });
        }

        if (response.ok) {
          await loadData();
          onUpdate();
          return;
        } else if (type === 'DEBIT' && response.status === 409 && !cascade) {
          // Backend indica que hay pagos relacionados
          const data = await response.json();
          const pagos = data.relatedCredits || [];
          let msg = 'Este débito tiene pagos relacionados:\n';
          pagos.forEach((p: any, idx: number) => {
            msg += `\n${idx + 1}. ${p.fecha ? new Date(p.fecha).toLocaleDateString('es-PY') : ''} - ${p.concepto || ''} - Gs.${(p.monto || 0).toLocaleString('es-PY')}`;
          });
          msg += '\n\nSi continúas, se eliminarán también estos pagos. ¿Deseas continuar?';
          if (window.confirm(msg)) {
            cascade = true;
            retried = true;
          } else {
            return;
          }
        } else {
          const data = await response.json().catch(() => ({}));
          alert(data.msg || 'Error al eliminar');
          return;
        }
      } while (type === 'DEBIT' && !response.ok && response.status === 409 && !retried);
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Error al eliminar');
    }
  }

  function handleEdit(item: Movement | Payment) {
    setEditingItem(item);
    setShowEditModal(true);
  }

  function handleEditSuccess() {
    setShowEditModal(false);
    setEditingItem(null);
    loadData();
    onUpdate();
  }

  if (!isOpen) return null;

  const title = type === 'DEBIT' ? 'Editar Débitos' : 'Editar Créditos';
  const items = type === 'DEBIT' ? movements : payments;

  // Handler para selección múltiple
  function handleSelectDebit(id: string) {
    setSelectedDebits((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl bg-white rounded-lg shadow-lg max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between p-6 border-b">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No hay {type === 'DEBIT' ? 'débitos' : 'créditos'} registrados
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      {type === 'DEBIT' && <th></th>}
                      <th className="text-left py-2">Fecha</th>
                      <th className="text-left py-2">Concepto</th>
                      <th className="text-right py-2">Monto</th>
                      {type === 'DEBIT' && <th className="text-center py-2">Estado</th>}
                      {type === 'CREDIT' && <th className="text-left py-2">Forma Pago</th>}
                      <th className="text-center py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b hover:bg-gray-50">
                        {type === 'DEBIT' && (
                          <td className="py-2 text-center">
                            <input
                              type="checkbox"
                              checked={selectedDebits.includes(item.id)}
                              onChange={() => handleSelectDebit(item.id)}
                              disabled={(item as Movement).status === 'CANCELADO'}
                            />
                          </td>
                        )}
                        <td className="py-2">{formatDate(item.fecha)}</td>
                        <td className="py-2">{item.concepto}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(item.monto)}</td>
                        {type === 'DEBIT' && (
                          <td className="py-2 text-center">
                            <span className={`px-2 py-1 rounded text-xs ${
                              (item as Movement).status === 'CANCELADO' ? 'bg-green-100 text-green-800' :
                              (item as Movement).status === 'PARCIAL' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {(item as Movement).status || 'PENDIENTE'}
                            </span>
                          </td>
                        )}
                        {type === 'CREDIT' && (
                          <td className="py-2">{(item as Payment).formaPago}</td>
                        )}
                        <td className="py-2 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleEdit(item)}
                              className="text-blue-600 hover:text-blue-800 p-1"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(item)}
                              className="text-red-600 hover:text-red-800 p-1"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="p-6 border-t flex justify-between items-center">
            {type === 'DEBIT' && (
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                disabled={selectedDebits.length === 0}
                onClick={() => setShowRefinanceModal(true)}
              >
                Refinanciar deuda
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>

      {showEditModal && editingItem && (
        <EditMovementModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          memberId={memberId}
          movement={editingItem}
          type={type}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Modal de refinanciación (a implementar en el siguiente paso) */}
      {/* {showRefinanceModal && (
        <RefinancingModal
          isOpen={showRefinanceModal}
          onClose={() => setShowRefinanceModal(false)}
          memberId={memberId}
          debitIds={selectedDebits}
          onSuccess={() => {
            setShowRefinanceModal(false);
            setSelectedDebits([]);
            loadData();
            onUpdate();
          }}
        />
      )} */}
      {showRefinanceModal && type === 'DEBIT' && (
        <RefinancingModal
          isOpen={showRefinanceModal}
          onClose={() => setShowRefinanceModal(false)}
          memberId={memberId}
          member={{}} // TODO: Obtener datos del member desde el componente padre
          debits={movements.filter(m => selectedDebits.includes(m.id))}
          onSuccess={() => {
            setShowRefinanceModal(false);
            setSelectedDebits([]);
            loadData();
            onUpdate();
          }}
        />
      )}
    </>
  );
}