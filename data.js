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

function loadCustomRpgs() {
  try {
    const saved = JSON.parse(localStorage.getItem("customRpgs") || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

const RPGS = [...DEFAULT_RPGS, ...loadCustomRpgs()];

function slugifyRpgName(name) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "campanha";

  let id = base;
  let suffix = 2;
  while (RPGS.some(rpg => rpg.id === id)) id = `${base}-${suffix++}`;
  return id;
}

function createRpg({ name, description, image }) {
  const rpg = {
    id: slugifyRpgName(name),
    name: name.trim(),
    description: description.trim() || "Campanha personalizada.",
    image: image.trim(),
    custom: true
  };

  const customRpgs = loadCustomRpgs();
  customRpgs.push(rpg);
  localStorage.setItem("customRpgs", JSON.stringify(customRpgs));
  RPGS.push(rpg);
  return rpg;
}

function deleteRpg(id) {
  const rpg = RPGS.find(item => item.id === id);
  if (!rpg?.custom) return false;

  const updated = loadCustomRpgs().filter(item => item.id !== id);
  localStorage.setItem("customRpgs", JSON.stringify(updated));
  localStorage.removeItem(`characters:${id}`);

  const index = RPGS.findIndex(item => item.id === id);
  if (index >= 0) RPGS.splice(index, 1);
  return true;
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
  return params.get("rpg") || localStorage.getItem("selectedRpg") || RPGS[0].id;
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
