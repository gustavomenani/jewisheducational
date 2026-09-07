// Gera, no navegador, uma imagem da 1ª página de um PDF para usar como
// prévia pública do material (estilo K5). Tudo roda no cliente — sem
// dependência nativa no backend.

let workerConfigured = false;

async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist');
  if (!workerConfigured) {
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    workerConfigured = true;
  }
  return pdfjsLib;
}

// Marca d'água diagonal discreta — só 2 linhas (uma acima do centro, uma
// abaixo), bem leve. "Queimada" nos pixels da imagem — assim ela aparece
// tanto se a pessoa salvar a imagem quanto se tirar print. A resolução
// baixa (maxWidth) já deixa a prévia ruim para impressão; o PDF de verdade,
// em alta qualidade, fica protegido atrás do download.
function drawWatermark(ctx, w, h, text) {
  const label = text.trim().toUpperCase();
  if (!label) return;
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = '#13404d';
  const fontSize = Math.max(15, Math.round(w / 24));
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  const stepX = ctx.measureText(label).width + fontSize * 3;
  const diag = Math.sqrt(w * w + h * h);
  const rows = [-h * 0.22, h * 0.22];
  for (const y of rows) {
    for (let x = -diag; x < diag; x += stepX) {
      ctx.fillText(label, x, y);
    }
  }
  ctx.restore();
}

/**
 * Renderiza a 1ª página do PDF como um File JPEG (prévia pública, com marca d'água).
 * @param {File|Blob} pdfFile arquivo PDF
 * @param {{ maxWidth?: number, quality?: number, watermark?: string }} opts
 * @returns {Promise<File|null>} imagem JPEG ou null se falhar
 */
export async function generatePdfThumbnail(pdfFile, { maxWidth = 800, quality = 0.82, watermark = '' } = {}) {
  const pdfjsLib = await loadPdfjs();
  const buffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(maxWidth / base.width, 2);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    // Fundo branco: PDFs podem ter fundo transparente.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    if (watermark) drawWatermark(ctx, canvas.width, canvas.height, watermark);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return null;
    return new File([blob], 'previa.jpg', { type: 'image/jpeg' });
  } finally {
    await pdf.destroy();
  }
}
