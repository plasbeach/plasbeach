<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import AskClaude from '@/components/AskClaude.vue'
import { useStore } from '@/composables/useStore'
import { usePhone } from '@/composables/usePhone'
import { fmtWhen } from '@/composables/format'
import type { Mail, MailFolder } from '@/data/types'

const route = useRoute()
const { state, accountById, askAbout, openMail, setUnread, deleteMail } = useStore()
const phone = usePhone()

/** 'all' = every inbox, 'todo' = mails linked to to-dos, otherwise a folder id. */
const current = ref<string>('all')
const openId = ref<string>(typeof route.query.open === 'string' ? route.query.open : '')
const search = ref('')

watch(() => route.query.open, (v) => { if (typeof v === 'string') openId.value = v })

const mailAccounts = computed(() => state.accounts.filter((a) => state.folders.some((f) => f.accountId === a.id)))

function unreadIn(pred: (m: Mail) => boolean) {
  return state.mails.filter((m) => m.unread && pred(m)).length
}
const inboxIds = computed(() => new Set(state.folders.filter((f) => f.role === 'inbox').map((f) => f.id)))

/** Folders of an account, with children right after their parent. */
function folderTree(accountId: string): { folder: MailFolder; depth: number }[] {
  const all = state.folders.filter((f) => f.accountId === accountId)
  const out: { folder: MailFolder; depth: number }[] = []
  const walk = (parentId: string | undefined, depth: number) => {
    for (const f of all.filter((x) => x.parentId === parentId)) {
      out.push({ folder: f, depth })
      walk(f.id, depth + 1)
    }
  }
  walk(undefined, 0)
  return out
}

function descendants(id: string): Set<string> {
  const ids = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of state.folders) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); grew = true }
  }
  return ids
}

const list = computed(() => {
  let ms: Mail[]
  if (current.value === 'all') ms = state.mails.filter((m) => inboxIds.value.has(m.folderId))
  else if (current.value === 'todo') ms = state.mails.filter((m) => m.todoId)
  else { const ids = descendants(current.value); ms = state.mails.filter((m) => ids.has(m.folderId)) }
  const q = search.value.trim().toLowerCase()
  if (q) ms = ms.filter((m) => m.from.toLowerCase().includes(q) || m.subject.toLowerCase().includes(q))
  return [...ms].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
})

const heading = computed(() => {
  if (current.value === 'all') return { title: 'All inboxes', sub: `${mailAccounts.value.length} mailboxes` }
  if (current.value === 'todo') return { title: 'Linked to to-dos', sub: 'all mailboxes' }
  const f = state.folders.find((x) => x.id === current.value)
  return { title: f?.name ?? '', sub: f ? accountById(f.accountId)?.name ?? '' : '' }
})
const multiAccount = computed(() => current.value === 'all' || current.value === 'todo')

const open = computed(() => state.mails.find((m) => m.id === openId.value))
const openFolder = computed(() => state.folders.find((f) => f.id === open.value?.folderId))
const openTodo = computed(() => state.todos.find((t) => t.id === open.value?.todoId))

function focusClaude(m: Mail) {
  const todo = m.todoId ? state.todos.find((t) => t.id === m.todoId) : undefined
  askAbout(todo ? { kind: 'todo', todo } : { kind: 'mail', mail: m })
}

function select(m: Mail) {
  openId.value = m.id
  void openMail(m)
  focusClaude(m)
  if (phone.value) window.scrollTo(0, 0)
}

/** Phones show one pane at a time: the list, or the open email. */
function markUnread() {
  const m = open.value
  if (!m) return
  void setUnread(m, !m.unread)
  // Marking unread usually means "deal with it later": go back to the list on phones
  if (phone.value && m.unread) back()
}

const deleting = ref(false)
async function remove() {
  const m = open.value
  if (!m || deleting.value) return
  const inTrash = openFolder.value?.role === 'trash'
  if (inTrash && !confirm('Delete this email for good?')) return
  deleting.value = true
  // Open the next email in the list (desktop) or go back to the list (phone)
  const i = list.value.findIndex((x) => x.id === m.id)
  const next = list.value[i + 1] ?? list.value[i - 1]
  try {
    await deleteMail(m)
    if (phone.value || !next) back()
    else select(next)
  } catch (e) {
    alert((e as Error).message)
  } finally {
    deleting.value = false
  }
}

function back() {
  openId.value = ''
  askAbout(null)
}
const folderLabel = (f: MailFolder) => f.name

onMounted(() => { if (open.value) { void openMail(open.value); focusClaude(open.value) } })
</script>

<template>
  <div class="mail" :class="{ reading: phone && open }">
    <aside class="boxes" aria-label="Mailboxes">
      <button type="button" class="btn btn-primary compose" @click="state.compose = {}"><AppIcon name="pen" :size="18" /> New email</button>
      <ul class="folders">
        <li><button type="button" class="folder" :aria-current="current === 'all' ? 'page' : undefined" @click="current = 'all'">
          <span>All inboxes</span><span v-if="unreadIn((m) => inboxIds.has(m.folderId))" class="count">{{ unreadIn((m) => inboxIds.has(m.folderId)) }}</span></button></li>
        <li><button type="button" class="folder" :aria-current="current === 'todo' ? 'page' : undefined" @click="current = 'todo'">
          <span>Linked to to-dos</span></button></li>
      </ul>
      <section v-for="a in mailAccounts" :key="a.id">
        <h2 class="acc"><span class="swatch" :style="{ background: a.color }" aria-hidden="true" />{{ a.name }}</h2>
        <ul class="folders">
          <li v-for="{ folder, depth } in folderTree(a.id)" :key="folder.id">
            <button type="button" class="folder" :style="{ paddingLeft: `${8 + depth * 16}px` }" :aria-current="current === folder.id ? 'page' : undefined" @click="current = folder.id">
              <span>{{ folder.name }}</span>
              <span v-if="unreadIn((m) => m.folderId === folder.id)" class="count">{{ unreadIn((m) => m.folderId === folder.id) }}</span>
            </button>
          </li>
        </ul>
      </section>
    </aside>

    <section class="list" aria-label="Message list">
      <div class="list-head">
        <div class="title-row"><h1>{{ heading.title }}</h1><span class="muted small">{{ heading.sub }}</span></div>
        <label v-if="phone" class="picker">
          <span class="sr-only">Folder</span>
          <select v-model="current" class="field">
            <option value="all">All inboxes{{ unreadIn((m) => inboxIds.has(m.folderId)) ? ` (${unreadIn((m) => inboxIds.has(m.folderId))})` : '' }}</option>
            <option value="todo">Linked to to-dos</option>
            <optgroup v-for="a in mailAccounts" :key="a.id" :label="a.name">
              <option v-for="{ folder, depth } in folderTree(a.id)" :key="folder.id" :value="folder.id">
                {{ '\u2003'.repeat(depth) }}{{ folderLabel(folder) }}{{ unreadIn((m) => m.folderId === folder.id) ? ` (${unreadIn((m) => m.folderId === folder.id)})` : '' }}
              </option>
            </optgroup>
          </select>
        </label>
        <label for="mail-search" class="sr-only">Search mail</label>
        <div class="search-row">
          <input id="mail-search" v-model="search" class="field" type="search" autocomplete="off" placeholder="Search mail…" />
          <button v-if="phone" type="button" class="btn btn-primary new-mail" aria-label="New email" @click="state.compose = {}"><AppIcon name="pen" :size="20" /></button>
        </div>
      </div>
      <ul class="messages">
        <li v-for="m in list" :key="m.id">
          <button type="button" class="msg" :class="{ open: m.id === openId, unread: m.unread }" :style="{ borderLeftColor: accountById(m.accountId)?.color }" @click="select(m)">
            <span class="msg-top"><span class="from">{{ m.from }}</span><span class="muted small">{{ fmtWhen(m.receivedAt) }}</span></span>
            <span class="subject">{{ m.subject }}</span>
            <span class="tags">
              <span v-if="multiAccount" class="muted small">{{ accountById(m.accountId)?.name }}</span>
              <span v-if="m.todoId" class="tag tag-todo">In your to-dos</span>
              <span v-else-if="m.noTodoReason" class="tag tag-none">No to-do · {{ m.noTodoReason }}</span>
            </span>
          </button>
        </li>
        <li v-if="!list.length" class="empty muted">Nothing in this folder.</li>
      </ul>
    </section>

    <main class="reader">
      <template v-if="open">
        <button v-if="phone" type="button" class="back" @click="back"><AppIcon name="chevron-left" :size="22" /> {{ heading.title }}</button>
        <header class="reader-head">
          <div class="muted small acc-line">
            <span class="swatch" :style="{ background: accountById(open.accountId)?.color }" aria-hidden="true" />
            {{ accountById(open.accountId)?.name }} · {{ openFolder?.name }}
          </div>
          <h2>{{ open.subject }}</h2>
          <div class="muted small">{{ open.from }} · {{ fmtWhen(open.receivedAt) }}</div>
        </header>
        <div class="toolbar">
          <button type="button" class="btn btn-primary" @click="state.compose = { replyTo: open }">Reply</button>
          <button type="button" class="btn" @click="markUnread">{{ open.unread ? 'Mark as read' : 'Mark as unread' }}</button>
          <button type="button" class="btn danger" :disabled="deleting" @click="remove">{{ openFolder?.role === 'trash' ? 'Delete for good' : 'Delete' }}</button>
        </div>
        <article class="card body">{{ open.body }}</article>
        <p v-if="openTodo" class="small muted">On your to-do list as “{{ openTodo.title }}”.</p>
        <AskClaude compact />
      </template>
      <p v-else class="muted">Select an email to read it.</p>
    </main>
  </div>
</template>

<style scoped>
.mail { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; min-height: 100vh; }
.boxes { flex: 0 1 240px; min-width: 200px; background: var(--surface); border-right: 1px solid var(--border); padding: 20px 12px; display: flex; flex-direction: column; gap: 16px; }
.compose { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 0 4px; }
.acc { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; padding: 0 8px; font-family: var(--font); font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
.swatch { width: 10px; height: 10px; border-radius: 3px; display: inline-block; flex: none; }
.folders { list-style: none; margin: 0; padding: 0; }
.folder { width: 100%; min-height: 36px; display: flex; align-items: center; gap: 10px; padding: 0 8px; border: none; border-radius: 8px; background: transparent; color: var(--text-2); font-size: 14px; text-align: left; cursor: pointer; }
.folder span:first-child { flex: 1; }
.folder:hover { background: var(--divider); }
.folder[aria-current='page'] { background: var(--tint); color: var(--tint-fg); font-weight: 600; }
.count { font-size: 12px; font-weight: 600; }
.list { flex: 1 1 320px; max-width: 400px; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
.list-head { padding: 20px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 12px; }
.title-row { display: flex; align-items: baseline; gap: 8px; }
.title-row h1 { margin: 0; font-size: 24px; }
.small { font-size: 13px; }
.messages { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
.msg { width: 100%; display: flex; flex-direction: column; gap: 3px; padding: 12px 20px 12px 16px; border: none; border-bottom: 1px solid var(--divider); border-left: 4px solid transparent; background: var(--surface); text-align: left; cursor: pointer; }
.msg:hover { background: var(--surface-2); }
.msg.open { background: var(--bg); }
.msg-top { display: flex; justify-content: space-between; gap: 12px; }
.from { font-size: 15px; }
.subject { font-size: 14px; }
.msg.unread .from, .msg.unread .subject { font-weight: 600; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.empty { padding: 40px 20px; text-align: center; font-size: 14px; }
.reader { flex: 999 1 420px; min-width: 0; padding: 28px 36px; display: flex; flex-direction: column; gap: 18px; }
.reader-head { display: flex; flex-direction: column; gap: 6px; }
.reader-head h2 { margin: 0; font-size: 26px; }
.acc-line { display: flex; align-items: center; gap: 8px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; }
.search-row { display: flex; gap: 8px; }
.danger { color: var(--suit-red); border-color: color-mix(in srgb, var(--suit-red) 50%, var(--control)); }
.new-mail { flex: none; width: 48px; padding: 0; display: grid; place-items: center; }
.body { padding: 24px; font-size: 15px; line-height: 1.6; white-space: pre-line; }
.back { display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; min-height: 44px; padding: 0 12px 0 4px; margin: -8px 0 0 -8px; border: none; background: none; color: var(--link); font-size: 16px; font-weight: 500; cursor: pointer; }
.body { overflow-wrap: anywhere; }

/* Phones: one pane at a time. The folder list becomes a picker above the messages. */
@media (max-width: 640px) {
  .mail { flex-direction: column; flex-wrap: nowrap; min-height: 0; }
  .boxes { display: none; }
  .list { max-width: none; flex: none; border-right: none; }
  .list-head { padding: 16px 16px 12px; gap: 10px; position: sticky; top: 0; z-index: 2; background: var(--surface); }
  .title-row h1 { font-size: 32px; }
  .msg { padding: 14px 16px 14px 12px; gap: 4px; min-height: 72px; }
  .from { font-size: 16px; }
  .subject { font-size: 15px; }
  .reader { display: none; padding: 16px; gap: 16px; }
  .reading .list { display: none; }
  .reading .reader { display: flex; }
  .reader-head h2 { font-size: 24px; overflow-wrap: anywhere; }
  .toolbar { display: grid; grid-template-columns: 1fr 1fr 1fr; }
  .toolbar .btn { padding: 0 8px; }
  .body { padding: 16px; font-size: 16px; }
}
</style>
