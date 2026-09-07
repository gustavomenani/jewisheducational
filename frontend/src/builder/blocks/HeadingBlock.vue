<script setup>
import { computed } from 'vue';
import EditableText from '../EditableText.vue';
import { useBuilderStore } from '../store';
import { normalizeTextStyle, textStyleToCss } from '../textStyle';

const props = defineProps({ block: { type: Object, required: true } });
const builder = useBuilderStore();

const tag = computed(() => `h${props.block.props.level || 2}`);
const style = computed(() => ({
  ...textStyleToCss(normalizeTextStyle(props.block.props.textStyle, props.block.props)),
  textAlign: textStyleToCss(normalizeTextStyle(props.block.props.textStyle, props.block.props)).textAlign || 'left',
  margin: 0,
}));

function setText(text) {
  builder.updateBlock(props.block.id, { text });
}
</script>

<template>
  <div :style="style">
    <EditableText
      :model-value="block.props.text"
      :select-id="block.id"
      :tag="tag"
      placeholder="Title…"
      @update:model-value="setText"
      @commit="builder.commitHistory()"
    />
  </div>
</template>
