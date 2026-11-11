import { PieceInspectorTechnical } from './PieceInspectorTechnical';
import './PieceInspection.css';

const format = value => value === null || value === undefined ? 'No disponible'
  : new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 }).format(Number(value));
const sourceLabel = value => value === 'RETAZO' ? 'Retazo' : value === 'PLANCHA' ? 'Plancha' : 'Fuente';

export function PieceInspector({ piece }) {
  return <aside className="piece-inspector" aria-label="Inspector de pieza">
    <h4>Inspector de pieza</h4>
    {!piece ? <p className="piece-inspector-empty">Selecciona una pieza del patrón para consultar sus detalles.</p>
      : <>
        <p className="piece-inspector-current" aria-live="polite">Pieza #{piece.pieceId} · unidad {piece.unitIndex}</p>
        <dl className="piece-inspector-facts">
          <div><dt>Pedido de origen</dt><dd>#{piece.orderId}</dd></div>
          <div><dt>Geometría</dt><dd>{piece.geometry}</dd></div>
          <div><dt>Medidas originales</dt><dd>{piece.originalMeasures}</dd></div>
          <div><dt>Rotación aplicada</dt><dd>{format(piece.rotationDeg)}°</dd></div>
          <div><dt>Tipo de vidrio</dt><dd>{piece.glass}</dd></div>
          <div><dt>Espesor</dt><dd>{format(piece.thicknessMm)} mm</dd></div>
          <div><dt>Material utilizado</dt><dd>{sourceLabel(piece.sourceType)} #{piece.sourceId}</dd></div>
          <div><dt>Unidad física</dt><dd>{piece.physicalUnit}</dd></div>
        </dl>
        <PieceInspectorTechnical piece={piece} />
      </>}
  </aside>;
}
