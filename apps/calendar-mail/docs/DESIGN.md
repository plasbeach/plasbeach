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

## Tags and homework

- **Shared tags:** to-dos and calendar events use one tag list, stored on the Pi. You pick tags from a list instead of typing them. Typing filters the list, and Enter picks the best existing match. "Create" appears only when no tag has that name, so there are no near-duplicates.
- **Lessons** is a built-in tag that can't be deleted. Events tagged Lessons get a **Homework** list, where each item has an optional due date. Other events don't.
- **Automatic tagging:** events whose title looks like a lesson ("lesson", "class", "course", "lecture", "cours", "leçon", "Unterricht", …) are tagged Lessons automatically until you edit their tags. Adding homework confirms the tag. This switches to Claude-based tagging once the Claude API is connected.
- The to-do list can be filtered by tag, and a new to-do takes the tags picked in the form (or the active filter's tag).

## Theme

All colours are CSS variables in `web/src/styles/theme.css`. Light is the default, and `.dark` on `<html>` switches to the dark palette. Accent: `#6d3fd8` (purple). Fonts: Inter for the body, Space Grotesk for headings.
