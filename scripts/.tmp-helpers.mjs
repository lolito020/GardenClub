function createEmptyConcepto(): ConceptoItem {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: cryptoRandom(),
    servicioId: '',
    concepto: '',
    tipoServicio: 'MENSUAL',
    monto: '',
    dias: 1,
    vencimiento: addDays(today, 30),
    observaciones: '',
  };
}

function calculateTotal(conceptos: ConceptoItem[] | undefined): number {
  if (!conceptos || conceptos.length === 0) return 0;
  return conceptos.reduce((acc, c) => acc + (Number(getNumericValueSafe(c.monto)) || 0), 0);
}

function getNumericValueSafe(v: string | undefined | null) {
  if (!v) return '0';
  // Reutilizamos convención local: quitar separadores
  return String(v).replace(/\./g, '').replace(/,/g, '.');
}

function hasDuplicateService(conceptos: ConceptoItem[] | undefined): boolean {
  if (!conceptos) return false;
  const seen = new Set<string>();
  for (const c of conceptos) {
    if (!c.servicioId) continue;
    if (seen.has(c.servicioId)) return true;
    seen.add(c.servicioId);
  }
  return false;
}

function isServiceDuplicate(conceptos: ConceptoItem[] | undefined, servicioId: string): boolean {
  if (!conceptos || !servicioId) return false;
  const count = conceptos.reduce((acc, c) => acc + (c.servicioId === servicioId ? 1 : 0), 0);
  return count > 1;
}


// Small runtime helpers used by tests
function cryptoRandom() { return Math.random().toString(36).slice(2, 9); }

// Exports for tests
export { createEmptyConcepto, calculateTotal, getNumericValueSafe, hasDuplicateService, isServiceDuplicate };
