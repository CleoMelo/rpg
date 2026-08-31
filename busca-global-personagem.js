(function () {
  'use strict';
  if (!/\/categorias\.html$/i.test(location.pathname)) return;

  const state = { characters: [], categories: new Map(), tiers: new Map(), query: '' };

  const normalize = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  function styles() {
    if (document.getElementById('globalCharacterSearchStyles')) return;

    const style = document.createElement('style');
    style.id = 'globalCharacterSearchStyles';
    style.textContent = `
      .global-character-search {
        width: 100%;
        margin: 0 0 24px;
      }

      .global-character-search-panel {
        width: 100%;
        padding: 0;
        background: transparent;
        border: 0;
        box-shadow: none;
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
        min-height: 50px;
        padding: 0 15px;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 12px;
        background: rgba(255,255,255,.045);
        box-sizing: border-box;
      }

      .global-character-search-box:focus-within {
        border-color: rgba(139,92,246,.72);
        box-shadow: 0 0 0 3px rgba(139,92,246,.12);
      }

      .global-character-search-icon {
        font-size: 1.3rem;
        opacity: .72;
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
        width: 100%;
        margin-top: 16px;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        box-sizing: border-box;
      }

      .global-character-search-results:empty {
        display: none;
      }

      .global-character-search-result {
        width: 100%;
        min-width: 0;
        min-height: 86px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px;
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 12px;
        background: rgba(12,14,20,.72);
        color: inherit;
        text-align: left;
        cursor: pointer;
        box-sizing: border-box;
        transition: transform .16s ease, background .16s ease, border-color .16s ease;
      }

      .global-character-search-result:hover,
      .global-character-search-result:focus-visible {
        background: rgba(139,92,246,.12);
        border-color: rgba(139,92,246,.35);
        transform: translateY(-1px);
        outline: 0;
      }

      .global-character-search-result img {
        flex: 0 0 58px;
        width: 58px;
        height: 68px;
        object-fit: cover;
        border-radius: 8px;
        background: rgba(255,255,255,.05);
      }

      .global-character-search-result-info {
        min-width: 0;
        display: block;
      }

      .global-character-search-result-name {
        display: block;
        font-weight: 800;
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .global-character-search-result-meta {
        display: block;
        font-size: .82rem;
        opacity: .62;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .global-character-search-result-arrow {
        margin-left: auto;
        opacity: .55;
        font-size: 1.15rem;
      }

      .global-character-search-empty {
        grid-column: 1 / -1;
        padding: 18px;
        text-align: center;
        opacity: .7;
        border: 1px solid rgba(255,255,255,.07);
        border-radius: 12px;
        background: rgba(12,14,20,.5);
      }

      .global-character-search-highlight {
        animation: globalCharacterSearchPulse 1.4s ease;
      }

      @keyframes globalCharacterSearchPulse {
        0%, 100% { box-shadow: 0 0 0 transparent; }
        30% { box-shadow: 0 0 0 4px rgba(139,92,246,.55); }
      }

      @media (max-width: 1100px) {
        .global-character-search-results {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @media (max-width: 800px) {
        .global-character-search-results {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 560px) {
        .global-character-search-results {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function buildUI() {
    if (document.getElementById('globalCharacterSearch')) return;

    const main = document.querySelector('main.page-shell');
    if (!main) return;

    const section = document.createElement('section');
    section.id = 'globalCharacterSearch';
    section.className = 'global-character-search';
    section.innerHTML = `
      <div class="global-character-search-panel">
        <label class="global-character-search-label" for="globalCharacterSearchInput">Buscar personagem</label>
        <div class="global-character-search-box">
          <span class="global-character-search-icon" aria-hidden="true">⌕</span>
          <input
            id="globalCharacterSearchInput"
            type="search"
            autocomplete="off"
            placeholder="Nome, descrição, categoria ou tier"
          >
        </div>
        <div id="globalCharacterSearchResults" class="global-character-search-results" aria-live="polite"></div>
      </div>
    `;

    const campaignHeader = main.querySelector('.section-title');
    if (campaignHeader) campaignHeader.after(section);
    else main.prepend(section);

    const input = document.getElementById('globalCharacterSearchInput');
    input.addEventListener('input', () => {
      state.query = input.value;
      renderResults();
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        input.value = '';
        state.query = '';
        renderResults();
        input.blur();
      }
    });
  }

  function getMatches() {
    const query = normalize(state.query);
    if (!query) return [];

    return state.characters
      .filter(character => {
        const category = state.categories.get(String(character.category)) || '';
        const tier = state.tiers.get(String(character.subcategory)) || 'Outros';
        return normalize([
          character.name,
          character.description,
          category,
          tier
        ].join(' ')).includes(query);
      })
      .slice(0, 30);
  }

  function renderResults() {
    const results = document.getElementById('globalCharacterSearchResults');
    if (!results) return;

    if (!state.query.trim()) {
      results.innerHTML = '';
      return;
    }

    const matches = getMatches();

    if (!matches.length) {
      results.innerHTML = '<div class="global-character-search-empty">Nenhum personagem encontrado.</div>';
      return;
    }

    results.innerHTML = matches.map(character => {
      const category = state.categories.get(String(character.category)) || 'Categoria';
      const tier = state.tiers.get(String(character.subcategory)) || 'Outros';

      return `
        <button
          class="global-character-search-result"
          type="button"
          data-global-character-id="${escapeHtml(character.id)}"
        >
          <img src="${escapeHtml(character.image)}" alt="" loading="lazy">
          <span class="global-character-search-result-info">
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

  async function focusCharacter(id) {
    const character = state.characters.find(item => item.id === String(id));
    if (!character) return;

    const categoryButton = document.querySelector(
      `.category-button[data-category="${CSS.escape(String(character.category))}"]`
    );

    categoryButton?.click();
    document.getElementById('globalCharacterSearchInput')?.blur();
    document.getElementById('charactersSection')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });

    let attempts = 0;
    const locate = () => {
      attempts += 1;

      const card = [...document.querySelectorAll('.character-card')].find(item =>
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
    } catch (error) {
      console.error('Busca global de personagens:', error);
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
