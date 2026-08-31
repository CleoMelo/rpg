(() => {
  const C = window.TimelineCommon;
  const cfg = window.TIMELINE_REPO;
  const $ = id => document.getElementById(id);

  const DAY = 1440;
  const YEAR = 525600;
  const HOUR = 60;
  const LANE_WIDTH = 220;
  const MIN_GANTT_SPAN = 6 * HOUR;
  const MAX_GANTT_SPAN = 10000 * YEAR;
  const ZOOM_LEVELS = [
    6 * HOUR, 12 * HOUR,
    DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 90 * DAY, 180 * DAY,
    YEAR, 2 * YEAR, 3 * YEAR, 5 * YEAR, 10 * YEAR, 20 * YEAR, 30 * YEAR,
    50 * YEAR, 100 * YEAR, 200 * YEAR, 300 * YEAR, 500 * YEAR,
    1000 * YEAR, 2000 * YEAR, 3000 * YEAR, 5000 * YEAR, 10000 * YEAR
  ];
  const LANE_PALETTE = [
    "#9b6cff", "#b55f66", "#668fc5", "#c39b4a",
    "#7d68a8", "#c9844f", "#4f9a7d", "#b86d90",
    "#3f968f", "#b77a54", "#8d7ac4", "#87565c",
    "#5f95be", "#a58a56", "#6f9667", "#81879a"
  ];
  const TIME_PRESETS = {
    cavaleiros: { calendarName: "Cavaleiros", beforeName: "Antes da Grande Mudança", beforeShort: "AGM", afterName: "Depois da Grande Mudança", afterShort: "DGM" },
    fate: { calendarName: "Fate", beforeName: "Antes de Fate", beforeShort: "AF", afterName: "Depois de Fate", afterShort: "DF" },
    real: { calendarName: "Calendário da vida real", beforeName: "Antes de Cristo", beforeShort: "a.C.", afterName: "Depois de Cristo", afterShort: "d.C." }
  };

  let data = null;
  let doc = null;
  let lanes = null;
  let currentId = null;
  let busy = false;
  let dirty = false;
  let currentView = "gantt";
  let ganttStart = 0;
  let ganttEnd = 0;
  let ganttInitialized = false;
  let selectedEventId = null;
  let activeDrag = null;
  let canvasPan = null;
  let overviewPan = null;
  let toastTimer = null;
  let wheelAccumulator = 0;
  let wheelResetTimer = null;
  let lastWheelZoomAt = 0;
  let renderFrame = null;
  let editMode = "hand";
  let collapsedLanes = new Set();
  let addDraft = null;
  let undoStack = [];
  let redoStack = [];
  let temporaryHandMode = false;
  let lastCursorClientX = null;

  // Layout vertical estável por nível de zoom.
  // O antigo renderer reempacotava apenas os eventos dentro da janela visível;
  // por isso, ao mover alguns anos para a direita, eventos que continuavam na tela
  // pulavam para outra altura. Este cache mantém o slot vertical de cada evento
  // enquanto o zoom não muda.
  let stableTrackLayout = {
    zoomKey: null,
    lanes: new Map()
  };

  function laneColor(lane, index = 0) {
    const own = String(lane?.color || "").trim();
    return /^#[0-9a-f]{6}$/i.test(own)
      ? own
      : LANE_PALETTE[Math.abs(Number(index) || 0) % LANE_PALETTE.length];
  }

  function normalizeLaneColors() {
    if (!doc?.content?.lanes) return;
    doc.content.lanes.forEach((lane, index) => {
      if (!/^#[0-9a-f]{6}$/i.test(String(lane.color || ""))) {
        lane.color = laneColor(lane, index);
      }
    });
    lanes = C.laneMap(doc);
  }

  function toast(message, isError = false) {
    const el = $("toast");
    if (!el) return;
    clearTimeout(toastTimer);
    el.textContent = String(message || "");
    el.className = `toast${isError ? " error" : ""}`;
    toastTimer = setTimeout(() => el.classList.add("hidden"), isError ? 6500 : 3800);
  }

  function updateDirtyUi() {
    $("saveAllBtn").disabled = !dirty || busy;
    $("discardBtn").disabled = !dirty || busy;
    $("saveAllBtn").classList.toggle("attention", dirty && !busy);
  }

  function markDirty(reason = "Alterações pendentes") {
    dirty = true;
    $("dirtyText").textContent = reason;
    updateDirtyUi();
  }

  function markClean() {
    dirty = false;
    $("dirtyText").textContent = "Nenhuma alteração pendente";
    updateDirtyUi();
  }

  function setBusy(value, message = "") {
    busy = Boolean(value);
    if (message) $("saveBadge").textContent = message;
    $("saveBadge").className = `badge ${busy ? "warn" : "ok"}`;
    updateDirtyUi();
  }

  function workerUrl(path = "") {
    const base = String(cfg.workerUrl || "").replace(/\/+$/, "");
    if (!base || base.includes("__WORKER_URL__")) {
      throw new Error("O serviço de edição ainda não foi configurado.");
    }
    return `${base}${path}`;
  }

  async function workerFetch(path, options = {}) {
    const response = await fetch(workerUrl(path), {
      ...options,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || detail.message || `Serviço de edição respondeu ${response.status}.`);
    }
    return response;
  }

  async function loadFromGitHub() {
    const r = await workerFetch("/timeline");
    data = await r.json();
    doc = C.getTimeDocument(data);
    lanes = C.laneMap(doc);
    applyEraLabels();
    fillMonths();
    fillLaneSelects();
    markClean();
    undoStack = [];
    redoStack = [];
    resetStableTrackLayout();
    updateHistoryUi();
    if (!ganttInitialized) initializeGanttRange();
    renderAll();
  }

  async function publish() {
    if (busy) return false;
    if (!dirty) {
      toast("Não há alterações para salvar.");
      return false;
    }

    normalizeLaneColors();
    setBusy(true, "Criando backup e publicando…");

    try {
      await workerFetch("/save", {
        method: "POST",
        body: JSON.stringify({ data })
      });

      markClean();
      setBusy(false, "Publicado");
      toast("Alterações publicadas. A versão anterior continua no histórico.");
      await loadFromGitHub();
      $("saveBadge").textContent = "Edição pública";
      $("saveBadge").className = "badge ok";
      return true;
    } catch (err) {
      setBusy(false, "Erro ao salvar");
      toast(err.message, true);
      return false;
    }
  }

  function fillMonths() {
    const options = C.PT_MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
    $("eventMonth").innerHTML = options;
    $("eventEndMonth").innerHTML = options;
  }

  function fillLaneSelects() {
    const options = doc.content.lanes
      .map(l => `<option value="${C.escapeHtml(l.id)}">${C.escapeHtml(l.name)}</option>`)
      .join("");

    const current = $("laneFilter").value;
    $("eventLane").innerHTML = options;
    $("laneFilter").innerHTML = `<option value="">Todas</option>${options}`;

    if ([...$("laneFilter").options].some(o => o.value === current)) {
      $("laneFilter").value = current;
    }
  }

  function filteredEvents() {
    const q = $("search").value.trim().toLocaleLowerCase("pt-BR");
    const laneFilter = $("laneFilter").value;

    return doc.content.events.filter(event => {
      const laneName = lanes.get(event.laneId)?.name || "";
      const textMatch =
        !q ||
        String(event.name || "").toLocaleLowerCase("pt-BR").includes(q) ||
        laneName.toLocaleLowerCase("pt-BR").includes(q);

      return textMatch && (!laneFilter || event.laneId === laneFilter);
    });
  }

  function renderAll() {
    if (!doc) return;
    lanes = C.laneMap(doc);
    renderList();
    renderSearchResults();
    if (currentView === "gantt") requestAnimationFrame(() => {
      renderGantt();
      renderHistoryNavigator();
    });
  }

  function renderList() {
    const list = [...filteredEvents()].sort((a, b) => Number(b.start) - Number(a.start));
    $("editorCount").textContent = `${list.length} de ${doc.content.events.length}`;
    $("editorList").innerHTML = "";

    for (const event of list) {
      const lane = lanes.get(event.laneId);
      const laneIndex = doc.content.lanes.findIndex(l => l.id === event.laneId);
      const endText = event.end != null && Number(event.end) > Number(event.start)
        ? ` → ${C.formatDate(event.end, C.getCalendar(data, doc))}`
        : "";

      const row = document.createElement("div");
      row.className = "editor-row";
      row.innerHTML = `
        <div class="editor-name"><i class="row-color" style="background:${laneColor(lane, laneIndex)}"></i>${C.escapeHtml(event.name || "Sem nome")}</div>
        <div class="editor-date">${C.escapeHtml(C.formatDate(event.start, C.getCalendar(data, doc)))}${C.escapeHtml(endText)}</div>
        <div class="editor-lane">${C.escapeHtml(lane?.name || "Sem categoria")}</div>
        ${window.TIMELINE_READ_ONLY ? "" : '<button class="button ghost" type="button">Editar</button>'}`;

      row.querySelector("button")?.addEventListener("click", () => openEvent(event.id));
      $("editorList").appendChild(row);
    }
  }


  function setView(view) {
    currentView = view;
    const gantt = view === "gantt";

    $("ganttView").classList.toggle("hidden", !gantt);
    $("listView").classList.toggle("hidden", gantt);
    $("ganttCommandRow").classList.toggle("hidden", !gantt);
    $("ganttTab").classList.toggle("active", gantt);
    $("listTab").classList.toggle("active", !gantt);
    $("ganttTab").setAttribute("aria-selected", String(gantt));
    $("listTab").setAttribute("aria-selected", String(!gantt));
    $("listQuickBtn")?.classList.toggle("active", !gantt);

    if (gantt) requestAnimationFrame(renderGantt);
  }

  function allEventBounds() {
    if (!doc?.content?.events?.length) return { min: 0, max: YEAR };
    let min = Infinity;
    let max = -Infinity;

    for (const event of doc.content.events) {
      const start = Number(event.start || 0);
      const end = event.end != null ? Number(event.end) : start;
      min = Math.min(min, start, end);
      max = Math.max(max, start, end);
    }
    return { min, max };
  }

  function timeSettings() {
    const calendar = C.getCalendar(data, doc);
    const stored = calendar?.timelineSystem || {};
    const preset = stored.preset || "cavaleiros";
    return { preset, ...(TIME_PRESETS[preset] || TIME_PRESETS.cavaleiros), ...stored };
  }

  function configuredTimelineBounds() {
    const range = doc?.content?.timelineRange;
    const start = Number(range?.start);
    const end = Number(range?.end);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? { min: start, max: end } : null;
  }

  function applyEraLabels() {
    if (!doc) return;
    const settings = timeSettings();
    for (const select of document.querySelectorAll('select[id$="Era"]')) {
      const before = select.querySelector('option[value="before"]');
      const after = select.querySelector('option[value="after"]');
      if (before) before.textContent = settings.beforeName;
      if (after) after.textContent = settings.afterName;
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function historyBoundsWithMargin() {
    const { min, max } = allEventBounds();
    const raw = Math.max(DAY, max - min);
    const margin = Math.max(30 * DAY, raw * 0.012);
    return { min: min - margin, max: max + margin, span: raw + margin * 2 };
  }

  function focusEvent(event, preserveScale = true) {
    if (!event) return;

    const currentSpan = Math.max(DAY, ganttEnd - ganttStart);
    const duration = event.end != null
      ? Math.max(0, Number(event.end) - Number(event.start))
      : 0;

    const targetSpan = preserveScale
      ? Math.max(currentSpan, duration > 0 ? duration * 1.5 : 0)
      : Math.max(30 * DAY, duration > 0 ? duration * 1.5 : 3 * YEAR);

    const center = duration > 0
      ? (Number(event.start) + Number(event.end)) / 2
      : Number(event.start);

    ganttStart = Math.round(center - targetSpan / 2);
    ganttEnd = Math.round(center + targetSpan / 2);
    syncScalePreset(ganttEnd - ganttStart);
    renderAll();
  }

  function renderHistoryNavigator() {
    if (!doc?.content?.events?.length) return;

    const { min, max, span } = historyBoundsWithMargin();
    const markers = $("historyOverviewMarkers");
    const windowEl = $("historyOverviewWindow");

    $("historyRangeLabel").textContent = `${formatEventDate(min, span)} — ${formatEventDate(max, span)}`;
    $("historyEventCount").textContent = `${doc.content.events.length} eventos`;

    // Os 862 marcadores não precisam ser reconstruídos a cada pixel de pan.
    // Mantemos todos no DOM e, durante navegação/zoom, atualizamos apenas a janela.
    if (markers.childElementCount !== doc.content.events.length) {
      markers.innerHTML = "";
      const frag = document.createDocumentFragment();

      for (const event of doc.content.events) {
        const lane = lanes.get(event.laneId);
        const laneIndex = doc.content.lanes.findIndex(item => item.id === event.laneId);
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "lk17-history-marker";
        marker.style.setProperty("--lane-color", laneColor(lane, laneIndex));
        marker.style.left = `${clamp((Number(event.start) - min) / span, 0, 1) * 100}%`;
        marker.dataset.eventId = event.id;
        marker.title = `${event.name}\n${formatEventDate(event.start)}\n${lane?.name || ""}`;
        marker.addEventListener("click", pointerEvent => {
          pointerEvent.stopPropagation();
          focusEvent(event, true);
        });
        frag.appendChild(marker);
      }

      markers.appendChild(frag);
    }

    const visibleLeft = clamp((ganttStart - min) / span, 0, 1);
    const visibleRight = clamp((ganttEnd - min) / span, 0, 1);
    const width = Math.max(0.006, visibleRight - visibleLeft);
    windowEl.style.left = `${visibleLeft * 100}%`;
    windowEl.style.width = `${Math.min(1 - visibleLeft, width) * 100}%`;
    windowEl.classList.toggle("is-all", ganttStart <= min && ganttEnd >= max);
  }

  function installHistoryNavigator() {
    const track = $("historyOverviewTrack");
    const windowEl = $("historyOverviewWindow");

    function timeAtOverviewX(clientX) {
      const { min, span } = historyBoundsWithMargin();
      const rect = track.getBoundingClientRect();
      const fraction = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      return min + fraction * span;
    }

    track.addEventListener("click", event => {
      if (event.target.closest(".lk17-history-marker,.lk17-history-window")) return;
      const center = timeAtOverviewX(event.clientX);
      const currentSpan = ganttEnd - ganttStart;
      ganttStart = Math.round(center - currentSpan / 2);
      ganttEnd = Math.round(center + currentSpan / 2);
      renderAll();
    });

    windowEl.addEventListener("pointerdown", event => {
      event.stopPropagation();
      const { span } = historyBoundsWithMargin();
      historyDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        originalStart: ganttStart,
        originalEnd: ganttEnd,
        fullSpan: span,
        width: Math.max(1, track.getBoundingClientRect().width)
      };
      windowEl.setPointerCapture?.(event.pointerId);
      windowEl.classList.add("dragging");
      event.preventDefault();
    });

    windowEl.addEventListener("pointermove", event => {
      if (!historyDrag || historyDrag.pointerId !== event.pointerId) return;
      const delta = ((event.clientX - historyDrag.startX) / historyDrag.width) * historyDrag.fullSpan;
      ganttStart = Math.round(historyDrag.originalStart + delta);
      ganttEnd = Math.round(historyDrag.originalEnd + delta);
      requestGanttRender();
      event.preventDefault();
    });

    const finish = event => {
      if (!historyDrag || historyDrag.pointerId !== event.pointerId) return;
      historyDrag = null;
      windowEl.classList.remove("dragging");
    };

    windowEl.addEventListener("pointerup", finish);
    windowEl.addEventListener("pointercancel", finish);
  }

  function renderSearchResults() {
    const panel = $("searchResults");
    if (!panel || !doc) return;

    const q = $("search").value.trim().toLocaleLowerCase("pt-BR");
    const laneFilter = $("laneFilter").value;

    if (!q && !laneFilter) {
      panel.innerHTML = "";
      panel.classList.add("hidden");
      return;
    }

    const matches = doc.content.events
      .filter(event => {
        const laneName = lanes.get(event.laneId)?.name || "";
        const textMatch = !q
          || String(event.name || "").toLocaleLowerCase("pt-BR").includes(q)
          || laneName.toLocaleLowerCase("pt-BR").includes(q);
        return textMatch && (!laneFilter || event.laneId === laneFilter);
      })
      .sort((a, b) => Number(b.start) - Number(a.start))
      .slice(0, 80);

    panel.innerHTML = "";

    for (const event of matches) {
      const lane = lanes.get(event.laneId);
      const laneIndex = doc.content.lanes.findIndex(item => item.id === event.laneId);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lk17-search-result";
      button.innerHTML = `
        <i style="--lane-color:${laneColor(lane, laneIndex)}"></i>
        <span><strong>${C.escapeHtml(event.name || "Sem nome")}</strong><small>${C.escapeHtml(formatEventDate(event.start))} · ${C.escapeHtml(lane?.name || "")}</small></span>
      `;
      button.addEventListener("click", () => {
        focusEvent(event, true);
        $("searchPanel").classList.add("hidden");
      });
      panel.appendChild(button);
    }

    if (!matches.length) {
      panel.innerHTML = `<div class="lk17-search-empty">Nenhum acontecimento encontrado.</div>`;
    }

    panel.classList.remove("hidden");
  }

  function fitAll() {
    const configured = configuredTimelineBounds();
    const { min, max } = configured || allEventBounds();
    const raw = Math.max(DAY, max - min);
    const margin = configured ? 0 : Math.max(30 * DAY, raw * 0.025);
    ganttStart = Math.floor(min - margin);
    ganttEnd = Math.ceil(max + margin);
    ganttInitialized = true;
    syncScalePreset(ganttEnd - ganttStart);
    renderGantt();
  }

  function initializeGanttRange() {
    fitAll();
  }

  function humanSpan(span) {
    const total = Math.max(1, Number(span) || 1);
    if (total < DAY) return `${Math.max(1, Math.round(total / HOUR))} h`;
    if (total < 90 * DAY) return `${Math.max(1, Math.round(total / DAY))} dias`;
    if (total < YEAR) return `${Math.max(1, Math.round(total / (30 * DAY)))} meses`;
    const years = total / YEAR;
    if (years < 10) return `${years.toFixed(1)} anos`;
    return `${Math.round(years)} anos`;
  }

  function zoomResolutionName(span) {
    if (span > 1200 * YEAR) return "Milênios";
    if (span > 120 * YEAR) return "Séculos";
    if (span > 12 * YEAR) return "Décadas";
    if (span > 18 * 30 * DAY) return "Anos";
    if (span > 75 * DAY) return "Meses";
    if (span > 3 * DAY) return "Dias";
    return "Horas";
  }

  function maximumAllowedSpan() {
    const configured = configuredTimelineBounds();
    if (configured) return Math.max(MIN_GANTT_SPAN, configured.max - configured.min);
    const { min, max } = allEventBounds();
    return Math.max(5000 * YEAR, (max - min) * 2);
  }

  function syncScalePreset(span) {
    const select = $("scalePreset");
    const options = [...select.options].map(option => Number(option.value));
    let closest = options[0];

    for (const value of options) {
      if (Math.abs(value - span) < Math.abs(closest - span)) closest = value;
    }

    select.value = String(closest);
    $("liveScaleLabel").textContent = `Janela: ${humanSpan(span)}`;
    $("zoomResolutionLabel").textContent = zoomResolutionName(span);
  }

  function setGanttSpan(span) {
    span = clamp(Number(span), MIN_GANTT_SPAN, maximumAllowedSpan());
    const center = (ganttStart + ganttEnd) / 2;
    ganttStart = Math.round(center - span / 2);
    ganttEnd = Math.round(ganttStart + span);
    syncScalePreset(span);
    renderGantt();
  }

  function zoomLevelForDirection(currentSpan, direction) {
    const levels = ZOOM_LEVELS.filter(level => level <= maximumAllowedSpan());

    if (direction < 0) {
      for (let i = levels.length - 1; i >= 0; i--) {
        if (levels[i] < currentSpan * 0.985) return levels[i];
      }
      return MIN_GANTT_SPAN;
    }

    for (const level of levels) {
      if (level > currentSpan * 1.015) return level;
    }
    return maximumAllowedSpan();
  }

  function axisRect() {
    return $("ganttAxis").getBoundingClientRect();
  }

  function timeAtClientX(clientX) {
    const rect = axisRect();
    const fraction = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    return ganttStart + fraction * (ganttEnd - ganttStart);
  }

  function clientXForTime(time) {
    const rect = axisRect();
    const fraction = (time - ganttStart) / Math.max(1, ganttEnd - ganttStart);
    return rect.left + fraction * rect.width;
  }

  function zoomToSpanAtClientX(targetSpan, clientX = null) {
    const oldSpan = ganttEnd - ganttStart;
    targetSpan = clamp(Number(targetSpan), MIN_GANTT_SPAN, maximumAllowedSpan());

    const rect = axisRect();
    const fraction = clientX == null
      ? 0.5
      : clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);

    const anchorTime = ganttStart + fraction * oldSpan;
    ganttStart = Math.round(anchorTime - fraction * targetSpan);
    ganttEnd = Math.round(ganttStart + targetSpan);

    syncScalePreset(targetSpan);
    renderGantt();
    updateCursorDateLabel(clientX);
  }

  function stepZoom(direction, clientX = null) {
    const current = ganttEnd - ganttStart;
    zoomToSpanAtClientX(zoomLevelForDirection(current, direction), clientX);
  }

  function updateCursorDateLabel(clientX) {
    if (clientX == null || !doc) return;
    const rect = axisRect();
    if (clientX < rect.left || clientX > rect.right) return;

    lastCursorClientX = clientX;
    $("cursorDateLabel").textContent = `Sob o mouse: ${formatEventDate(timeAtClientX(clientX), ganttEnd - ganttStart)}`;
  }

  function requestGanttRender() {
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = null;
      renderGantt();
    });
  }

  function focusRecent() {
    const { max } = allEventBounds();
    const currentSpan = ganttEnd - ganttStart;
    const targetSpan = currentSpan > 30 * DAY ? 30 * DAY : currentSpan;
    ganttEnd = Math.round(max + targetSpan * 0.08);
    ganttStart = Math.round(ganttEnd - targetSpan);
    syncScalePreset(targetSpan);
    renderGantt();
  }

  function snapMinutes() {
    const span = ganttEnd - ganttStart;
    if (span <= DAY) return 15;
    if (span <= 7 * DAY) return 60;
    if (span <= 30 * DAY) return 6 * HOUR;
    if (span <= YEAR) return DAY;
    if (span <= 5 * YEAR) return 7 * DAY;
    if (span <= 30 * YEAR) return 30 * DAY;
    if (span <= 300 * YEAR) return YEAR;
    if (span <= 1000 * YEAR) return 5 * YEAR;
    return 10 * YEAR;
  }

  function snapLabel(minutes) {
    if (minutes < 60) return `${minutes} min`;
    if (minutes < DAY) return `${Math.round(minutes / 60)} h`;
    if (minutes < YEAR) return `${Math.round(minutes / DAY)} dias`;
    const years = Math.round(minutes / YEAR);
    return `${years} ano${years === 1 ? "" : "s"}`;
  }

  function detailLevelForSpan() {
    // O campo detail continua existindo como metadado do acontecimento,
    // mas NUNCA é usado para esconder eventos no Gantt.
    return 4;
  }

  function detailExplanation() {
    return "todos os acontecimentos";
  }

  function axisSpec(span) {
    if (span > 2200 * YEAR) return { major: 1000 * YEAR, minor: 250 * YEAR };
    if (span > 900 * YEAR) return { major: 500 * YEAR, minor: 100 * YEAR };
    if (span > 250 * YEAR) return { major: 100 * YEAR, minor: 20 * YEAR };
    if (span > 80 * YEAR) return { major: 50 * YEAR, minor: 10 * YEAR };
    if (span > 20 * YEAR) return { major: 10 * YEAR, minor: 2 * YEAR };
    if (span > 5 * YEAR) return { major: 5 * YEAR, minor: YEAR };
    if (span > 18 * 30 * DAY) return { major: YEAR, minor: 90 * DAY };
    if (span > 180 * DAY) return { major: 90 * DAY, minor: 30 * DAY };
    if (span > 60 * DAY) return { major: 30 * DAY, minor: 7 * DAY };
    if (span > 14 * DAY) return { major: 7 * DAY, minor: DAY };
    if (span > 3 * DAY) return { major: DAY, minor: 6 * HOUR };
    if (span > DAY) return { major: 12 * HOUR, minor: 3 * HOUR };
    return { major: 6 * HOUR, minor: HOUR };
  }

  function shortMonth(month) {
    return C.PT_MONTHS[Math.max(0, Math.min(11, month - 1))].slice(0, 3);
  }

  function eraShort(date) {
    const settings = timeSettings();
    return date.era === "before" ? settings.beforeShort : settings.afterShort;
  }

  function formatAxisLabel(minutes, step, major = false) {
    const date = C.minutesToDate(Math.round(minutes));

    if (step >= YEAR) return `${date.year} ${eraShort(date)}`;
    if (step >= 30 * DAY) return `${shortMonth(date.month)} ${date.year} ${eraShort(date)}`;
    if (step >= DAY) return major
      ? `${date.day} ${shortMonth(date.month)} ${date.year}`
      : `${date.day} ${shortMonth(date.month)}`;

    return major
      ? `${date.day} ${shortMonth(date.month)}`
      : `${String(date.hour).padStart(2, "0")}:${String(date.minute).padStart(2, "0")}`;
  }

  function formatEventDate(minutes, span = ganttEnd - ganttStart) {
    const date = C.minutesToDate(Math.round(minutes));
    if (span > 5 * YEAR) return `${date.year} ${eraShort(date)}`;
    if (span > 90 * DAY) return `${shortMonth(date.month)} ${date.year} ${eraShort(date)}`;
    if (span > 3 * DAY) return `${date.day} de ${C.PT_MONTHS[date.month - 1]} de ${date.year} ${eraShort(date)}`;
    return `${date.day} ${shortMonth(date.month)} ${date.year} · ${String(date.hour).padStart(2, "0")}:${String(date.minute).padStart(2, "0")}`;
  }

  function updateJumpDateLabel() {
    const center = Math.round((ganttStart + ganttEnd) / 2);
    const date = C.minutesToDate(center);
    $("jumpDateLabel").textContent = `${date.day} ${shortMonth(date.month)} ${date.year} ${eraShort(date)}`;
  }

  function fillJumpMonths() {
    $("jumpMonth").innerHTML = C.PT_MONTHS.map((month, index) => `<option value="${index + 1}">${month}</option>`).join("");
  }

  function openJumpDate() {
    const center = C.minutesToDate(Math.round((ganttStart + ganttEnd) / 2));
    $("jumpEra").value = center.era;
    $("jumpYear").value = center.year;
    $("jumpMonth").value = center.month;
    $("jumpDay").value = center.day;
    $("jumpHour").value = center.hour;
    $("jumpMinute").value = center.minute;
    $("jumpDateDialog").showModal();
  }

  function applyJumpDate(event) {
    event.preventDefault();
    const target = C.dateToMinutes({
      era: $("jumpEra").value,
      year: Number($("jumpYear").value),
      month: Number($("jumpMonth").value),
      day: Number($("jumpDay").value),
      hour: Number($("jumpHour").value),
      minute: Number($("jumpMinute").value)
    });
    const span = ganttEnd - ganttStart;
    ganttStart = Math.round(target - span / 2);
    ganttEnd = Math.round(target + span / 2);
    $("jumpDateDialog").close();
    renderGantt();
  }

  function openTimeSystemInfo() {
    const calendar = C.getCalendar(data, doc);
    const settings = timeSettings();
    const range = configuredTimelineBounds() || allEventBounds();
    const start = C.minutesToDate(range.min);
    const end = C.minutesToDate(range.max);
    const months = Array.isArray(calendar?.months) ? calendar.months.map(month => month.name).join(", ") : C.PT_MONTHS.join(", ");
    $("timeSystemBody").innerHTML = `
      <div><strong>${C.escapeHtml(calendar?.name || "Cavaleiros")}</strong><div class="muted">Sistema usado por esta linha do tempo.</div></div>
      <div class="detail-row"><strong>Eras</strong><div class="muted">${C.escapeHtml(settings.beforeName)} (${C.escapeHtml(settings.beforeShort)}) · ${C.escapeHtml(settings.afterName)} (${C.escapeHtml(settings.afterShort)})</div></div>
      <div class="detail-row"><strong>Intervalo</strong><div class="muted">${start.year} ${C.escapeHtml(eraShort(start))} — ${end.year} ${C.escapeHtml(eraShort(end))}</div></div>
      <div class="detail-row"><strong>Meses</strong><div class="muted">${C.escapeHtml(months)}</div></div>`;

    $("timePreset").value = settings.preset;
    $("timeBeforeName").value = settings.beforeName;
    $("timeBeforeShort").value = settings.beforeShort;
    $("timeAfterName").value = settings.afterName;
    $("timeAfterShort").value = settings.afterShort;
    $("timeStartEra").value = start.era;
    $("timeStartYear").value = start.year;
    $("timeEndEra").value = end.era;
    $("timeEndYear").value = end.year;
    $("timeSystemEditor").classList.toggle("hidden", window.TIMELINE_READ_ONLY === true);
    $("saveTimeSystem").classList.toggle("hidden", window.TIMELINE_READ_ONLY === true);
    $("timeSystemDialog").showModal();
  }

  function applyTimePreset() {
    const preset = TIME_PRESETS[$("timePreset").value];
    if (!preset) return;
    $("timeBeforeName").value = preset.beforeName;
    $("timeBeforeShort").value = preset.beforeShort;
    $("timeAfterName").value = preset.afterName;
    $("timeAfterShort").value = preset.afterShort;
  }

  function saveTimeSystem(event) {
    event.preventDefault();
    if (window.TIMELINE_READ_ONLY === true) return;

    const start = C.dateToMinutes({ era: $("timeStartEra").value, year: Number($("timeStartYear").value), month: 1, day: 1 });
    const end = C.dateToMinutes({ era: $("timeEndEra").value, year: Number($("timeEndYear").value), month: 12, day: 31, hour: 23, minute: 59 });
    if (end <= start) {
      toast("O fim da timeline precisa acontecer depois do início.", true);
      return;
    }
    const outside = doc.content.events.some(item => {
      const eventStart = Number(item.start);
      const eventEnd = item.end != null ? Number(item.end) : eventStart;
      return eventStart < start || eventEnd > end;
    });
    if (outside) {
      toast("Existem acontecimentos fora desse intervalo. Amplie o início ou o fim antes de aplicar.", true);
      return;
    }

    const calendar = C.getCalendar(data, doc);
    const preset = TIME_PRESETS[$("timePreset").value];
    if (preset) calendar.name = preset.calendarName;
    calendar.timelineSystem = {
      preset: $("timePreset").value,
      beforeName: $("timeBeforeName").value.trim(),
      beforeShort: $("timeBeforeShort").value.trim(),
      afterName: $("timeAfterName").value.trim(),
      afterShort: $("timeAfterShort").value.trim()
    };
    doc.content.timelineRange = { start, end };
    applyEraLabels();
    resetStableTrackLayout();
    markDirty("Configuração de tempo alterada");
    $("timeSystemDialog").close();
    fitAll();
    renderAll();
  }

  function ticksForStep(step) {
    const start = Math.floor(ganttStart / step) * step;
    const ticks = [];
    for (let value = start; value <= ganttEnd + step; value += step) {
      if (value < ganttStart - step * 0.02) continue;
      const pct = ((value - ganttStart) / (ganttEnd - ganttStart)) * 100;
      if (pct < -1 || pct > 101) continue;
      ticks.push({ value, pct });
      if (ticks.length > 160) break;
    }
    return ticks;
  }

  function renderAxis() {
    const span = ganttEnd - ganttStart;
    const spec = axisSpec(span);
    const major = $("ganttAxisMajor");
    const minor = $("ganttAxisMinor");
    major.innerHTML = "";
    minor.innerHTML = "";

    for (const tick of ticksForStep(spec.major)) {
      const el = document.createElement("div");
      el.className = "lk-axis-tick major-tick";
      el.style.left = `${tick.pct}%`;
      el.innerHTML = `<span>${C.escapeHtml(formatAxisLabel(tick.value, spec.major, true))}</span>`;
      major.appendChild(el);
    }

    for (const tick of ticksForStep(spec.minor)) {
      const el = document.createElement("div");
      el.className = "lk-axis-tick minor-tick";
      el.style.left = `${tick.pct}%`;
      el.innerHTML = `<span>${C.escapeHtml(formatAxisLabel(tick.value, spec.minor, false))}</span>`;
      minor.appendChild(el);
    }
  }

  function addGridLines(track) {
    const span = ganttEnd - ganttStart;
    const spec = axisSpec(span);

    for (const tick of ticksForStep(spec.minor)) {
      const line = document.createElement("i");
      line.className = "gantt-gridline minor-gridline";
      line.style.left = `${tick.pct}%`;
      track.appendChild(line);
    }

    for (const tick of ticksForStep(spec.major)) {
      const line = document.createElement("i");
      line.className = "gantt-gridline major-gridline";
      line.style.left = `${tick.pct}%`;
      track.appendChild(line);
    }
  }

  function estimateLabelWidth(event, span) {
    const base = Math.max(165, Math.min(360, 72 + String(event.name || "").length * 6.2));
    if (span > 500 * YEAR) return Math.min(base, 205);
    if (span > 50 * YEAR) return Math.min(base, 240);
    return base;
  }

  function resetStableTrackLayout() {
    stableTrackLayout = {
      zoomKey: null,
      lanes: new Map()
    };
  }

  function stableZoomKey(span) {
    // O pan mantém o mesmo span, então a chave não muda.
    // O zoom cria uma nova chave e permite um novo empacotamento adequado à escala.
    return Math.round(Number(span));
  }

  function ensureStableTrackLayout(span) {
    const key = stableZoomKey(span);
    if (stableTrackLayout.zoomKey !== key) {
      stableTrackLayout = {
        zoomKey: key,
        lanes: new Map()
      };
    }
  }

  function laneTrackState(laneId, span) {
    ensureStableTrackLayout(span);
    if (!stableTrackLayout.lanes.has(laneId)) {
      stableTrackLayout.lanes.set(laneId, {
        tracks: new Map(),
        maxTrackSeen: -1
      });
    }
    return stableTrackLayout.lanes.get(laneId);
  }

  function eventLayoutFootprint(event, plotWidth, span) {
    const start = Number(event.start || 0);
    const actualEnd = event.end != null && Number(event.end) > start
      ? Number(event.end)
      : start;
    const minutesPerPixel = span / Math.max(1, plotWidth);
    const labelWidth = estimateLabelWidth(event, span);
    const labelTail = (labelWidth + (actualEnd > start ? 14 : 0)) * minutesPerPixel;

    return {
      start,
      end: actualEnd + labelTail
    };
  }

  function footprintsOverlap(a, b, gapMinutes) {
    return a.start < b.end + gapMinutes && b.start < a.end + gapMinutes;
  }

  function assignStableTracks(laneId, allLaneEvents, visibleGeometries, plotWidth, span) {
    const state = laneTrackState(laneId, span);
    const ids = new Set(allLaneEvents.map(event => event.id));

    // Remove entradas de acontecimentos que deixaram de existir ou mudaram de lane.
    for (const id of [...state.tracks.keys()]) {
      if (!ids.has(id)) state.tracks.delete(id);
    }

    const eventById = new Map(allLaneEvents.map(event => [event.id, event]));
    const occupancy = new Map();
    const gapMinutes = 10 * (span / Math.max(1, plotWidth));

    // Os slots já atribuídos permanecem exatamente onde estavam.
    for (const [id, track] of state.tracks.entries()) {
      const event = eventById.get(id);
      if (!event) continue;
      if (!occupancy.has(track)) occupancy.set(track, []);
      occupancy.get(track).push(eventLayoutFootprint(event, plotWidth, span));
    }

    // Pré-carrega também eventos próximos às bordas. Assim eles já possuem um slot
    // antes de entrarem na tela e não provocam reordenação no primeiro pixel de pan.
    const preloadStart = ganttStart - span * 0.8;
    const preloadEnd = ganttEnd + span * 0.8;
    const candidateIds = new Set(visibleGeometries.map(geometry => geometry.event.id));
    const candidates = allLaneEvents
      .filter(event => {
        const start = Number(event.start || 0);
        const end = event.end != null ? Number(event.end) : start;
        return candidateIds.has(event.id) || (end >= preloadStart && start <= preloadEnd);
      })
      .sort((a, b) =>
        Number(a.start || 0) - Number(b.start || 0) ||
        String(a.pos || '').localeCompare(String(b.pos || '')) ||
        String(a.id || '').localeCompare(String(b.id || ''))
      );

    for (const event of candidates) {
      if (state.tracks.has(event.id)) continue;

      const footprint = eventLayoutFootprint(event, plotWidth, span);
      let track = 0;

      while (true) {
        const intervals = occupancy.get(track) || [];
        const collision = intervals.some(interval => footprintsOverlap(footprint, interval, gapMinutes));
        if (!collision) break;
        track += 1;
      }

      state.tracks.set(event.id, track);
      if (!occupancy.has(track)) occupancy.set(track, []);
      occupancy.get(track).push(footprint);
      state.maxTrackSeen = Math.max(state.maxTrackSeen, track);
    }

    // Aplica os slots persistentes às geometrias atualmente desenhadas.
    for (const geometry of visibleGeometries) {
      if (!state.tracks.has(geometry.event.id)) {
        // Fallback extremamente defensivo; normalmente o evento já entrou em candidates.
        state.tracks.set(geometry.event.id, 0);
      }
      geometry.track = state.tracks.get(geometry.event.id);
      state.maxTrackSeen = Math.max(state.maxTrackSeen, geometry.track);
    }

    // A altura não diminui durante o pan. Isso evita que todas as categorias abaixo
    // subam/desçam quando um evento sai pela borda esquerda.
    return Math.max(1, state.maxTrackSeen + 1);
  }

  function invalidateStableTrackForEvent(eventId) {
    for (const state of stableTrackLayout.lanes.values()) {
      state.tracks.delete(eventId);
    }
  }

  function pointGeometry(event, plotWidth, span) {
    const time = Number(event.start || 0);
    const x = ((time - ganttStart) / span) * plotWidth;
    const width = estimateLabelWidth(event, span);

    // Nunca troca o texto para a esquerda só para mantê-lo na tela.
    // A data do acontecimento é a âncora fixa; o texto sempre nasce à direita.
    // Se estiver perto da borda, ele pode ser cortado pelo viewport, como no
    // comportamento esperado pelo usuário.
    const left = x;

    return {
      kind: "point",
      event,
      x,
      left,
      right: left + width,
      width,
      side: "right",
      track: 0
    };
  }

  function rangeGeometry(event, plotWidth, span) {
    const start = Number(event.start || 0);
    const end = Math.max(start, Number(event.end || start));
    const startX = ((start - ganttStart) / span) * plotWidth;
    const endX = ((end - ganttStart) / span) * plotWidth;
    const visibleStart = clamp(startX, 0, plotWidth);
    const visibleEnd = clamp(endX, 0, plotWidth);
    const barWidth = Math.max(5, visibleEnd - visibleStart);
    const labelWidth = estimateLabelWidth(event, span);

    // A barra continua proporcional ao intervalo real visível.
    // O texto nunca entra na barra e nunca muda de lado: fica sempre à direita.
    // Se a direita estiver fora da tela, o próprio viewport corta o texto.
    const outerWidth = barWidth + 14 + labelWidth;

    return {
      kind: "range",
      event,
      startX: visibleStart,
      endX: visibleEnd,
      left: visibleStart,
      right: visibleStart + outerWidth,
      barWidth,
      outerWidth,
      labelInside: false,
      track: 0
    };
  }

  function packTracks(geometries) {
    const ends = [];
    for (const geometry of geometries.sort((a, b) => a.left - b.left)) {
      let track = ends.findIndex(end => geometry.left >= end + 10);
      if (track < 0) {
        track = ends.length;
        ends.push(geometry.right);
      } else {
        ends[track] = geometry.right;
      }
      geometry.track = track;
    }
    return ends.length;
  }

  function calendarGlyph() {
    return `<span class="calendar-glyph" aria-hidden="true">▦</span>`;
  }

  function buildPointItem(geometry, lane, color) {
    const event = geometry.event;
    const item = document.createElement("button");
    item.type = "button";
    item.className = `lk-event-item lk-point-event side-right${selectedEventId === event.id ? " selected" : ""}`;
    item.dataset.eventId = event.id;
    item.dataset.track = String(geometry.track);
    item.style.setProperty("--lane-color", color);
    item.style.left = `${geometry.left}px`;
    item.style.top = `${8 + geometry.track * 48}px`;
    item.style.width = `${geometry.width}px`;

    item.innerHTML = `<span class="event-stem"></span>${calendarGlyph()}<span class="event-copy"><strong>${C.escapeHtml(event.name || "Sem nome")}</strong><small>${C.escapeHtml(formatEventDate(event.start))}</small></span>`;

    item.title = `${event.name}\n${C.formatDate(event.start, C.getCalendar(data, doc))}\n${lane.name}`;
    installEventInteraction(item, event, geometry);
    return item;
  }

  function buildRangeItem(geometry, lane, color) {
    const event = geometry.event;
    const item = document.createElement("button");
    item.type = "button";
    item.className = `lk-event-item lk-range-event label-outside${selectedEventId === event.id ? " selected" : ""}`;
    item.dataset.eventId = event.id;
    item.dataset.track = String(geometry.track);
    item.style.setProperty("--lane-color", color);
    item.style.left = `${geometry.left}px`;
    item.style.top = `${8 + geometry.track * 48}px`;
    item.style.width = `${geometry.outerWidth}px`;

    item.innerHTML = `
      <span class="range-bar" style="width:${geometry.barWidth}px">
        <span class="resize-handle left" data-resize="start" aria-hidden="true"></span>
        <span class="resize-handle right" data-resize="end" aria-hidden="true"></span>
      </span>
      ${calendarGlyph()}
      <span class="event-copy"><strong>${C.escapeHtml(event.name || "Sem nome")}</strong><small>${C.escapeHtml(formatEventDate(event.start))} → ${C.escapeHtml(formatEventDate(event.end))}</small></span>
    `;

    item.title = `${event.name}\n${C.formatDate(event.start, C.getCalendar(data, doc))} → ${C.formatDate(event.end, C.getCalendar(data, doc))}\n${lane.name}`;
    installEventInteraction(item, event, geometry);
    return item;
  }

  function renderGantt() {
    if (!doc || currentView !== "gantt") return;
    if (!Number.isFinite(ganttStart) || !Number.isFinite(ganttEnd) || ganttEnd <= ganttStart) {
      initializeGanttRange();
      return;
    }

    const configured = configuredTimelineBounds();
    if (configured) {
      const allowedSpan = configured.max - configured.min;
      const currentSpan = ganttEnd - ganttStart;
      if (currentSpan >= allowedSpan) {
        ganttStart = configured.min;
        ganttEnd = configured.max;
      } else if (ganttStart < configured.min) {
        ganttStart = configured.min;
        ganttEnd = configured.min + currentSpan;
      } else if (ganttEnd > configured.max) {
        ganttEnd = configured.max;
        ganttStart = configured.max - currentSpan;
      }
    }

    const span = ganttEnd - ganttStart;
    const scroller = $("ganttScroller");
    const plotWidth = Math.max(640, scroller.clientWidth - LANE_WIDTH);
    $("ganttRange").textContent = `${formatEventDate(ganttStart, span)}  —  ${formatEventDate(ganttEnd, span)}`;
    $("snapInfo").textContent = `Precisão ao arrastar: ${snapLabel(snapMinutes())}`;
    $("detailLevelLabel").textContent = "Todos os acontecimentos";
    $("liveScaleLabel").textContent = `Janela: ${humanSpan(span)}`;
    updateJumpDateLabel();
    syncScalePreset(span);
    renderAxis();

    const filtered = filteredEvents();
    const inRange = filtered.filter(event => {
      const start = Number(event.start || 0);
      const end = event.end != null ? Number(event.end) : start;

      // Eventos com duração continuam visíveis enquanto a duração cruza a janela.
      if (end > start) {
        return end >= ganttStart && start <= ganttEnd;
      }

      // Em eventos pontuais, o marcador pode já ter saído pela borda esquerda
      // enquanto o ícone/texto ainda ocupam parte da tela. O evento só some
      // quando a largura visual inteira deixa o viewport.
      const footprint = eventLayoutFootprint(event, plotWidth, span);
      return footprint.end >= ganttStart && footprint.start <= ganttEnd;
    });

    // Todos os acontecimentos continuam fazendo parte do diagrama em qualquer zoom.
    // A janela principal desenha os que cruzam a época visível; o mapa global acima
    // mantém TODOS os eventos permanentemente localizáveis e navegáveis.
    const shown = inRange;
    const filterActive = Boolean($("search").value.trim() || $("laneFilter").value);
    $("ganttVisibleCount").textContent = filterActive
      ? `${shown.length} na tela · ${filtered.length} encontrados`
      : `${shown.length} na tela · ${doc.content.events.length} no mapa`;

    const laneFilter = $("laneFilter").value;
    let laneList = doc.content.lanes.filter(lane => !laneFilter || lane.id === laneFilter);

    if ($("search").value.trim()) {
      const laneIds = new Set(inRange.map(event => event.laneId));
      laneList = laneList.filter(lane => laneIds.has(lane.id));
    }

    const rows = $("ganttRows");
    rows.innerHTML = "";

    for (const [laneIndex, lane] of laneList.entries()) {
      const globalIndex = doc.content.lanes.findIndex(item => item.id === lane.id);
      const color = laneColor(lane, globalIndex >= 0 ? globalIndex : laneIndex);
      const allLaneEvents = filtered
        .filter(event => event.laneId === lane.id)
        .sort((a, b) => Number(a.start) - Number(b.start));
      const laneEvents = shown.filter(event => event.laneId === lane.id);
      const previousEvents = allLaneEvents.filter(event => {
        const start = Number(event.start || 0);
        const end = event.end != null ? Number(event.end) : start;
        if (end > start) return end < ganttStart;
        return eventLayoutFootprint(event, plotWidth, span).end < ganttStart;
      });
      const nextEvents = allLaneEvents.filter(event => Number(event.start) > ganttEnd);
      const previousEvent = previousEvents.length ? previousEvents[previousEvents.length - 1] : null;
      const nextEvent = nextEvents.length ? nextEvents[0] : null;
      const collapsed = collapsedLanes.has(lane.id);

      const geometries = collapsed ? [] : laneEvents.map(event =>
        event.end != null && Number(event.end) > Number(event.start)
          ? rangeGeometry(event, plotWidth, span)
          : pointGeometry(event, plotWidth, span)
      );

      const layoutLaneEvents = doc.content.events
        .filter(event => event.laneId === lane.id)
        .sort((a, b) => Number(a.start) - Number(b.start));
      const trackCount = collapsed
        ? 0
        : assignStableTracks(lane.id, layoutLaneEvents, geometries, plotWidth, span);
      const rowHeight = collapsed ? 48 : Math.max(72, 20 + Math.max(1, trackCount) * 48);

      const row = document.createElement("div");
      row.className = `gantt-lane-row lk-lane-row${collapsed ? " collapsed" : ""}`;
      row.dataset.laneId = lane.id;
      row.style.minHeight = `${rowHeight}px`;
      row.innerHTML = `
        <div class="gantt-lane-label lk-lane-label" style="min-height:${rowHeight}px">
          <button class="lane-collapse-btn" type="button" aria-label="${collapsed ? "Expandir" : "Recolher"} ${C.escapeHtml(lane.name)}">${collapsed ? "›" : "⌄"}</button>
          <span class="lane-sigil" style="--lane-color:${color}"></span>
          <span class="lane-label-text">
            <strong>${C.escapeHtml(lane.name)}</strong>
            <small>${laneEvents.length} na tela · ${allLaneEvents.length} no total</small>
          </span>
        </div>
        <div class="gantt-track lk-track" style="min-height:${rowHeight}px"></div>`;

      row.querySelector(".lane-collapse-btn").addEventListener("click", event => {
        event.stopPropagation();
        if (collapsedLanes.has(lane.id)) collapsedLanes.delete(lane.id);
        else collapsedLanes.add(lane.id);
        renderGantt();
      });

      const track = row.querySelector(".gantt-track");
      addGridLines(track);
      installTrackInteraction(track, lane.id);

      if (!collapsed && previousEvent) {
        const leftNav = document.createElement("button");
        leftNav.type = "button";
        leftNav.className = "lk17-offscreen-nav left";
        leftNav.innerHTML = `← <strong>${previousEvents.length}</strong>`;
        leftNav.title = `Evento anterior: ${previousEvent.name}\n${formatEventDate(previousEvent.start)}`;
        leftNav.addEventListener("click", event => {
          event.stopPropagation();
          focusEvent(previousEvent, true);
        });
        track.appendChild(leftNav);
      }

      if (!collapsed && nextEvent) {
        const rightNav = document.createElement("button");
        rightNav.type = "button";
        rightNav.className = "lk17-offscreen-nav right";
        rightNav.innerHTML = `<strong>${nextEvents.length}</strong> →`;
        rightNav.title = `Próximo evento: ${nextEvent.name}\n${formatEventDate(nextEvent.start)}`;
        rightNav.addEventListener("click", event => {
          event.stopPropagation();
          focusEvent(nextEvent, true);
        });
        track.appendChild(rightNav);
      }

      for (const geometry of geometries) {
        const item = geometry.kind === "range"
          ? buildRangeItem(geometry, lane, color)
          : buildPointItem(geometry, lane, color);
        track.appendChild(item);
      }

      rows.appendChild(row);
    }

    if (!laneList.length) {
      rows.innerHTML = `<div class="gantt-empty">Nenhuma categoria corresponde aos filtros atuais.</div>`;
    }

    renderHistoryNavigator();
    updateModeUi();
    if (lastCursorClientX != null) updateCursorDateLabel(lastCursorClientX);
  }

  const MODE_HINT_STORAGE_KEY = "cavaleiros_gantt_help_hidden";

  function setModeHintVisible(visible, persist = true) {
    const hint = $("modeHint");
    if (!hint) return;
    hint.classList.toggle("is-hidden", !visible);
    $("helpBtn")?.classList.toggle("help-active", visible);
    if (persist) {
      try {
        localStorage.setItem(MODE_HINT_STORAGE_KEY, visible ? "0" : "1");
      } catch {}
    }
  }

  function restoreModeHintPreference() {
    let hidden = false;
    try {
      hidden = localStorage.getItem(MODE_HINT_STORAGE_KEY) === "1";
    } catch {}
    setModeHintVisible(!hidden, false);
  }

  function setEditMode(mode) {
    editMode = mode;
    updateModeUi();
  }

  function updateModeUi() {
    const modes = {
      pointer: $("modePointer"),
      hand: $("modeHand"),
      add: $("modeAdd")
    };

    Object.entries(modes).forEach(([name, button]) => {
      button.classList.toggle("active", name === editMode);
      button.setAttribute("aria-pressed", String(name === editMode));
    });

    const hintText = $("modeHintText");
    if (hintText) {
      if (editMode === "hand") {
        hintText.textContent = "Mover: arraste a linha do tempo. A rodinha aproxima ou afasta no ponto do mouse.";
      } else if (editMode === "pointer") {
        hintText.textContent = "Selecionar: clique para editar. Arraste um acontecimento para mudar sua data.";
      } else {
        hintText.textContent = "Adicionar: clique para criar um ponto ou clique e arraste para criar um intervalo.";
      }
    }

    $("ganttScroller").classList.toggle("mode-hand", editMode === "hand");
    $("ganttScroller").classList.toggle("mode-pointer", editMode === "pointer");
    $("ganttScroller").classList.toggle("mode-add", editMode === "add");
  }

  function snapshotData() {
    return JSON.stringify(data);
  }

  function pushUndoSnapshot(snapshot) {
    if (!snapshot) return;
    undoStack.push(snapshot);
    if (undoStack.length > 40) undoStack.shift();
    redoStack = [];
    updateHistoryUi();
  }

  function pushUndo() {
    pushUndoSnapshot(snapshotData());
  }

  function restoreDataSnapshot(snapshot) {
    data = JSON.parse(snapshot);
    doc = C.getTimeDocument(data);
    lanes = C.laneMap(doc);
    resetStableTrackLayout();
    fillLaneSelects();
    renderAll();
  }

  function undo() {
    if (!undoStack.length || busy) return;
    redoStack.push(snapshotData());
    const snapshot = undoStack.pop();
    restoreDataSnapshot(snapshot);
    markDirty("Alteração desfeita");
    updateHistoryUi();
  }

  function redo() {
    if (!redoStack.length || busy) return;
    undoStack.push(snapshotData());
    const snapshot = redoStack.pop();
    restoreDataSnapshot(snapshot);
    markDirty("Alteração refeita");
    updateHistoryUi();
  }

  function updateHistoryUi() {
    $("undoBtn").disabled = !undoStack.length || busy;
    $("redoBtn").disabled = !redoStack.length || busy;
  }

  function updateDraggedEventItem(item, event) {
    const span = ganttEnd - ganttStart;
    const rect = axisRect();
    const plotWidth = Math.max(640, rect.width);

    if (event.end != null && Number(event.end) > Number(event.start)) {
      const geometry = rangeGeometry(event, plotWidth, span);
      item.style.left = `${geometry.left}px`;
      item.style.width = `${geometry.outerWidth}px`;
      const bar = item.querySelector(".range-bar");
      if (bar) bar.style.width = `${geometry.barWidth}px`;
    } else {
      const geometry = pointGeometry(event, plotWidth, span);
      item.style.left = `${geometry.left}px`;
    }
  }

  function installEventInteraction(item, event, geometry) {
    let dragState = null;

    item.addEventListener("pointerdown", pointerEvent => {
      if (pointerEvent.button !== 0) return;

      if (editMode !== "pointer") return;

      const resize = pointerEvent.target.closest("[data-resize]")?.dataset.resize || null;
      dragState = {
        pointerId: pointerEvent.pointerId,
        startX: pointerEvent.clientX,
        originalStart: Number(event.start || 0),
        originalEnd: event.end != null ? Number(event.end) : null,
        resize,
        moved: false,
        historyBefore: snapshotData()
      };

      item.setPointerCapture?.(pointerEvent.pointerId);
      item.classList.add("dragging");
      pointerEvent.preventDefault();
      pointerEvent.stopPropagation();
    });

    item.addEventListener("pointermove", pointerEvent => {
      if (!dragState || dragState.pointerId !== pointerEvent.pointerId) return;

      const rect = axisRect();
      const deltaMinutes = ((pointerEvent.clientX - dragState.startX) / Math.max(1, rect.width)) * (ganttEnd - ganttStart);
      const snap = snapMinutes();
      const delta = Math.round(deltaMinutes / snap) * snap;

      if (Math.abs(pointerEvent.clientX - dragState.startX) > 3) dragState.moved = true;

      if (!dragState.resize) {
        event.start = Math.round(dragState.originalStart + delta);
        if (dragState.originalEnd != null) event.end = Math.round(dragState.originalEnd + delta);
      } else if (dragState.resize === "start" && dragState.originalEnd != null) {
        event.start = Math.round(Math.min(dragState.originalEnd - snap, dragState.originalStart + delta));
      } else if (dragState.resize === "end" && dragState.originalEnd != null) {
        event.end = Math.round(Math.max(Number(event.start) + snap, dragState.originalEnd + delta));
      }

      updateDraggedEventItem(item, event);
      pointerEvent.preventDefault();
    });

    const finish = pointerEvent => {
      if (!dragState || dragState.pointerId !== pointerEvent.pointerId) return;
      const moved = dragState.moved;
      item.classList.remove("dragging");

      if (moved) {
        pushUndoSnapshot(dragState.historyBefore);
        selectedEventId = event.id;
        invalidateStableTrackForEvent(event.id);
        markDirty(`Data de “${event.name}” alterada`);
        renderList();
        renderGantt();
      } else {
        selectedEventId = event.id;
        openEvent(event.id);
      }

      dragState = null;
    };

    item.addEventListener("pointerup", finish);
    item.addEventListener("pointercancel", finish);

    item.addEventListener("click", clickEvent => {
      if (editMode === "pointer") {
        clickEvent.stopPropagation();
      }
    });
  }

  function trackTimeFromPointer(track, clientX) {
    const rect = track.getBoundingClientRect();
    const fraction = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    return Math.round(ganttStart + fraction * (ganttEnd - ganttStart));
  }

  function installTrackInteraction(track, laneId) {
    track.addEventListener("pointerdown", event => {
      if (event.button !== 0 || editMode !== "add") return;
      if (event.target.closest(".lk-event-item")) return;

      const start = trackTimeFromPointer(track, event.clientX);
      const preview = document.createElement("div");
      preview.className = "add-draft-preview";
      track.appendChild(preview);

      addDraft = {
        pointerId: event.pointerId,
        track,
        laneId,
        start,
        current: start,
        startX: event.clientX,
        preview
      };

      track.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    track.addEventListener("pointermove", event => {
      if (!addDraft || addDraft.pointerId !== event.pointerId || addDraft.track !== track) return;

      addDraft.current = trackTimeFromPointer(track, event.clientX);
      const startX = clientXForTime(addDraft.start) - axisRect().left;
      const currentX = clientXForTime(addDraft.current) - axisRect().left;
      const left = Math.min(startX, currentX);
      const width = Math.max(3, Math.abs(currentX - startX));

      addDraft.preview.style.left = `${left}px`;
      addDraft.preview.style.width = `${width}px`;
      event.preventDefault();
    });

    const finish = event => {
      if (!addDraft || addDraft.pointerId !== event.pointerId || addDraft.track !== track) return;

      const draft = addDraft;
      addDraft = null;
      draft.preview.remove();

      const moved = Math.abs(event.clientX - draft.startX) > 6;
      let start = draft.start;
      let end = moved ? draft.current : null;

      if (end != null && end < start) [start, end] = [end, start];
      if (end != null && Math.abs(end - start) < snapMinutes()) end = null;

      openEvent(null, { start, end, laneId: draft.laneId });
      setEditMode("pointer");
    };

    track.addEventListener("pointerup", finish);
    track.addEventListener("pointercancel", finish);
  }

  function installCanvasNavigation() {
    const scroller = $("ganttScroller");
    let pan = null;
    let wheelAccumulator = 0;
    let wheelResetTimer = null;

    scroller.addEventListener("mousemove", event => {
      updateCursorDateLabel(event.clientX);
    });

    scroller.addEventListener("wheel", event => {
      const rect = axisRect();

      if (event.clientX < rect.left || event.shiftKey) return;
      if (event.target.closest("input,select,textarea,dialog")) return;

      event.preventDefault();

      let delta = event.deltaY;
      if (event.deltaMode === 1) delta *= 16;
      else if (event.deltaMode === 2) delta *= Math.max(600, window.innerHeight);

      wheelAccumulator += clamp(delta, -120, 120);
      clearTimeout(wheelResetTimer);
      wheelResetTimer = setTimeout(() => { wheelAccumulator = 0; }, 180);

      const threshold = 78;
      if (Math.abs(wheelAccumulator) < threshold) return;

      const direction = wheelAccumulator < 0 ? -1 : 1;
      wheelAccumulator = 0;
      stepZoom(direction, event.clientX);
    }, { passive: false });

    scroller.addEventListener("pointerdown", event => {
      const effectiveMode = temporaryHandMode ? "hand" : editMode;
      if (effectiveMode !== "hand" || event.button !== 0) return;
      if (event.target.closest(".lane-collapse-btn")) return;

      const rect = axisRect();

      pan = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originalStart: ganttStart,
        originalEnd: ganttEnd,
        originalScrollTop: scroller.scrollTop,
        plotWidth: Math.max(1, rect.width),
        horizontalEnabled: event.clientX >= rect.left
      };

      scroller.setPointerCapture?.(event.pointerId);
      scroller.classList.add("panning");
      event.preventDefault();
    });

    scroller.addEventListener("pointermove", event => {
      if (!pan || pan.pointerId !== event.pointerId) return;

      const dx = event.clientX - pan.startX;
      const dy = event.clientY - pan.startY;

      // Pan vertical: o conteúdo acompanha a "mão".
      // Arrastar para cima percorre as categorias abaixo;
      // arrastar para baixo retorna às categorias acima.
      const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = clamp(pan.originalScrollTop - dy, 0, maxScrollTop);

      // Na área temporal também fazemos pan horizontal.
      // Se o gesto começou na coluna fixa de categorias,
      // só o eixo vertical é movido.
      if (pan.horizontalEnabled && Math.abs(dx) >= 0.5) {
        const span = pan.originalEnd - pan.originalStart;
        const delta = -(dx / pan.plotWidth) * span;
        ganttStart = Math.round(pan.originalStart + delta);
        ganttEnd = Math.round(pan.originalEnd + delta);
        requestGanttRender();
      }

      event.preventDefault();
    });

    const finish = event => {
      if (!pan || pan.pointerId !== event.pointerId) return;
      pan = null;
      scroller.classList.remove("panning");
    };

    scroller.addEventListener("pointerup", finish);
    scroller.addEventListener("pointercancel", finish);

    scroller.addEventListener("dblclick", event => {
      const rect = axisRect();
      if (event.clientX < rect.left || event.target.closest(".lk-event-item")) return;
      stepZoom(-1, event.clientX);
    });
  }

  function toggleAllLanes() {
    const allCollapsed = doc.content.lanes.every(lane => collapsedLanes.has(lane.id));
    if (allCollapsed) collapsedLanes.clear();
    else collapsedLanes = new Set(doc.content.lanes.map(lane => lane.id));
    renderGantt();
  }
  function setDateFields(prefix, date) {
    $(prefix + "Era").value = date.era;
    $(prefix + "Year").value = date.year;
    $(prefix + "Month").value = date.month;
    $(prefix + "Day").value = date.day;
    $(prefix + "Hour").value = date.hour;
    $(prefix + "Minute").value = date.minute;
  }

  function readDateFields(prefix) {
    return {
      era: $(prefix + "Era").value,
      year: Number($(prefix + "Year").value),
      month: Number($(prefix + "Month").value),
      day: Number($(prefix + "Day").value),
      hour: Number($(prefix + "Hour").value),
      minute: Number($(prefix + "Minute").value)
    };
  }

  function toggleEndFields() {
    const ranged = $("eventTiming").value === "range";
    $("eventEndBlock").classList.toggle("hidden", !ranged);

    for (const id of ["eventEndYear", "eventEndDay", "eventEndHour", "eventEndMinute"]) {
      $(id).required = ranged;
    }

    updatePreview();
  }

  function formatDuration(minutes) {
    const total = Math.max(0, Number(minutes) || 0);
    if (total < 60) return `${Math.round(total)} minutos`;
    if (total < DAY) return `${(total / 60).toFixed(total % 60 === 0 ? 0 : 1)} horas`;
    if (total < YEAR) return `${(total / DAY).toFixed(total % DAY === 0 ? 0 : 1)} dias`;

    const years = total / YEAR;
    if (years < 10) return `${years.toFixed(2)} anos`;
    if (years < 100) return `${years.toFixed(1)} anos`;
    return `${Math.round(years)} anos`;
  }

  function openEvent(id = null, prefill = null) {
    currentId = id;
    const event = id ? doc.content.events.find(item => item.id === id) : null;

    $("eventDialogTitle").textContent = event ? "Editar acontecimento" : "Novo acontecimento";
    $("deleteEvent").classList.toggle("hidden", !event);

    if (event) {
      $("eventId").value = event.id;
      $("eventName").value = event.name || "";
      $("eventLane").value = event.laneId || doc.content.lanes[0]?.id || "";
      $("eventDetail").value = String(event.detail || 3);
      $("eventColor").value = /^#[0-9a-f]{6}$/i.test(event.color || "") ? event.color : "#0079cc";

      setDateFields("event", C.minutesToDate(event.start));

      const ranged = event.end != null && Number(event.end) > Number(event.start);
      $("eventTiming").value = ranged ? "range" : "point";
      setDateFields(
        "eventEnd",
        ranged
          ? C.minutesToDate(event.end)
          : C.minutesToDate(Number(event.start) + DAY)
      );
    } else {
      const center = prefill?.start != null
        ? Number(prefill.start)
        : (Number.isFinite(ganttStart + ganttEnd) ? Math.round((ganttStart + ganttEnd) / 2) : 0);
      const end = prefill?.end != null ? Number(prefill.end) : null;

      $("eventId").value = "";
      $("eventName").value = "";
      $("eventLane").value = prefill?.laneId || $("laneFilter").value || doc.content.lanes[0]?.id || "";
      $("eventDetail").value = String(detailLevelForSpan(ganttEnd - ganttStart));
      $("eventColor").value = "#0079cc";
      $("eventTiming").value = end != null && end > center ? "range" : "point";

      setDateFields("event", C.minutesToDate(center));
      setDateFields("eventEnd", C.minutesToDate(end != null && end > center ? end : center + DAY));
    }

    toggleEndFields();
    updatePreview();
    $("eventDialog").showModal();
    setTimeout(() => $("eventName").focus(), 50);
  }

  function updatePreview() {
    try {
      const start = C.dateToMinutes(readDateFields("event"));

      if ($("eventTiming").value === "range") {
        const end = C.dateToMinutes(readDateFields("eventEnd"));
        if (end <= start) {
          $("datePreview").textContent = "O fim precisa acontecer depois do início.";
          return;
        }

        $("datePreview").textContent =
          `${C.formatDate(start, C.getCalendar(data, doc))}  →  ${C.formatDate(end, C.getCalendar(data, doc))} · duração: ${formatDuration(end - start)}`;
      } else {
        $("datePreview").textContent = `${C.formatDate(start, C.getCalendar(data, doc))} · acontecimento pontual`;
      }
    } catch {
      $("datePreview").textContent = "Data inválida";
    }
  }

  function applyEvent(formEvent) {
    formEvent.preventDefault();

    let start;
    let end = null;

    try {
      start = C.dateToMinutes(readDateFields("event"));

      if ($("eventTiming").value === "range") {
        end = C.dateToMinutes(readDateFields("eventEnd"));
        if (end <= start) {
          toast("O fim do acontecimento precisa ser posterior ao início.", true);
          return;
        }
      }
    } catch {
      toast("Há uma data inválida no formulário.", true);
      return;
    }

    const configured = configuredTimelineBounds();
    if (configured && (start < configured.min || (end ?? start) > configured.max)) {
      toast("O acontecimento precisa estar entre o início e o fim configurados para a timeline.", true);
      return;
    }

    pushUndo();
    let event = currentId ? doc.content.events.find(item => item.id === currentId) : null;
    const isNew = !event;

    if (!event) {
      event = {
        name: "",
        start,
        color: "#0079CC",
        laneId: doc.content.lanes[0]?.id || "",
        iconGlyph: "calendar-lines",
        layer: 0,
        detail: 3,
        imageUrl: "",
        imageFit: "cover",
        type: "event",
        isSynced: false,
        opacity: 0.5,
        data: {},
        id: C.uid("evt"),
        sourceUri: "",
        pos: C.uid("p")
      };
      doc.content.events.push(event);
    }

    event.name = $("eventName").value.trim();
    if (!event.name) {
      toast("Dê um nome ao acontecimento.", true);
      if (isNew) doc.content.events = doc.content.events.filter(item => item !== event);
      undoStack.pop();
      updateHistoryUi();
      return;
    }

    event.start = start;
    event.laneId = $("eventLane").value;
    event.detail = Number($("eventDetail").value);
    event.color = $("eventColor").value;

    if (end != null) event.end = end;
    else delete event.end;

    selectedEventId = event.id;
    invalidateStableTrackForEvent(event.id);
    markDirty(`${isNew ? "Novo" : "Acontecimento"} “${event.name}” aguardando salvamento`);
    $("eventDialog").close();
    setEditMode("pointer");
    renderAll();
  }

  function deleteEvent() {
    if (!currentId) return;
    const event = doc.content.events.find(item => item.id === currentId);
    if (!event) return;

    if (!confirm(`Excluir “${event.name}”? A exclusão só será publicada quando você clicar em Salvar alterações.`)) {
      return;
    }

    pushUndo();
    doc.content.events = doc.content.events.filter(item => item.id !== currentId);
    selectedEventId = null;
    markDirty(`“${event.name}” marcado para exclusão`);
    $("eventDialog").close();
    renderAll();
  }

  function openLanes() {
    $("lanesEditor").innerHTML = "";
    doc.content.lanes.forEach((lane, index) => addLaneRow(lane, index));
    $("lanesDialog").showModal();
  }

  function addLaneRow(lane = { id: C.uid("lane"), name: "Nova categoria" }, index = doc.content.lanes.length) {
    const row = document.createElement("div");
    row.className = "lane-edit-row";
    row.dataset.id = lane.id;
    row.innerHTML = `
      <label><span>Cor</span><input class="lane-color" type="color" value="${laneColor(lane, index)}"></label>
      <label><span>Nome</span><input class="lane-name" value="${C.escapeHtml(lane.name || "")}"></label>
      <button class="button danger lane-remove" type="button">Remover</button>`;

    row.querySelector(".lane-remove").addEventListener("click", () => {
      const used = doc.content.events.some(event => event.laneId === row.dataset.id);
      if (used) {
        toast("Essa categoria possui acontecimentos. Mova-os antes de removê-la.", true);
        return;
      }
      row.remove();
    });

    $("lanesEditor").appendChild(row);
  }

  function applyLanes() {
    const rows = [...$("lanesEditor").querySelectorAll(".lane-edit-row")];
    if (!rows.length) {
      toast("A timeline precisa de pelo menos uma categoria.", true);
      return;
    }

    pushUndo();
    const old = new Map(doc.content.lanes.map(lane => [lane.id, lane]));

    doc.content.lanes = rows.map((row, index) => {
      const previous = old.get(row.dataset.id) || {};
      return {
        ...previous,
        id: row.dataset.id,
        name: row.querySelector(".lane-name").value.trim() || `Categoria ${index + 1}`,
        color: row.querySelector(".lane-color").value,
        pos: previous.pos || C.uid("pos"),
        size: previous.size || "sm",
        isCollapsed: false
      };
    });

    lanes = C.laneMap(doc);
    fillLaneSelects();
    markDirty("Categorias e cores alteradas");
    $("lanesDialog").close();
    renderAll();
  }

  function formatCommitDate(value) {
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium"
      }).format(new Date(value));
    } catch {
      return String(value || "");
    }
  }

  async function loadBackups() {
    $("backupsStatus").textContent = "Carregando histórico…";
    $("backupsList").innerHTML = "";

    try {
      const r = await workerFetch("/backups");
      const out = await r.json();
      const list = Array.isArray(out.backups) ? out.backups : [];

      $("backupsStatus").textContent = list.length
        ? `${list.length} versão${list.length === 1 ? "" : "ões"} no histórico da timeline.`
        : "Ainda não há versões no histórico.";

      list.forEach((backup, index) => {
        const row = document.createElement("div");
        row.className = "backup-row";
        row.innerHTML = `
          <div class="backup-info">
            <strong>${index === 0 ? "Versão atual · " : ""}${C.escapeHtml(formatCommitDate(backup.date))}</strong>
            <span>${C.escapeHtml(backup.message || "Alteração da timeline")} · ${C.escapeHtml(backup.shortSha || "")}</span>
          </div>
          <button class="button ghost" type="button" ${index === 0 ? "disabled" : ""}>${index === 0 ? "Atual" : "Restaurar"}</button>`;

        if (index !== 0) {
          row.querySelector("button").addEventListener("click", () => restoreBackup(backup.sha, backup.date));
        }

        $("backupsList").appendChild(row);
      });
    } catch (err) {
      $("backupsStatus").textContent = err.message;
      toast(err.message, true);
    }
  }

  async function openBackups() {
    $("backupsDialog").showModal();
    await loadBackups();
  }

  async function restoreBackup(sha, date) {
    if (busy) return;

    if (dirty && !confirm("Há alterações locais não salvas. Restaurar uma versão vai descartá-las. Continuar?")) {
      return;
    }

    if (!confirm(`Restaurar a timeline para a versão de ${formatCommitDate(date)}? A versão atual continuará preservada no histórico.`)) {
      return;
    }

    setBusy(true, "Restaurando versão…");

    try {
      await workerFetch("/restore", {
        method: "POST",
        body: JSON.stringify({ sha })
      });

      ganttInitialized = false;
      await loadFromGitHub();
      setBusy(false, "Versão restaurada");
      toast("Versão restaurada. O estado anterior continua disponível no histórico.");
      await loadBackups();
    } catch (err) {
      setBusy(false, "Erro ao restaurar");
      toast(err.message, true);
    }
  }

  async function discardChanges() {
    if (!dirty) return;

    if (!confirm("Descartar todas as alterações que ainda não foram salvas?")) return;

    try {
      await loadFromGitHub();
      toast("Alterações locais descartadas.");
    } catch (err) {
      toast(err.message, true);
    }
  }

  $("ganttTab").addEventListener("click", () => setView("gantt"));
  $("listTab").addEventListener("click", () => setView("list"));
  $("newEvent").addEventListener("click", () => openEvent());
  $("lanesBtn").addEventListener("click", openLanes);
  $("addLane").addEventListener("click", () => addLaneRow());
  $("saveLanes").addEventListener("click", applyLanes);
  $("exportBtn").addEventListener("click", () => C.downloadJson(data, "Cavaleiros Divinos e a Ordem dos Reinos-backup.json"));
  $("searchToggleBtn").addEventListener("click", () => {
    $("searchPanel").classList.toggle("hidden");
    if (!$("searchPanel").classList.contains("hidden")) setTimeout(() => $("search").focus(), 30);
  });
  $("clearSearchBtn").addEventListener("click", () => {
    $("search").value = "";
    $("laneFilter").value = "";
    renderAll();
    $("searchResults").classList.add("hidden");
  });
  $("jumpDateBtn").addEventListener("click", openJumpDate);
  $("jumpDateForm").addEventListener("submit", applyJumpDate);
  $("timeSystemBtn").addEventListener("click", openTimeSystemInfo);
  $("timePreset").addEventListener("change", applyTimePreset);
  $("timeSystemForm").addEventListener("submit", saveTimeSystem);
  $("listQuickBtn").addEventListener("click", () => setView(currentView === "gantt" ? "list" : "gantt"));
  $("helpBtn").addEventListener("click", () => setModeHintVisible(true));
  $("closeModeHint").addEventListener("click", () => setModeHintVisible(false));
  $("backupHistoryBtn").addEventListener("click", openBackups);
  $("refreshBackupsBtn").addEventListener("click", loadBackups);
  $("search").addEventListener("input", () => {
    renderSearchResults();
    renderAll();
  });
  $("laneFilter").addEventListener("change", () => {
    renderSearchResults();
    renderAll();
  });
  $("eventForm").addEventListener("submit", applyEvent);
  $("eventTiming").addEventListener("change", toggleEndFields);
  $("deleteEvent").addEventListener("click", deleteEvent);
  $("saveAllBtn").addEventListener("click", publish);
  $("discardBtn").addEventListener("click", discardChanges);

  $("recentBtn").addEventListener("click", focusRecent);
  $("fitBtn").addEventListener("click", fitAll);
  $("zoomIn").addEventListener("click", () => stepZoom(-1, lastCursorClientX));
  $("zoomOut").addEventListener("click", () => stepZoom(1, lastCursorClientX));
  $("scalePreset").addEventListener("change", event => setGanttSpan(Number(event.target.value)));

  $("modePointer").addEventListener("click", () => setEditMode("pointer"));
  $("modeHand").addEventListener("click", () => setEditMode("hand"));
  $("modeAdd").addEventListener("click", () => setEditMode("add"));
  $("undoBtn").addEventListener("click", undo);
  $("redoBtn").addEventListener("click", redo);
  $("toggleAllLanesBtn").addEventListener("click", toggleAllLanes);

  const dateFieldIds = [
    "eventEra", "eventYear", "eventMonth", "eventDay", "eventHour", "eventMinute",
    "eventEndEra", "eventEndYear", "eventEndMonth", "eventEndDay", "eventEndHour", "eventEndMinute"
  ];
  dateFieldIds.forEach(id => $(id).addEventListener("input", updatePreview));
  dateFieldIds.forEach(id => $(id).addEventListener("change", updatePreview));

  document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });

  window.addEventListener("resize", () => {
    if (currentView !== "gantt") return;
    clearTimeout(window.__ganttResizeTimer);
    window.__ganttResizeTimer = setTimeout(() => {
      resetStableTrackLayout();
      renderGantt();
    }, 120);
  });


  window.addEventListener("keydown", event => {
    const target = event.target;
    const editingText = target && /INPUT|TEXTAREA|SELECT/.test(target.tagName);

    if (!editingText && event.code === "Space") {
      temporaryHandMode = true;
      $("ganttScroller").classList.add("temporary-hand");
      event.preventDefault();
    }

    if (!editingText && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }

    if (!editingText && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    }

    if (!editingText && event.key === "Escape" && editMode === "add") {
      setEditMode("hand");
    }
  });

  window.addEventListener("keyup", event => {
    if (event.code === "Space") {
      temporaryHandMode = false;
      $("ganttScroller").classList.remove("temporary-hand");
    }
  });

  window.addEventListener("beforeunload", event => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  async function boot() {
    $("saveBadge").textContent = "Carregando…";
    $("saveBadge").className = "badge warn";

    try {
      installCanvasNavigation();
      installHistoryNavigator();
      restoreModeHintPreference();
      fillJumpMonths();
      await loadFromGitHub();
      setEditMode("hand");
      updateHistoryUi();
      $("saveBadge").textContent = "Edição pública";
      $("saveBadge").className = "badge ok";
      setView("gantt");
    } catch (err) {
      $("saveBadge").textContent = "Editor indisponível";
      $("saveBadge").className = "badge";
      toast(err.message, true);
      console.error(err);
    }
  }

  boot();
})();
