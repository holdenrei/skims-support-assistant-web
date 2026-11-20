
"use strict";

// =====================================
// SKIMS WEBSITE ↔ EXTENSION BRIDGE
// =====================================

const ALLOWED_ORIGINS = [
  "http://127.0.0.1:8788",
  "http://localhost:8788"
];


// =====================================
// VERIFY WEBSITE CONTEXT
// =====================================

if (ALLOWED_ORIGINS.includes(location.origin)) {

  window.addEventListener("message", async event => {

    // Only accept messages from this website window.
    if (event.source !== window) return;

    if (event.origin !== location.origin) return;

    const request = event.data;

    if (
      !request ||
      request.source !== "SKIMS_SUPPORT_WEBSITE" ||
      request.type !== "IMPORT_CONVERSATION"
    ) {
      return;
    }

    const requestId = request.requestId;
    const ticketId = String(request.ticketId || "");

    if (!requestId) return;

    // Validate ticket number.
    if (!/^[1-5]$/.test(ticketId)) {
      window.postMessage({
        source: "SKIMS_SUPPORT_EXTENSION",
        type: "IMPORT_RESULT",
        requestId,
        ok: false,
        error: "A valid ticket number (1–5) is required."
      }, location.origin);

      return;
    }

    try {

      // Ask the extension background worker
      // to find and retrieve the Kustomer conversation.
      const result = await chrome.runtime.sendMessage({
        type: "SKIMS_IMPORT_CONVERSATION",
        ticketId
      });

      if (!result || !result.ok) {
        throw new Error(
          result?.error ||
          "The automatic importer did not return a response."
        );
      }

      // Return imported data to the website.
      window.postMessage({
        source: "SKIMS_SUPPORT_EXTENSION",
        type: "IMPORT_RESULT",
        requestId,
        ok: true,
        ticketId: result.ticketId,
        data: result.data
      }, location.origin);

    } catch (error) {

      window.postMessage({
        source: "SKIMS_SUPPORT_EXTENSION",
        type: "IMPORT_RESULT",
        requestId,
        ok: false,
        error:
          error.message ||
          "Unable to communicate with the SKIMS importer."
      }, location.origin);

    }

  });

}
