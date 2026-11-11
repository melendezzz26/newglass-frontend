// Formato y elegibilidad derivados exclusivamente del snapshot persistido.
const number = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 });
const metricExact = value => value === null || value === undefined ? null : String(value);

export function areaForOperator(value) {
  if (metricExact(value) === null || !Number.isFinite(Number(value))) return '—';
  const squareMeters = Number(value) / 1000000;
  return `${number.format(squareMeters)} m²`;
}

export function percentageForOperator(value) {
  return metricExact(value) === null || !Number.isFinite(Number(value)) ? '—' : `${number.format(Number(value))} %`;
}

export function eligibilityReason(comparison, execution, execute) {
  if (!execute) return 'Sin permisos para elegir';
  if (comparison.confirmed) return 'Corte ya confirmado';
  if (comparison.released) return 'Trabajo liberado (solo consulta)';
  if (!comparison.terminal) return 'En cálculo: espera el cierre';
  if (execution.outcome === 'FAILED' || execution.status === 'FALLIDA') return 'Motor con error';
  if (!execution.complete) return 'Cobertura incompleta';
  if (!comparison.selection_allowed || !execution.eligible) return 'Selección no habilitada';
  return null;
}
