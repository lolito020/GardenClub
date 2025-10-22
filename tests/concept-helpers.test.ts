import { createEmptyConcepto, hasDuplicateService, isServiceDuplicate, calculateTotal } from '../lib/concept-helpers';
import { describe, it, expect } from 'vitest';

describe('concept-helpers', () => {
  it('createEmptyConcepto returns a valid object', () => {
    const c = createEmptyConcepto();
    expect(c).toHaveProperty('id');
    expect(c.servicioId).toBe('');
    expect(c.monto).toBe('');
  });

  it('hasDuplicateService detects duplicates', () => {
    const a = [{ id: '1', servicioId: 's1', concepto: '', tipoServicio: 'MENSUAL', monto: '1000' }, { id: '2', servicioId: 's1', concepto: '', tipoServicio: 'MENSUAL', monto: '2000' }];
    expect(hasDuplicateService(a as any)).toBe(true);
  });

  it('isServiceDuplicate counts instances', () => {
    const a = [{ id: '1', servicioId: 's1', concepto: '', tipoServicio: 'MENSUAL', monto: '1000' }, { id: '2', servicioId: 's2', concepto: '', tipoServicio: 'MENSUAL', monto: '2000' }];
    expect(isServiceDuplicate(a as any, 's1')).toBe(false);
    expect(isServiceDuplicate(a as any, 's2')).toBe(false);
  });

  it('calculateTotal sums monto values', () => {
    const a = [{ id: '1', servicioId: 's1', concepto: '', tipoServicio: 'MENSUAL', monto: '1.000' }, { id: '2', servicioId: 's2', concepto: '', tipoServicio: 'MENSUAL', monto: '2.500' }];
    expect(calculateTotal(a as any)).toBe(3500);
  });
});
