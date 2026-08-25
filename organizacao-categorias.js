(function () {
  'use strict';
  if (!/\/categorias\.html$/i.test(location.pathname)) return;
  const style = document.createElement('style');
  style.id = 'categoryOrganizationLayoutStyles';
  style.textContent = `.category-filter-panel.category-organization-layout{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(190px,auto) auto;grid-template-areas:"search classification clear" "status status status";align-items:end;gap:14px}.category-filter-panel.category-organization-layout .filter-field-grow{min-width:0;grid-area:search}.category-filter-panel.category-organization-layout #categoryTypeFilterField,.category-filter-panel.category-organization-layout #categoryClassificationField{grid-area:classification;min-width:0}.category-filter-panel.category-organization-layout #clearCategorySearch{grid-area:clear;min-height:46px;white-space:nowrap;align-self:end;justify-self:end}.category-filter-panel.category-organization-layout #categoryFilterStatus{grid-area:status;margin:0}.category-organization-hint{margin:-4px 0 14px;font-size:.84rem;opacity:.62}.master-password-panel{margin:14px 0 20px}.master-password-panel form{display:grid;gap:12px}.master-password-panel .password-actions{display:flex;gap:10px;flex-wrap:wrap}.master-password-panel .password-message{min-height:1.2em}@media(max-width:620px){.category-filter-panel.category-organization-layout{grid-template-columns:1fr;grid-template-areas:"search" "classification" "clear" "status"}.category-filter-panel.category-organization-layout #clearCategorySearch{width:100%;justify-self:stretch}}`;
  document.head.appendChild(style);

  function setupPasswordChange(){
    if(sessionStorage.getItem('role')!=='master'||document.getElementById('masterPasswordPanel')) return;
    const anchor=document.querySelector('.category-filter-panel'); if(!anchor) return;
    const panel=document.createElement('section'); panel.id='masterPasswordPanel'; panel.className='card master-password-panel';
    panel.innerHTML='<div class="section-title"><span class="eyebrow">Segurança</span><h3>Senha do Mestre</h3><p class="muted">Altere a senha usada para entrar como Mestre nesta campanha.</p></div><form id="masterPasswordForm" novalidate><div class="form-group"><label for="masterNewPassword">Nova senha</label><input id="masterNewPassword" type="password" minlength="6" autocomplete="new-password" required placeholder="Mínimo de 6 caracteres"></div><div class="form-group"><label for="masterConfirmPassword">Confirmar nova senha</label><input id="masterConfirmPassword" type="password" minlength="6" autocomplete="new-password" required placeholder="Repita a nova senha"></div><div class="password-actions"><button id="masterPasswordSubmit" class="btn primary" type="submit">Alterar senha</button></div><div id="masterPasswordMessage" class="message password-message" aria-live="polite"></div></form>';
    anchor.insertAdjacentElement('afterend',panel);
    document.getElementById('masterPasswordForm').addEventListener('submit',async event=>{
      event.preventDefault(); const newPassword=document.getElementById('masterNewPassword').value; const confirmPassword=document.getElementById('masterConfirmPassword').value; const button=document.getElementById('masterPasswordSubmit'); const message=document.getElementById('masterPasswordMessage'); const rpgId=getSelectedRpg(); const token=getMasterToken(rpgId);
      message.className='message password-message'; message.textContent='';
      if(!token){message.className='message error password-message';message.textContent='Sessão de Mestre inválida. Entre novamente como Mestre.';return}
      if(newPassword.length<6){message.className='message error password-message';message.textContent='A senha deve possuir pelo menos 6 caracteres.';return}
      if(newPassword!==confirmPassword){message.className='message error password-message';message.textContent='As senhas não coincidem.';return}
      button.disabled=true; message.textContent='Alterando senha...';
      try{const client=getSupabaseClient();const {data,error}=await client.rpc('alterar_senha_mestre',{p_campanha_id:String(rpgId),p_token:token,p_nova_senha:newPassword});if(error)throw error;if(!data)throw new Error('Não foi possível alterar a senha.');document.getElementById('masterPasswordForm').reset();message.className='message success password-message';message.textContent='Senha alterada com sucesso.'}catch(error){console.error(error);message.className='message error password-message';message.textContent=error?.message||'Não foi possível alterar a senha.'}finally{button.disabled=false}
    });
  }

  function setup(){
    const panel=document.querySelector('.category-filter-panel'); if(!panel)return; panel.classList.add('category-organization-layout');
    const toolbar=panel.previousElementSibling; const isMaster=sessionStorage.getItem('role')==='master';
    if(isMaster&&toolbar&&!toolbar.querySelector('.category-organization-hint')){const hint=document.createElement('p');hint.className='category-organization-hint';hint.textContent='O mestre pode classificar as categorias e arrastá-las para definir a ordem da campanha.';toolbar.insertAdjacentElement('afterend',hint)}
    const applyOrder=()=>{const field=document.getElementById('categoryClassificationField');const clear=document.getElementById('clearCategorySearch');if(!field||!clear)return false;panel.appendChild(field);panel.appendChild(clear);const status=document.getElementById('categoryFilterStatus');if(status)panel.appendChild(status);return true};
    if(applyOrder())setupPasswordChange();else{const observer=new MutationObserver(()=>{if(applyOrder()){observer.disconnect();setupPasswordChange()}});observer.observe(panel,{childList:true});setTimeout(()=>observer.disconnect(),5000)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
