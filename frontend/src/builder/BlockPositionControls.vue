<script setup>
import { computed } from 'vue';
import { useBuilderStore } from './store';
import {
  GRID_COLUMNS,
  alignBlockPlacement,
  normalizeBlockPlacement,
} from './layout';

const props = defineProps({
  block: { type: Object, required: true },
});

const builder = useBuilderStore();
const widthPresets = [
  { span: 12, label: 'Full width' },
  { span: 9, label: 'Three quarters' },
  { span: 8, label: 'Two thirds' },
  { span: 6, label: 'Half' },
  { span: 4, label: 'One third' },
];

const placement = computed(() => normalizeBlockPlacement(props.block.layout));
const currentAlignment = computed(() => {
  const value = placement.value;
  if (value.start === 1) return 'left';
  if (value.start === GRID_COLUMNS - value.span + 1) return 'right';
  if (value.start === Math.floor((GRID_COLUMNS - value.span) / 2) + 1) return 'center';
  return 'custom';
});

function update(patch) {
  builder.updateBlockLayout(props.block.id, patch);
}

function setWidth(span) {
  const alignment = currentAlignment.value;
  const next = alignment === 'custom'
    ? normalizeBlockPlacement({ ...placement.value, span })
    : alignBlockPlacement({ ...placement.value, span }, alignment);
  update(next);
}

function setAlignment(alignment) {
  update(alignBlockPlacement(placement.value, alignment));
}

function nudge(delta) {
  update({ start: placement.value.start + delta });
}

function placeAt(column) {
  update({ start: column });
}

function setSpacing(key, value) {
  update({ [key]: Number(value) });
}

function cellActive(column) {
  return column >= placement.value.start && column < placement.value.start + placement.value.span;
}
</script>

<template>
  <section class="position-controls" aria-labelledby="block-position-title">
    <div class="position-heading">
      <div>
        <span class="position-kicker">Layout</span>
        <h3 id="block-position-title">Position &amp; size</h3>
      </div>
      <span class="position-readout">{{ placement.span }}/12</span>
    </div>

    <p class="position-help">Set the width and alignment. Fine positioning is optional.</p>

    <label class="control-label">Width</label>
    <div class="width-presets">
      <button
        v-for="preset in widthPresets"
        :key="preset.span"
        type="button"
        :class="{ active: placement.span === preset.span }"
        :title="preset.label"
        :aria-label="`Set width to ${preset.label}`"
        :aria-pressed="placement.span === preset.span"
        @click="setWidth(preset.span)"
      >
        <span>{{ preset.span }}/12</span>
        <small>{{ preset.label }}</small>
      </button>
    </div>

    <label class="control-label control-label-spaced">Alignment</label>
    <div class="alignment-actions alignment-actions-wide" aria-label="Horizontal alignment">
        <button type="button" title="Align left" aria-label="Align left" :aria-pressed="currentAlignment === 'left'" :class="{ active: currentAlignment === 'left' }" @click="setAlignment('left')">
          <i class="bi bi-align-start"></i><span>Left</span>
        </button>
        <button type="button" title="Align center" aria-label="Align center" :aria-pressed="currentAlignment === 'center'" :class="{ active: currentAlignment === 'center' }" @click="setAlignment('center')">
          <i class="bi bi-align-center"></i><span>Center</span>
        </button>
        <button type="button" title="Align right" aria-label="Align right" :aria-pressed="currentAlignment === 'right'" :class="{ active: currentAlignment === 'right' }" @click="setAlignment('right')">
          <i class="bi bi-align-end"></i><span>Right</span>
        </button>
    </div>

    <label class="control-label control-label-spaced">Spacing</label>
    <div class="spacing-grid">
      <label>
        <span>Space above</span>
        <div class="number-unit">
          <input
            type="number"
            min="0"
            max="160"
            step="8"
            :value="placement.marginTop"
            @change="setSpacing('marginTop', $event.target.value)"
          />
          <small>px</small>
        </div>
      </label>
      <label>
        <span>Space below</span>
        <div class="number-unit">
          <input
            type="number"
            min="0"
            max="160"
            step="8"
            :value="placement.marginBottom"
            @change="setSpacing('marginBottom', $event.target.value)"
          />
          <small>px</small>
        </div>
      </label>
    </div>

    <details class="fine-positioning">
      <summary><i class="bi bi-grid-3x3-gap"></i> More positioning</summary>
      <p>Choose the exact starting column or move one step at a time.</p>
      <div class="grid-ruler" aria-label="Block position on a twelve-column grid">
        <button
          v-for="column in GRID_COLUMNS"
          :key="column"
          type="button"
          :class="{ occupied: cellActive(column), start: column === placement.start }"
          :aria-label="`Start at column ${column}`"
          :title="`Start at column ${column}`"
          @click="placeAt(column)"
        ></button>
      </div>
      <div class="position-actions position-actions-simple">
        <button type="button" title="Move left" :disabled="placement.start === 1" @click="nudge(-1)">
          <i class="bi bi-arrow-left"></i><span>Move left</span>
        </button>
        <button type="button" title="Move right" :disabled="placement.start + placement.span > GRID_COLUMNS" @click="nudge(1)">
          <span>Move right</span><i class="bi bi-arrow-right"></i>
        </button>
      </div>
    </details>

    <p class="mobile-note"><i class="bi bi-phone"></i> On phones, items stack automatically for readability.</p>
  </section>
</template>

<style scoped>
.position-controls {
  margin-bottom: 18px;
  padding: 14px;
  border: 1px solid rgba(56, 189, 248, 0.28);
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(14, 165, 233, 0.11), rgba(15, 23, 42, 0.42));
}
.position-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.position-kicker {
  display: block;
  color: #7dd3fc;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.position-heading h3 {
  margin: 1px 0 0;
  color: #f8fafc;
  font-size: 0.94rem;
}
.position-readout {
  padding: 3px 7px;
  border-radius: 999px;
  background: #38bdf8;
  color: #082f49;
  font-size: 0.7rem;
  font-weight: 900;
}
.position-help,
.mobile-note {
  margin: 8px 0 10px;
  color: #94a3b8;
  font-size: 0.72rem;
  line-height: 1.45;
}
.grid-ruler {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 3px;
  margin-bottom: 14px;
}
.grid-ruler button {
  min-width: 0;
  height: 24px;
  padding: 0;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 3px;
  background: rgba(15, 23, 42, 0.75);
  cursor: pointer;
}
.grid-ruler button:hover { border-color: #7dd3fc; }
.grid-ruler button.occupied { border-color: rgba(56, 189, 248, 0.55); background: rgba(56, 189, 248, 0.44); }
.grid-ruler button.start { box-shadow: inset 3px 0 0 #e0f2fe; }
.control-label {
  display: block;
  margin-bottom: 6px;
  color: #cbd5e1;
  font-size: 0.72rem;
  font-weight: 700;
}
.control-label-spaced { margin-top: 12px; }
.width-presets {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
}
.width-presets button {
  min-width: 0;
  padding: 6px 2px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.6);
  color: #cbd5e1;
  cursor: pointer;
}
.width-presets button span { display: block; font-size: 0.72rem; font-weight: 800; }
.width-presets button small { display: block; margin-top: 1px; color: inherit; font-size: 0.58rem; }
.width-presets button:hover,
.width-presets button.active { border-color: #38bdf8; background: #0ea5e9; color: #fff; }
.position-actions {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}
.position-actions > button,
.alignment-actions button {
  min-height: 32px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.66);
  color: #cbd5e1;
  cursor: pointer;
}
.position-actions > button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; font-size: 0.66rem; }
.position-actions button:hover:not(:disabled),
.alignment-actions button.active { border-color: #38bdf8; color: #fff; background: rgba(14, 165, 233, 0.35); }
.position-actions button:disabled { opacity: 0.32; cursor: not-allowed; }
.alignment-actions { display: flex; gap: 3px; }
.alignment-actions button { width: 30px; }
.alignment-actions-wide { display: grid; grid-template-columns: repeat(3, 1fr); }
.alignment-actions-wide button {
  width: auto;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 0.68rem;
}
.position-actions-simple { grid-template-columns: 1fr 1fr; }
.spacing-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
}
.spacing-grid > label > span { display: block; margin-bottom: 4px; color: #cbd5e1; font-size: 0.68rem; }
.number-unit { display: flex; align-items: center; border: 1px solid rgba(148, 163, 184, 0.24); border-radius: 6px; background: rgba(15, 23, 42, 0.72); }
.number-unit input { width: 100%; min-width: 0; padding: 6px 4px 6px 8px; border: 0; outline: 0; background: transparent; color: #f8fafc; font-size: 0.78rem; }
.number-unit small { padding-right: 7px; color: #64748b; }
.fine-positioning {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}
.fine-positioning summary {
  color: #bae6fd;
  font-size: 0.7rem;
  font-weight: 750;
  cursor: pointer;
}
.fine-positioning > p { margin: 7px 0; color: #94a3b8; font-size: 0.66rem; }
.mobile-note { margin-bottom: 0; }
.mobile-note i { color: #38bdf8; }
</style>
