<script setup>
import { computed } from 'vue';
import { mediaUrl } from '@/utils/media';
import { useBuilderStore } from '../store';

const props = defineProps({ block: { type: Object, required: true } });
const builder = useBuilderStore();

const src = computed(() => (props.block.props.src ? mediaUrl(props.block.props.src) : ''));
const safeLink = computed(() => {
  const value = String(props.block.props.link || '').trim();
  if (!value) return '';
  if (value.startsWith('/') || value.startsWith('mailto:') || value.startsWith('tel:')) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
});

const sizeClass = computed(() => {
  const size = props.block.props.size || 'large';
  return ['small', 'medium', 'large', 'full'].includes(size)
    ? `image-size-${size}`
    : 'image-size-large';
});

const figureClass = computed(() => [
  sizeClass.value,
  `image-align-${props.block.props.align || 'center'}`,
]);

const imageStyle = computed(() => ({
  borderRadius: `${props.block.props.radius ?? 12}px`,
}));

function selectImage(event) {
  if (!builder.editMode) return;
  event?.preventDefault();
  event?.stopPropagation();
  builder.select(props.block.id);
}

function selectImageWithKeyboard(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  selectImage(event);
}
</script>

<template>
  <figure
    class="image-block"
    :class="[{ 'is-editable': builder.editMode }, ...figureClass]"
    :tabindex="builder.editMode && !safeLink ? 0 : undefined"
    :role="builder.editMode && !safeLink ? 'button' : undefined"
    @click="selectImage"
    @keydown="selectImageWithKeyboard"
  >
    <a
      v-if="src && safeLink"
      :href="safeLink"
      :target="safeLink.startsWith('https://') ? '_blank' : undefined"
      rel="noopener"
      @click="builder.editMode && $event.preventDefault()"
    >
      <img :src="src" :alt="block.props.alt || ''" :style="imageStyle" />
    </a>
    <img v-else-if="src" :src="src" :alt="block.props.alt || ''" :style="imageStyle" />
    <div v-else-if="builder.editMode" class="image-placeholder" :style="imageStyle">
      <i class="bi bi-image"></i>
      <span>Select the image in the right panel</span>
    </div>
    <figcaption v-if="block.props.caption">{{ block.props.caption }}</figcaption>
  </figure>
</template>

<style scoped>
.image-block {
  position: relative;
  width: 100%;
  margin-top: 0;
  margin-bottom: 1rem;
}
.image-size-small { max-width: 320px; }
.image-size-medium { max-width: 560px; }
.image-size-large { max-width: 820px; }
.image-size-full { max-width: 100%; }
.image-align-left { margin-right: auto; }
.image-align-center { margin-right: auto; margin-left: auto; }
.image-align-right { margin-left: auto; }
.image-block img {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
}
.image-block a { display: block; }
.image-block figcaption {
  margin-top: 0.5rem;
  color: #64748b;
  font-size: 0.9rem;
  text-align: center;
}
.image-placeholder {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 160px;
  background: #f1f5f9;
  color: #526275;
  border: 2px dashed #cbd5e1;
  cursor: pointer;
}
.image-placeholder i { font-size: 2rem; }
@media (max-width: 768px) {
  .image-block { max-width: 100%; }
}
</style>
