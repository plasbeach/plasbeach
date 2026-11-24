const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

export const fmtTime = (iso: string) => time.format(new Date(iso))

export function fmtWhen(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return time.format(d)
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  if (now.getTime() - d.getTime() < 6 * 86400_000) return weekday.format(d)
  return dayMonth.format(d)
}

export function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString()
}
