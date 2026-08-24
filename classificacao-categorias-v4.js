(function () {
  'use strict';
  if (!/\/categorias\.html$/i.test(location.pathname)) return;

  const DEFAULT_ID = '__personagens__';
  const DEFAULT = { id: DEFAULT_ID, nome: 'Personagens', icone: '👤', padrao: true };
  let classifications = [];
  let categoryAssignments = new Map();
  let selected = 'all';
  let booted = false;

  const campaignId = () => typeof getSelectedRpg === 'function' ? getSelectedRpg() : new URLSearchParams(location.search).get('rpg') || '';
  const token = () => typeof getMasterToken === 'function' ? getMasterToken(campaignId()) : null;
  const master = () => Boolean(token());
  const client = () => getSupabaseClient();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);

  async function load() {
    try {
      const [{ data: classData, error: classError }, { data: categoryData, error: categoryError }] = await Promise.all([
        client().rpc('listar_classificacoes_categorias', { p_campanha_id: String(campaignId()) }),
        client().rpc(token() ? 'listar_categorias_mestre' : 'listar_categorias', token() ? { p_campanha_id: String(campaignId()), p_token: token() } : { p_campanha_id: String(campaignId()) })
      ]);
      if (classError) throw classError;
      if (categoryError) throw categoryError;
      classifications = (classData || []).map(row => ({ id: String(row.id), nome: row.nome, icone: row.icone || '📁', padrao: Boolean(row.padrao) }));
      if (!classifications.some(item => item.padrao)) classifications.unshift(DEFAULT);
      categoryAssignments = new Map((categoryData || []).map(row => [String(row.id), row.classificacao_id ? String(row.classificacao_id) : (classifications.find(item => item.padrao)?.id || DEFAULT_ID)]));
    } catch (error) {
      console.error('Classificações das categorias:', error);
      classifications = [DEFAULT];
      categoryAssignments = new Map();
    }
    render();
    renderFormField();
    applyFilter();
  }

  function render() {
    const panel = document.querySelector('.category-filter-panel');
    if (!panel) return;
    let field = document.getElementById('categoryClassificationField');
    if (!field) {
      field = document.createElement('div'); field.id = 'categoryClassificationField'; field.className = 'filter-field category-type-filter';
      const clear = document.getElementById('clearCategorySearch'); if (clear) panel.insertBefore(field, clear); else panel.appendChild(field);
    }
    field.innerHTML = `<label for="categoryClassificationFilter">Classificação</label><select id="categoryClassificationFilter"><option value="all">Todas</option>${classifications.map(item => `<option value="${esc(item.id)}">${esc(item.icone)} ${esc(item.nome)}</option>`).join('')}</select>`;
    const select = field.querySelector('select'); select.value = selected; select.onchange = () => { selected = select.value; applyFilter(); };

    let manager = document.getElementById('categoryClassificationManager');
    if (!master()) { manager?.remove(); return; }
    if (!manager) { manager = document.createElement('section'); manager.id = 'categoryClassificationManager'; manager.className = 'classification-manager'; panel.after(manager); }
    manager.innerHTML = `<div class="classification-manager-head"><strong>Classificações</strong><button type="button" class="btn secondary" data-create-classification>+ Criar classificação</button></div><div class="classification-manager-list">${classifications.map(item => `<div class="classification-manager-item"><span>${esc(item.icone)} ${esc(item.nome)}</span>${item.padrao ? '<small>Padrão</small>' : `<span class="classification-manager-actions"><button type="button" data-edit-classification="${esc(item.id)}">Editar</button><button type="button" data-delete-classification="${esc(item.id)}">Excluir</button></span>`}</div>`).join('')}</div>`;
    manager.querySelector('[data-create-classification]').onclick = () => editClassification();
    manager.querySelectorAll('[data-edit-classification]').forEach(button => button.onclick = () => editClassification(button.dataset.editClassification));
    manager.querySelectorAll('[data-delete-classification]').forEach(button => button.onclick = () => removeClassification(button.dataset.deleteClassification));
  }

  function editClassification(id = '') {
    const current = classifications.find(item => item.id === String(id));
    const dialog = document.createElement('dialog'); dialog.className = 'classification-editor-modal';
    dialog.innerHTML = `<form method="dialog" class="classification-editor"><h3>${current ? 'Editar classificação' : 'Criar classificação'}</h3><label>Ícone<input id="classificationIcon" maxlength="8" value="${esc(current?.icone || '📁')}" required></label><label>Nome<input id="classificationName" maxlength="60" value="${esc(current?.nome || '')}" required></label><div class="classification-editor-actions"><button type="button" class="btn secondary" data-cancel>Cancelar</button><button type="submit" class="btn primary">Salvar</button></div></form></dialog>`;
    document.body.appendChild(dialog); dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const nome = dialog.querySelector('#classificationName').value.trim(); const icone = dialog.querySelector('#classificationIcon').value.trim() || '📁'; if (!nome) return;
      try {
        const params = current ? { p_campanha_id: String(campaignId()), p_token: token(), p_classificacao_id: current.id, p_nome: nome, p_icone: icone } : { p_campanha_id: String(campaignId()), p_token: token(), p_nome: nome, p_icone: icone };
        const { error } = await client().rpc(current ? 'editar_classificacao_categoria' : 'criar_classificacao_categoria', params); if (error) throw error; dialog.close(); await load();
      } catch (error) { console.error(error); alert(error.message || 'Não foi possível salvar a classificação.'); }
    };
    dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.showModal();
  }

  async function removeClassification(id) {
    const current = classifications.find(item => item.id === String(id)); if (!current || current.padrao) return;
    if (!confirm(`Excluir a classificação "${current.nome}"? As categorias serão movidas para Personagens.`)) return;
    try { const { error } = await client().rpc('excluir_classificacao_categoria', { p_campanha_id: String(campaignId()), p_token: token(), p_classificacao_id: current.id }); if (error) throw error; selected = 'all'; await load(); if (typeof loadCategories === 'function') await loadCategories(campaignId(), token()); }
    catch (error) { console.error(error); alert(error.message || 'Não foi possível excluir a classificação.'); }
  }

  function categoryClassification(id) { return String(categoryAssignments.get(String(id)) || classifications.find(item => item.padrao)?.id || DEFAULT_ID); }
  function applyFilter() { document.querySelectorAll('#categoryGrid .category-item').forEach(item => { const button = item.querySelector('.category-button'); if (!button) return; item.style.display = selected === 'all' || categoryClassification(button.dataset.category) === selected ? '' : 'none'; }); }

  function renderFormField() {
    const form = document.getElementById('categoryForm'); if (!form || document.getElementById('categoryClassification')) return;
    const description = document.getElementById('categoryDescription')?.closest('.form-group'); if (!description) return;
    const group = document.createElement('div'); group.className = 'form-group category-classification-field';
    group.innerHTML = `<label for="categoryClassification">Classificação</label><select id="categoryClassification" required>${classifications.map(item => `<option value="${esc(item.id)}">${esc(item.icone)} ${esc(item.nome)}</option>`).join('')}</select>`;
    description.after(group); form.addEventListener('submit', captureCategoryClassification, true);
  }

  function captureCategoryClassification() {
    const before = new Set((typeof CATEGORIES !== 'undefined' ? CATEGORIES : []).map(item => String(item.id)));
    window.__pendingCategoryClassification = { id: typeof editingCategoryId !== 'undefined' ? editingCategoryId : null, classificationId: document.getElementById('categoryClassification')?.value || DEFAULT_ID, before, retries: 0 };
    setTimeout(savePendingCategoryClassification, 200);
  }

  async function savePendingCategoryClassification() {
    const pending = window.__pendingCategoryClassification; if (!pending) return;
    let id = pending.id; if (!id && typeof CATEGORIES !== 'undefined') id = CATEGORIES.find(item => !pending.before.has(String(item.id)))?.id || null;
    if (!id) { if (pending.retries++ < 30) return setTimeout(savePendingCategoryClassification, 200); window.__pendingCategoryClassification = null; return; }
    window.__pendingCategoryClassification = null;
    const classificationId = pending.classificationId === DEFAULT_ID ? classifications.find(item => item.padrao)?.id : pending.classificationId; if (!classificationId || !token()) return;
    try {
      const { error } = await client().rpc('classificar_categoria_por_classificacao', { p_campanha_id: String(campaignId()), p_categoria_id: String(id), p_token: token(), p_classificacao_id: String(classificationId) }); if (error) throw error;
      categoryAssignments.set(String(id), String(classificationId)); if (typeof loadCategories === 'function') await loadCategories(campaignId(), token()); applyFilter();
    } catch (error) { console.error('Classificação da categoria:', error); }
  }

  function watchGrid() { const grid = document.getElementById('categoryGrid'); if (!grid || grid.dataset.classificationObserver) return; grid.dataset.classificationObserver = 'true'; new MutationObserver(applyFilter).observe(grid, { childList: true, subtree: true }); }
  function setup() { if (booted) return; booted = true; load(); watchGrid(); setTimeout(renderFormField, 500); setTimeout(renderFormField, 1500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true }); else setup();
})();
