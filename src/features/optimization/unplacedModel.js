// Agrupación determinista de unidades, preservando IDs exactos.
export function groupUnplacedUnits(units = []) {
  const groups = new Map();
  for (const unit of units) {
    const key = `${unit.id_pedido}:${unit.id_pieza}:${unit.reason ?? ''}`;
    if (!groups.has(key)) groups.set(key, {
      key, orderId: unit.id_pedido, pieceId: unit.id_pieza,
      reason: unit.reason, units: [],
    });
    groups.get(key).units.push(unit.unit_index);
  }
  return [...groups.values()];
}
