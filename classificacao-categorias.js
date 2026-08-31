(function () {
  'use strict';
  if (!/\/categorias\.html$/i.test(location.pathname)) return;
  const DEFAULT_ID='__personagens__';
  const DEFAULT={id:DEFAULT_ID,nome:'Personagens',icone:'👤',padrao:true};
  let classifications=[], assignments=new Map(), selected='', booted=false;
  const campaignId=()=>typeof getSelectedRpg==='function'?getSelectedRpg():new URLSearchParams(location.search).get('rpg')||'';
  const token=()=>typeof getMasterToken==='function'?getMasterToken(campaignId()):null;
  const master=()=>Boolean(
    token() &&
    sessionStorage.getItem('role')==='master' &&
    sessionStorage.getItem('masterRpgId')===String(campaignId())
  );
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

  function categoryClassification(id){return String(assignments.get(String(id))||classifications.find(x=>x.padrao)?.id||DEFAULT_ID);}

  function render(){
    const panel=document.querySelector('.category-filter-panel');
    const grid=document.getElementById('classificationGrid');
    const explorer=document.getElementById('categoryExplorer');
    if(!panel||!grid||!explorer)return;
    const categories=typeof CATEGORIES!=='undefined'?CATEGORIES:[];
    grid.innerHTML=classifications.map(item=>{
      const count=categories.filter(category=>categoryClassification(category.id)===item.id).length;
      return `<button type="button" class="classification-button${item.id===selected?' active':''}" data-classification="${esc(item.id)}"><span class="classification-icon">${esc(item.icone)}</span><span><strong>${esc(item.nome)}</strong><small>${count} categoria${count===1?'':'s'}</small></span><span class="classification-arrow" aria-hidden="true">›</span></button>`;
    }).join('');
    grid.querySelectorAll('[data-classification]').forEach(button=>button.onclick=()=>selectClassification(button.dataset.classification));
    explorer.classList.toggle('hidden',!selected);

    let manager=document.getElementById('categoryClassificationManager');
    if(!master()){manager?.remove();return;}
    if(!manager){manager=document.createElement('details');manager.id='categoryClassificationManager';manager.className='classification-manager';grid.after(manager);}
    manager.innerHTML=`<summary>Gerenciar classificações</summary><div class="classification-manager-head"><span class="muted">Crie ou organize os grupos de categorias.</span><button type="button" class="btn secondary" data-create-classification>+ Criar classificação</button></div><div class="classification-manager-list">${classifications.map(x=>`<div class="classification-manager-item"><span>${esc(x.icone)} ${esc(x.nome)}</span>${x.padrao?'<small>Padrão</small>':`<span class="classification-manager-actions"><button type="button" data-edit-classification="${esc(x.id)}">Editar</button><button type="button" data-delete-classification="${esc(x.id)}">Excluir</button></span>`}</div>`).join('')}</div>`;
    manager.querySelector('[data-create-classification]').onclick=()=>editClassification();
    manager.querySelectorAll('[data-edit-classification]').forEach(b=>b.onclick=()=>editClassification(b.dataset.editClassification));
    manager.querySelectorAll('[data-delete-classification]').forEach(b=>b.onclick=()=>removeClassification(b.dataset.deleteClassification));
  }

  function selectClassification(id){
    selected=classifications.some(item=>item.id===String(id))?String(id):'';
    if(typeof categorySearch!=='undefined')categorySearch.value='';
    if(typeof selectedCategory!=='undefined')selectedCategory=null;
    document.querySelectorAll('.category-button').forEach(button=>button.classList.remove('active'));
    const title=document.getElementById('selectedCategoryTitle');if(title)title.textContent='Selecione uma categoria';
    const description=document.getElementById('selectedCategoryDescription');if(description)description.textContent='';
    if(typeof renderCharacters==='function')renderCharacters();
    render();applyFilter();
  }

  window.showClassificationForCategory=id=>{
    selected=categoryClassification(id);
    render();applyFilter();
  };

  function editClassification(id=''){
    const current=classifications.find(x=>x.id===String(id));const dialog=document.createElement('dialog');dialog.className='classification-editor-modal';
    dialog.innerHTML=`<form method="dialog" class="classification-editor"><h3>${current?'Editar classificação':'Criar classificação'}</h3><label>Ícone<input id="classificationIcon" maxlength="8" value="${esc(current?.icone||'📁')}" required></label><label>Nome<input id="classificationName" maxlength="60" value="${esc(current?.nome||'')}" required></label><div class="classification-editor-actions"><button type="button" class="btn secondary" data-cancel>Cancelar</button><button type="submit" class="btn primary">Salvar</button></div></form></dialog>`;
    document.body.appendChild(dialog);dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
    dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const nome=dialog.querySelector('#classificationName').value.trim();const icone=dialog.querySelector('#classificationIcon').value.trim()||'📁';if(!nome)return;try{const params=current?{p_campanha_id:String(campaignId()),p_token:token(),p_classificacao_id:current.id,p_nome:nome,p_icone:icone}:{p_campanha_id:String(campaignId()),p_token:token(),p_nome:nome,p_icone:icone};const{error}=await client().rpc(current?'editar_classificacao_categoria':'criar_classificacao_categoria',params);if(error)throw error;dialog.close();await load();}catch(error){console.error(error);alert(error.message||'Não foi possível salvar a classificação.');}};
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
  }

  async function removeClassification(id){const current=classifications.find(x=>x.id===String(id));if(!current||current.padrao)return;if(!confirm(`Excluir a classificação "${current.nome}"? As categorias serão movidas para Personagens.`))return;try{const{error}=await client().rpc('excluir_classificacao_categoria',{p_campanha_id:String(campaignId()),p_token:token(),p_classificacao_id:current.id});if(error)throw error;selected='';await load();if(typeof loadCategories==='function')await loadCategories(campaignId(),token());}catch(error){console.error(error);alert(error.message||'Não foi possível excluir a classificação.');}}
  function applyFilter(){
    let visible=0;
    document.querySelectorAll('#categoryGrid .category-item').forEach(item=>{
      const button=item.querySelector('.category-button');
      if(!button)return;
      const show=Boolean(selected)&&categoryClassification(button.dataset.category)===selected;
      item.style.display=show?'':'none';
      if(show)visible++;
    });

    const query=typeof categorySearch!=='undefined'
      ? String(categorySearch.value||'').trim()
      : '';
    const nativeEmpty=document.querySelector('#categoryGrid > .empty-state');
    if(nativeEmpty&&selected)nativeEmpty.style.display='none';

    const empty=document.getElementById('classificationCategoryEmpty');
    if(empty){
      empty.textContent=query
        ? 'Nenhuma categoria corresponde à pesquisa nesta classificação.'
        : 'Nenhuma categoria nesta classificação.';
      empty.classList.toggle('hidden',!selected||visible>0);
    }

    const status=document.getElementById('categoryFilterStatus');
    if(status&&selected){
      const current=classifications.find(item=>item.id===selected);
      status.textContent=query
        ? `${visible} categoria(s) encontrada(s) em ${current?.nome||'classificação selecionada'}`
        : `${visible} categoria(s) em ${current?.nome||'classificação selecionada'}`;
    }
  }

  function renderFormField(){
    const form=document.getElementById('categoryForm');if(!form)return;
    let group=document.getElementById('categoryClassificationFieldForm');
    if(!group){const description=document.getElementById('categoryDescription')?.closest('.form-group');if(!description)return;group=document.createElement('div');group.id='categoryClassificationFieldForm';group.className='form-group category-classification-field';description.after(group);form.addEventListener('submit',capture,true);}
    group.innerHTML=`<label for="categoryClassification">Classificação</label><select id="categoryClassification" required>${classifications.map(x=>`<option value="${esc(x.id)}">${esc(x.icone)} ${esc(x.nome)}</option>`).join('')}</select>`;
    const select=group.querySelector('#categoryClassification');const currentId=typeof editingCategoryId!=='undefined'?editingCategoryId:null;select.value=currentId?categoryClassification(currentId):(classifications.find(x=>x.padrao)?.id||DEFAULT_ID);
  }

  window.syncCategoryClassificationForm=id=>{
    renderFormField();
    const select=document.getElementById('categoryClassification');
    if(!select)return;
    select.value=id
      ? categoryClassification(id)
      : (classifications.find(x=>x.padrao)?.id||DEFAULT_ID);
  };

  function capture(){
    const select=document.getElementById('categoryClassification');const before=new Set((typeof CATEGORIES!=='undefined'?CATEGORIES:[]).map(x=>String(x.id)));
    window.__pendingCategoryClassification={id:typeof editingCategoryId!=='undefined'?editingCategoryId:null,value:select?.value||DEFAULT_ID,before,retries:0};setTimeout(savePending,200);
  }

  async function savePending(){
    const p=window.__pendingCategoryClassification;if(!p)return;let id=p.id;if(!id&&typeof CATEGORIES!=='undefined')id=CATEGORIES.find(x=>!p.before.has(String(x.id)))?.id||null;if(!id){if(p.retries++<30)return setTimeout(savePending,200);window.__pendingCategoryClassification=null;return;}
    window.__pendingCategoryClassification=null;const defaultId=classifications.find(x=>x.padrao)?.id;const classificationId=p.value===DEFAULT_ID?defaultId:p.value;if(!classificationId||!token())return;
    try{const{error}=await client().rpc('classificar_categoria_por_classificacao',{p_campanha_id:String(campaignId()),p_categoria_id:String(id),p_token:token(),p_classificacao_id:String(classificationId)});if(error)throw error;assignments.set(String(id),String(classificationId));render();applyFilter();}catch(error){console.error('Classificação da categoria:',error);}
  }

  function watchGrid(){const grid=document.getElementById('categoryGrid');if(!grid||grid.dataset.classificationObserver)return;grid.dataset.classificationObserver='true';new MutationObserver(()=>{render();renderFormField();applyFilter();}).observe(grid,{childList:true,subtree:true});}
  function setup(){if(booted)return;booted=true;load();watchGrid();setTimeout(renderFormField,500);setTimeout(renderFormField,1500);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
