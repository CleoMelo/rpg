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

async function createRpg({ name, description, image }) {
  const client = getSupabaseClient();
  const payload = {
    nome: name.trim(),
    descricao: description.trim() || 'Campanha personalizada.',
    imagem_url: image.trim()
  };

  const { data, error } = await client
    .from('campanhas')
    .insert(payload)
    .select('id, nome, descricao, imagem_url, criado_em')
    .single();

  if (error) throw error;
  const rpg = mapCampaign(data);
  RPGS.push(rpg);
  return rpg;
}

async function deleteRpg(id) {
  const rpg = RPGS.find(item => item.id === String(id));
  if (!rpg?.custom) return false;

  const client = getSupabaseClient();
  const { error } = await client.from('campanhas').delete().eq('id', id);
  if (error) throw error;

  const index = RPGS.findIndex(item => item.id === String(id));
  if (index >= 0) RPGS.splice(index, 1);
  localStorage.removeItem(`characters:${id}`);
  return true;
}

async function getRpgById(id) {
  if (!RPGS.length) await loadRpgs();
  return RPGS.find(item => item.id === String(id)) || RPGS[0];
}

const CATEGORIES = [
  { id: "herois", name: "Heróis", icon: "⚔️", description: "Personagens principais e protagonistas." },
  { id: "aliados", name: "Aliados", icon: "🛡️", description: "Companheiros, mentores e contatos." },
  { id: "vilões", name: "Vilões", icon: "☠️", description: "Antagonistas e ameaças importantes." },
  { id: "npc", name: "NPCs", icon: "🎭", description: "Mercadores, moradores e figuras secundárias." },
  { id: "criaturas", name: "Criaturas", icon: "🐉", description: "Monstros, feras e entidades." },
  { id: "historicos", name: "Históricos", icon: "📜", description: "Personagens do passado da campanha." }
];

const DEFAULT_CHARACTERS = {
  "reinos-partidos": [
    {
      id: crypto.randomUUID(),
      name: "Alyra Valemont",
      category: "herois",
      description: "Cavaleira juramentada da Coroa de Cinzas.",
      image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=80"
    },
    {
      id: crypto.randomUUID(),
      name: "Lorde Kael",
      category: "vilões",
      description: "Nobre exilado que busca tomar o trono.",
      image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80"
    }
  ],
  "neon-abyss": [],
  "ecos-do-vazio": []
};

function getSelectedRpg() {
  const params = new URLSearchParams(location.search);
  return params.get("rpg") || localStorage.getItem("selectedRpg") || DEFAULT_RPGS[0].id;
}

function setSelectedRpg(id) {
  localStorage.setItem("selectedRpg", id);
}

function getCharacters(rpgId) {
  const saved = localStorage.getItem(`characters:${rpgId}`);
  if (saved) return JSON.parse(saved);
  const initial = DEFAULT_CHARACTERS[rpgId] || [];
  localStorage.setItem(`characters:${rpgId}`, JSON.stringify(initial));
  return initial;
}

function saveCharacters(rpgId, characters) {
  localStorage.setItem(`characters:${rpgId}`, JSON.stringify(characters));
}
