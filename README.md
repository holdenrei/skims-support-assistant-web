# SKIMS Support Assistant — Side-panel MVP

## Included
- Responsive SKIMS-inspired website designed for a narrow browser side panel.
- Five independent ticket workspaces. Each has its own Kustomer URL, concern, intended resolution, response format, and generated draft.
- Email, Live Chat, and SMS drafting through the existing Groq backend.
- Fix Grammar, Copy Response, independent collapse, and independent Clear Ticket.
- Ticket data is held in page memory only; refreshing/closing clears it.
- Read-only design: no Kustomer messages are sent and no Kustomer records are modified.

## Start locally
1. Put your existing private `.env` file inside `backend/`. Never share or commit this file.
2. Open this project folder and double-click `start-local.bat`.
3. The website opens at `http://127.0.0.1:8788`; the drafting API runs at `http://127.0.0.1:8787`.
4. If Windows blocks the batch file, open two terminals: run `node backend/server.js` in one and `node frontend-server.js` in the other, then open the website URL in Chrome.

## Kustomer conversation import
The project includes a local, read-only import bridge. A standalone website cannot read Kustomer's authenticated session from a pasted URL, so the import uses a separate bookmarklet click in the matching Kustomer tab.

1. Follow `KUSTOMER-IMPORT-SETUP.txt` to add `SKIMS-Import-Bookmarklet.txt` as a Chrome bookmark.
2. In a ticket, paste its Kustomer conversation URL and click **Import conversation**.
3. In the opened Kustomer tab, click the **SKIMS Import to Ticket** bookmark and enter the same ticket number (1–5).
4. The bookmarklet checks that the active conversation matches the URL registered for that ticket, then retrieves message history and attachment details using the already-authenticated Kustomer page session.
5. The website receives the conversation in that ticket only. The imported message history is prefilled into Customer Concern for drafting context.

The handoff uses a short-lived one-time token, expires after 10 minutes, and runs through the local backend at `127.0.0.1`. It does not send Kustomer cookies or passwords to the local backend. Imported handoff data is held in backend memory; restarting the backend clears it. Ticket workspaces themselves are held in page memory and are cleared when the website page is refreshed or closed.

**Browser-security limitation:** the bookmarklet must be clicked by the user in the Kustomer tab. A standalone website cannot silently execute code inside another site's tab. If Chrome or company policy blocks the localhost connection, do not bypass the control; ask IT whether this local handoff is permitted.

## Privacy
- The local import bridge runs on `127.0.0.1` and holds imported conversation handoffs in backend memory only. It does not save Kustomer cookies, passwords, or API tokens.
- Ticket workspace state is held in the open website page only; refreshing or closing the page clears it.
- Clicking **Generate** or **Fix Grammar** sends the relevant text to the configured Groq API through your local backend.
- Before using real customer data, confirm that the AI provider, browser bookmarklet, and localhost handoff are approved by your employer.
