const DEFAULT_RPGS = [];

let RPGS = [];
let supabaseClient = null;

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const config = window.SUPABASE_CONFIG || {};
  const configured = config.url && config.anonKey && !config.url.includes('COLE_AQUI') && !config.anonKey.includes('COLE_AQUI');
  if (!configured || !window.supabase) throw new Error('Supabase não configurado. Preencha o arquivo supabase-config.js.');
  supabaseClient = window.supabase.createClient(config.url, config.anonKey);
  return supabaseClient;
}
function mapCampaign(row) { return { id: String(row.id), name: row.nome, description: row.descricao || 'Campanha personalizada.', image: row.imagem_url, custom: true }; }
async function loadRpgs() { try { const client = getSupabaseClient(); const { data, error } = await client.from('campanhas').select('id, nome, descricao, imagem_url, criado_em').order('criado_em', { ascending: true }); if (error) throw error; RPGS = [...DEFAULT_RPGS, ...(data || []).map(mapCampaign)]; } catch (error) { console.error(error); RPGS = [...DEFAULT_RPGS]; throw error; } return RPGS; }
function normalizeImgurImageUrl(value) { let url; try { url = new URL(String(value || '').trim()); } catch { throw new Error('Informe um endereço de imagem válido do Imgur.'); } const hostname = url.hostname.toLowerCase(); const imageExtension = /\.(?:jpe?g|png|gif|webp|avif)$/i.test(url.pathname); const legacyImgur = hostname === 'i.imgur.com' && imageExtension; const imageKit = hostname === 'ik.imagekit.io' && url.pathname.startsWith('/apirpgs/') && imageExtension; if (url.protocol !== 'https:' || (!legacyImgur && !imageKit)) throw new Error('A imagem precisa ter sido enviada pelo Portal de RPGs.'); return url.href; }
async function createRpg({ name, description, image, password }) { const client = getSupabaseClient(); const imageUrl = normalizeImgurImageUrl(image); const { data, error } = await client.rpc('criar_campanha', { p_nome: name.trim(), p_descricao: description.trim() || 'Campanha personalizada.', p_imagem_url: imageUrl, p_senha: password }).single(); if (error) throw error; const rpg = mapCampaign(data); RPGS.push(rpg); return rpg; }
async function updateRpg({ id, token, name, description, image }) { const rpg = RPGS.find(item => item.id === String(id)); if (!rpg?.custom || !token) return null; const imageUrl = normalizeImgurImageUrl(image); const client = getSupabaseClient(); const { data, error } = await client.rpc('editar_campanha', { p_campanha_id: String(id), p_token: token, p_nome: name.trim(), p_descricao: description.trim() || 'Campanha personalizada.', p_imagem_url: imageUrl }).single(); if (error) throw error; const updated = mapCampaign(data); const index = RPGS.findIndex(item => item.id === String(id)); if (index >= 0) RPGS[index] = updated; return updated; }
function isDefaultRpg(id) { return DEFAULT_RPGS.some(rpg => rpg.id === String(id)); }
function masterSessionKey(id) { return `masterSession:${String(id)}`; }
function setMasterSession(id, token) { sessionStorage.setItem(masterSessionKey(id), token); sessionStorage.setItem('role', 'master'); sessionStorage.setItem('masterRpgId', String(id)); }
function getMasterToken(id) { return sessionStorage.getItem(masterSessionKey(id)); }
function clearMasterSession(id) { sessionStorage.removeItem(masterSessionKey(id)); if (sessionStorage.getItem('masterRpgId') === String(id)) { sessionStorage.removeItem('masterRpgId'); sessionStorage.removeItem('role'); } }
async function authenticateMaster(id, password) { if (isDefaultRpg(id)) { if (password !== 'mestre123') return null; const demoToken = `demo:${String(id)}`; setMasterSession(id, demoToken); return demoToken; } const client = getSupabaseClient(); const { data, error } = await client.rpc('autenticar_mestre', { p_campanha_id: String(id), p_senha: password }); if (error) throw error; if (!data) return null; setMasterSession(id, data); return data; }
async function deleteRpg(id, token) { const rpg = RPGS.find(item => item.id === String(id)); if (!rpg?.custom || !token) return false; await deleteCampaignMedia({ rpgId: String(id), token }); const client = getSupabaseClient(); const { data, error } = await client.rpc('excluir_campanha', { p_campanha_id: String(id), p_token: token }); if (error) throw error; if (!data) return false; const index = RPGS.findIndex(item => item.id === String(id)); if (index >= 0) RPGS.splice(index, 1); clearMasterSession(id); localStorage.removeItem(`characters:${id}`); localStorage.removeItem(`categories:${id}`); return true; }
async function getRpgById(id) { if (!RPGS.length) await loadRpgs(); return RPGS.find(item => item.id === String(id)) || RPGS[0] || null; }
const DEFAULT_CATEGORIES = [];
let CATEGORIES = [];
let SUBCATEGORIES = [];
const DEFAULT_CHARACTERS = {};
function getSelectedRpg() { const params = new URLSearchParams(location.search); return params.get('rpg') || localStorage.getItem('selectedRpg') || ''; }
function setSelectedRpg(id) { localStorage.setItem('selectedRpg', id); }
function mapCategory(row) { return { id: String(row.id), campaignId: String(row.campanha_id), name: row.nome, description: row.descricao || '', icon: row.icone || '📁', classificationId: row.classificacao_id ? String(row.classificacao_id) : '__personagens__', order: Number(row.ordem) || 0, visible: row.visivel !== false, custom: true }; }
function mapSubcategory(row) { return { id: String(row.id), campaignId: String(row.campanha_id), category: String(row.categoria_id), name: row.nome, order: Number(row.ordem) || 0, visible: row.visivel !== false }; }
function mapCharacter(row) { return { id: String(row.id), campaignId: String(row.campanha_id), category: String(row.categoria_id), subcategory: row.subcategoria_id ? String(row.subcategoria_id) : null, name: row.nome, description: row.descricao || '', image: row.imagem_url, order: Number(row.ordem) || 0, visible: row.visivel !== false }; }
function getLocalCategories(rpgId) { const saved = JSON.parse(localStorage.getItem(`categories:${rpgId}`) || '[]'); const savedById = new Map(saved.map(category => [String(category.id), category])); const defaults = DEFAULT_CATEGORIES.map(category => ({ ...category, ...(savedById.get(String(category.id)) || {}), custom: false })); const custom = saved.filter(category => !DEFAULT_CATEGORIES.some(defaultCategory => defaultCategory.id === String(category.id))); return [...defaults, ...custom]; }
function saveLocalCategories(rpgId, categories) { localStorage.setItem(`categories:${rpgId}`, JSON.stringify(categories)); }

async function loadCategories(rpgId, token = null) {
  if (isDefaultRpg(rpgId)) { const categories = getLocalCategories(rpgId).map((category, index) => ({ ...category, order: Number(category.order) || index + 1, visible: category.visible !== false })).sort((left, right) => left.order - right.order); CATEGORIES = token ? categories : categories.filter(category => category.visible); return CATEGORIES; }
  const client = getSupabaseClient(); const functionName = token ? 'listar_categorias_mestre' : 'listar_categorias'; const parameters = token ? { p_campanha_id: String(rpgId), p_token: token } : { p_campanha_id: String(rpgId) }; const { data, error } = await client.rpc(functionName, parameters); if (error) throw error; CATEGORIES = (data || []).map(mapCategory).sort((left, right) => left.order - right.order); return CATEGORIES;
}
function getLocalSubcategories(rpgId) { return JSON.parse(localStorage.getItem(`subcategories:${rpgId}`) || '[]'); }
function saveLocalSubcategories(rpgId, subcategories) { localStorage.setItem(`subcategories:${rpgId}`, JSON.stringify(subcategories)); }
async function loadSubcategories(rpgId, token = null) { if (isDefaultRpg(rpgId)) { const subcategories = getLocalSubcategories(rpgId).map(subcategory => ({ ...subcategory, visible: subcategory.visible !== false })).sort((left, right) => left.order - right.order); SUBCATEGORIES = token ? subcategories : subcategories.filter(subcategory => subcategory.visible); return SUBCATEGORIES; } const client = getSupabaseClient(); const functionName = token ? 'listar_subcategorias_mestre' : 'listar_subcategorias'; const parameters = token ? { p_campanha_id: String(rpgId), p_token: token } : { p_campanha_id: String(rpgId) }; const { data, error } = await client.rpc(functionName, parameters); if (error) throw error; SUBCATEGORIES = (data || []).map(mapSubcategory).sort((left, right) => left.order - right.order); return SUBCATEGORIES; }
