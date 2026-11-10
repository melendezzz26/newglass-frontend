import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { PlacementCanvas } from '../PlacementCanvas';
import { fixturePlacements, prepareFixture } from '../firstFitFixture';

const fixture = () => {
  const snapshot = prepareFixture([21, 22]);
  return { snapshot, placements: fixturePlacements(snapshot), visualContext: { runId: 103, executionId: 701 } };
};
const open3d = () => fireEvent.click(screen.getByRole('button', { name: 'Ver en 3D' }));

test('inspector vacío; 2D selecciona unidad y muestra original, rotación y técnico sin alterar el zoom', () => {
  const props = fixture();
  render(<PlacementCanvas {...props} />);
  expect(screen.getByRole('complementary', { name: 'Inspector de pieza' })).toHaveTextContent('Selecciona una pieza del patrón');
  fireEvent.click(screen.getByRole('button', { name: 'Acercar 2D' }));
  const zoom = screen.getByLabelText('Ampliación 2D');
  expect(zoom).toHaveTextContent('150 %');
  const placed = document.querySelector('[data-placement]');
  fireEvent.click(placed);
  expect(placed).toHaveAttribute('data-selected', 'true');
  expect(zoom).toHaveTextContent('150 %');
  const inspector = screen.getByRole('complementary', { name: 'Inspector de pieza' });
  expect(inspector).toHaveTextContent('Pedido de origen');
  expect(inspector).toHaveTextContent('Medidas originales');
  expect(inspector).toHaveTextContent('800 × 600 mm');
  fireEvent.click(within(inspector).getByText('Datos técnicos exactos'));
  expect(inspector).toHaveTextContent('Posición X');
  expect(inspector).toHaveTextContent('Geometría colocada');
  expect(document.querySelectorAll('[data-placement]')).toHaveLength(3);
  expect(screen.getAllByRole('complementary', { name: 'Inspector de pieza' })).toHaveLength(1);
});

test('2D y 3D conservan unidad seleccionada, sincronizan listado y reemplazan la ficha sin duplicar', () => {
  render(<PlacementCanvas {...fixture()} />);
  const placed = [...document.querySelectorAll('[data-placement]')];
  fireEvent.click(placed[0]);
  const inspector = screen.getByRole('complementary', { name: 'Inspector de pieza' });
  const initial = inspector.textContent;
  open3d();
  expect(document.querySelectorAll('[data-piece-3d][data-selected="true"]')).toHaveLength(1);
  const scene = screen.getByRole('slider', { name: 'Giro horizontal de la vista 3D' });
  fireEvent.keyDown(scene, { key: 'ArrowRight' });
  const yaw = scene.getAttribute('aria-valuenow');
  const others = [...document.querySelectorAll('[data-piece-3d]')].filter(item => item.getAttribute('data-selected') !== 'true');
  fireEvent.click(others[0]);
  expect(scene).toHaveAttribute('aria-valuenow', yaw);
  expect(document.querySelectorAll('[data-piece-3d][data-selected="true"]')).toHaveLength(1);
  expect(inspector.textContent).not.toBe(initial);
  const selected = screen.getByRole('list', { name: 'Colocaciones consultables' })
    .querySelector('button[aria-pressed="true"]');
  expect(selected).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver en 2D' }));
  expect(document.querySelectorAll('[data-placement][data-selected="true"]')).toHaveLength(1);
  expect(screen.getAllByRole('complementary', { name: 'Inspector de pieza' })).toHaveLength(1);
});

test('búsqueda y teclado seleccionan unidad; cambio de fuente limpia el inspector', () => {
  render(<PlacementCanvas {...fixture()} />);
  const search = screen.getByRole('searchbox', { name: 'Buscar ID, pedido o unidad' });
  fireEvent.change(search, { target: { value: 'pieza #102' } });
  const list = screen.getByRole('list', { name: 'Colocaciones consultables' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  const button = within(list).getByRole('button', { name: /Seleccionar pieza #102/ });
  button.focus();
  fireEvent.keyDown(button, { key: 'Enter' });
  fireEvent.click(button);
  expect(button).toHaveFocus();
  expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(document.querySelectorAll('[data-placement][data-selected="true"]')).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Vidrio del resultado'), { target: { value: '2:5.5' } });
  expect(screen.getByRole('complementary', { name: 'Inspector de pieza' })).toHaveTextContent('Selecciona una pieza del patrón');
  expect(document.querySelectorAll('[data-placement][data-selected="true"]')).toHaveLength(0);
});

test('el contexto de comparación y ejecución no reaprovecha la selección anterior', () => {
  const props = fixture();
  const { rerender } = render(<PlacementCanvas {...props} />);
  fireEvent.click(document.querySelector('[data-placement]'));
  expect(screen.getByRole('complementary', { name: 'Inspector de pieza' })).toHaveTextContent('Pieza #101');
  rerender(<PlacementCanvas {...props} visualContext={{ runId: 104, executionId: 701 }} />);
  expect(screen.getByRole('complementary', { name: 'Inspector de pieza' })).toHaveTextContent('Selecciona una pieza del patrón');
  fireEvent.click(document.querySelector('[data-placement]'));
  rerender(<PlacementCanvas {...props} visualContext={{ runId: 104, executionId: 702 }} />);
  expect(screen.getByRole('complementary', { name: 'Inspector de pieza' })).toHaveTextContent('Selecciona una pieza del patrón');
});

test('3D oculta etiquetas indiscriminadas, ofrece opción secundaria e inspector junto al patrón', () => {
  render(<PlacementCanvas {...fixture()} />); open3d();
  expect(document.querySelectorAll('.placement-3d-piece-label')).toHaveLength(0);
  fireEvent.click(document.querySelector('[data-piece-3d]'));
  expect(document.querySelectorAll('.placement-3d-piece-label')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar IDs generales' }));
  expect(document.querySelectorAll('.placement-3d-piece-label')).toHaveLength(3);
  expect(screen.getByRole('button', { name: 'Ocultar etiquetas generales' })).toHaveAttribute('aria-pressed', 'true');
});
