const coordinate = value => value === undefined || value === null ? 'No disponible' : String(value);

export function PieceInspectorTechnical({ piece }) {
  return <details className="piece-inspector-technical">
    <summary>Datos técnicos exactos</summary>
    <dl>
      {piece.positionX !== null && piece.positionX !== undefined && <div><dt>Posición X</dt><dd>{coordinate(piece.positionX)} mm</dd></div>}
      {piece.positionY !== null && piece.positionY !== undefined && <div><dt>Posición Y</dt><dd>{coordinate(piece.positionY)} mm</dd></div>}
      {piece.areaMm2 !== null && piece.areaMm2 !== undefined && <div><dt>Área original guardada</dt><dd>{coordinate(piece.areaMm2)} mm²</dd></div>}
      {piece.originalBounds && <div><dt>Caja envolvente original</dt><dd>{piece.originalBounds.width} × {piece.originalBounds.height} mm</dd></div>}
      {piece.storedGeometry?.type === 'POLIGONO_CONVEXO' && <div><dt>Vértices originales</dt><dd>{JSON.stringify(piece.storedGeometry.vertices_mm)} mm</dd></div>}
      {piece.orientedGeometry?.type && <div><dt>Geometría colocada</dt><dd>{piece.orientedGeometry.type} (orientada por el motor)</dd></div>}
    </dl>
    <p>Coordenadas y áreas guardadas del resultado; no son una medición del sombreado visual de la merma.</p>
  </details>;
}
