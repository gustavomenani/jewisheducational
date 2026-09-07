// Renderiza, no servidor, o 1º slide de um PPTX como JPEG (capa/prévia
// pública, com marca d'água) — usa um Chromium headless (Puppeteer) rodando
// o MESMO bundle já compilado que a página de apresentação usa no navegador
// (backend/vendor/pptx-preview.es.js, cópia congelada de
// frontend/dist/assets/pptx-preview.es-*.js). Isso evita reimplementar o
// parser de PPTX: reaproveita o código que já roda em produção para os
// visitantes.
//
// Se a biblioteca vendorizada for atualizada (novo `npm run build` do
// frontend), copie o novo arquivo `pptx-preview.es-*.js` para
// backend/vendor/pptx-preview.es.js e confira se o nome da variável local
// exportada (hoje "vot") não mudou — veja EXPORTED_INIT_VAR abaixo.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const VENDOR_JS_PATH = fileURLToPath(new URL('../vendor/pptx-preview.es.js', import.meta.url));
// Nome da variável local (dentro do próprio chunk) que o `export{... as x}`
// expõe como "init". Precisa ser reconferido se o vendor file for atualizado.
const EXPORTED_INIT_VAR = 'vot';

let vendorJsPromise = null;
function loadVendorJs() {
  if (!vendorJsPromise) vendorJsPromise = readFile(VENDOR_JS_PATH, 'utf-8');
  return vendorJsPromise;
}

async function launchBrowser() {
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

// Marca d'água — mesma lógica do pdfCover.js, mas operando sobre um Buffer
// de imagem já pronto (screenshot do slide) em vez de renderizar do zero.
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
 * Converts a trusted raster image to the public catalog-cover format while
 * preserving the complete image inside a 16:9 frame and applying the same
 * watermark used for PDF and PPTX covers.
 */
export async function generateImageCover(imageBuffer, {
  width = 800,
  height = 450,
  quality = 82,
  watermark = '',
} = {}) {
  const image = await loadImage(imageBuffer);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = Math.round(image.width * scale);
  const drawHeight = Math.round(image.height * scale);
  ctx.drawImage(image, Math.round((width - drawWidth) / 2), Math.round((height - drawHeight) / 2), drawWidth, drawHeight);
  if (watermark) drawWatermark(ctx, width, height, watermark);

  return canvas.toBuffer('image/jpeg', quality);
}

/**
 * Renderiza o 1º slide de um PPTX como JPEG (Buffer) com marca d'água opcional.
 * @param {Buffer} pptxBuffer bytes do arquivo .pptx
 * @param {{ width?: number, height?: number, quality?: number, watermark?: string }} opts
 * @returns {Promise<Buffer|null>} JPEG ou null se não conseguir renderizar
 */
export async function generatePptxCover(pptxBuffer, { width = 800, height = 450, quality = 82, watermark = '' } = {}) {
  const vendorJs = await loadVendorJs();
  const pptxBase64 = pptxBuffer.toString('base64');

  const browser = await launchBrowser();
  let screenshot;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.setContent('<!doctype html><html><body style="margin:0"><div id="mount"></div></body></html>');
    await page.addScriptTag({
      type: 'module',
      content: `${vendorJs}\nwindow.__pptxInit = ${EXPORTED_INIT_VAR};`,
    });

    const result = await page.evaluate(async (b64, w, h) => {
      for (let i = 0; i < 20 && typeof window.__pptxInit !== 'function'; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (typeof window.__pptxInit !== 'function') {
        return { ok: false, error: 'pptx-preview did not load.' };
      }
      try {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

        const mount = document.getElementById('mount');
        const previewer = window.__pptxInit(mount, { mode: 'slide', width: w, height: h });
        await previewer.preview(bytes.buffer);
        if (!previewer.slideCount) return { ok: false, error: 'PPTX contains no recognizable slides.' };
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }, pptxBase64, width, height);

    if (!result.ok) {
      console.error('generatePptxCover: falha no render do slide —', result.error);
      return null;
    }

    // Esconde os botões de navegação/paginação (irmãos do slide, sobrepostos
    // visualmente por cima dele) antes do print — senão aparecem na capa.
    await page.evaluate(() => {
      document.querySelectorAll('.pptx-preview-wrapper-next, .pptx-preview-wrapper-pagination')
        .forEach((el) => { el.style.display = 'none'; });
    });
    const slideEl = await page.$('.pptx-preview-slide-wrapper');
    screenshot = await (slideEl || (await page.$('#mount'))).screenshot({ type: 'jpeg', quality: 90 });
  } finally {
    await browser.close();
  }

  if (!screenshot) return null;

  // Aplica a marca d'água por cima do screenshot, igual às capas de PDF.
  return generateImageCover(screenshot, { width, height, quality, watermark });
}
