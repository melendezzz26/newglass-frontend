import { useState } from 'react';
import { pieceSelectionKey } from './pieceInspectionModel';

export function PiecePlacementList({ placements, scope, selectedKey, onSelect }) {
  const [filter, setFilter] = useState('');
  const normalized = filter.trim().toLocaleLowerCase('es-PE');
  const matching = placements.filter(piece => !normalized || [piece.id_pieza, piece.id_pedido, piece.unit_index,
    `pieza #${piece.id_pieza}`, `pedido #${piece.id_pedido}`, `unidad ${piece.unit_index}`]
    .some(value => String(value).toLocaleLowerCase('es-PE').includes(normalized)));
  return <section className="piece-placement-list" aria-label="Listado de piezas colocadas">
    <h4>Buscar y seleccionar piezas</h4>
    <label>Buscar ID, pedido o unidad
      <input className="ng-control" type="search" value={filter} onChange={event => setFilter(event.target.value)}
        placeholder="Ej. pieza #984, unidad 2" />
    </label>
    <p className="piece-placement-list__count" aria-live="polite">{matching.length} de {placements.length} unidades visibles en esta fuente.</p>
    <ol aria-label="Colocaciones consultables">{matching.map(piece => {
      const key = pieceSelectionKey(scope, piece);
      return <li key={key}><button type="button" aria-pressed={selectedKey === key}
        aria-label={`Seleccionar pieza #${piece.id_pieza}, unidad ${piece.unit_index}, pedido #${piece.id_pedido}`}
        onClick={() => onSelect(key)}>Pieza #{piece.id_pieza} · unidad {piece.unit_index} · pedido #{piece.id_pedido}
      </button></li>;
    })}</ol>
    {!matching.length && <p>No hay unidades que coincidan con la búsqueda.</p>}
  </section>;
}
