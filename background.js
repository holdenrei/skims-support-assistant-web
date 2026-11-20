
"use strict";

// =====================================
// SKIMS AUTOMATIC IMPORTER
// BACKGROUND SERVICE WORKER
// =====================================

const ALLOWED_WEBSITE_ORIGINS = [
  "http://127.0.0.1:8788",
  "http://localhost:8788"
];

const KUSTOMER_TAB_PATTERN =
  "https://*.kustomerapp.com/app/customers/*/event/*";


// =====================================
// VALIDATE WEBSITE REQUEST
// =====================================

function isAllowedWebsiteSender(sender) {
  try {
    const origin = new URL(sender.url).origin;

    return ALLOWED_WEBSITE_ORIGINS.includes(origin);
  } catch {
    return false;
  }
}


// =====================================
// FIND OPEN KUSTOMER CONVERSATION
// =====================================

async function findKustomerConversation() {
  const tabs = await chrome.tabs.query({
    url: KUSTOMER_TAB_PATTERN
  });

  const conversations = tabs.filter(tab => {
    if (!tab.url || !tab.id) return false;

    return /^https:\/\/[^.]+\.kustomerapp\.com\/app\/customers\/[^/]+\/event\/[^/?#]+(?:[?#].*)?$/i.test(
      tab.url
    );
  });

  if (!conversations.length) {
    throw new Error(
      "No open Kustomer conversation was found. Open the customer's conversation in Chrome first."
    );
  }

  if (conversations.length > 1) {
    throw new Error(
      "Multiple Kustomer conversations are open. Please leave only the intended customer conversation open, then try importing again."
    );
  }

  const tab = conversations[0];

  const match = tab.url.match(
    /^https:\/\/([^.]+)\.kustomerapp\.com\/app\/customers\/[^/]+\/event\/([^/?#]+)/i
  );

  if (!match) {
    throw new Error(
      "Unable to identify the Kustomer conversation."
    );
  }

  return {
    tabId: tab.id,
    subdomain: match[1],
    conversationId: match[2],
    sourceUrl:
      new URL(tab.url).origin +
      new URL(tab.url).pathname
  };
}


// =====================================
// FETCH KUSTOMER API
// =====================================

async function kustomerFetch(url) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    let detail = "";

    try {
      const data = await response.json();
      detail = data.message || data.error || "";
    } catch {}

    throw new Error(
      `Kustomer API returned HTTP ${response.status}` +
      (detail ? `: ${detail}` : "")
    );
  }

  return response.json();
}


// =====================================
// HTML TO PLAIN TEXT
// =====================================

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      return String.fromCodePoint(
        parseInt(code, 16)
      );
    })
    .replace(/&#([0-9]+);/gi, (_, code) => {
      return String.fromCodePoint(
        parseInt(code, 10)
      );
    });
}

function parseMessageText(message) {
  const attributes = message.attributes || {};

  const raw =
    attributes.htmlBody ||
    attributes.meta?.htmlBody ||
    attributes.body ||
    attributes.preview ||
    "";

  if (!raw) return "";

  return decodeHtmlEntities(
    String(raw)
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]*>/g, "")
  )
    .replace(/\r/g, "")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


// =====================================
// FETCH INDIVIDUAL MESSAGE DETAILS
// =====================================

async function fetchMessageDetails(api, message) {
  if (!message.id) return message;

  try {
    const result = await kustomerFetch(
      `${api}/v1/messages/${encodeURIComponent(message.id)}`
    );

    const details = result.data || message;

    details.relationships =
      details.relationships || {};

    const originalAttachments =
      message.relationships?.attachments;

    if (
      !details.relationships.attachments &&
      originalAttachments
    ) {
      details.relationships.attachments =
        originalAttachments;
    }

    return details;

  } catch (error) {
    console.warn(
      "Unable to retrieve additional message details:",
      message.id,
      error
    );

    return message;
  }
}


// =====================================
// FETCH ATTACHMENT INFORMATION
// =====================================

async function fetchMessageAttachments(
  api,
  message
) {
  const attachments =
    message.relationships?.attachments?.data || [];

  return Promise.all(
    attachments.map(async attachment => {
      try {
        const result = await kustomerFetch(
          `${api}/v1/messages/${encodeURIComponent(message.id)}` +
          `/attachments/${encodeURIComponent(attachment.id)}`
        );

        const data = result.data || {};
        const attributes = data.attributes || {};

        return {
          name: attributes.name || "Attachment",
          type:
            attributes.contentType ||
            "application/octet-stream",
          size: attributes.contentLength || 0,
          url: data.links?.related || null
        };

      } catch (error) {
        console.warn(
          "Unable to retrieve attachment information:",
          error
        );

        return {
          name: "Attachment unavailable",
          type: "unknown",
          size: 0,
          url: null,
          error: error.message
        };
      }
    })
  );
}


// =====================================
// IMPORT KUSTOMER CONVERSATION
// =====================================

async function importConversation() {
  const conversation =
    await findKustomerConversation();

  const api =
    `https://${conversation.subdomain}.api.kustomerapp.com`;

  // Retrieve conversation messages.
  const root = await kustomerFetch(
    `${api}/v1/conversations/` +
    `${encodeURIComponent(conversation.conversationId)}/messages`
  );

  const items = root.data;

  if (!Array.isArray(items) || !items.length) {
    throw new Error(
      "No messages were found in this Kustomer conversation."
    );
  }

  // Retrieve individual message details.
  const detailedMessages = await Promise.all(
    items.map(message =>
      fetchMessageDetails(api, message)
    )
  );

  // Sort messages chronologically.
  detailedMessages.sort((a, b) => {
    const first = new Date(
      a.attributes?.sentAt ||
      a.attributes?.createdAt ||
      0
    ).getTime();

    const second = new Date(
      b.attributes?.sentAt ||
      b.attributes?.createdAt ||
      0
    ).getTime();

    return first - second;
  });

  // Retrieve attachment information.
  const attachmentGroups = await Promise.all(
    detailedMessages.map(message =>
      fetchMessageAttachments(api, message)
    )
  );

  // Normalize messages for the website.
  const messages = detailedMessages.map(
    (message, index) => {
      const attributes = message.attributes || {};

      return {
        sender:
          attributes.direction === "in"
            ? "Customer"
            : attributes.direction === "out"
              ? "Agent"
              : "Message",

        direction: attributes.direction || "",

        sentAt:
          attributes.sentAt ||
          attributes.createdAt ||
          "",

        subject: attributes.subject || "",

        text: parseMessageText(message),

        attachments:
          attachmentGroups[index] || []
      };
    }
  );

  // Build a combined attachment list.
  const allAttachments = messages.flatMap(
    (message, index) =>
      message.attachments.map(attachment => ({
        ...attachment,
        messageIndex: index + 1,
        sender: message.sender
      }))
  );

  return {
    sourceUrl: conversation.sourceUrl,
    conversationId: conversation.conversationId,
    messages,
    attachments: allAttachments
  };
}


// =====================================
// EXTENSION MESSAGE HANDLER
// =====================================

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    if (
      !message ||
      message.type !== "SKIMS_IMPORT_CONVERSATION"
    ) {
      return false;
    }

    if (!isAllowedWebsiteSender(sender)) {
      sendResponse({
        ok: false,
        error: "Unauthorized website request."
      });

      return false;
    }

    const ticketId = String(
      message.ticketId || ""
    );

    if (!/^[1-5]$/.test(ticketId)) {
      sendResponse({
        ok: false,
        error: "A valid ticket number (1–5) is required."
      });

      return false;
    }

    importConversation()
      .then(result => {
        sendResponse({
          ok: true,
          ticketId,
          data: result
        });
      })
      .catch(error => {
        console.error(
          "SKIMS automatic import failed:",
          error
        );

        sendResponse({
          ok: false,
          error:
            error.message ||
            "Unable to import the Kustomer conversation."
        });
      });

    // Keep the message channel open for the async response.
    return true;
  }
);
