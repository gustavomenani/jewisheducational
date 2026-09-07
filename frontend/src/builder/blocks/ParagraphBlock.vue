<script setup>
import { computed } from 'vue';
import EditableText from '../EditableText.vue';
import { useBuilderStore } from '../store';
import { normalizeTextStyle, textStyleToCss } from '../textStyle';

const props = defineProps({ block: { type: Object, required: true } });
const builder = useBuilderStore();

const style = computed(() => ({
  ...textStyleToCss(normalizeTextStyle(props.block.props.textStyle, props.block.props)),
  textAlign: textStyleToCss(normalizeTextStyle(props.block.props.textStyle, props.block.props)).textAlign || 'left',
  margin: 0,
  lineHeight: textStyleToCss(normalizeTextStyle(props.block.props.textStyle, props.block.props)).lineHeight || 1.6,
}));

function setText(text) {
  builder.updateBlock(props.block.id, { text });
}
</script>

<template>
  <EditableText
    :model-value="block.props.text"
    :select-id="block.id"
    tag="p"
    :style="style"
    placeholder="Write your text…"
    @update:model-value="setText"
    @commit="builder.commitHistory()"
  />
</template>
