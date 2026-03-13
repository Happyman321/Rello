# Rello

A Trello-like Roblox game development project organizer with:

- Multiple projects
- Card (kanban) and list views
- Default and custom card lists in board view
- Add-card buttons directly on each list for intuitive task creation
- Drag-and-drop card movement between lists
- Priority and completion tracking
- Dedicated bug tracking (`type=bug`, severity, reproduction steps)
- Rich text task descriptions (bold, italic, lists, images)
- Luau code block insertion with keyword highlighting
- Right-click context menu for quick task actions
- Persistent local storage (your projects/tasks remain when reopening)

## Run as desktop software (recommended)

1. Install dependencies:
   - `npm install`
2. Launch app:
   - `npm start`

This runs Rello in an Electron desktop window. Data is persisted by the app profile and restored when reopened.

## Run in a browser

- Open `index.html`, or
- `npm run start:web` then open `http://localhost:4173`
