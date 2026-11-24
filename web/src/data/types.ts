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
}

export interface Calendar {
  id: string
  accountId: AccountId
  name: string
  color: string
  readOnly?: boolean
}

export interface CalendarEvent {
  id: string
  calendarId: string
  title: string
  start: string
  end: string
  allDay?: boolean
  location?: string
}

export interface Todo {
  id: string
  title: string
  done: boolean
  note?: string
  /** Set when replying to an email is part of this to-do. */
  mailId?: string
}

/** Something the user can ask Claude about. */
export type AskTarget =
  | { kind: 'event'; event: CalendarEvent }
  | { kind: 'todo'; todo: Todo }
  | { kind: 'mail'; mail: Mail }
