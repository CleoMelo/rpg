window.TIMELINE_REPO = {
  owner: "CleoMelo",
  repo: "rpg",
  branch: "timeline-por-campanha",
  path: "timeline/timeline.json",
  storage: "supabase",
  workerUrl: "supabase://timeline"
};

if (!("historyDrag" in window)) {
  window.historyDrag = null;
}

(() => {
  const editorPage = /\/timeline\.html$/i.test(location.pathname);
  const params = new URLSearchParams(location.search);
  const campaignId = params.get("rpg") || localStorage.getItem("selectedRpg") || "";
  let rememberedAccess = null;
  try {
    rememberedAccess = JSON.parse(localStorage.getItem(`rpgAccountAccess:${String(campaignId)}`) || "null");
    const valid = rememberedAccess &&
      String(rememberedAccess.campaignId || "") === String(campaignId) &&
      ["master", "editor"].includes(rememberedAccess.role) &&
      rememberedAccess.token &&
      Date.parse(rememberedAccess.expiresAt || "") > Date.now() + 30000;
    if (!valid) {
      localStorage.removeItem(`rpgAccountAccess:${String(campaignId)}`);
      rememberedAccess = null;
    }
  } catch {
    localStorage.removeItem(`rpgAccountAccess:${String(campaignId)}`);
  }

  if (rememberedAccess) {
    sessionStorage.setItem("role", rememberedAccess.role);
    sessionStorage.setItem(`${rememberedAccess.role}RpgId`, String(campaignId));
    sessionStorage.setItem(`${rememberedAccess.role}Session:${String(campaignId)}`, rememberedAccess.token);
  } else if (
    editorPage &&
    sessionStorage.getItem("role") !== "player" &&
    localStorage.getItem("rpgAccountActive") === "1"
  ) {
    const returnPath = `timeline.html${location.search}`;
    location.replace(`login.html?rpg=${encodeURIComponent(campaignId)}&return=${encodeURIComponent(returnPath)}`);
    return;
  }
  const masterSession = Boolean(
    campaignId &&
    sessionStorage.getItem("role") === "master" &&
    sessionStorage.getItem("masterRpgId") === String(campaignId) &&
    sessionStorage.getItem(`masterSession:${String(campaignId)}`)
  );
  const editorSession = Boolean(
    campaignId &&
    sessionStorage.getItem("role") === "editor" &&
    sessionStorage.getItem("editorRpgId") === String(campaignId) &&
    sessionStorage.getItem(`editorSession:${String(campaignId)}`)
  );

  window.TIMELINE_ACCESS_ROLE = masterSession
    ? "master"
    : editorSession
      ? "editor"
      : "player";
  window.TIMELINE_READ_ONLY = Boolean(editorPage && !masterSession && !editorSession);

  const rootPrefix = editorPage ? "./" : "../";
  const timelinePrefix = editorPage ? "./timeline/" : "./";

  const scripts = [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    `${rootPrefix}supabase-config.js?v=20260914-1`,
    `${rootPrefix}data.js?v=20260914-2`,
    `${timelinePrefix}supabase-adapter.js?v=20260914-1`
  ];

  if (window.TIMELINE_READ_ONLY) {
    scripts.push(`${timelinePrefix}readonly-guard.js?v=3`);
  }

  for (const src of scripts) {
    document.write(`<script src="${src}"><\/script>`);
  }

  function installNavigation() {
    if (!campaignId) return;
    const encodedId = encodeURIComponent(String(campaignId));

    if (editorPage) {
      const actions = document.querySelector(".lk16-app-actions");
      if (!actions) return;

      const listLink = actions.querySelector('a[href^="./timeline/"]');
      if (listLink) {
        listLink.href = `./timeline/?rpg=${encodedId}`;
        listLink.textContent = "Ver lista";
      }

      const backups = document.getElementById("backupHistoryBtn");
      if (backups && window.TIMELINE_ACCESS_ROLE === "editor") {
        backups.classList.add("hidden");
      }

      let back = document.getElementById("timelineBackToCampaign");
      if (!back) {
        back = document.createElement("a");
        back.id = "timelineBackToCampaign";
        back.className = "lk16-top-btn";
        back.textContent = "Voltar à campanha";
        actions.appendChild(back);
      }
      back.href = `./categorias.html?rpg=${encodedId}`;

      if (localStorage.getItem("rpgAccountActive") === "1" && !document.getElementById("timelineAccountLink")) {
        const account = document.createElement("a");
        account.id = "timelineAccountLink";
        account.className = "lk16-top-btn";
        account.textContent = "Minha conta";
        account.href = `./conta.html?rpg=${encodedId}`;
        actions.appendChild(account);
      }
      return;
    }

    const actions = document.querySelector(".hero-actions");
    if (!actions) return;

    const existing = actions.querySelector('a[href^="../timeline.html"]');
    if (existing) {
      existing.href = `../timeline.html?rpg=${encodedId}`;
      existing.textContent = "Ver Gantt";
    }

    let back = document.getElementById("timelineBackToCampaign");
    if (!back) {
      back = document.createElement("a");
      back.id = "timelineBackToCampaign";
      back.className = "button ghost";
      back.textContent = "Voltar à campanha";
      actions.appendChild(back);
    }
    back.href = `../categorias.html?rpg=${encodedId}`;

    if (localStorage.getItem("rpgAccountActive") === "1" && !document.getElementById("timelineAccountLink")) {
      const account = document.createElement("a");
      account.id = "timelineAccountLink";
      account.className = "button ghost";
      account.textContent = "Minha conta";
      account.href = `../conta.html?rpg=${encodedId}`;
      actions.appendChild(account);
    }
  }

  window.addEventListener("load", installNavigation);
  document.addEventListener("DOMContentLoaded", installNavigation);
  setTimeout(installNavigation, 0);
  setTimeout(installNavigation, 1000);
})();
