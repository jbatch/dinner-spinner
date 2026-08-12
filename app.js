const palette = [
  "#ef476f",
  "#ffd166",
  "#06d6a0",
  "#118ab2",
  "#f77f00",
  "#7b2cbf",
  "#2a9d8f",
  "#e76f51",
  "#4d96ff",
  "#8ac926",
  "#ff595e",
  "#6a4c93"
];

let state = { meals: [] };
let filterGroups = [new Set()];
let activeFilterGroupIndex = 0;
let decisionVetoIds = new Set();
let rotation = 0;
let isSpinning = false;
let lastWinnerId = null;

const canvas = document.querySelector("#wheelCanvas");
const ctx = canvas.getContext("2d");
const spinButton = document.querySelector("#spinButton");
const winnerTitle = document.querySelector("#spinTitle");
const winnerTags = document.querySelector("#winnerTags");
const activeCount = document.querySelector("#activeCount");
const filterChips = document.querySelector("#filterChips");
const filterGroupList = document.querySelector("#filterGroups");
const mealList = document.querySelector("#mealList");
const tagGroups = document.querySelector("#tagGroups");
const mealDialog = document.querySelector("#mealDialog");
const mealForm = document.querySelector("#mealForm");
const mealIdInput = document.querySelector("#mealId");
const mealNameInput = document.querySelector("#mealName");
const mealTagsInput = document.querySelector("#mealTags");
const dialogTitle = document.querySelector("#dialogTitle");
const deleteMealButton = document.querySelector("#deleteMealButton");
const importText = document.querySelector("#importText");
const winnerDialog = document.querySelector("#winnerDialog");
const winnerDialogTitle = document.querySelector("#winnerDialogTitle");
const winnerDialogTags = document.querySelector("#winnerDialogTags");
const winnerKeepButton = document.querySelector("#winnerKeepButton");
const winnerRespinButton = document.querySelector("#winnerRespinButton");

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Not authenticated");
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.status === 204 ? null : response.json();
}

function normalizeMeal(item) {
  return {
    id: item.id,
    name: String(item.name || "Untitled dinner").trim(),
    tags: Array.isArray(item.tags) ? item.tags.map(normalizeTag).filter(Boolean) : [],
    skipNextSpin: Boolean(state.meals.find((meal) => meal.id === item.id)?.skipNextSpin)
  };
}

async function loadMeals() {
  const data = await api("/api/meals");
  state.meals = data.meals.map(normalizeMeal);
  pruneFilterGroups();
  render();
}

function normalizeTag(tag) {
  return String(tag || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/,+/g, "")
    .slice(0, 40);
}

function parseTags(value) {
  return value
    .split(",")
    .map(normalizeTag)
    .filter(Boolean)
    .filter((tag, index, all) => all.indexOf(tag) === index);
}

function allTags() {
  return [...new Set(state.meals.flatMap((item) => item.tags))].sort((a, b) => a.localeCompare(b));
}

function groupedTags() {
  return allTags().reduce((groups, tag) => {
    const [group, value] = tag.includes(":") ? tag.split(/:(.*)/s).filter(Boolean) : ["other", tag];
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(value);
    return groups;
  }, {});
}

function activeMeals() {
  const activeGroups = filterGroups.filter((group) => group.size > 0);
  return state.meals.filter((item) => {
    if (item.skipNextSpin || decisionVetoIds.has(item.id)) {
      return false;
    }
    return activeGroups.every((group) => [...group].some((tag) => item.tags.includes(tag)));
  });
}

function render() {
  renderWheel();
  renderFilters();
  renderMeals();
  renderTags();
}

function renderWheel() {
  const meals = activeMeals();
  const size = canvas.width;
  const center = size / 2;
  const radius = center - 34;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(center, center);
  ctx.rotate(rotation);

  if (meals.length === 0) {
    drawEmptyWheel(radius);
  } else {
    const slice = (Math.PI * 2) / meals.length;
    meals.forEach((item, index) => {
      const start = index * slice;
      const end = start + slice;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = palette[index % palette.length];
      ctx.fill();

      ctx.save();
      ctx.rotate(start + slice / 2);
      drawWheelText(item.name, radius, meals.length, palette[index % palette.length], start + slice / 2);
      ctx.restore();
    });
  }

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.lineWidth = 18;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 76, 0, Math.PI * 2);
  ctx.fillStyle = "#fffdf7";
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#101820";
  ctx.stroke();

  ctx.restore();

  activeCount.textContent = `${meals.length} option${meals.length === 1 ? "" : "s"}`;
  spinButton.disabled = isSpinning || meals.length < 2;
  spinButton.textContent = meals.length < 2 ? "Need 2" : isSpinning ? "..." : lastWinnerId ? "Again" : "Spin";
}

function drawEmptyWheel(radius) {
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#ccd5c9";
  ctx.fill();
  ctx.fillStyle = "#17212b";
  ctx.font = "800 34px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("No dinners", 0, -8);
  ctx.font = "650 20px system-ui";
  ctx.fillText("Clear filters or add more", 0, 28);
}

function drawWheelText(label, radius, count, segmentColor, angle) {
  const sliceAngle = (Math.PI * 2) / count;
  const labelRadius = radius * 0.68;
  const maxWidth = Math.max(74, Math.min(radius * 0.5, labelRadius * sliceAngle * 0.92));
  const fontSize = count > 18 ? 15 : count > 12 ? 18 : 22;
  const lineHeight = fontSize + 3;
  const words = label.split(" ");
  const lines = [];
  let line = "";

  ctx.font = `850 ${fontSize}px system-ui`;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  lines.push(line);

  ctx.translate(labelRadius, 0);

  const visualAngle = normalizeRotation(rotation + angle);
  if (visualAngle > Math.PI / 2 && visualAngle < Math.PI * 1.5) {
    ctx.rotate(Math.PI);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = readableTextColor(segmentColor);
  ctx.lineWidth = 3;
  ctx.strokeStyle = ctx.fillStyle === "#ffffff" ? "rgba(16, 24, 32, 0.55)" : "rgba(255, 255, 255, 0.58)";

  const visibleLines = lines.slice(0, 3);
  visibleLines.forEach((text, index) => {
    const y = (index - (visibleLines.length - 1) / 2) * lineHeight;
    ctx.strokeText(text, 0, y, maxWidth);
    ctx.fillText(text, 0, y, maxWidth);
  });
}

function readableTextColor(hex) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.55 ? "#101820" : "#ffffff";
}

function renderFilters() {
  const tags = allTags();
  filterChips.innerHTML = "";
  filterGroupList.innerHTML = "";
  ensureActiveFilterGroup();

  filterGroups.forEach((group, index) => {
    const groupButton = document.createElement("button");
    groupButton.type = "button";
    groupButton.className = `filter-group${index === activeFilterGroupIndex ? " is-active" : ""}`;
    groupButton.setAttribute("aria-label", `Filter group ${index + 1}`);
    groupButton.innerHTML = `
      <span class="filter-group-label">${index === 0 ? "Where" : "AND"}</span>
      <span class="filter-group-tags">${group.size ? [...group].map(escapeHtml).join(" or ") : "any tag"}</span>
    `;
    groupButton.addEventListener("click", () => {
      activeFilterGroupIndex = index;
      render();
    });

    const wrapper = document.createElement("div");
    wrapper.className = "filter-group-wrap";
    wrapper.append(groupButton);

    if (filterGroups.length > 1 || group.size > 0) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "group-remove";
      remove.setAttribute("aria-label", `Remove filter group ${index + 1}`);
      remove.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12"></path>
          <path d="M18 6 6 18"></path>
        </svg>
      `;
      remove.addEventListener("click", () => {
        removeFilterGroup(index);
      });
      wrapper.append(remove);
    }

    filterGroupList.append(wrapper);
  });

  if (tags.length === 0) {
    filterChips.innerHTML = `<div class="empty-state">Add tags to filter the wheel.</div>`;
    return;
  }

  tags.forEach((tag) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `chip${activeFilterGroup().has(tag) ? " is-active" : ""}`;
    chip.textContent = tag;
    chip.addEventListener("click", () => {
      const group = activeFilterGroup();
      if (group.has(tag)) {
        group.delete(tag);
      } else {
        group.add(tag);
      }
      render();
    });
    filterChips.append(chip);
  });
}

function activeFilterGroup() {
  ensureActiveFilterGroup();
  return filterGroups[activeFilterGroupIndex];
}

function addFilterGroup() {
  const lastGroup = filterGroups[filterGroups.length - 1];
  if (lastGroup.size === 0) {
    activeFilterGroupIndex = filterGroups.length - 1;
  } else {
    filterGroups.push(new Set());
    activeFilterGroupIndex = filterGroups.length - 1;
  }
  render();
}

function removeFilterGroup(index) {
  filterGroups.splice(index, 1);
  if (filterGroups.length === 0) {
    filterGroups.push(new Set());
  }
  activeFilterGroupIndex = Math.min(activeFilterGroupIndex, filterGroups.length - 1);
  render();
}

function clearFilters() {
  filterGroups = [new Set()];
  activeFilterGroupIndex = 0;
  render();
}

function ensureActiveFilterGroup() {
  if (filterGroups.length === 0) {
    filterGroups.push(new Set());
  }
  if (activeFilterGroupIndex < 0 || activeFilterGroupIndex >= filterGroups.length) {
    activeFilterGroupIndex = filterGroups.length - 1;
  }
}

function renderMeals() {
  mealList.innerHTML = "";

  if (state.meals.length === 0) {
    mealList.innerHTML = `<div class="empty-state">No dinners yet.</div>`;
    return;
  }

  state.meals.forEach((item) => {
    const card = document.createElement("article");
    card.className = "meal-card";
    card.innerHTML = `
      <div class="meal-card-header">
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <div class="meal-tags">
            ${item.tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}
            ${item.skipNextSpin ? `<span class="tag-pill chip is-skip">hidden for next spin</span>` : ""}
            ${decisionVetoIds.has(item.id) ? `<span class="tag-pill chip is-skip">vetoed this round</span>` : ""}
          </div>
        </div>
        <div class="meal-actions">
          <button class="icon-button" type="button" data-action="skip" aria-label="Veto ${escapeAttr(item.name)} for next spin" title="Veto next spin">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 4l16 16"></path>
              <path d="M10.6 5.1A7.7 7.7 0 0 1 12 5a7 7 0 0 1 7 7c0 .5 0 1-.1 1.4"></path>
              <path d="M6.4 6.4A7 7 0 0 0 12 19c1.7 0 3.2-.6 4.4-1.6"></path>
            </svg>
          </button>
          <button class="icon-button" type="button" data-action="edit" aria-label="Edit ${escapeAttr(item.name)}" title="Edit">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20h9"></path>
              <path d="m16.5 3.5 4 4L8 20H4v-4Z"></path>
            </svg>
          </button>
        </div>
      </div>
    `;

    card.querySelector('[data-action="skip"]').addEventListener("click", () => {
      item.skipNextSpin = !item.skipNextSpin;
      render();
    });

    card.querySelector('[data-action="edit"]').addEventListener("click", () => {
      openMealDialog(item);
    });

    mealList.append(card);
  });
}

function renderTags() {
  const groups = groupedTags();
  const names = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  tagGroups.innerHTML = "";

  if (names.length === 0) {
    tagGroups.innerHTML = `<div class="empty-state">Tags will appear here after you add dinners.</div>`;
    return;
  }

  names.forEach((name) => {
    const group = document.createElement("section");
    group.className = "tag-group";
    group.innerHTML = `
      <h3>${escapeHtml(name)}</h3>
      <div class="tag-chip-list">
        ${groups[name].map((value) => `<span class="tag-pill">${escapeHtml(value)}</span>`).join("")}
      </div>
    `;
    tagGroups.append(group);
  });
}

function spinWheel() {
  const meals = activeMeals();
  if (isSpinning || meals.length < 2) {
    return;
  }

  const slice = (Math.PI * 2) / meals.length;
  const winnerIndex = Math.floor(Math.random() * meals.length);
  const targetAngleAtPointer = -Math.PI / 2;
  const sliceCenter = winnerIndex * slice + slice / 2;
  const fullTurns = 6 + Math.floor(Math.random() * 3);
  const startRotation = rotation;
  const targetRotation = fullTurns * Math.PI * 2 + targetAngleAtPointer - sliceCenter;
  const duration = 4300;
  const started = performance.now();

  isSpinning = true;
  winnerTitle.textContent = "Spinning...";
  winnerTags.textContent = "Winner vetoes stay out until you keep a result.";

  function frame(now) {
    const elapsed = now - started;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 4);
    rotation = startRotation + (targetRotation - startRotation) * eased;
    renderWheel();

    if (progress < 1) {
      requestAnimationFrame(frame);
      return;
    }

    rotation = normalizeRotation(rotation);
    isSpinning = false;
    lastWinnerId = meals[winnerIndex].id;
    state.meals.forEach((item) => {
      item.skipNextSpin = false;
    });
    announceWinner(meals[winnerIndex]);
    showWinnerDialog(meals[winnerIndex]);
    render();
  }

  requestAnimationFrame(frame);
}

function normalizeRotation(value) {
  const whole = Math.PI * 2;
  return ((value % whole) + whole) % whole;
}

function announceWinner(item) {
  winnerTitle.textContent = item.name;
  winnerTags.textContent = item.tags.length ? item.tags.join(" | ") : "No tags yet";
}

function showWinnerDialog(item) {
  const remainingAfterVeto = activeMeals().filter((meal) => meal.id !== item.id).length;
  winnerDialogTitle.textContent = item.name;
  winnerDialogTags.textContent = item.tags.length ? item.tags.join(" | ") : "No tags yet";
  winnerRespinButton.textContent =
    remainingAfterVeto >= 2 ? `Veto & re-spin (${remainingAfterVeto} remaining)` : `Need 2 to re-spin (${remainingAfterVeto} remaining)`;
  winnerRespinButton.disabled = remainingAfterVeto < 2;

  if (winnerDialog.open) {
    closeWinnerDialog();
  }
  winnerDialog.showModal();
}

function closeWinnerDialog() {
  if (winnerDialog.open) {
    winnerDialog.close();
  }
}

function keepWinner() {
  decisionVetoIds.clear();
  closeWinnerDialog();
  render();
}

function vetoWinnerAndRespin() {
  const winner = state.meals.find((item) => item.id === lastWinnerId);
  if (!winner) {
    closeWinnerDialog();
    return;
  }

  decisionVetoIds.add(winner.id);
  closeWinnerDialog();
  render();
  window.setTimeout(spinWheel, 120);
}

function openMealDialog(item = null) {
  dialogTitle.textContent = item ? "Edit dinner" : "Add dinner";
  mealIdInput.value = item?.id || "";
  mealNameInput.value = item?.name || "";
  mealTagsInput.value = item?.tags.join(", ") || "";
  deleteMealButton.hidden = !item;
  mealDialog.showModal();
  mealNameInput.focus();
}

async function saveMealFromDialog() {
  const name = mealNameInput.value.trim();
  const tags = parseTags(mealTagsInput.value);
  const id = mealIdInput.value;

  if (!name) {
    return;
  }

  const existing = state.meals.find((item) => item.id === id);
  if (existing) {
    const data = await api(`/api/meals/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ name, tags })
    });
    existing.name = data.meal.name;
    existing.tags = data.meal.tags;
  } else {
    const data = await api("/api/meals", {
      method: "POST",
      body: JSON.stringify({ name, tags })
    });
    state.meals.push(normalizeMeal(data.meal));
  }
  pruneFilterGroups();
  render();
}

async function deleteCurrentMeal() {
  const id = mealIdInput.value;
  await api(`/api/meals/${encodeURIComponent(id)}`, { method: "DELETE" });
  state.meals = state.meals.filter((item) => item.id !== id);
  decisionVetoIds.delete(id);
  if (lastWinnerId === id) {
    lastWinnerId = null;
    winnerTitle.textContent = "Tap spin";
    winnerTags.textContent = "Filter the wheel, veto a dinner, then let it choose.";
    closeWinnerDialog();
  }
  pruneFilterGroups();
  mealDialog.close();
  render();
}

function pruneFilterGroups() {
  const validTags = new Set(allTags());
  const validMealIds = new Set(state.meals.map((item) => item.id));
  decisionVetoIds = new Set([...decisionVetoIds].filter((id) => validMealIds.has(id)));
  filterGroups = filterGroups
    .map((group) => new Set([...group].filter((tag) => validTags.has(tag))))
    .filter((group, index) => group.size > 0 || index === activeFilterGroupIndex);
  if (filterGroups.length === 0) {
    filterGroups = [new Set()];
  }
  activeFilterGroupIndex = Math.min(activeFilterGroupIndex, filterGroups.length - 1);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

document.querySelectorAll(".ribbon-item").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".ribbon-item").forEach((item) => item.classList.remove("is-active"));
    document.querySelectorAll(".page").forEach((page) => page.classList.remove("is-active"));
    button.classList.add("is-active");
    document.querySelector(`#${button.dataset.target}`).classList.add("is-active");
  });
});

spinButton.addEventListener("click", spinWheel);

document.querySelector("#addFilterGroupButton").addEventListener("click", addFilterGroup);
document.querySelector("#clearFiltersButton").addEventListener("click", clearFilters);

document.querySelector("#newMealButton").addEventListener("click", () => openMealDialog());

mealForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    mealDialog.close();
    return;
  }
  await saveMealFromDialog();
  mealDialog.close();
});

deleteMealButton.addEventListener("click", deleteCurrentMeal);
winnerKeepButton.addEventListener("click", keepWinner);
winnerRespinButton.addEventListener("click", vetoWinnerAndRespin);
winnerDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  keepWinner();
});

document.querySelector("#exportButton").addEventListener("click", async () => {
  const payload = JSON.stringify(state, null, 2);
  importText.value = payload;
  try {
    await navigator.clipboard.writeText(payload);
  } catch {
    importText.select();
  }
});

document.querySelector("#importButton").addEventListener("click", async () => {
  try {
    const parsed = JSON.parse(importText.value);
    if (!Array.isArray(parsed.meals)) {
      throw new Error("Missing meals");
    }
    const data = await api("/api/import", {
      method: "POST",
      body: JSON.stringify({ meals: parsed.meals })
    });
    state.meals = data.meals.map(normalizeMeal);
    filterGroups = [new Set()];
    activeFilterGroupIndex = 0;
    decisionVetoIds.clear();
    lastWinnerId = null;
    closeWinnerDialog();
    render();
  } catch {
    importText.value = "Import failed. Paste JSON exported from this app.";
  }
});

window.addEventListener("resize", renderWheel);

loadMeals().catch((error) => {
  winnerTitle.textContent = "Could not load dinners";
  winnerTags.textContent = error.message;
  render();
});
