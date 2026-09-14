import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FIXED_HANDLES = ['cleo', 'pedro', 'tigre', 'hana', 'carero'];
const CAMPAIGNS = {
  cavaleiros: {
    id: 'c4e4e708-f809-42c7-858d-dbfba31b0895',
    name: 'Cavaleiros Divinos: A Ordem dos Reinos'
  },
  fate: {
    id: '1a23d727-3158-4f58-b8cd-0ec2237bafd0',
    name: 'Fate/Grand RPG'
  },
  dnd: {
    id: '47e15c62-daaf-4b2b-885e-d54d02b8e424',
    name: 'D&D'
  },
  correntes: {
    id: '97060edf-1d20-4e59-b82e-443ade4ae138',
    name: 'Correntes do Destino'
  }
};
const DEFAULT_ACCESS = [
  { handle: 'tigre', campaign: 'cavaleiros', role: 'master' },
  { handle: 'pedro', campaign: 'correntes', role: 'master' },
  { handle: 'cleo', campaign: 'dnd', role: 'master' },
  { handle: 'cleo', campaign: 'fate', role: 'master' }
];

const configArgument = process.argv.slice(2).find(argument => argument !== '--init');
const configPath = resolve(configArgument || 'scripts/fixed-users.local.json');
if (process.argv.includes('--init')) {
  const template = Object.fromEntries(FIXED_HANDLES.map(handle => [handle, {
    password: 'SENHA_INICIAL_COM_12_OU_MAIS_CARACTERES',
    displayName: handle.charAt(0).toUpperCase() + handle.slice(1)
  }]));
  await writeFile(configPath, `${JSON.stringify(template, null, 2)}\n`, { flag: 'wx' });
  console.log(`Arquivo local criado: ${configPath}`);
  console.log('Preencha as cinco senhas antes de executar o script novamente.');
  process.exit(0);
}

const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY somente neste terminal.');
}

const accountConfig = JSON.parse(await readFile(configPath, 'utf8'));
const configuredHandles = Object.keys(accountConfig).sort();
if (configuredHandles.join(',') !== [...FIXED_HANDLES].sort().join(',')) {
  throw new Error(`O arquivo deve conter somente estas cinco contas: ${FIXED_HANDLES.join(', ')}.`);
}

function headers(extra = {}) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
    ...extra
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: headers(options.headers)
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error_description || payload?.hint || `${response.status} ${response.statusText}`);
  }
  return payload;
}

async function listAuthUsers() {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const result = await request(`/auth/v1/admin/users?page=${page}&per_page=100`);
    const batch = Array.isArray(result?.users) ? result.users : [];
    users.push(...batch);
    if (batch.length < 100) break;
  }
  return users;
}

function validateAccount(handle, config, existingUser) {
  const password = String(config?.password || '');
  const displayName = String(config?.displayName || handle).trim();
  if (!existingUser && (password.length < 12 || password.includes('SENHA_INICIAL_'))) {
    throw new Error(`Informe uma senha inicial de pelo menos 12 caracteres para ${handle}.`);
  }
  if (displayName.length < 2 || displayName.length > 80) {
    throw new Error(`O nome de exibição de ${handle} deve ter entre 2 e 80 caracteres.`);
  }
  return { password, displayName };
}

function authenticationEmail(handle) {
  return `${handle}@arquivo-rpg.invalid`;
}

const campaignIds = Object.values(CAMPAIGNS).map(campaign => campaign.id);
const encodedIds = encodeURIComponent(`(${campaignIds.join(',')})`);
const campaigns = await request(`/rest/v1/campanhas?id=in.${encodedIds}&select=id,nome`);
for (const expected of Object.values(CAMPAIGNS)) {
  const found = campaigns.find(campaign => String(campaign.id) === expected.id);
  if (!found) throw new Error(`Campanha não encontrada: ${expected.name} (${expected.id}).`);
  if (String(found.nome) !== expected.name) {
    throw new Error(`O ID ${expected.id} agora pertence a "${found.nome}", não a "${expected.name}".`);
  }
}

const existingUsers = await listAuthUsers();
const usersByHandle = new Map();
for (const user of existingUsers) {
  const handle = String(user.user_metadata?.rpg_username || '').toLowerCase();
  if (FIXED_HANDLES.includes(handle)) usersByHandle.set(handle, user);
}

for (const handle of FIXED_HANDLES) {
  const rawConfig = accountConfig[handle];
  const internalEmail = authenticationEmail(handle);
  let user = usersByHandle.get(handle) || existingUsers.find(item =>
    String(item.email || '').toLowerCase() === internalEmail
  );
  const config = validateAccount(handle, rawConfig, user);

  if (!user) {
    const created = await request('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: internalEmail,
        password: config.password,
        email_confirm: true,
        user_metadata: {
          rpg_username: handle,
          display_name: config.displayName
        }
      })
    });
    user = created?.user || created;
    console.log(`Conta criada: ${handle}`);
  } else {
    const updated = await request(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        email: internalEmail,
        email_confirm: true,
        user_metadata: {
          ...(user.user_metadata || {}),
          rpg_username: handle,
          display_name: config.displayName
        }
      })
    });
    user = updated?.user || updated;
    console.log(`Conta atualizada para login: ${handle}`);
  }

  if (!user?.id) throw new Error(`O Supabase não retornou o ID de ${handle}.`);
  usersByHandle.set(handle, user);

  await request('/rest/v1/perfis_usuario?on_conflict=usuario_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      usuario_id: user.id,
      apelido: handle,
      email_autenticacao: internalEmail,
      nome_exibicao: config.displayName,
      ativo: true
    })
  });
}

const memberships = DEFAULT_ACCESS.map(access => ({
  campanha_id: CAMPAIGNS[access.campaign].id,
  usuario_id: usersByHandle.get(access.handle).id,
  papel: access.role,
  ativo: true
}));

await request('/rest/v1/membros_campanha?on_conflict=campanha_id,usuario_id', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(memberships)
});

console.log('Acessos iniciais aplicados:');
for (const access of DEFAULT_ACCESS) {
  console.log(`- ${access.handle}: ${CAMPAIGNS[access.campaign].name} (${access.role})`);
}
console.log('- hana e carero: sem campanha inicial; um mestre pode conceder acesso depois.');
console.log('Configuração concluída. Apague fixed-users.local.json após guardar as senhas com segurança.');
