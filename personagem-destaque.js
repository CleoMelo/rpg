(function(){
  'use strict';
  const key=id=>`characterFicha:${id}`;
  const isMaster=()=>sessionStorage.getItem('role')==='master';
  function styles(){
    if(document.getElementById('characterHighlightStyles'))return;
    const s=document.createElement('style');s.id='characterHighlightStyles';s.textContent=`
      .character-card{cursor:pointer}
      .character-highlight-backdrop{z-index:2000}.character-highlight-modal{position:relative;width:min(960px,94vw);max-height:90vh;overflow:auto;display:grid;grid-template-columns:minmax(280px,.9fr) minmax(300px,1.1fr);gap:28px;padding:28px;background:#11151d;border:1px solid rgba(255,255,255,.14);box-shadow:0 28px 80px rgba(0,0,0,.55)}
      .character-highlight-media{min-height:420px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.04);border-radius:14px;overflow:hidden}.character-highlight-media img{width:100%;height:100%;max-height:700px;object-fit:contain}.character-highlight-content{align-self:center;padding:12px 24px 12px 0}.character-highlight-content h2{font-size:clamp(2rem,5vw,4rem);margin:8px 0 18px}.character-highlight-description{white-space:pre-wrap;line-height:1.75;color:rgba(255,255,255,.82)}
      @media(max-width:760px){.character-highlight-modal{grid-template-columns:1fr;padding:20px}.character-highlight-media{min-height:280px;max-height:52vh}.character-highlight-content{padding:0 6px 8px}}
    `;document.head.appendChild(s);
  }
  function modal(){
    if(document.getElementById('characterHighlightModal'))return;
    const m=document.createElement('div');m.id='characterHighlightModal';m.className='modal-backdrop character-highlight-backdrop';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');
    m.innerHTML=`<section class="card modal character-highlight-modal"><button class="close-button" id="characterHighlightClose" type="button" aria-label="Fechar">×</button><div class="character-highlight-media"><img id="characterHighlightImage" alt=""></div><div class="character-highlight-content"><span class="eyebrow" id="characterHighlightBadge">Personagem</span><h2 id="characterHighlightName"></h2><p id="characterHighlightDescription" class="character-highlight-description"></p><a id="characterHighlightFicha" class="btn full" target="_blank" rel="noopener noreferrer" style="display:none">Abrir ficha</a></div></section>`;
    document.body.appendChild(m);const close=()=>{m.classList.remove('open');if(!document.querySelector('.modal-backdrop.open'))document.body.classList.remove('modal-open')};document.getElementById('characterHighlightClose').onclick=close;m.onclick=e=>{if(e.target===m)close()};
  }
  function openCard(card){
    styles();modal();const img=card.querySelector('img'),name=card.querySelector('h3');if(!img||!name)return;const id=card.dataset.characterId||card.querySelector('[data-edit]')?.dataset.edit||name.textContent.trim();
    const desc=String(card.dataset.characterDescription||'').trim();document.getElementById('characterHighlightImage').src=img.currentSrc||img.src;document.getElementById('characterHighlightImage').alt=name.textContent.trim();document.getElementById('characterHighlightName').textContent=name.textContent.trim();document.getElementById('characterHighlightDescription').textContent=desc||'Nenhuma descrição cadastrada.';document.getElementById('characterHighlightBadge').textContent=card.querySelector('.visibility-badge')?'Somente para o mestre':'Personagem';
    const link=document.getElementById('characterHighlightFicha'),url=localStorage.getItem(key(id))||'';if(isMaster()&&url){link.href=url;link.style.display='inline-flex'}else{link.style.display='none';link.removeAttribute('href')}
    const m=document.getElementById('characterHighlightModal');m.classList.add('open');document.body.classList.add('modal-open');
  }
  function injectField(){
    if(!isMaster())return;const form=document.getElementById('characterForm');if(!form||document.getElementById('characterFichaUrl'))return;const g=document.createElement('div');g.className='form-group';g.innerHTML='<label for="characterFichaUrl">Link da ficha do personagem</label><input id="characterFichaUrl" type="url" maxlength="500" placeholder="https://..."><small>Opcional. O link aparece no destaque do personagem para o mestre.</small>';const d=document.getElementById('characterDescription');(d?.closest('.form-group')||form.lastElementChild).after(g);
  }
  function setup(){
    styles();modal();injectField();
    document.addEventListener('click',e=>{const edit=e.target.closest('[data-edit]');if(edit&&isMaster()){setTimeout(()=>{injectField();const i=document.getElementById('characterFichaUrl');const f=document.getElementById('characterForm');if(f)f.dataset.fichaCharacterId=edit.dataset.edit;if(i)i.value=localStorage.getItem(key(edit.dataset.edit))||''},0);return}const card=e.target.closest('.character-card');if(!card||e.target.closest('button,a,input,select,textarea,.entity-controls,.character-actions'))return;openCard(card)});
    document.addEventListener('submit',e=>{if(e.target.id!=='characterForm'||!isMaster())return;const i=document.getElementById('characterFichaUrl');const id=e.target.dataset.fichaCharacterId||'';setTimeout(()=>{const name=document.getElementById('characterName')?.value.trim();const card=[...document.querySelectorAll('.character-card')].find(c=>c.querySelector('h3')?.textContent.trim()===name);const cardId=card?.dataset.characterId||card?.querySelector('[data-edit]')?.dataset.edit||id;if(cardId&&i?.value.trim()){try{new URL(i.value.trim());localStorage.setItem(key(cardId),i.value.trim())}catch{} }},150)});
    new MutationObserver(injectField).observe(document.body,{childList:true,subtree:true});
  }
  document.addEventListener('DOMContentLoaded',setup);if(document.readyState!=='loading')setup();
})();
