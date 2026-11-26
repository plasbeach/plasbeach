export type AccountId = string

export interface Account {
  id: AccountId
  name: string
  provider: 'google' | 'microsoft' | 'imap' | 'ics'
  color: string
}

export interface MailFolder {
  id: string
  accountId: AccountId
  name: string
  /** Parent folder id, for nested folders like Projects › Client A. */
  parentId?: string
  role?: 'inbox' | 'sent' | 'drafts' | 'archive' | 'spam' | 'trash'
}

export interface Mail {
  id: string
  accountId: AccountId
  folderId: string
  from: string
  subject: string
  receivedAt: string
  body: string
  unread: boolean
  /** True when the mail is addressed to the user personally (not a newsletter or notification). */
  personal: boolean
  todoId?: string
  noTodoReason?: string
  /** Sender's email address (real mailboxes only). */
  fromAddress?: string
  /** True once the full text has been fetched from the server. */
  bodyLoaded?: boolean
  /** Cleaned HTML with inline images embedded (absent for plain-text mails). */
  html?: string
  attachments?: { index: number; filename: string; contentType: string; size: number }[]
}

export interface Calendar {
  /** True when the colour is one you chose (endotitre), not the calendar's own. */
  ownColor?: boolean
  id: string
  accountId: AccountId
  name: string
  color: string
  readOnly?: boolean
  /** Added from the app: a subscription link or an uploaded .ics file */
  source?: 'url' | 'file'
  /** For a link: the server it comes from */
  host?: string
}

export interface CalendarEvent {
  id: string
  calendarId: string
  title: string
  start: string
  end: string
  allDay?: boolean
  location?: string
  description?: string
  tags?: string[]
  /** Part of a repeating event */
  recurring?: boolean
  /** The repeating event's rule */
  repeat?: Repeat
}

/** How an event repeats (custom = a rule the app shows but can't edit) */
export interface Repeat {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  until?: string
  count?: number
  custom?: boolean
  text: string
}

/** For a repeating event: just this occurrence, or the whole series */
export type EditScope = 'one' | 'all'

export interface Todo {
  id: string
  title: string
  done: boolean
  note?: string
  /** Set when replying to an email is part of this to-do. */
  mailId?: string
  /** Homework: the course (event occurrence) it's due for. */
  eventId?: string
  eventTitle?: string
  dueAt?: string
  tags?: string[]
  // ---- quest fields (server: quests.ts)
  estimateMin?: number
  timer?: boolean
  trackedSec?: number
  runningSince?: string
  goalMin?: number
  /** 0 Love it … 4 Ugh */
  want?: number
  repeat?: QuestRepeat
  repeatRun?: number
  doneAt?: string
  points?: number
  pointsDetail?: string
  earlyPoints?: number
  createdAt?: string
  updatedAt?: string
}

export interface QuestRepeat { kind: 'daily' | 'weekdays' | 'weekly' | 'monthly'; days?: number[] }

export interface QuestStats {
  days: { day: string; byTag: Record<string, number>; total: number }[]
  byTag: Record<string, { points: number; count: number }>
  count: number
  earlyBonus: number
  earlyCount: number
  ughCount: number
  ughPoints: number
  week: number
  prevWeek: number
  total: number
  level: number
  levelPoints: number
  streak: number
  today: number
}

/** Something the user can ask Claude about. */
export type AskTarget =
  | { kind: 'event'; event: CalendarEvent }
  | { kind: 'todo'; todo: Todo }
  | { kind: 'mail'; mail: Mail }
