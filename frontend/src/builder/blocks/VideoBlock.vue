<script setup>
import { computed } from 'vue';
import EditableText from '../EditableText.vue';
import { useBuilderStore } from '../store';

const props = defineProps({
  block: { type: Object, required: true },
});

const builder = useBuilderStore();

const p = computed(() => props.block.props || {});

const videoUrl = computed(() => p.value.url || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

const parsedVideo = computed(() => {
  const url = videoUrl.value.trim();

  // YouTube matchers
  const ytRegExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const ytMatch = url.match(ytRegExp);
  if (ytMatch && ytMatch[2].length === 11) {
    return {
      type: 'iframe',
      src: `https://www.youtube.com/embed/${ytMatch[2]}?rel=0`,
    };
  }

  // Vimeo matchers
  const vimeoRegExp = /(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)(\d+)/;
  const vimeoMatch = url.match(vimeoRegExp);
  if (vimeoMatch && vimeoMatch[1]) {
    return {
      type: 'iframe',
      src: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
    };
  }

  // Direct MP4 / HTML5 video
  return {
    type: 'video',
    src: url,
  };
});

const wrapperStyle = computed(() => {
  const align = p.value.align || 'center';
  const maxWidth = p.value.maxWidth ? `${p.value.maxWidth}%` : '100%';
  
  let margin = '0 auto';
  if (align === 'left') margin = '0 auto 0 0';
  if (align === 'right') margin = '0 0 0 auto';

  return {
    maxWidth,
    margin,
  };
});

const aspectPaddingTop = computed(() => {
  const ratio = p.value.aspectRatio || '16:9';
  if (ratio === '4:3') return '75%';
  if (ratio === '1:1') return '100%';
  return '56.25%'; // 16:9
});

function setTitle(title) {
  builder.updateBlock(props.block.id, { title });
}
</script>

<template>
  <div class="video-block" :style="wrapperStyle">
    <div class="video-container" :style="{ paddingTop: aspectPaddingTop }">
      <!-- Direct Video tag -->
      <video
        v-if="parsedVideo.type === 'video'"
        class="video-element"
        controls
        preload="metadata"
        :src="parsedVideo.src"
      >
        Your browser does not support this video.
      </video>

      <!-- Embed iframe for YouTube/Vimeo -->
      <iframe
        v-else
        class="video-element"
        :src="parsedVideo.src"
        title="Video player"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>

      <!-- Edit mode overlay to catch clicks for selection -->
      <div
        v-if="builder.editMode"
        class="video-edit-overlay"
        title="Click to select the video block"
        @click="builder.select(block.id)"
      ></div>
    </div>

    <!-- Optional Caption / Title -->
    <EditableText
      v-if="p.title !== undefined || builder.editMode"
      :model-value="p.title || ''"
      :select-id="block.id"
      tag="p"
      class="video-caption"
      placeholder="Add a video caption (optional)…"
      @update:model-value="setTitle"
      @commit="builder.commitHistory()"
    />
  </div>
</template>

<style scoped>
.video-block {
  margin: 16px 0;
  width: 100%;
}

.video-container {
  position: relative;
  width: 100%;
  height: 0;
  border-radius: 12px;
  overflow: hidden;
  background: #0f172a;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.video-element {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: 0;
  object-fit: contain;
}

.video-edit-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: transparent;
  cursor: pointer;
  z-index: 2;
}

.video-caption {
  font-size: 0.88rem;
  color: #64748b;
  text-align: center;
  margin: 8px 0 0 0;
}
</style>
