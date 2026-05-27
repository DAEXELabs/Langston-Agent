let qcData = [];
let profileId = localStorage.getItem("langston_profile_id") || "";
let chatStore = { activeId: null, sessions: [] };

const $ = (id) => document.getElementById(id);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isHistoryOn() {
  return Boolean(profileId);
}

function encodeProfile(value) {
  return btoa(unescape(encodeURIComponent(value))).replace(/=+$/g, "");
}

function profileStorageKey() {
  return `langston_chat_history_${profileId}`;
}

function createSession(title = "New chat") {
  const now = new Date().toISOString();

  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    createdAt: now,
    updatedAt: now,
    messages: []
  };
}

function defaultStore() {
  const session = createSession();

  return {
    activeId: session.id,
    sessions: [session]
  };
}

function updateProfileView() {
  const historyOn = isHistoryOn();

  if ($("profileStatus")) {
    $("profileStatus").textContent = historyOn
      ? "History is on for this profile."
      : "Guest mode: chat works, history is off.";
  }

  if ($("profileLogin")) $("profileLogin").classList.toggle("hidden", historyOn);
  if ($("profileLogout")) $("profileLogout").classList.toggle("hidden", !historyOn);
}

function loadChatStore() {
  if (!isHistoryOn()) {
    chatStore = defaultStore();
    return;
  }

  try {
    chatStore = JSON.parse(localStorage.getItem(profileStorageKey()) || "null") || defaultStore();
  } catch {
    chatStore = defaultStore();
  }

  pruneEmptySessions();
  saveChatStore();
}

function saveChatStore() {
  if (!isHistoryOn()) return;
  localStorage.setItem(profileStorageKey(), JSON.stringify(chatStore));
}

function getActiveSession() {
  return chatStore.sessions.find((session) => session.id === chatStore.activeId);
}

function ensureActiveSession() {
  if (getActiveSession()) return;

  const session = createSession();
  chatStore.sessions.unshift(session);
  chatStore.activeId = session.id;
  saveChatStore();
}

function pruneEmptySessions() {
  const activeSession = getActiveSession();
  const keepActiveDraft = activeSession && activeSession.messages.length === 0 ? activeSession.id : null;

  chatStore.sessions = chatStore.sessions.filter(
    (session) => session.messages.length > 0 || session.id === keepActiveDraft
  );

  if (!chatStore.sessions.some((session) => session.id === chatStore.activeId)) {
    chatStore.activeId = chatStore.sessions[0]?.id || null;
  }
}

function titleFromPrompt(prompt) {
  const clean = prompt.replace(/\s+/g, " ").trim();
  return clean.length > 42 ? `${clean.slice(0, 39)}...` : clean || "New chat";
}

function setButtonLoading(button, loading, label) {
  if (loading) {
    button.dataset.label = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

function addMessage(role, content) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = content;

  $("chatLog").appendChild(div);
  $("chatLog").scrollTop = $("chatLog").scrollHeight;

  return div;
}

function persistMessage(role, content) {
  const session = getActiveSession();
  if (!session) return;

  session.messages.push({
    role,
    content,
    createdAt: new Date().toISOString()
  });

  if (role === "user" && session.title === "New chat") {
    session.title = titleFromPrompt(content);
  }

  session.updatedAt = new Date().toISOString();
  chatStore.sessions = [session, ...chatStore.sessions.filter((item) => item.id !== session.id)];
  chatStore.activeId = session.id;

  saveChatStore();
  renderHistory();
}

function renderHistory() {
  const list = $("historyList");
  list.replaceChildren();

  if (!isHistoryOn()) {
    const note = document.createElement("p");
    note.className = "history-note";
    note.textContent = "Turn on History Profile to save and reopen chats.";
    list.appendChild(note);
    return;
  }

  if (!chatStore.sessions.length) {
    const note = document.createElement("p");
    note.className = "history-note";
    note.textContent = "No saved chats yet.";
    list.appendChild(note);
    return;
  }

  chatStore.sessions.forEach((session) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `history-item${session.id === chatStore.activeId ? " active" : ""}`;
    button.textContent = session.title;

    button.addEventListener("click", () => {
      chatStore.activeId = session.id;
      saveChatStore();
      renderHistory();
      renderActiveChat();
    });

    list.appendChild(button);
  });
}

function renderActiveChat() {
  $("chatLog").replaceChildren();

  const session = getActiveSession();
  if (!session) return;

  session.messages.forEach((message) => addMessage(message.role, message.content));
}

function startNewChat() {
  const current = getActiveSession();

  if (current && current.messages.length === 0) {
    $("promptInput").focus();
    return;
  }

  const session = createSession();
  chatStore.sessions.unshift(session);
  chatStore.activeId = session.id;

  saveChatStore();
  renderHistory();
  renderActiveChat();

  $("promptInput").focus();
}

async function apiPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

async function askLangston(prompt) {
  const session = getActiveSession();

  const messages = (session?.messages || []).filter(
    (message) => !(message.role === "assistant" && message.content === "Thinking...")
  );

  return apiPost("/api/langston", {
    prompt,
    qcData,
    selectedDate: todayISO(),
    messages
  });
}

async function sendPrompt() {
  const prompt = $("promptInput").value.trim();
  if (!prompt) return;

  $("promptInput").value = "";

  addMessage("user", prompt);
  persistMessage("user", prompt);

  const assistant = addMessage("assistant", "Thinking...");
  persistMessage("assistant", "Thinking...");

  const button = $("sendPrompt");

  try {
    setButtonLoading(button, true, "Working");

    const data = await askLangston(prompt);

    if (Array.isArray(data.qcData)) {
      qcData = data.qcData;
    }

    assistant.textContent = data.answer;
  } catch (error) {
    assistant.textContent = `Error: ${error.message}`;
  } finally {
    const session = getActiveSession();

    if (session?.messages.length) {
      session.messages[session.messages.length - 1].content = assistant.textContent;
      session.updatedAt = new Date().toISOString();
      saveChatStore();
      renderHistory();
    }

    setButtonLoading(button, false);
  }
}

function turnOnHistory() {
  const name = $("profileName")?.value.trim() || "";
  const key = $("profileKey")?.value.trim() || "";

  if (!name || !key) {
    $("profileStatus").textContent = "Enter a name and profile key to turn on history.";
    return;
  }

  profileId = encodeProfile(`${name}:${key}`);
  localStorage.setItem("langston_profile_id", profileId);

  loadChatStore();
  ensureActiveSession();
  updateProfileView();
  renderHistory();
  renderActiveChat();
}

function turnOffHistory() {
  profileId = "";
  localStorage.removeItem("langston_profile_id");

  loadChatStore();
  ensureActiveSession();
  updateProfileView();
  renderHistory();
  renderActiveChat();
}

function initApp() {
  loadChatStore();
  ensureActiveSession();
  updateProfileView();
  renderHistory();
  renderActiveChat();

  $("promptInput").focus();
}

if ($("profileLogin")) {
  $("profileLogin").addEventListener("click", turnOnHistory);
}

if ($("profileLogout")) {
  $("profileLogout").addEventListener("click", turnOffHistory);
}

$("sendPrompt").addEventListener("click", sendPrompt);

$("promptInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendPrompt();
  }
});

$("newChat").addEventListener("click", startNewChat);

initApp();