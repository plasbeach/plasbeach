<script setup lang="ts">
// Full-page background for the home page: a live, endlessly zooming fractal drawn with WebGL
// in the style of my Mandelbulb3D render "Home of the Postiers" (see fractalShader.ts).
// - Renders at reduced resolution and at most 30 fps; drops resolution if the device struggles.
// - Falls back to the still render (with a slow CSS drift) without WebGL2 or on very slow devices.
// - Reduced motion: one still frame of the fractal, no animation.
// Debug: add ?fractal-t=<seconds> to the URL to freeze it at a given time.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { FRAG, VERT } from './fractalShader'

type Mode = 'pending' | 'live' | 'image'
const mode = ref<Mode>('pending')
const loaded = ref(false)
const canvas = ref<HTMLCanvasElement>()

let gl: WebGL2RenderingContext | null = null
let raf = 0
let stopped = false

function compile(g: WebGL2RenderingContext, type: number, src: string) {
  const s = g.createShader(type)!
  g.shaderSource(s, src)
  g.compileShader(s)
  if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) ?? 'shader')
  return s
}

function start(): boolean {
  const c = canvas.value
  if (!c) return false
  gl = c.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' })
  if (!gl) return false
  const g = gl
  try {
    const prog = g.createProgram()!
    g.attachShader(prog, compile(g, g.VERTEX_SHADER, VERT))
    g.attachShader(prog, compile(g, g.FRAGMENT_SHADER, FRAG))
    g.linkProgram(prog)
    if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(prog) ?? 'link')
    g.useProgram(prog)
    g.bindVertexArray(g.createVertexArray())
    const uRes = g.getUniformLocation(prog, 'uRes')
    const uTime = g.getUniformLocation(prog, 'uTime')

    const params = new URLSearchParams(location.search)
    const frozen = params.has('fractal-t') ? Number(params.get('fractal-t')) || 0 : null
    const still = frozen !== null || matchMedia('(prefers-reduced-motion: reduce)').matches
    const t0 = performance.now() - 37_000 // start a little way into the zoom

    // Resolution as a fraction of CSS pixels; lowered if frames are slow
    let quality = innerWidth < 700 ? 0.5 : 0.6
    const resize = () => {
      const w = Math.max(1, Math.round(innerWidth * quality))
      const h = Math.max(1, Math.round(innerHeight * quality))
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; g.viewport(0, 0, w, h) }
      g.uniform2f(uRes, w, h)
    }
    const draw = (t: number) => {
      resize()
      g.uniform1f(uTime, t)
      g.drawArrays(g.TRIANGLES, 0, 3)
    }

    if (still) { draw(frozen ?? 37); return true }

    let last = 0
    let slow = 0
    let frames = 0
    const loop = (now: number) => {
      if (stopped) return
      raf = requestAnimationFrame(loop)
      if (now - last < 32) return // ~30 fps is plenty for a slow zoom
      const dt = now - last
      last = now
      draw((now - t0) / 1000)
      // After a short warm-up, watch for a struggling device
      if (++frames > 20 && dt > 60) {
        if (++slow > 15) {
          slow = 0
          if (quality > 0.3) quality -= 0.1
          else { stopped = true; mode.value = 'image' }
        }
      } else if (slow > 0) slow--
    }
    raf = requestAnimationFrame(loop)
    return true
  } catch (err) {
    console.warn('Fractal background: falling back to the image', err)
    return false
  }
}

onMounted(() => {
  // Let the fixed layer show through: html/body normally paint the solid page colour.
  document.documentElement.classList.add('has-fractal')
  mode.value = 'live'                // render the canvas so start() can use it
  requestAnimationFrame(() => { if (!start()) mode.value = 'image' })
})

onBeforeUnmount(() => {
  stopped = true
  cancelAnimationFrame(raf)
  gl?.getExtension('WEBGL_lose_context')?.loseContext()
  document.documentElement.classList.remove('has-fractal')
})
</script>

<template>
  <div class="fractal" aria-hidden="true">
    <canvas v-if="mode === 'live'" ref="canvas" class="gl" />
    <img
      v-else-if="mode === 'image'"
      class="art"
      :class="{ loaded }"
      src="/bg/postiers-2560.webp"
      srcset="/bg/postiers-1280.webp 1280w, /bg/postiers-2560.webp 2560w"
      sizes="100vw"
      alt=""
      decoding="async"
      @load="loaded = true"
    />
    <div class="glow" />
    <div class="veil" />
  </div>
</template>

<style scoped>
.fractal {
  position: fixed; inset: 0; z-index: -1; overflow: hidden;
  background: #120d22; /* the render's darkest purple, shown while starting */
}
.gl { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
/* Toned down so it stays a background: less colour, less contrast */
.gl, .art { filter: saturate(0.55) contrast(0.8) brightness(0.9); }

/* Fallback: the still render, drifting slowly */
.art {
  position: absolute; inset: -6%; width: 112%; height: 112%;
  object-fit: cover; object-position: center;
  opacity: 0; transition: opacity 1.2s ease;
  animation: drift 70s ease-in-out infinite alternate;
}
.art.loaded { opacity: 1; }
@keyframes drift {
  0%   { transform: scale(1)    translate3d(0, 0, 0)      rotate(0deg); }
  50%  { transform: scale(1.07) translate3d(-1.5%, 1%, 0) rotate(0.6deg); }
  100% { transform: scale(1.13) translate3d(1.2%, -1%, 0) rotate(-0.4deg); }
}

/* Purple light pulsing out of the centre */
.glow {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 55% 50% at 50% 55%, rgba(170, 110, 255, 0.3), transparent 70%);
  opacity: 0.2;
  animation: breathe 9s ease-in-out infinite;
}
@keyframes breathe { 50% { opacity: 0.7; } }

.veil { position: absolute; inset: 0; }

@media (prefers-reduced-motion: reduce) {
  .art, .glow { animation: none; }
  .art { transform: scale(1.04); }
}
</style>

<style>
html.has-fractal, html.has-fractal body { background: transparent; }

/* Readability veil, per theme (unscoped: it depends on the .dark class on <html>) */
.fractal .veil {
  background: linear-gradient(180deg, rgba(246, 244, 250, 0.68) 0%, rgba(246, 244, 250, 0.78) 55%, rgba(246, 244, 250, 0.92) 100%);
}
:root.dark .fractal .veil {
  background: linear-gradient(180deg, rgba(18, 16, 25, 0.45) 0%, rgba(18, 16, 25, 0.58) 55%, rgba(18, 16, 25, 0.82) 100%);
}
</style>
