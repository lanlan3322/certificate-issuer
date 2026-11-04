export function getCertificateTextDensity(...values: (string | undefined)[]) {
  const length = values.reduce<number>((total, value) => total + (value?.length ?? 0), 0);
  return {
    compact: length > 240,
    dense: length > 400,
    veryDense: length > 700,
    extremelyDense: length > 1000,
  };
}
