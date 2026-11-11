import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { PlacementCanvas } from '../PlacementCanvas';
import { fixturePlacements, prepareFixture } from '../firstFitFixture';
import { DEFAULT_YAW } from '../placementScene';

beforeEach(() => {
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    constructor(type, properties) { super(type, properties); this.pointerId = properties.pointerId; this.isPrimary = properties.isPrimary ?? true; }
  });
});
const data = () => {
  const snapshot = prepareFixture([21, 22]);
  return { snapshot, placements: fixturePlacements(snapshot) };
};
function open3D() { fireEvent.click(screen.getByRole('button', { name: 'Ver en 3D' })); return screen.getByRole('slider', { name: 'Giro horizontal de la vista 3D' }); }

test('piece dimensions stay visible in mm for rectangles, polygons and circles without changing coordinates', () => {
  const props = data(), original = JSON.stringify(props);
  render(<PlacementCanvas {...props} />);
  const camera = open3D();
  const list = screen.getByRole('list', { name: 'Colocaciones consultables' });
  expect(list).toHaveTextContent('Pieza #101');
  expect(list).toHaveTextContent('Pieza #102');
  expect(list).toHaveTextContent('Pieza #104');
  expect(document.querySelectorAll('.placement-3d-piece-label')).toHaveLength(0);
  fireEvent.click(document.querySelector('[data-piece-3d]'));
  expect(document.querySelector('[data-piece-3d]')).toHaveTextContent('800 × 600 mm');
  expect(screen.getByRole('complementary', { name: 'Inspector de pieza' })).toHaveTextContent('800 × 600 mm');
  const guides = () => [...document.querySelectorAll('.placement-3d-dimension line')].map(line => line.outerHTML);
  const first = guides();
  fireEvent.keyDown(camera, { key: 'ArrowUp' });
  guides().forEach((line, i) => expect(line).not.toBe(first[i]));
  fireEvent.keyDown(camera, { key: 'ArrowRight', shiftKey: true });
  expect(screen.getByRole('complementary', { name: 'Inspector de pieza' })).toHaveTextContent('800 × 600 mm');
  fireEvent.change(screen.getByLabelText('Vidrio del resultado'), { target: { value: '2:5.5' } });
  fireEvent.click(document.querySelector('[data-piece-3d]'));
  expect(document.querySelector('[data-piece-3d]')).toHaveTextContent('Diámetro 480 mm');
  expect(screen.getByRole('complementary', { name: 'Inspector de pieza' })).toHaveTextContent('Radio 240 mm');
  expect(JSON.stringify(props)).toBe(original);
});

test('camera elevation, pan, zoom and presets change only the projection, never placements', () => {
  const props = data(), original = JSON.stringify(props);
  render(<PlacementCanvas {...props} />);
  const camera = open3D();
  const path = () => document.querySelector('[data-piece-3d] > path:last-of-type').getAttribute('d');
  const first = path();
  fireEvent.keyDown(camera, { key: 'PageDown' });
  expect(screen.getByLabelText('Altura de cámara (Z)')).toHaveValue('43');
  expect(path()).not.toBe(first);
  const tilted = path();
  fireEvent.keyDown(camera, { key: 'ArrowRight', shiftKey: true });
  expect(path()).not.toBe(tilted);
  fireEvent.wheel(camera, { deltaY: -100 });
  expect(screen.getByLabelText('Ampliación 3D')).toHaveTextContent('125 %');
  fireEvent.click(screen.getByRole('button', { name: 'Vista superior' }));
  expect(screen.getByLabelText('Altura de cámara (Z)')).toHaveValue('90');
  fireEvent.click(screen.getByRole('button', { name: 'Vista en perspectiva' }));
  fireEvent.click(screen.getByRole('button', { name: 'Centrar corte' }));
  expect(path()).toBe(first);
  expect(JSON.stringify(props)).toBe(original);
});

test('view switch only appears once a visualizable placement exists, defaults to precise 2D', () => {
  const { snapshot, placements } = data();
  const view = render(<PlacementCanvas snapshot={snapshot} placements={[]} />);
  expect(screen.queryByRole('group', { name: 'Vista del resultado' })).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Colocaciones en plancha #15' })).toBeVisible();
  view.rerender(<PlacementCanvas snapshot={snapshot} placements={placements.slice(0, 1)} />);
  expect(screen.getByRole('button', { name: 'Ver en 2D' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Ver en 3D' })).toBeVisible();
});
test('switching view keeps material, yaw and immutable placements; each piece is identified', () => {
  const props = data(); const before = JSON.stringify(props);
  render(<PlacementCanvas {...props} />);
  fireEvent.change(screen.getByLabelText('Vidrio del resultado'), { target: { value: '2:5.5' } });
  const slider = open3D();
  expect(screen.getByLabelText('Plancha o retazo')).toHaveValue('PLANCHA:16:1');
  expect(screen.getByRole('list', { name: 'Colocaciones consultables' })).toHaveTextContent('Pieza #103 · unidad 1');
  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  fireEvent.click(screen.getByRole('button', { name: 'Ver en 2D' }));
  expect(screen.getByRole('img', { name: 'Colocaciones en plancha #16' }).querySelector('circle')).toHaveAttribute('r', '240');
  expect(open3D()).toHaveAttribute('aria-valuenow', String(DEFAULT_YAW + 5));
  expect(JSON.stringify(props)).toBe(before);
});
test('keyboard clamps yaw and reset restores only the visual camera', () => {
  render(<PlacementCanvas {...data()} />); const slider = open3D(); slider.focus();
  expect(slider).toHaveFocus();
  fireEvent.keyDown(slider, { key: 'End' }); fireEvent.keyDown(slider, { key: 'ArrowRight' });
  expect(slider).toHaveAttribute('aria-valuenow', '180');
  fireEvent.keyDown(slider, { key: 'Home' }); fireEvent.keyDown(slider, { key: 'ArrowLeft' });
  expect(slider).toHaveAttribute('aria-valuenow', '-180');
  fireEvent.click(screen.getByRole('button', { name: 'Restablecer vista' }));
  expect(slider).toHaveAttribute('aria-valuenow', String(DEFAULT_YAW));
  expect(document.querySelectorAll('[data-piece-3d]')).toHaveLength(3);
});
test('pointer drag orbits, changes elevation and stops on cancel', () => {
  render(<PlacementCanvas {...data()} />); const slider = open3D();
  fireEvent.pointerDown(slider, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
  fireEvent.pointerMove(slider, { pointerId: 1, clientX: 100, clientY: 500 });
  expect(slider).toHaveAttribute('aria-valuenow', String(DEFAULT_YAW));
  expect(screen.getByLabelText('Altura de cámara (Z)')).toHaveValue('90');
  fireEvent.pointerMove(slider, { pointerId: 1, clientX: 3000 }); expect(slider).toHaveAttribute('aria-valuenow', '180');
  fireEvent.pointerMove(slider, { pointerId: 1, clientX: -3000 }); expect(slider).toHaveAttribute('aria-valuenow', '-180');
  fireEvent.pointerCancel(slider, { pointerId: 1 });
  fireEvent.pointerMove(slider, { pointerId: 1, clientX: 400 }); expect(slider).toHaveAttribute('aria-valuenow', '-180');
});
test('dragging from a piece orbits without selecting, while a normal click still inspects it', () => {
  render(<PlacementCanvas {...data()} />);
  const camera = open3D();
  const capture = vi.fn();
  camera.setPointerCapture = capture;
  camera.hasPointerCapture = () => false;
  const piece = document.querySelector('[data-piece-3d]');
  const inspector = screen.getByRole('complementary', { name: 'Inspector de pieza' });
  expect(inspector).toHaveTextContent('Selecciona una pieza del patrón');

  // Pointer-down must bubble from the SVG piece to the viewport's camera handler.
  fireEvent.pointerDown(piece, { pointerId: 11, isPrimary: true, button: 0, clientX: 100, clientY: 100 });
  expect(capture).not.toHaveBeenCalled();
  fireEvent.pointerMove(camera, { pointerId: 11, clientX: 130, clientY: 160 });
  expect(capture).toHaveBeenCalledWith(11);
  expect(screen.getByLabelText('Altura de cámara (Z)')).not.toHaveValue('48');
  fireEvent.pointerUp(camera, { pointerId: 11 });
  fireEvent.click(piece);
  expect(inspector).toHaveTextContent('Selecciona una pieza del patrón');

  capture.mockClear();
  fireEvent.pointerDown(piece, { pointerId: 12, isPrimary: true, button: 0, clientX: 100, clientY: 100 });
  expect(capture).not.toHaveBeenCalled();
  fireEvent.pointerUp(camera, { pointerId: 12 });
  fireEvent.click(piece);
  expect(inspector).toHaveTextContent('Pieza #101');
});

test('legend colors are stable across progressive updates and expose received rotations', () => {
  const props = data(); const view = render(<PlacementCanvas {...props} placements={props.placements.slice(0, 1)} />); open3D();
  const firstColor = document.querySelector('.placement-3d-piece-surface').getAttribute('fill');
  view.rerender(<PlacementCanvas {...props} />);
  const list = screen.getByRole('list', { name: 'Colocaciones consultables' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  fireEvent.click(within(list).getByRole('button', { name: /Seleccionar pieza #102/ }));
  const inspector = screen.getByRole('complementary', { name: 'Inspector de pieza' });
  expect(inspector).toHaveTextContent('90°');
  fireEvent.click(within(list).getByRole('button', { name: /Seleccionar pieza #104/ }));
  expect(inspector).toHaveTextContent('30°');
  expect(document.querySelector('.placement-3d-piece-surface').getAttribute('fill')).toBe(firstColor);
  expect(screen.getByText(/no retazos reutilizables calculados/)).toBeVisible();
});
