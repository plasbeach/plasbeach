<script setup lang="ts">
// Animated full-page background: my Mandelbulb3D render "Dainbramage - Home of the Postiers"
// drifting slowly, with a breathing purple glow and a veil that keeps text readable.
// Only transform and opacity are animated, so it stays cheap on phones.
// Visitors who ask for reduced motion get the still image.
import { onBeforeUnmount, onMounted, ref } from 'vue'

const loaded = ref(false)

// Let the fixed layer show through: html/body normally paint the solid page colour.
onMounted(() => document.documentElement.classList.add('has-fractal'))
onBeforeUnmount(() => document.documentElement.classList.remove('has-fractal'))
</script>

<template>
  <div class="fractal" aria-hidden="true">
    <img
      class="art"
      :class="{ loaded }"
      src="/bg/postiers-2560.webp"
      srcset="/bg/postiers-1280.webp 1280w, /bg/postiers-2560.webp 2560w"
      sizes="100vw"
      alt=""
      decoding="async"
      fetchpriority="low"
      @load="loaded = true"
    />
    <div class="glow" />
    <div class="veil" />
  </div>
</template>

<style scoped>
.fractal {
  position: fixed; inset: 0; z-index: -1; overflow: hidden;
  background: #120d22; /* the render's darkest purple, shown while it loads */
}

.art {
  position: absolute; inset: -6%; width: 112%; height: 112%;
  object-fit: cover; object-position: center;
  opacity: 0; transition: opacity 1.2s ease;
  will-change: transform;
  animation: drift 70s ease-in-out infinite alternate;
}
.art.loaded { opacity: 1; }

/* A slow push towards the central hexagon, sliding a little sideways */
@keyframes drift {
  0%   { transform: scale(1)    translate3d(0, 0, 0)      rotate(0deg); }
  50%  { transform: scale(1.07) translate3d(-1.5%, 1%, 0) rotate(0.6deg); }
  100% { transform: scale(1.13) translate3d(1.2%, -1%, 0) rotate(-0.4deg); }
}

/* Purple light pulsing out of the centre */
.glow {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 55% 50% at 50% 55%, rgba(170, 110, 255, 0.35), transparent 70%);
  opacity: 0.2;
  animation: breathe 9s ease-in-out infinite;
}
@keyframes breathe { 50% { opacity: 0.75; } }

/* Readability veil, per theme */
.veil {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(246, 244, 250, 0.74) 0%, rgba(246, 244, 250, 0.84) 60%, rgba(246, 244, 250, 0.92) 100%);
}
:global(:root.dark) .veil {
  background: linear-gradient(180deg, rgba(18, 16, 25, 0.38) 0%, rgba(18, 16, 25, 0.62) 55%, rgba(18, 16, 25, 0.85) 100%);
}

@media (prefers-reduced-motion: reduce) {
  .art, .glow { animation: none; }
  .art { transform: scale(1.04); }
}
</style>

<style>
html.has-fractal, html.has-fractal body { background: transparent; }
</style>
