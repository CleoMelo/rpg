// Preencha com os dados exibidos em Supabase > Project Settings > API.
// A chave anon/public pode ser usada no navegador quando a tabela está protegida por RLS.
window.SUPABASE_CONFIG = {
  url: "https://iqybtdfujkemvthtwzqu.supabase.co",
  anonKey: "sb_publishable_hf2_LBBJeU3mhZVsyL2OuQ_ctYFguSZ"
};

// Carrega a camada de destaque dos personagens sem exigir alteração manual em cada página.
(function () {
  const load = () => {
    if (document.querySelector('script[data-character-highlight]')) return;
    const script = document.createElement('script');
    script.src = 'personagem-destaque.js?v=20260819-1';
    script.dataset.characterHighlight = 'true';
    document.head.appendChild(script);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();
