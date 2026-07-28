const DEFAULT_RPGS = [
  {
    id: "reinos-partidos",
    name: "Reinos Partidos",
    description: "Fantasia medieval, intrigas políticas e grandes batalhas.",
    image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80",
    custom: false
  },
  {
    id: "neon-abyss",
    name: "Neon Abyss",
    description: "Uma campanha cyberpunk em uma metrópole dominada por corporações.",
    image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1200&q=80",
    custom: false
  },
  {
    id: "ecos-do-vazio",
    name: "Ecos do Vazio",
    description: "Terror cósmico, mistérios antigos e exploração sobrenatural.",
    image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    custom: false
  }
];

let RPGS = [];
let supabaseClient = null;

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
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('campanhas')
      .select('id, nome, descricao, imagem_url, criado_em')
      .order('criado_em', { ascending: true });

    if (error) throw error;
    RPGS = [...DEFAULT_RPGS, ...(data || []).map(mapCampaign)];
  } catch (error) {
    console.error(error);
    RPGS = [...DEFAULT_RPGS];
    throw error;
  }

  return RPGS;
}

function normalizeImgurImageUrl(value) {
  let url;

  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('Informe um endereço de imagem válido do Imgur.');
  }

  const directHost = url.hostname.toLowerCase() === 'i.imgur.com';
  const imageExtension = /\.(?:jpe?g|png|gif|webp|avif)$/i.test(url.pathname);

  if (url.protocol !== 'https:' || !directHost || !imageExtension) {
    throw new Error('Use o endereço direto da imagem iniciado por https://i.imgur.com/.');
  }

  return url.href;
}

async function createRpg({ name, description, image, password }) {
  const client = getSupabaseClient();
  const imageUrl = normalizeImgurImageUrl(image);
  const { data, error } = await client
    .rpc('criar_campanha', {
      p_nome: name.trim(),
      p_descricao: description.trim() || 'Campanha personalizada.',
      p_imagem_url: imageUrl,
      p_senha: password
    })
    .single();

  if (error) throw error;
  const rpg = mapCampaign(data);
  RPGS.push(rpg);
  return rpg;
}

function isDefaultRpg(id) {
  return DEFAULT_RPGS.some(rpg => rpg.id === String(id));
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
  if (isDefaultRpg(id)) {
    if (password !== 'mestre123') return null;
    const demoToken = `demo:${String(id)}`;
    setMasterSession(id, demoToken);
    return demoToken;
  }

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
  const rpg = RPGS.find(item => item.id === String(id));
  if (!rpg?.custom || !token) return false;

  const client = getSupabaseClient();
  const { data, error } = await client.rpc('excluir_campanha', {
    p_campanha_id: String(id),
    p_token: token
  });

  if (error) throw error;
  if (!data) return false;

  const index = RPGS.findIndex(item => item.id === String(id));
  if (index >= 0) RPGS.splice(index, 1);
  clearMasterSession(id);
  localStorage.removeItem(`characters:${id}`);
  localStorage.removeItem(`categories:${id}`);
  return true;
}

async function getRpgById(id) {
  if (!RPGS.length) await loadRpgs();
  return RPGS.find(item => item.id === String(id)) || RPGS[0];
}

const DEFAULT_CATEGORIES = [
  { id: 'herois', name: 'Heróis', icon: '⚔️', description: 'Personagens principais e protagonistas.', custom: false },
  { id: 'aliados', name: 'Aliados', icon: '🛡️', description: 'Companheiros, mentores e contatos.', custom: false },
  { id: 'vilões', name: 'Vilões', icon: '☠️', description: 'Antagonistas e ameaças importantes.', custom: false },
  { id: 'npc', name: 'NPCs', icon: '🎭', description: 'Mercadores, moradores e figuras secundárias.', custom: false },
  { id: 'criaturas', name: 'Criaturas', icon: '🐉', description: 'Monstros, feras e entidades.', custom: false },
  { id: 'historicos', name: 'Históricos', icon: '📜', description: 'Personagens do passado da campanha.', custom: false }
];

let CATEGORIES = [];

const DEFAULT_CHARACTERS = {
  'reinos-partidos': [
    {
      id: crypto.randomUUID(),
      name: 'Alyra Valemont',
      category: 'herois',
      description: 'Cavaleira juramentada da Coroa de Cinzas.',
      image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=80'
    },
    {
      id: crypto.randomUUID(),
      name: 'Lorde Kael',
      category: 'vilões',
      description: 'Nobre exilado que busca tomar o trono.',
      image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80'
    }
  ],
  'neon-abyss': [],
  'ecos-do-vazio': []
};

function getSelectedRpg() {
  const params = new URLSearchParams(location.search);
  return params.get('rpg') || localStorage.getItem('selectedRpg') || DEFAULT_RPGS[0].id;
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
    custom: true
  };
}

function mapCharacter(row) {
  return {
    id: String(row.id),
    campaignId: String(row.campanha_id),
    category: String(row.categoria_id),
    name: row.nome,
    description: row.descricao || '',
    image: row.imagem_url,
    visible: row.visivel !== false
  };
}

function getLocalCategories(rpgId) {
  const saved = JSON.parse(localStorage.getItem(`categories:${rpgId}`) || '[]');
  return [...DEFAULT_CATEGORIES.map(category => ({ ...category })), ...saved];
}

function saveLocalCategories(rpgId, categories) {
  const custom = categories.filter(category => category.custom);
  localStorage.setItem(`categories:${rpgId}`, JSON.stringify(custom));
}

async function loadCategories(rpgId) {
  if (isDefaultRpg(rpgId)) {
    CATEGORIES = getLocalCategories(rpgId);
    return CATEGORIES;
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from('categorias')
    .select('id, campanha_id, nome, descricao, icone, criado_em')
    .eq('campanha_id', String(rpgId))
    .order('criado_em', { ascending: true });

  if (error) throw error;
  CATEGORIES = (data || []).map(mapCategory);
  return CATEGORIES;
}

async function createCategory({ rpgId, token, name, description, icon }) {
  if (isDefaultRpg(rpgId)) {
    const category = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      icon: icon.trim() || '📁',
      custom: true
    };
    CATEGORIES.push(category);
    saveLocalCategories(rpgId, CATEGORIES);
    return category;
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .rpc('criar_categoria', {
      p_campanha_id: String(rpgId),
      p_token: token,
      p_nome: name.trim(),
      p_descricao: description.trim(),
      p_icone: icon.trim() || '📁'
    })
    .single();

  if (error) throw error;
  const category = mapCategory(data);
  CATEGORIES.push(category);
  return category;
}

async function deleteCategory({ rpgId, token, categoryId }) {
  if (isDefaultRpg(rpgId)) {
    const category = CATEGORIES.find(item => item.id === String(categoryId));
    if (!category?.custom) return false;
    CATEGORIES = CATEGORIES.filter(item => item.id !== String(categoryId));
    saveLocalCategories(rpgId, CATEGORIES);
    const remaining = getLocalCharacters(rpgId).filter(character => character.category !== String(categoryId));
    saveLocalCharacters(rpgId, remaining);
    return true;
  }

  const client = getSupabaseClient();
  const { data, error } = await client.rpc('excluir_categoria', {
    p_campanha_id: String(rpgId),
    p_categoria_id: String(categoryId),
    p_token: token
  });

  if (error) throw error;
  if (data) CATEGORIES = CATEGORIES.filter(item => item.id !== String(categoryId));
  return Boolean(data);
}

function getLocalCharacters(rpgId) {
  const saved = localStorage.getItem(`characters:${rpgId}`);
  if (saved) return JSON.parse(saved);
  const initial = DEFAULT_CHARACTERS[rpgId] || [];
  localStorage.setItem(`characters:${rpgId}`, JSON.stringify(initial));
  return initial;
}

function saveLocalCharacters(rpgId, characters) {
  localStorage.setItem(`characters:${rpgId}`, JSON.stringify(characters));
}

async function loadCharacters(rpgId, token = null) {
  if (isDefaultRpg(rpgId)) {
    const characters = getLocalCharacters(rpgId).map(character => ({
      ...character,
      visible: character.visible !== false
    }));
    return token ? characters : characters.filter(character => character.visible);
  }

  const client = getSupabaseClient();
  const { data, error } = await client.rpc('listar_personagens', {
    p_campanha_id: String(rpgId),
    p_token: token || null
  });

  if (error) throw error;
  return (data || []).map(mapCharacter);
}

async function createCharacter({
  rpgId,
  token,
  name,
  categoryId,
  description,
  image,
  visible = true
}) {
  const imageUrl = normalizeImgurImageUrl(image);

  if (isDefaultRpg(rpgId)) {
    const characters = getLocalCharacters(rpgId);
    const character = {
      id: crypto.randomUUID(),
      name: name.trim(),
      category: String(categoryId),
      description: description.trim(),
      image: imageUrl,
      visible: Boolean(visible)
    };
    characters.push(character);
    saveLocalCharacters(rpgId, characters);
    return character;
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .rpc('criar_personagem_com_visibilidade', {
      p_campanha_id: String(rpgId),
      p_categoria_id: String(categoryId),
      p_token: token,
      p_nome: name.trim(),
      p_descricao: description.trim(),
      p_imagem_url: imageUrl,
      p_visivel: Boolean(visible)
    })
    .single();

  if (error) throw error;
  return mapCharacter(data);
}

async function setCharacterVisibility({ rpgId, token, characterId, visible }) {
  if (isDefaultRpg(rpgId)) {
    const characters = getLocalCharacters(rpgId);
    const character = characters.find(item => item.id === String(characterId));
    if (!character || !token) return false;
    character.visible = Boolean(visible);
    saveLocalCharacters(rpgId, characters);
    return true;
  }

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

async function deleteCharacter({ rpgId, token, characterId }) {
  if (isDefaultRpg(rpgId)) {
    const remaining = getLocalCharacters(rpgId).filter(character => character.id !== String(characterId));
    saveLocalCharacters(rpgId, remaining);
    return true;
  }

  const client = getSupabaseClient();
  const { data, error } = await client.rpc('excluir_personagem', {
    p_campanha_id: String(rpgId),
    p_personagem_id: String(characterId),
    p_token: token
  });

  if (error) throw error;
  return Boolean(data);
}

