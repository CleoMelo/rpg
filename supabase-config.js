// Configuração pública do Supabase usada pelo frontend.
window.SUPABASE_CONFIG = {
  url: "https://iqybtdfujkemvthtwzqu.supabase.co",
  anonKey: "sb_publishable_hf2_LBBJeU3mhZVsyL2OuQ_ctYFguSZ"
};

if (/\/categorias\.html$/i.test(location.pathname)) {
  const script = document.createElement('script');
  script.src = 'category-bootstrap.js?v=20260829-2';
  script.defer = true;
  document.head.appendChild(script);
}
