<script setup lang="ts">
import BaseButton from '../components/base/BaseButton.vue'
import BaseTag from '../components/base/BaseTag.vue'
import BaseCard from '../components/base/BaseCard.vue'

const swatches = [
  { name: 'bg', token: '--bg' },
  { name: 'bg2', token: '--bg2' },
  { name: 'bg3', token: '--bg3' },
  { name: 'surface', token: '--surface' },
  { name: 'border', token: '--border' },
  { name: 'comment', token: '--comment' },
  { name: 'violet', token: '--violet' },
  { name: 'magenta', token: '--magenta' },
  { name: 'blue-violet', token: '--blue-violet' },
  { name: 'indigo', token: '--indigo' },
  { name: 'cyan', token: '--cyan' },
  { name: 'teal', token: '--teal' },
  { name: 'green', token: '--green' },
  { name: 'green-dark', token: '--green-dark' },
  { name: 'mint', token: '--mint' },
  { name: 'pink', token: '--pink' },
  { name: 'red', token: '--red' },
]
</script>

<template>
  <main class="page">
    <!-- Hero -->
    <section class="hero">
      <div class="hero__eyebrow">
        <BaseTag variant="violet">Design System</BaseTag>
        <BaseTag variant="cyan">v0.1</BaseTag>
      </div>
      <h1 class="hero__title">Plasbeach<span class="hero__dot">.</span></h1>
      <p class="hero__sub">
        A dark, vibrant component foundation built on pure CSS custom properties.
        No UI library — just the theme.
      </p>
      <div class="hero__actions">
        <BaseButton variant="primary">Get started</BaseButton>
        <BaseButton variant="secondary">View source</BaseButton>
        <BaseButton variant="accent">Deploy</BaseButton>
      </div>
    </section>

    <!-- Buttons -->
    <section class="section">
      <h2 class="section__heading">Buttons</h2>
      <div class="row">
        <BaseCard title="primary">
          <div class="stack">
            <BaseButton variant="primary">Primary</BaseButton>
            <BaseButton variant="primary" disabled>Disabled</BaseButton>
          </div>
        </BaseCard>
        <BaseCard title="secondary">
          <div class="stack">
            <BaseButton variant="secondary">Secondary</BaseButton>
            <BaseButton variant="secondary" disabled>Disabled</BaseButton>
          </div>
        </BaseCard>
        <BaseCard title="accent">
          <div class="stack">
            <BaseButton variant="accent">Accent</BaseButton>
            <BaseButton variant="accent" disabled>Disabled</BaseButton>
          </div>
        </BaseCard>
      </div>
    </section>

    <!-- Tags -->
    <section class="section">
      <h2 class="section__heading">Tags</h2>
      <BaseCard>
        <div class="tag-row">
          <BaseTag variant="violet">Violet</BaseTag>
          <BaseTag variant="magenta">Magenta</BaseTag>
          <BaseTag variant="cyan">Cyan</BaseTag>
          <BaseTag variant="green">Green</BaseTag>
          <BaseTag variant="violet">Vue 3</BaseTag>
          <BaseTag variant="cyan">TypeScript</BaseTag>
          <BaseTag variant="magenta">Vite</BaseTag>
          <BaseTag variant="green">Open source</BaseTag>
        </div>
      </BaseCard>
    </section>

    <!-- Cards -->
    <section class="section">
      <h2 class="section__heading">Cards</h2>
      <div class="row">
        <BaseCard title="Midnight Bloom">
          <p class="body-text">
            A deep violet palette rooted in shadow and neon. Every token maps
            directly to a semantic intention, keeping your styles coherent at scale.
          </p>
          <div class="card-footer">
            <BaseTag variant="violet">Theme</BaseTag>
            <BaseButton variant="secondary">Explore</BaseButton>
          </div>
        </BaseCard>

        <BaseCard title="Component library">
          <p class="body-text">
            Buttons, tags, and cards ship ready-to-use. Compose them freely —
            no framework opinions, no runtime overhead beyond Vue itself.
          </p>
          <div class="card-footer">
            <BaseTag variant="cyan">Components</BaseTag>
            <BaseButton variant="primary">Browse</BaseButton>
          </div>
        </BaseCard>

        <BaseCard title="Zero hardcoding">
          <p class="body-text">
            Every color references a CSS variable. Swap the root palette and
            the entire UI follows — light mode, brand refresh, or anything else.
          </p>
          <div class="card-footer">
            <BaseTag variant="green">CSS vars</BaseTag>
            <BaseButton variant="accent">Customise</BaseButton>
          </div>
        </BaseCard>
      </div>
    </section>

    <!-- Color palette swatch -->
    <section class="section">
      <h2 class="section__heading">Palette</h2>
      <BaseCard>
        <div class="swatches">
          <div
            v-for="swatch in swatches"
            :key="swatch.name"
            class="swatch"
            :style="{ backgroundColor: `var(${swatch.token})` }"
          >
            <span class="swatch__label">{{ swatch.name }}</span>
          </div>
        </div>
      </BaseCard>
    </section>
  </main>
</template>

<style scoped>
.page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 4rem 1.5rem 6rem;
}

/* Hero */
.hero {
  margin-bottom: 5rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
}

.hero__eyebrow {
  display: flex;
  gap: 0.5rem;
}

.hero__title {
  font-size: clamp(2.5rem, 6vw, 5rem);
  font-weight: 700;
  color: var(--white);
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.hero__dot {
  color: var(--violet);
}

.hero__sub {
  max-width: 52ch;
  color: var(--fg-muted);
  font-size: 1.0625rem;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

/* Sections */
.section {
  margin-bottom: 3.5rem;
}

.section__heading {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--fg-muted);
  margin-bottom: 1.25rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
}

/* Layout helpers */
.row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: flex-start;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* Card internals */
.body-text {
  color: var(--fg-muted);
  font-size: 0.9375rem;
  line-height: 1.65;
  margin-bottom: 1.25rem;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

/* Swatches */
.swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 0.5rem;
}

.swatch {
  height: 72px;
  border-radius: 8px;
  display: flex;
  align-items: flex-end;
  padding: 0.35rem 0.5rem;
  border: 1px solid rgba(255 255 255 / 0.06);
}

.swatch__label {
  font-size: 0.7rem;
  font-weight: 600;
  color: rgba(255 255 255 / 0.85);
  text-shadow: 0 1px 3px rgba(0 0 0 / 0.6);
  letter-spacing: 0.03em;
}
</style>
