(function () {
  if (!/\/categorias\.html$/i.test(location.pathname)) return;

  function installTimelineLink() {
    const params = new URLSearchParams(location.search);
    const rpgId = params.get('rpg') || localStorage.getItem('selectedRpg') || '';
    if (!rpgId) return;

    const nav = document.querySelector('.nav-links');
    if (!nav || document.getElementById('campaignTimelineListLink')) return;

    const encodedId = encodeURIComponent(rpgId);
    const listLink = document.createElement('a');
    listLink.id = 'campaignTimelineListLink';
    listLink.textContent = 'Lista';
    listLink.href = `timeline/?rpg=${encodedId}`;

    const ganttLink = document.createElement('a');
    ganttLink.id = 'campaignTimelineGanttLink';
    ganttLink.textContent = 'Gantt';
    ganttLink.href = `timeline.html?rpg=${encodedId}`;

    nav.prepend(ganttLink);
    nav.prepend(listLink);
  }

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'css/classificacoes.css?v=20260830-4';
  document.head.appendChild(stylesheet);

  const scripts = [
    'personagem-destaque.js?v=20260829-3',
    'busca-global-personagem.js?v=20260831-1',
    'classificacao-categorias.js?v=20260831-2',
    'alterar-senha.js?v=20260903-1',
    'senha-editor.js?v=20260903-1'
  ];

  const loadNext = index => {
    if (index >= scripts.length) return;
    const script = document.createElement('script');
    script.src = scripts[index];
    script.addEventListener('load', () => loadNext(index + 1), { once: true });
    script.addEventListener('error', error => {
      console.error(`Não foi possível carregar ${scripts[index]}.`, error);
      loadNext(index + 1);
    }, { once: true });
    document.body.appendChild(script);
  };

  const start = () => {
    installTimelineLink();
    loadNext(0);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
