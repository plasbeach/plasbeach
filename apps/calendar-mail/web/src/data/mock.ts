// Sample data used until the Pi backend is connected. Dates are relative to the current week
// so the screens always look populated.
import type { Account, Calendar, CalendarEvent, EventMeta, Mail, MailFolder, Tag, Todo } from './types'

export function startOfWeek(d = new Date()): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = (r.getDay() + 6) % 7 // Monday = 0
  r.setDate(r.getDate() - day)
  return r
}

function at(dayOffset: number, hours: number): string {
  const d = startOfWeek()
  d.setDate(d.getDate() + dayOffset)
  d.setMinutes(Math.round(hours * 60))
  return d.toISOString()
}

function ago(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString()
}

export const accounts: Account[] = [
  { id: 'personal', name: 'Personal', provider: 'google', color: '#6d3fd8' },
  { id: 'work', name: 'Work', provider: 'microsoft', color: '#0f766e' },
  { id: 'old', name: 'Old address', provider: 'imap', color: '#a16207' },
  { id: 'subscribed', name: 'Subscribed', provider: 'ics', color: '#a16207' },
]

export const folders: MailFolder[] = [
  { id: 'p-inbox', accountId: 'personal', name: 'Inbox', role: 'inbox' },
  { id: 'p-sent', accountId: 'personal', name: 'Sent', role: 'sent' },
  { id: 'p-drafts', accountId: 'personal', name: 'Drafts', role: 'drafts' },
  { id: 'p-archive', accountId: 'personal', name: 'Archive', role: 'archive' },
  { id: 'p-bills', accountId: 'personal', name: 'Bills' },
  { id: 'p-travel', accountId: 'personal', name: 'Travel' },
  { id: 'p-spam', accountId: 'personal', name: 'Spam', role: 'spam' },
  { id: 'p-trash', accountId: 'personal', name: 'Trash', role: 'trash' },
  { id: 'w-inbox', accountId: 'work', name: 'Inbox', role: 'inbox' },
  { id: 'w-sent', accountId: 'work', name: 'Sent', role: 'sent' },
  { id: 'w-archive', accountId: 'work', name: 'Archive', role: 'archive' },
  { id: 'w-projects', accountId: 'work', name: 'Projects' },
  { id: 'w-client-a', accountId: 'work', name: 'Client A', parentId: 'w-projects' },
  { id: 'w-client-b', accountId: 'work', name: 'Client B', parentId: 'w-projects' },
  { id: 'o-inbox', accountId: 'old', name: 'Inbox', role: 'inbox' },
  { id: 'o-archive', accountId: 'old', name: 'Archive', role: 'archive' },
]

export const mails: Mail[] = [
  { id: 'm1', accountId: 'work', folderId: 'w-inbox', from: 'Sam Lee', subject: 'Can we move Thursday?', receivedAt: ago(3), unread: true, personal: true, todoId: 't1',
    body: 'Hi,\n\nSomething came up on Thursday afternoon. Could we push our sync to Friday morning instead? Anything before 11 works for me.\n\nThanks, Sam' },
  { id: 'm2', accountId: 'personal', folderId: 'p-inbox', from: 'Bank', subject: 'Document needed', receivedAt: ago(4.5), unread: true, personal: true, todoId: 't2',
    body: 'Hello,\n\nPlease send us the signed form by Friday so we can complete your request.\n\nKind regards' },
  { id: 'm3', accountId: 'personal', folderId: 'p-inbox', from: 'Newsletter', subject: 'This week in design', receivedAt: ago(6), unread: false, personal: false, noTodoReason: 'newsletter',
    body: 'Our favourite links this week…' },
  { id: 'm4', accountId: 'work', folderId: 'w-inbox', from: 'Ana Ruiz', subject: 'Workshop slides for tomorrow', receivedAt: ago(6.3), unread: true, personal: true,
    body: 'Hi! Attached are the slides for tomorrow. Let me know if anything is missing.\n\nAna' },
  { id: 'm5', accountId: 'personal', folderId: 'p-inbox', from: 'Marie', subject: 'Weekend plans', receivedAt: ago(26), unread: false, personal: true, todoId: 't6',
    body: 'Hike on Saturday? Let me know by Thursday!' },
  { id: 'm6', accountId: 'personal', folderId: 'p-inbox', from: 'Landlord', subject: 'Heating repair', receivedAt: ago(28), unread: false, personal: true, todoId: 't3',
    body: 'Hello,\n\nWhich day would suit you for the technician to come by?\n\nBest regards' },
  { id: 'm7', accountId: 'old', folderId: 'o-inbox', from: 'Shop', subject: 'Your order has shipped', receivedAt: ago(50), unread: false, personal: false, noTodoReason: 'notification',
    body: 'Your parcel is on its way.' },
  { id: 'm8', accountId: 'personal', folderId: 'p-bills', from: 'Electricity', subject: 'November invoice', receivedAt: ago(52), unread: false, personal: false, body: 'Your invoice is available.' },
  { id: 'm9', accountId: 'personal', folderId: 'p-travel', from: 'SBB', subject: 'Your ticket to Geneva', receivedAt: ago(100), unread: false, personal: false, body: 'Your ticket is attached.' },
  { id: 'm10', accountId: 'work', folderId: 'w-client-a', from: 'Client A', subject: 'Signed proposal', receivedAt: ago(120), unread: false, personal: true, body: 'Please find the signed proposal attached.' },
  { id: 'm11', accountId: 'work', folderId: 'w-sent', from: 'To: Ana Ruiz', subject: 'Re: Workshop agenda', receivedAt: ago(140), unread: false, personal: true, body: 'Looks good to me.' },
  { id: 'm12', accountId: 'personal', folderId: 'p-drafts', from: 'Draft', subject: 'Re: Weekend plans', receivedAt: ago(160), unread: false, personal: true, body: '' },
]

export const calendars: Calendar[] = [
  { id: 'personal', accountId: 'personal', name: 'Personal', color: '#6d3fd8' },
  { id: 'sport', accountId: 'personal', name: 'Sport', color: '#c2410c' },
  { id: 'birthdays', accountId: 'personal', name: 'Birthdays', color: '#be185d' },
  { id: 'work', accountId: 'work', name: 'Work', color: '#0f766e' },
  { id: 'team', accountId: 'work', name: 'Team absences', color: '#475569' },
  { id: 'holidays', accountId: 'subscribed', name: 'Swiss holidays', color: '#a16207', readOnly: true },
]

const standups: CalendarEvent[] = [0, 1, 2, 3, 4].map((d) => ({
  id: `standup-${d}`, calendarId: 'work', title: 'Stand-up', start: at(d, 9.5), end: at(d, 9.75), location: 'Video call',
}))

export const events: CalendarEvent[] = [
  ...standups,
  { id: 'e1', calendarId: 'sport', title: 'Gym', start: at(0, 18.5), end: at(0, 19.5), location: 'Fitness park' },
  { id: 'e2', calendarId: 'personal', title: 'Lunch with Marie', start: at(1, 12), end: at(1, 13), location: 'Café on Rue Oberkampf' },
  { id: 'e3', calendarId: 'work', title: 'Design review', start: at(1, 14.5), end: at(1, 15.25), location: 'Video call' },
  { id: 'e4', calendarId: 'personal', title: 'Call with landlord', start: at(1, 16), end: at(1, 16.5), location: 'Phone' },
  { id: 'e5', calendarId: 'sport', title: 'Gym', start: at(1, 16), end: at(1, 17), location: 'Fitness park' },
  { id: 'e6', calendarId: 'work', title: 'Client workshop', start: at(2, 10), end: at(2, 12), location: 'Office, room 3' },
  { id: 'e7', calendarId: 'work', title: 'Sync with Sam', start: at(3, 15), end: at(3, 16), location: 'Video call' },
  { id: 'e8', calendarId: 'personal', title: 'Dinner, Paul & Ana', start: at(3, 19), end: at(3, 20), location: 'At home' },
  { id: 'e9', calendarId: 'personal', title: 'Dentist', start: at(4, 13), end: at(4, 14), location: 'Dr. Weber' },
  { id: 'e10', calendarId: 'sport', title: 'Gym', start: at(4, 18.5), end: at(4, 19.5), location: 'Fitness park' },
  { id: 'e11', calendarId: 'personal', title: 'Hike with Marie', start: at(5, 9), end: at(5, 13), location: 'Uetliberg' },
  { id: 'l1', calendarId: 'personal', title: 'Maths lesson', start: at(0, 10.5), end: at(0, 12), location: 'Room B12' },
  { id: 'l2', calendarId: 'personal', title: 'Maths lesson', start: at(3, 10.5), end: at(3, 12), location: 'Room B12' },
  { id: 'l3', calendarId: 'personal', title: 'Guitar lesson', start: at(2, 17), end: at(2, 18), location: 'Music school' },
  { id: 'l4', calendarId: 'personal', title: 'English course', start: at(4, 7.75), end: at(4, 9.25), location: 'Online' },
  { id: 'a1', calendarId: 'birthdays', title: 'Léa’s birthday', start: at(2, 0), end: at(3, 0), allDay: true },
  { id: 'a2', calendarId: 'team', title: 'Ana off', start: at(3, 0), end: at(5, 0), allDay: true },
  { id: 'a3', calendarId: 'holidays', title: 'Public holiday', start: at(6, 0), end: at(7, 0), allDay: true },
]

export const todos: Todo[] = [
  { id: 't1', title: 'Move the Thursday sync with Sam', done: false, mailId: 'm1', tagIds: ['work'] },
  { id: 't2', title: 'Send the signed form to the bank', done: false, mailId: 'm2', note: 'Due Friday', tagIds: ['admin'] },
  { id: 't3', title: 'Book the heating technician', done: false, mailId: 'm6', tagIds: ['home'] },
  { id: 't4', title: 'Buy a birthday gift for Léa', done: false, note: 'Before Saturday' },
  { id: 't5', title: 'Renew the Raspberry Pi SSL certificate', done: true },
  { id: 't6', title: 'Answer Marie about the weekend', done: false, mailId: 'm5' },
]

export const tags: Tag[] = [
  { id: 'lessons', name: 'Lessons', color: '#b45309', builtin: true },
  { id: 'work', name: 'Work', color: '#0f766e' },
  { id: 'admin', name: 'Admin', color: '#2563eb' },
  { id: 'home', name: 'Home', color: '#be185d' },
]

export const eventMeta: Record<string, EventMeta> = {
  l1: { tagIds: ['lessons'], homework: [{ id: 'h1', title: 'Exercises 4 to 9, page 52', done: true }, { id: 'h2', title: 'Revise chapter 3', done: false }] },
}
