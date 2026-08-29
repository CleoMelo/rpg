const GH_API = "https://api.github.com";
const GH_VERSION = "2026-03-10";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

async function gh(env, path, options = {}) {
  const response = await fetch(`${GH_API}${path}`, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": GH_VERSION,
      "User-Agent": "timeline-cavaleiros-public-editor",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const err = new Error(body.message || `GitHub respondeu ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return response;
}

function encodePath(path) {
  return String(path).split("/").map(encodeURIComponent).join("/");
}

function b64ToUtf8(base64) {
  const clean = String(base64 || "").replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function utf8ToB64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function validateTimeline(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.resources)) return false;
  for (const resource of data.resources) {
    if (!Array.isArray(resource?.documents)) continue;
    for (const doc of resource.documents) {
      if (
        doc?.type === "time" &&
        Array.isArray(doc?.content?.events) &&
        Array.isArray(doc?.content?.lanes)
      ) return true;
    }
  }
  return false;
}

function repoBase(env) {
  return `/repos/${encodeURIComponent(env.OWNER)}/${encodeURIComponent(env.REPO)}`;
}

async function getTimelineFile(env, ref = env.BRANCH) {
  const response = await gh(
    env,
    `${repoBase(env)}/contents/${encodePath(env.TIMELINE_PATH)}?ref=${encodeURIComponent(ref)}`
  );
  return response.json();
}

async function readTimeline(env, ref = env.BRANCH) {
  const file = await getTimelineFile(env, ref);
  const text = b64ToUtf8(file.content);
  const data = JSON.parse(text);
  if (!validateTimeline(data)) throw new Error("O timeline.json do repositório não possui a estrutura esperada.");
  return { data, file };
}

async function saveTimeline(env, data, message) {
  if (!validateTimeline(data)) {
    const err = new Error("A timeline enviada não possui a estrutura esperada.");
    err.status = 400;
    throw err;
  }

  const current = await getTimelineFile(env, env.BRANCH);
  const serialized = JSON.stringify(data, null, 2);

  if (serialized.length > 2_000_000) {
    const err = new Error("A timeline ficou grande demais para este editor.");
    err.status = 413;
    throw err;
  }

  const response = await gh(
    env,
    `${repoBase(env)}/contents/${encodePath(env.TIMELINE_PATH)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: utf8ToB64(serialized),
        sha: current.sha,
        branch: env.BRANCH
      })
    }
  );

  const result = await response.json();
  return {
    commitSha: result?.commit?.sha || null,
    previousBlobSha: current.sha
  };
}

async function listBackups(env) {
  const response = await gh(
    env,
    `${repoBase(env)}/commits?sha=${encodeURIComponent(env.BRANCH)}&path=${encodeURIComponent(env.TIMELINE_PATH)}&per_page=100`
  );
  const commits = await response.json();
  return commits.map(item => ({
    sha: item.sha,
    shortSha: String(item.sha || "").slice(0, 8),
    message: item?.commit?.message || "Alteração da timeline",
    date: item?.commit?.committer?.date || item?.commit?.author?.date || null,
    author: item?.commit?.author?.name || item?.author?.login || "Editor"
  }));
}

async function parseBody(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 2_500_000) {
    const err = new Error("Requisição grande demais.");
    err.status = 413;
    throw err;
  }
  return request.json();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse({ ok: true, repository: `${env.OWNER}/${env.REPO}` });
      }

      if (request.method === "GET" && url.pathname === "/timeline") {
        const { data } = await readTimeline(env);
        return jsonResponse(data);
      }

      if (request.method === "GET" && url.pathname === "/backups") {
        const backups = await listBackups(env);
        return jsonResponse({ backups });
      }

      if (request.method === "POST" && url.pathname === "/save") {
        const body = await parseBody(request);
        const when = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
        const result = await saveTimeline(
          env,
          body?.data,
          `Timeline: edição pública em ${when}`
        );
        return jsonResponse({
          ok: true,
          ...result,
          backupCreated: true
        });
      }

      if (request.method === "POST" && url.pathname === "/restore") {
        const body = await parseBody(request);
        const sha = String(body?.sha || "").trim();
        if (!/^[0-9a-f]{40}$/i.test(sha)) {
          return jsonResponse({ error: "Versão de backup inválida." }, 400);
        }

        const { data } = await readTimeline(env, sha);
        const when = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
        const result = await saveTimeline(
          env,
          data,
          `Timeline: restaura versão ${sha.slice(0, 8)} em ${when}`
        );

        return jsonResponse({
          ok: true,
          restoredFrom: sha,
          ...result,
          backupCreated: true
        });
      }

      return jsonResponse({ error: "Rota não encontrada." }, 404);
    } catch (err) {
      const status = err?.status === 409 || err?.status === 422
        ? 409
        : Number(err?.status) >= 400 && Number(err?.status) < 600
          ? Number(err.status)
          : 500;

      const message = status === 409
        ? "Outra pessoa salvou uma alteração ao mesmo tempo. Recarregue a página para pegar a versão mais recente antes de tentar novamente."
        : (err?.message || "Erro interno no serviço de edição.");

      return jsonResponse({ error: message }, status);
    }
  }
};
