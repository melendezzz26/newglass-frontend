// EN-UX-002: selección efímera de presentación, sin alterar los resultados persistidos.
import { describeOriginalMeasures, SHAPE_NAMES } from './originalMeasures.js';
import { getGeometryBounds } from './visualizationGeometry.js';

export function pieceSelectionKey({ comparisonId = null, executionId = null } = {}, placement) {
  if (!placement) return null;
  return JSON.stringify([comparisonId, executionId,
    placement.material_source, placement.material_id, placement.stock_unit_index,
    placement.id_pedido, placement.id_pieza, placement.unit_index]);
}

export function matchSelectedPiece(placements, key, scope) {
  if (!key) return null;
  return placements.find(placement => pieceSelectionKey(scope, placement) === key) ?? null;
}

export function pieceInspectionDetails(snapshot, placement, source) {
  if (!placement || !source) return null;
  const unit = snapshot.groups?.flatMap(group => group.units ?? [])
    .find(item => item.id_pedido === placement.id_pedido && item.id_pieza === placement.id_pieza
      && item.unit_index === placement.unit_index);
  const orderPiece = snapshot.orders?.find(order => order.id_pedido === placement.id_pedido)?.piezas
    ?.find(piece => piece.id_pieza === placement.id_pieza);
  // Never call oriented placement geometry an original measurement.
  const originalGeometry = unit?.geometria ?? orderPiece?.geometria ?? null;
  const original = originalGeometry
    ? describeOriginalMeasures({ geometria: originalGeometry, tipo_forma: unit?.tipo_forma ?? originalGeometry.type })
    : 'No disponible en el resultado guardado';
  const geometry = originalGeometry?.type ?? unit?.tipo_forma ?? placement.geometria?.type ?? null;
  const bounds = originalGeometry && getGeometryBounds(originalGeometry);
  const group = snapshot.groups?.find(group => group.units?.some(item => item.id_pedido === placement.id_pedido
    && item.id_pieza === placement.id_pieza && item.unit_index === placement.unit_index));
  return {
    orderId: placement.id_pedido, pieceId: placement.id_pieza, unitIndex: placement.unit_index,
    geometry: geometry ? SHAPE_NAMES[geometry] ?? geometry : 'No disponible',
    originalMeasures: original, originalGeometry: !!originalGeometry,
    rotationDeg: placement.rotation_deg,
    glass: source.material_name ?? group?.name ?? `Vidrio #${source.id_tipo_vidrio ?? placement.id_tipo_vidrio}`,
    thicknessMm: source.espesor_mm ?? placement.espesor_mm,
    sourceType: source.material_source, sourceId: source.material_id, physicalUnit: source.stock_unit_index,
    positionX: placement.x_mm, positionY: placement.y_mm, originalBounds: bounds,
    areaMm2: unit?.area_mm2 ?? null,
    storedGeometry: originalGeometry,
    orientedGeometry: placement.geometria ?? null,
  };
}
