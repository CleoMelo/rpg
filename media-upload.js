const MEDIA_UPLOAD_ENDPOINT = `${window.SUPABASE_CONFIG.url}/functions/v1/media-upload`;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif'
]);

function validateImageFile(file) {
  if (!(file instanceof File)) {
    throw new Error('Selecione uma imagem.');
  }
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Use uma imagem JPG, PNG, WebP ou AVIF.');
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error('A imagem deve ter no máximo 5 MB.');
  }
  return file;
}

async function uploadMediaImage({ file, rpgId, token, kind }) {
  validateImageFile(file);
  const body = new FormData();
  body.append('file', file);
  body.append('campaignId', String(rpgId));
  body.append('masterToken', String(token || ''));
  body.append('kind', kind === 'campaign' ? 'campaign' : 'character');
  const response = await fetch(MEDIA_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: { apikey: window.SUPABASE_CONFIG.anonKey },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Não foi possível enviar a imagem.');
    error.code = payload.code || `HTTP_${response.status}`;
    throw error;
  }
  if (!payload.url) {
    throw new Error('O servidor não retornou o endereço da imagem.');
  }
  return payload;
}

function setFilePreview(input, preview, existingUrl = '') {
  const file = input.files?.[0];
  const url = file ? URL.createObjectURL(file) : existingUrl;
  preview.innerHTML = url
    ? `<img src="${url.replace(/"/g, '&quot;')}" alt="Prévia da imagem">`
    : '<span>A prévia da imagem aparecerá aqui.</span>';
  preview.classList.toggle('has-image', Boolean(url));
  return file;
}

async function deleteCampaignMedia({ rpgId, token }) {
  const response = await fetch(MEDIA_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      apikey: window.SUPABASE_CONFIG.anonKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ action: 'delete-campaign', campaignId: String(rpgId), masterToken: String(token || '') })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível remover as imagens da campanha.');
  return payload;
}

async function deleteUploadedMedia({ rpgId, token, imagekitFileId = '', driveFileId = '' }) {
  if (!imagekitFileId && !driveFileId) return null;
  const response = await fetch(MEDIA_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: { apikey: window.SUPABASE_CONFIG.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'delete-upload', campaignId: String(rpgId), masterToken: String(token || ''),
      imagekitFileId: String(imagekitFileId || ''), driveFileId: String(driveFileId || '')
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível remover a imagem enviada sem registro.');
  return payload;
}

async function deleteCharacterMedia({ rpgId, token, imageUrls = [] }) {
  const uniqueUrls = [...new Set(imageUrls.map(value => String(value || '').trim()).filter(Boolean))];
  if (!uniqueUrls.length) return { success: true, imagekitDeleted: 0, driveDeleted: 0 };
  const response = await fetch(MEDIA_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: { apikey: window.SUPABASE_CONFIG.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'delete-character-media', campaignId: String(rpgId), masterToken: String(token || ''), imageUrls: uniqueUrls })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível remover as imagens dos personagens.');
  return payload;
}

async function deleteReplacedMedia({ rpgId, token, kind, imageUrl }) {
  const previousUrl = String(imageUrl || '').trim();
  if (!previousUrl) return { success: true, imagekitDeleted: 0, driveDeleted: 0 };
  const response = await fetch(MEDIA_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: { apikey: window.SUPABASE_CONFIG.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'delete-replaced-media', campaignId: String(rpgId), masterToken: String(token || ''),
      kind: kind === 'campaign' ? 'campaign' : 'character', imageUrls: [previousUrl]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'A nova imagem foi salva, mas não foi possível remover a anterior.');
  return payload;
}

(function loadCategoryModules() {
  if (!/\/categorias\.html$/i.test(location.pathname)) return;
  const styles = [
    'css/filtros.css?v=20260824-2',
    'css/classificacoes.css?v=20260824-1',
    'css/personagens.css?v=20260824-1',
    'css/modais.css?v=20260824-1'
  ];
  styles.forEach(href => {
    const baseHref = href.split('?')[0];
    if (document.querySelector(`link[href^="${baseHref}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  });
  if (!document.querySelector('script[data-category-classification]')) {
    const script = document.createElement('script');
    script.src = 'classificacao-categorias-v2.js?v=20260824-1';
    script.dataset.categoryClassification = 'true';
    document.body.appendChild(script);
  }
})();