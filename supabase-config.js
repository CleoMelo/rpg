// Preencha com os dados exibidos em Supabase > Project Settings > API.
// A chave anon/public pode ser usada no navegador quando a tabela está protegida por RLS.
window.SUPABASE_CONFIG = {
  url: "https://iqybtdfujkemvthtwzqu.supabase.co",
  anonKey: "sb_publishable_hf2_LBBJeU3mhZVsyL2OuQ_ctYFguSZ"
};

// Carrega as camadas opcionais do portal sem exigir alteração manual em cada página.
(function () {
  const loadScript = (src, attribute) => {
    if (document.querySelector(`script[${attribute}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.setAttribute(attribute, 'true');
    document.head.appendChild(script);
  };

  const load = () => {
    loadScript('personagem-destaque.js?v=20260819-1', 'data-character-highlight');
    if (/\/categorias\.html$/i.test(location.pathname)) {
      loadScript('busca-global-personagem.js?v=20260820-1', 'data-global-character-search');
      loadScript('classificacao-categorias-v3.js?v=20260824-3', 'data-category-classification');
      loadScript('organizacao-categorias.js?v=20260824-1', 'data-category-organization');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load, { once: true });
  } else {
    load();
  }
})();
