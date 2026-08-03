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
const stickyColors = [
  "#E5E54A",
  "#FBAD4B",
  "#EF67A5",
  "#FFD71B",
  "#00AFDF",
  "#E5E54A",
  "#FFD71B",
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

function hashSticky(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967296;
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

function updateHeartButton(button, likes) {
  const count = likes;
  const icon = button.querySelector(".sticky-heart-icon");
  const countLabel = button.querySelector(".sticky-heart-count");

  icon.textContent = "♡";
  countLabel.textContent = count;
  button.setAttribute("aria-label", "Heart this sticky!");
  button.title = `Heart this sticky!`;
}

function renderStickyState(message, isError = false) {
  const state = document.createElement("p");
  state.className = `sticky-state${isError ? " sticky-state-error" : ""}`;
  state.textContent = message;
  stickyList.replaceChildren(stickyForm, state);
}

function fitStickyContent(content) {
  const minimumFontSize = 14;
  content.style.removeProperty("font-size");

  let fontSize = Number.parseFloat(getComputedStyle(content).fontSize);

  while (
    (content.scrollHeight > content.clientHeight ||
      content.scrollWidth > content.clientWidth) &&
    fontSize > minimumFontSize
  ) {
    fontSize = Math.max(minimumFontSize, fontSize - 1);
    content.style.fontSize = `${fontSize}px`;
  }
}

function fitStickyContents() {
  document.querySelectorAll(".sticky-note-content").forEach(fitStickyContent);
}

function renderStickys(stickys) {
  const notes = Array.isArray(stickys) ? stickys : [];

  if (notes.length === 0) {
    renderStickyState("No stickys yet. Leave the first note.");
    return;
  }

  stickyList.replaceChildren(stickyForm);

  for (const { content: text = "", time, likes = 0 } of notes) {
    const note = document.createElement("article");
    const stickySeed = `${time ?? ""}\u0000${text}`;
    const colorRandom = hashSticky(`${stickySeed}\u0000color`);
    const rotationRandom = hashSticky(`${stickySeed}\u0000rotation`);
    note.className = "sticky-note";
    note.style.setProperty(
      "--sticky-color",
      stickyColors[Math.floor(colorRandom * stickyColors.length)],
    );
    note.style.setProperty(
      "--sticky-rotation",
      `${rotationRandom * 4 - 2}deg`,
    );

    const content = document.createElement("p");
    content.className = "sticky-note-content";
    content.textContent = text;
    note.append(content);

    const formattedTime = formatStickyTime(time);

    if (formattedTime) {
      const footer = document.createElement("footer");
      footer.className = "sticky-note-footer";

      const timestamp = document.createElement("time");
      timestamp.className = "sticky-note-time";
      timestamp.dateTime = time;
      timestamp.textContent = formattedTime;
      footer.append(timestamp);

      const heart = document.createElement("button");
      heart.className = "sticky-heart";
      heart.type = "button";

      const heartIcon = document.createElement("span");
      heartIcon.className = "sticky-heart-icon";
      heartIcon.setAttribute("aria-hidden", "true");

      const heartCount = document.createElement("span");
      heartCount.className = "sticky-heart-count";

      heart.append(heartIcon, heartCount);
      updateHeartButton(heart, likes);

      heart.addEventListener("click", async () => {
        heart.disabled = true;
        setStickyStatus("Sending heart...");

        try {
          const updated = await heartSticky(time);
          updateHeartButton(heart, updated.likes);
          setStickyStatus("Sticky hearted.");
        } catch (error) {
          setStickyStatus(error.message, true);
        } finally {
          heart.disabled = false;
        }
      });

      footer.append(heart);
      note.append(footer);
    }

    stickyList.append(note);
  }

  fitStickyContents();
}

async function heartSticky(time) {
  const response = await fetch(`${stickyApiUrl}/stickys/heart`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ time }),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error ?? `Unable to heart sticky (${response.status}).`);
  }

  if (!result || !Number.isFinite(Number(result.likes))) {
    throw new Error("The sticky was hearted, but its new count was not returned.");
  }

  return result;
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

let stickyResizeFrame;
window.addEventListener("resize", () => {
  cancelAnimationFrame(stickyResizeFrame);
  stickyResizeFrame = requestAnimationFrame(fitStickyContents);
});

document.fonts?.ready.then(fitStickyContents);

loadStickys().catch((error) => {
  renderStickyState("Stickys are taking a nap right now.", true);
  setStickyStatus(error.message, true);
});
