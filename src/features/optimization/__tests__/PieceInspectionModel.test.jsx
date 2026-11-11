import { expect, test } from 'vitest';
import { pieceSelectionKey, matchSelectedPiece, pieceInspectionDetails } from '../pieceInspectionModel';
import { fixturePlacements, prepareFixture } from '../firstFitFixture';

const fixture = () => {
  const snapshot = prepareFixture([21, 22]);
  const placements = fixturePlacements(snapshot);
  const first = placements[0];
  const source = snapshot.groups.flatMap(group => group.containers).find(s =>
    s.material_source === first.material_source && s.material_id === first.material_id && s.stock_unit_index === first.stock_unit_index);
  return { snapshot, placements, first, source };
};

test('identidad estable distingue comparación, motor, pedido, pieza, unidad y fuente física', () => {
  const { first } = fixture(), scope = { comparisonId: 103, executionId: 404 };
  const key = pieceSelectionKey(scope, first);
  for (const field of ['unit_index', 'id_pedido', 'id_pieza', 'stock_unit_index', 'material_id', 'material_source']) {
    const changed = { ...first, [field]: field === 'material_source' ? 'RETAZO' : Number(first[field]) + 1 };
    expect(pieceSelectionKey(scope, changed)).not.toBe(key);
  }
  expect(pieceSelectionKey({ comparisonId: 104, executionId: 404 }, first)).not.toBe(key);
  expect(pieceSelectionKey({ comparisonId: 103, executionId: 405 }, first)).not.toBe(key);
  expect(matchSelectedPiece([first], key, scope)).toBe(first);
  expect(matchSelectedPiece([{ ...first, unit_index: first.unit_index + 1 }], key, scope)).toBeNull();
  expect(matchSelectedPiece([first], key, { comparisonId: 104, executionId: 404 })).toBeNull();
  expect(matchSelectedPiece([first], null, scope)).toBeNull();
});

test('inspector recupera geometría original y no la reemplaza por colocación orientada', () => {
  const { snapshot, first, source } = fixture();
  const details = pieceInspectionDetails(snapshot, { ...first,
    geometria: { type: 'RECTANGULO', width_mm: 900, height_mm: 400 },
    rotation_deg: 90, x_mm: '25.125', y_mm: '70' }, source);
  expect(details).toMatchObject({ orderId: first.id_pedido, pieceId: first.id_pieza,
    unitIndex: first.unit_index, originalMeasures: '800 × 600 mm', rotationDeg: 90,
    positionX: '25.125', positionY: '70', sourceId: source.material_id, physicalUnit: source.stock_unit_index });
  expect(details.orientedGeometry).toMatchObject({ width_mm: 900, height_mm: 400 });
});

test('datos opcionales ausentes no se inventan ni se interpretan como exactos', () => {
  const { first, source } = fixture();
  const info = pieceInspectionDetails({ groups: [], orders: [] }, first, { ...source, material_name: undefined });
  expect(info.originalMeasures).toBe('No disponible en el resultado guardado');
  expect(info.originalGeometry).toBe(false);
  expect(info.areaMm2).toBeNull();
  expect(pieceInspectionDetails({}, null, source)).toBeNull();
});
