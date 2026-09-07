// Renderiza, no servidor, a 1ª página de um PDF como JPEG (capa/prévia pública,
// com marca d'água). Espelha o comportamento do util do frontend
// (frontend/src/utils/pdfThumbnail.js), mas sem depender do navegador.
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const STANDARD_FONTS = fileURLToPath(
  new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url),
);

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
    return { canvas, context: canvas.getContext('2d') };
  }

  reset(cc, width, height) {
    cc.canvas.width = Math.ceil(width);
    cc.canvas.height = Math.ceil(height);
  }

  destroy(cc) {
    cc.canvas.width = 0;
    cc.canvas.height = 0;
    cc.canvas = null;
    cc.context = null;
  }
}

// Marca d'água diagonal discreta — só 2 linhas (uma acima do centro, uma
// abaixo), bem leve. Igual à do frontend.
function drawWatermark(ctx, w, h, text) {
  const label = (text || '').trim().toUpperCase();
  if (!label) return;
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = '#13404d';
  const fontSize = Math.max(15, Math.round(w / 24));
  ctx.font = `bold ${fontSize}px sans-serif`;
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
 * Renderiza a 1ª página do PDF como JPEG (Buffer) com marca d'água opcional.
 * @param {Buffer|Uint8Array} pdfBuffer bytes do PDF
 * @param {{ maxWidth?: number, quality?: number, watermark?: string }} opts
 * @returns {Promise<Buffer|null>} JPEG ou null se não renderizar
 */
export async function generatePdfCover(pdfBuffer, { maxWidth = 800, quality = 82, watermark = '' } = {}) {
  // pdfjs exige Uint8Array "puro": um Node Buffer é instância de Uint8Array mas
  // é rejeitado, então criamos uma view Uint8Array sobre os mesmos bytes.
  const data = Buffer.isBuffer(pdfBuffer)
    ? new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength)
    : (pdfBuffer instanceof Uint8Array ? pdfBuffer : new Uint8Array(pdfBuffer));
  const doc = await pdfjs.getDocument({
    data,
    standardFontDataUrl: STANDARD_FONTS,
    disableFontFace: true,
    isEvalSupported: false,
    canvasFactory: new NodeCanvasFactory(),
  }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(maxWidth / base.width, 2);
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    if (watermark) drawWatermark(ctx, canvas.width, canvas.height, watermark);

    return canvas.toBuffer('image/jpeg', quality);
  } finally {
    await doc.destroy();
  }
}
