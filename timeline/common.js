(() => {
  const PT_MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  function getTimeDocument(data){
    const resource = data?.resources?.[0];
    if(!resource) throw new Error("JSON sem resources[0].");
    const doc = resource.documents?.find(d => d.type === "time");
    if(!doc) throw new Error("Nenhum documento de timeline encontrado.");
    if(!Array.isArray(doc.content?.events) || !Array.isArray(doc.content?.lanes)) throw new Error("Estrutura de timeline inválida.");
    return doc;
  }

  function getCalendar(data, doc){
    const id = doc.calendarId;
    return data?.calendars?.find(c => c.id === id) || data?.calendars?.find(c => c.name === "Cavaleiros") || data?.calendars?.[0];
  }

  function floorDiv(a,b){ return Math.floor(a/b); }

  function isLeapAstronomical(y){
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  function daysBeforeAstronomicalYear(y){
    const n = y - 1;
    return 365*n + floorDiv(n,4) - floorDiv(n,100) + floorDiv(n,400);
  }

  function astroFromEra(era, year){
    return era === "before" ? 1 - Number(year) : Number(year);
  }

  function eraFromAstro(y){
    return y <= 0 ? {era:"before",year:1-y} : {era:"after",year:y};
  }

  function monthLengths(y){
    return [31,isLeapAstronomical(y)?29:28,31,30,31,30,31,31,30,31,30,31];
  }

  function dateToMinutes({era,year,month,day,hour=0,minute=0}){
    const y = astroFromEra(era, year);
    const lengths = monthLengths(y);
    const m = Math.max(1, Math.min(12, Number(month)));
    const d = Math.max(1, Math.min(lengths[m-1], Number(day)));
    let days = daysBeforeAstronomicalYear(y);
    for(let i=0;i<m-1;i++) days += lengths[i];
    days += d-1;
    return days*1440 + Number(hour)*60 + Number(minute);
  }

  function minutesToDate(total){
    let days = floorDiv(Number(total),1440);
    let rem = Number(total) - days*1440;
    if(rem < 0){ days--; rem += 1440; }

    let low = floorDiv(days,366) - 2;
    let high = floorDiv(days,365) + 3;
    if(low > high){ const t=low; low=high; high=t; }
    while(daysBeforeAstronomicalYear(low) > days) low -= 400;
    while(daysBeforeAstronomicalYear(high+1) <= days) high += 400;

    while(low <= high){
      const mid = Math.floor((low+high)/2);
      const start = daysBeforeAstronomicalYear(mid);
      const next = daysBeforeAstronomicalYear(mid+1);
      if(days < start) high = mid-1;
      else if(days >= next) low = mid+1;
      else {
        const info = eraFromAstro(mid);
        let doy = days - start;
        const lengths = monthLengths(mid);
        let month = 1;
        while(month <= 12 && doy >= lengths[month-1]){
          doy -= lengths[month-1]; month++;
        }
        return {
          era: info.era, year: info.year, month,
          day: doy+1, hour: Math.floor(rem/60), minute: rem%60
        };
      }
    }
    throw new Error("Não foi possível converter a data.");
  }

  function formatDate(minutes, calendar=null){
    const d = minutesToDate(minutes);
    const system = calendar?.timelineSystem || {};
    const era = d.era === "before"
      ? (system.beforeName || "Antes da Grande Mudança")
      : (system.afterName || "Depois da Grande Mudança");
    return `${d.day} de ${PT_MONTHS[d.month-1]} de ${d.year} — ${String(d.hour).padStart(2,"0")}:${String(d.minute).padStart(2,"0")} · ${era}`;
  }

  function laneMap(doc){
    return new Map(doc.content.lanes.map(l => [l.id,l]));
  }

  function eventColor(e,lane){
    return e.color || lane?.color || "#8b5cf6";
  }

  function uid(prefix="id"){
    return prefix + Math.random().toString(36).slice(2,10);
  }

  function escapeHtml(s){
    return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function downloadJson(data, name="timeline-backup.json"){
    const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  window.TimelineCommon = {
    PT_MONTHS,getTimeDocument,getCalendar,dateToMinutes,minutesToDate,formatDate,
    laneMap,eventColor,uid,escapeHtml,downloadJson
  };
})();
