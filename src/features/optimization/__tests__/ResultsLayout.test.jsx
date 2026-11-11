import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import fixture from '../../../../docs/contracts/optimization/comparison-v2.json';
import { CompactComparisonTable } from '../CompactComparisonTable';
import { areaForOperator, eligibilityReason } from '../comparisonResultModel';
import { UnplacedSummary } from '../UnplacedSummary';
import { groupUnplacedUnits } from '../unplacedModel';

test('220 unidades pendientes se agrupan sin perder IDs de unidad ni motivo', () => {
  const units = Array.from({ length: 220 }, (_, index) => ({
    id_pedido: 65, id_pieza: 100 + Math.floor(index / 110), unit_index: index % 110 + 1,
    reason: index < 110 ? 'NO_FIT' : 'RESOURCE_LIMIT',
  }));
  const grouped = groupUnplacedUnits(units);
  expect(grouped).toHaveLength(2);
  expect(grouped.map(group => group.units.length)).toEqual([110, 110]);
  const { container } = render(<UnplacedSummary units={units} />);
  const summary = screen.getByRole('region', { name: 'Piezas sin colocar' });
  expect(summary).toHaveTextContent('220 unidades de 2 tipos y motivos');
  expect(within(summary).getAllByRole('listitem')).toHaveLength(2);
  expect(container.querySelectorAll('details')).toHaveLength(2);
  fireEvent.click(within(summary).getByText(/Pieza #100 · 110 unidades/));
  expect(within(container.querySelector('details[open]')).getByText(/Unidades exactas: 1, 2, 3/)).toBeVisible();
  expect(grouped[0].units.at(-1)).toBe(110);
});

test('tabla compacta usa seis motores, valores operativos y una vista técnica exacta', () => {
  const comparison = structuredClone(fixture.completed);
  const results = Object.fromEntries(Object.entries(fixture.results).map(([key, value]) => [key, structuredClone(value)]));
  const onChoose = vi.fn(), onInspect = vi.fn();
  render(<CompactComparisonTable comparison={comparison} results={results} execute busy={false} pendingChoice={null}
    selectedId={null} onChoose={onChoose} onInspect={onInspect} id="compare" />);
  const table = screen.getByRole('table', { name: 'Métricas de 6 motores' });
  expect(within(table).getAllByRole('row')).toHaveLength(7);
  expect(table).toHaveTextContent('Cobertura');
  expect(table).toHaveTextContent('Retazos reutilizados');
  expect(table).toHaveTextContent('m²');
  const m6 = within(table).getByRole('row', { name: /M6-BS/ });
  fireEvent.click(within(m6).getByRole('button', { name: 'Ver patrón M6-BS' }));
  expect(onInspect).toHaveBeenCalledWith('M6-BS');
  fireEvent.click(within(table).getByRole('radio', { name: 'Elegir First Fit' }));
  expect(onChoose).toHaveBeenCalledOnce();
  expect(areaForOperator('1500000')).toBe(`${new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 }).format(1.5)} m²`);
  const technical = screen.getByText('Datos técnicos exactos de los seis motores').closest('details');
  expect(technical).toHaveTextContent('Tiempo ms');
});

test('resultados parciales, liberados o en curso conservan radios deshabilitados y motivo', () => {
  const comparison = structuredClone(fixture.mixed);
  const partial = comparison.executions.find(item => item.outcome === 'PARTIAL');
  expect(eligibilityReason(comparison, partial, true)).toBe('Cobertura incompleta');
  const released = { ...comparison, released: true };
  expect(eligibilityReason(released, partial, true)).toBe('Trabajo liberado (solo consulta)');
  expect(eligibilityReason({ ...comparison, terminal: false }, partial, true)).toBe('En cálculo: espera el cierre');
});
