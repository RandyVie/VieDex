# KB

Personal knowledge base. Google Drive is the database, this app is a window onto it.
See `CLAUDE-VieDex.md` for the full brief and constraints.

## Run it

```bash
npm install
npm run demo     # in-memory fake Drive, no Google account needed
npm run dev      # real Drive, needs a client ID (below)
npm run build    # typecheck + production build into dist/
```

In demo mode, open the console to simulate edits made directly in Drive, then press Refresh:

```js
kbMock.editExternally('Welcome.md', 'Changed in Drive')
kbMock.addNote('notes', 'From Drive.md', '# Hello')
kbMock.remove('shopping-list.md')
```

## Google setup (one time, free)

1. Go to <https://console.cloud.google.com/> and create a project, e.g. "KB".
2. **APIs & Services > Library**: enable **Google Drive API**.
3. **APIs & Services > OAuth consent screen** (Google Auth Platform):
   - User type **External**, app name "KB", your email as support and developer contact.
   - Data access / scopes: add `https://www.googleapis.com/auth/drive`.
   - Audience: leave publishing status on **Testing** and add your own Google account as a **test user**.
4. **Clients > Create client**: type **Web application**.
   - Authorized JavaScript origins: `http://localhost:5173` and your Pages origin, e.g. `https://<user>.github.io`.
   - No redirect URIs needed (the token flow uses a popup).
5. Copy the client ID into `.env.local`:

   ```
   VITE_GOOGLE_CLIENT_ID=1234-abcd.apps.googleusercontent.com
   ```

On first sign-in Google shows "Google hasn't verified this app". That is expected for a testing-mode app: choose **Continue**.
Testing-mode consent lasts 7 days, after which Google asks you to sign in again.

## Deploy to GitHub Pages

Deploys are manual for now (the workflow does not run on push).

1. **Settings > Pages**: source **GitHub Actions**.
2. **Settings > Secrets and variables > Actions > Variables**: add `GOOGLE_CLIENT_ID`.
3. Add the Pages origin to the OAuth client's authorized origins (step 4 above).
4. **Actions > Deploy to GitHub Pages > Run workflow**.

## How it fits together

| Area | Where | Notes |
| --- | --- | --- |
| Drive access | `src/drive/` | The only module that talks to Drive. Every call is checked against the root folder. Retries, backoff and a 4-request concurrency limit live in `http.ts`. |
| Auth | `src/drive/auth.ts` | Google Identity Services token model. Token kept in `sessionStorage` for the tab, renewed silently when the browser allows, otherwise a "Reconnect" banner. |
| Index | `src/library/` | `_system/index.json` in Drive. Disposable: Settings > Rebuild index recreates it from the files. |
| Sync | `src/library/library.ts` | Drive Changes API with a stored page token, `modifiedTime` query as fallback. Runs on open, on Refresh, and when you come back to the tab after 2 minutes. |
| Markdown | `src/md/` | `marked` for parsing, own allow-list sanitizer, YAML frontmatter subset that keeps unknown keys and comments intact. |
| UI | `src/ui/` | No framework. Hash routes carry Drive IDs only, never titles or queries. |

Security: production builds ship a strict CSP (`vite.config.ts`); archived HTML is sanitized and shown in an `<iframe sandbox>` with scripts off.
