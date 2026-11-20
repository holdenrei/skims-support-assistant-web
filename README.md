# SKIMS Support Assistant Web

Private standalone SKIMS customer-support drafting workspace.

## Features
- Five independent ticket workspaces
- Email, Live Chat, and SMS drafting
- Grammar correction and response refinement
- AI conversation insights and insight chat
- Read-only Kustomer conversation and attachment import using the existing Kustomer API workflow
- Groq API calls stay on the server; the API key is never placed in browser code

## Render deployment
Create a **new Render Web Service** connected to this repository. Keep the separate Chrome-extension repository/service unchanged.

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Root directory: repository root

Set these Render environment variables:
- `GROQ_API_KEY`: Groq API key (secret)
- `GROQ_MODEL`: approved model available to your Groq account
- `APP_ACCESS_PASSWORD`: a strong private password you choose
- `APP_ORIGIN`: exact deployed origin, e.g. `https://skims-support-assistant-web.onrender.com`, without a trailing slash

The server listens on Render's `PORT`, binds to `0.0.0.0`, and serves both the website and API from this same service.

## Kustomer import bookmark
The importer reuses the existing Kustomer API workflow and sends data to the hosted Render service (not localhost). It is a browser bookmark, **not a locally installed Chrome extension**.

1. Open `SKIMS-Import-Bookmarklet.txt` in this repository.
2. Copy the entire one-line `javascript:` code.
3. Create a Chrome bookmark named **SKIMS Import to Ticket** and paste the code into its URL field.
4. In the SKIMS Support Assistant website, paste the exact Kustomer conversation URL into the selected ticket and click **Import conversation**.
5. In the Kustomer tab that opens, click **SKIMS Import to Ticket** in your bookmarks bar.
6. Keep the website open until the import completes.

The bookmark reads messages and attachment metadata through the signed-in Kustomer page session, then posts the normalized conversation to `https://skims-support-assistant-web.onrender.com` using a short-lived, single-use import token. It does not send Kustomer cookies or passwords to this app. The bookmark code is configured for this hosted URL; no local server or localhost address is needed.

## Security and limitations
- Never commit `.env`, API keys, passwords, cookies, or customer conversation exports.
- Website API endpoints require the private app password session. Import completion requires the one-time job token.
- Ticket conversations, notes, drafts, and insight history are saved in this browser's local storage until the user clears the ticket or browser site data. Do not use shared/public browser profiles.
- Import jobs and login sessions are held in server memory; a restart or redeploy clears them. Use one Render instance.
- The importer is read-only and does not send replies or modify Kustomer records.
- Confirm your employer permits the workflow and AI processing before using real customer data.

## Local development
Run `npm start` and open `http://127.0.0.1:8787`. Set `GROQ_API_KEY` and `APP_ACCESS_PASSWORD` in a local `.env` file. Never commit `.env`.
