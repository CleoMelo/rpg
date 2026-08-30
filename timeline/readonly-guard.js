(() => {
  if (!window.TIMELINE_READ_ONLY) return;

  const EDIT_ONLY = [
    "#saveAllBtn",
    "#discardBtn",
    "#backupHistoryBtn",
    "#refreshBackupsBtn",
    "#lanesBtn",
    "#newEvent",
    "#addLane",
    "#saveLanes",
    "#deleteEvent",
    "#modePointer",
    "#modeAdd",
    "#undoBtn",
    "#redoBtn"
  ].join(",");

  function blockEdit(event) {
    const target = event.target instanceof Element ? event.target : null;
    const blockedControl = target?.closest(EDIT_ONLY);
    const blockedForm = event.type === "submit" && target?.closest("#eventForm, #lanesDialog form");
    if (!blockedControl && !blockedForm) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  document.addEventListener("pointerdown", blockEdit, true);
  document.addEventListener("click", blockEdit, true);
  document.addEventListener("submit", blockEdit, true);
  document.addEventListener("keydown", event => {
    const key = String(event.key || "").toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, true);

  function applyReadOnlyUi() {
    document.body?.classList.add("timeline-readonly");

    for (const id of [
      "saveAllBtn", "discardBtn", "backupHistoryBtn", "lanesBtn", "newEvent",
      "modePointer", "modeAdd", "undoBtn", "redoBtn", "listTab", "listQuickBtn"
    ]) {
      const element = document.getElementById(id);
      if (element) element.style.display = "none";
    }

    const hand = document.getElementById("modeHand");
    if (hand && !hand.classList.contains("active")) hand.click();

    const badge = document.getElementById("saveBadge");
    if (badge && badge.textContent !== "Somente leitura") {
      badge.textContent = "Somente leitura";
      badge.className = "lk16-save-status";
    }

    const dirty = document.getElementById("dirtyText");
    if (dirty) dirty.textContent = "Visualização do jogador";

    const publicLink = document.querySelector('.lk16-app-actions a[href^="./timeline/"]');
    if (publicLink) publicLink.textContent = "Ver lista";
  }

  window.addEventListener("load", applyReadOnlyUi);
  document.addEventListener("DOMContentLoaded", applyReadOnlyUi);
  setTimeout(applyReadOnlyUi, 0);
  setTimeout(applyReadOnlyUi, 750);
  setTimeout(applyReadOnlyUi, 2000);

  const observer = new MutationObserver(() => {
    const badge = document.getElementById("saveBadge");
    if (badge && badge.textContent !== "Somente leitura") applyReadOnlyUi();
  });

  window.addEventListener("load", () => {
    const badge = document.getElementById("saveBadge");
    if (badge) observer.observe(badge, { childList: true, characterData: true, subtree: true });
  });
})();
