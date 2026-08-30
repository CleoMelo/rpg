(() => {
  const C = window.TimelineCommon;
  const $ = id => document.getElementById(id);
  let data, doc, lanes, visibleCount = 160;
  const selectedLanes = new Set();

  async function load(){
    $("syncBadge").textContent = "Atualizando…";
    $("syncBadge").className = "badge warn";
    try{
      const r = await fetch("supabase://timeline/timeline", {cache:"no-store"});
      if(!r.ok){
        const detail = await r.json().catch(() => ({}));
        throw new Error(detail.error || detail.message || `HTTP ${r.status}`);
      }
      data = await r.json();
      doc = C.getTimeDocument(data);
      lanes = C.laneMap(doc);
      $("syncBadge").textContent = "Atualizado";
      $("syncBadge").className = "badge ok";
      $("lastUpdate").textContent = new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
      renderLaneFilters();
      render();
    }catch(err){
      $("syncBadge").textContent = "Falha ao atualizar";
      $("syncBadge").className = "badge";
      console.error(err);
      if(!data){
        $("timeline").innerHTML = `<div class="event-card"><div class="event-title">Não foi possível carregar a timeline.</div><div class="event-meta"><span class="chip">${C.escapeHtml(err.message)}</span></div></div>`;
      }
    }
  }

  function renderLaneFilters(){
    const box = $("laneFilters");
    box.innerHTML = "";
    doc.content.lanes.forEach(l => {
      const label = document.createElement("label");
      label.className = "lane-check";
      label.innerHTML = `<input type="checkbox" value="${C.escapeHtml(l.id)}" ${selectedLanes.has(l.id)?"checked":""}><span class="dot"></span><span>${C.escapeHtml(l.name)}</span>`;
      label.querySelector("input").addEventListener("change", e => {
        if(e.target.checked) selectedLanes.add(l.id); else selectedLanes.delete(l.id);
        visibleCount=160; render();
      });
      box.appendChild(label);
    });
  }

  function filtered(){
    const q = $("search").value.trim().toLocaleLowerCase("pt-BR");
    const detail = Number($("detail").value || 0);
    const asc = $("sort").value === "asc";
    return [...doc.content.events]
      .filter(e => !q || String(e.name||"").toLocaleLowerCase("pt-BR").includes(q) || String(lanes.get(e.laneId)?.name||"").toLocaleLowerCase("pt-BR").includes(q))
      .filter(e => !selectedLanes.size || selectedLanes.has(e.laneId))
      .filter(e => Number(e.detail||0) >= detail)
      .sort((a,b) => asc ? Number(a.start)-Number(b.start) : Number(b.start)-Number(a.start));
  }

  function render(){
    if(!doc) return;
    const list = filtered();
    const shown = list.slice(0,visibleCount);
    $("resultTitle").textContent = `${list.length} acontecimento${list.length===1?"":"s"}`;
    $("stats").innerHTML = `
      <div class="stat"><strong>${doc.content.events.length}</strong><span>acontecimentos</span></div>
      <div class="stat"><strong>${doc.content.lanes.length}</strong><span>categorias</span></div>
      <div class="stat"><strong>${list.length}</strong><span>nos filtros atuais</span></div>
      <div class="stat"><strong>${new Set(doc.content.events.map(e=>e.laneId)).size}</strong><span>categorias em uso</span></div>`;
    $("timeline").innerHTML = "";

    if(!shown.length){
      $("timeline").innerHTML = `<div class="event-card"><div class="event-title">Nenhum acontecimento nesta timeline.</div><div class="event-meta"><span class="chip">A campanha ainda não possui eventos que correspondam aos filtros.</span></div></div>`;
    }

    shown.forEach(e => {
      const lane = lanes.get(e.laneId);
      const card = document.createElement("article");
      card.className = "event-card";
      card.style.setProperty("--event", C.eventColor(e,lane));
      const duration = e.end != null ? Math.max(0,Number(e.end)-Number(e.start)) : 0;
      card.innerHTML = `
        <div class="event-date">${C.escapeHtml(C.formatDate(e.start, C.getCalendar(data, doc)))}</div>
        <div class="event-title">${C.escapeHtml(e.name||"Sem nome")}</div>
        <div class="event-meta">
          <span class="chip">${C.escapeHtml(lane?.name||"Sem categoria")}</span>
          <span class="chip">Importância ${Number(e.detail||0)}</span>
          ${duration?`<span class="chip">Duração ${duration} min</span>`:""}
        </div>`;
      card.addEventListener("click",()=>openEvent(e,lane));
      $("timeline").appendChild(card);
    });
    $("more").classList.toggle("hidden", shown.length >= list.length);
  }

  function openEvent(e,lane){
    const duration = e.end != null ? Math.max(0,Number(e.end)-Number(e.start)) : 0;
    $("dialogTitle").textContent = e.name || "Sem nome";
    $("dialogBody").innerHTML = `
      <div><strong>Data</strong><div class="muted">${C.escapeHtml(C.formatDate(e.start, C.getCalendar(data, doc)))}</div></div>
      <div class="detail-row"><strong>Categoria</strong><div class="muted">${C.escapeHtml(lane?.name||"Sem categoria")}</div></div>
      <div class="detail-row"><strong>Importância</strong><div class="muted">${Number(e.detail||0)}</div></div>
      ${duration?`<div class="detail-row"><strong>Duração</strong><div class="muted">${duration} minutos</div></div>`:""}`;
    $("eventDialog").showModal();
  }

  ["search","sort","detail"].forEach(id => $(id).addEventListener(id==="search"?"input":"change",()=>{visibleCount=160;render();}));
  $("refresh").addEventListener("click",load);
  $("clearLanes").addEventListener("click",()=>{selectedLanes.clear();renderLaneFilters();render();});
  $("more").addEventListener("click",()=>{visibleCount+=160;render();});
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>b.closest("dialog").close()));

  load();
  setInterval(load, 60000);
})();
