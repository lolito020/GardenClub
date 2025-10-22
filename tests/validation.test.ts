import { areConceptsValid } from '../lib/concept-helpers';
import { describe, it, expect } from 'vitest';

describe('validation helpers', () => {
  it('areConceptsValid returns errors for missing servicioId', () => {
    const bad = [{ id: '1', servicioId: '', concepto: '', tipoServicio: 'MENSUAL', monto: '' }];
    const res = areConceptsValid(bad as any);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('areConceptsValid passes for good concepts', () => {
    const good = [{ id: '1', servicioId: 's1', concepto: '', tipoServicio: 'MENSUAL', monto: '1000' }];
    const res = areConceptsValid(good as any);
    expect(res.valid).toBe(true);
  });
});
