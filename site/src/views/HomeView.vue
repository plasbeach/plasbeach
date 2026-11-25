<script setup lang="ts">
import { RouterLink } from 'vue-router'
import FractalBackground from '../components/FractalBackground.vue'
import PiStats from '../components/PiStats.vue'
import ChessRating from '../components/ChessRating.vue'

const REPO = 'https://github.com/plasbeach/plasbeach'

const profiles = [
  { name: 'chess.com', href: 'https://www.chess.com/member/plasbeach' },
  { name: 'Spotify', href: 'https://open.spotify.com/user/arnaudnager?si=dc57106ae3a045a3' },
  { name: 'SoundCloud', href: 'https://soundcloud.com/arnaudnager' },
]

interface Project {
  name: string
  desc: string
  href: string
  internal?: boolean
  tag?: string
  source?: string
}

const projects: Project[] = [
  {
    name: 'Schieber',
    desc: 'Score sheet for Jass: trumps, announcements, match bonus, editable rounds, any target.',
    href: '/chibre',
    internal: true,
    source: `${REPO}/tree/main/site/src/schieber`,
  },
  {
    name: 'Calendar + Mail',
    desc: 'My mailboxes and calendars in one place, with Claude to plan meetings and answer email.',
    href: '/mail/',
    tag: 'Private · login',
    source: `${REPO}/tree/main/apps/calendar-mail`,
  },
  {
    name: 'Spam filter',
    desc: 'Runs in the background on the Pi: Claude reads new mail and sets spam and phishing aside.',
    href: `${REPO}/tree/main/apps/spamfilter`,
    tag: 'Background service',
  },
  {
    name: 'Nextcloud',
    desc: 'Files, photos and music, self-hosted.',
    href: '/nextcloud/',
    tag: 'Private · login',
  },
  {
    name: 'Gothic Terminal',
    desc: 'The pixel display font used across this site, drawn on a 16px grid.',
    href: `${REPO}/tree/main/theme/gothic-terminal-source`,
    tag: 'Font',
  },
]
</script>

<template>
  <FractalBackground />
  <main class="home">
    <section class="hero">
      <h1>Projects &amp; web apps</h1>
      <p class="lede">Things I build, self-hosted on a Raspberry Pi 5 at home.</p>
      <ul class="profiles" aria-label="Me elsewhere">
        <li v-for="l in profiles" :key="l.name"><a :href="l.href" rel="me">{{ l.name }} ↗</a></li>
      </ul>
    </section>

    <!-- Only when logged in: the stats endpoint answers 401 otherwise and this renders nothing -->
    <PiStats />

    <ChessRating />

    <ul class="grid">
      <li v-for="p in projects" :key="p.name" class="card project">
        <component :is="p.internal ? RouterLink : 'a'" :to="p.internal ? p.href : undefined" :href="p.internal ? undefined : p.href" class="cover">
          <span class="name">{{ p.name }}</span>
        </component>
        <p class="desc">{{ p.desc }}</p>
        <div class="foot">
          <span v-if="p.tag" class="tag tag-none">{{ p.tag }}</span>
          <a v-if="p.source" :href="p.source" class="src">Source</a>
        </div>
      </li>
    </ul>

    <footer class="footer muted">
      <span>All the code is on <a :href="REPO">GitHub</a>.</span>
    </footer>
  </main>
</template>

<style scoped>
.home { max-width: 1120px; margin: 0 auto; padding: 16px 16px 48px; }
.hero { padding: 32px 0 40px; }
h1 { font-size: 48px; line-height: 1.1; margin: 0 0 12px; }
.lede { font-size: 18px; color: var(--text-2); margin: 0; max-width: 560px; }
.profiles { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0 20px; }
.profiles a { display: inline-flex; align-items: center; min-height: 44px; font-weight: 500; }

.grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.project { position: relative; padding: 20px; display: flex; flex-direction: column; gap: 8px; transition: border-color 0.15s ease, transform 0.15s ease; }
.project:hover { border-color: var(--tint-border); transform: translateY(-2px); }
.cover { color: var(--text); text-decoration: none; }
/* The whole card is clickable through the title link */
.cover::after { content: ''; position: absolute; inset: 0; border-radius: 12px; }
.name { font-family: var(--font-display); font-size: 32px; line-height: 1; text-shadow: var(--glow); }
.desc { margin: 0; color: var(--text-2); line-height: 1.5; flex: 1; }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 24px; }
.src { position: relative; z-index: 1; font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; min-height: 44px; padding: 0 4px; margin: -10px -4px; }

.footer { margin-top: 48px; font-size: 14px; }
.footer a { display: inline-block; padding: 12px 2px; margin: -12px 0; }
@media (max-width: 480px) { .footer { font-size: 16px; } }

@media (max-width: 480px) { h1 { font-size: 32px; } }
</style>
