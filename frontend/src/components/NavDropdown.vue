<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { RouterLink } from 'vue-router';

defineProps({
  label: { type: String, required: true },
  icon: { type: String, default: '' },
  iconClass: { type: String, default: '' },
  iconImg: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  to: { type: String, default: '' },
});

const open = ref(false);
const root = ref(null);

function toggle() {
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function onDocClick(e) {
  if (root.value && !root.value.contains(e.target)) close();
}

function onKeydown(e) {
  if (e.key === 'Escape') close();
}

onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div ref="root" class="edu-nav-item" :class="{ open }">
    <RouterLink v-if="to && !items.length" :to="to" class="edu-nav-link">
      <img v-if="iconImg" :src="iconImg" alt="" class="edu-nav-icon-img" />
      <i v-else-if="icon" :class="[icon, 'edu-nav-icon', iconClass]"></i>
      {{ label }}
    </RouterLink>

    <button
      v-else
      type="button"
      class="edu-nav-link edu-nav-trigger"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      <img v-if="iconImg" :src="iconImg" alt="" class="edu-nav-icon-img" />
      <i v-else-if="icon" :class="[icon, 'edu-nav-icon', iconClass]"></i>
      {{ label }}
      <i v-if="items.length" class="bi bi-chevron-down edu-nav-chevron"></i>
    </button>

    <div v-if="items.length && open" class="edu-nav-dropdown">
      <RouterLink
        v-for="item in items"
        :key="item.label + item.to"
        :to="item.to"
        class="edu-nav-dropdown-item"
        @click="close"
      >
        <i v-if="item.icon" :class="item.icon" class="edu-dropdown-icon"></i>
        <span>
          <strong>{{ item.label }}</strong>
          <small v-if="item.desc">{{ item.desc }}</small>
        </span>
      </RouterLink>
    </div>
  </div>
</template>
