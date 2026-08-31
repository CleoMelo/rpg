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
  const masterSession = Boolean(
    campaignId &&
    sessionStorage.getItem("role") === "master" &&
    sessionStorage.getItem("masterRpgId") === String(campaignId) &&
    sessionStorage.getItem(`masterSession:${String(campaignId)}`)
  );

  window.TIMELINE_READ_ONLY = Boolean(editorPage && !masterSession);

  const rootPrefix = editorPage ? "./" : "../";
  const timelinePrefix = editorPage ? "./timeline/" : "./";

  const scripts = [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    `${rootPrefix}supabase-config.js?v=20260829-1`,
    `${rootPrefix}data.js?v=20260829-1`,
    `${timelinePrefix}supabase-adapter.js?v=4`
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

      let back = document.getElementById("timelineBackToCampaign");
      if (!back) {
        back = document.createElement("a");
        back.id = "timelineBackToCampaign";
        back.className = "lk16-top-btn";
        back.textContent = "Voltar à campanha";
        actions.appendChild(back);
      }
      back.href = `./categorias.html?rpg=${encodedId}`;
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
  }

  window.addEventListener("load", installNavigation);
  document.addEventListener("DOMContentLoaded", installNavigation);
  setTimeout(installNavigation, 0);
  setTimeout(installNavigation, 1000);
})();
