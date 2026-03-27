# Keybindings Configuration Design

## Overview

Add a `keybindings.json` config file that lets users override default keybindings without modifying source code. Follows the VS Code-style array format. Changes hot-reload via the existing file-watcher mechanism.

## File Format

**Location:** `~/.config/waveterm/keybindings.json`

VS Code-style ordered array. Only overrides — defaults stay hardcoded in `keymodel.ts`.

```json
[
  { "key": "Cmd:Shift:t", "command": "tab:new" },
  { "key": null, "command": "-block:close" }
]
```

### Key Syntax Reference

The default `keybindings.json` file ships with a comment block (using `//` keys that are ignored by the parser) documenting the key syntax:

- **Modifiers:** `Cmd` (macOS Command / Windows-Linux Meta), `Ctrl`, `Shift`, `Alt` (macOS Option), `Meta`
- **Separators:** Modifiers and keys are joined with `:` (e.g. `Cmd:Shift:t`)
- **Special keys:** `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, `Escape`, `Enter`, `Tab`, `Backspace`, `Delete`, `Space`
- **Letter/number keys:** Lowercase letters (`a`–`z`), digits (`0`–`9`)
- **Punctuation:** Use the key name as printed (e.g. `[`, `]`, `/`, `.`, `,`)
- **Platform note:** `Cmd` maps to Command on macOS and Meta on Windows/Linux

Example default file content:
```json
[
  // Key syntax: "Modifier:Modifier:Key" — e.g. "Cmd:Shift:t", "Ctrl:ArrowUp"
  // Modifiers: Cmd (macOS) / Meta (Win/Linux), Ctrl, Shift, Alt (macOS Option)
  // Special keys: ArrowUp/Down/Left/Right, Home, End, Escape, Enter, Tab, Space, Backspace, Delete
  // Prefix command with "-" to unbind a default keybinding
]
```

### Conventions

- `command` uses namespaced action IDs (e.g. `tab:new`, `block:splitRight`)
- Prefix command with `-` to unbind a default (e.g. `"-block:close"`) — this is the canonical unbind form
- Setting `key` to `null` with a `-` prefixed command is equivalent (both forms are valid)
- Last entry wins for duplicate key combos
- Empty file or `[]` means all defaults apply

## Action ID Registry

Each hardcoded keybinding in `keymodel.ts` gets a stable string action ID. These are the contract between the config file and the runtime.

### Tab Actions
- `tab:new` — New tab (default: `Cmd:t`)
- `tab:close` — Close tab (default: `Cmd:Shift:w`)
- `tab:prev` — Previous tab (default: `Cmd:[`)
- `tab:next` — Next tab (default: `Cmd:]`)
- `tab:switchTo1`–`tab:switchTo9` — Switch to tab N (default: `Cmd:1`–`Cmd:9`)

### Block Actions
- `block:new` — New block (default: `Cmd:n`)
- `block:close` — Close block (default: `Cmd:w`)
- `block:splitRight` — Split right (default: `Cmd:d`)
- `block:splitDown` — Split below (default: `Cmd:Shift:d`)
- `block:magnify` — Magnify/unmagnify (default: `Cmd:m`)
- `block:refocus` — Refocus block (default: `Cmd:i`)
- `block:navUp`, `block:navDown`, `block:navLeft`, `block:navRight` — Navigate between blocks (default: `Ctrl:Shift:Arrow`)
- `block:switchTo1`–`block:switchTo9` — Switch to block N (default: `Ctrl:Shift:1`–`Ctrl:Shift:9`)
- `block:switchToAI` — Switch to AI panel (default: `Ctrl:Shift:0`)

### Chord Actions
- `block:splitChord` — Initiate split chord (default: `Ctrl:Shift:s`)
- `block:splitChordUp`, `block:splitChordDown`, `block:splitChordLeft`, `block:splitChordRight` — Split in direction after chord

### App Actions
- `app:toggleAIPanel` — Toggle AI panel visibility (default: `Cmd:Shift:a`)
- `app:openConnection` — Open connection switcher (default: `Cmd:g`)
- `app:search` — Find/search (default: `Cmd:f`)
- `app:refresh` — Refresh UI (default: `Cmd:Shift:r`)
- `app:newWindow` — New window (default: `Cmd:Shift:n`)

### Workspace Actions
- `workspace:switchTo1`–`workspace:switchTo9` — Switch to workspace N (default: `Cmd:Ctrl:1`–`Cmd:Ctrl:9`)

### Terminal-Specific Actions
- `term:clear` — Clear terminal (default: `Cmd:k`)
- `term:copy` — Copy (default: `Ctrl:Shift:c`)
- `term:paste` — Paste (default: `Ctrl:Shift:v`)
- `term:scrollToTop` — Scroll to top (default: `Shift:Home`)
- `term:scrollToBottom` — Scroll to bottom (default: `Shift:End`)
- `term:toggleMultiInput` — Toggle multi-input mode (default: `Ctrl:Shift:i`)

### Generic Actions
- `generic:cancel` — Cancel/close modals (default: `Escape`)

The exact list will be finalized during implementation by mapping every entry in `registerGlobalKeys()` to an ID. Any binding without an ID is not user-configurable.

## Frontend Merge & Resolution

### Location
New function in `keymodel.ts`, called during `registerGlobalKeys()` and on config updates.

### Merge Algorithm
1. Build the default map: `Map<string, { key: string, handler: Function }>` keyed by action ID
2. Read user overrides from the Jotai atom holding parsed `keybindings.json` content
3. Iterate user overrides in order (last wins):
   - If command starts with `-` or key is `null` → delete that action ID from the map
   - Otherwise → update the action ID's key combo in the map
4. Rebuild `globalKeyMap` and `globalChordMap` from the resolved map

### Re-registration Flow
- On app start: `registerGlobalKeys()` builds defaults, then applies overrides
- On config change: file-watcher pushes new content → Jotai atom updates → effect triggers re-registration by clearing and rebuilding both maps

### Error Handling
- Malformed JSON → log warning, keep current bindings
- Unknown action ID → skip with console warning
- Invalid key syntax → skip entry with console warning

## Backend Integration

### File Watching
The Go backend (`pkg/wconfig`) already watches the config directory. `keybindings.json` gets added to the watch list alongside other config files.

### Delivery
On file change, the backend reads raw JSON and pushes it to the frontend via the existing config update RPC mechanism. No parsing or validation on the Go side beyond valid JSON check.

### Default File
`pkg/wconfig/defaultconfig/keybindings.json` ships as `[]`. Created in the user's config directory on first run if it doesn't exist.

### Config UI
`keybindings.json` appears in the WaveConfig block's file sidebar alongside other config files, editable via the Monaco editor.

## Discoverability via Schema

### JSON Schema
`schema/keybindings.json` defines the array format, valid command IDs as an enum, and key format description. Monaco editor picks up the schema for autocomplete and inline validation.

### Documentation
Update `docs/docs/keybindings.mdx` to document the customization system: file location, format, action IDs, and examples (rebind, unbind, swap two keys).

## Conflict Resolution

Last entry wins. If a user binds the same key combo to multiple actions, the last entry in the array takes precedence.

## Decisions

- **Approach:** Pure frontend resolution — backend delivers raw JSON, frontend merges
- **File format:** VS Code-style ordered array of `{ key, command }` objects
- **Location:** `~/.config/waveterm/keybindings.json`
- **Unbinding:** Supported via `-` prefix on command or `null` key
- **Conflicts:** Last wins
- **Hot-reload:** Yes, via existing file-watcher
- **UI:** JSON editing in WaveConfig Monaco editor (no special keybinding-capture UI)
