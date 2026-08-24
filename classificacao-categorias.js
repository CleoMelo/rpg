(function () {
  'use strict';

  if (!/\/categorias\.html$/i.test(location.pathname)) return;

  const TYPES = [
    { value: 'personagem', label: 'Personagens', icon: '👤' },
    { value: 'local', label: 'Locais', icon: '📍' },
    { value: 'animal', label: 'Animais / Criaturas', icon: '🐾' },
    { value: 'item', label: 'Itens', icon: '⚔️' },
    { value: 'faccao', label: 'Facções / Grupos', icon: '⚑' },
    { value: 'evento', label: 'Eventos', icon: '✦' },
    { value: 'outro', label: 'Outros', icon: '📁' }
  ];

  const typeMap = new Map(TYPES.map(type => [type.value, type]));
  let categoryTypes = new Map();
  let filterValue = 'all';
  let observer = null;
  let pendingSubmission = null;

  const getRole = () => sessionStorage.getItem('role') || 'player';
  const getRpgId = () => typeof getSelectedRpg === 'function'
    ? getSelectedRpg()
    : new URLSearchParams(location.search).get('rpg') || localStorage.getItem('selectedRpg') || '';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
  }

  function getType(value) {
    return typeMap.get(String(value || 'personagem')) || typeMap.get('outro');
  }

  function getCategoryType(categoryId) {
    return getType(categoryTypes.get(String(categoryId))).value;
  }

  function getTypeLabel(categoryId, plural = true) {
    const type = getType(getCategoryType(categoryId));
    if (plural) return type.label;
    return type.label.replace(/s$/, '');
  }

  function styles() {
    if (document.getElementById('categoryClassificationStyles')) return;
    const style = document.createElement('style');
    style.id = 'categoryClassificationStyles';
    style.textContent = `
      .category-type-badge{display:inline-flex;align-items:center;gap:5px;width:max-content;margin:0 0 5px;padding:3px 8px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(255,255,255,.055);font-size:.7rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;opacity:.82}
      .category-type-filter{min-width:190px}
      .category-type-filter select{width:100%}
      .category-classification-field small{display:block;margin-top:5px;opacity:.62}
      .category-type-summary{margin-top:5px;font-size:.78rem;opacity:.62}
    `;
    document.head.appendChild(style);
  }

  async function loadTypes() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!client) return;

    const { data, error } = await client
      .from('categorias')
      .select('id, tipo')
      .eq('campanha_id', String(getRpgId()));

    if (error) {
      console.error('Classificação das categorias:', error);
      return;
    }

    categoryTypes = new Map((data || []).map(row => [
      String(row.id),
      typeMap.has(String(row.tipo)) ? String(row.tipo) : 'personagem'
    ]));

    if (typeof CATEGORIES !== 'undefined') {
      CATEGORIES.forEach(category => {
        if (!categoryTypes.has(String(category.id))) {
          categoryTypes.set(String(category.id), 'personagem');
        }
      });
    }

    decorateCategoryGrid();
    updateSelectedCategoryLabels();
  }

  function ensureFilter() {
    const panel = document.querySelector('.category-filter-panel');
    if (!panel || document.getElementById('categoryTypeFilterField')) return;

    const field = document.createElement('div');
    field.id = 'categoryTypeFilterField';
    field.className = 'filter-field category-type-filter';
    field.innerHTML = `
      <label for="categoryTypeFilter">Classificação</label>
      <select id="categoryTypeFilter">
        <option value="all">Todos os tipos</option>
        ${TYPES.map(type => `<option value="${type.value}">${type.icon} ${escapeHtml(type.label)}</option>`).join('')}
      </select>
    `;

    const clearButton = document.getElementById('clearCategorySearch');
    if (clearButton) panel.insertBefore(field, clearButton);
    else panel.appendChild(field);

    field.querySelector('select').addEventListener('change', event => {
      filterValue = event.currentTarget.value;
      applyTypeFilter();
    });
  }

  function applyTypeFilter() {
    const wrappers = document.querySelectorAll('#categoryGrid .category-item');
    wrappers.forEach(wrapper => {
      const button = wrapper.querySelector('.category-button');
      if (!button) return;
      const categoryId = button.dataset.category;
      const matches = filterValue === 'all' || getCategoryType(categoryId) === filterValue;
      wrapper.style.display = matches ? '' : 'none';
    });
  }

  function decorateCategoryGrid() {
    const grid = document.getElementById('categoryGrid');
    if (!grid) return;

    grid.querySelectorAll('.category-item').forEach(wrapper => {
      const button = wrapper.querySelector('.category-button');
      const content = button?.querySelector(':scope > div');
      if (!button || !content) return;

      const existing = content.querySelector('.category-type-badge');
      existing?.remove();

      const type = getType(getCategoryType(button.dataset.category));
      const badge = document.createElement('span');
      badge.className = 'category-type-badge';
      badge.textContent = `${type.icon} ${type.label}`;
      content.prepend(badge);
    });

    applyTypeFilter();
  }

  function ensureClassificationField() {
    const form = document.getElementById('categoryForm');
    if (!form || document.getElementById('categoryType')) return;

    const description = document.getElementById('categoryDescription')?.closest('.form-group');
    if (!description) return;

    const group = document.createElement('div');
    group.className = 'form-group category-classification-field';
    group.innerHTML = `
      <label for="categoryType">Classificação</label>
      <select id="categoryType" required>
        ${TYPES.map(type => `<option value="${type.value}">${type.icon} ${escapeHtml(type.label)}</option>`).join('')}
      </select>
      <small>Define que tipo de conteúdo esta categoria organiza. Isso também será usado nos filtros e na apresentação.</small>
    `;
    description.after(group);
  }

  function setFormType(type) {
    const select = document.getElementById('categoryType');
    if (select) select.value = typeMap.has(String(type)) ? String(type) : 'personagem';
  }

  function observeCategoryModal() {
    ensureClassificationField();
    const modal = document.getElementById('categoryModal');
    if (!modal || modal.dataset.classificationObserved) return;
    modal.dataset.classificationObserved = 'true';

    const modalObserver = new MutationObserver(() => {
      const form = document.getElementById('categoryForm');
      if (!form) return;
      const title = document.getElementById('categoryModalTitle')?.textContent || '';
      if (!modal.classList.contains('open')) return;

      if (title.toLowerCase().includes('editar') && typeof editingCategoryId !== 'undefined' && editingCategoryId) {
        setFormType(getCategoryType(editingCategoryId));
      }
    });
    modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  async function saveType(categoryId, type) {
    if (!categoryId) return false;
    const normalizedType = typeMap.has(String(type)) ? String(type) : 'personagem';

    if (typeof isDefaultRpg === 'function' && isDefaultRpg(getRpgId())) {
      categoryTypes.set(String(categoryId), normalizedType);
      localStorage.setItem(
        `categoryTypes:${getRpgId()}`,
        JSON.stringify(Object.fromEntries(categoryTypes))
      );
      return true;
    }

    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!client || typeof getMasterToken !== 'function') return false;

    const { data, error } = await client.rpc('classificar_categoria', {
      p_campanha_id: String(getRpgId()),
      p_categoria_id: String(categoryId),
      p_token: getMasterToken(getRpgId()),
      p_tipo: normalizedType
    });

    if (error) throw error;
    if (!data) throw new Error('Acesso do mestre expirado.');

    categoryTypes.set(String(categoryId), normalizedType);
    return true;
  }

  function loadLocalTypes() {
    if (typeof isDefaultRpg !== 'function' || !isDefaultRpg(getRpgId())) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`categoryTypes:${getRpgId()}`) || '{}');
      Object.entries(saved).forEach(([id, type]) => {
        if (typeMap.has(String(type))) categoryTypes.set(String(id), String(type));
      });
    } catch (error) {
      console.error('Classificação local:', error);
    }
  }

  function interceptCategorySubmit() {
    const form = document.getElementById('categoryForm');
    if (!form || form.dataset.classificationSubmit) return;
    form.dataset.classificationSubmit = 'true';

    form.addEventListener('submit', () => {
      const select = document.getElementById('categoryType');
      pendingSubmission = {
        categoryId: typeof editingCategoryId !== 'undefined' ? editingCategoryId : null,
        type: select?.value || 'personagem',
        beforeIds: typeof CATEGORIES !== 'undefined' ? new Set(CATEGORIES.map(item => String(item.id))) : new Set()
      };

      setTimeout(async () => {
        if (!pendingSubmission) return;
        const submission = pendingSubmission;
        pendingSubmission = null;

        try {
          let categoryId = submission.categoryId;
          if (!categoryId && typeof CATEGORIES !== 'undefined') {
            categoryId = CATEGORIES.find(category => !submission.beforeIds.has(String(category.id)))?.id || null;
          }

          if (!categoryId) return;
          await saveType(categoryId, submission.type);
          decorateCategoryGrid();
          updateSelectedCategoryLabels();
        } catch (error) {
          console.error('Não foi possível salvar a classificação da categoria:', error);
          if (typeof showPageMessage === 'function') {
            showPageMessage('A categoria foi salva, mas a classificação não pôde ser atualizada. Execute a migration do Supabase e tente novamente.');
          }
        }
      }, 250);
    }, { capture: true });
  }

  function updateSelectedCategoryLabels() {
    if (typeof selectedCategory === 'undefined' || !selectedCategory) return;
    const type = getType(getCategoryType(selectedCategory));
    const title = document.getElementById('selectedCategoryTitle');
    const addButton = document.getElementById('addCharacterButton');
    const searchLabel = document.querySelector('label[for="characterSearch"]');
    const searchInput = document.getElementById('characterSearch');
    const filterStatus = document.getElementById('characterFilterStatus');

    if (title) title.dataset.contentType = type.value;
    if (addButton) addButton.textContent = `+ Adicionar ${type.label.replace(/s$/, '').toLowerCase()}`;
    if (searchLabel) searchLabel.textContent = `Pesquisar ${type.label.toLowerCase()}`;
    if (searchInput) searchInput.placeholder = `Nome, descrição ou tier de ${type.label.toLowerCase()}`;
    if (filterStatus && !filterStatus.textContent) filterStatus.textContent = `Selecione uma categoria para pesquisar ${type.label.toLowerCase()}.`;
  }

  function setupObservers() {
    const grid = document.getElementById('categoryGrid');
    if (grid && !observer) {
      observer = new MutationObserver(() => {
        decorateCategoryGrid();
        updateSelectedCategoryLabels();
      });
      observer.observe(grid, { childList: true, subtree: true });
    }

    ensureFilter();
    ensureClassificationField();
    observeCategoryModal();
    interceptCategorySubmit();
  }

  async function setup() {
    styles();
    setupObservers();
    loadLocalTypes();
    await loadTypes();
    ensureFilter();
    ensureClassificationField();
    interceptCategorySubmit();
    decorateCategoryGrid();
    updateSelectedCategoryLabels();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
})();
