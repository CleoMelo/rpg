window.TIMELINE_REPO = {
  owner: "CleoMelo",
  repo: "rpg",
  branch: "timeline-por-campanha",
  path: "timeline/timeline.json",
  storage: "supabase",
  workerUrl: "supabase://timeline"
};

// Compatibilidade do editor legado: admin.js usa historyDrag como estado global
// no navegador de histórico. Declaramos explicitamente o estado antes de carregar
// admin.js para evitar ReferenceError em pointerdown/pointermove/pointerup.
if (!("historyDrag" in window)) {
  window.historyDrag = null;
}

(() => {
  const editorPage = /\/timeline\.html$/i.test(location.pathname);
  const rootPrefix = editorPage ? "./" : "../";
  const timelinePrefix = editorPage ? "./timeline/" : "./";

  const scripts = [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    `${rootPrefix}supabase-config.js?v=20260829-1`,
    `${rootPrefix}data.js?v=20260829-1`,
    `${timelinePrefix}supabase-adapter.js?v=2`
  ];

  for (const src of scripts) {
    document.write(`<script src="${src}"><\/script>`);
  }
})();
