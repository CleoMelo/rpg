// Preencha com os dados exibidos em Supabase > Project Settings > API.
// A chave anon/public pode ser usada no navegador quando a tabela está protegida por RLS.
window.SUPABASE_CONFIG = {
  url: "https://iqybtdfujkemvthtwzqu.supabase.co",
  anonKey: "sb_publishable_hf2_LBBJeU3mhZVsyL2OuQ_ctYFguSZ"
};

(function () {
  const loadScript = (src, attribute) => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[${attribute}]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.setAttribute(attribute, 'true');
    script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); }, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.appendChild(script);
  });

  const loadOptionalLayers = async () => {
    try {
      if (!window.supabase) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', 'data-supabase-sdk');
      await loadScript('personagem-destaque.js?v=20260819-1', 'data-character-highlight');
      if (/\/categorias\.html$/i.test(location.pathname)) {
        await loadScript('busca-global-personagem.js?v=20260820-1', 'data-global-character-search');
        await loadScript('classificacao-categorias.js?v=20260824-1', 'data-category-classification');
        await loadScript('organizacao-categorias.js?v=20260824-2', 'data-category-organization');
        await loadScript('alterar-senha.js?v=20260825-1', 'data-change-master-password');
      }
    } catch (error) {
      console.error('Não foi possível carregar as dependências do portal:', error);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadOptionalLayers, { once: true });
  else loadOptionalLayers();
})();
