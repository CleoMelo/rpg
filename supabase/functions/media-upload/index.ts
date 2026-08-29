const ALLOWED_ORIGINS = new Set([
  "https://cleomelo.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://cleomelo.github.io",
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "Origin",
  };
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(req),
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function requiredSecret(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Secret ausente: ${name}`);
  return value;
}

function sanitizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "imagem";
}

async function verifyMaster(campaignId: string, masterToken: string) {
  const supabaseUrl = requiredSecret("SUPABASE_URL");
  const serviceKey = requiredSecret("SUPABASE_SERVICE_ROLE_KEY");
  const headers = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
  };

  const campaignResponse = await fetch(
    `${supabaseUrl}/rest/v1/campanhas?id=eq.${encodeURIComponent(campaignId)}` +
      "&select=id,nome,descricao,imagem_url&limit=1",
    { headers },
  );

  if (!campaignResponse.ok) return false;
  const campaigns = await campaignResponse.json();
  const campaign = campaigns?.[0];
  if (!campaign) return false;

  const verifyResponse = await fetch(
    `${supabaseUrl}/rest/v1/rpc/editar_campanha`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_campanha_id: campaignId,
        p_token: masterToken,
        p_nome: campaign.nome,
        p_descricao: campaign.descricao,
        p_imagem_url: campaign.imagem_url,
      }),
    },
  );

  return verifyResponse.ok;
}

async function uploadToImageKit(
  file: File,
  campaignId: string,
  kind: string,
) {
  const privateKey = requiredSecret("IMAGEKIT_PRIVATE_KEY");
  const endpoint = requiredSecret("IMAGEKIT_URL_ENDPOINT").replace(/\/+$/, "");
  const extension = file.name.includes(".")
    ? `.${file.name.split(".").pop()?.toLowerCase()}`
    : "";
  const fileName =
    `${sanitizeName(campaignId)}-${kind}-${Date.now()}${extension}`;

  const body = new FormData();
  body.append("file", file);
  body.append("fileName", fileName);
  body.append("folder", `/portal-rpg/${sanitizeName(campaignId)}/${kind}`);
  body.append("useUniqueFileName", "true");
  body.append("tags", `portal-rpg,${kind}`);

  const response = await fetch(
    "https://upload.imagekit.io/api/v1/files/upload",
    {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${privateKey}:`)}`,
        accept: "application/json",
      },
      body,
    },
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || "O ImageKit recusou o envio.");
  }

  const filePath = String(result.filePath || "").replace(/^\/+/, "");
  return {
    fileId: result.fileId as string,
    fileName,
    url: filePath ? `${endpoint}/${filePath}` : result.url as string,
  };
}

async function getGoogleAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredSecret("GOOGLE_CLIENT_ID"),
      client_secret: requiredSecret("GOOGLE_CLIENT_SECRET"),
      refresh_token: requiredSecret("GOOGLE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || "Falha ao acessar o Google Drive.");
  }
  return result.access_token as string;
}

async function uploadToDrive(file: File, fileName: string) {
  const accessToken = await getGoogleAccessToken();
  const boundary = `portal_rpg_${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: fileName,
    parents: [requiredSecret("GOOGLE_DRIVE_FOLDER_ID")],
    description: "Backup automático criado pelo Portal de RPGs",
  });

  const body = new Blob([
    `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${file.type}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ]);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files" +
      "?uploadType=multipart&fields=id,name",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      result.error?.message || "Não foi possível criar o backup no Drive.",
    );
  }
  return result.id as string;
}

async function deleteImageKitCampaignFiles(campaignId: string) {
  const privateKey = requiredSecret("IMAGEKIT_PRIVATE_KEY");
  const authorization = `Basic ${btoa(`${privateKey}:`)}`;
  const root = `/portal-rpg/${sanitizeName(campaignId)}`;
  const folders = [`${root}/campaign/`, `${root}/character/`];
  const fileIds: string[] = [];

  for (const path of folders) {
    const query = new URLSearchParams({
      path,
      type: "file",
      limit: "1000",
    });
    const response = await fetch(
      `https://api.imagekit.io/v1/files?${query.toString()}`,
      {
        headers: {
          authorization,
          accept: "application/json",
        },
      },
    );
    const files = await response.json().catch(() => []);
    if (!response.ok) {
      throw new Error(
        files?.message || "Não foi possível listar as imagens no ImageKit.",
      );
    }
    for (const file of files) {
      if (file?.fileId) fileIds.push(String(file.fileId));
    }
  }

  for (const fileId of fileIds) {
    const response = await fetch(
      `https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`,
      {
        method: "DELETE",
        headers: {
          authorization,
          accept: "application/json",
        },
      },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error("Não foi possível remover uma imagem do ImageKit.");
    }
  }

  const deleteFolderResponse = await fetch(
    "https://api.imagekit.io/v1/folder",
    {
      method: "DELETE",
      headers: {
        authorization,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ folderPath: root }),
    },
  );
  const deleteFolderResult = await deleteFolderResponse.json().catch(() => ({}));
  if (!deleteFolderResponse.ok && deleteFolderResponse.status !== 404) {
    throw new Error(
      deleteFolderResult?.message ||
        "As imagens foram removidas, mas não foi possível excluir a pasta da campanha no ImageKit.",
    );
  }

  return fileIds.length;
}

async function deleteUploadedImageKitFile(fileId: string) {
  if (!fileId) return false;

  const privateKey = requiredSecret("IMAGEKIT_PRIVATE_KEY");
  const authorization = `Basic ${btoa(`${privateKey}:`)}`;
  const response = await fetch(
    `https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`,
    {
      method: "DELETE",
      headers: {
        authorization,
        accept: "application/json",
      },
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error("Não foi possível remover a imagem que ficou sem registro.");
  }
  return true;
}

async function deleteUploadedDriveFile(fileId: string) {
  if (!fileId) return false;

  const accessToken = await getGoogleAccessToken();
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error("Não foi possível remover o backup que ficou sem registro.");
  }
  return true;
}

function managedFileNames(
  campaignId: string,
  kind: "campaign" | "character",
  imageUrls: string[],
) {
  const endpoint = new URL(requiredSecret("IMAGEKIT_URL_ENDPOINT"));
  const endpointPath = endpoint.pathname.replace(/\/+$/, "");
  const expectedPath =
    `${endpointPath}/portal-rpg/${sanitizeName(campaignId)}/${kind}/`
      .replace(/\/{2,}/g, "/");
  const names = new Set<string>();

  for (const value of imageUrls) {
    try {
      const imageUrl = new URL(String(value || "").trim());
      const decodedPath = decodeURIComponent(imageUrl.pathname);
      if (
        imageUrl.protocol !== "https:" ||
        imageUrl.origin !== endpoint.origin ||
        !decodedPath.startsWith(expectedPath)
      ) {
        continue;
      }

      const name = decodedPath.split("/").pop()?.trim();
      if (name) names.add(name);
    } catch {
      // Links antigos ou externos não possuem arquivos gerenciados para excluir.
    }
  }

  return names;
}

function managedUploadStem(
  fileName: string,
  kind: "campaign" | "character",
) {
  const pattern = kind === "campaign"
    ? /^(.*-campaign-\d+)/
    : /^(.*-character-\d+)/;
  return fileName.match(pattern)?.[1] || "";
}

async function deleteImageKitManagedFiles(
  campaignId: string,
  kind: "campaign" | "character",
  targetNames: Set<string>,
) {
  if (!targetNames.size) return 0;

  const privateKey = requiredSecret("IMAGEKIT_PRIVATE_KEY");
  const authorization = `Basic ${btoa(`${privateKey}:`)}`;
  const query = new URLSearchParams({
    path: `/portal-rpg/${sanitizeName(campaignId)}/${kind}/`,
    type: "file",
    limit: "1000",
  });
  const response = await fetch(
    `https://api.imagekit.io/v1/files?${query.toString()}`,
    {
      headers: {
        authorization,
        accept: "application/json",
      },
    },
  );
  const files = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(
      files?.message || "Não foi possível localizar a imagem anterior.",
    );
  }

  const fileIds = (Array.isArray(files) ? files : [])
    .filter((file) => targetNames.has(String(file?.name || "")))
    .map((file) => String(file.fileId))
    .filter(Boolean);

  await Promise.all(fileIds.map(async (fileId) => {
    const deleteResponse = await fetch(
      `https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`,
      {
        method: "DELETE",
        headers: {
          authorization,
          accept: "application/json",
        },
      },
    );
    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      throw new Error("Não foi possível remover a imagem anterior.");
    }
  }));

  return fileIds.length;
}

async function deleteDriveManagedFiles(
  campaignId: string,
  kind: "campaign" | "character",
  targetNames: Set<string>,
) {
  const targetStems = new Set(
    [...targetNames]
      .map((name) => managedUploadStem(name, kind))
      .filter(Boolean),
  );
  if (!targetStems.size) return 0;

  const accessToken = await getGoogleAccessToken();
  const folderId = requiredSecret("GOOGLE_DRIVE_FOLDER_ID");
  const prefix = `${sanitizeName(campaignId)}-${kind}-`;
  const query = new URLSearchParams({
    q: `'${folderId}' in parents and name contains '${prefix}' and trashed = false`,
    pageSize: "1000",
    fields: "files(id,name)",
  });
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?${query.toString()}`,
    {
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      result.error?.message || "Não foi possível localizar o backup anterior.",
    );
  }

  const files = (Array.isArray(result.files) ? result.files : [])
    .filter((file) => targetStems.has(
      managedUploadStem(String(file.name || ""), kind),
    ));

  await Promise.all(files.map(async (file) => {
    const deleteResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${accessToken}` },
      },
    );
    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      throw new Error("Não foi possível remover o backup anterior.");
    }
  }));

  return files.length;
}

async function deleteManagedMediaFiles(
  campaignId: string,
  kind: "campaign" | "character",
  imageUrls: string[],
) {
  const targetNames = managedFileNames(campaignId, kind, imageUrls);
  const [imagekitDeleted, driveDeleted] = await Promise.all([
    deleteImageKitManagedFiles(campaignId, kind, targetNames),
    deleteDriveManagedFiles(campaignId, kind, targetNames),
  ]);

  return { imagekitDeleted, driveDeleted };
}

async function deleteCharacterMediaFiles(
  campaignId: string,
  imageUrls: string[],
) {
  return deleteManagedMediaFiles(campaignId, "character", imageUrls);
}

async function deleteDriveCampaignFiles(campaignId: string) {
  const accessToken = await getGoogleAccessToken();
  const folderId = requiredSecret("GOOGLE_DRIVE_FOLDER_ID");
  const prefix = `${sanitizeName(campaignId)}-`;
  const q =
    `'${folderId}' in parents and name contains '${prefix}' and trashed = false`;
  const query = new URLSearchParams({
    q,
    pageSize: "1000",
    fields: "files(id,name)",
  });
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?${query.toString()}`,
    {
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      result.error?.message || "Não foi possível listar os backups no Drive.",
    );
  }

  const files = Array.isArray(result.files) ? result.files : [];
  for (const file of files) {
    const deleteResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${accessToken}` },
      },
    );
    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      throw new Error("Não foi possível remover um backup do Google Drive.");
    }
  }

  return files.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Método não permitido." }, 405);
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = await req.json();
      const action = String(payload?.action || "");
      if (![
        "delete-campaign",
        "delete-upload",
        "delete-character-media",
        "delete-replaced-media",
      ].includes(action)) {
        return json(req, { error: "Ação inválida." }, 400);
      }

      const campaignId = String(payload.campaignId || "").trim();
      const masterToken = String(payload.masterToken || "").trim();
      if (!campaignId || !masterToken) {
        return json(req, { error: "Acesso do mestre ausente." }, 401);
      }
      if (!(await verifyMaster(campaignId, masterToken))) {
        return json(
          req,
          { error: "Acesso do mestre inválido ou expirado." },
          403,
        );
      }

      if (action === "delete-upload") {
        const imagekitFileId = String(payload.imagekitFileId || "").trim();
        const driveFileId = String(payload.driveFileId || "").trim();
        if (!imagekitFileId && !driveFileId) {
          return json(req, { error: "Nenhum arquivo foi informado." }, 400);
        }

        const [imagekitDeleted, driveDeleted] = await Promise.all([
          deleteUploadedImageKitFile(imagekitFileId),
          deleteUploadedDriveFile(driveFileId),
        ]);

        return json(req, {
          success: true,
          imagekitDeleted,
          driveDeleted,
        });
      }

      if (
        action === "delete-character-media" ||
        action === "delete-replaced-media"
      ) {
        const imageUrls = Array.isArray(payload.imageUrls)
          ? payload.imageUrls
            .map((value: unknown) => String(value || "").trim())
            .filter(Boolean)
            .slice(0, 1000)
          : [];
        const kind = action === "delete-character-media"
          ? "character"
          : String(payload.kind || "");
        if (!["campaign", "character"].includes(kind)) {
          return json(req, { error: "Tipo de imagem inválido." }, 400);
        }
        const deleted = await deleteManagedMediaFiles(
          campaignId,
          kind as "campaign" | "character",
          imageUrls,
        );
        return json(req, { success: true, ...deleted });
      }

      const [imagekitDeleted, driveDeleted] = await Promise.all([
        deleteImageKitCampaignFiles(campaignId),
        deleteDriveCampaignFiles(campaignId),
      ]);

      return json(req, {
        success: true,
        imagekitDeleted,
        driveDeleted,
      });
    }

    const form = await req.formData();
    const file = form.get("file");
    const campaignId = String(form.get("campaignId") || "").trim();
    const masterToken = String(form.get("masterToken") || "").trim();
    const kind = String(form.get("kind") || "").trim();

    if (!(file instanceof File)) {
      return json(req, { error: "Selecione uma imagem." }, 400);
    }
    if (!campaignId || !masterToken) {
      return json(req, { error: "Acesso do mestre ausente." }, 401);
    }
    if (!["campaign", "character"].includes(kind)) {
      return json(req, { error: "Tipo de imagem inválido." }, 400);
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return json(req, { error: "Use uma imagem JPG, PNG, WebP ou AVIF." }, 415);
    }
    if (file.size > MAX_FILE_SIZE) {
      return json(req, { error: "A imagem deve ter no máximo 5 MB." }, 413);
    }
    if (!(await verifyMaster(campaignId, masterToken))) {
      return json(req, { error: "Acesso do mestre inválido ou expirado." }, 403);
    }

    const imageKit = await uploadToImageKit(file, campaignId, kind);
    let driveFileId: string | null = null;
    let backupStatus = "completed";
    let warning: string | null = null;

    try {
      driveFileId = await uploadToDrive(file, imageKit.fileName);
    } catch (error) {
      console.error("Google Drive backup failed", error);
      backupStatus = "failed";
      warning =
        "Imagem salva no ImageKit, mas o backup no Google Drive falhou.";
    }

    return json(req, {
      url: imageKit.url,
      imagekitFileId: imageKit.fileId,
      driveFileId,
      backupStatus,
      warning,
    });
  } catch (error) {
    console.error(error);
    return json(req, {
      error: error instanceof Error
        ? error.message
        : "Não foi possível enviar a imagem.",
    }, 500);
  }
});
