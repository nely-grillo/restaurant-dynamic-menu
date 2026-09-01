/*
  Cliente mínimo para a REST API do GitHub (Contents API), usado pelo painel
  admin para ler e escrever config.json / menu.json / imagens diretamente no
  repositório. Nenhuma outra parte do site (cardápio público) depende deste
  arquivo — ele só é carregado por admin/admin.js.

  Autenticação: PAT fine-grained enviado pelo próprio chamador em cada
  função (nunca é lido de armazenamento aqui). O escopo mínimo necessário é
  "Contents: Read and write" no repositório do projeto.
*/

const API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';

class GitHubApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
  };
}

async function request(token, method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...authHeaders(token),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).message || '';
    } catch {
      /* corpo sem JSON, ignora */
    }
    throw new GitHubApiError(
      `GitHub API ${method} ${path} falhou (${res.status}): ${detail}`,
      res.status
    );
  }

  if (res.status === 204) return null;
  return res.json();
}

/** UTF-8 seguro: string -> base64 (necessário por causa de acentos/ç). */
function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/** UTF-8 seguro: base64 (como vem da Contents API) -> string. */
function base64ToText(base64) {
  const binary = atob(base64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Confirma que o token é válido e tem acesso ao repo; retorna a branch padrão. */
export async function getRepoInfo(token, owner, repo) {
  const data = await request(token, 'GET', `/repos/${owner}/${repo}`);
  return { defaultBranch: data.default_branch, fullName: data.full_name };
}

/** Lista o conteúdo de uma pasta do repositório (usado para listar restaurantes). */
export async function listDir(token, owner, repo, path, ref) {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const data = await request(token, 'GET', `/repos/${owner}/${repo}/contents/${path}${query}`);
  return Array.isArray(data) ? data : [data];
}

/**
 * Busca um arquivo de texto (JSON) do repositório.
 * Retorna null se o arquivo não existir (404), para permitir tratar
 * "restaurante novo sem menu.json ainda" sem lançar exceção.
 */
export async function getFile(token, owner, repo, path, ref) {
  try {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const data = await request(token, 'GET', `/repos/${owner}/${repo}/contents/${path}${query}`);
    return { content: base64ToText(data.content), sha: data.sha };
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Cria ou atualiza um arquivo de texto via commit.
 * Passe `sha` quando o arquivo já existir (obtido via getFile); omita para criar um novo.
 */
export async function putFile(token, owner, repo, path, content, message, sha, branch) {
  return request(token, 'PUT', `/repos/${owner}/${repo}/contents/${path}`, {
    message,
    content: textToBase64(content),
    sha: sha || undefined,
    branch: branch || undefined,
  });
}

/** Envia um arquivo binário (imagem) a partir de um base64 já sem o prefixo data:*. */
export async function putBinaryFile(token, owner, repo, path, base64Content, message, sha, branch) {
  return request(token, 'PUT', `/repos/${owner}/${repo}/contents/${path}`, {
    message,
    content: base64Content,
    sha: sha || undefined,
    branch: branch || undefined,
  });
}

export async function deleteFile(token, owner, repo, path, message, sha, branch) {
  return request(token, 'DELETE', `/repos/${owner}/${repo}/contents/${path}`, {
    message,
    sha,
    branch: branch || undefined,
  });
}

export { GitHubApiError };
