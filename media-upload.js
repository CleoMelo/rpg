const MEDIA_UPLOAD_ENDPOINT = `${window.SUPABASE_CONFIG.url}/functions/v1/media-upload`;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp','image/avif']);

function validateImageFile(file) {
  if (!(file instanceof File)) throw new Error('Selecione uma imagem.');
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) throw new Error('Use uma imagem JPG, PNG, WebP ou AVIF.');
  if (file.size > MAX_IMAGE_SIZE) throw new Error('A imagem deve ter no máximo 5 MB.');
  return file;
}

async function uploadMediaImage({ file, rpgId, token, kind, accessRole = 'master' }) {
  validateImageFile(file);
  const body = new FormData();
  body.append('file', file);
  body.append('campaignId', String(rpgId));
  body.append('masterToken', String(token || ''));
  body.append('accessToken', String(token || ''));
  body.append('accessRole', accessRole === 'editor' ? 'editor' : 'master');
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
  if (!payload.url) throw new Error('O servidor não retornou o endereço da imagem.');
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

async function postMediaAction(payload, fallbackMessage) {
  const response = await fetch(MEDIA_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      apikey: window.SUPABASE_CONFIG.anonKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || fallbackMessage);
  return result;
}

async function deleteCampaignMedia({ rpgId, token }) {
  return postMediaAction({
    action: 'delete-campaign',
    campaignId: String(rpgId),
    masterToken: String(token || '')
  }, 'Não foi possível remover as imagens da campanha.');
}

async function deleteUploadedMedia({ rpgId, token, imagekitFileId = '', driveFileId = '' }) {
  if (!imagekitFileId && !driveFileId) return null;
  return postMediaAction({
    action: 'delete-upload',
    campaignId: String(rpgId),
    masterToken: String(token || ''),
    imagekitFileId: String(imagekitFileId || ''),
    driveFileId: String(driveFileId || '')
  }, 'Não foi possível remover a imagem enviada sem registro.');
}

async function deleteCharacterMedia({ rpgId, token, imageUrls = [] }) {
  const uniqueUrls = [...new Set(
    imageUrls.map(value => String(value || '').trim()).filter(Boolean)
  )];
  if (!uniqueUrls.length) {
    return { success: true, imagekitDeleted: 0, driveDeleted: 0 };
  }
  return postMediaAction({
    action: 'delete-character-media',
    campaignId: String(rpgId),
    masterToken: String(token || ''),
    imageUrls: uniqueUrls
  }, 'Não foi possível remover as imagens dos personagens.');
}

async function deleteReplacedMedia({ rpgId, token, kind, imageUrl, accessRole = 'master' }) {
  const previousUrl = String(imageUrl || '').trim();
  if (!previousUrl) {
    return { success: true, imagekitDeleted: 0, driveDeleted: 0 };
  }
  return postMediaAction({
    action: 'delete-replaced-media',
    campaignId: String(rpgId),
    masterToken: String(token || ''),
    accessToken: String(token || ''),
    accessRole: accessRole === 'editor' ? 'editor' : 'master',
    kind: kind === 'campaign' ? 'campaign' : 'character',
    imageUrls: [previousUrl]
  }, 'A nova imagem foi salva, mas não foi possível remover a anterior.');
}
