<script setup>
import { computed } from 'vue';
import EditableText from '../EditableText.vue';
import { useBuilderStore } from '../store';

const props = defineProps({
  block: { type: Object, required: true },
});

const builder = useBuilderStore();

const p = computed(() => props.block.props || {});

const colCount = computed(() => {
  const c = Number(p.value.columns);
  return [2, 3, 4].includes(c) ? c : 3;
});

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${colCount.value}, minmax(0, 1fr))`,
  gap: '24px',
  textAlign: p.value.align || 'center',
  padding: '16px 0',
}));

const iconStyle = computed(() => ({
  color: p.value.iconColor || 'var(--color-primary, #3bafb8)',
}));

const items = computed(() => {
  const result = [];
  const defaultIcons = ['bi-star-fill', 'bi-lightning-charge-fill', 'bi-shield-check', 'bi-award-fill'];
  
  for (let i = 1; i <= colCount.value; i++) {
    result.push({
      index: i,
      iconKey: `item${i}Icon`,
      titleKey: `item${i}Title`,
      textKey: `item${i}Text`,
      icon: p.value[`item${i}Icon`] || defaultIcons[i - 1] || 'bi-star',
      title: p.value[`item${i}Title`] ?? `Recurso ${i}`,
      text: p.value[`item${i}Text`] ?? `Description detalhada sobre o recurso ${i}.`,
    });
  }
  return result;
});

function updateItemTitle(index, title) {
  builder.updateBlock(props.block.id, { [`item${index}Title`]: title });
}

function updateItemText(index, text) {
  builder.updateBlock(props.block.id, { [`item${index}Text`]: text });
}
</script>

<template>
  <div class="features-block" @click="builder.editMode && builder.select(block.id)">
    <div class="features-grid" :style="gridStyle">
      <div v-for="item in items" :key="item.index" class="feature-card">
        <div class="feature-icon-wrapper">
          <i :class="['bi', item.icon, 'feature-icon']" :style="iconStyle"></i>
        </div>
        <EditableText
          :model-value="item.title"
          :select-id="block.id"
          tag="h3"
          class="feature-title"
          placeholder="Title do recurso…"
          @update:model-value="(val) => updateItemTitle(item.index, val)"
          @commit="builder.commitHistory()"
        />
        <EditableText
          :model-value="item.text"
          :select-id="block.id"
          tag="p"
          class="feature-text"
          placeholder="Description do recurso…"
          @update:model-value="(val) => updateItemText(item.index, val)"
          @commit="builder.commitHistory()"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.features-block {
  margin: 16px 0;
  width: 100%;
}

.feature-card {
  background: #ffffff;
  padding: 24px 20px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: inherit;
}

.feature-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.05);
  border-color: #cbd5e1;
}

.feature-icon-wrapper {
  margin-bottom: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: rgba(59, 175, 184, 0.08);
}

.feature-icon {
  font-size: 1.6rem;
  line-height: 1;
}

.feature-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 8px 0;
  line-height: 1.3;
}

.feature-text {
  font-size: 0.92rem;
  color: #64748b;
  line-height: 1.55;
  margin: 0;
}

@media (max-width: 768px) {
  .features-grid {
    grid-template-columns: 1fr !important;
  }
}
</style>
