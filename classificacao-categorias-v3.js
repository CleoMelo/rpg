(function () {
  'use strict';
  if (!/\/categorias\.html$/i.test(location.pathname)) return;

  const TYPES = [
    { value: 'personagem', label: 'Personagens', singular: 'personagem', icon: '👤' },
    { value: 'local', label: 'Locais', singular: 'local', icon: '📍' },
    { value: 'animal', label: 'Animais / Criaturas', singular: 'animal / criatura', icon: '🐾' },
    { value: 'item', label: 'Itens', singular: 'item', icon: '⚔️' },
    { value: 'faccao', label: 'Facções / Grupos', singular: 'facção / grupo', icon: '⚑' },
    { value: 'evento', label: 'Eventos', singular: 'evento', icon: '✦' },
    { value: 'outro', label: 'Outros', singular: 'conteúdo', icon: '📁' }
  ];
  const typeMap = new Map(TYPES.map(type => [type.value, type]));
  let categoryTypes = new Map();
  let filterValue = 'personagem';
  let pendingSubmission = null;

  const rpgId = () => typeof getSelectedRpg === 'function'
    ? getSelectedRpg()
    : new URLSearchParams(location.search).get('rpg') || localStorage.getItem('selectedRpg') || '';
  const getType = value => typeMap.get(String(value || 'personagem')) || typeMap.get('personagem');
  const categoryType = id => getType(categoryTypes.get(String(id))).value;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);

  function ensureStyles() {
    if (document.getElementById('categoryClassificationStyles')) return;
    const style = document.createElement('style');
    style.id = 'categoryClassificationStyles';
    style.textContent = '.category-type-badge{display:inline-flex;align-items:center;gap:5px;width:max-content;margin:0 0 5px;padding:3px 8px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(255,255,255,.055);font-size:.7rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;opacity:.82}.category-type-filter{min-width:190px}.category-type-filter select{width:100%}.category-classification-field small{display:block;margin-top:5px;opacity:.62}';
    document.head.appendChild(style);
  }

  async function loadTypes() {
    if (typeof isDefaultRpg === 'function' && isDefaultRpg(rpgId())) {
      try {
        const saved = JSON.parse(localStorage.getItem(`categoryTypes:${rpgId()}`) || '{}');
        Object.entries(saved).forEach(([id, type]) => {
          if (typeMap.has(String(type))) categoryTypes.set(String(id), String(type));
        });
      } catch (error) { console.error('Classificação local:', error); }
      if (typeof CATEGORIES !== 'undefined') CATEGORIES.forEach(category => {
        if (!categoryTypes.has(String(category.id))) categoryTypes.set(String(category.id), 'personagem');
      });
      decorate();
      updateSelectedLabels();
      return;
    }

    if (typeof getSupabaseClient !== 'function') return;
    const client = getSupabaseClient();
    const token = typeof getMasterToken === 'function' ? getMasterToken(rpgId()) : null;
    const functionName = token ? 'listar_categorias_mestre' : 'listar_categorias';
    const params = token
      ? { p_campanha_id: String(rpgId()), p_token: token }
      : { p_campanha_id: String(rpgId()) };
    const { data, error } = await client.rpc(functionName, params);
    if (error) {
      console.error('Classificação das categorias:', error);
      return;
    }
    categoryTypes = new Map((data || []).map(row => [
      String(row.id),
      typeMap.has(String(row.tipo)) ? String(row.tipo) : 'personagem'
    ]));
    if (typeof CATEGORIES !== 'undefined') CATEGORIES.forEach(category => {
      if (!categoryTypes.has(String(category.id))) categoryTypes.set(String(category.id), 'personagem');
    });
    decorate();
    updateSelectedLabels();
  }

  function ensureFilter() {
    const panel = document.querySelector('.category-filter-panel');
    if (!panel || document.getElementById('categoryTypeFilterField')) return;
    const field = document.createElement('div');
    field.id = 'categoryTypeFilterField';
    field.className = 'filter-field category-type-filter';
    field.innerHTML = `<label for="categoryTypeFilter">Classificação</label><select id="categoryTypeFilter">${TYPES.map(t => `<option value="${t.value}">${t.icon} ${escapeHtml(t.label)}</option>`).join('')}<option value="all">Todos os tipos</option></select>`;
    const clear = document.getElementById('clearCategorySearch');
    if (clear) panel.insertBefore(field, clear); else panel.appendChild(field);
    const select = field.querySelector('select');
    select.value = filterValue;
    select.addEventListener('change', event => { filterValue = event.currentTarget.value; applyFilter(); });
  }

  function applyFilter() {
    document.querySelectorAll('#categoryGrid .category-item').forEach(wrapper => {
      const button = wrapper.querySelector('.category-button');
      if (!button) return;
      wrapper.style.display = filterValue === 'all' || categoryType(button.dataset.category) === filterValue ? '' : 'none';
    });
  }

  function decorate() {
    const grid = document.getElementById('categoryGrid');
    if (!grid) return;
    grid.querySelectorAll('.category-item').forEach(wrapper => {
      const button = wrapper.querySelector('.category-button');
      const content = button?.querySelector(':scope > div');
      if (!button || !content) return;
      content.querySelector('.category-type-badge')?.remove();
      const type = getType(categoryType(button.dataset.category));
      const badge = document.createElement('span');
      badge.className = 'category-type-badge';
      badge.textContent = `${type.icon} ${type.label}`;
      content.prepend(badge);
    });
    applyFilter();
  }

  function ensureFormField() {
    const form = document.getElementById('categoryForm');
    if (!form || document.getElementById('categoryType')) return;
    const description = document.getElementById('categoryDescription')?.closest('.form-group');
    if (!description) return;
    const group = document.createElement('div');
    group.className = 'form-group category-classification-field';
    group.innerHTML = `<label for="categoryType">Classificação</label><select id="categoryType" required>${TYPES.map(t => `<option value="${t.value}">${t.icon} ${escapeHtml(t.label)}</option>`).join('')}</select><small>Define que tipo de conteúdo esta categoria organiza.</small>`;
    description.after(group);
  }

  function syncEditForm() {
    const modal = document.getElementById('categoryModal');
    const select = document.getElementById('categoryType');
    if (!modal || !select || !modal.classList.contains('open')) return;
    if (typeof editingCategoryId !== 'undefined' && editingCategoryId) select.value = categoryType(editingCategoryId);
  }

  async function saveType(categoryId, type) {
    if (!categoryId) return false;
    const normalized = typeMap.has(String(type)) ? String(type) : 'personagem';
    if (typeof isDefaultRpg === 'function' && isDefaultRpg(rpgId())) {
      categoryTypes.set(String(categoryId), normalized);
      localStorage.setItem(`categoryTypes:${rpgId()}`, JSON.stringify(Object.fromEntries(categoryTypes)));
      return true;
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('classificar_categoria', {
      p_campanha_id: String(rpgId()),
      p_categoria_id: String(categoryId),
      p_token: getMasterToken(rpgId()),
      p_tipo: normalized
    });
    if (error) throw error;
    if (!data) throw new Error('Acesso do mestre expirado.');
    categoryTypes.set(String(categoryId), normalized);
    return true;
  }

  function interceptSubmit() {
    const form = document.getElementById('categoryForm');
    if (!form || form.dataset.classificationSubmit) return;
    form.dataset.classificationSubmit = 'true';
    form.addEventListener('submit', () => {
      pendingSubmission = {
        categoryId: typeof editingCategoryId !== 'undefined' ? editingCategoryId : null,
        type: document.getElementById('categoryType')?.value || 'personagem',
        beforeIds: typeof CATEGORIES !== 'undefined' ? new Set(CATEGORIES.map(item => String(item.id))) : new Set()
      };
      const started = Date.now();
      const finish = async () => {
        if (!pendingSubmission) return;
        const submission = pendingSubmission;
        let categoryId = submission.categoryId;
        if (!categoryId && typeof CATEGORIES !== 'undefined') categoryId = CATEGORIES.find(item => !submission.beforeIds.has(String(item.id)))?.id || null;
        if (!categoryId) {
          if (Date.now() - started < 5000) return setTimeout(finish, 100);
          pendingSubmission = null;
          return;
        }
        pendingSubmission = null;
        try {
          await saveType(categoryId, submission.type);
          decorate();
          updateSelectedLabels();
        } catch (error) {
          console.error('Não foi possível salvar a classificação:', error);
          if (typeof showPageMessage === 'function') showPageMessage('A categoria foi salva, mas a classificação não pôde ser atualizada. Verifique as funções do Supabase e tente novamente.');
        }
      };
      setTimeout(finish, 100);
    }, { capture: true });
  }

  function updateSelectedLabels() {
    if (typeof selectedCategory === 'undefined' || !selectedCategory) return;
    const type = getType(categoryType(selectedCategory));
    const add = document.getElementById('addCharacterButton');
    const label = document.querySelector('label[for="characterSearch"]');
    const input = document.getElementById('characterSearch');
    if (add) add.textContent = `+ Adicionar ${type.singular}`;
    if (label) label.textContent = `Pesquisar ${type.label.toLowerCase()}`;
    if (input) input.placeholder = `Nome, descrição ou tier de ${type.label.toLowerCase()}`;
  }

  function setup() {
    ensureStyles();
    ensureFilter();
    ensureFormField();
    interceptSubmit();
    const modal = document.getElementById('categoryModal');
    if (modal && !modal.dataset.classificationObserved) {
      modal.dataset.classificationObserved = 'true';
      new MutationObserver(syncEditForm).observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
    loadTypes().finally(() => {
      ensureFilter();
      ensureFormField();
      interceptSubmit();
      decorate();
      updateSelectedLabels();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
})();
