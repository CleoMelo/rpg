(function () {
  'use strict';

  function initEditorPassword() {
    if (!/\/categorias\.html$/i.test(location.pathname)) return;
    if (sessionStorage.getItem('role') !== 'master') return;
    if (document.getElementById('changeEditorPasswordButton')) return;

    const toolbar = document.querySelector('.campaign-page-actions');
    if (!toolbar) return;

    const button = document.createElement('button');
    button.id = 'changeEditorPasswordButton';
    button.className = 'btn secondary';
    button.type = 'button';
    button.textContent = '✎ Senha do editor';

    const masterPasswordButton = document.getElementById('changeMasterPasswordButton');
    if (masterPasswordButton?.parentElement === toolbar) {
      masterPasswordButton.after(button);
    } else {
      toolbar.appendChild(button);
    }

    const backdrop = document.createElement('div');
    backdrop.id = 'editorPasswordModal';
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'editorPasswordModalTitle');
    backdrop.innerHTML = `
      <section class="card modal">
        <div class="modal-header">
          <h2 id="editorPasswordModalTitle">Definir senha do editor</h2>
          <button class="close-button" id="closeEditorPasswordModal" type="button" aria-label="Fechar">×</button>
        </div>
        <form id="editorPasswordForm">
          <p class="muted">A senha do editor permite alterar personagens públicos, categorias públicas e a linha do tempo. Conteúdo exclusivo do mestre e classificações permanecem inacessíveis.</p>
          <div class="form-group">
            <label for="newEditorPassword">Nova senha do editor</label>
            <input id="newEditorPassword" type="password" minlength="6" maxlength="72" autocomplete="new-password" required>
          </div>
          <div class="form-group">
            <label for="confirmEditorPassword">Confirmar nova senha</label>
            <input id="confirmEditorPassword" type="password" minlength="6" maxlength="72" autocomplete="new-password" required>
          </div>
          <p id="editorPasswordMessage" class="message" aria-live="polite"></p>
          <button class="btn full" type="submit">Salvar senha do editor</button>
        </form>
      </section>`;
    document.body.appendChild(backdrop);

    const form = document.getElementById('editorPasswordForm');
    const message = document.getElementById('editorPasswordMessage');
    const closeButton = document.getElementById('closeEditorPasswordModal');

    function close() {
      backdrop.classList.remove('open');
      if (!document.querySelector('.modal-backdrop.open')) {
        document.body.classList.remove('modal-open');
      }
      form.reset();
      message.textContent = '';
      message.className = 'message';
    }

    function open() {
      backdrop.classList.add('open');
      document.body.classList.add('modal-open');
      document.getElementById('newEditorPassword').focus();
    }

    button.addEventListener('click', open);
    closeButton.addEventListener('click', close);
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) close();
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      message.className = 'message';
      message.textContent = '';

      const rpgId = typeof getSelectedRpg === 'function'
        ? getSelectedRpg()
        : new URLSearchParams(location.search).get('rpg');
      const token = typeof getMasterToken === 'function'
        ? getMasterToken(rpgId)
        : sessionStorage.getItem(`masterSession:${String(rpgId)}`);
      const password = document.getElementById('newEditorPassword').value;
      const confirmation = document.getElementById('confirmEditorPassword').value;

      if (password.length < 6) {
        message.className = 'message error';
        message.textContent = 'A senha do editor precisa ter pelo menos 6 caracteres.';
        return;
      }
      if (password !== confirmation) {
        message.className = 'message error';
        message.textContent = 'A confirmação da senha do editor não confere.';
        return;
      }
      if (!rpgId || !token) {
        message.className = 'message error';
        message.textContent = 'Sessão do mestre não encontrada. Entre novamente na campanha.';
        return;
      }

      const submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Salvando...';

      try {
        const { data, error } = await getSupabaseClient().rpc('definir_senha_editor', {
          p_campanha_id: String(rpgId),
          p_token: token,
          p_nova_senha: password
        });
        if (error) throw error;
        if (!data) throw new Error('Não foi possível definir a senha do editor.');

        message.className = 'message success';
        message.textContent = 'Senha do editor atualizada. Sessões antigas de editor foram encerradas.';
        form.reset();
      } catch (error) {
        console.error(error);
        message.className = 'message error';
        message.textContent = error?.message || 'Não foi possível definir a senha do editor.';
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Salvar senha do editor';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEditorPassword, { once: true });
  } else {
    initEditorPassword();
  }
})();
