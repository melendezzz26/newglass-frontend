export function CutSeparation({ configuration }) {
  const value = configuration?.separacion_mm;
  if (value === undefined || value === null) return null;
  return <p>Separación de corte: {value} mm</p>;
}
