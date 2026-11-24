# Design notes

Design canvas: https://claude.ai/artifact/7kSraonppfiMCzifcJCUpJ. It's private to the project owner.

## Screens

- **Today:** greeting, Claude briefing banner, today's schedule, to-do list, Ask Claude box.
- **Mail:** "All inboxes" and "Linked to to-dos" at the top, then one section per mailbox with its folders (nested folders are indented). Each message has a left stripe in its mailbox colour. Messages are tagged "In your to-dos" or "No to-do · newsletter/notification".
- **Calendar:** week or day grid, a mini month, and calendars grouped by account with on/off toggles. Selecting an event opens a details panel with Ask Claude.

## Product rules

- Replying to an email is one kind of to-do. A to-do can link to the email it came from.
- Claude adds an email to-do automatically only when the email is really addressed to the user.
- Clicking any meeting, to-do or email focuses the Ask Claude panel on that item, with suggested actions and a free-text box.

## Theme

All colours are CSS variables in `web/src/styles/theme.css`. Light is the default, and `.dark` on `<html>` switches to the dark palette. Accent: `#6d3fd8` (purple). Fonts: Inter for the body, Space Grotesk for headings.
