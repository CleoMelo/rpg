let RPGS = [];
let supabaseClient = null;
let CATEGORIES = [];
let SUBCATEGORIES = [];

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const config = window.SUPABASE_CONFIG || {};
  const configured = config.url && config.anonKey &&
    !config.url.includes('COLE_AQUI') && !config.anonKey.includes('COLE_AQUI');
  if (!configured || !window.supabase) {
    throw new Error('Supabase não configurado. Preencha o arquivo supabase-config.js.');
  }
  supabaseClient = window.supabase.createClient(config.url, config.anonKey);
  return supabaseClient;
}

function mapCampaign(row) {
  return {
    id: String(row.id),
    name: row.nome,
    description: row.descricao || 'Campanha personalizada.',
    image: row.imagem_url,
    custom: true
  };
}

async function loadRpgs() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('campanhas')
    .select('id, nome, descricao, imagem_url, criado_em')
    .order('criado_em', { ascending: true });
  if (error) {
    RPGS = [];
    throw error;
  }
  RPGS = (data || []).map(mapCampaign);
  return RPGS;
}

function normalizeImgurImageUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('Informe um endereço de imagem válido.');
  }
  const hostname = url.hostname.toLowerCase();
  const imageExtension = /\.(?:jpe?g|png|gif|webp|avif)$/i.test(url.pathname);
  const legacyImgur = hostname === 'i.imgur.com' && imageExtension;
  const imageKit = hostname === 'ik.imagekit.io' &&
    url.pathname.startsWith('/apirpgs/') && imageExtension;
  if (url.protocol !== 'https:' || (!legacyImgur && !imageKit)) {
    throw new Error('A imagem precisa ter sido enviada pelo Portal de RPGs.');
  }
  return url.href;
}

async function createRpg({ name, description, image, password }) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('criar_campanha', {
    p_nome: name.trim(),
    p_descricao: description.trim() || 'Campanha personalizada.',
    p_imagem_url: normalizeImgurImageUrl(image),
    p_senha: password
  }).single();
  if (error) throw error;
  const rpg = mapCampaign(data);
  RPGS.push(rpg);
  return rpg;
}

async function updateRpg({ id, token, name, description, image }) {
  if (!token) return null;
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('editar_campanha', {
    p_campanha_id: String(id),
    p_token: token,
    p_nome: name.trim(),
    p_descricao: description.trim() || 'Campanha personalizada.',
    p_imagem_url: normalizeImgurImageUrl(image)
  }).single();
  if (error) throw error;
  const updated = mapCampaign(data);
  const index = RPGS.findIndex(item => item.id === String(id));
  if (index >= 0) RPGS[index] = updated;
  return updated;
}

function masterSessionKey(id) {
  return `masterSession:${String(id)}`;
}

function setMasterSession(id, token) {
  sessionStorage.setItem(masterSessionKey(id), token);
  sessionStorage.setItem('role', 'master');
  sessionStorage.setItem('masterRpgId', String(id));
}

function getMasterToken(id) {
  return sessionStorage.getItem(masterSessionKey(id));
}

function clearMasterSession(id) {
  sessionStorage.removeItem(masterSessionKey(id));
  if (sessionStorage.getItem('masterRpgId') === String(id)) {
    sessionStorage.removeItem('masterRpgId');
    sessionStorage.removeItem('role');
  }
}

async function authenticateMaster(id, password) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('autenticar_mestre', {
    p_campanha_id: String(id),
    p_senha: password
  });
  if (error) throw error;
  if (!data) return null;
  setMasterSession(id, data);
  return data;
}

async function deleteRpg(id, token) {
  if (!token) return false;
  await deleteCampaignMedia({ rpgId: String(id), token });
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('excluir_campanha', {
    p_campanha_id: String(id),
    p_token: token
  });
  if (error) throw error;
  if (!data) return false;
  RPGS = RPGS.filter(item => item.id !== String(id));
  clearMasterSession(id);
  return true;
}

async function getRpgById(id) {
  if (!RPGS.length) await loadRpgs();
  return RPGS.find(item => item.id === String(id)) || RPGS[0] || null;
}

function getSelectedRpg() {
  const params = new URLSearchParams(location.search);
  return params.get('rpg') || localStorage.getItem('selectedRpg') || '';
}

function setSelectedRpg(id) {
  localStorage.setItem('selectedRpg', id);
}

function mapCategory(row) {
  return {
    id: String(row.id),
    campaignId: String(row.campanha_id),
    name: row.nome,
    description: row.descricao || '',
    icon: row.icone || '📁',
    order: Number(row.ordem) || 0,
    visible: row.visivel !== false,
    custom: true
  };
}

function mapSubcategory(row) {
  return {
    id: String(row.id),
    campaignId: String(row.campanha_id),
    category: String(row.categoria_id),
    name: row.nome,
    order: Number(row.ordem) || 0,
    visible: row.visivel !== false
  };
}

function mapCharacter(row) {
  return {
    id: String(row.id),
    campaignId: String(row.campanha_id),
    category: String(row.categoria_id),
    subcategory: row.subcategoria_id ? String(row.subcategoria_id) : null,
    name: row.nome,
    description: row.descricao || '',
    image: row.imagem_url,
    order: Number(row.ordem) || 0,
    visible: row.visivel !== false
  };
}

async function loadCategories(rpgId, token = null) {
  const client = getSupabaseClient();
  const functionName = token ? 'listar_categorias_mestre' : 'listar_categorias';
  const parameters = token
    ? { p_campanha_id: String(rpgId), p_token: token }
    : { p_campanha_id: String(rpgId) };
  const { data, error } = await client.rpc(functionName, parameters);
  if (error) throw error;
  CATEGORIES = (data || []).map(mapCategory).sort((a, b) => a.order - b.order);
  return CATEGORIES;
}

async function loadSubcategories(rpgId, token = null) {
  const client = getSupabaseClient();
  const functionName = token ? 'listar_subcategorias_mestre' : 'listar_subcategorias';
  const parameters = token
    ? { p_campanha_id: String(rpgId), p_token: token }
    : { p_campanha_id: String(rpgId) };
  const { data, error } = await client.rpc(functionName, parameters);
  if (error) throw error;
  SUBCATEGORIES = (data || []).map(mapSubcategory).sort((a, b) => a.order - b.order);
  return SUBCATEGORIES;
}

async function createSubcategory({ rpgId, token, categoryId, name, order, visible = true }) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('criar_subcategoria', {
    p_campanha_id: String(rpgId),
    p_categoria_id: String(categoryId),
    p_token: token,
    p_nome: name.trim(),
    p_ordem: Number(order) || 0,
    p_visivel: Boolean(visible)
  }).single();
  if (error) throw error;
  const subcategory = mapSubcategory(data);
  await loadSubcategories(rpgId, token);
  return SUBCATEGORIES.find(item => item.id === subcategory.id) || subcategory;
}

async function updateSubcategory({ rpgId, token, subcategoryId, name, order, visible = true }) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('editar_subcategoria', {
    p_campanha_id: String(rpgId),
    p_subcategoria_id: String(subcategoryId),
    p_token: token,
    p_nome: name.trim(),
    p_ordem: Number(order) || 0,
    p_visivel: Boolean(visible)
  }).single();
  if (error) throw error;
  const updated = mapSubcategory(data);
  await loadSubcategories(rpgId, token);
  return SUBCATEGORIES.find(item => item.id === updated.id) || updated;
}

async function deleteSubcategory({ rpgId, token, subcategoryId, deleteCharacters = false, imageUrls = [] }) {
  if (deleteCharacters && imageUrls.length) {
    await deleteCharacterMedia({ rpgId, token, imageUrls });
  }
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('excluir_subcategoria', {
    p_campanha_id: String(rpgId),
    p_subcategoria_id: String(subcategoryId),
    p_token: token,
    p_excluir_personagens: Boolean(deleteCharacters)
  });
  if (error) throw error;
  if (data) await loadSubcategories(rpgId, token);
  return Boolean(data);
}

async function createCategory({ rpgId, token, name, description, icon, visible = true }) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('criar_categoria', {
    p_campanha_id: String(rpgId),
    p_token: token,
    p_nome: name.trim(),
    p_descricao: description.trim(),
    p_icone: icon.trim() || '📁',
    p_visivel: Boolean(visible)
  }).single();
  if (error) throw error;
  const category = mapCategory(data);
  CATEGORIES.push(category);
  return category;
}

async function updateCategory({ rpgId, token, categoryId, name, description, icon, visible = true }) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('editar_categoria', {
    p_campanha_id: String(rpgId),
    p_categoria_id: String(categoryId),
    p_token: token,
    p_nome: name.trim(),
    p_descricao: description.trim(),
    p_icone: icon.trim() || '📁',
    p_visivel: Boolean(visible)
  }).single();
  if (error) throw error;
  const updated = mapCategory(data);
  const index = CATEGORIES.findIndex(item => item.id === String(categoryId));
  if (index >= 0) CATEGORIES[index] = updated;
  return updated;
}

async function deleteCategory({ rpgId, token, categoryId, imageUrls = null }) {
  let categoryImageUrls = Array.isArray(imageUrls) ? imageUrls : null;
  if (!categoryImageUrls) {
    const categoryCharacters = await loadCharacters(rpgId, token);
    categoryImageUrls = categoryCharacters
      .filter(character => character.category === String(categoryId))
      .map(character => character.image);
  }
  await deleteCharacterMedia({ rpgId, token, imageUrls: categoryImageUrls });
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('excluir_categoria', {
    p_campanha_id: String(rpgId),
    p_categoria_id: String(categoryId),
    p_token: token
  });
  if (error) throw error;
  if (data) {
    CATEGORIES = CATEGORIES.filter(item => item.id !== String(categoryId));
    SUBCATEGORIES = SUBCATEGORIES.filter(item => item.category !== String(categoryId));
  }
  return Boolean(data);
}

async function loadCharacters(rpgId, token = null) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('listar_personagens', {
    p_campanha_id: String(rpgId),
    p_token: token || null
  });
  if (error) throw error;
  return (data || []).map(mapCharacter).sort((a, b) => a.order - b.order);
}

async function createCharacter({ rpgId, token, name, categoryId, subcategoryId = null, description, image, visible = true }) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('criar_personagem_imagekit', {
    p_campanha_id: String(rpgId),
    p_categoria_id: String(categoryId),
    p_subcategoria_id: subcategoryId ? String(subcategoryId) : null,
    p_token: token,
    p_nome: name.trim(),
    p_descricao: description.trim(),
    p_imagem_url: normalizeImgurImageUrl(image),
    p_visivel: Boolean(visible)
  }).single();
  if (error) throw error;
  return mapCharacter(data);
}

async function updateCharacter({ rpgId, token, characterId, name, categoryId, subcategoryId = null, description, image, visible }) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('editar_personagem_imagekit', {
    p_campanha_id: String(rpgId),
    p_personagem_id: String(characterId),
    p_token: token,
    p_nome: name.trim(),
    p_categoria_id: String(categoryId),
    p_subcategoria_id: subcategoryId ? String(subcategoryId) : null,
    p_descricao: description.trim(),
    p_imagem_url: normalizeImgurImageUrl(image),
    p_visivel: Boolean(visible)
  }).single();
  if (error) throw error;
  return mapCharacter(data);
}

async function setCharacterVisibility({ rpgId, token, characterId, visible }) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('definir_visibilidade_personagem', {
    p_campanha_id: String(rpgId),
    p_personagem_id: String(characterId),
    p_token: token,
    p_visivel: Boolean(visible)
  });
  if (error) throw error;
  return Boolean(data);
}

function applyOrderedIds(items, orderedIds) {
  const positions = new Map(orderedIds.map((id, index) => [String(id), index + 1]));
  items.forEach(item => {
    const position = positions.get(String(item.id));
    if (position) item.order = position;
  });
  return items.sort((a, b) => a.order - b.order);
}

async function reorderCategories({ rpgId, token, orderedIds }) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('ordenar_categorias', {
    p_campanha_id: String(rpgId),
    p_token: token,
    p_ids: orderedIds.map(String)
  });
  if (error) throw error;
  if (data) applyOrderedIds(CATEGORIES, orderedIds);
  return Boolean(data);
}

async function reorderSubcategories({ rpgId, token, orderedIds }) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('ordenar_subcategorias', {
    p_campanha_id: String(rpgId),
    p_token: token,
    p_ids: orderedIds.map(String)
  });
  if (error) throw error;
  if (data) applyOrderedIds(SUBCATEGORIES, orderedIds);
  return Boolean(data);
}

async function reorderCharacters({ rpgId, token, categoryId, subcategoryId = null, orderedIds }) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('ordenar_personagens', {
    p_campanha_id: String(rpgId),
    p_categoria_id: String(categoryId),
    p_subcategoria_id: subcategoryId ? String(subcategoryId) : null,
    p_token: token,
    p_ids: orderedIds.map(String)
  });
  if (error) throw error;
  return Boolean(data);
}

async function deleteCharacter({ rpgId, token, characterId, imageUrl = null }) {
  let characterImageUrl = imageUrl;
  if (!characterImageUrl) {
    const campaignCharacters = await loadCharacters(rpgId, token);
    characterImageUrl = campaignCharacters.find(character => character.id === String(characterId))?.image || null;
  }
  await deleteCharacterMedia({
    rpgId,
    token,
    imageUrls: characterImageUrl ? [characterImageUrl] : []
  });
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('excluir_personagem', {
    p_campanha_id: String(rpgId),
    p_personagem_id: String(characterId),
    p_token: token
  });
  if (error) throw error;
  return Boolean(data);
}
