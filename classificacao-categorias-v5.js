(function () {
  'use strict';
  if (!/\/categorias\.html$/i.test(location.pathname)) return;
  const DEFAULT_ID='__personagens__';
  const DEFAULT={id:DEFAULT_ID,nome:'Personagens',icone:'👤',padrao:true};
  let classifications=[], assignments=new Map(), selected='all', booted=false;
  const campaignId=()=>typeof getSelectedRpg==='function'?getSelectedRpg():new URLSearchParams(location.search).get('rpg')||'';
  const token=()=>typeof getMasterToken==='function'?getMasterToken(campaignId()):null;
  const master=()=>Boolean(token());
  const client=()=>getSupabaseClient();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function load(){
    try{
      const [{data:classes,error:ce},{data:rows,error:ae}]=await Promise.all([
        client().rpc('listar_classificacoes_categorias',{p_campanha_id:String(campaignId())}),
        client().rpc('listar_atribuicoes_classificacoes_categorias',{p_campanha_id:String(campaignId())})
      ]);
      if(ce)throw ce;if(ae)throw ae;
      classifications=(classes||[]).map(r=>({id:String(r.id),nome:r.nome,icone:r.icone||'📁',padrao:Boolean(r.padrao)}));
      if(!classifications.some(x=>x.padrao))classifications.unshift(DEFAULT);
      const defaultId=classifications.find(x=>x.padrao)?.id||DEFAULT_ID;
      assignments=new Map((rows||[]).map(r=>[String(r.categoria_id),String(r.classificacao_id||defaultId)]));
    }catch(error){console.error('Classificações das categorias:',error);classifications=[DEFAULT];assignments=new Map();}
    render();renderFormField();applyFilter();
  }

  function classificationForCategory(id){
    const classificationId=String(assignments.get(String(id))||DEFAULT_ID);
    return classifications.find(x=>x.id===classificationId)||classifications.find(x=>x.padrao)||DEFAULT;
  }

  function render(){
    const panel=document.querySelector('.category-filter-panel');if(!panel)return;
    let field=document.getElementById('categoryClassificationField');
    if(!field){field=document.createElement('div');field.id='categoryClassificationField';field.className='filter-field category-type-filter';const clear=document.getElementById('clearCategorySearch');if(clear)panel.insertBefore(field,clear);else panel.appendChild(field);}
    field.innerHTML=`<label>Classificação</label><div class="category-classification-filters" role="group" aria-label="Filtrar por classificação"><button type="button" class="category-classification-filter ${selected==='all'?'is-active':''}" data-classification-filter="all">Todos</button>${classifications.map(x=>`<button type="button" class="category-classification-filter ${selected===x.id?'is-active':''}" data-classification-filter="${esc(x.id)}"><span aria-hidden="true">${esc(x.icone)}</span> ${esc(x.nome)}</button>`).join('')}</div>`;
    field.querySelectorAll('[data-classification-filter]').forEach(button=>button.onclick=()=>{selected=button.dataset.classificationFilter;render();applyFilter();});
    let manager=document.getElementById('categoryClassificationManager');
    if(!master()){manager?.remove();return;}
    if(!manager){manager=document.createElement('section');manager.id='categoryClassificationManager';manager.className='classification-manager';panel.after(manager);}
    manager.innerHTML=`<div class="classification-manager-head"><strong>Classificações</strong><button type="button" class="btn secondary" data-create-classification>+ Criar classificação</button></div><div class="classification-manager-list">${classifications.map(x=>`<div class="classification-manager-item"><span>${esc(x.icone)} ${esc(x.nome)}</span>${x.padrao?'<small>Padrão</small>':`<span class="classification-manager-actions"><button type="button" data-edit-classification="${esc(x.id)}">Editar</button><button type="button" data-delete-classification="${esc(x.id)}">Excluir</button></span>`}</div>`).join('')}</div>`;
    manager.querySelector('[data-create-classification]').onclick=()=>editClassification();
    manager.querySelectorAll('[data-edit-classification]').forEach(b=>b.onclick=()=>editClassification(b.dataset.editClassification));
    manager.querySelectorAll('[data-delete-classification]').forEach(b=>b.onclick=()=>removeClassification(b.dataset.deleteClassification));
  }

  function editClassification(id=''){
    const current=classifications.find(x=>x.id===String(id));const dialog=document.createElement('dialog');dialog.className='classification-editor-modal';
    dialog.innerHTML=`<form method="dialog" class="classification-editor"><h3>${current?'Editar classificação':'Criar classificação'}</h3><label>Ícone<input id="classificationIcon" maxlength="8" value="${esc(current?.icone||'📁')}" required></label><label>Nome<input id="classificationName" maxlength="60" value="${esc(current?.nome||'')}" required></label><div class="classification-editor-actions"><button type="button" class="btn secondary" data-cancel>Cancelar</button><button type="submit" class="btn primary">Salvar</button></div></form></dialog>`;
    document.body.appendChild(dialog);dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
    dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const nome=dialog.querySelector('#classificationName').value.trim();const icone=dialog.querySelector('#classificationIcon').value.trim()||'📁';if(!nome)return;try{const params=current?{p_campanha_id:String(campaignId()),p_token:token(),p_classificacao_id:current.id,p_nome:nome,p_icone:icone}:{p_campanha_id:String(campaignId()),p_token:token(),p_nome:nome,p_icone:icone};const{error}=await client().rpc(current?'editar_classificacao_categoria':'criar_classificacao_categoria',params);if(error)throw error;dialog.close();await load();}catch(error){console.error(error);alert(error.message||'Não foi possível salvar a classificação.');}};
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
  }

  async function removeClassification(id){const current=classifications.find(x=>x.id===String(id));if(!current||current.padrao)return;if(!confirm(`Excluir a classificação "${current.nome}"? As categorias serão movidas para Personagens.`))return;try{const{error}=await client().rpc('excluir_classificacao_categoria',{p_campanha_id:String(campaignId()),p_token:token(),p_classificacao_id:current.id});if(error)throw error;selected='all';await load();if(typeof loadCategories==='function')await loadCategories(campaignId(),token());}catch(error){console.error(error);alert(error.message||'Não foi possível excluir a classificação.');}}
  function categoryClassification(id){return String(assignments.get(String(id))||classifications.find(x=>x.padrao)?.id||DEFAULT_ID);}
  function applyFilter(){document.querySelectorAll('#categoryGrid .category-item').forEach(item=>{const button=item.querySelector('.category-button');if(!button)return;item.style.display=selected==='all'||categoryClassification(button.dataset.category)===selected?'':'none';});}

  function renderFormField(){
    const form=document.getElementById('categoryForm');
    if(!form)return;
    let group=document.getElementById('categoryClassificationFieldForm');
    if(!group){
      const description=document.getElementById('categoryDescription')?.closest('.form-group');
      if(!description)return;
      group=document.createElement('div');
      group.id='categoryClassificationFieldForm';
      group.className='form-group category-classification-field';
      description.after(group);
      form.addEventListener('submit',capture,true);
    }
    group.innerHTML=`<label for="categoryClassification">Classificação</label><select id="categoryClassification" required>${classifications.map(x=>`<option value="${esc(x.id)}">${esc(x.icone)} ${esc(x.nome)}</option>`).join('')}</select>`;
    const select=group.querySelector('#categoryClassification');
    const currentId=typeof editingCategoryId!=='undefined'?editingCategoryId:null;
    select.value=currentId?categoryClassification(currentId):(classifications.find(x=>x.padrao)?.id||DEFAULT_ID);
  }

  function capture(){
    const select=document.getElementById('categoryClassification');
    const before=new Set((typeof CATEGORIES!=='undefined'?CATEGORIES:[]).map(x=>String(x.id)));
    window.__pendingCategoryClassification={id:typeof editingCategoryId!=='undefined'?editingCategoryId:null,value:select?.value||DEFAULT_ID,before,retries:0};
    setTimeout(savePending,200);
  }

  async function savePending(){
    const p=window.__pendingCategoryClassification;if(!p)return;
    let id=p.id;
    if(!id&&typeof CATEGORIES!=='undefined')id=CATEGORIES.find(x=>!p.before.has(String(x.id)))?.id||null;
    if(!id){if(p.retries++<30)return setTimeout(savePending,200);window.__pendingCategoryClassification=null;return;}
    window.__pendingCategoryClassification=null;
    const defaultId=classifications.find(x=>x.padrao)?.id;
    const classificationId=p.value===DEFAULT_ID?defaultId:p.value;
    if(!classificationId||!token())return;
    try{const{error}=await client().rpc('classificar_categoria_por_classificacao',{p_campanha_id:String(campaignId()),p_categoria_id:String(id),p_token:token(),p_classificacao_id:String(classificationId)});if(error)throw error;assignments.set(String(id),String(classificationId));render();applyFilter();}catch(error){console.error('Classificação da categoria:',error);}
  }

  function watchGrid(){const grid=document.getElementById('categoryGrid');if(!grid||grid.dataset.classificationObserver)return;grid.dataset.classificationObserver='true';new MutationObserver(()=>{renderFormField();applyFilter();}).observe(grid,{childList:true,subtree:true});}
  function setup(){if(booted)return;booted=true;load();watchGrid();setTimeout(renderFormField,500);setTimeout(renderFormField,1500);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
