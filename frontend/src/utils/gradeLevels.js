export function gradeLevelLabel(value) {
  const label = String(value || '').trim();
  if (/^(basic|base)$/i.test(label)) return 'Beginner';
  return label;
}
