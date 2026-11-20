# SKIMS Support Assistant Web

Private standalone SKIMS customer-support drafting workspace.

## Features
- Five independent ticket workspaces
- Email, Live Chat, and SMS drafting
- Grammar correction and response refinement
- AI conversation insights and insight chat
- Read-only Kustomer conversation and attachment import through a user-run bookmarklet
- Groq API calls stay on the server; the API key is never placed in browser code

## Render deployment
Create a **new Render Web Service** connected to this repository. Keep the separate Chrome-extension repository/service unchanged.

- Runtime: Node
- Build command: leave blank
- Start command: `npm start`
- Root directory: repository root

Set these Render environment variables:
- `GROQ_API_KEY`: Groq API key (secret)
- `GROQ_MODEL`: approved model, such as `openai/gpt-oss-120b`
- `APP_ACCESS_PASSWORD`: a strong private password you choose
- `APP_ORIGIN`: exact deployed origin, e.g. `https://your-service.onrender.com`, without a trailing slash

The server listens on Render's `PORT`, binds to `0.0.0.0`, and serves both the website and API from the same service.

## Kustomer bookmarklet
After the new Render service has its final URL:
1. Replace the placeholder host in `SKIMS-Import-Bookmarklet.txt` with that exact URL.
2. Add the one-line code as a Chrome bookmark named **SKIMS Import to Ticket**.
3. In the website, paste a Kustomer conversation URL and choose Import conversation.
4. In the matching Kustomer tab, click the bookmarklet and wait for the import to finish.

The bookmarklet uses the authenticated Kustomer page session and a short-lived, single-use import token. It does not send Kustomer cookies or passwords to this app.

## Security and limitations
- Never commit `.env`, API keys, passwords, cookies, or customer conversation exports.
- Website API endpoints require the private app password session. Import completion requires the one-time job token.
- Ticket conversations, notes, drafts, and insight history are saved in this browser's local storage until the user clears the ticket or browser site data. Do not use shared/public browser profiles.
- Import jobs and login sessions are held in server memory; a restart or redeploy clears them. Use one Render instance.
- The importer is read-only and does not send replies or modify Kustomer records.
- Confirm your employer permits the workflow and AI processing before using real customer data.

## Local development
Run `npm start` and open `http://127.0.0.1:8787`. Set `GROQ_API_KEY` and `APP_ACCESS_PASSWORD` in a local `.env` file. Never commit `.env`.
