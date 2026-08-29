# SecureVault frontend

Premium React + Vite frontend for the SecureVault password manager and personal data vault. The interface uses Tailwind CSS, Framer Motion, React Router, Axios, Lucide icons, and React Hot Toast.

## Run locally

1. Copy `.env.example` to `.env` and set `VITE_API_URL` to the Express API origin.
2. Run `npm install`.
3. Run `npm run dev`.

## Backend contract

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/vault`
- `POST /api/vault`
- `PUT /api/vault/:id`
- `DELETE /api/vault/:id`

Vault secrets are encrypted in the browser with AES-256-GCM. A key is derived from the master password with PBKDF2 and is kept only in memory for the current unlocked session. The API receives `encryptedData`, `iv`, and `tag`; it never receives plaintext usernames, passwords, or notes from this frontend.

## UI routes

- `/auth/login`
- `/auth/register`
- `/vault` (requires an unlocked in-memory session)
