import * as pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import { formatLocalDate, getCurrentLocalDate } from './timezone-config';

// Initialize pdfMake with fonts
(pdfMake as any).vfs = (pdfFonts as any).pdfMake.vfs;

interface MovementForPDF {
  fecha: string;
  concepto: string;
  observaciones?: string;
  estado?: string;
  vence?: string;
  debe: number;
  haber: number;
  saldo: number;
}

export function generateMovementsPDF(
  movements: MovementForPDF[],
  memberName: string,
  memberCode: string
) {
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-PY', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  const tableBody = [
    // Header row
    [
      { text: 'Fecha', style: 'tableHeader' },
      { text: 'Concepto', style: 'tableHeader' },
      { text: 'Observaciones', style: 'tableHeader' },
      { text: 'Estado', style: 'tableHeader' },
      { text: 'Vence', style: 'tableHeader' },
      { text: 'Debe', style: 'tableHeader', alignment: 'right' },
      { text: 'Haber', style: 'tableHeader', alignment: 'right' },
      { text: 'Saldo', style: 'tableHeader', alignment: 'right' }
    ],
    // Data rows
    ...movements.map(mov => [
      { text: formatLocalDate(mov.fecha, false), style: 'tableCell' },
      { text: mov.concepto || '', style: 'tableCell' },
      { text: mov.observaciones || '', style: 'tableCell' },
      { text: mov.estado || '', style: 'tableCell' },
      { text: mov.vence ? formatLocalDate(mov.vence, false) : '', style: 'tableCell' },
      { text: mov.debe > 0 ? formatNumber(mov.debe) : '', style: 'tableCell', alignment: 'right' },
      { text: mov.haber > 0 ? formatNumber(mov.haber) : '', style: 'tableCell', alignment: 'right' },
      { text: formatNumber(mov.saldo), style: 'tableCell', alignment: 'right' }
    ])
  ];

  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape' as const,
    pageMargins: [20, 40, 20, 40],
    content: [
      {
        text: 'Garden Club Paraguayo',
        style: 'header',
        alignment: 'center' as const
      },
      {
        text: 'Estado de Cuenta',
        style: 'subheader',
        alignment: 'center' as const,
        margin: [0, 0, 0, 10]
      },
      {
        columns: [
          { text: `Socio: ${memberName}`, style: 'memberInfo' },
          { text: `Código: ${memberCode}`, style: 'memberInfo', alignment: 'right' as const }
        ],
        margin: [0, 0, 0, 20]
      },
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: tableBody
        },
        layout: {
          fillColor: function (rowIndex: number) {
            return rowIndex === 0 ? '#f3f4f6' : null;
          },
          hLineWidth: function () { return 0.5; },
          vLineWidth: function () { return 0.5; },
          hLineColor: function () { return '#d1d5db'; },
          vLineColor: function () { return '#d1d5db'; }
        }
      },
      {
        text: `Generado el ${formatLocalDate(getCurrentLocalDate(), true)}`,
        style: 'footer',
        alignment: 'center' as const,
        margin: [0, 20, 0, 0]
      }
    ],
    styles: {
      header: {
        fontSize: 16,
        bold: true,
        color: '#1f2937'
      },
      subheader: {
        fontSize: 14,
        bold: true,
        color: '#374151'
      },
      memberInfo: {
        fontSize: 11,
        color: '#6b7280'
      },
      tableHeader: {
        fontSize: 11,
        bold: true,
        color: '#374151',
        fillColor: '#f3f4f6'
      },
      tableCell: {
        fontSize: 11,
        color: '#1f2937'
      },
      footer: {
        fontSize: 9,
        color: '#9ca3af'
      }
    }
  };

  return (pdfMake as any).createPdf(docDefinition);
}