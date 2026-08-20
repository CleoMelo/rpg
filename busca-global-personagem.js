(function () {
  'use strict';

  if (!/\/categorias\.html$/i.test(location.pathname)) return;

  const state = {
    characters: [],
    categories: new Map(),
    tiers: new Map(),
    query: '',
    open: false
  };

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function styles() {
    if (document.getElementById('globalCharacterSearchStyles')) return;
    const style = document.createElement('style');
    style.id = 'globalCharacterSearchStyles';
    style.textContent = `
      .global-character-search {
        margin: 28px 0 42px;
      }
      .global-character-search-panel {
        position: relative;
        padding: 22px;
      }
      .global-character-search-label {
        display: block;
        margin-bottom: 9px;
        font-weight: 700;
      }
      .global-character-search-box {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 52px;
        padding: 0 16px;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 12px;
        background: rgba(255,255,255,.045);
      }
      .global-character-search-box:focus-within {
        border-color: rgba(139,92,246,.72);
        box-shadow: 0 0 0 3px rgba(139,92,246,.12);
      }
      .global-character-search-icon {
        font-size: 1.35rem;
        opacity: .75;
      }
      #globalCharacterSearchInput {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: 0;
        background: transparent;
        color: inherit;
        font: inherit;
      }
      .global-character-search-results {
        display: none;
        margin-top: 12px;
        max-height: min(520px, 60vh);
        overflow: auto;
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 12px;
        background: rgba(12,14,20,.98);
      }
      .global-character-search-results.open {
        display: block;
      }
      .global-character-search-result {
        width: 100%;
        display: grid;
        grid-template-columns: 58px 1fr auto;
        align-items: center;
        gap: 14px;
        padding: 10px 14px;
        border: 0;
        border-bottom: 1px solid rgba(255,255,255,.07);
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }
      .global-character-search-result:last-child { border-bottom: 0; }
      .global-character-search-result:hover,
      .global-character-search-result:focus-visible {
        background: rgba(139,92,246,.12);
        outline: 0;
      }
      .global-character-search-result img {
        width: 58px;
        height: 68px;
        object-fit: cover;
        border-radius: 8px;
        background: rgba(255,255,255,.05);
      }
      .global-character-search-result-name {
        display: block;
        font-weight: 800;
        margin-bottom: 4px;
      }
      .global-character-search-result-meta {
        display: block;
        font-size: .84rem;
        opacity: .66;
      }
      .global-character-search-result-arrow {
        opacity: .6;
        font-size: 1.25rem;
      }
      .global-character-search-status {
        margin: 10px 2px 0;
        min-height: 1.25em;
        font-size: .88rem;
        opacity: .72;
      }
      .global-character-search-empty {
        padding: 18px;
        text-align: center;
        opacity: .7;
      }
      @media (max-width: 620px) {
        .global-character-search-panel { padding: 16px; }
        .global-character-search-result {
          grid-template-columns: 48px 1fr;
        }
        .global-character-search-result img {
          width: 48px;
          height: 58px;
        }
        .global-character-search-result-arrow { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function buildUI() {
    if (document.getElementById('globalCharacterSearch')) return;
    const categoriesSection = document.querySelector('.category-grid')?.closest('section');
    const main = document.querySelector('main.page-shell');
    if (!main) return;

    const section = document.createElement('section');
    section.id = 'globalCharacterSearch';
    section.className = 'global-character-search';
    section.innerHTML = `
      <div class="filter-panel global-character-search-panel">
        <label class="global-character-search-label" for="globalCharacterSearchInput">Pesquisar personagem em toda a campanha</label>
        <div class="global-character-search-box">
          <span class="global-character-search-icon" aria-hidden="true">⌕</span>
          <input
            id="globalCharacterSearchInput"
            type="search"
            autocomplete="off"
            placeholder="Nome, descrição, categoria ou tier"
            aria-controls="globalCharacterSearchResults"
            aria-expanded="false"
          >
        </div>
        <div id="globalCharacterSearchResults" class="global-character-search-results" role="listbox"></div>
        <p id="globalCharacterSearchStatus" class="global-character-search-status" aria-live="polite">Digite para pesquisar em todos os personagens da campanha.</p>
      </div>
    `;

    if (categoriesSection) categoriesSection.before(section);
    else main.prepend(section);

    const input = document.getElementById('globalCharacterSearchInput');
    input.addEventListener('input', () => {
      state.query = input.value;
      renderResults();
    });
    input.addEventListener('focus', () => {
      if (state.query.trim()) openResults();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeResults();
        input.blur();
      }
    });
  }

  function openResults() {
    state.open = true;
    const results = document.getElementById('globalCharacterSearchResults');
    const input = document.getElementById('globalCharacterSearchInput');
    if (results) results.classList.add('open');
    if (input) input.setAttribute('aria-expanded', 'true');
  }

  function closeResults() {
    state.open = false;
    const results = document.getElementById('globalCharacterSearchResults');
    const input = document.getElementById('globalCharacterSearchInput');
    if (results) results.classList.remove('open');
    if (input) input.setAttribute('aria-expanded', 'false');
  }

  function getMatches() {
    const query = normalize(state.query);
    if (!query) return [];

    return state.characters
      .filter(character => {
        const category = state.categories.get(String(character.category)) || '';
        const tier = state.tiers.get(String(character.subcategory)) || 'Outros';
        const searchable = normalize([
          character.name,
          character.description,
          category,
          tier
        ].join(' '));
        return searchable.includes(query);
      })
      .slice(0, 30);
  }

  function renderResults() {
    const results = document.getElementById('globalCharacterSearchResults');
    const status = document.getElementById('globalCharacterSearchStatus');
    if (!results || !status) return;

    if (!state.query.trim()) {
      results.innerHTML = '';
      closeResults();
      status.textContent = `Pesquise entre ${state.characters.length} personagem(ns) desta campanha.`;
      return;
    }

    const matches = getMatches();
    openResults();

    status.textContent = matches.length > 30
      ? 'Mostrando os primeiros 30 resultados.'
      : `${matches.length} personagem(ns) encontrado(s).`;

    if (!matches.length) {
      results.innerHTML = '<div class="global-character-search-empty">Nenhum personagem corresponde à pesquisa.</div>';
      return;
    }

    results.innerHTML = matches.map(character => {
      const category = state.categories.get(String(character.category)) || 'Categoria';
      const tier = state.tiers.get(String(character.subcategory)) || 'Outros';
      return `
        <button class="global-character-search-result" type="button" data-global-character-id="${escapeHtml(character.id)}">
          <img src="${escapeHtml(character.image)}" alt="" loading="lazy">
          <span>
            <span class="global-character-search-result-name">${escapeHtml(character.name)}</span>
            <span class="global-character-search-result-meta">${escapeHtml(category)} · ${escapeHtml(tier)}</span>
          </span>
          <span class="global-character-search-result-arrow" aria-hidden="true">→</span>
        </button>
      `;
    }).join('');

    results.querySelectorAll('[data-global-character-id]').forEach(button => {
      button.addEventListener('click', () => focusCharacter(button.dataset.globalCharacterId));
    });
  }

  async function focusCharacter(characterId) {
    const character = state.characters.find(item => item.id === String(characterId));
    if (!character) return;

    const categoryButton = document.querySelector(
      `.category-button[data-category="${CSS.escape(String(character.category))}"]`
    );

    closeResults();

    if (categoryButton) {
      categoryButton.click();
    }

    const input = document.getElementById('globalCharacterSearchInput');
    if (input) input.blur();

    document.getElementById('charactersSection')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });

    let attempts = 0;
    const locate = () => {
      attempts += 1;
      const cards = [...document.querySelectorAll('.character-card')];
      const card = cards.find(item =>
        item.querySelector('[data-edit]')?.dataset.edit === String(character.id) ||
        item.querySelector('h3')?.textContent.trim() === character.name
      );

      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('global-character-search-highlight');
        setTimeout(() => card.classList.remove('global-character-search-highlight'), 1400);
        card.click();
        return;
      }

      if (attempts < 12) setTimeout(locate, 120);
    };

    setTimeout(locate, 100);
  }

  async function loadData() {
    const rpgId = typeof getSelectedRpg === 'function'
      ? getSelectedRpg()
      : new URLSearchParams(location.search).get('rpg') || localStorage.getItem('selectedRpg') || '';
    if (!rpgId || typeof loadCharacters !== 'function') return;

    const role = sessionStorage.getItem('role') || 'player';
    const token = typeof getMasterToken === 'function' ? getMasterToken(rpgId) : null;

    try {
      const [characters, categories, tiers] = await Promise.all([
        loadCharacters(rpgId, role === 'master' ? token : null),
        typeof loadCategories === 'function' ? loadCategories(rpgId, role === 'master' ? token : null) : [],
        typeof loadSubcategories === 'function' ? loadSubcategories(rpgId, role === 'master' ? token : null) : []
      ]);

      state.characters = characters || [];
      state.categories = new Map((categories || []).map(item => [String(item.id), item.name]));
      state.tiers = new Map((tiers || []).map(item => [String(item.id), item.name]));

      const status = document.getElementById('globalCharacterSearchStatus');
      if (status && !state.query) {
        status.textContent = `Pesquise entre ${state.characters.length} personagem(ns) desta campanha.`;
      }
    } catch (error) {
      console.error('Busca global de personagens:', error);
      const status = document.getElementById('globalCharacterSearchStatus');
      if (status) status.textContent = 'Não foi possível carregar a busca global.';
    }
  }

  function setup() {
    styles();
    buildUI();
    loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
})();