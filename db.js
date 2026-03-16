import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/9.6.5/firebase-auth.js";
import {
  getDatabase,
  onValue,
  ref,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/9.6.5/firebase-database.js";
import {
  GOAL,
  RESET_COOLDOWN_MS,
  closeUsernameModal,
  elements,
  formatCooldown,
  formatNumber,
  normalizeUsername,
  openUsernameModal,
  readStoredUsername,
  renderLeaderboard,
  setInteractionEnabled,
  setUsernameError,
  spawnBurst,
  storeUsername,
  updateCounterDisplay,
  updateDeltaLabel,
  updatePlayerCount,
  updateResetDisplay,
  updateUserSummary,
  usernameToKey,
} from "./js.js";

const firebaseConfig = {
  apiKey: "AIzaSyDWP5VGAAnMownQewB1WNl4U7_q0Pu24jg",
  authDomain: "clickme1million-89d6e.firebaseapp.com",
  projectId: "clickme1million-89d6e",
  databaseURL:
    "https://clickme1million-89d6e-default-rtdb.europe-west1.firebasedatabase.app/",
  storageBucket: "clickme1million-89d6e.firebasestorage.app",
  messagingSenderId: "693270153434",
  appId: "1:693270153434:web:c01c3aaac371b079077de3",
  measurementId: "G-997K0CT424",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const rootRef = ref(db, "/");

let currentUsername = "";
let currentUid = "";
let stateCache = null;
let resetTimerId = 0;
let isSubmittingClick = false;
let isSubmittingReset = false;
let isAuthReady = false;

const initialState = {
  goal: GOAL,
  counter: 0,
  lastResetAt: 0,
  lastAction: {
    actor: "",
    type: "",
    timestamp: 0,
  },
  users: {},
};

bootstrap();

function bootstrap() {
  const storedUsername = normalizeUsername(readStoredUsername());
  bindEvents();
  subscribeToState();
  connectAuth();

  if (storedUsername) {
    claimUsername(storedUsername).then((claimed) => {
      if (!claimed) {
        currentUsername = "";
        openUsernameModal(storedUsername);
        setInteractionEnabled(false);
      }
    });
  } else {
    openUsernameModal();
    setInteractionEnabled(false);
  }
}

function connectAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUid = user.uid;
      isAuthReady = true;
      updateInteractionState();
      return;
    }

    isAuthReady = false;
    currentUid = "";
    setInteractionEnabled(false);
    updateDeltaLabel("Tengi vid Firebase...");

    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error("Anonymous sign-in failed", error);
      updateDeltaLabel(
        "Ekki tokst ad tengjast gagnagrunni. Athugadu hvort Anonymous Auth se virkt i Firebase.",
      );
    }
  });
}

function bindEvents() {
  elements.usernameForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const requestedName = normalizeUsername(elements.usernameInput.value);

    if (!isUsernameValid(requestedName)) {
      setUsernameError("Veldu nafn milli 2 og 20 stafa.");
      return;
    }

    elements.usernameInput.blur();
    setUsernameError("");

    const claimed = await claimUsername(requestedName);

    if (!claimed) {
      setUsernameError("Ekki tokst ad vista nafnid. Reyndu aftur.");
      return;
    }
  });

  elements.clickButton.addEventListener("click", async () => {
    if (!currentUsername || isSubmittingClick) {
      return;
    }

    isSubmittingClick = true;
    setInteractionEnabled(false);

    try {
      const success = await incrementCounter();

      if (success) {
        spawnBurst(elements.clickButton);
      }
    } finally {
      isSubmittingClick = false;
      updateInteractionState();
    }
  });

  elements.resetButton.addEventListener("click", async () => {
    if (!currentUsername || isSubmittingReset) {
      return;
    }

    const snapshot = stateCache || initialState;
    const currentUser = snapshot.users?.[usernameToKey(currentUsername)] || {};
    const waitMs = getResetCooldownRemaining(currentUser.lastResetAt || 0);

    if (waitMs > 0) {
      updateDeltaLabel(`Thu getur resetad eftir ${formatCooldown(waitMs)}.`);
      return;
    }

    isSubmittingReset = true;
    setInteractionEnabled(false);

    try {
      await resetCounter();
    } finally {
      isSubmittingReset = false;
      updateInteractionState();
    }
  });
}

function subscribeToState() {
  onValue(rootRef, (snapshot) => {
    const nextState = hydrateState(snapshot.val());
    stateCache = nextState;
    render(nextState);
  });
}

function hydrateState(rawValue) {
  if (typeof rawValue === "number") {
    return {
      ...initialState,
      counter: rawValue,
    };
  }

  if (
    rawValue &&
    typeof rawValue === "object" &&
    typeof rawValue.Counter === "number"
  ) {
    return {
      ...initialState,
      ...rawValue,
      counter: rawValue.counter ?? rawValue.Counter ?? 0,
      goal: rawValue.goal ?? GOAL,
      users: rawValue.users ?? {},
      lastResetAt: rawValue.lastResetAt ?? 0,
      lastAction: rawValue.lastAction ?? initialState.lastAction,
    };
  }

  return {
    ...initialState,
    ...(rawValue || {}),
    goal: rawValue?.goal ?? GOAL,
    counter: rawValue?.counter ?? 0,
    users: rawValue?.users ?? {},
    lastResetAt: rawValue?.lastResetAt ?? 0,
    lastAction: rawValue?.lastAction ?? initialState.lastAction,
  };
}

function render(state) {
  const users = Object.values(state.users || {}).sort((left, right) => {
    const clickDelta = (right.clicks || 0) - (left.clicks || 0);

    if (clickDelta !== 0) {
      return clickDelta;
    }

    return (left.joinedAt || 0) - (right.joinedAt || 0);
  });
  const currentUser = state.users?.[usernameToKey(currentUsername)] || {};
  const remaining = getResetCooldownRemaining(currentUser.lastResetAt || 0);

  updateCounterDisplay(state.counter || 0);
  updateUserSummary(currentUsername || "-", currentUser.clicks || 0);
  updateResetDisplay(state.lastResetAt || 0);
  updatePlayerCount(users.length);
  renderLeaderboard(users, currentUsername);
  updateInteractionState();
  updateGoalMessage(state);
  updateResetTimer(remaining);
}

function updateGoalMessage(state) {
  const lastAction = state.lastAction || {};

  if (!lastAction.timestamp) {
    updateDeltaLabel("Bidur eftir fyrsta klikkinu.");
    return;
  }

  if (lastAction.type === "reset") {
    updateDeltaLabel(`${lastAction.actor || "Einhver"} resetadi teljarann.`);
    return;
  }

  if ((state.counter || 0) >= GOAL) {
    updateDeltaLabel(
      "Markmidinu er nadi. Haldid samt afram ef thu vilt keyra yfir 1.000.000.",
    );
    return;
  }

  updateDeltaLabel(
    `${lastAction.actor || "Einhver"} baetti vid 1. ${formatNumber(
      Math.max(GOAL - (state.counter || 0), 0),
    )} eftir i markmid.`,
  );
}

function updateInteractionState() {
  if (
    !isAuthReady ||
    !currentUsername ||
    !stateCache ||
    isSubmittingClick ||
    isSubmittingReset
  ) {
    setInteractionEnabled(false);
    return;
  }

  const currentUser = stateCache.users?.[usernameToKey(currentUsername)] || {};
  const remaining = getResetCooldownRemaining(currentUser.lastResetAt || 0);

  elements.clickButton.disabled = false;
  elements.resetButton.disabled = remaining > 0;
}

function updateResetTimer(initialRemaining) {
  window.clearInterval(resetTimerId);
  elements.resetTimer.textContent = formatCooldown(initialRemaining);
  elements.resetButton.disabled =
    !currentUsername ||
    initialRemaining > 0 ||
    isSubmittingReset ||
    isSubmittingClick;

  resetTimerId = window.setInterval(() => {
    const currentUser =
      stateCache?.users?.[usernameToKey(currentUsername)] || {};
    const remaining = getResetCooldownRemaining(currentUser.lastResetAt || 0);

    elements.resetTimer.textContent = formatCooldown(remaining);
    elements.resetButton.disabled =
      !currentUsername ||
      remaining > 0 ||
      isSubmittingReset ||
      isSubmittingClick;
  }, 1000);
}

async function claimUsername(username) {
  if (!isAuthReady || !currentUid) {
    setUsernameError("Biddu andartak, er ad tengjast Firebase.");
    return false;
  }

  const userKey = usernameToKey(username);
  const now = Date.now();

  try {
    const result = await runTransaction(rootRef, (rawState) => {
      const state = hydrateState(rawState);
      const existingUser = state.users[userKey] || {};

      state.goal = state.goal || GOAL;
      state.counter = Number(state.counter || 0);
      state.users[userKey] = {
        name: username,
        uid: currentUid || existingUser.uid || "",
        clicks: Number(existingUser.clicks || 0),
        joinedAt: existingUser.joinedAt || now,
        lastSeenAt: now,
        lastClickAt: existingUser.lastClickAt || 0,
        lastResetAt: existingUser.lastResetAt || 0,
      };

      return state;
    });

    if (!result.committed) {
      return false;
    }

    currentUsername = username;
    storeUsername(username);
    closeUsernameModal();
    updateUserSummary(currentUsername, stateCache?.users?.[userKey]?.clicks || 0);
    elements.clickButton.disabled = false;
    updateResetTimer(
      getResetCooldownRemaining(stateCache?.users?.[userKey]?.lastResetAt || 0),
    );
    return true;
  } catch (error) {
    console.error("Username claim failed", error);
    return false;
  }
}

async function incrementCounter() {
  if (!isAuthReady || !currentUid) {
    updateDeltaLabel("Tenging ekki tilbun enn. Reyndu aftur eftir andartak.");
    return false;
  }

  const userKey = usernameToKey(currentUsername);
  const now = Date.now();

  try {
    const result = await runTransaction(rootRef, (rawState) => {
      const state = hydrateState(rawState);
      const existingUser = state.users[userKey] || {
        name: currentUsername,
        uid: currentUid,
        clicks: 0,
        joinedAt: now,
        lastResetAt: 0,
      };

      state.goal = state.goal || GOAL;
      state.counter = Number(state.counter || 0) + 1;
      state.lastAction = {
        actor: currentUsername,
        type: "click",
        timestamp: now,
      };
      state.users[userKey] = {
        ...existingUser,
        name: currentUsername,
        uid: currentUid || existingUser.uid || "",
        clicks: Number(existingUser.clicks || 0) + 1,
        joinedAt: existingUser.joinedAt || now,
        lastClickAt: now,
        lastSeenAt: now,
        lastResetAt: existingUser.lastResetAt || 0,
      };

      return state;
    });

    return result.committed;
  } catch (error) {
    console.error("Counter increment failed", error);
    updateDeltaLabel("Ekki tokst ad baeta vid smelli. Reyndu aftur.");
    return false;
  }
}

async function resetCounter() {
  if (!isAuthReady || !currentUid) {
    updateDeltaLabel("Tenging ekki tilbun enn. Reyndu aftur eftir andartak.");
    return false;
  }

  const userKey = usernameToKey(currentUsername);
  const now = Date.now();

  try {
    const result = await runTransaction(rootRef, (rawState) => {
      const state = hydrateState(rawState);
      const existingUser = state.users[userKey] || {
        name: currentUsername,
        uid: currentUid,
        clicks: 0,
        joinedAt: now,
        lastClickAt: 0,
      };
      const remaining = getResetCooldownRemaining(
        existingUser.lastResetAt || 0,
        now,
      );

      if (remaining > 0) {
        return;
      }

      state.goal = state.goal || GOAL;
      state.counter = 0;
      state.lastResetAt = now;
      state.lastAction = {
        actor: currentUsername,
        type: "reset",
        timestamp: now,
      };
      state.users[userKey] = {
        ...existingUser,
        name: currentUsername,
        uid: currentUid || existingUser.uid || "",
        clicks: Number(existingUser.clicks || 0),
        joinedAt: existingUser.joinedAt || now,
        lastSeenAt: now,
        lastClickAt: existingUser.lastClickAt || 0,
        lastResetAt: now,
      };

      return state;
    });

    if (!result.committed) {
      updateDeltaLabel("Reset tokst ekki. Reyndu aftur.");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Counter reset failed", error);
    updateDeltaLabel("Ekki tokst ad resetta teljarann.");
    return false;
  }
}

function getResetCooldownRemaining(lastResetAt, now = Date.now()) {
  return Math.max(RESET_COOLDOWN_MS - (now - lastResetAt), 0);
}

function isUsernameValid(username) {
  return username.length >= 2 && username.length <= 20;
}
