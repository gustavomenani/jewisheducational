<script setup>
const petals = [
  { id: 1, left: '72%', delay: '0s', dur: '9s', size: 10 },
  { id: 2, left: '78%', delay: '2s', dur: '11s', size: 8 },
  { id: 3, left: '85%', delay: '4s', dur: '10s', size: 12 },
  { id: 4, left: '68%', delay: '1s', dur: '12s', size: 7 },
  { id: 5, left: '91%', delay: '3s', dur: '8s', size: 9 },
  { id: 6, left: '55%', delay: '5s', dur: '13s', size: 6 },
];

const sparkles = [
  { id: 1, top: '18%', left: '12%', delay: '0s' },
  { id: 2, top: '28%', left: '22%', delay: '1.2s' },
  { id: 3, top: '35%', left: '8%', delay: '2.4s' },
  { id: 4, top: '22%', left: '35%', delay: '0.8s' },
  { id: 5, top: '45%', left: '18%', delay: '3s' },
];

const flowers = [
  { id: 1, left: '42%', bottom: '8%', delay: '0s' },
  { id: 2, left: '58%', bottom: '6%', delay: '0.5s' },
  { id: 3, left: '48%', bottom: '10%', delay: '1s' },
];
</script>

<template>
  <div class="hero-scene" aria-hidden="true">
    <!-- Desktop: paisagem -->
    <picture class="hero-picture hero-picture-desktop">
      <source
        type="image/webp"
        media="(min-width: 992px)"
        srcset="
          /images/hero/hero-main-800.webp 800w,
          /images/hero/hero-main-1200.webp 1200w,
          /images/hero/hero-main-1920.webp 1920w,
          /images/hero/hero-main-2560.webp 2560w,
          /images/hero/hero-main.webp 4096w
        "
        sizes="100vw"
      />
      <img
        src="/images/hero/hero-main.png"
        alt=""
        class="hero-scene-img"
        loading="eager"
        fetchpriority="high"
        decoding="async"
        width="4096"
        height="1432"
      />
    </picture>

    <!-- Mobile: retrato -->
    <picture class="hero-picture hero-picture-mobile">
      <source
        type="image/webp"
        srcset="
          /images/hero/hero-main-mobile-480.webp 480w,
          /images/hero/hero-main-mobile-768.webp 768w,
          /images/hero/hero-main-mobile-1080.webp 1080w,
          /images/hero/hero-main-mobile.webp 512w
        "
        sizes="100vw"
      />
      <img
        src="/images/hero/hero-main-mobile.png"
        alt=""
        class="hero-scene-img hero-scene-img-mobile"
        loading="eager"
        fetchpriority="high"
        decoding="async"
        width="512"
        height="1024"
      />
    </picture>

    <div class="hero-cloud hero-cloud-1"></div>
    <div class="hero-cloud hero-cloud-2"></div>

    <div class="hero-fx">
      <span
        v-for="p in petals"
        :key="'p' + p.id"
        class="hero-petal"
        :style="{
          left: p.left,
          width: p.size + 'px',
          height: p.size + 'px',
          animationDuration: p.dur,
          animationDelay: p.delay,
        }"
      />
      <span
        v-for="s in sparkles"
        :key="'s' + s.id"
        class="hero-sparkle"
        :style="{ top: s.top, left: s.left, animationDelay: s.delay }"
      />
      <span
        v-for="f in flowers"
        :key="'f' + f.id"
        class="hero-flower"
        :style="{ left: f.left, bottom: f.bottom, animationDelay: f.delay }"
      />
    </div>
  </div>
</template>

<style scoped>
.hero-scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  line-height: 0;
  overflow: hidden;
  background: var(--edu-sky);
}

.hero-picture {
  display: block;
  width: 100%;
  height: 100%;
}

.hero-picture-mobile {
  display: none;
}

.hero-scene-img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  object-position: center center;
  transform: translateZ(0);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.hero-cloud {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
  filter: blur(28px);
  pointer-events: none;
  z-index: 1;
}

.hero-cloud-1 {
  width: 180px;
  height: 70px;
  top: 12%;
  left: 8%;
  animation: cloud-drift 22s ease-in-out infinite;
}

.hero-cloud-2 {
  width: 140px;
  height: 55px;
  top: 22%;
  left: 18%;
  animation: cloud-drift 28s ease-in-out infinite reverse;
}

.hero-fx {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
  overflow: hidden;
}

.hero-petal {
  position: absolute;
  top: -20px;
  border-radius: 50% 0 50% 50%;
  background: var(--edu-pink);
  opacity: 0.75;
  animation: petal-fall linear infinite;
  transform: rotate(45deg);
}

.hero-sparkle {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 8px 2px rgba(255, 255, 255, 0.8);
  animation: sparkle-pulse 2.5s ease-in-out infinite;
}

.hero-flower {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--edu-yellow);
  box-shadow: 0 0 0 3px rgba(255, 213, 79, 0.35);
  animation: flower-sway 3s ease-in-out infinite;
}

@keyframes cloud-drift {
  0%, 100% { transform: translateX(0); opacity: 0.5; }
  50% { transform: translateX(30px); opacity: 0.7; }
}

@keyframes petal-fall {
  0% { transform: translateY(0) rotate(45deg); opacity: 0; }
  10% { opacity: 0.8; }
  90% { opacity: 0.6; }
  100% { transform: translateY(110vh) rotate(200deg); opacity: 0; }
}

@keyframes sparkle-pulse {
  0%, 100% { opacity: 0.2; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

@keyframes flower-sway {
  0%, 100% { transform: translateX(0) scale(1); }
  50% { transform: translateX(3px) scale(1.15); }
}

@media (max-width: 991px) {
  .hero-picture-desktop {
    display: none;
  }

  .hero-picture-mobile {
    display: block;
  }

  .hero-scene-img-mobile {
    object-fit: cover;
    object-position: 58% 38%;
    width: 100%;
    height: 100%;
    min-width: 100%;
  }

  .hero-picture-mobile,
  .hero-picture-mobile .hero-scene-img {
    width: 100%;
    min-width: 100%;
  }

  .hero-cloud-1 {
    width: 120px;
    height: 45px;
    top: 8%;
    left: 5%;
  }

  .hero-cloud-2 {
    width: 90px;
    height: 35px;
    top: 14%;
    left: 25%;
  }
}

@media (max-width: 576px) {
  .hero-cloud { opacity: 0.6; }
}

@media (prefers-reduced-motion: reduce) {
  .hero-cloud,
  .hero-petal,
  .hero-sparkle,
  .hero-flower {
    animation: none !important;
  }
}
</style>
