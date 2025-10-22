import { useState, useEffect } from 'react';
import { formatCurrency, formatDate, gsFormat, gsParse } from '@/lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  member: any;
  debits: Movement[];
  onSuccess: () => void;
}

interface Movement {
  id: string;
  fecha: string;
  concepto: string;
  monto: number;
  vencimiento?: string;
  status?: string;
  paidAmount?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  debits: Movement[];
  onSuccess: () => void;
}

export default function RefinancingModal({ isOpen, onClose, memberId, member, debits, onSuccess }: Props) {
  const [installments, setInstallments] = useState(6);
  const [downPaymentPercent, setDownPaymentPercent] = useState(10);
  const [downPaymentAmount, setDownPaymentAmount] = useState(0);
  const [downPaymentAmountFormatted, setDownPaymentAmountFormatted] = useState('0');
  const [startDueDate, setStartDueDate] = useState(() => {
    // Inicializar con una fecha del próximo mes
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return nextMonth.toISOString().split('T')[0];
  });
  const [observations, setObservations] = useState('');
  const [calculation, setCalculation] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const principal = debits.reduce((sum, d) => sum + (d.monto - (d.paidAmount || 0)), 0);

  // Función para manejar cambio en el campo de cuota inicial formateado
  const handleDownPaymentAmountChange = (value: string) => {
    const formatted = gsFormat(value);
    const numericValue = gsParse(formatted);
    
    setDownPaymentAmountFormatted(formatted);
    setDownPaymentAmount(numericValue);
    
    // También actualizar el porcentaje si es válido
    if (principal > 0) {
      const newPercent = Math.round((numericValue / principal) * 100);
      if (newPercent <= 80) {
        setDownPaymentPercent(newPercent);
      }
    }
  };

  // FUNCIÓN MEJORADA PARA GENERAR PDF - VERSIÓN CORPORATIVA Y COMPACTA
  const generateRefinancingPDF = async () => {
    if (!calculation || !validation?.valid) {
      alert('No hay una proyección válida para generar el PDF');
      return;
    }

    try {
      setLoading(true);
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF('portrait', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      // Colores corporativos
      const primaryColor = [41, 128, 185] as const; // Azul corporativo
      const secondaryColor = [52, 73, 94] as const; // Gris oscuro
      const accentColor = [46, 204, 113] as const; // Verde
      const lightGray = [245, 246, 250] as const;
      const borderGray = [218, 223, 228] as const;
      let yPosition = 25;
      const lineHeight = 4.5;
      const smallLineHeight = 3.5;
      // Texto centrado
      const centerText = (text: string, y: number, fontSize: number = 12, isBold: boolean = false) => {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        const textWidth = doc.getTextWidth(text);
        const x = (pageWidth - textWidth) / 2;
        doc.text(text, x, y);
      };
      // Nueva página
      const checkNewPage = (requiredSpace: number = 30) => {
        if (yPosition + requiredSpace > pageHeight - 20) {
          doc.addPage();
          yPosition = 25;
          return true;
        }
        return false;
      };
      // ENCABEZADO CORPORATIVO
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageWidth, 15, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      centerText('CLUB SOCIAL DEPORTIVO', 10, 14, true);
      doc.setDrawColor(...primaryColor);
      doc.setLineWidth(0.8);
      doc.line(20, 18, pageWidth - 20, 18);
      doc.setTextColor(...secondaryColor);
      centerText('SOLICITUD DE REFINANCIACIÓN', 28, 16, true);
      yPosition = 38;
      doc.setFontSize(9);
      doc.setTextColor(...secondaryColor);
      const nombreCompleto = `${member?.nombres || member?.nombre || ''} ${member?.apellidos || member?.apellido || ''}`.trim();
      const cedula = member?.cedula || member?.ci || member?.numeroDocumento || '';
      const codigo = member?.codigo || member?.nroSocio || member?.id || '';
      doc.setFillColor(...lightGray);
      doc.rect(20, yPosition - 5, pageWidth - 40, 15, 'F');
      doc.setDrawColor(...borderGray);
      doc.rect(20, yPosition - 5, pageWidth - 40, 15);
      doc.setFont('helvetica', 'bold');
      doc.text('SOCIO:', 25, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(nombreCompleto || 'Información no disponible', 45, yPosition);
      doc.setFont('helvetica', 'bold');
      doc.text('C.I.N°:', 25, yPosition + 5);
      doc.setFont('helvetica', 'normal');
      doc.text(cedula || 'No disponible', 45, yPosition + 5);
      doc.setFont('helvetica', 'bold');
      doc.text('CÓDIGO:', 120, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(codigo || 'No disponible', 145, yPosition);
      doc.setFont('helvetica', 'bold');
      doc.text('FECHA:', 120, yPosition + 5);
      doc.setFont('helvetica', 'normal');
      doc.text(new Date().toLocaleDateString('es-PY'), 145, yPosition + 5);
      yPosition += 15;
      // SECCIÓN 1: DÉBITOS A REFINANCIAR
      checkNewPage(40);
      yPosition += 8;
      doc.setFontSize(11);
      doc.setTextColor(...primaryColor);
      doc.setFont('helvetica', 'bold');
      doc.text('1. DÉBITOS A REFINANCIAR', 20, yPosition);
      yPosition += 6;
      const tableHeaderY = yPosition;
      const rowHeight = 6;
      doc.setFillColor(...primaryColor);
      doc.rect(20, tableHeaderY, pageWidth - 40, rowHeight, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.text('CONCEPTO', 22, tableHeaderY + 4);
      doc.text('MONTO', 130, tableHeaderY + 4);
      doc.text('VENCIMIENTO', 160, tableHeaderY + 4);
      yPosition = tableHeaderY + rowHeight;
      doc.setTextColor(...secondaryColor);
      doc.setFont('helvetica', 'normal');
      debits.forEach((debit, index) => {
        if (index > 0 && index % 8 === 0) {
          checkNewPage(40);
          yPosition += 10;
        }
        if (index % 2 === 0) {
          doc.setFillColor(...lightGray);
          doc.rect(20, yPosition, pageWidth - 40, rowHeight, 'F');
        }
        doc.setDrawColor(...borderGray);
        doc.rect(20, yPosition, pageWidth - 40, rowHeight);
        const conceptText = debit.concepto.length > 45 ? debit.concepto.substring(0, 42) + '...' : debit.concepto;
        doc.text(conceptText, 22, yPosition + 4);
        doc.text(formatCurrency(debit.monto - (debit.paidAmount || 0)), 130, yPosition + 4);
        doc.text(debit.vencimiento ? formatDate(debit.vencimiento) : 'N/A', 160, yPosition + 4);
        yPosition += rowHeight;
      });
      doc.setFillColor(...secondaryColor);
      doc.rect(20, yPosition, pageWidth - 40, rowHeight, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL A REFINANCIAR:', 22, yPosition + 4);
      doc.text(formatCurrency(principal), 130, yPosition + 4);
      yPosition += rowHeight + 8;
      // SECCIÓN 2: TÉRMINOS DE REFINANCIACIÓN
      checkNewPage(30);
      doc.setTextColor(...primaryColor);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('2. TÉRMINOS DE REFINANCIACIÓN', 20, yPosition);
      yPosition += 6;
      const termsData = [
        ['Cantidad de Cuotas:', `${installments} cuotas`],
        ['Porcentaje Inicial:', `${downPaymentPercent}%`],
        ['Monto Cuota Inicial:', formatCurrency(downPaymentAmount)],
        ['Fecha Primera Cuota:', formatDate(startDueDate)],
        ['Monto por Cuota:', formatCurrency(calculation?.installmentAmount || 0)]
      ];
      termsData.forEach(([label, value], index) => {
        const rowY = yPosition + (index * 8);
        if (index % 2 === 0) {
          doc.setFillColor(...lightGray);
          doc.rect(20, rowY, pageWidth - 40, 8, 'F');
        }
        doc.setDrawColor(...borderGray);
        doc.rect(20, rowY, pageWidth - 40, 8);
        doc.setTextColor(...secondaryColor);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(label, 25, rowY + 5);
        doc.setFont('helvetica', 'normal');
        const valueX = pageWidth - 45 - doc.getTextWidth(value);
        doc.text(value, valueX, rowY + 5);
      });
      yPosition += (termsData.length * 8) + 4;
      // SECCIÓN 3: CRONOGRAMA DE PAGOS
      checkNewPage(50);
      doc.setTextColor(...primaryColor);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('3. CRONOGRAMA DE PAGOS', 20, yPosition);
      yPosition += 6;
      if (calculation?.schedule) {
        const scheduleItems = calculation.schedule;
        const usesTwoColumns = scheduleItems.length > 8;
        if (usesTwoColumns) {
          const itemsPerColumn = Math.ceil(scheduleItems.length / 2);
          const colWidth = (pageWidth - 50) / 2;
          doc.setFillColor(...primaryColor);
          doc.rect(20, yPosition, colWidth, 6, 'F');
          doc.rect(20 + colWidth + 10, yPosition, colWidth, 6, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(8);
          doc.text('CUOTA', 25, yPosition + 4);
          doc.text('MONTO', 60, yPosition + 4);
          doc.text('VENCIMIENTO', 95, yPosition + 4);
          doc.text('CUOTA', 25 + colWidth + 10, yPosition + 4);
          doc.text('MONTO', 60 + colWidth + 10, yPosition + 4);
          doc.text('VENCIMIENTO', 95 + colWidth + 10, yPosition + 4);
          yPosition += 6;
          const startY = yPosition;
          scheduleItems.forEach((installment: any, index: number) => {
            const rowY = startY + (Math.floor(index % itemsPerColumn) * 4);
            if (index < itemsPerColumn) {
              if (index % 2 === 0) {
                doc.setFillColor(...lightGray);
                doc.rect(20, rowY, colWidth, 4, 'F');
              }
              doc.setDrawColor(...borderGray);
              doc.rect(20, rowY, colWidth, 4);
              doc.setTextColor(...secondaryColor);
              doc.text(`${installment.number}`, 25, rowY + 2.5);
              doc.text(formatCurrency(installment.amount), 60, rowY + 2.5);
              doc.text(formatDate(installment.dueDate), 95, rowY + 2.5);
            } else {
              const rightIndex = index - itemsPerColumn;
              const rightRowY = startY + (rightIndex * 4);
              if (rightIndex % 2 === 0) {
                doc.setFillColor(...lightGray);
                doc.rect(20 + colWidth + 10, rightRowY, colWidth, 4, 'F');
              }
              doc.setDrawColor(...borderGray);
              doc.rect(20 + colWidth + 10, rightRowY, colWidth, 4);
              doc.setTextColor(...secondaryColor);
              doc.text(`${installment.number}`, 25 + colWidth + 10, rightRowY + 2.5);
              doc.text(formatCurrency(installment.amount), 60 + colWidth + 10, rightRowY + 2.5);
              doc.text(formatDate(installment.dueDate), 95 + colWidth + 10, rightRowY + 2.5);
            }
          });
          yPosition = startY + (itemsPerColumn * 4) + 8;
        } else {
          doc.setFillColor(...primaryColor);
          doc.rect(20, yPosition, pageWidth - 40, 6, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(8);
          doc.text('CUOTA', 25, yPosition + 4);
          doc.text('MONTO', 70, yPosition + 4);
          doc.text('VENCIMIENTO', 120, yPosition + 4);
          yPosition += 6;
          scheduleItems.forEach((installment: any, index: number) => {
            if (index % 2 === 0) {
              doc.setFillColor(...lightGray);
              doc.rect(20, yPosition, pageWidth - 40, 5, 'F');
            }
            doc.setDrawColor(...borderGray);
            doc.rect(20, yPosition, pageWidth - 40, 5);
            doc.setTextColor(...secondaryColor);
            doc.setFontSize(8);
            doc.text(`${installment.number}`, 25, yPosition + 3);
            doc.text(formatCurrency(installment.amount), 70, yPosition + 3);
            doc.text(formatDate(installment.dueDate), 120, yPosition + 3);
            yPosition += 5;
          });
          yPosition += 4;
        }
      }
      // SECCIÓN 4: RESUMEN FINANCIERO
      checkNewPage(25);
      doc.setTextColor(...primaryColor);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('4. RESUMEN FINANCIERO', 20, yPosition);
      yPosition += 6;
      doc.setFillColor(...lightGray);
      doc.rect(20, yPosition, pageWidth - 40, 20, 'F');
      doc.setDrawColor(...primaryColor);
      doc.rect(20, yPosition, pageWidth - 40, 20);
      const summaryData = [
        ['Total Principal Refinanciado:', formatCurrency(calculation?.principal || 0)],
        ['Cuota Inicial:', formatCurrency(calculation?.downPaymentAmount || 0)],
        ['Total Financiado en Cuotas:', formatCurrency(calculation?.totalInInstallments || 0)],
        ['Número Total de Cuotas:', `${installments} cuotas`],
        ['Monto por Cuota:', formatCurrency(calculation?.installmentAmount || 0)]
      ];
      summaryData.forEach(([label, value], index) => {
        const itemY = yPosition + 5 + (index * 3.5);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...secondaryColor);
        doc.text(label, 25, itemY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...secondaryColor);
        const valueX = pageWidth - 45 - doc.getTextWidth(value);
        doc.text(value, valueX, itemY);
      });
      yPosition += 25;
      // SECCIÓN 5: FIRMAS
      checkNewPage(35);
      doc.setTextColor(...primaryColor);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('5. AUTORIZACIONES', 20, yPosition);
      yPosition += 8;
      const signatureWidth = (pageWidth - 60) / 2;
      doc.setDrawColor(...borderGray);
      doc.rect(25, yPosition, signatureWidth, 25);
      doc.setFontSize(9);
      doc.setTextColor(...secondaryColor);
      doc.setFont('helvetica', 'bold');
      doc.text('FIRMA DEL SOCIO', 25 + (signatureWidth / 2) - (doc.getTextWidth('FIRMA DEL SOCIO') / 2), yPosition + 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Acepto los términos y condiciones de esta', 25 + 5, yPosition + 15);
      doc.text('refinanciación y me comprometo a su cumplimiento.', 25 + 5, yPosition + 19);
      doc.rect(35 + signatureWidth, yPosition, signatureWidth, 25);
      doc.setFont('helvetica', 'bold');
      doc.text('AUTORIZACIÓN DEL CLUB', 35 + signatureWidth + (signatureWidth / 2) - (doc.getTextWidth('AUTORIZACIÓN DEL CLUB') / 2), yPosition + 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Visto Bueno y Autorización de la', 35 + signatureWidth + 5, yPosition + 15);
      doc.text('Administración del Club', 35 + signatureWidth + 5, yPosition + 19);
      yPosition += 32;
      doc.setDrawColor(...borderGray);
      doc.line(20, yPosition, pageWidth - 20, yPosition);
      yPosition += 3;
      doc.setFontSize(7);
      doc.setTextColor(...secondaryColor);
      centerText(`Documento generado automáticamente el ${new Date().toLocaleString('es-PY')} - Página 1 de 1`, yPosition);
      const memberName = member.full_name || member.name || 'Sin_Nombre';
      const cleanName = memberName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').replace(/\s+/g, '_');
      const memberNumber = member.member_number || member.id;
      const todayDate = new Date().toLocaleDateString('es-PY', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
      }).replace(/\//g, '-');
      const fileName = `Refinanciacion_${cleanName}_${memberNumber}_${todayDate}.pdf`;
      doc.save(fileName);
      alert('PDF generado exitosamente');
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(`Error al generar PDF: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Sincronizar monto de anticipo
    const newAmount = Math.round(principal * (downPaymentPercent / 100));
    setDownPaymentAmount(newAmount);
    setDownPaymentAmountFormatted(gsFormat(newAmount.toString()));
  }, [principal, downPaymentPercent]);

  useEffect(() => {
    if (!isOpen) return;
    
    // Validar y calcular proyección
    async function fetchData() {
      setLoading(true);
      try {
        const [valRes, calcRes] = await Promise.all([
          fetch('/api/refinancing/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ principal, downPaymentPercent, installments, startDueDate })
          }).then(r => r.json()),
          fetch('/api/refinancing/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ principal, downPaymentPercent, installments, startDueDate })
          }).then(r => r.json())
        ]);
        
        // Validar que las respuestas tengan la estructura esperada
        if (valRes) {
          setValidation(valRes);
        }
        
        if (calcRes && calcRes.schedule) {
          setCalculation(calcRes);
        }
      } catch (error) {
        console.error('Error fetching refinancing data:', error);
        setValidation({ valid: false, errors: ['Error al cargar datos'], warnings: [] });
        setCalculation(null);
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [principal, downPaymentPercent, installments, startDueDate, isOpen]);

  if (!isOpen) return null;

  // Validación de datos requeridos
  if (!debits || debits.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Error</h3>
          <p className="text-gray-600 mb-4">No se han seleccionado débitos para refinanciar.</p>
          <button onClick={onClose} className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-lg font-semibold">Refinanciación de Deuda</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Débitos seleccionados</h4>
            <ul className="text-sm list-disc pl-5">
              {debits.map(d => (
                <li key={d.id}>
                  {d.concepto} — {formatCurrency(d.monto - (d.paidAmount || 0))} (Vence: {d.vencimiento ? formatDate(d.vencimiento) : '-'})
                </li>
              ))}
            </ul>
          </div>
          
          {loading && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <span className="animate-spin text-blue-600">⟳</span> Calculando proyección...
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Cantidad de cuotas</label>
              <input type="number" min={1} max={12} value={installments} onChange={e => setInstallments(Number(e.target.value))} className="w-full border rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-sm font-medium">Porcentaje de Cuota Inicial (%)</label>
              <input type="number" min={0} max={80} value={downPaymentPercent} onChange={e => setDownPaymentPercent(Number(e.target.value))} className="w-full border rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-sm font-medium">Cuota Inicial (monto)</label>
              <input 
                type="text" 
                inputMode="numeric"
                value={downPaymentAmountFormatted} 
                onChange={e => handleDownPaymentAmountChange(e.target.value)} 
                className="w-full border rounded px-2 py-1 font-mono text-right" 
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Fecha 1ª cuota</label>
              <input type="date" value={startDueDate} onChange={e => setStartDueDate(e.target.value)} className="w-full border rounded px-2 py-1" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Observaciones</label>
            <textarea value={observations} onChange={e => setObservations(e.target.value)} className="w-full border rounded px-2 py-1" />
          </div>
          {validation && !validation.valid && validation.errors && (
            <div className="bg-red-100 text-red-700 p-2 rounded">
              {validation.errors.map((err: string) => <div key={err}>{err}</div>)}
            </div>
          )}
          {calculation && calculation.schedule && Array.isArray(calculation.schedule) && (
            <div className="bg-gray-50 p-4 rounded">
              <div className="font-semibold mb-3">Proyección de cuotas</div>
              
              {/* Tabla de cuotas */}
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-3 py-2 text-left">Cuota Nro.</th>
                      <th className="border border-gray-300 px-3 py-2 text-right">Monto</th>
                      <th className="border border-gray-300 px-3 py-2 text-center">Fecha de Vencimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculation.schedule.map((q: any) => (
                      <tr key={q.number} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-3 py-2 font-medium">{q.number}</td>
                        <td className="border border-gray-300 px-3 py-2 text-right font-mono">{formatCurrency(q.amount)}</td>
                        <td className="border border-gray-300 px-3 py-2 text-center">{formatDate(q.dueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totales */}
              <div className="border-t border-gray-300 pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Total principal:</span>
                  <span className="font-bold">{formatCurrency(calculation.principal || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cuota inicial:</span>
                  <span className="font-bold text-blue-600">{formatCurrency(calculation.downPaymentAmount || 0)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2">
                  <span className="font-semibold">Total en cuotas:</span>
                  <span className="font-bold text-green-600">{formatCurrency(calculation.totalInInstallments || 0)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="p-6 border-t flex justify-between items-center">
          <button 
            onClick={() => generateRefinancingPDF()}
            disabled={!calculation || !validation?.valid || loading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            📄 Generar PDF
          </button>
          
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button 
              onClick={async () => {
              if (!validation?.valid) {
                alert('Por favor corrige los errores antes de continuar.');
                return;
              }
              
              setLoading(true);
              try {
                const refinancingData = {
                  memberId,
                  debitIds: debits.map(d => d.id),
                  principal,
                  installments,
                  downPaymentPercent,
                  downPaymentAmount,
                  startDueDate,
                  observations
                };
                
                const response = await fetch('/api/refinancing/process', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(refinancingData)
                });
                
                if (response.ok) {
                  const result = await response.json();
                  alert('¡Refinanciación creada exitosamente!');
                  onSuccess();
                } else {
                  const errorData = await response.text();
                  throw new Error(`Error ${response.status}: ${errorData}`);
                }
              } catch (error) {
                console.error('Error processing refinancing:', error);
                alert(`Error al procesar la refinanciación: ${error instanceof Error ? error.message : 'Error desconocido'}`);
              } finally {
                setLoading(false);
              }
            }}
            disabled={!validation?.valid || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <span className="animate-spin mr-1">⟳</span> Procesando...
              </>
            ) : (
              '♻️ Refinanciar'
            )}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}