import { useEffect, useId, useMemo, useState } from 'react';
import { containerKey, placementKey } from './optimizationModel';
import { getGeometryBounds } from './visualizationGeometry';
import { PlacementScene3D } from './PlacementScene3D';
import { DEFAULT_YAW, placementColors } from './placementScene';
import { placementMatchesGroup } from './materialGroups';
import { InspectionViewport } from './InspectionViewport';
import { RasterInspection } from './RasterInspection';
import { PieceInspector } from './PieceInspector';
import { PiecePlacementList } from './PiecePlacementList';
import { matchSelectedPiece, pieceInspectionDetails, pieceSelectionKey } from './pieceInspectionModel';

function Shape({ geometry }) {
  if (geometry.type === 'RECTANGULO') return <rect width={geometry.width_mm} height={geometry.height_mm} />;
  if (geometry.type === 'CIRCUNFERENCIA') return <circle r={geometry.radius_mm} />;
  return <polygon points={geometry.vertices_mm.map(p => p.join(',')).join(' ')} />;
}
export function PlacementCanvas({ snapshot, placements, visualContext }) {
  const titleId = useId();
  const [chosen, setChosen] = useState('');
  const [chosenGroup, setChosenGroup] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const scope = { comparisonId: visualContext?.runId ?? null, executionId: visualContext?.executionId ?? null };
  useEffect(() => { setSelectedKey(null); }, [scope.comparisonId, scope.executionId]);
  const [view, setView] = useState('2d');
  const [yaw, setYaw] = useState(DEFAULT_YAW);
  const [zoom3d, setZoom3d] = useState(1);
  const [camera, setCamera] = useState({ elevation: 48, panX: 0, panY: 0 });
  const group = snapshot.groups.find(g => g.id === chosenGroup) ?? snapshot.groups[0];
  const containers = group?.containers ?? [];
  const container = containers.find(c => containerKey(c) === chosen) ?? containers[0];
  const compatible = useMemo(() => placements.filter(p => group && p.group_id === group.id && placementMatchesGroup(snapshot, p)), [placements, group, snapshot]);
  const visible = useMemo(() => compatible.filter(p => container && containerKey(p) === containerKey(container)), [compatible, container]);
  const selected = matchSelectedPiece(visible, selectedKey, scope);
  const inspected = selected && container ? pieceInspectionDetails(snapshot, selected, container) : null;
  if (!container) return null;
  const bounds = getGeometryBounds(container.geometry);
  const residuals = (snapshot.residuals ?? []).filter(region => containerKey(region) === containerKey(container));
  const canVisualize = compatible.some(p => containers.some(c => containerKey(c) === containerKey(p)
    && c.material_width_mm > 0 && c.material_height_mm > 0 && getGeometryBounds(c.geometry))
    && getGeometryBounds(p.geometria));
  return <section className="first-fit-canvas" aria-label="Distribución de piezas">
    <div className="first-fit-group-select"><label htmlFor={`${titleId}-group`}>Vidrio del resultado</label>
      <select id={`${titleId}-group`} className="ng-control" value={group.id} onChange={e => { setChosenGroup(e.target.value); setChosen(''); setSelectedKey(null); }}>
        {snapshot.groups.map(g => <option key={g.id} value={g.id}>{g.name} · {g.thickness} mm</option>)}
      </select></div>
    <p>Vidrio: {group.name} · {group.thickness} mm · pedidos {group.orders.map(id => `#${id}`).join(', ')}</p>
    <label htmlFor={titleId}>Plancha o retazo</label>
    <select id={titleId} className="ng-control" value={containerKey(container)} onChange={e => { setChosen(e.target.value); setSelectedKey(null); }}>
      {containers.map(c => <option key={containerKey(c)} value={containerKey(c)}>{c.material_source === 'PLANCHA' ? 'Plancha' : 'Retazo'} #{c.material_id} · unidad {c.stock_unit_index} · {c.material_name ?? 'Material'} · {c.espesor_mm} mm</option>)}
    </select>
    <p>{container.material_source === 'PLANCHA' ? 'Plancha seleccionada' : 'Retazo seleccionado'}: {container.material_width_mm} × {container.material_height_mm} mm · unidad física {container.stock_unit_index}</p>
    {canVisualize && <div className="placement-view-switch" role="group" aria-label="Vista del resultado">
      <button type="button" className="ng-button" aria-pressed={view === '2d'} onClick={() => setView('2d')}>Ver en 2D</button>
      <button type="button" className="ng-button" aria-pressed={view === '3d'} onClick={() => setView('3d')}>Ver en 3D</button>
      <button type="button" className="ng-button" aria-pressed={view === 'raster'} onClick={() => setView('raster')}>Ver detalle de piezas</button>
    </div>}
    <div className="piece-inspection-layout">
      <div className="piece-inspection-main">
    {view === 'raster' && canVisualize ? <RasterInspection key={group.id} snapshot={snapshot} group={group} placements={visible} visualContext={visualContext} />
      : view === '3d' && canVisualize ? <PlacementScene3D snapshot={snapshot} container={container} placements={visible} scope={scope} selectedKey={selectedKey} onSelect={setSelectedKey} yaw={yaw} onYawChange={setYaw} zoom={zoom3d} onZoomChange={setZoom3d} camera={camera} onCameraChange={setCamera} /> : <>
    <InspectionViewport label="2D">
    <svg className="first-fit-sheet" viewBox={`0 0 ${container.material_width_mm} ${container.material_height_mm}`}
      preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Colocaciones en ${container.material_source.toLowerCase()} #${container.material_id}`}>
      <defs><pattern id={`${titleId}-waste`} width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#fae1dc" /><path d="M0 20L20 0" stroke="#dca095" strokeWidth="3" /></pattern></defs>
      <g className="first-fit-container" style={{ fill: `url(#${titleId}-waste)` }} transform={`translate(${-bounds.minX} ${-bounds.minY})`}><Shape geometry={container.geometry} /></g>
      {residuals.map(region => <rect key={`${region.x_mm}:${region.y_mm}`} data-recoverable-region="" x={region.x_mm} y={region.y_mm}
        width={region.width_mm} height={region.height_mm} fill="#a2d9bd" stroke="#176f66" strokeWidth="2"><title>Retazo reutilizable · {region.area_mm2} mm²</title></rect>)}
      {visible.map(p => {
        const b = getGeometryBounds(p.geometria);
        const [color, edge] = placementColors(snapshot, p);
        const key = pieceSelectionKey(scope, p);
        const isSelected = selectedKey === key;
        return <g key={placementKey(p)} data-placement={placementKey(p)} data-selected={isSelected} className="first-fit-piece"
          onClick={() => setSelectedKey(key)}
          style={{ fill: color, stroke: isSelected ? '#bb4b06' : edge,
            strokeWidth: isSelected ? Math.max(2, Math.min(container.material_width_mm, container.material_height_mm) * .003) : undefined }}
          transform={`translate(${p.x_mm} ${p.y_mm})`}>
          <title>Pedido #{p.id_pedido} · Pieza #{p.id_pieza} · unidad {p.unit_index} · rotación aplicada: {p.rotation_deg}°</title>
          <g transform={`translate(${-b.minX} ${-b.minY})`}><Shape geometry={p.geometria} /></g>
          <text x={b.width / 2} y={b.height / 2} textAnchor="middle" dominantBaseline="middle"
            style={{ fontSize: Math.min(60, b.height / 4, b.width / (String(p.id_pieza).length + 1)) }}>#{p.id_pieza}</text>
        </g>;
      })}
    </svg>
    </InspectionViewport>
    <details className="piece-visual-notes"><summary>Leyenda y precisión del patrón</summary>
      <ul className="cut-area-legend" aria-label="Leyenda de aprovechamiento">
        <li>Piezas colocadas: colores por pieza</li><li>Verde: retazo reutilizable calculado</li>
        <li>Rosado rayado: merma no reutilizable (ubicación aproximada)</li>
      </ul>
      <p>El retazo verde corresponde a la región calculada y guardada. La merma se informa por su área exacta;
        el sombreado del espacio restante es aproximado, especialmente en bordes curvos y separación entre piezas.</p>
      {!residuals.length && <p>Este resultado no incluye regiones recuperables para esta plancha o retazo.</p>}
    </details>
    {!visible.length && <p>Las piezas aparecerán al recibir sus colocaciones.</p>}
    </>}
        <PiecePlacementList placements={visible} scope={scope} selectedKey={selected ? selectedKey : null} onSelect={setSelectedKey} />
      </div>
      <PieceInspector piece={inspected} />
    </div>
  </section>;
}
