(function () {
  function initChangePassword() {
    if (!/\/categorias\.html$/i.test(location.pathname)) return;
    if (sessionStorage.getItem('role') !== 'master') return;
    if (document.getElementById('changeMasterPasswordButton')) return;

    const toolbar = document.querySelector('.master-toolbar');
    if (!toolbar) return;

    const button = document.createElement('button');
    button.id = 'changeMasterPasswordButton';
    button.className = 'btn secondary';
    button.type = 'button';
    button.textContent = '🔑 Alterar senha';

    const deleteButton = document.getElementById('deleteCampaignButton');
    toolbar.insertBefore(button, deleteButton || null);

    const backdrop = document.createElement('div');
    backdrop.id = 'masterPasswordModal';
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'masterPasswordModalTitle');
    backdrop.innerHTML = `
      <section class="card modal">
        <div class="modal-header">
          <h2 id="masterPasswordModalTitle">Alterar senha do mestre</h2>
          <button class="close-button" id="closeMasterPasswordModal" type="button" aria-label="Fechar">×</button>
        </div>
        <form id="masterPasswordForm">
          <div class="form-group">
            <label for="currentMasterPassword">Senha atual</label>
            <input id="currentMasterPassword" type="password" autocomplete="current-password" required>
          </div>
          <div class="form-group">
            <label for="newMasterPassword">Nova senha</label>
            <input id="newMasterPassword" type="password" minlength="6" autocomplete="new-password" required>
            <small>Use pelo menos 6 caracteres.</small>
          </div>
          <div class="form-group">
            <label for="confirmMasterPassword">Confirmar nova senha</label>
            <input id="confirmMasterPassword" type="password" minlength="6" autocomplete="new-password" required>
          </div>
          <p id="masterPasswordMessage" class="message" aria-live="polite"></p>
          <button class="btn full" type="submit">Salvar nova senha</button>
        </form>
      </section>`;
    document.body.appendChild(backdrop);

    const form = document.getElementById('masterPasswordForm');
    const message = document.getElementById('masterPasswordMessage');
    const closeButton = document.getElementById('closeMasterPasswordModal');

    const close = () => {
      backdrop.classList.remove('open');
      if (!document.querySelector('.modal-backdrop.open')) {
        document.body.classList.remove('modal-open');
      }
      form.reset();
      message.textContent = '';
      message.className = 'message';
    };

    const open = () => {
      backdrop.classList.add('open');
      document.body.classList.add('modal-open');
      document.getElementById('currentMasterPassword').focus();
    };

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
      const currentPassword = document.getElementById('currentMasterPassword').value;
      const newPassword = document.getElementById('newMasterPassword').value;
      const confirmPassword = document.getElementById('confirmMasterPassword').value;

      if (newPassword.length < 6) {
        message.className = 'message error';
        message.textContent = 'A nova senha precisa ter pelo menos 6 caracteres.';
        return;
      }
      if (newPassword !== confirmPassword) {
        message.className = 'message error';
        message.textContent = 'A confirmação da nova senha não confere.';
        return;
      }
      if (!rpgId || !token) {
        message.className = 'message error';
        message.textContent = 'Sessão do mestre não encontrada. Entre novamente na campanha.';
        return;
      }

      const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if (!client) return;

      const submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Alterando...';

      try {
        const { data, error } = await client.rpc('trocar_senha_mestre', {
          p_campanha_id: String(rpgId),
          p_token: token,
          p_senha_atual: currentPassword,
          p_nova_senha: newPassword
        });

        if (error) throw error;
        if (!data) throw new Error('Não foi possível alterar a senha.');

        if (typeof clearMasterSession === 'function') {
          clearMasterSession(rpgId);
        } else {
          sessionStorage.removeItem(`masterSession:${String(rpgId)}`);
        }

        location.href = `mestre.html?rpg=${encodeURIComponent(rpgId)}`;
      } catch (error) {
        console.error(error);
        message.className = 'message error';
        message.textContent = error?.message || 'Não foi possível alterar a senha.';
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Salvar nova senha';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChangePassword, { once: true });
  } else {
    initChangePassword();
  }
})();
