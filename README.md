# SecureVault 2.0

SecureVault is a local-first password manager with browser-side AES-256-GCM encryption. Passwords, usernames, URLs, tags, and notes are encrypted before the API receives them; the vault key remains only in browser memory.

## Open the app without a terminal

Double-click **`Launch SecureVault.cmd`**. The launcher installs missing project packages, builds the interface, starts the local secure service in the background, and opens `http://127.0.0.1:5001`. Running it again simply opens the already-running app.

Double-click **`Stop SecureVault.cmd`** when you want to stop the background service. Your encrypted data remains in `task-manager-api/.data`.

Auto-start is enabled with **`Enable SecureVault Auto Start.cmd`**. After that, Windows starts the backend silently whenever you sign in, without opening the browser or a terminal. Use **`Disable SecureVault Auto Start.cmd`** if you ever want to turn this behavior off.

In VS Code, `Terminal → Run Task → SecureVault: Open application` does the same thing.

## Development

One command starts both the API (`5001`) and Vite (`5173`):

```powershell
bun install
bun run dev
```

Run all checks with `bun run check`.

## Included product features

- Client-side AES-256-GCM encryption with a PBKDF2-derived, memory-only key
- Zero-setup local API with revocable sessions, rate limits, owner isolation, and atomic storage
- Security Center for weak, reused, and aging passwords
- Automatic inactivity lock and timed clipboard clearing
- Favorites, tags, websites, seven vault categories, grid/list views, and smart sorting
- Encrypted `.svault` backup export/import with duplicate detection
- Keyboard shortcuts: `Ctrl/Cmd + K` or `/` to search, `N` for a new entry, `S` for Security Center
- Responsive interface, reduced-motion support, resilient error states, and API health feedback

## Security boundary

This is a strong local development architecture, not an independently audited commercial password manager. Back up `task-manager-api/.data` and your encrypted `.svault` exports. Losing the master password means losing access to encrypted entries by design.
