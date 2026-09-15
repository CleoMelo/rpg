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
  supabaseClient = window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
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

async function createRpgForAccount({ name, description, image }) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('criar_campanha_conta', {
    p_nome: name.trim(),
    p_descricao: description.trim() || 'Campanha personalizada.',
    p_imagem_url: normalizeImgurImageUrl(image)
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

const ACCOUNT_ACTIVE_KEY = 'rpgAccountActive';
const ACCOUNT_ACCESS_PREFIX = 'rpgAccountAccess:';

function accountAccessKey(id) {
  return `${ACCOUNT_ACCESS_PREFIX}${String(id)}`;
}

function readStoredAccountAccess(id) {
  const key = accountAccessKey(id);
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    const validRole = value?.role === 'master' || value?.role === 'editor';
    const validCampaign = String(value?.campaignId || '') === String(id);
    const validToken = typeof value?.token === 'string' && value.token.trim();
    const validExpiry = Date.parse(value?.expiresAt || '') > Date.now() + 30_000;
    if (validRole && validCampaign && validToken && validExpiry) return value;
  } catch {
    // Sessões inválidas são descartadas abaixo.
  }
  localStorage.removeItem(key);
  return null;
}

function restoreStoredAccountAccess(id) {
  const access = readStoredAccountAccess(id);
  if (!access) return null;
  sessionStorage.setItem('role', access.role);
  if (access.role === 'master') {
    sessionStorage.setItem(masterSessionKey(id), access.token);
    sessionStorage.setItem('masterRpgId', String(id));
    sessionStorage.removeItem(editorSessionKey(id));
    sessionStorage.removeItem('editorRpgId');
  } else {
    sessionStorage.setItem(editorSessionKey(id), access.token);
    sessionStorage.setItem('editorRpgId', String(id));
    sessionStorage.removeItem(masterSessionKey(id));
    sessionStorage.removeItem('masterRpgId');
  }
  return access;
}

function setAccountCampaignSession(id, access) {
  const normalized = {
    campaignId: String(id),
    role: access.role,
    token: String(access.token || ''),
    expiresAt: access.expiresAt
  };
  localStorage.setItem(accountAccessKey(id), JSON.stringify(normalized));
  localStorage.setItem(ACCOUNT_ACTIVE_KEY, '1');
  restoreStoredAccountAccess(id);
  return normalized;
}

function clearStoredAccountAccess(id) {
  localStorage.removeItem(accountAccessKey(id));
}

function clearAllStoredAccountAccess() {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(ACCOUNT_ACCESS_PREFIX)) keys.push(key);
  }
  keys.forEach(key => localStorage.removeItem(key));
  localStorage.removeItem(ACCOUNT_ACTIVE_KEY);
}

function accountSessionExpected() {
  return localStorage.getItem(ACCOUNT_ACTIVE_KEY) === '1';
}

function getMasterToken(id) {
  const stored = readStoredAccountAccess(id);
  return sessionStorage.getItem(masterSessionKey(id)) ||
    (stored?.role === 'master' ? stored.token : null);
}

function clearMasterSession(id) {
  sessionStorage.removeItem(masterSessionKey(id));
  if (readStoredAccountAccess(id)?.role === 'master') clearStoredAccountAccess(id);
  if (sessionStorage.getItem('masterRpgId') === String(id)) {
    sessionStorage.removeItem('masterRpgId');
    sessionStorage.removeItem('role');
  }
}

function editorSessionKey(id) {
  return `editorSession:${String(id)}`;
}

function getEditorToken(id) {
  const stored = readStoredAccountAccess(id);
  return sessionStorage.getItem(editorSessionKey(id)) ||
    (stored?.role === 'editor' ? stored.token : null);
}

function clearEditorSession(id) {
  sessionStorage.removeItem(editorSessionKey(id));
  if (readStoredAccountAccess(id)?.role === 'editor') clearStoredAccountAccess(id);
  if (sessionStorage.getItem('editorRpgId') === String(id)) {
    sessionStorage.removeItem('editorRpgId');
    sessionStorage.removeItem('role');
  }
}

async function openAccountCampaign(id) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('abrir_sessao_conta', {
    p_campanha_id: String(id)
  });
  if (error) throw error;
  const access = Array.isArray(data) ? data[0] : data;
  if (!access?.papel || !access?.token || !access?.expira_em) {
    throw new Error('O Supabase não retornou uma sessão válida para esta campanha.');
  }
  return setAccountCampaignSession(id, {
    role: access.papel,
    token: access.token,
    expiresAt: access.expira_em
  });
}

async function signInAccount({ login, password, campaignId = '' }) {
  const client = getSupabaseClient();
  const normalizedLogin = String(login || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,32}$/.test(normalizedLogin)) {
    throw new Error('Informe um login válido.');
  }
  const { data: authenticationEmail, error: loginError } = await client.rpc('resolver_login_conta', {
    p_login: normalizedLogin
  });
  if (loginError) throw loginError;
  if (!authenticationEmail) throw new Error('Login ou senha inválido.');
  const { data, error } = await client.auth.signInWithPassword({
    email: authenticationEmail,
    password: String(password || '')
  });
  if (error) throw error;
  if (!data?.user) throw new Error('Não foi possível entrar na conta.');
  localStorage.setItem(ACCOUNT_ACTIVE_KEY, '1');
  const access = campaignId ? await openAccountCampaign(campaignId) : null;
  return { user: data.user, access };
}

async function restoreAccountCampaign(id) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data?.session?.user) return null;
  localStorage.setItem(ACCOUNT_ACTIVE_KEY, '1');
  return openAccountCampaign(id);
}

async function ensureCampaignAccess(id, role, token) {
  if (role !== 'master' && role !== 'editor') return true;
  const functionName = role === 'master' ? 'token_mestre_valido' : 'token_editor_valido';
  const { data, error } = await getSupabaseClient().rpc(functionName, {
    p_campanha_id: String(id),
    p_token: String(token || '')
  });
  if (!error && data === true) return true;

  if (role === 'master') clearMasterSession(id);
  else clearEditorSession(id);

  if (accountSessionExpected()) {
    try {
      await restoreAccountCampaign(id);
      location.reload();
    } catch {
      const returnPath = `${location.pathname.split('/').pop()}${location.search}`;
      location.href = `login.html?rpg=${encodeURIComponent(id)}&return=${encodeURIComponent(returnPath)}`;
    }
  } else {
    location.href = `acesso.html?rpg=${encodeURIComponent(id)}`;
  }
  return false;
}

async function getCurrentAccount() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return data?.user || null;
}

async function signOutAccount() {
  const client = getSupabaseClient();
  try {
    const { error } = await client.rpc('revogar_minhas_sessoes_conta', { p_campanha_id: null });
    if (error) throw error;
  } catch (error) {
    console.warn('Não foi possível revogar as sessões de compatibilidade.', error);
  }
  await client.auth.signOut();
  clearAllStoredAccountAccess();
  sessionStorage.removeItem('role');
  sessionStorage.removeItem('masterRpgId');
  sessionStorage.removeItem('editorRpgId');
  const sessionKeys = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (key?.startsWith('masterSession:') || key?.startsWith('editorSession:')) sessionKeys.push(key);
  }
  sessionKeys.forEach(key => sessionStorage.removeItem(key));
}

async function loadMyAccountProfile() {
  const { data, error } = await getSupabaseClient().rpc('meu_perfil_conta');
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data;
}

async function loadMyAccountCampaigns() {
  const { data, error } = await getSupabaseClient().rpc('minhas_campanhas_conta');
  if (error) throw error;
  return data || [];
}

async function updateMyAccountLogin(login) {
  const { data, error } = await getSupabaseClient().rpc('atualizar_meu_login_conta', {
    p_login: String(login || '').trim()
  });
  if (error) throw error;
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
  clearEditorSession(id);
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

async function updateCategoryAsEditor({ rpgId, token, categoryId, name, description, icon }) {
  if (!token) return null;
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('editar_categoria_editor', {
    p_campanha_id: String(rpgId),
    p_categoria_id: String(categoryId),
    p_token: token,
    p_nome: name.trim(),
    p_descricao: description.trim(),
    p_icone: icon.trim() || '📁'
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

async function updateCharacterAsEditor({ rpgId, token, characterId, name, categoryId, subcategoryId = null, description, image }) {
  if (!token) throw new Error('Sessão de editor não encontrada.');
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('editar_personagem_editor', {
    p_campanha_id: String(rpgId),
    p_personagem_id: String(characterId),
    p_token: token,
    p_nome: name.trim(),
    p_categoria_id: String(categoryId),
    p_subcategoria_id: subcategoryId ? String(subcategoryId) : null,
    p_descricao: description.trim(),
    p_imagem_url: normalizeImgurImageUrl(image)
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
