const stickyApiUrl = "https://api.lohj.me";
const stickyPlaceholders = [
  "Write something...",
  "Write something nice...",
  "blah blah blah",
  "How are you doing?",
  "What's your name?",
  "Type something...",
  "Please don't spam...",
];

const stickyForm = document.querySelector("#sticky-form");
const stickyContent = document.querySelector("#sticky-content");
const stickyCount = document.querySelector("#sticky-count");
const stickyStatus = document.querySelector("#sticky-status");
const stickyList = document.querySelector("#sticky-list");
const stickySubmit = stickyForm.querySelector("button[type=submit]");

stickyContent.placeholder =
  stickyPlaceholders[Math.floor(Math.random() * stickyPlaceholders.length)];

function updateStickyCount() {
  stickyCount.textContent = `${stickyContent.value.length} / ${stickyContent.maxLength}`;
}

function setStickyStatus(message, isError = false) {
  stickyStatus.textContent = message;
  stickyStatus.dataset.error = isError ? "true" : "false";
}

function formatStickyTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return "";
  }

  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
}

function renderStickyState(message, isError = false) {
  const state = document.createElement("p");
  state.className = `sticky-state${isError ? " sticky-state-error" : ""}`;
  state.textContent = message;
  stickyList.replaceChildren(stickyForm, state);
}

function renderStickys(stickys) {
  const notes = Array.isArray(stickys) ? stickys : [];

  if (notes.length === 0) {
    renderStickyState("No stickys yet. Leave the first note.");
    return;
  }

  stickyList.replaceChildren(stickyForm);

  for (const { content: text = "", time } of notes) {
    const note = document.createElement("article");
    note.className = "sticky-note";

    const content = document.createElement("p");
    content.className = "sticky-note-content";
    content.textContent = text;
    note.append(content);

    const formattedTime = formatStickyTime(time);

    if (formattedTime) {
      const timestamp = document.createElement("time");
      timestamp.className = "sticky-note-time";
      timestamp.dateTime = time;
      timestamp.textContent = formattedTime;
      note.append(timestamp);
    }

    stickyList.append(note);
  }
}

async function loadStickys() {
  const response = await fetch(`${stickyApiUrl}/stickys`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Unable to load stickys (${response.status}).`);
  }

  renderStickys(await response.json());
}

async function createSticky(content) {
  const response = await fetch(`${stickyApiUrl}/stickys/new`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? `Unable to post sticky (${response.status}).`);
  }
}

stickyContent.addEventListener("input", updateStickyCount);

stickyForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const content = stickyContent.value.trim();

  if (!content) {
    return;
  }

  stickySubmit.disabled = true;
  setStickyStatus("Pinning note...");

  try {
    await createSticky(content);
    stickyForm.reset();
    updateStickyCount();
    await loadStickys();
    setStickyStatus("Note pinned.");
  } catch (error) {
    setStickyStatus(error.message, true);
  } finally {
    stickySubmit.disabled = false;
  }
});

updateStickyCount();

loadStickys().catch((error) => {
  renderStickyState("Stickys are taking a nap right now.", true);
  setStickyStatus(error.message, true);
});
