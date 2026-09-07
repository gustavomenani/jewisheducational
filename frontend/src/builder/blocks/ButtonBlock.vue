<script setup>
import { computed } from 'vue';
import EditableText from '../EditableText.vue';
import { useBuilderStore } from '../store';

const props = defineProps({ block: { type: Object, required: true } });
const builder = useBuilderStore();

const wrapStyle = computed(() => ({ textAlign: props.block.props.align || 'left' }));
const variantClass = computed(() => `btn-${props.block.props.variant || 'primary'}`);

function setText(text) {
  builder.updateBlock(props.block.id, { text });
}

function onClick(e) {
  if (builder.editMode) {
    e.preventDefault();
    e.stopPropagation();
    builder.select(props.block.id);
  }
}

function onKeydown(e) {
  if (!builder.editMode || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  e.stopPropagation();
  builder.select(props.block.id);
}
</script>

<template>
  <div :style="wrapStyle">
    <a
      :href="builder.editMode ? undefined : block.props.link || '#'"
      :tabindex="builder.editMode ? 0 : undefined"
      :role="builder.editMode ? 'button' : undefined"
      :class="['builder-btn', variantClass]"
      @click="onClick"
      @keydown="onKeydown"
    >
      <i v-if="block.props.icon" :class="['bi', block.props.icon, 'btn-icon']"></i>
      <EditableText
        :model-value="block.props.text"
        :select-id="block.id"
        tag="span"
        placeholder="Button"
        @update:model-value="setText"
        @commit="builder.commitHistory()"
      />
    </a>
  </div>
</template>

<style scoped>
.builder-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 1.5rem;
  border-radius: 999px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.builder-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
  filter: brightness(1.05);
}
.btn-icon {
  font-size: 1.1em;
}
.btn-primary {
  background: var(--color-primary, #3bafb8);
  color: #fff;
}
.btn-secondary {
  background: var(--color-secondary, #5d6dbe);
  color: #fff;
}
.btn-gradient {
  background: linear-gradient(135deg, var(--color-primary, #3bafb8) 0%, var(--color-secondary, #5d6dbe) 100%);
  color: #fff;
  border: none;
  box-shadow: 0 4px 15px rgba(59, 175, 184, 0.35);
}
.btn-outline {
  background: transparent;
  color: var(--color-primary, #3bafb8);
  border: 2px solid currentColor;
}
.btn-ghost {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
  color: var(--color-primary, #3bafb8);
  border: 1px solid rgba(0, 0, 0, 0.1);
}
</style>
