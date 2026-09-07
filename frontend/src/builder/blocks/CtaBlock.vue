<script setup>
import { computed } from 'vue';
import EditableText from '../EditableText.vue';
import { useBuilderStore } from '../store';

const props = defineProps({
  block: { type: Object, required: true },
});

const builder = useBuilderStore();

const p = computed(() => props.block.props || {});

const containerStyle = computed(() => {
  const align = p.value.align || 'center';
  const bgStyle = p.value.bgStyle || 'gradient';
  const customBg = p.value.bgColor;
  const customColor = p.value.textColor;

  let background = 'linear-gradient(135deg, #3bafb8 0%, #5d6dbe 100%)';
  let color = '#ffffff';

  if (bgStyle === 'primary') {
    background = 'var(--color-primary, #3bafb8)';
    color = '#ffffff';
  } else if (bgStyle === 'dark') {
    background = '#1e293b';
    color = '#ffffff';
  } else if (bgStyle === 'light') {
    background = '#f8fafc';
    color = '#1e293b';
  } else if (bgStyle === 'custom' && customBg) {
    background = customBg;
  }

  if (customColor) {
    color = customColor;
  }

  return {
    textAlign: align,
    background,
    color,
    padding: '40px 32px',
    borderRadius: '16px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08)',
  };
});

const buttonVariantClass = computed(() => {
  const v = p.value.buttonVariant || 'primary';
  return `btn-${v}`;
});

function setTitle(title) {
  builder.updateBlock(props.block.id, { title });
}

function setSubtitle(subtitle) {
  builder.updateBlock(props.block.id, { subtitle });
}

function setButtonText(buttonText) {
  builder.updateBlock(props.block.id, { buttonText });
}

function onButtonClick(e) {
  if (builder.editMode) {
    e.preventDefault();
    e.stopPropagation();
    builder.select(props.block.id);
  }
}

function onButtonKeydown(e) {
  if (!builder.editMode || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  e.stopPropagation();
  builder.select(props.block.id);
}
</script>

<template>
  <div class="cta-block" :style="containerStyle" @click="builder.editMode && builder.select(block.id)">
    <div class="cta-content">
      <EditableText
        :model-value="p.title ?? 'Ready to get started?'"
        :select-id="block.id"
        tag="h2"
        class="cta-title"
        placeholder="Call to action title…"
        @update:model-value="setTitle"
        @commit="builder.commitHistory()"
      />

      <EditableText
        :model-value="p.subtitle ?? 'Join us today and transform your learning.'"
        :select-id="block.id"
        tag="p"
        class="cta-subtitle"
        placeholder="Descriptive subtitle…"
        @update:model-value="setSubtitle"
        @commit="builder.commitHistory()"
      />

      <div class="cta-action">
        <a
          :href="builder.editMode ? undefined : p.buttonLink || '#'"
          :tabindex="builder.editMode ? 0 : undefined"
          :role="builder.editMode ? 'button' : undefined"
          :class="['cta-btn', buttonVariantClass]"
          @click="onButtonClick"
          @keydown="onButtonKeydown"
        >
          <EditableText
            :model-value="p.buttonText ?? 'Get Started'"
            :select-id="block.id"
            tag="span"
            placeholder="Button text…"
            @update:model-value="setButtonText"
            @commit="builder.commitHistory()"
          />
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cta-block {
  margin: 16px 0;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.cta-content {
  max-width: 720px;
  margin: 0 auto;
}

.cta-title {
  font-size: 1.85rem;
  font-weight: 800;
  line-height: 1.25;
  margin: 0 0 12px 0;
}

.cta-subtitle {
  font-size: 1.05rem;
  opacity: 0.92;
  line-height: 1.6;
  margin: 0 0 24px 0;
}

.cta-action {
  display: inline-block;
}

.cta-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 28px;
  font-size: 1rem;
  font-weight: 700;
  border-radius: 999px;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
}

.cta-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
}

.btn-primary {
  background: var(--color-primary, #3bafb8);
  color: #ffffff;
  border: none;
}

.btn-secondary {
  background: var(--color-secondary, #5d6dbe);
  color: #ffffff;
  border: none;
}

.btn-outline {
  background: transparent;
  color: inherit;
  border: 2px solid currentColor;
}

.btn-light {
  background: #ffffff;
  color: #1e293b;
  border: none;
}
</style>
