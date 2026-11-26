import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Attachment } from 'mailparser'
import { cleanEmailHtml, listAttachments } from '../src/mailHtml.js'

const att = (o: Partial<Attachment>) => ({ contentType: 'image/png', size: 3, content: Buffer.from('png'), ...o }) as Attachment

test('email HTML: scripts, handlers, forms, frames and javascript: links are removed', () => {
  const { html } = cleanEmailHtml(`<p onclick="x()">Hi <a href="javascript:alert(1)">x</a> <a href="https://ok.ch">ok</a></p>
    <script>alert(1)</script><iframe src="https://evil"></iframe><form><input name=p></form><img src=x onerror=alert(1)>
    <style>p { color: red }</style><table bgcolor="#fff"><tr><td colspan="2">cell</td></tr></table>`, [])
  assert.doesNotMatch(html, /script|onclick|onerror|javascript:|iframe|<form|<input/i)
  assert.match(html, /href="https:\/\/ok.ch"/)
  assert.match(html, /<style>p \{ color: red \}<\/style>/)
  assert.match(html, /<td colspan="2">cell<\/td>/)
})

test('email HTML: inline cid images are embedded and not listed as attachments', () => {
  const atts = [att({ contentId: '<logo@x>', filename: 'logo.png' }), att({ filename: 'report.pdf', contentType: 'application/pdf' })]
  const { html, usedCids } = cleanEmailHtml('<img src="cid:logo@x" alt="Logo"><img src="https://cdn.example/a.png">', atts)
  assert.match(html, /src="data:image\/png;base64,cG5n"/)
  assert.match(html, /src="https:\/\/cdn.example\/a.png"/)
  assert.deepEqual(listAttachments(atts, usedCids).map((a) => a.filename), ['report.pdf'])
})
