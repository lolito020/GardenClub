import { fileURLToPath } from 'url';
import path from 'path';
import { promises as fs } from 'fs';

async function main() {
  const dbPath = path.join(path.resolve('.'), 'data', 'db.json');
  const raw = await fs.readFile(dbPath, 'utf8');
  const db = JSON.parse(raw);
  const cobradorId = 'c1';

  const cobrador = db.collectors.find(c => c.id === cobradorId);
  if (!cobrador) {
    console.log('Cobrador no encontrado');
    return;
  }

  const pagosDelCobrador = db.payments.filter(p => p.cobradorId === cobradorId);

  function computeCommissionForPayment(p) {
    if (typeof p.comisionCobrador === 'number' && p.comisionCobrador > 0) return { computed: p.comisionCobrador, pagada: !!p.comisionPagada };

    const creditMov = db.movements.find(m => m.refId === p.id && m.tipo === 'CREDIT');
    let serviceId = null;
    if (creditMov && Array.isArray(creditMov.allocations) && creditMov.allocations.length > 0) {
      const alloc = creditMov.allocations[0];
      const debitId = alloc.debitId || alloc.debitMovementId || null;
      if (debitId) {
        const debitMov = db.movements.find(m => m.id === debitId);
        if (debitMov) serviceId = debitMov.refId || null;
      }
    }

    let porcentaje = 0;
    if (cobrador.tipoCobrador === 'PROFESOR') porcentaje = 50;
    else if (cobrador.tipoCobrador === 'CLUB') porcentaje = 0;
    else {
      const servicio = db.services.find(s => s.id === serviceId);
      if (servicio && typeof servicio.comisionCobrador === 'number') porcentaje = servicio.comisionCobrador;
      else porcentaje = cobrador.comisionPorDefecto || 0;
    }

    const com = Math.round((p.monto * porcentaje) / 100);
    return { computed: com, pagada: !!p.comisionPagada };
  }

  const pagosWith = pagosDelCobrador.map(p => ({ ...p, _computed: computeCommissionForPayment(p) }));
  const pagosConComision = pagosWith.filter(p => p._computed.computed && p._computed.computed > 0);

  const totalGenerado = pagosConComision.reduce((s, p) => s + p._computed.computed, 0);
  const pagosPendientes = pagosConComision.filter(p => !p._computed.pagada);
  const totalPendiente = pagosPendientes.reduce((s, p) => s + p._computed.computed, 0);
  const pagosPagados = pagosConComision.filter(p => p._computed.pagada);
  const totalPagado = pagosPagados.reduce((s, p) => s + p._computed.computed, 0);

  console.log('Cobrador:', cobrador.nombres, cobrador.apellidos, `(${cobrador.codigo})`);
  console.log('Tipo:', cobrador.tipoCobrador, 'Comisión por defecto:', cobrador.comisionPorDefecto);
  console.log('Pagos totales del cobrador:', pagosDelCobrador.length);
  console.log('Pagos con comisión aplicable:', pagosConComision.length);
  console.log('Total Generado (comisión):', totalGenerado);
  console.log('Total Pendiente:', totalPendiente);
  console.log('Total Pagado:', totalPagado);
  console.log('Pagos pendientes (ids):', pagosPendientes.map(p => p.id));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
