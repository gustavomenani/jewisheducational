<!--
  Backward-compatible entry point for integrations that still import the
  original toolbar. The editor UI now lives in EditorWorkspace and its
  focused child components.
-->
<script setup>
import EditorWorkspace from './EditorWorkspace.vue';
</script>

<template>
  <EditorWorkspace />
</template>
