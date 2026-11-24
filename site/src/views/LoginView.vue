<script setup lang="ts">
// Login for the private apps: password, then a 6-digit code from an authenticator app.
// The first time, it walks you through registering the app (QR code or key to type).
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

type Step = 'password' | 'code' | 'enroll' | 'recovery' | 'done'

const route = useRoute()
const step = ref<Step>('password')
const busy = ref(false)
const error = ref('')

const username = ref('')
const password = ref('')
const remember = ref(false)
const code = ref('')
const useRecovery = ref(false)

const enroll = ref<{ secret: string; uri: string; qr: string } | null>(null)
const recoveryCodes = ref<string[]>([])
const copied = ref(false)

/** Where to go after logging in: only paths on this site. */
const target = computed(() => {
  const rd = typeof route.query.rd === 'string' ? route.query.rd : ''
  return rd.startsWith('/') && !rd.startsWith('//') && !rd.startsWith('/\\') ? rd : '/mail/'
})

async function post<T>(url: string, body?: object): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}), credentials: 'same-origin' })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`)
  return data
}

async function run(fn: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try { await fn() } catch (e) { error.value = (e as Error).message } finally { busy.value = false }
}

const focus = (id: string) => nextTick(() => (document.getElementById(id) as HTMLInputElement | null)?.focus())

const submitPassword = () => run(async () => {
  const r = await post<{ next: 'code' | 'enroll' }>('/auth/api/login', { username: username.value, password: password.value, remember: remember.value })
  password.value = ''
  if (r.next === 'enroll') {
    enroll.value = await post('/auth/api/enroll/start')
    step.value = 'enroll'
  } else step.value = 'code'
  focus('code')
})

const submitCode = () => run(async () => {
  if (step.value === 'enroll') {
    const r = await post<{ recovery: string[] }>('/auth/api/enroll/finish', { code: code.value })
    recoveryCodes.value = r.recovery
    step.value = 'recovery'
  } else {
    await post('/auth/api/code', { code: code.value })
    go()
  }
  code.value = ''
})

function go() {
  step.value = 'done'
  window.location.assign(target.value)
}

async function copyCodes() {
  try { await navigator.clipboard.writeText(recoveryCodes.value.join('\n')); copied.value = true } catch { /* not allowed */ }
}

onMounted(async () => {
  if (route.query.logout !== undefined) {
    await post('/auth/api/logout').catch(() => {})
    return focus('username')
  }
  // Already logged in? Go straight on.
  try {
    const s = (await (await fetch('/auth/api/session', { credentials: 'same-origin' })).json()) as { stage: string }
    if (s.stage === 'full') return go()
  } catch { /* service down: show the form anyway */ }
  focus('username')
})
</script>

<template>
  <main class="login">
    <section class="card box" aria-live="polite">
      <template v-if="step === 'password'">
        <h1>Connexion</h1>
        <p v-if="route.query.logout !== undefined" class="note">Vous êtes déconnecté.</p>
        <form class="form" @submit.prevent="submitPassword">
          <label for="username">Nom d’utilisateur</label>
          <input id="username" v-model="username" class="field" autocomplete="username" autocapitalize="none" spellcheck="false" required />
          <label for="password">Mot de passe</label>
          <input id="password" v-model="password" class="field" type="password" autocomplete="current-password" required />
          <label class="check"><input v-model="remember" type="checkbox" /> Se souvenir de cet appareil 30 jours</label>
          <button class="btn btn-primary" :disabled="busy">{{ busy ? 'Vérification…' : 'Continuer' }}</button>
        </form>
      </template>

      <template v-else-if="step === 'code'">
        <h1>Code</h1>
        <p class="muted">{{ useRecovery ? 'Entrez un de vos codes de secours.' : 'Entrez le code à 6 chiffres de votre application d’authentification.' }}</p>
        <form class="form" @submit.prevent="submitCode">
          <label for="code" class="sr-only">Code</label>
          <input id="code" v-model="code" class="field code" :inputmode="useRecovery ? 'text' : 'numeric'" :autocomplete="useRecovery ? 'off' : 'one-time-code'"
            :maxlength="useRecovery ? 9 : 6" :placeholder="useRecovery ? 'xxxx-xxxx' : '000000'" required />
          <button class="btn btn-primary" :disabled="busy">{{ busy ? 'Vérification…' : 'Se connecter' }}</button>
        </form>
        <button type="button" class="linkish" @click="useRecovery = !useRecovery; code = ''; focus('code')">
          {{ useRecovery ? 'Utiliser l’application' : 'Utiliser un code de secours' }}
        </button>
      </template>

      <template v-else-if="step === 'enroll' && enroll">
        <h1>Double authentification</h1>
        <ol class="steps">
          <li>Ouvrez votre application d’authentification (Aegis, 2FAS, Google Authenticator, Authy, 1Password…) et ajoutez un compte.</li>
          <li>Scannez ce QR code<span class="mobile-only">, ou touchez « Ouvrir dans l’application » si elle est sur ce téléphone</span> :</li>
        </ol>
        <div class="qr" role="img" aria-label="QR code à scanner" v-html="enroll.qr" />
        <a class="btn open-app mobile-only" :href="enroll.uri">Ouvrir dans l’application</a>
        <details class="manual">
          <summary>Impossible de scanner ? Saisir la clé à la main</summary>
          <p class="muted small">Type : basé sur le temps (TOTP) · 6 chiffres · 30 secondes</p>
          <code class="secret">{{ enroll.secret }}</code>
        </details>
        <form class="form" @submit.prevent="submitCode">
          <label for="code">3. Entrez le code à 6 chiffres affiché par l’application</label>
          <input id="code" v-model="code" class="field code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" required />
          <button class="btn btn-primary" :disabled="busy">{{ busy ? 'Vérification…' : 'Activer' }}</button>
        </form>
      </template>

      <template v-else-if="step === 'recovery'">
        <h1>Codes de secours</h1>
        <p class="muted">Si vous perdez votre téléphone, chacun de ces codes remplace une fois le code de l’application. Gardez-les en lieu sûr : ils ne seront plus affichés.</p>
        <ul class="codes">
          <li v-for="c in recoveryCodes" :key="c"><code>{{ c }}</code></li>
        </ul>
        <div class="row">
          <button type="button" class="btn" @click="copyCodes">{{ copied ? 'Copiés ✓' : 'Copier' }}</button>
          <button type="button" class="btn btn-primary" @click="go">C’est noté, continuer</button>
        </div>
      </template>

      <template v-else>
        <h1>Connecté</h1>
        <p class="muted">Redirection…</p>
      </template>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.login { min-height: calc(100vh - 88px); display: grid; place-items: start center; padding: 32px 16px 64px; }
.box { width: 100%; max-width: 420px; padding: 32px 28px; display: flex; flex-direction: column; gap: 16px; }
h1 { font-size: 32px; line-height: 1.1; margin: 0; }
.form { display: flex; flex-direction: column; gap: 8px; }
.form label { font-weight: 500; font-size: 14px; }
.form .field + label { margin-top: 8px; }
.form .btn { margin-top: 12px; }
.check { display: flex; align-items: center; gap: 8px; font-weight: 400 !important; margin-top: 8px; color: var(--text-2); min-height: 44px; }
.check input { width: 18px; height: 18px; accent-color: var(--accent); }
.code { font-family: var(--font-display); font-size: 32px; letter-spacing: 0.25em; text-align: center; min-height: 64px; }
.note { margin: 0; padding: 10px 12px; border-radius: 8px; background: var(--tint); color: var(--tint-fg); }
.linkish { align-self: center; border: none; background: none; color: var(--link); text-decoration: underline; cursor: pointer; min-height: 44px; padding: 0 8px; }
.steps { margin: 0; padding-left: 20px; color: var(--text-2); line-height: 1.5; display: flex; flex-direction: column; gap: 6px; }
.qr { align-self: center; width: 220px; padding: 12px; background: #fff; border-radius: 12px; border: 1px solid var(--border); }
.qr :deep(svg) { display: block; width: 100%; height: auto; }
.open-app { align-self: center; display: inline-flex; align-items: center; text-decoration: none; }
.manual summary { cursor: pointer; color: var(--link); min-height: 32px; }
.manual p { margin: 8px 0; }
.secret { display: block; font-family: ui-monospace, monospace; font-size: 15px; padding: 12px; border-radius: 8px; background: var(--chip); word-break: break-all; user-select: all; }
.codes { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.codes code { display: block; text-align: center; font-family: ui-monospace, monospace; font-size: 15px; padding: 8px; border-radius: 6px; background: var(--chip); }
.row { display: flex; gap: 8px; justify-content: space-between; flex-wrap: wrap; }
.error { margin: 0; padding: 10px 12px; border-radius: 8px; background: var(--warn-bg); color: var(--warn-fg); }
.small { font-size: 13px; }
.mobile-only { display: none; }
@media (pointer: coarse) { .mobile-only { display: inline; } a.mobile-only { display: inline-flex; } }
</style>
