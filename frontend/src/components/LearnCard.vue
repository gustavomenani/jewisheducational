<script setup>
import { RouterLink } from 'vue-router';

defineProps({
  icon: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: [String, Array], required: true },
  buttonText: { type: String, required: true },
  to: { type: String, required: true },
});
</script>

<template>
  <article class="learn-card">
    <div class="learn-card-head">
      <div class="learn-card-icon" aria-hidden="true">
        <i :class="icon"></i>
      </div>
      <h3 class="learn-card-title">{{ title }}</h3>
    </div>
    <template v-if="Array.isArray(description)">
      <p v-for="(paragraph, index) in description" :key="index" class="learn-card-desc">
        {{ paragraph }}
      </p>
    </template>
    <p v-else class="learn-card-desc">{{ description }}</p>
    <RouterLink :to="to" class="btn-edu-pill btn-edu-pill-card">{{ buttonText }}</RouterLink>
  </article>
</template>
