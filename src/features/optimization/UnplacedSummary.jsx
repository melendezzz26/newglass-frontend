import { groupUnplacedUnits } from './unplacedModel';
// EN-UX-001 · Las unidades sin colocar se conservan, pero no bloquean el visor.
const reasonLabel = reason => reason === 'RESOURCE_LIMIT'
  ? 'Pendientes por límite de recursos' : reason === 'NO_FIT'
    ? 'Sin espacio factible' : `Motivo: ${reason || 'sin detalle'}`;

export function UnplacedSummary({ units = [] }) {
  if (!units.length) return null;
  const groups = groupUnplacedUnits(units);
  return <section className="comparison-unplaced" aria-label="Piezas sin colocar">
    <h4>Piezas pendientes: {units.length} unidades de {groups.length} tipos y motivos</h4>
    <p>Estos elementos siguen sin colocarse. Puedes consultar cada número de unidad sin perder el patrón de corte.</p>
    <ul>{groups.map(group => <li key={group.key}>
      <details>
        <summary>Pedido #{group.orderId} · Pieza #{group.pieceId} · {group.units.length} unidades · {reasonLabel(group.reason)}</summary>
        <p>Unidades exactas: {group.units.join(', ')}</p>
      </details>
    </li>)}</ul>
  </section>;
}
