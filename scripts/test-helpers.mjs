// Implementación local de los helpers para pruebas rápidas
function cryptoRandom() { return Math.random().toString(36).slice(2, 9); }

function calcularVencimientoAutomatico(fechaBase, tipoServicio, dias) {
  if (!fechaBase) return new Date().toISOString().slice(0, 10);
  
  const fecha = new Date(fechaBase);
  
  switch (tipoServicio) {
    case 'MENSUAL':
      fecha.setDate(fecha.getDate() + 30);
      break;
    case 'ANUAL':
      fecha.setDate(fecha.getDate() + 365);
      break;
    case 'DIARIO':
      const diasAPagar = dias || 1;
      fecha.setDate(fecha.getDate() + diasAPagar);
      break;
    case 'UNICO':
      return fechaBase;
    default:
      fecha.setDate(fecha.getDate() + 30);
      break;
  }
  
  return fecha.toISOString().slice(0, 10);
}

function createEmptyConcepto() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: cryptoRandom(),
    servicioId: '',
    concepto: '',
    tipoServicio: 'MENSUAL',
    monto: '',
    dias: 1,
    vencimiento: calcularVencimientoAutomatico(today, 'MENSUAL'),
    observaciones: '',
    vencimientoManual: false,
  };
}

function getNumericValueSafe(v) {
  if (!v) return '0';
  return String(v).replace(/\./g, '').replace(/,/g, '.');
}

function calculateTotal(conceptos) {
  if (!conceptos || conceptos.length === 0) return 0;
  return conceptos.reduce((acc, c) => acc + (Number(getNumericValueSafe(c.monto)) || 0), 0);
}

function hasDuplicateService(conceptos) {
  if (!conceptos) return false;
  const seen = new Set();
  for (const c of conceptos) {
    if (!c.servicioId) continue;
    if (seen.has(c.servicioId)) return true;
    seen.add(c.servicioId);
  }
  return false;
}

function isServiceDuplicate(conceptos, servicioId) {
  if (!conceptos || !servicioId) return false;
  const count = conceptos.reduce((acc, c) => acc + (c.servicioId === servicioId ? 1 : 0), 0);
  return count > 1;
}

// Tests
try {
  const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'Assertion failed'); };

  // Test básico de createEmptyConcepto
  const a = createEmptyConcepto();
  assert(a && a.id && a.servicioId === '', 'createEmptyConcepto básico');
  assert(a.vencimientoManual === false, 'createEmptyConcepto tiene vencimientoManual false');

  // Test de cálculo total
  const list = [ { ...a, monto: '10.000' }, { ...createEmptyConcepto(), monto: '5.000' } ];
  list[1].servicioId = 'svc-2';
  list[0].servicioId = 'svc-1';
  const total = calculateTotal(list);
  assert(total === 15000, `calculateTotal suma correcta (obtenido ${total})`);

  assert(getNumericValueSafe('10.000') === '10.000'.replace(/\./g, '').replace(/,/g, '.'), 'getNumericValueSafe ok');

  // Test de duplicados
  const dupList = [ { servicioId: 's1' }, { servicioId: 's1' } ];
  assert(hasDuplicateService(dupList) === true, 'hasDuplicateService detecta duplicado');
  assert(isServiceDuplicate(dupList, 's1') === true, 'isServiceDuplicate detecta duplicado');

  // Test de vencimiento automático
  const today = new Date().toISOString().slice(0, 10);
  const vencMensual = calcularVencimientoAutomatico(today, 'MENSUAL');
  const expectedMensual = new Date();
  expectedMensual.setDate(expectedMensual.getDate() + 30);
  assert(vencMensual === expectedMensual.toISOString().slice(0, 10), 'Vencimiento MENSUAL correcto');

  const vencAnual = calcularVencimientoAutomatico(today, 'ANUAL');
  const expectedAnual = new Date();
  expectedAnual.setDate(expectedAnual.getDate() + 365);
  assert(vencAnual === expectedAnual.toISOString().slice(0, 10), 'Vencimiento ANUAL correcto');

  const vencDiario = calcularVencimientoAutomatico(today, 'DIARIO', 5);
  const expectedDiario = new Date();
  expectedDiario.setDate(expectedDiario.getDate() + 5);
  assert(vencDiario === expectedDiario.toISOString().slice(0, 10), 'Vencimiento DIARIO correcto');

  const vencUnico = calcularVencimientoAutomatico(today, 'UNICO');
  assert(vencUnico === today, 'Vencimiento UNICO es el mismo día');

  console.log('✅ Todos los tests de helpers pasaron, incluyendo vencimiento automático.');
} catch (err) {
  console.error('❌ Tests fallaron:', err);
  process.exit(2);
}
