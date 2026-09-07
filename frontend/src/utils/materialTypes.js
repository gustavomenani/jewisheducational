// Tipos de material (Settings → "Tipos de material") ganharam ícone e
// cor próprios, escolhidos por bolinhas clicáveis. Guardamos como JSON no
// mesmo campo de settings que antes era texto simples (uma linha por tipo);
// o parser aceita os dois formatos para não quebrar dados antigos.
// Ícones da biblioteca Bootstrap Icons (icons.getbootstrap.com). Para oferecer
// mais opções é só acrescentar aqui o nome da classe (ex.: 'bi-rocket'). O 1º
// da lista é o padrão de novos tipos, então mantenha um genérico no topo.
export const MATERIAL_TYPE_ICONS = [
  // Documentos / arquivos
  'bi-file-earmark-text',
  'bi-file-earmark-pdf',
  'bi-file-earmark-slides',
  'bi-file-earmark-image',
  'bi-file-earmark-music',
  'bi-file-earmark-play',
  'bi-file-earmark-word',
  'bi-file-earmark-check',
  // Livros / cadernos
  'bi-book',
  'bi-book-half',
  'bi-journal-text',
  'bi-journal-check',
  'bi-journals',
  'bi-bookmark-star',
  'bi-newspaper',
  // Escrever / desenhar / recortar
  'bi-pencil',
  'bi-pencil-square',
  'bi-pen',
  'bi-brush',
  'bi-palette',
  'bi-scissors',
  'bi-easel',
  // Image / vídeo / áudio
  'bi-image',
  'bi-images',
  'bi-camera-video',
  'bi-film',
  'bi-play-circle',
  'bi-collection',
  'bi-music-note-beamed',
  'bi-headphones',
  'bi-mic',
  'bi-soundwave',
  // Jogos / atividades
  'bi-controller',
  'bi-puzzle',
  'bi-dice-5',
  'bi-grid-3x3-gap',
  'bi-patch-question',
  'bi-clipboard-check',
  'bi-list-check',
  'bi-card-checklist',
  // Letras / idioma / números
  'bi-alphabet',
  'bi-type',
  'bi-fonts',
  'bi-translate',
  'bi-globe',
  'bi-calculator',
  'bi-123',
  // Educação / conquistas / diversão
  'bi-mortarboard',
  'bi-backpack',
  'bi-trophy',
  'bi-award',
  'bi-star',
  'bi-heart',
  'bi-lightbulb',
  'bi-flag',
  'bi-map',
  'bi-flower1',
  'bi-sun',
  'bi-stars',
  'bi-balloon',
  'bi-gift',
  'bi-emoji-smile',
  'bi-magic',
];

// Cores das bolinhas. Aceita qualquer valor CSS válido (hex, rgb, etc.).
export const MATERIAL_TYPE_COLORS = [
  // Paleta original do site
  '#3bafb8',
  '#2c9c8f',
  '#1f4e6b',
  '#5d6dbe',
  '#a970d6',
  '#89d14f',
  '#f0a030',
  '#e05d5d',
  // Tons adicionais
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#8b5cf6',
  '#d946ef',
  '#ef476f',
  '#ff8fab',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#dc2626',
  '#64748b',
  '#78716c',
];

/**
 * @param {string} raw valor salvo em settings.material_types
 * @returns {{label: string, icon: string, color: string}[]}
 */
export function parseMaterialTypes(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item, i) => (typeof item === 'string'
          ? { label: item, icon: MATERIAL_TYPE_ICONS[0], color: MATERIAL_TYPE_COLORS[i % MATERIAL_TYPE_COLORS.length] }
          : {
            label: item.label || '',
            icon: item.icon || MATERIAL_TYPE_ICONS[0],
            color: item.color || MATERIAL_TYPE_COLORS[i % MATERIAL_TYPE_COLORS.length],
          }))
        .filter((t) => t.label);
    }
  } catch {
    /* formato antigo: texto simples, um tipo por linha */
  }
  return raw.split('\n').map((s) => s.trim()).filter(Boolean)
    .map((label, i) => ({ label, icon: MATERIAL_TYPE_ICONS[0], color: MATERIAL_TYPE_COLORS[i % MATERIAL_TYPE_COLORS.length] }));
}

export function serializeMaterialTypes(items) {
  return JSON.stringify(items);
}
