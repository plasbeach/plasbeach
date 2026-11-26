// Email HTML made safe to show: no scripts, forms, frames or event handlers, only http(s)/mailto/tel links.
// Inline images ("cid:" parts, e.g. logos) become data: URLs so they show without another request.
// The web app also shows the result in a sandboxed iframe without scripts and with a strict CSP.
import sanitizeHtml from 'sanitize-html'
import type { Attachment } from 'mailparser'

const INLINE_MAX = 3 * 1024 * 1024 // per image
const INLINE_TOTAL = 12 * 1024 * 1024

export interface AttachmentInfo { index: number; filename: string; contentType: string; size: number }

/** Attachments worth listing: everything except the inline images the HTML already shows. */
export function listAttachments(atts: Attachment[], usedCids: Set<string>): AttachmentInfo[] {
  return atts
    .map((a, index) => ({ a, index }))
    .filter(({ a }) => !(a.contentId && usedCids.has(a.contentId.replace(/^<|>$/g, '')) && a.contentType.startsWith('image/')))
    .map(({ a, index }) => ({ index, filename: a.filename || `attachment-${index + 1}`, contentType: a.contentType, size: a.size }))
}

export function cleanEmailHtml(html: string, atts: Attachment[]): { html: string; usedCids: Set<string> } {
  const byCid = new Map<string, Attachment>()
  for (const a of atts) if (a.contentId) byCid.set(a.contentId.replace(/^<|>$/g, ''), a)
  const usedCids = new Set<string>()
  let total = 0
  const inline = (src: string) => {
    const m = /^cid:(.+)$/i.exec(src.trim())
    if (!m) return src
    const a = byCid.get(m[1])
    if (!a || !a.contentType.startsWith('image/') || a.size > INLINE_MAX || total + a.size > INLINE_TOTAL) return ''
    total += a.size
    usedCids.add(m[1])
    return `data:${a.contentType};base64,${a.content.toString('base64')}`
  }

  const clean = sanitizeHtml(html, {
    allowedTags: [
      'style', 'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'center', 'code', 'col', 'colgroup', 'dd', 'del', 'div', 'dl', 'dt',
      'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'small',
      'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'picture', 'source',
    ],
    allowedAttributes: {
      '*': ['style', 'class', 'id', 'align', 'valign', 'width', 'height', 'bgcolor', 'background', 'border', 'dir', 'lang', 'title', 'role'],
      a: ['href', 'name'],
      img: ['src', 'alt', 'width', 'height'],
      source: ['srcset', 'media', 'type'],
      font: ['face', 'size', 'color'],
      table: ['cellpadding', 'cellspacing', 'border', 'width', 'bgcolor'],
      td: ['colspan', 'rowspan', 'nowrap', 'width', 'bgcolor'],
      th: ['colspan', 'rowspan', 'nowrap', 'width', 'bgcolor'],
      col: ['span', 'width'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'data', 'cid'] },
    allowProtocolRelative: true,
    // <style> blocks keep newsletter layouts; they can't run anything inside the script-less iframe
    allowVulnerableTags: true,
    nonTextTags: ['script', 'textarea', 'option', 'noscript', 'title', 'head'],
    transformTags: {
      img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, ...(attribs.src ? { src: inline(attribs.src) } : {}) } }),
    },
  })
  return { html: clean, usedCids }
}
