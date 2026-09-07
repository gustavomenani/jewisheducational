<script setup>
import { computed } from 'vue';
import EditableText from '../EditableText.vue';
import { useBuilderStore } from '../store';

const props = defineProps({
  block: { type: Object, required: true },
});

const builder = useBuilderStore();

const p = computed(() => props.block.props || {});

const variant = computed(() => p.value.variant || 'info');

const alertConfig = computed(() => {
  switch (variant.value) {
    case 'note':
      return {
        bg: '#f0fdf4',
        border: '#86efac',
        text: '#166534',
        icon: 'bi-check-circle-fill',
      };
    case 'warning':
      return {
        bg: '#fffbeb',
        border: '#fde68a',
        text: '#92400e',
        icon: 'bi-exclamation-triangle-fill',
      };
    case 'highlight':
      return {
        bg: '#f5f3ff',
        border: '#ddd6fe',
        text: '#5b21b6',
        icon: 'bi-star-fill',
      };
    case 'info':
    default:
      return {
        bg: '#f0f9ff',
        border: '#bae6fd',
        text: '#075985',
        icon: 'bi-info-circle-fill',
      };
  }
});

const alertStyle = computed(() => ({
  backgroundColor: alertConfig.value.bg,
  borderColor: alertConfig.value.border,
  color: alertConfig.value.text,
}));

const iconClass = computed(() => p.value.icon || alertConfig.value.icon);

function setTitle(title) {
  builder.updateBlock(props.block.id, { title });
}

function setText(text) {
  builder.updateBlock(props.block.id, { text });
}
</script>

<template>
  <div class="alert-block" :style="alertStyle" @click="builder.editMode && builder.select(block.id)">
    <div class="alert-icon-col">
      <i :class="['bi', iconClass, 'alert-icon']"></i>
    </div>
    <div class="alert-body">
      <EditableText
        :model-value="p.title ?? 'Aviso Importante'"
        :select-id="block.id"
        tag="h4"
        class="alert-title"
        placeholder="Note/alert title…"
        @update:model-value="setTitle"
        @commit="builder.commitHistory()"
      />
      <EditableText
        :model-value="p.text ?? 'This is a highlighted note that draws attention to relevant information.'"
        :select-id="block.id"
        tag="p"
        class="alert-text"
        placeholder="Alert content…"
        @update:model-value="setText"
        @commit="builder.commitHistory()"
      />
    </div>
  </div>
</template>

<style scoped>
.alert-block {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 12px;
  border: 1px solid;
  border-left-width: 5px;
  margin: 16px 0;
  transition: all 0.15s ease;
}

.alert-icon-col {
  flex-shrink: 0;
  padding-top: 2px;
}

.alert-icon {
  font-size: 1.35rem;
  line-height: 1;
}

.alert-body {
  flex: 1;
  min-width: 0;
}

.alert-title {
  font-size: 1.02rem;
  font-weight: 700;
  margin: 0 0 4px 0;
  line-height: 1.3;
}

.alert-text {
  font-size: 0.92rem;
  margin: 0;
  line-height: 1.5;
  opacity: 0.95;
}
</style>
