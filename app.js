
const API_URL = "";
const AUTH_STORAGE_KEY = "skimsSupportAssistant_session_v1";
const STORAGE_KEY = "skimsSupportAssistant_ticketData_v2";
const THEME_STORAGE_KEY = "skimsSupportAssistant_theme_v1";

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.setAttribute("aria-label", isDark ? "Switch to normal mode" : "Switch to night mode");
    toggle.setAttribute("title", isDark ? "Switch to normal mode" : "Switch to night mode");
    toggle.setAttribute("aria-pressed", String(isDark));
    const icon = toggle.querySelector(".theme-toggle-icon");
    if (icon) icon.textContent = isDark ? "☾" : "☀";
  }
}

function initializeThemeToggle() {
  let savedTheme = "light";
  try {
    savedTheme = localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {}
  applyTheme(savedTheme);
  document.getElementById("themeToggle")?.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    try { localStorage.setItem(THEME_STORAGE_KEY, nextTheme); } catch {}
  });
}

initializeThemeToggle();

const ticketArea = document.getElementById("ticketArea");
const ticketNav = document.getElementById("ticketNav");
const template = document.getElementById("ticketTemplate");

const tickets = Array.from({ length: 5 }, (_, i) => ({
  id: i + 1,
  mode: "email",
  url: "",
  conversation: [],
  attachments: [],
  concern: "",
  resolution: "",
  output: "",
  chat: [],
  chatLoading: false,
  chatError: "",
  conversationExpanded: false,
  status: "empty",
  importStatus: "Paste the URL belonging to this ticket only.",
  collapsed: false,
  customerName: "",
  insight: null,
  insightChat: [],
  insightWindowLayout: {},
  insightOpen: false,
  insightChatOpen: false,
  insightUnread: false,
  insightLoading: false,
  insightChatLoading: false,
  insightError: "",
  insightChatError: "",
  insightStale: false,
  insightRequestId: 0,
  insightChatRequestId: 0
}));

let activeId = 1;
const selectedTicketIds = new Set();
let ticketSelectionMode = false;

const $ = (root, selector) => root.querySelector(selector);
const getTicket = id => tickets.find(t => t.id === id);
function deriveTicketCustomerLabel(data, messages, sourceUrl) {
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const usable = value => {
    const text = clean(value);
    return text && !/^(customer|unknown|new customer|guest|n\/a|null|undefined)$/i.test(text) ? text : "";
  };
  const suppliedName = usable(data && data.customerName);
  if (suppliedName) return suppliedName;
  const allMessages = Array.isArray(messages) ? messages : [];
  const customerMessages = allMessages.filter(message => {
    const sender = clean(message && (message.sender || message.author));
    const direction = clean(message && message.direction).toLowerCase();
    return direction === "in" || /customer|end user/i.test(sender);
  });
  const candidates = customerMessages.length ? customerMessages : allMessages;
  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  for (const message of candidates) {
    const direct = clean(message && (message.customerEmail || message.email));
    const match = direct.match(emailPattern) || clean(message && (message.text || message.body)).match(emailPattern);
    if (match) return match[0];
  }
  const phonePattern = /(?:\+?\d[\d().\s-]{7,}\d)/;
  for (const message of candidates) {
    const direct = clean(message && (message.customerPhone || message.phone));
    const match = direct.match(phonePattern) || clean(message && (message.text || message.body)).match(phonePattern);
    if (match) {
      const digits = match[0].replace(/\D/g, "");
      if (digits.length >= 8 && digits.length <= 15) return match[0].trim();
    }
  }
  try {
    const parsed = new URL(sourceUrl);
    for (const key of ["customerName", "name", "customer", "email", "phone"]) {
      const value = usable(parsed.searchParams.get(key));
      if (value) return value;
    }
  } catch {}
  for (const message of customerMessages) {
    const sender = usable(message && (message.sender || message.author));
    if (sender) return sender;
  }
  return "";
}



// =====================================
// SAVE AND RESTORE TICKET DATA
// =====================================

function saveTicketData() {
  try {
    const data = tickets.map(t => ({
      id: t.id,
      mode: t.mode,
      url: t.url,
      conversation: t.conversation,
      attachments: t.attachments,
      concern: t.concern,
      resolution: t.resolution,
      output: t.output,
      chat: t.chat,
      conversationExpanded: t.conversationExpanded,
      status: t.status,
      importStatus: t.importStatus,
      collapsed: t.collapsed,
      customerName: t.customerName,
      insight: t.insight,
      insightChat: t.insightChat,
      insightWindowLayout: t.insightWindowLayout || {},
      insightStale: t.insightStale,
      insightChatError: t.insightChatError
    }));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Unable to save ticket data:", error);
  }
}

function restoreTicketData() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    );

    if (!Array.isArray(saved)) return;

    saved.forEach(item => {
      const t = getTicket(Number(item.id));
      if (!t) return;

      t.mode = item.mode || "email";
      t.url = item.url || "";

      t.conversation = Array.isArray(item.conversation)
        ? item.conversation
        : [];

      t.attachments = Array.isArray(item.attachments)
        ? item.attachments
        : [];

      t.concern = item.concern || "";
      t.resolution = item.resolution || "";
      t.output = item.output || "";
      t.chat = Array.isArray(item.chat) ? item.chat : [];
      t.conversationExpanded = Boolean(item.conversationExpanded);
      t.status = item.status || "empty";

      t.importStatus = item.importStatus ||
        "Paste the URL belonging to this ticket only.";

      t.collapsed = Boolean(item.collapsed);
      t.customerName = item.customerName || "";
      t.insight = item.insight || null;
      t.insightWindowLayout = item.insightWindowLayout || {};

      t.insightChat = Array.isArray(item.insightChat)
        ? item.insightChat
        : [];

      t.insightStale = Boolean(item.insightStale);
      t.insightChatError = item.insightChatError || "";

      // Floating windows start closed after a page reload.
      t.insightOpen = false;
      t.insightChatOpen = false;

      if (t.concern.trim() && t.status === "empty") {
        t.status = "imported";
      }
    });

  } catch (error) {
    console.warn("Unable to restore ticket data:", error);
  }
}

restoreTicketData();

// Bulk ticket selection and deletion controls.
document.getElementById("toggleTicketSelection").addEventListener("click", () => {
  ticketSelectionMode = !ticketSelectionMode;
  if (!ticketSelectionMode) selectedTicketIds.clear();
  render();
});

document.getElementById("selectAllCheckbox").addEventListener("change", event => {
  selectedTicketIds.clear();
  if (event.target.checked) tickets.forEach(t => selectedTicketIds.add(t.id));
  render();
});

document.getElementById("deleteSelectedTickets").addEventListener("click", async () => {
  const ids = [...selectedTicketIds].sort((a, b) => a - b);
  if (!ids.length) return;

  const ticketNames = ids.map(id => `Ticket ${id}`).join(", ");
  if (!confirm(`Delete all data in ${ticketNames}? This removes their conversations, notes, drafts, and saved AI discussions.`)) {
    return;
  }

  selectedTicketIds.clear();
  await Promise.all(ids.map(async id => {
    await cancelTicketImport(id);
    resetTicketState(getTicket(id));
  }));

  saveTicketData();
  render();
});


// =====================================
// MAIN RENDER
// PRESERVES PAGE AND CHAT SCROLL
// =====================================

function resetTicketState(t) {
  t.insightRequestId++;
  t.insightChatRequestId++;

  Object.assign(t, {
    url: "",
    conversation: [],
    attachments: [],
    concern: "",
    resolution: "",
    output: "",
    chat: [],
    chatLoading: false,
    chatError: "",
    conversationExpanded: false,
    status: "empty",
    importStatus: "Paste the URL belonging to this ticket only.",
    collapsed: false,
    customerName: "",
    insight: null,
    insightChat: [],
    insightWindowLayout: {},
    insightOpen: false,
    insightChatOpen: false,
    insightUnread: false,
    insightLoading: false,
    insightChatLoading: false,
    insightError: "",
    insightChatError: "",
    insightStale: false
  });
}

async function cancelTicketImport(ticketId) {
  try {
    await apiPost("/import/cancel", { ticketId: String(ticketId) });
  } catch {}
}

function render(options = {}) {
  const previousPageX = window.scrollX;
  const previousPageY = window.scrollY;

  const previousInsight = document.querySelector(
    ".insight-popover:not([hidden])"
  );

  const previousChat = document.querySelector(
    ".insight-chat-popover:not([hidden])"
  );

  const previousMessages = document.querySelector(
    ".insight-chat-messages"
  );

  const previousInsightScroll = previousInsight
    ? previousInsight.scrollTop
    : 0;

  const previousChatScroll = previousChat
    ? previousChat.scrollTop
    : 0;

  const previousMessageScroll = previousMessages
    ? previousMessages.scrollTop
    : 0;

  const wasChatNearBottom = previousMessages
    ? previousMessages.scrollHeight -
      previousMessages.scrollTop -
      previousMessages.clientHeight < 80
    : true;

  ticketNav.replaceChildren();
  ticketArea.replaceChildren();

  const selectionToggle = document.getElementById("toggleTicketSelection");
  const selectionControls = document.getElementById("ticketSelectionControls");
  const selectAllLabel = document.getElementById("selectAllTickets");
  const selectAll = document.getElementById("selectAllCheckbox");
  selectionToggle.textContent = ticketSelectionMode ? "Done" : "Select";
  selectionToggle.setAttribute("aria-expanded", String(ticketSelectionMode));
  selectionControls.hidden = !ticketSelectionMode;
  const deleteSelected = document.getElementById("deleteSelectedTickets");
  const selectionCount = document.getElementById("selectionCount");
  selectAll.checked = selectedTicketIds.size === tickets.length;
  selectAll.indeterminate = selectedTicketIds.size > 0 &&
    selectedTicketIds.size < tickets.length;
  selectionCount.textContent = selectedTicketIds.size
    ? `${selectedTicketIds.size} selected`
    : "Select tickets to remove";
  deleteSelected.disabled = selectedTicketIds.size === 0;
  selectAllLabel.classList.toggle("has-selection", selectedTicketIds.size > 0);

  tickets.forEach(t => {
    const row = document.createElement("div");
    row.className = "ticket-nav-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "ticket-select-checkbox";
    checkbox.checked = selectedTicketIds.has(t.id);
    checkbox.hidden = !ticketSelectionMode;
    checkbox.setAttribute("aria-label", `Select Ticket ${t.id} for deletion`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedTicketIds.add(t.id);
      else selectedTicketIds.delete(t.id);
      render();
    });

    const nav = document.createElement("button");

    nav.className = t.id === activeId ? "active" : "";
    nav.classList.toggle("selected-for-delete", selectedTicketIds.has(t.id));

    const number = document.createElement("span");
    number.className = "ticket-number-badge";
    number.textContent = t.id;

    const label = document.createElement("span");
    label.className = "nav-label";

    const title = document.createElement("b");
    title.textContent = t.customerName || `Ticket ${t.id}`;

    const subtitle = document.createElement("small");

    subtitle.textContent =
      t.status === "imported" ? "Conversation imported" :
      t.status === "drafted" ? "Draft ready" :
      t.status === "pending" ? "Import in progress" :
      t.insightChat.length ? "AI discussion saved" :
      "Awaiting import";

    label.append(title, subtitle);

    const dot = document.createElement("i");
    dot.className =
      `nav-dot ${t.status !== "empty" ? "ready" : ""}`;

    nav.append(number, label, dot);

    nav.addEventListener("click", () => {
      activeId = t.id;
      render();
    });

    row.append(checkbox, nav);
    ticketNav.append(row);
  });

  document.getElementById("ticketCount").textContent =
    `${tickets.filter(t => t.status !== "empty").length} / 5`;

  const t = getTicket(activeId);
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".ticket-card");

  $(card, ".ticket-number").textContent = t.id;

  $(card, ".customer-title").textContent =
    t.customerName ? ` · ${t.customerName}` : " · New customer";

  $(card, ".status-chip").textContent =
    t.status === "empty" ? "Not imported" :
    t.status === "pending" ? "Importing…" :
    t.status === "imported" ? "Imported" :
    "Draft ready";

  if (t.status !== "empty") {
    $(card, ".status-chip").classList.add("imported");
  }

  $(card, ".import-status").textContent = t.importStatus || "";
  $(card, ".import-btn").disabled = t.status === "pending";

  $(card, ".conversation-url").value = t.url;
  $(card, ".customer-concern").value = t.concern;
  $(card, ".confirmed-resolution").value = t.resolution;
  $(card, ".generated-output").value = t.output;
  $(card, ".workspace-format").value = t.mode || "email";
  renderWorkspaceChat(card, t);

  card.classList.toggle("collapsed", t.collapsed);

  card.querySelectorAll(".format-option").forEach(b => {
    b.classList.toggle("selected", b.dataset.mode === t.mode);
  });


  // =====================================
  // CONVERSATION DISPLAY
  // =====================================

  if (t.conversation.length) {
    $(card, ".conversation-empty").hidden = true;

    const preview = $(card, ".conversation-preview");

    preview.hidden = false;
    preview.replaceChildren();
    preview.style.maxHeight = t.conversationExpanded ? "none" : "230px";
    preview.classList.toggle("is-expanded", t.conversationExpanded);

    $(card, ".view-conversation").textContent = t.conversationExpanded ? "Close full conversation" : "View full conversation";
    $(card, ".view-conversation").setAttribute("aria-expanded", String(t.conversationExpanded));
    const visibleMessages = t.conversationExpanded ? t.conversation : t.conversation.slice(-3);
    visibleMessages.forEach(m => {
      const row = document.createElement("div");
      const sender = String(m.sender || "Message");
      const isNote = /note/i.test(sender) || m.type === "note" || m.isNote === true;
      const isCustomer = /customer/i.test(sender) || m.direction === "in";
      row.className = "message-row " + (isNote ? "internal-note" : isCustomer ? "customer-message" : "agent-message");

      const strong = document.createElement("strong");
      strong.textContent = isNote ? "Internal note · Agent" : isCustomer ? "Customer" : "Agent";

      const time = document.createElement("small");
      time.className = "message-time";

      time.textContent = m.sentAt
        ? new Date(m.sentAt).toLocaleString()
        : "";

      const p = document.createElement("p");
      p.textContent = m.text || "(No message text available)";

      row.append(strong, time, p);

      (m.attachments || []).forEach(a => {
        if (a.url && /^image\//i.test(a.type || "")) {
          const imageLink = document.createElement("a");
          imageLink.className = "message-image-attachment";
          imageLink.href = a.url;
          imageLink.target = "_blank";
          imageLink.rel = "noopener noreferrer";
          const image = document.createElement("img");
          image.src = a.url;
          image.alt = a.name || "Conversation image";
          image.loading = "lazy";
          image.onerror = () => imageLink.replaceWith(document.createTextNode(a.name || "Image preview unavailable"));
          imageLink.append(image);
          row.append(imageLink);
        } else {
          const link = document.createElement("a");
          link.className = "message-attachment";
          link.textContent = "↗ " + (a.name || "Attachment");
          if (a.url) {
            link.href = a.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
          } else {
            link.href = "#";
            link.addEventListener("click", e => e.preventDefault());
          }
          row.append(link);
        }
      });

      preview.append(row);
    });
  }


  // =====================================
  // ATTACHMENT DISPLAY
  // =====================================

  if (t.attachments.length) {
    const list = $(card, ".attachment-list");

    list.hidden = !t.conversationExpanded;
    list.replaceChildren();

    t.attachments.forEach(a => {
      if (a.url && /^image\//i.test(a.type || "")) {
        const link = document.createElement("a");

        link.className = "attachment-preview";
        link.href = a.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.title = a.name || "View image";

        const img = document.createElement("img");

        img.src = a.url;
        img.alt = a.name || "Attachment preview";
        img.loading = "lazy";

        img.onerror = () => {
          link.replaceWith(
            document.createTextNode(
              a.name || "Image preview unavailable"
            )
          );
        };

        link.append(img);
        list.append(link);

      } else {
        const chip = document.createElement("a");

        chip.className = "attachment-chip";
        chip.textContent = `↗ ${a.name || "Attachment"}`;

        if (a.url) {
          chip.href = a.url;
          chip.target = "_blank";
          chip.rel = "noopener noreferrer";
        } else {
          chip.href = "#";
          chip.addEventListener("click", e => e.preventDefault());
        }

        list.append(chip);
      }
    });
  }


  // =====================================
  // DRAFTING DISPLAY
  // =====================================

  $(card, ".fix-btn").disabled = !t.output;
  $(card, ".copy-btn").disabled = !t.output;

  $(card, ".generate-btn").textContent =
    `Generate ${
      t.mode === "live_chat" ? "Live Chat" :
      t.mode === "sms" ? "SMS" : "Email"
    } response ✦`;


  // =====================================
  // AI INSIGHT AND SEPARATE CHAT
  // =====================================

  renderInsight(card, t);

	ticketArea.append(card);

	bindCard(card, t);

	// Keep the separate chat window aligned with AI Insight.
	syncInsightChatSize(card);

  // =====================================
  // RESTORE SCROLL AFTER DOM UPDATE
  // =====================================

  requestAnimationFrame(() => {
    if (t.id !== activeId) return;

    const newInsight = $(card, ".insight-popover");
    const newChat = $(card, ".insight-chat-popover");
    const newMessages = $(card, ".insight-chat-messages");

    if (newInsight && !newInsight.hidden) {
      newInsight.scrollTop = previousInsightScroll;
    }

    if (newChat && !newChat.hidden) {
      newChat.scrollTop = previousChatScroll;
    }

    if (newMessages) {
      if (options.scrollChatToBottom || wasChatNearBottom) {
        newMessages.scrollTop = newMessages.scrollHeight;
      } else {
        newMessages.scrollTop = previousMessageScroll;
      }
    }

    window.scrollTo(previousPageX, previousPageY);

    // After a new AI draft is ready, bring the latest workspace response
    // into view instead of leaving the page at its previous scroll position.
    if (options.scrollWorkspaceToLatest) {
      const latestWorkspaceTurn = $(card, ".workspace-chat-messages .workspace-chat-turn:last-of-type");
      if (latestWorkspaceTurn) {
        latestWorkspaceTurn.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    }

    if (options.focusChat) {
      const newInput = $(card, ".insight-chat-input");

      if (newInput && !newInput.disabled) {
        newInput.focus({ preventScroll: true });
      }
    }
  });
}


// =====================================
// RENDER CASE INSIGHT AND CHAT
// AS TWO INDEPENDENT WINDOWS
// =====================================

function renderInsight(card, t) {
  const launcher = $(card, ".insight-launcher");
  const insightPopover = $(card, ".insight-popover");
  const content = $(card, ".insight-content");
  const status = $(card, ".insight-status");
  const refresh = $(card, ".insight-refresh");
  const dot = $(card, ".insight-dot");

  const hasConversation =
    Boolean(t.concern.trim()) ||
    t.conversation.length > 0;

  applyFloatingWindowLayout(insightPopover, t.insightWindowLayout?.insight);

  launcher.hidden = !hasConversation;
  insightPopover.hidden = !t.insightOpen || !hasConversation;
  launcher.setAttribute("aria-expanded", String(t.insightOpen));
  dot.hidden = !t.insightUnread;

  content.replaceChildren();

  if (t.insight) {
    const sections = [
      ["SUMMARY", t.insight.summary],
      ["CUSTOMER'S MAIN CONCERN", t.insight.customerConcern],
      ["SUGGESTED RESOLUTION", t.insight.suggestedResolution]
    ];

    sections.forEach(([heading, value]) => {
      const item = document.createElement("div");
      item.className = "insight-item";
      const title = document.createElement("strong");
      title.textContent = heading;
      const paragraph = document.createElement("p");
      paragraph.textContent = value || "Not available.";
      item.append(title, paragraph);
      content.append(item);
    });
  } else {
    const welcome = document.createElement("div");
    welcome.className = "insight-welcome";
    const heading = document.createElement("strong");
    heading.textContent = "Your case insight will appear here";
    const paragraph = document.createElement("p");
    paragraph.textContent = "Import the full conversation to identify the customer's current concern and the most appropriate policy-based handling.";
    welcome.append(heading, paragraph);
    content.append(welcome);
  }

  if (t.insightLoading) {
    status.textContent = "Analyzing the customer conversation…";
    status.className = "insight-status";
  } else if (t.insightError) {
    status.textContent = t.insightError;
    status.className = "insight-status error";
  } else if (t.insightStale) {
    status.textContent = "Your conversation or agent notes have changed. Refresh the insight to update the case analysis.";
    status.className = "insight-status stale";
  } else if (t.insight) {
    status.textContent = "Case analysis available.";
    status.className = "insight-status";
  } else {
    status.textContent = hasConversation ? "Your case is ready for analysis." : "Waiting for conversation analysis.";
    status.className = "insight-status";
  }

  refresh.disabled = t.insightLoading;
  refresh.textContent = t.insightLoading ? "Analyzing…" : "↻ Refresh insight";
}

// =====================================
// SYNCHRONIZE FLOATING WINDOW HEIGHTS
// =====================================

// Floating windows now keep independent user-controlled dimensions.
// Retain this compatibility helper for existing render/resize calls.
function syncInsightChatSize() {
  // Intentionally no-op: do not overwrite the chat window's own size.
}

// The Insight launcher snaps to either viewport edge and stores a
// proportional vertical position so it stays in view at any window size.
function setupInsightLauncherDrag(card, ticket) {
  const launcher = $(card, ".insight-launcher");
  if (!launcher || launcher.dataset.dragReady) return;
  launcher.dataset.dragReady = "true";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const applyPosition = (side, topRatio) => {
    const ratio = clamp(Number(topRatio) || 0.5, 0.06, 0.94);
    const edge = 10;
    const rect = launcher.getBoundingClientRect();
    launcher.style.position = "fixed";
    launcher.style.top = clamp(ratio * window.innerHeight, rect.height / 2 + edge, window.innerHeight - rect.height / 2 - edge) + "px";
    launcher.style.bottom = "auto";
    launcher.style.transform = "translateY(-50%)";
    launcher.style.left = side === "left" ? edge + "px" : "auto";
    launcher.style.right = side === "right" ? edge + "px" : "auto";
    launcher.dataset.dockSide = side;
    launcher.dataset.topRatio = String(ratio);
  };

  const saved = ticket.insightWindowLayout?.launcher;
  if (saved && (saved.side === "left" || saved.side === "right")) {
    applyPosition(saved.side, saved.topRatio);
  } else if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
    // Migrate old pixel-based launcher positions to a responsive edge dock.
    const side = saved.left + launcher.offsetWidth / 2 < window.innerWidth / 2 ? "left" : "right";
    const ratio = saved.top / Math.max(1, window.innerHeight);
    applyPosition(side, ratio);
    ticket.insightWindowLayout.launcher = { side, topRatio: clamp(ratio, 0.06, 0.94) };
    saveTicketData();
  }

  let pointerStartX = 0;
  let pointerStartY = 0;
  let originLeft = 0;
  let originTop = 0;
  let moved = false;

  launcher.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const rect = launcher.getBoundingClientRect();
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    originLeft = rect.left;
    originTop = rect.top;
    moved = false;
    launcher.setPointerCapture(event.pointerId);
  });

  launcher.addEventListener("pointermove", event => {
    if (!launcher.hasPointerCapture(event.pointerId)) return;
    const dx = event.clientX - pointerStartX;
    const dy = event.clientY - pointerStartY;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    moved = true;
    const rect = launcher.getBoundingClientRect();
    const left = clamp(originLeft + dx, 8, window.innerWidth - rect.width - 8);
    const top = clamp(originTop + dy, 8, window.innerHeight - rect.height - 8);
    launcher.style.position = "fixed";
    launcher.style.left = left + "px";
    launcher.style.top = top + "px";
    launcher.style.right = "auto";
    launcher.style.bottom = "auto";
    launcher.style.transform = "none";
  });

  launcher.addEventListener("pointerup", event => {
    if (launcher.hasPointerCapture(event.pointerId)) launcher.releasePointerCapture(event.pointerId);
    if (!moved) return;
    const rect = launcher.getBoundingClientRect();
    const side = rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right";
    const ratio = clamp((rect.top + rect.height / 2) / Math.max(1, window.innerHeight), 0.06, 0.94);
    applyPosition(side, ratio);
    ticket.insightWindowLayout = ticket.insightWindowLayout || {};
    ticket.insightWindowLayout.launcher = { side, topRatio: ratio };
    saveTicketData();
    launcher.dataset.justDragged = "true";
    setTimeout(() => { delete launcher.dataset.justDragged; }, 180);
  });

  launcher.addEventListener("click", event => {
    if (launcher.dataset.justDragged === "true") {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener("resize", () => {
    const position = ticket.insightWindowLayout?.launcher;
    if (position && (position.side === "left" || position.side === "right") && launcher.isConnected) {
      applyPosition(position.side, position.topRatio);
    }
  });
}

// =====================================
// DRAGGABLE + RESIZABLE AI WINDOWS
// =====================================

function applyFloatingWindowLayout(panel, layout) {
  if (!panel || !layout) return;
  if (Number.isFinite(layout.height)) {
    panel.style.height = `${layout.height}px`;
  }
}

function setupFloatingWindowInteractions(card, ticket) {
  [
    { panel: ".insight-popover", key: "insight" }
  ].forEach(({ panel: selector, key }) => {
    const panel = $(card, selector);
    if (!panel || panel.dataset.resizeReady) return;
    panel.dataset.resizeReady = "true";

    if ("ResizeObserver" in window) {
      let lastHeight = 0;
      const observer = new ResizeObserver(() => {
        if (!panel.isConnected || panel.hidden) return;
        const height = Math.round(panel.getBoundingClientRect().height);
        if (!height || height === lastHeight) return;
        lastHeight = height;
        ticket.insightWindowLayout = ticket.insightWindowLayout || {};
        ticket.insightWindowLayout[key] = { height };
        saveTicketData();
      });
      observer.observe(panel);
    }
  });
}

// CARD EVENT HANDLERS
// =====================================

function bindCard(card, t) {
  setupFloatingWindowInteractions(card, t);
  setupInsightLauncherDrag(card, t);

  $(card, ".conversation-url").addEventListener("input", e => {
    t.url = e.target.value.trim();
    saveTicketData();
  });

  $(card, ".customer-concern").addEventListener("input", e => {
    t.concern = e.target.value;
    markInsightStale(t, card);
    saveTicketData();
  });

  $(card, ".confirmed-resolution").addEventListener("input", e => {
    t.resolution = e.target.value;
    markInsightStale(t, card);
    saveTicketData();
  });

  $(card, ".generated-output").addEventListener("input", e => {
    t.output = e.target.value;

    $(card, ".fix-btn").disabled = !t.output;
    $(card, ".copy-btn").disabled = !t.output;

    saveTicketData();
  });

  $(card, ".collapse-ticket").addEventListener("click", () => {
    t.collapsed = !t.collapsed;
    saveTicketData();
    render();
  });

  $(card, ".format-switch").addEventListener("click", e => {
    const b = e.target.closest("[data-mode]");

    if (!b) return;

    t.mode = b.dataset.mode;
    saveTicketData();
    render();
  });

  $(card, ".view-conversation").addEventListener("click", () => {
    t.conversationExpanded = !t.conversationExpanded;
    saveTicketData();
    render();
  });


  // =====================================
  // OPEN AND CLOSE MAIN AI INSIGHT
  // =====================================

  $(card, ".insight-launcher").addEventListener("click", () => {
    t.insightOpen = !t.insightOpen;

    if (t.insightOpen) {
      t.insightUnread = false;
    } else {
      // Closing the main insight also closes its chat window.
      t.insightChatOpen = false;
    }

    render();
  });

  $(card, ".insight-close").addEventListener("click", () => {
    t.insightOpen = false;
    t.insightChatOpen = false;
    saveTicketData();
    render();
  });


  // =====================================
  // REANALYZE CASE
  // =====================================

  $(card, ".insight-refresh").addEventListener("click", () => {
    generateInsight(t);
  });


  // =====================================
  // AI CHAT SEND
  // =====================================

  const chatInput = $(card, ".insight-chat-input");
  const sendButton = $(card, ".insight-send");

  sendButton.addEventListener("click", () => {
    sendInsightMessage(t, chatInput);
  });

  chatInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendInsightMessage(t, chatInput);
    }
  });


  // =====================================
  // IMPORT CONVERSATION
  // =====================================

  $(card, ".import-btn").addEventListener("click", async () => {
    const url = t.url.trim();
    const status = $(card, ".import-status");
    const button = $(card, ".import-btn");

    if (
      !/^https:\/\/[a-z0-9-]+\.kustomerapp\.com\/app\/customers\/[^/]+\/event\/[^/?#]+(?:[?#].*)?$/i.test(url)
    ) {
      status.textContent =
        "Please paste a valid Kustomer conversation URL for this ticket.";

      return;
    }

    if (
      (
        t.status !== "empty" ||
        t.conversation.length ||
        t.output ||
        t.concern ||
        t.resolution
      ) &&
      !confirm(
        `Replace Ticket ${t.id}'s current conversation, notes, and draft? This affects only Ticket ${t.id}.`
      )
    ) {
      return;
    }

    if (
      t.status !== "empty" ||
      t.conversation.length ||
      t.output ||
      t.concern ||
      t.resolution
    ) {
      t.insightRequestId++;
      t.insightChatRequestId++;

      Object.assign(t, {
        conversation: [],
        attachments: [],
        concern: "",
        resolution: "",
        output: "",
        chat: [],
        chatLoading: false,
        chatError: "",
        conversationExpanded: false,
        customerName: "",
        insight: null,
        insightChat: [],
        insightOpen: false,
        insightChatOpen: false,
        insightUnread: false,
        insightLoading: false,
        insightChatLoading: false,
        insightError: "",
        insightChatError: "",
        insightStale: false
      });

      saveTicketData();
    }

    const popup = window.open(url, "_blank");

    button.disabled = true;

    t.importStatus =
      "Creating a secure, one-time import request…";

    status.textContent = t.importStatus;

    try {
      await apiPost("/import/request", {
        ticketId: String(t.id),
        url
      });

      t.importStatus = popup
        ? "Kustomer opened in a new tab. On that tab, click your SKIMS Import bookmark to securely send the conversation to this website. Keep this page open while it imports."
        : "Open this Kustomer URL in another tab, then click your SKIMS Import bookmark. The bookmark sends the conversation directly to this hosted website.";

      t.status = "pending";

      saveTicketData();
      refreshNav();

      await waitForImport(t);

    } catch (e) {
      t.status = t.conversation.length
        ? "imported"
        : "empty";

      t.importStatus =
        `${e.message} Check your sign-in and connection, then try again.`;

      status.textContent = t.importStatus;

      saveTicketData();
      render();

      if (popup) {
        try {
          popup.close();
        } catch {}
      }

    } finally {
      button.disabled = false;
    }
  });


  // =====================================
  // EXISTING DRAFTING FEATURES
  // =====================================

  $(card, ".add-sizing-context").addEventListener("click", () => {
    const category = $(card, ".sizing-category").value;
    const product = $(card, ".sizing-product").value.trim();
    const usual = $(card, ".sizing-usual").value.trim();
    const unit = $(card, ".sizing-unit").value;
    const underbust = $(card, ".sizing-underbust").value.trim();
    const bust = $(card, ".sizing-bust").value.trim();
    const waist = $(card, ".sizing-waist").value.trim();
    const hips = $(card, ".sizing-hips").value.trim();
    const categoryLabel = {
      bra: "Bra / Bralette",
      shapewear: "Shapewear",
      clothing: "Clothing / Loungewear / Swim",
      bodysuit: "Bodysuit"
    }[category];
    if (!product && !usual && !underbust && !bust && !waist && !hips) {
      $(card, ".sizing-status").textContent = "Enter a product, usual size, or at least one measurement first.";
      return;
    }
    let customBraResult = "";
    if (category === "bra" && underbust && bust && unit === "in") {
      const u = Number(underbust), b = Number(bust), rounded = Math.round(u);
      if (Number.isFinite(u) && Number.isFinite(b) && u > 0 && b >= u && Math.abs(u-rounded) < 0.01) {
        const band = rounded + (rounded % 2 === 0 ? 2 : 3);
        const diff = Math.round((b-u)*10)/10;
        const cups = {1:"A",2:"B",3:"C",4:"D",5:"DD/E",6:"DDD/F",7:"DDDD/G",8:"DDDDD/H"};
        const cupKey = Math.round(diff);
        const cup = Math.abs(diff-cupKey)<0.01 ? cups[cupKey] : null;
        customBraResult = cup ? `\nOriginal internal bra formula result: ${band}${cup} (band ${band}; cup difference ${diff} in).` : `\nOriginal internal bra formula: band ${band}; cup difference ${diff} in does not map cleanly to the supplied chart. Do not state a definitive size.`;
      } else {
        customBraResult = "\nOriginal internal bra formula not applied: verify measurements; it requires a whole-number underbust and overbust at least as large as underbust.";
      }
    }
    const lines = [
      "SIZING / FIT CONTEXT (agent-supplied; use for this customer only):",
      `Product category: ${categoryLabel}`,
      product ? `Exact product/style: ${product}` : "",
      usual ? `Customer's usual size: ${usual}` : "",
      underbust ? `Underbust: ${underbust} ${unit}` : "",
      bust ? `Overbust / bust: ${bust} ${unit}` : "",
      waist ? `Waist: ${waist} ${unit}` : "",
      hips ? `Hips: ${hips} ${unit}` : "",
      customBraResult,
      "Fit guidance: SKIMS generally fits true to size. Start with the customer's usual size; for shapewear and clothing, compare the supplied measurements with the current official SKIMS size guide and the exact product/style chart. Do not automatically size down for compression. If measurements span sizes, a chart is unavailable, or fit varies by style, state the uncertainty and advise checking the product-specific chart. Never invent a size mapping or guarantee fit.",
      "Official reference: https://www.skims.com/pages/size-guides (shapewear: https://www.skims.com/pages/size-guides-shapewear)"
    ].filter(Boolean).join("\n");
    const existing = t.resolution.trim();
    if (existing.includes("SIZING / FIT CONTEXT (agent-supplied; use for this customer only):")) {
      t.resolution = existing.replace(/SIZING \/ FIT CONTEXT \(agent-supplied; use for this customer only\):[\s\S]*?(?=\n\n[A-Z][^\n]*:|$)/, lines);
    } else {
      t.resolution = existing ? existing + "\n\n" + lines : lines;
    }
    $(card, ".confirmed-resolution").value = t.resolution;
    markInsightStale(t, card);
    saveTicketData();
    $(card, ".sizing-status").textContent = "Sizing details added to this ticket's AI notes. Generate AI Insight or a response to use them.";
  });

  const workspaceInput = $(card, ".workspace-chat-input");
  const workspaceSend = $(card, ".workspace-send");
  const workspaceFormat = $(card, ".workspace-format");

  workspaceFormat.addEventListener("change", () => {
    t.mode = workspaceFormat.value;
    card.querySelectorAll(".format-option").forEach(b => b.classList.toggle("selected", b.dataset.mode === t.mode));
    saveTicketData();
  });

  workspaceSend.addEventListener("click", () => sendWorkspaceMessage(card, t));
  workspaceInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendWorkspaceMessage(card, t);
    }
  });

  $(card, ".expand-composer").addEventListener("click", () => {
    const expanded = workspaceInput.rows > 3;
    workspaceInput.rows = expanded ? 3 : 8;
    workspaceInput.focus();
  });

  $(card, ".workspace-fix-grammar").addEventListener("click", async event => {
    const command = workspaceInput.value.trim();
    if (!command || t.chatLoading) return;
    const button = event.currentTarget;
    button.disabled = true;
    statusForComposer(card, "Fixing grammar…");
    try {
      const data = await apiPost("/fix-grammar", { text: command });
      workspaceInput.value = data.email || data.response || data.text || command;
      statusForComposer(card, "Grammar corrected. Review your command before sending.");
    } catch (error) {
      statusForComposer(card, error.message || "Grammar correction failed.");
    } finally {
      button.disabled = false;
      workspaceInput.focus();
    }
  });

  $(card, ".generate-btn").addEventListener("click", () => {
    generateDraft(card, t);
  });

  $(card, ".fix-btn").addEventListener("click", () => {
    fixGrammar(card, t);
  });

  $(card, ".copy-btn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(t.output);

      $(card, ".draft-status").textContent =
        "Response copied.";

    } catch {
      $(card, ".draft-status").textContent =
        "Copy is unavailable in this browser context.";
    }
  });


  // =====================================
  // CLEAR TICKET
  // =====================================

  $(card, ".clear-btn").addEventListener("click", async () => {
    if (
      !confirm(
        `Clear Ticket ${t.id}? This removes this ticket's conversation, notes, and AI Workspace history.`
      )
    ) {
      return;
    }

    await cancelTicketImport(t.id);
    resetTicketState(t);
    selectedTicketIds.delete(t.id);

    saveTicketData();
    render();
  });
}


// =====================================
// CONVERSATIONAL DRAFTING WORKSPACE
// =====================================

function statusForComposer(card, message) {
  const status = $(card, ".workspace-chat-status");
  if (status) status.textContent = message || "";
}

function renderWorkspaceChat(card, t) {
  const host = $(card, ".workspace-chat-messages");
  const status = $(card, ".workspace-chat-status");
  const send = $(card, ".workspace-send");
  const input = $(card, ".workspace-chat-input");
  if (!host) return;
  host.replaceChildren();

  if (!t.chat.length) {
    const empty = document.createElement("div");
    empty.className = "workspace-chat-empty";
    empty.textContent = t.conversation.length
      ? "Your customer conversation is ready. Tell the AI what response you need."
      : "Start by importing a Kustomer conversation, then give your AI an instruction.";
    host.append(empty);
  }

  t.chat.forEach((message, index) => {
    const item = document.createElement("article");
    item.className = message.role === "user" ? "workspace-chat-turn user-turn" : "workspace-chat-turn assistant-turn";
    const label = document.createElement("div");
    label.className = "workspace-message-label";
    label.textContent = message.role === "user" ? "You" : "SKIMS AI";
    const body = document.createElement("div");
    body.className = "workspace-message-content";
    body.textContent = message.content || "";
    item.append(label, body);
    if (message.role === "assistant" && message.content) {
      const actions = document.createElement("div");
      actions.className = "workspace-message-actions";
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "workspace-copy";
      copy.title = "Copy response";
      const copyIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>';
      const copiedIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 12 4 4L19 6"></path></svg>';
      copy.setAttribute("aria-label", "Copy AI response");
      copy.innerHTML = copyIcon;
      let copyResetTimer;
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(message.content);
          copy.innerHTML = copiedIcon;
          copy.classList.add("is-copied");
          copy.title = "Copied";
          copy.setAttribute("aria-label", "Copied");
          clearTimeout(copyResetTimer);
          copyResetTimer = setTimeout(() => {
            if (!copy.isConnected) return;
            copy.innerHTML = copyIcon;
            copy.classList.remove("is-copied");
            copy.title = "Copy response";
            copy.setAttribute("aria-label", "Copy AI response");
          }, 1400);
        } catch {
          status.textContent = "Copy is unavailable in this browser context.";
        }
      });
      actions.append(copy);
      item.append(actions);
    }
    host.append(item);
  });

  if (t.chatLoading) {
    const typing = document.createElement("div");
    typing.className = "workspace-chat-typing";
    typing.textContent = "SKIMS AI is thinking…";
    host.append(typing);
  }
  status.textContent = t.chatError || "";
  send.disabled = t.chatLoading;
  send.textContent = t.chatLoading ? "Generating…" : "Send ↑";
  input.disabled = t.chatLoading;
  host.scrollTop = host.scrollHeight;
}

function classifyWorkspaceRequest(command) {
  const text = String(command || "").trim();
  const explicitlyRequestsDraft = /\\b(?:draft|write|compose|prepare|generate|create)\\b.{0,70}\\b(?:response|reply|email|message|customer|sms)\\b|\\b(?:rewrite|reword|revise|polish|shorten|expand|edit)\\b.{0,70}\\b(?:draft|response|reply|email|message|it|this|that)\\b|\\bmake (?:this|it) (?:warmer|friendlier|more professional|more empathetic|shorter|clearer)\\b/i.test(text);
  if (explicitlyRequestsDraft) return "draft";

  const internalDiscussion = /^(?:what|why|how|when|where|which|who|is|are|am|was|were|does|do|did|can|could|would|should|will|has|have|had)\\b|\\b(?:explain|compare|evaluate|analy[sz]e|assess|review|think through|help me understand|what other options|your recommendation|does this|is this|should we|what do you think)\\b/i.test(text)
    || /\\?\\s*$/.test(text);
  return internalDiscussion ? "discuss" : "draft";
}

async function sendWorkspaceMessage(card, t) {
  const input = $(card, ".workspace-chat-input");
  const command = input.value.trim();
  if (!command || t.chatLoading) return;

  if (!t.concern.trim()) {
    t.chatError = "Import the Kustomer conversation before asking the AI about this case.";
    statusForComposer(card, t.chatError);
    return;
  }

  t.mode = $(card, ".workspace-format").value || "none";
  t.chat.push({ role: "user", content: command, timestamp: Date.now() });
  t.chatLoading = true;
  t.chatError = "";
  input.value = "";
  saveTicketData();
  renderWorkspaceChat(card, t);

  const requestType = classifyWorkspaceRequest(command);
  const revisionRequest = /\\b(?:revise|rewrite|reword|edit|polish|shorten|expand|rework|change it|adjust it|make it (?:more|less|shorter|longer|warmer|friendlier|more professional|more empathetic)|the previous draft|the previous response|the last draft|the last response|your last response|your previous response|this draft|that draft|this response|that response)\\b/i.test(command);
  const previousDraft = revisionRequest
    ? [...t.chat.slice(0, -1)].reverse().find(m => m.role === "assistant" && !m.error)?.content || ""
    : "";

  try {
    let reply = "";

    if (requestType === "discuss") {
      const messages = t.chat
        .filter(m => ["user", "assistant"].includes(m.role) && typeof m.content === "string")
        .slice(-4)
        .map(m => ({ role: m.role, content: m.content }));

      const data = await apiPost("/insight-chat", {
        customerContext: t.concern,
        agentNotes: t.resolution,
        caseInsight: t.insight,
        messages
      });
      reply = data.reply || "";
    } else {
      const agentInstructions = [
        t.resolution ? "EXISTING AGENT NOTES / SIZING CONTEXT:\\n" + t.resolution.slice(-1800) : "",
        "CURRENT AGENT INSTRUCTION:",
        command,
        previousDraft ? "\\nPREVIOUS AI DRAFT TO USE AS CONTEXT (revise it only if the current instruction asks for a revision):\\n" + previousDraft.slice(-1600) : ""
      ].filter(Boolean).join("\\n");

      const data = await apiPost("/draft", {
        customerContext: t.concern,
        confirmedResolution: agentInstructions,
        caseInsight: t.insight || null,
        mode: t.mode
      });
      reply = data.email || data.response || "";
      if (reply.trim()) {
        t.output = reply;
        t.status = "drafted";
      }
    }

    if (!reply.trim()) throw new Error("The AI returned an empty response.");
    t.chat.push({ role: "assistant", content: reply, timestamp: Date.now() });
    t.chatError = "";
  } catch (error) {
    t.chatError = error.message || "Unable to process your message.";
    t.chat.push({ role: "assistant", content: "I couldn't complete that request: " + t.chatError, timestamp: Date.now(), error: true });
  } finally {
    t.chatLoading = false;
    saveTicketData();
    if (t.id === activeId) render({
      scrollChatToBottom: true,
      scrollWorkspaceToLatest: true
    });
    else refreshNav();
  }
}

// =====================================
// MARK INSIGHT AS OUTDATED
// =====================================

function markInsightStale(t, card) {
  if (!t.insight || !t.conversation.length) return;

  t.insightStale = true;

  const status = $(card, ".insight-status");

  if (status) {
    status.textContent =
      "Your case notes have changed. Reanalyze the case to update the recommendations.";

    status.className = "insight-status stale";
  }
}


// =====================================
// GENERATE OR REANALYZE AI INSIGHT
// =====================================

async function generateInsight(t) {
  if (!t.concern.trim()) {
    t.insightError = "Customer conversation is required.";
    t.insightOpen = true;

    if (t.id === activeId) render();

    return;
  }

  const requestId = ++t.insightRequestId;

  t.insightLoading = true;
  t.insightError = "";
  t.insightStale = false;
  t.insightOpen = false;
  t.insightUnread = false;

  saveTicketData();

  if (t.id === activeId) {
    render();
  }

  try {
    const data = await apiPost("/insight", {
      customerContext: t.concern,
      agentNotes: t.resolution
    });

    if (requestId !== t.insightRequestId) return;

    if (!data.insight || typeof data.insight !== "object") {
      throw new Error("The AI returned an invalid insight.");
    }

    // Update structured insight only.
    // Existing chat history and chat-window state remain untouched.
    t.insight = data.insight;
    t.insightError = "";
    t.insightStale = false;
    t.insightUnread = true;

  } catch (e) {
    if (requestId !== t.insightRequestId) return;

    t.insightError = /rate limit|tokens per minute|\b429\b/i.test(e.message || "")
      ? "The AI service is temporarily at its usage limit. Please wait about 10–15 seconds, then select Refresh insight. Your imported conversation is safe."
      : (e.message || "AI case analysis failed.");

  } finally {
    if (requestId === t.insightRequestId) {
      t.insightLoading = false;

      saveTicketData();

      if (t.id === activeId) {
        render({
          scrollChatToBottom: false
        });
      }
    }
  }
}


// =====================================
// API HELPERS
// =====================================

function showLogin(message = "") {
  const loginScreen = document.getElementById("loginScreen");
  const appShell = document.getElementById("appShell");
  const status = document.getElementById("loginStatus");
  if (loginScreen) loginScreen.hidden = false;
  if (appShell) appShell.hidden = true;
  if (status) {
    status.textContent = message;
    status.classList.toggle("success", false);
  }
  document.getElementById("accessPassword")?.focus();
}

function showWorkspace() {
  const loginScreen = document.getElementById("loginScreen");
  const appShell = document.getElementById("appShell");
  if (loginScreen) loginScreen.hidden = true;
  if (appShell) appShell.hidden = false;
}

async function submitLogin(password) {
  const response = await fetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.token) {
    throw new Error(data.error || "Unable to sign in. Please try again.");
  }
  sessionStorage.setItem(AUTH_STORAGE_KEY, data.token);

  // A fresh sign-in starts with a clean local workspace. Ticket data is
  // browser-local, so clear any previous agent's saved tickets on this device.
  localStorage.removeItem(STORAGE_KEY);

  // Reload so the in-memory ticket objects are recreated empty.
  window.location.reload();
}

async function initializeAuthentication() {
  const token = sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (!token) {
    showLogin();
    return;
  }

  try {
    const response = await fetch("/import/status?ticketId=1", {
      headers: { Authorization: "Bearer " + token }
    });
    if (response.ok) {
      showWorkspace();
      return;
    }
  } catch {}

  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  showLogin("Your sign-in has expired. Please sign in again.");
}

document.getElementById("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const input = document.getElementById("accessPassword");
  const button = document.getElementById("loginSubmit");
  const status = document.getElementById("loginStatus");
  const password = input.value;

  if (!password.trim()) {
    status.textContent = "Please enter your access password.";
    input.focus();
    return;
  }

  button.disabled = true;
  button.innerHTML = "<span>Signing in…</span><span aria-hidden=\"true\">→</span>";
  status.textContent = "";

  try {
    await submitLogin(password);
    input.value = "";
  } catch (error) {
    status.textContent = error.message || "Unable to sign in. Please try again.";
    input.focus();
  } finally {
    button.disabled = false;
    button.innerHTML = "<span>Sign in</span><span aria-hidden=\"true\">→</span>";
  }
});

document.getElementById("togglePassword")?.addEventListener("click", event => {
  const input = document.getElementById("accessPassword");
  const button = event.currentTarget;
  const reveal = input.type === "password";
  input.type = reveal ? "text" : "password";
  button.textContent = reveal ? "Hide" : "Show";
  button.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
  button.setAttribute("aria-pressed", String(reveal));
});

async function getAccessToken() {
  const token = sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (!token) {
    showLogin("Please sign in to continue.");
    throw new Error("Sign-in is required.");
  }
  return token;
}

async function authenticatedFetch(url, options = {}, retry = true) {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: "Bearer " + token }
  });

  if (response.status === 401) {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    showLogin("Your sign-in has expired. Please sign in again.");
    throw new Error("Your sign-in has expired. Please sign in again.");
  }
  return response;
}

async function apiGet(path) {
  const r = await authenticatedFetch(API_URL + path);
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || "The service returned an error.");
  return data;
}

async function apiPost(path, body) {
  const r = await authenticatedFetch(API_URL + path, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || "The drafting service returned an error.");
  return data;
}


// WAIT FOR KUSTOMER IMPORT
// =====================================

async function waitForImport(t) {
  const started = Date.now();

  while (Date.now() - started < 120000) {
    await new Promise(resolve => setTimeout(resolve, 1200));

    const result = await apiGet(
      `/import/status?ticketId=${t.id}`
    );

    if (result.status === "complete" && result.data) {
      const data = result.data;

      t.conversation = Array.isArray(data.messages)
        ? data.messages
        : [];

      t.attachments = Array.isArray(data.attachments)
        ? data.attachments
        : [];

      t.customerName = deriveTicketCustomerLabel(data, t.conversation, data.sourceUrl || t.url);
      t.status = "imported";

      const importedHistory = t.conversation.map(m => {
        const stamp = m.sentAt
          ? ` · ${new Date(m.sentAt).toLocaleString()}`
          : "";

        const subject = m.subject
          ? `\nSubject: ${m.subject}`
          : "";

        return `${m.sender || "Message"}${stamp}${subject}:\n${m.text || "(No message text available)"}`;
      }).join("\n\n");

      t.concern = t.concern.trim()
        ? `IMPORTED KUSTOMER CONVERSATION:\n${importedHistory}\n\nAGENT-ADDED CUSTOMER CONTEXT:\n${t.concern}`
        : importedHistory;

      // A newly imported conversation gets a fresh analysis
      // and fresh chat history for this ticket.
      t.insightRequestId++;
      t.insightChatRequestId++;

      t.insight = null;
      t.insightChat = [];
      t.insightOpen = false;
      t.insightChatOpen = false;
      t.insightUnread = false;
      t.insightLoading = false;
      t.insightChatLoading = false;
      t.insightError = "";
      t.insightChatError = "";
      t.insightStale = false;

      t.importStatus =
        `Imported ${t.conversation.length} messages and ${t.attachments.length} attachments. Review the conversation and confirm the intended resolution.`;

      saveTicketData();

      render();

      generateInsight(t);

      return;
    }

    if (result.status === "error") {
      throw new Error(
        result.error || "Kustomer import failed."
      );
    }
  }

  t.status = t.conversation.length
    ? "imported"
    : "empty";

  t.importStatus =
    "Import is still waiting. In the matching Kustomer tab, click your SKIMS Import bookmark. If the request has expired, start the import again from this website.";

  saveTicketData();
  render();
}


// =====================================
// GENERATE CUSTOMER RESPONSE
// =====================================

async function generateDraft(card, t) {
  const status = $(card, ".draft-status");
  const button = $(card, ".generate-btn");

  if (!t.concern.trim()) {
    status.textContent =
      "Add the customer's concern or import the conversation first.";

    return;
  }

  button.disabled = true;
  status.textContent = "Preparing your response…";

  try {
    const data = await apiPost("/draft", {
      customerContext: t.concern,
      confirmedResolution: t.resolution,
      mode: t.mode
    });

    t.output = data.email || data.response || "";
    t.status = "drafted";

    $(card, ".generated-output").value = t.output;
    $(card, ".fix-btn").disabled = !t.output;
    $(card, ".copy-btn").disabled = !t.output;

    status.textContent = t.output
      ? "Draft ready. Review the intended resolution and every factual detail before use."
      : "The AI returned an empty response.";

    saveTicketData();
    refreshNav();

  } catch (e) {
    status.textContent =
      `${e.message} Check your connection and the hosted drafting service.`;

  } finally {
    button.disabled = false;
  }
}


// =====================================
// FIX GRAMMAR
// =====================================

async function fixGrammar(card, t) {
  const status = $(card, ".draft-status");
  const button = $(card, ".fix-btn");

  if (!t.output.trim()) return;

  button.disabled = true;
  status.textContent = "Checking grammar…";

  try {
    const data = await apiPost("/fix-grammar", {
      text: t.output,
      mode: t.mode
    });

    t.output =
      data.email || data.response || data.text || "";

    $(card, ".generated-output").value = t.output;
    $(card, ".copy-btn").disabled = !t.output;

    saveTicketData();

    status.textContent =
      "Grammar updated. Please review the final response.";

  } catch (e) {
    status.textContent = e.message;

  } finally {
    button.disabled = false;
  }
}


// =====================================
// REFRESH NAVIGATION
// =====================================

function refreshNav() {
  render();
}


// =====================================
// COLLAPSE ACTIVE TICKET
// =====================================

document.getElementById("collapseAll").addEventListener("click", () => {
  const t = getTicket(activeId);

  t.collapsed = !t.collapsed;

  saveTicketData();
  render();
});


// =====================================
// INITIALIZE
// =====================================

render();


// Show the ticket workspace only after a valid sign-in.
initializeAuthentication();
