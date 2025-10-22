Datos del Servicio — multi-concept billing (developer notes)

Overview

This directory contains the UI and logic for the "Datos del Servicio" modal used when creating service charges for a member (CONTADO / CREDITO).

Key changes in the multi-concept refactor

- Support multiple independent "concept" rows per section (CONTADO and CREDITO). Each concept has its own:
  - `servicioId` (selected service)
  - `tipoServicio` (MENSUAL/ANUAL/UNICO/DIARIO)
  - `monto` (amount, string formatted with thousands separators)
  - `vencimiento` (computed date for periodic subscriptions)
  - `dias` (only for DIARIO tipo, shown in a separate row to prevent layout deformation)
  - `crearSuscripcion` (per-concept subscription flag)

- Global fields shared across all concepts in the modal:
  - `fecha` — single date for the entire transaction block
  - `observaciones` — single textarea for the whole block

Validation & UX

- Validation messages (e.g. "monto requerido") are gated behind a `showFormValidation` flag so fields are not highlighted immediately when the modal opens.
- Service selects filter options to avoid selecting the same service twice within the same section.
- When the last concept is removed from a section, an empty concept row is re-created so the UI always shows one row.

Helpers & Files

- `lib/concept-helpers.ts` contains small helpers used by the modal, including:
  - `createEmptyConcepto()` — returns an empty concept object
  - `calculateTotal()` — sums monto values from a list of concepts
  - `hasDuplicateService()` / `isServiceDuplicate()` — detect duplicate service selections within a section
  - `areConceptsValid()` — validator for concept arrays returning `{ valid, errors }`

Tests

- Unit tests for helpers were added under `tests/` using `vitest`.
  - `tests/concept-helpers.test.ts`
  - `tests/validation.test.ts`

How to run locally

1. Install dependencies:

```powershell
npm install
```

2. Run the app (dev):

```powershell
npm run dev
```

3. Run tests:

```powershell
npm test
```

Layout improvements

- **Compact single-row design**: All concept fields fit in one row using optimized column widths (3-2-2-2-1-1-1 grid).
- **DIARIO type handling**: "Días" field appears in the same row when needed, maintaining layout consistency.
- **Visual separation**: Each concept has a light gray background to clearly distinguish between multiple concepts.
- **Optimized controls**: 
  - Trash can icon-only delete button (compact design)
  - Shortened labels and placeholders for space efficiency
  - Centered checkbox and delete button alignment

Notes / Next steps

- Consider creating unit tests for the `isUnifiedFormValid()` logic directly by moving validation logic into a testable helper if more coverage is desired.
- Optionally add a CI workflow to run tests and a smoke end-to-end check for the modal flows.
