<script setup>
import { computed } from 'vue';
const props = defineProps({ block: { type: Object, required: true } });
const style = computed(() => ({ borderTop: `1px solid ${props.block.props.color || '#dce8f0'}` }));
</script>

<template>
  <hr :style="style" />
</template>
