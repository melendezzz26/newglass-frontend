import { CATALOG_V2 } from './comparisonV2Contract';

import { areaForOperator, percentageForOperator, eligibilityReason } from './comparisonResultModel';

const metricExact = value => value === null || value === undefined ? null : String(value);
const methodName = method => CATALOG_V2.find(item => item.code === method)?.name ?? method;

function statusLabel(execution) {
  if (execution.diagnostic?.statistics?.runtime_not_started_global === 1) return 'No ejecutado por interrupción global';
  if (execution.status === 'FALLIDA' || execution.outcome === 'FAILED') return 'Error técnico';
  if (execution.dispatch_state === 'QUEUED') return 'En espera';
  if (execution.dispatch_state === 'STARTING') return 'Iniciando';
  if (execution.dispatch_state === 'RUNNING') return 'Calculando';
  if (execution.outcome === 'PARTIAL' || execution.complete === false) return 'Parcial';
  return 'Completo';
}

export function CompactComparisonTable({ comparison, results, execute, busy, pendingChoice, selectedId, onChoose, onInspect, id }) {
  return <section className="comparison-decision" aria-label="Resumen para comparar motores">
    <div className="comparison-table-scroll" role="region" aria-label="Resumen comparativo desplazable" tabIndex={0}>
      <table className="comparison-decision-table">
        <caption>Métricas de {comparison.executions.length} motores</caption>
        <thead><tr>
          <th scope="col">Motor</th><th scope="col">Estado / Cobertura</th><th scope="col">Planchas / Retazos reutilizados</th>
          <th scope="col">Aprovechamiento</th><th scope="col">Merma / recuperable</th><th scope="col">Elegibilidad y acciones</th>
        </tr></thead>
        <tbody>{comparison.executions.map(execution => {
          const result = results[execution.execution_id]?.result;
          const reason = eligibilityReason(comparison, execution, execute);
          const isRunning = execution.dispatch_state !== 'TERMINATED';
          const metrics = execution.metrics;
          const remnants = result?.materials_used.filter(s => s.material_source === 'RETAZO').length;
          const exactArea = metrics?.merma_mm2;
          const exactRecovered = metrics?.retazo_recuperable_mm2;
          return <tr key={execution.execution_id} className={selectedId === execution.execution_id ? 'is-selected' : undefined}>
            <th scope="row"><strong>{execution.method}</strong><small>{methodName(execution.method)}</small></th>
            <td data-label="Estado / Cobertura"><strong>{statusLabel(execution)}</strong>
              {isRunning ? <small>Avance provisional; cobertura definitiva pendiente.</small>
                : <small>{execution.outcome === 'FAILED' ? '—' : `${execution.placed_units} / ${execution.total_units} piezas · ${percentageForOperator(execution.total_units ? execution.placed_units * 100 / execution.total_units : null)}`}</small>}
              {execution.diagnostic?.termination_reason && <small>{({ EXPANSION_LIMIT: 'Beam Search alcanzó su límite de expansiones.',
                WORKER_STOPPED: 'El proceso se interrumpió.', MEMORY_BUDGET_EXCEEDED: 'Se alcanzó el presupuesto de memoria.' })[execution.diagnostic.termination_reason]
                ?? execution.diagnostic.termination_reason}</small>}
            </td>
            <td data-label="Planchas / Retazos reutilizados">{metrics?.planchas_nuevas_usadas ?? '—'} / {remnants ?? '—'}</td>
            <td data-label="Aprovechamiento"><span title={metricExact(metrics?.aprovechamiento_pct) ?? ''}>{percentageForOperator(metrics?.aprovechamiento_pct)}</span></td>
            <td data-label="Merma / recuperable"><span title={exactArea === undefined || exactArea === null ? '' : `${exactArea} mm²`}>{areaForOperator(exactArea)}</span>
              <small title={exactRecovered === undefined || exactRecovered === null ? '' : `${exactRecovered} mm²`}>Recup. {areaForOperator(exactRecovered)}</small></td>
            <td data-label="Elegibilidad y acciones"><label><input type="radio" name={`${id}-engine`} aria-label={`Elegir ${methodName(execution.method)}`}
              checked={selectedId === execution.execution_id} disabled={!!reason || busy && pendingChoice !== execution.execution_id}
              onChange={() => onChoose(execution.execution_id)} />{selectedId === execution.execution_id ? 'Elegido' : 'Elegir'}</label>
              {reason && <small>{reason}</small>}
              <button type="button" className="ng-button" disabled={!result} onClick={() => onInspect(execution.method)}>Ver patrón {execution.method}</button>
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <details className="comparison-technical-results"><summary>Datos técnicos exactos de los seis motores</summary>
      <div className="comparison-table-scroll" role="region" aria-label="Detalle técnico comparativo" tabIndex={0}>
        <table><caption>Áreas en mm² y tiempos en ms, sin redondeo</caption>
          <thead><tr><th scope="col">Motor</th><th scope="col">Tiempo ms</th><th scope="col">Merma mm²</th><th scope="col">Recuperable mm²</th><th scope="col">Aprovechamiento %</th><th scope="col">Diagnóstico</th></tr></thead>
          <tbody>{comparison.executions.map(e => <tr key={e.execution_id}>
            <th scope="row">{e.method}</th><td>{e.metrics?.tiempo_computacional_ms ?? '—'}</td><td>{e.metrics?.merma_mm2 ?? '—'}</td>
            <td>{e.metrics?.retazo_recuperable_mm2 ?? '—'}</td><td>{e.metrics?.aprovechamiento_pct ?? '—'}</td>
            <td>{e.diagnostic?.termination_reason ?? '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>
  </section>;
}
