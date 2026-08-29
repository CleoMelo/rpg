(function () {
  if (!/\/categorias\.html$/i.test(location.pathname)) return;

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'css/classificacoes.css?v=20260829-1';
  document.head.appendChild(stylesheet);

  const scripts = [
    'personagem-destaque.js?v=20260819-1',
    'busca-global-personagem.js?v=20260820-1',
    'classificacao-categorias.js?v=20260824-1',
    'alterar-senha.js?v=20260825-1'
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

  const start = () => loadNext(0);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
