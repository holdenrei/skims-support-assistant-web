
const API_URL = "";
const AUTH_STORAGE_KEY = "skimsSupportAssistant_session_v1";
const STORAGE_KEY = "skimsSupportAssistant_ticketData_v2";

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
    title.textContent = `Ticket ${t.id}`;

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
    t.conversation.forEach(m => {
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

    list.hidden = false;
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

  const chatOpenButton = $(card, ".insight-chat-open");
  const chatPopover = $(card, ".insight-chat-popover");
  const chatMessages = $(card, ".insight-chat-messages");
  const input = $(card, ".insight-chat-input");
  const send = $(card, ".insight-send");
  const chatClose = $(card, ".insight-chat-close");
  const chatStatus = $(card, ".insight-chat-status");

  const hasConversation =
    Boolean(t.concern.trim()) ||
    t.conversation.length > 0 ||
    t.insightChat.length > 0;

  // Restore saved dimensions and position after each ticket rerender.
  applyFloatingWindowLayout(insightPopover, t.insightWindowLayout?.insight);
  applyFloatingWindowLayout(chatPopover, t.insightWindowLayout?.chat);

  // Main insight launcher and panel.
  launcher.hidden = !hasConversation;
  insightPopover.hidden =
    !t.insightOpen || !hasConversation;

  launcher.setAttribute(
    "aria-expanded",
    String(t.insightOpen)
  );

  dot.hidden = !t.insightUnread;

  // Chat can only be shown while the main insight is open.
  chatPopover.hidden =
    !t.insightOpen ||
    !t.insightChatOpen ||
    !hasConversation;


  // =====================================
  // STRUCTURED CASE INSIGHT
  // =====================================

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
    paragraph.textContent =
      "Import the full conversation to identify the customer's current concern and the most appropriate policy-based resolution.";

    welcome.append(heading, paragraph);
    content.append(welcome);
  }


  // =====================================
  // CHAT CONVERSATION MESSAGES
  // =====================================

  chatMessages.replaceChildren();

  t.insightChat.forEach(message => {
    const bubble = document.createElement("div");

    bubble.className =
      message.role === "user"
        ? "insight-message user"
        : "insight-message assistant";

    const paragraph = document.createElement("p");
    paragraph.className = "insight-message-text";
    paragraph.textContent = message.content || "";

    bubble.append(paragraph);
    chatMessages.append(bubble);
  });


  // =====================================
  // AI TYPING INDICATOR
  // =====================================

  if (t.insightChatLoading) {
    const typing = document.createElement("div");

    typing.className =
      "insight-message assistant insight-typing";

    const paragraph = document.createElement("p");
    paragraph.className = "insight-message-text";
    paragraph.textContent = "Thinking…";

    typing.append(paragraph);
    chatMessages.append(typing);
  }


  // =====================================
  // CHAT ERROR
  // =====================================

  chatStatus.textContent = t.insightChatError || "";
  chatStatus.hidden = !t.insightChatError;


  // =====================================
  // INSIGHT STATUS
  // =====================================

  if (t.insightLoading) {
    status.textContent =
      "Analyzing the customer conversation…";

    status.className = "insight-status";

  } else if (t.insightError) {
    status.textContent = t.insightError;
    status.className = "insight-status error";

  } else if (t.insightStale) {
    status.textContent =
      "Your conversation or agent notes have changed. Refresh the insight to update the case analysis.";

    status.className = "insight-status stale";

  } else if (t.insight) {
    status.textContent = "Case analysis available.";
    status.className = "insight-status";

  } else {
    status.textContent = hasConversation
      ? "Your case is ready for analysis."
      : "Waiting for conversation analysis.";

    status.className = "insight-status";
  }


  // =====================================
  // BUTTON STATES
  // =====================================

  refresh.disabled = t.insightLoading;

  refresh.textContent = t.insightLoading
    ? "Analyzing…"
    : "↻ Refresh insight";

  input.disabled = t.insightChatLoading;
  send.disabled = t.insightChatLoading;

  send.textContent = t.insightChatLoading
    ? "Sending…"
    : "Send ➤";

  chatOpenButton.disabled = !hasConversation;
}


// =====================================
// SYNCHRONIZE FLOATING WINDOW HEIGHTS
// =====================================

// Floating windows now keep independent user-controlled dimensions.
// Retain this compatibility helper for existing render/resize calls.
function syncInsightChatSize() {
  // Intentionally no-op: do not overwrite the chat window's own size.
}

// The Insight launcher can be moved anywhere within the viewport.
function setupInsightLauncherDrag(card, ticket) {
  const launcher = $(card, ".insight-launcher");
  if (!launcher || launcher.dataset.dragReady) return;
  launcher.dataset.dragReady = "true";
  const savedPosition = ticket.insightWindowLayout?.launcher;
  if (savedPosition && Number.isFinite(savedPosition.left) && Number.isFinite(savedPosition.top)) {
    launcher.style.position = "fixed";
    launcher.style.left = savedPosition.left + "px";
    launcher.style.top = savedPosition.top + "px";
    launcher.style.right = "auto";
    launcher.style.bottom = "auto";
  }
  let startX = 0, startY = 0, moved = false;

  launcher.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    startX = event.clientX;
    startY = event.clientY;
    moved = false;
    launcher.setPointerCapture(event.pointerId);
  });

  launcher.addEventListener("pointermove", event => {
    if (!launcher.hasPointerCapture(event.pointerId)) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    moved = true;
    const rect = launcher.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, rect.left + dx));
    const top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, rect.top + dy));
    ticket.insightWindowLayout = ticket.insightWindowLayout || {};
    ticket.insightWindowLayout.launcher = { left, top };
    launcher.style.position = "fixed";
    launcher.style.left = left + "px";
    launcher.style.top = top + "px";
    launcher.style.right = "auto";
    launcher.style.bottom = "auto";
    startX = event.clientX;
    startY = event.clientY;
  });

  launcher.addEventListener("pointerup", event => {
    if (launcher.hasPointerCapture(event.pointerId)) launcher.releasePointerCapture(event.pointerId);
    if (moved) {
      launcher.dataset.justDragged = "true";
      setTimeout(() => { delete launcher.dataset.justDragged; }, 180);
    }
  });
  launcher.addEventListener("click", event => {
    if (launcher.dataset.justDragged === "true") {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
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
    { panel: ".insight-popover", key: "insight" },
    { panel: ".insight-chat-popover", key: "chat" }
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
  // OPEN AND CLOSE SEPARATE AI CHAT
  // =====================================

  $(card, ".insight-chat-open").addEventListener("click", () => {
    if (!t.insightOpen) return;

    t.insightChatOpen = !t.insightChatOpen;
    t.insightChatError = "";

    render({
      scrollChatToBottom: true,
      focusChat: t.insightChatOpen
    });
  });

  $(card, ".insight-chat-close").addEventListener("click", () => {
    // Closing chat does not close the main insight.
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
        `Clear Ticket ${t.id}? This removes this ticket's conversation, notes, draft, and saved AI discussion.`
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
      copy.setAttribute("aria-label", "Copy AI response");
      copy.textContent = "▢";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(message.content);
          copy.textContent = "✓";
          copy.title = "Copied";
          setTimeout(() => { if (copy.isConnected) { copy.textContent = "▢"; copy.title = "Copy response"; } }, 1200);
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

async function sendWorkspaceMessage(card, t) {
  const input = $(card, ".workspace-chat-input");
  const status = $(card, ".workspace-chat-status");
  const command = input.value.trim();
  if (!command || t.chatLoading) return;

  if (!t.concern.trim()) {
    t.chatError = "Import the Kustomer conversation before asking the AI to draft a response.";
    status.textContent = t.chatError;
    return;
  }

  t.mode = $(card, ".workspace-format").value || "none";
  t.chat.push({ role: "user", content: command, timestamp: Date.now() });
  t.chatLoading = true;
  t.chatError = "";
  input.value = "";
  saveTicketData();
  renderWorkspaceChat(card, t);

  const previousDraft = [...t.chat].reverse().find(m => m.role === "assistant")?.content || "";
  const agentInstructions = [
    "CURRENT AGENT INSTRUCTION:",
    command,
    previousDraft ? "\nPREVIOUS AI DRAFT TO USE AS CONTEXT (revise it only if the current instruction asks for a revision):\n" + previousDraft : ""
  ].filter(Boolean).join("\n");

  try {
    const data = await apiPost("/draft", {
      customerContext: t.concern,
      confirmedResolution: agentInstructions,
      mode: t.mode
    });
    const reply = data.email || data.response || "";
    if (!reply.trim()) throw new Error("The AI returned an empty response.");
    t.output = reply;
    t.status = "drafted";
    t.chat.push({ role: "assistant", content: reply, timestamp: Date.now() });
    t.chatError = "";
    saveTicketData();
    refreshNav();
  } catch (error) {
    t.chatError = error.message || "Unable to generate a response.";
    t.chat.push({ role: "assistant", content: "I couldn't generate a response: " + t.chatError, timestamp: Date.now(), error: true });
    saveTicketData();
  } finally {
    t.chatLoading = false;
    saveTicketData();
    renderWorkspaceChat(card, t);
  }
}


// =====================================
// SEND MESSAGE TO AI CASE ASSISTANT
// =====================================

async function sendInsightMessage(t, input) {
  const message = input.value.trim();

  if (!message || t.insightChatLoading) return;

  if (!t.concern.trim()) {
    t.insightChatError =
      "Import or add the original customer conversation before chatting.";

    if (t.id === activeId) render();

    return;
  }

  const requestId = ++t.insightChatRequestId;

  t.insightChat.push({
    role: "user",
    content: message,
    timestamp: Date.now()
  });

  t.insightChatLoading = true;
  t.insightChatError = "";
  t.insightUnread = false;
  t.insightOpen = true;
  t.insightChatOpen = true;

  saveTicketData();

  // Render the new message in the separate chat window.
  if (t.id === activeId) {
    render({
      scrollChatToBottom: true,
      focusChat: false
    });
  }

  try {
    const messages = t.insightChat
      .filter(m =>
        ["user", "assistant"].includes(m.role) &&
        typeof m.content === "string"
      )
      .slice(-20)
      .map(m => ({
        role: m.role,
        content: m.content
      }));

    const data = await apiPost("/insight-chat", {
      customerContext: t.concern,
      agentNotes: t.resolution,
      caseInsight: t.insight,
      messages
    });

    // Ignore a response if this ticket was cleared or replaced.
    if (requestId !== t.insightChatRequestId) return;

    if (!data.reply || typeof data.reply !== "string") {
      throw new Error("The AI returned an empty reply.");
    }

    t.insightChat.push({
      role: "assistant",
      content: data.reply,
      timestamp: Date.now()
    });

    t.insightChatError = "";
    t.insightUnread = true;

  } catch (e) {
    if (requestId !== t.insightChatRequestId) return;

    t.insightChatError = /rate limit|tokens per minute|\b429\b/i.test(e.message || "")
      ? "The AI service is temporarily at its usage limit. Please wait about 10–15 seconds, then send your message again."
      : (e.message || "Unable to send your message to the AI assistant.");

  } finally {
    if (requestId === t.insightChatRequestId) {
      t.insightChatLoading = false;

      saveTicketData();

      if (t.id === activeId) {
        render({
          scrollChatToBottom: true,
          focusChat: true
        });
      } else {
        t.insightUnread = true;
        saveTicketData();
      }
    }
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

      t.customerName = data.customerName || "";
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
