export const GOAL = 1000000;
export const RESET_COOLDOWN_MS = 60 * 60 * 1000;

export const elements = {
  clickButton: document.getElementById("button"),
  counter: document.getElementById("counter"),
  currentUser: document.getElementById("currentUser"),
  deltaLabel: document.getElementById("deltaLabel"),
  goalLabel: document.getElementById("goalLabel"),
  lastReset: document.getElementById("lastReset"),
  leaderboardList: document.getElementById("leaderboardList"),
  leaderboardTemplate: document.getElementById("leaderboardItemTemplate"),
  myClicks: document.getElementById("myClicks"),
  playerCount: document.getElementById("playerCount"),
  progressBarFill: document.getElementById("progressBarFill"),
  resetButton: document.getElementById("reset"),
  resetTimer: document.getElementById("resetTimer"),
  usernameError: document.getElementById("usernameError"),
  usernameForm: document.getElementById("usernameForm"),
  usernameInput: document.getElementById("usernameInput"),
  usernameModal: document.getElementById("usernameModal"),
};

export function formatNumber(value) {
  return new Intl.NumberFormat("is-IS").format(value);
}

export function formatRelativeDistance(timestamp) {
  if (!timestamp) {
    return "Never";
  }

  const delta = Date.now() - timestamp;

  if (delta < 60_000) {
    return "just now";
  }

  const minutes = Math.floor(delta / 60_000);

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatCooldown(msRemaining) {
  if (msRemaining <= 0) {
    return "Ready now";
  }

  const totalSeconds = Math.ceil(msRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function normalizeUsername(value) {
  return value.trim().replace(/\s+/g, " ");
}

export function usernameToKey(username) {
  return username.toLowerCase().replace(/[.#$/[\]]/g, "_");
}

export function readStoredUsername() {
  const localValue = localStorage.getItem("clickme-username");

  if (localValue) {
    return localValue;
  }

  const cookieMatch = document.cookie.match(/(?:^|;\s*)clickme_username=([^;]+)/);
  return cookieMatch ? decodeURIComponent(cookieMatch[1]) : "";
}

export function storeUsername(username) {
  localStorage.setItem("clickme-username", username);
  document.cookie = `clickme_username=${encodeURIComponent(username)}; max-age=31536000; path=/; SameSite=Lax`;
}

export function clearStoredUsername() {
  localStorage.removeItem("clickme-username");
  document.cookie = "clickme_username=; max-age=0; path=/; SameSite=Lax";
}

export function readOrCreateClientId() {
  const existing = localStorage.getItem("clickme-client-id");

  if (existing) {
    return existing;
  }

  const created =
    globalThis.crypto?.randomUUID?.() ||
    `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  localStorage.setItem("clickme-client-id", created);
  return created;
}

export function openUsernameModal(defaultValue = "") {
  elements.usernameModal.classList.add("is-open");
  elements.usernameModal.setAttribute("aria-hidden", "false");
  elements.usernameInput.value = defaultValue;
  elements.usernameInput.focus();
}

export function closeUsernameModal() {
  elements.usernameModal.classList.remove("is-open");
  elements.usernameModal.setAttribute("aria-hidden", "true");
  elements.usernameError.textContent = "";
}

export function setUsernameError(message) {
  elements.usernameError.textContent = message;
}

export function setInteractionEnabled(enabled) {
  elements.clickButton.disabled = !enabled;
  elements.resetButton.disabled = !enabled;
}

export function updateCounterDisplay(count) {
  elements.counter.textContent = formatNumber(count);
  elements.goalLabel.textContent = `${formatNumber(count)} / ${formatNumber(GOAL)}`;
  elements.progressBarFill.style.width = `${Math.min((count / GOAL) * 100, 100)}%`;
  elements.progressBarFill.parentElement.setAttribute("aria-valuenow", String(count));
}

export function updateUserSummary(username, myClicks) {
  elements.currentUser.textContent = username || "-";
  elements.myClicks.textContent = formatNumber(myClicks);
}

export function updateResetDisplay(lastResetAt) {
  elements.lastReset.textContent = formatRelativeDistance(lastResetAt);
}

export function updateDeltaLabel(message) {
  elements.deltaLabel.textContent = message;
}

export function updatePlayerCount(count) {
  elements.playerCount.textContent = `${formatNumber(count)} player${count === 1 ? "" : "s"}`;
}

export function renderLeaderboard(users, currentUsername) {
  elements.leaderboardList.innerHTML = "";

  if (!users.length) {
    const empty = document.createElement("li");
    empty.className = "leaderboard-item";
    empty.textContent = "No players on the board yet.";
    elements.leaderboardList.appendChild(empty);
    return;
  }

  users.forEach((user, index) => {
    const node = elements.leaderboardTemplate.content.firstElementChild.cloneNode(true);

    if (user.name === currentUsername) {
      node.classList.add("is-current");
    }

    node.querySelector(".leaderboard-rank").textContent = `#${index + 1}`;
    node.querySelector(".leaderboard-name").textContent = user.name;
    node.querySelector(".leaderboard-meta").textContent =
      user.lastClickAt ? `Last active ${formatRelativeDistance(user.lastClickAt)}` : "No clicks yet";
    node.querySelector(".leaderboard-score").textContent = formatNumber(user.clicks || 0);

    elements.leaderboardList.appendChild(node);
  });
}

export function spawnBurst(sourceElement) {
  const rect = sourceElement.getBoundingClientRect();
  const burst = document.createElement("div");
  burst.className = "burst";
  burst.textContent = "+1";
  burst.style.left = `${rect.left + rect.width / 2}px`;
  burst.style.top = `${rect.top + rect.height / 2}px`;
  document.body.appendChild(burst);

  window.setTimeout(() => {
    burst.remove();
  }, 700);
}

if (typeof document !== "undefined") {
  document.addEventListener("pointermove", (event) => {
    document.body.style.setProperty("--cursor-x", `${event.clientX}px`);
    document.body.style.setProperty("--cursor-y", `${event.clientY}px`);
  });
}
