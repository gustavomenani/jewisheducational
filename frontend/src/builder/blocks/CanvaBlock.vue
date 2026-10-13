<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import api from '@/api';
import { canvaEmbedUrl, canvaSourceUrl } from '@/utils/canva';

const props = defineProps({
  block: { type: Object, required: true },
  editable: { type: Boolean, default: false },
});
const emit = defineEmits(['update']);
const draftUrl = ref('');
const resolving = ref(false);
const error = ref('');
let resolution = 0;

watch(() => props.block.props?.url, (url) => { draftUrl.value = url || ''; }, { immediate: true });
onUnmounted(() => { resolution += 1; });

const sourceUrl = computed(() => canvaSourceUrl(props.block.props?.url));
const embedUrl = computed(() => canvaEmbedUrl(sourceUrl.value));
const height = computed(() => Math.min(1200, Math.max(320, Number(props.block.props?.height) || 560)));

async function applyLink() {
  const current = ++resolution;
  error.value = '';
  const requested = draftUrl.value.trim();
  const direct = canvaSourceUrl(requested);
  if (!requested || direct) {
    emit('update', { url: direct });
    draftUrl.value = direct;
    return;
  }
  resolving.value = true;
  try {
    const { data } = await api.post('/editor/canva/resolve', { url: requested });
    if (current !== resolution) return;
    const url = canvaSourceUrl(data.url);
    if (!url) throw new Error('Invalid Canva link');
    emit('update', { url });
    draftUrl.value = url;
  } catch (failure) {
    if (current === resolution) error.value = failure.response?.data?.error || 'Could not apply this Canva link. Check the link and try again.';
  } finally {
    if (current === resolution) resolving.value = false;
  }
}
</script>

<template>
  <div v-if="editable || embedUrl" class="canva-block" :class="{ 'is-editing': editable }">
    <div v-if="editable" class="canva-block-settings" @click.stop>
      <form class="canva-block-link" @submit.prevent="applyLink">
        <label :for="`canva-link-${block.id}`">Canva design link</label>
        <div class="canva-block-link-row">
          <input :id="`canva-link-${block.id}`" v-model="draftUrl" type="url" maxlength="2048" placeholder="https://www.canva.com/design/.../view" :disabled="resolving" />
          <button type="submit" :disabled="resolving">{{ resolving ? 'Loading…' : 'Apply Canva link' }}</button>
        </div>
      </form>
      <label class="canva-block-height">Height
        <select :value="height" aria-label="Canva height" @change="emit('update', { height: Number($event.target.value) })">
          <option v-for="size in [320, 400, 560, 760, 1000, 1200]" :key="size" :value="size">{{ size }} px</option>
          <option v-if="![320, 400, 560, 760, 1000, 1200].includes(height)" :value="height">{{ height }} px</option>
        </select>
      </label>
      <p>Paste the link, click Apply Canva link, then Publish. Edit the design and its buttons in Canva.</p>
      <p v-if="error" class="canva-block-error" role="alert">{{ error }}</p>
    </div>
    <iframe
      v-if="embedUrl"
      :key="embedUrl"
      :src="embedUrl"
      :style="{ height: `${height}px` }"
      :tabindex="editable ? -1 : undefined"
      title="Canva design"
      class="canva-block-frame"
      loading="lazy"
      allow="fullscreen"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
    <div v-else-if="editable" class="canva-block-empty"><i class="bi bi-window"></i>Paste a public Canva link above to show your design.</div>
    <a v-if="sourceUrl" :href="sourceUrl" target="_blank" rel="noopener noreferrer" class="canva-block-open" @click.stop>Open in Canva</a>
  </div>
</template>

<style scoped>
.canva-block { min-width: 0; width: 100%; }
.canva-block-settings { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; padding: 14px; border: 1px solid #8bcfd1; border-radius: 8px 8px 0 0; background: #f4fbfb; color: #173f5f; font: 800 13px Nunito, system-ui, sans-serif; }
.canva-block-link { flex: 1 1 360px; min-width: 0; }
.canva-block-link label { display: block; margin-bottom: 6px; }
.canva-block-link-row { display: flex; flex-wrap: wrap; gap: 8px; }
.canva-block-link input { flex: 1 1 230px; min-width: 0; }
.canva-block-settings input, .canva-block-settings select { min-height: 38px; padding: 7px 10px; border: 1px solid #a7ced0; border-radius: 6px; background: #fff; color: #173f5f; font: inherit; font-weight: 400; }
.canva-block-settings button { min-height: 38px; padding: 7px 12px; border: 0; border-radius: 6px; background: #237f86; color: #fff; font: inherit; cursor: pointer; }
.canva-block-settings button:disabled { opacity: .65; cursor: wait; }
.canva-block-height { display: grid; gap: 6px; }
.canva-block-settings p { width: 100%; margin: 0; font-size: 12px; font-weight: 400; }
.canva-block-settings .canva-block-error { color: #a23d39; }
.canva-block-frame { display: block; width: 100%; max-width: 100%; border: 0; background: #fff; }
.is-editing .canva-block-frame { pointer-events: none; }
.canva-block-empty { display: grid; place-items: center; gap: 10px; min-height: 200px; padding: 20px; border: 1px dashed #8bcfd1; color: #237f86; text-align: center; }
.canva-block-open { display: inline-block; margin-top: 8px; color: #173f5f; font-size: 13px; text-underline-offset: 3px; }
</style>
