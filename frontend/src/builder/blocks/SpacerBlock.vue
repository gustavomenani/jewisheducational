<script setup>
import { computed } from 'vue';
const props = defineProps({ block: { type: Object, required: true } });
const style = computed(() => ({ height: `${props.block.props.height || 32}px` }));
</script>

<template>
  <div :style="style" aria-hidden="true"></div>
</template>
