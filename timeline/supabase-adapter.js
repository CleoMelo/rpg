(() => {
  const cfg = window.TIMELINE_REPO || {};
  const nativeFetch = window.fetch.bind(window);
  const SUPABASE_PREFIX = "supabase://timeline";
  const editorPage = /\/timeline\.html$/i.test(location.pathname);
  const LEGACY_CAVALEIROS_NAME = "cavaleiros divinos e a ordem dos reinos";
  let legacyCampaignIdPromise = null;

  function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }

  function errorMessage(error) {
    if (error?.code === "PGRST202" || /function .* does not exist/i.test(String(error?.message || ""))) {
      return "A migração da timeline ainda não foi executada no Supabase.";
    }
    return error?.message || "Erro ao acessar a timeline no Supabase.";
  }

  function campaignId() {
    if (typeof window.getSelectedRpg !== "function") return "";
    return String(window.getSelectedRpg() || "").trim();
  }

  function masterToken(id) {
    if (!id || typeof window.getMasterToken !== "function") return "";
    return String(window.getMasterToken(id) || "").trim();
  }

  function client() {
    if (typeof window.getSupabaseClient !== "function") {
      throw new Error("Cliente do Supabase não carregado.");
    }
    return window.getSupabaseClient();
  }

  function requireCampaign() {
    const id = campaignId();
    if (!id) {
      throw new Error("Nenhuma campanha selecionada. Abra a timeline a partir do RPG desejado.");
    }
    return id;
  }

  function requireMaster() {
    const id = requireCampaign();
    const token = masterToken(id);
    if (!token) {
      throw new Error("Sessão de mestre não encontrada. Entre como mestre nesta campanha antes de abrir a timeline.");
    }
    return { id, token };
  }

  async function rpc(name, args) {
    const { data, error } = await client().rpc(name, args);
    if (error) throw error;
    return data;
  }

  function normalizeName(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .trim();
  }

  async function campaignInfo(id) {
    if (!id) return null;

    const { data, error } = await client()
      .from("campanhas")
      .select("id, nome, descricao, imagem_url")
      .eq("id", String(id))
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: String(data.id),
      name: data.nome,
      description: data.descricao || "",
      image: data.imagem_url || ""
    };
  }

  async function resolveLegacyCampaignId() {
    if (!legacyCampaignIdPromise) {
      legacyCampaignIdPromise = (async () => {
        const { data, error } = await client()
          .from("campanhas")
          .select("id, nome");

        if (error) throw error;

        const campaigns = (data || []).map(row => ({
          id: String(row.id),
          normalizedName: normalizeName(row.nome)
        }));

        const exact = campaigns.filter(item => item.normalizedName === LEGACY_CAVALEIROS_NAME);
        if (exact.length === 1) return exact[0].id;

        const candidates = campaigns.filter(item => item.normalizedName.includes("cavaleiros"));
        return candidates.length === 1 ? candidates[0].id : "";
      })().catch(error => {
        legacyCampaignIdPromise = null;
        throw error;
      });
    }

    return legacyCampaignIdPromise;
  }

  function timelineDocument(data) {
    return data?.resources?.[0]?.documents?.find(item => item.type === "time") || null;
  }

  function timelineNames(data) {
    const resourceName = normalizeName(data?.resources?.[0]?.name);
    const documentName = normalizeName(timelineDocument(data)?.name);
    return { resourceName, documentName };
  }

  function looksLikeLegacyCavaleiros(data) {
    const { resourceName, documentName } = timelineNames(data);
    return resourceName === LEGACY_CAVALEIROS_NAME
      || documentName === LEGACY_CAVALEIROS_NAME
      || resourceName.includes("cavaleiros")
      || documentName.includes("cavaleiros");
  }

  function bindingState(data, campaign, isLegacyCampaign) {
    if (!data || typeof data !== "object") return "invalid";

    const currentId = String(campaign.id);
    const boundId = String(data?.timelineMeta?.campaignId || "").trim();
    if (boundId) return boundId === currentId ? "bound" : "foreign";

    const campaignName = normalizeName(campaign.name);
    const { resourceName, documentName } = timelineNames(data);

    if (isLegacyCampaign && looksLikeLegacyCavaleiros(data)) {
      return "legacy-own";
    }

    if (!isLegacyCampaign
      && !looksLikeLegacyCavaleiros(data)
      && (resourceName === campaignName || documentName === campaignName)) {
      return "legacy-own";
    }

    return "foreign";
  }

  function bindTimelineToCampaign(data, campaign) {
    const bound = JSON.parse(JSON.stringify(data));
    bound.timelineMeta = {
      schemaVersion: 1,
      campaignId: String(campaign.id),
      campaignName: String(campaign.name || "Campanha")
    };
    return bound;
  }

  function applyCampaignUi(campaign) {
    if (!campaign) return;
    const name = String(campaign.name || "Campanha").trim() || "Campanha";
    document.title = editorPage
      ? `${name} — Timeline`
      : `${name} — Linha do Tempo`;

    const heading = document.querySelector(".lk17-title-row h1, .hero-copy h1");
    if (heading) {
      if (editorPage) {
        const icon = heading.querySelector(".lk16-hourglass")?.outerHTML || "";
        heading.innerHTML = `${icon}${name}`;
      } else {
        heading.textContent = name;
      }
    }

    const publicSubtitle = document.querySelector(".hero-copy p:not(.eyebrow)");
    if (publicSubtitle) publicSubtitle.textContent = `Timeline pública de ${name}`;

    const encodedId = encodeURIComponent(String(campaign.id));
    const masterLink = document.querySelector('a[href^="../timeline.html"]');
    if (masterLink) masterLink.href = `../timeline.html?rpg=${encodedId}`;

    const publicLink = document.querySelector('a[href^="./timeline/"]');
    if (publicLink) publicLink.href = `./timeline/?rpg=${encodedId}`;
  }

  function seedUrl() {
    return new URL(editorPage ? "./timeline/timeline.json" : "./timeline.json", location.href).href;
  }

  async function loadSeed() {
    const response = await nativeFetch(seedUrl(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Não foi possível carregar a timeline base (HTTP ${response.status}).`);
    }
    return response.json();
  }

  function newId(prefix) {
    if (globalThis.crypto?.randomUUID) {
      return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function createEmptyTimeline(seed, campaign) {
    const empty = JSON.parse(JSON.stringify(seed));
    const resource = empty?.resources?.[0];
    const documentTimeline = timelineDocument(empty);

    if (!resource || !documentTimeline?.content) {
      throw new Error("O modelo inicial da timeline é inválido.");
    }

    const name = String(campaign?.name || "Nova campanha").trim() || "Nova campanha";
    const calendar = empty?.calendars?.find(item => item.id === documentTimeline.calendarId) || empty?.calendars?.[0];
    const calendarId = newId("calendar");

    empty.exportId = newId("export");
    empty.exportedAt = new Date().toISOString();
    resource.id = newId("resource");
    resource.name = name;
    documentTimeline.id = newId("timeline");
    documentTimeline.name = name;
    documentTimeline.calendarId = calendarId;
    documentTimeline.content.events = [];
    documentTimeline.content.lanes = [{
      id: newId("lane"),
      name: "Geral",
      color: "#8b5cf6",
      pos: "a0",
      size: "sm",
      isCollapsed: false
    }];

    if (calendar) {
      calendar.id = calendarId;
      calendar.name = `Calendário de ${name}`;
    }

    return bindTimelineToCampaign(empty, campaign);
  }

  async function initialTimelineForCampaign(campaign, isLegacyCampaign) {
    const seed = await loadSeed();
    return isLegacyCampaign
      ? bindTimelineToCampaign(seed, campaign)
      : createEmptyTimeline(seed, campaign);
  }

  async function persistTimeline(id, token, data, message) {
    return rpc("salvar_timeline", {
      p_campanha_id: id,
      p_token: token,
      p_data: data,
      p_mensagem: message
    });
  }

  async function loadTimeline({ requireMasterSession = false } = {}) {
    let id;
    let token = "";

    if (requireMasterSession) {
      const master = requireMaster();
      id = master.id;
      token = master.token;
    } else {
      id = requireCampaign();
      token = masterToken(id);
    }

    const campaign = await campaignInfo(id);
    if (!campaign) throw new Error("Campanha não encontrada.");

    const legacyCampaignId = await resolveLegacyCampaignId();
    const isLegacyCampaign = Boolean(legacyCampaignId) && legacyCampaignId === String(id);
    applyCampaignUi(campaign);

    const stored = await rpc("carregar_timeline", { p_campanha_id: id });

    if (stored) {
      const state = bindingState(stored, campaign, isLegacyCampaign);

      if (state === "bound") return stored;

      if (state === "legacy-own") {
        const rebound = bindTimelineToCampaign(stored, campaign);
        if (token) {
          await persistTimeline(
            id,
            token,
            rebound,
            "Associar timeline existente à campanha"
          );
        }
        return rebound;
      }

      const clean = await initialTimelineForCampaign(campaign, isLegacyCampaign);
      if (token) {
        await persistTimeline(
          id,
          token,
          clean,
          "Corrigir timeline associada à campanha errada"
        );
      }
      return clean;
    }

    const initial = await initialTimelineForCampaign(campaign, isLegacyCampaign);
    if (token) {
      await persistTimeline(
        id,
        token,
        initial,
        isLegacyCampaign
          ? "Associar timeline de Cavaleiros à campanha"
          : "Criar timeline inicial da campanha"
      );
    }
    return initial;
  }

  async function handleSupabaseRoute(url, options = {}) {
    const route = url.slice(SUPABASE_PREFIX.length) || "/";
    const method = String(options.method || "GET").toUpperCase();

    try {
      if (method === "GET" && route === "/timeline") {
        return jsonResponse(await loadTimeline({ requireMasterSession: editorPage }));
      }

      if (method === "POST" && route === "/save") {
        const { id, token } = requireMaster();
        const campaign = await campaignInfo(id);
        if (!campaign) throw new Error("Campanha não encontrada.");

        const body = JSON.parse(String(options.body || "{}"));
        const boundData = bindTimelineToCampaign(body.data, campaign);
        const version = await persistTimeline(
          id,
          token,
          boundData,
          "Edição pela timeline"
        );
        return jsonResponse({ ok: true, version, backupCreated: true });
      }

      if (method === "GET" && route === "/backups") {
        const { id, token } = requireMaster();
        const rows = await rpc("listar_backups_timeline", {
          p_campanha_id: id,
          p_token: token
        });

        const backups = (rows || []).map(row => ({
          sha: row.atual ? "current" : String(row.backup_id),
          shortSha: `v${row.versao}`,
          message: row.mensagem || (row.atual ? "Versão atual" : "Backup da timeline"),
          date: row.data_hora,
          author: "Mestre",
          current: Boolean(row.atual)
        }));

        return jsonResponse({ backups });
      }

      if (method === "POST" && route === "/restore") {
        const { id, token } = requireMaster();
        const body = JSON.parse(String(options.body || "{}"));
        const backupId = Number(body.sha);

        if (!Number.isSafeInteger(backupId) || backupId <= 0) {
          return jsonResponse({ error: "Versão de backup inválida." }, 400);
        }

        const restored = await rpc("restaurar_backup_timeline", {
          p_campanha_id: id,
          p_token: token,
          p_backup_id: backupId
        });

        if (!restored) return jsonResponse({ error: "Backup não encontrado." }, 404);
        return jsonResponse({ ok: true, restoredFrom: String(backupId), backupCreated: true });
      }

      return jsonResponse({ error: "Rota não encontrada." }, 404);
    } catch (error) {
      console.error("[timeline/supabase]", error);
      const message = errorMessage(error);
      const authError = /sessão de mestre|campanha selecionada/i.test(message);
      return jsonResponse({ error: message }, authError ? 401 : 500);
    }
  }

  function isLegacyTimelineJsonRequest(value) {
    try {
      const url = new URL(value, location.href);
      if (url.hostname !== "raw.githubusercontent.com") return false;
      return url.pathname.endsWith(`/${cfg.path || "timeline/timeline.json"}`);
    } catch {
      return false;
    }
  }

  window.fetch = async function timelineFetch(input, options = {}) {
    const value = typeof input === "string" ? input : input?.url || "";

    if (value.startsWith(SUPABASE_PREFIX)) {
      return handleSupabaseRoute(value, options);
    }

    // Compatibilidade com versões antigas de app.js em cache.
    if (isLegacyTimelineJsonRequest(value)) {
      try {
        return jsonResponse(await loadTimeline());
      } catch (error) {
        console.error("[timeline/supabase-public]", error);
        return jsonResponse({ error: errorMessage(error) }, 500);
      }
    }

    return nativeFetch(input, options);
  };
})();
