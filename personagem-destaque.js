(function(){
  'use strict';
  const key=id=>`characterFicha:${id}`;
  const isMaster=()=>sessionStorage.getItem('role')==='master';

  function styles(){
    if(document.getElementById('characterHighlightStyles'))return;
    const s=document.createElement('style');
    s.id='characterHighlightStyles';
    s.textContent=`
      .character-card{cursor:pointer}
      .character-highlight-backdrop{z-index:2000}
      .character-highlight-modal{
        position:relative;
        width:min(960px,94vw);
        max-width:960px;
        max-height:min(760px,90vh);
        max-height:min(760px,90dvh);
        overflow:hidden;
        display:grid;
        grid-template-columns:minmax(280px,0.95fr) minmax(300px,1.05fr);
        grid-template-areas:"media content";
        align-items:stretch;
        gap:28px;
        padding:28px;
        background:#11151d;
        border:1px solid rgba(255,255,255,.14);
        box-shadow:0 28px 80px rgba(0,0,0,.55);
      }
      .character-highlight-modal>.close-button{
        position:absolute;
        z-index:5;
        top:12px;
        right:12px;
        width:38px;
        height:38px;
        display:grid;
        place-items:center;
        padding:0;
        border:1px solid rgba(255,255,255,.18);
        border-radius:50%;
        background:rgba(8,10,15,.82);
        color:#fff;
        font-size:1.7rem;
        line-height:1;
      }
      .character-highlight-modal>.close-button:hover{background:rgba(139,92,246,.8);color:#fff}
      .character-highlight-media{
        grid-area:media;
        min-width:0;
        min-height:420px;
        height:min(700px,calc(90vh - 56px));
        height:min(700px,calc(90dvh - 56px));
        display:flex;
        align-items:center;
        justify-content:center;
        background:rgba(255,255,255,.04);
        border-radius:14px;
        overflow:hidden;
      }
      .character-highlight-media img{
        width:100%;
        height:100%;
        object-fit:contain;
        display:block;
      }
      .character-highlight-content{
        grid-area:content;
        min-width:0;
        min-height:0;
        align-self:center;
        padding:20px 42px 20px 0;
        overflow:auto;
      }
      .character-highlight-content h2{
        font-size:clamp(2rem,5vw,4rem);
        line-height:1;
        margin:10px 0 18px;
        overflow-wrap:anywhere;
      }
      .character-highlight-description{
        margin:0;
        white-space:pre-wrap;
        line-height:1.75;
        color:rgba(255,255,255,.82);
        overflow-wrap:anywhere;
      }
      .character-highlight-content .btn{margin-top:22px}
      @media(max-width:760px){
        .character-highlight-modal{
          width:min(94vw,560px);
          max-height:90vh;
          max-height:90dvh;
          overflow:auto;
          grid-template-columns:1fr;
          grid-template-areas:"media" "content";
          gap:18px;
          padding:20px;
        }
        .character-highlight-media{
          min-height:280px;
          height:min(52vh,430px);
          height:min(52dvh,430px);
        }
        .character-highlight-content{padding:0 6px 12px}
      }
    `;
    document.head.appendChild(s);
  }

  function removeCardDescriptions(){
    document.querySelectorAll('.character-card').forEach(card=>{
      const descriptionElement=card.querySelector('.character-body > p');
      if(descriptionElement){
        if(card.dataset.characterDescription===undefined){
          card.dataset.characterDescription=descriptionElement.textContent.trim();
        }
        descriptionElement.remove();
      }
    });
  }

  async function getFichaUrl(id){
    try{
      if(typeof getSupabaseClient!=='function')return localStorage.getItem(key(id))||'';
      const client=getSupabaseClient();
      const {data,error}=await client
        .from('personagens')
        .select('ficha_url')
        .eq('id',String(id))
        .maybeSingle();
      if(error)throw error;
      return String(data?.ficha_url||'').trim();
    }catch(error){
      console.error('Não foi possível carregar a ficha do personagem:',error);
      return localStorage.getItem(key(id))||'';
    }
  }

  function modal(){
    if(document.getElementById('characterHighlightModal'))return;
    const m=document.createElement('div');
    m.id='characterHighlightModal';
    m.className='modal-backdrop character-highlight-backdrop';
    m.setAttribute('role','dialog');
    m.setAttribute('aria-modal','true');
    m.innerHTML=`<section class="card modal character-highlight-modal"><button class="close-button" id="characterHighlightClose" type="button" aria-label="Fechar">×</button><div class="character-highlight-media"><img id="characterHighlightImage" alt=""></div><div class="character-highlight-content"><span class="eyebrow" id="characterHighlightBadge">Personagem</span><h2 id="characterHighlightName"></h2><p id="characterHighlightDescription" class="character-highlight-description"></p><a id="characterHighlightFicha" class="btn full" target="_blank" rel="noopener noreferrer" style="display:none">Abrir ficha</a></div></section>`;
    document.body.appendChild(m);
    const close=()=>{m.classList.remove('open');if(!document.querySelector('.modal-backdrop.open'))document.body.classList.remove('modal-open')};
    document.getElementById('characterHighlightClose').onclick=close;
    m.onclick=e=>{if(e.target===m)close()};
  }

  async function openCard(card){
    styles();
    removeCardDescriptions();
    modal();
    const img=card.querySelector('img');
    const name=card.querySelector('h3');
    if(!img||!name)return;
    const id=card.dataset.characterId||card.querySelector('[data-edit]')?.dataset.edit||name.textContent.trim();
    const desc=String(card.dataset.characterDescription||'').trim();
    document.getElementById('characterHighlightImage').src=img.currentSrc||img.src;
    document.getElementById('characterHighlightImage').alt=name.textContent.trim();
    document.getElementById('characterHighlightName').textContent=name.textContent.trim();
    document.getElementById('characterHighlightDescription').textContent=desc||'Nenhuma descrição cadastrada.';
    document.getElementById('characterHighlightBadge').textContent=card.querySelector('.visibility-badge')?'Somente para o mestre':'Personagem';
    const link=document.getElementById('characterHighlightFicha');
    link.style.display='none';
    link.removeAttribute('href');
    if(isMaster()){
      const url=await getFichaUrl(id);
      if(url){
        link.href=url;
        link.style.display='inline-flex';
      }
    }
    const m=document.getElementById('characterHighlightModal');
    m.classList.add('open');
    document.body.classList.add('modal-open');
  }

  function injectField(){
    if(!isMaster())return;
    const form=document.getElementById('characterForm');
    if(!form||document.getElementById('characterFichaUrl'))return;
    const g=document.createElement('div');
    g.className='form-group';
    g.innerHTML='<label for="characterFichaUrl">Link da ficha do personagem</label><input id="characterFichaUrl" type="url" maxlength="500" placeholder="https://..."><small>Opcional. O link é salvo no Supabase e aparece no destaque do personagem para o mestre.</small>';
    const d=document.getElementById('characterDescription');
    (d?.closest('.form-group')||form.lastElementChild).after(g);
  }

  async function loadFichaIntoForm(id){
    injectField();
    const input=document.getElementById('characterFichaUrl');
    if(!input)return;
    input.value=await getFichaUrl(id);
  }

  function setup(){
    styles();
    modal();
    injectField();
    removeCardDescriptions();

    document.addEventListener('click',e=>{
      const edit=e.target.closest('[data-edit]');
      if(edit&&isMaster()){
        setTimeout(()=>{
          injectField();
          void loadFichaIntoForm(edit.dataset.edit);
        },0);
        return;
      }
      const card=e.target.closest('.character-card');
      if(!card||e.target.closest('button,a,input,select,textarea,.entity-controls,.character-actions'))return;
      void openCard(card);
    });

    new MutationObserver(()=>{
      injectField();
      removeCardDescriptions();
    }).observe(document.body,{childList:true,subtree:true});
  }

  document.addEventListener('DOMContentLoaded',setup);
  if(document.readyState!=='loading')setup();
})();