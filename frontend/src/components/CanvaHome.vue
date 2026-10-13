<script setup>
defineProps({
  embedUrl: { type: String, required: true },
  sourceUrl: { type: String, required: true },
  siteName: { type: String, required: true },
});
</script>

<template>
  <main class="canva-home" :aria-label="siteName">
    <iframe
      :key="embedUrl"
      :src="embedUrl"
      :title="`${siteName} home`"
      class="canva-home-frame"
      allow="fullscreen"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
  </main>
</template>

<style scoped>
.canva-home {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  min-height: 320px;
  background: #fff;
}

.canva-home-frame {
  flex: 1;
  width: 100%;
  min-height: 0;
  border: 0;
}
</style>
