export const PREVIEW_MODES = Object.freeze([
  { id: 'desktop', label: 'Desktop', icon: 'bi-display', width: null },
  { id: 'tablet', label: 'Tablet', icon: 'bi-tablet', width: 768 },
  { id: 'mobile', label: 'Mobile', icon: 'bi-phone', width: 390 },
]);

export function previewWidth(mode) {
  return PREVIEW_MODES.find((item) => item.id === mode)?.width ?? null;
}

export function previewCanvasStyle(mode, availableWidth = Number.POSITIVE_INFINITY) {
  const logicalWidth = previewWidth(mode);
  if (!logicalWidth) {
    return { width: '100%', scale: 1, label: 'Desktop' };
  }

  const safeAvailable = Number.isFinite(Number(availableWidth))
    ? Math.max(1, Number(availableWidth))
    : logicalWidth;
  const scale = Math.min(1, Math.max(0.4, Math.floor((safeAvailable / logicalWidth) * 100) / 100));
  const percent = Math.round(scale * 100);

  return {
    width: `${logicalWidth}px`,
    scale,
    label: `${logicalWidth} px${scale < 1 ? ` · ${percent}%` : ''}`,
  };
}
