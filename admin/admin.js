/*
  Lógica do painel administrativo: autenticação com PAT do GitHub, seleção de
  restaurante, listagem/edição/exclusão de pratos e commits via Contents API.
  Toda a comunicação com o GitHub passa por ../shared/github-api.js.

  Estado de sessão (token, owner, repo, branch) fica em sessionStorage — nunca
  em um arquivo do repositório e nunca em localStorage (some ao fechar a aba).
*/
import {
  getRepoInfo,
  listDir,
  getFile,
  putFile,
  putBinaryFile,
  GitHubApiError,
} from '../shared/github-api.js';

const SESSION_KEY = 'cardapio-admin-sessao';
const RESTAURANTS_DIR = 'restaurants';
const TEMPLATE_SLUG = '_template';

const state = {
  token: null,
  owner: null,
  repo: null,
  branch: null,
  restaurantes: [],
  slugAtual: null,
  config: null,
  menu: null,
  menuSha: null,
};

const el = {
  telaLogin: document.getElementById('tela-login'),
  telaPainel: document.getElementById('tela-painel'),
  formLogin: document.getElementById('form-login'),
  inputOwner: document.getElementById('input-owner'),
  inputRepo: document.getElementById('input-repo'),
  inputToken: document.getElementById('input-token'),
  loginErro: document.getElementById('login-erro'),
  selectRestaurante: document.getElementById('select-restaurante'),
  btnLogout: document.getElementById('btn-logout'),
  status: document.getElementById('status'),
  listaPratos: document.getElementById('lista-pratos'),
  btnNovoPrato: document.getElementById('btn-novo-prato'),
  modal: document.getElementById('modal-prato'),
  formPrato: document.getElementById('form-prato'),
  formPratoTitulo: document.getElementById('form-prato-titulo'),
  pratoId: document.getElementById('prato-id'),
  pratoNome: document.getElementById('prato-nome'),
  pratoDescricao: document.getElementById('prato-descricao'),
  pratoPreco: document.getElementById('prato-preco'),
  pratoCategoria: document.getElementById('prato-categoria'),
  pratoImagemUrl: document.getElementById('prato-imagem-url'),
  pratoImagemArquivo: document.getElementById('prato-imagem-arquivo'),
  pratoDisponivel: document.getElementById('prato-disponivel'),
  btnCancelarPrato: document.getElementById('btn-cancelar-prato'),
};

/** Em https://{owner}.github.io/{repo}/... tenta pré-preencher owner/repo do login. */
function detectarOwnerRepo() {
  const host = window.location.hostname;
  const match = host.match(/^([^.]+)\.github\.io$/);
  if (!match) return null;
  const owner = match[1];
  const primeiroSegmento = window.location.pathname.split('/').filter(Boolean)[0];
  const repo = primeiroSegmento || `${owner}.github.io`;
  return { owner, repo };
}

function setStatus(mensagem, tipo) {
  if (!mensagem) {
    el.status.hidden = true;
    return;
  }
  el.status.hidden = false;
  el.status.textContent = mensagem;
  el.status.className = `status ${tipo ? `status--${tipo}` : ''}`.trim();
}

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function gerarIdPrato() {
  return `${state.slugAtual}-${Date.now()}`;
}

// --- Sessão ---------------------------------------------------------------

function salvarSessao() {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ token: state.token, owner: state.owner, repo: state.repo, branch: state.branch })
  );
}

function restaurarSessao() {
  const bruto = sessionStorage.getItem(SESSION_KEY);
  if (!bruto) return false;
  try {
    const sessao = JSON.parse(bruto);
    Object.assign(state, sessao);
    return Boolean(state.token && state.owner && state.repo);
  } catch {
    return false;
  }
}

function limparSessao() {
  sessionStorage.removeItem(SESSION_KEY);
  Object.assign(state, {
    token: null,
    owner: null,
    repo: null,
    branch: null,
    restaurantes: [],
    slugAtual: null,
    config: null,
    menu: null,
    menuSha: null,
  });
}

// --- Login ------------------------------------------------------------

async function handleLogin(event) {
  event.preventDefault();
  el.loginErro.hidden = true;

  const owner = el.inputOwner.value.trim();
  const repo = el.inputRepo.value.trim();
  const token = el.inputToken.value.trim();

  const botao = el.formLogin.querySelector('button[type="submit"]');
  botao.disabled = true;
  try {
    const info = await getRepoInfo(token, owner, repo);
    Object.assign(state, { token, owner, repo, branch: info.defaultBranch });
    salvarSessao();
    await entrarNoPainel();
  } catch (err) {
    el.loginErro.hidden = false;
    el.loginErro.textContent =
      err instanceof GitHubApiError
        ? 'Não foi possível validar o token/repositório. Verifique os dados e as permissões do PAT.'
        : 'Erro de rede ao contatar o GitHub.';
    console.error(err);
  } finally {
    botao.disabled = false;
  }
}

function logout() {
  limparSessao();
  el.telaPainel.hidden = true;
  el.telaLogin.hidden = false;
  el.formLogin.reset();
}

// --- Painel principal ------------------------------------------------------

async function entrarNoPainel() {
  el.telaLogin.hidden = true;
  el.telaPainel.hidden = false;
  await carregarListaRestaurantes();
}

async function carregarListaRestaurantes() {
  setStatus('Carregando restaurantes...', 'carregando');
  try {
    const itens = await listDir(state.token, state.owner, state.repo, RESTAURANTS_DIR, state.branch);
    state.restaurantes = itens
      .filter((item) => item.type === 'dir' && item.name !== TEMPLATE_SLUG)
      .map((item) => item.name)
      .sort();

    el.selectRestaurante.innerHTML = state.restaurantes
      .map((slug) => `<option value="${slug}">${slug}</option>`)
      .join('');

    setStatus('', null);
    if (state.restaurantes.length > 0) {
      await selecionarRestaurante(state.restaurantes[0]);
    } else {
      el.listaPratos.innerHTML = '<li>Nenhum restaurante cadastrado ainda.</li>';
    }
  } catch (err) {
    setStatus('Erro ao listar restaurantes.', 'erro');
    console.error(err);
  }
}

async function selecionarRestaurante(slug) {
  state.slugAtual = slug;
  el.selectRestaurante.value = slug;
  setStatus('Carregando cardápio...', 'carregando');
  try {
    const caminhoConfig = `${RESTAURANTS_DIR}/${slug}/config.json`;
    const caminhoMenu = `${RESTAURANTS_DIR}/${slug}/menu.json`;

    const arquivoConfig = await getFile(state.token, state.owner, state.repo, caminhoConfig, state.branch);
    const arquivoMenu = await getFile(state.token, state.owner, state.repo, caminhoMenu, state.branch);

    state.config = arquivoConfig ? JSON.parse(arquivoConfig.content) : { categorias: [] };
    state.menu = arquivoMenu ? JSON.parse(arquivoMenu.content) : { pratos: [] };
    state.menuSha = arquivoMenu ? arquivoMenu.sha : null;

    preencherSelectCategorias();
    renderizarPratos();
    setStatus('', null);
  } catch (err) {
    setStatus('Erro ao carregar dados do restaurante.', 'erro');
    console.error(err);
  }
}

function preencherSelectCategorias() {
  const categorias = state.config.categorias || [];
  el.pratoCategoria.innerHTML = categorias.map((c) => `<option value="${c}">${c}</option>`).join('');
}

function renderizarPratos() {
  const pratos = state.menu.pratos || [];
  if (pratos.length === 0) {
    el.listaPratos.innerHTML = '<li>Nenhum prato cadastrado.</li>';
    return;
  }

  el.listaPratos.innerHTML = '';
  pratos.forEach((prato) => {
    const item = document.createElement('li');
    item.className = 'item-prato';
    item.innerHTML = `
      <label class="switch">
        <input type="checkbox" ${prato.disponivel ? 'checked' : ''} data-id="${prato.id}" class="toggle-disponivel" />
        <span class="switch__trilho"></span>
      </label>
      <div class="item-prato__info">
        <div class="item-prato__nome">${prato.nome}</div>
        <div class="item-prato__meta">${prato.categoria} · ${formatarPreco(prato.preco)}</div>
      </div>
      <div class="item-prato__acoes">
        <button type="button" class="botao-secundario btn-editar" data-id="${prato.id}">Editar</button>
        <button type="button" class="botao-secundario btn-excluir" data-id="${prato.id}">Excluir</button>
      </div>
    `;
    el.listaPratos.appendChild(item);
  });
}

// --- Persistência do menu.json ---------------------------------------------

async function salvarMenu(mensagemCommit) {
  setStatus('Salvando...', 'carregando');
  const caminhoMenu = `${RESTAURANTS_DIR}/${state.slugAtual}/menu.json`;
  const conteudo = JSON.stringify(state.menu, null, 2) + '\n';
  try {
    const resultado = await putFile(
      state.token,
      state.owner,
      state.repo,
      caminhoMenu,
      conteudo,
      mensagemCommit,
      state.menuSha,
      state.branch
    );
    state.menuSha = resultado.content.sha;
    renderizarPratos();
    setStatus('Alterações salvas.', 'sucesso');
  } catch (err) {
    setStatus('Erro ao salvar. Recarregue o restaurante e tente novamente.', 'erro');
    console.error(err);
  }
}

async function alternarDisponibilidade(id, disponivel) {
  const prato = state.menu.pratos.find((p) => p.id === id);
  if (!prato) return;
  prato.disponivel = disponivel;
  prato.atualizadoEm = new Date().toISOString();
  await salvarMenu(`admin: atualiza disponibilidade de ${prato.nome}`);
}

async function excluirPrato(id) {
  const prato = state.menu.pratos.find((p) => p.id === id);
  if (!prato) return;
  if (!window.confirm(`Excluir "${prato.nome}"? Essa ação não pode ser desfeita.`)) return;
  state.menu.pratos = state.menu.pratos.filter((p) => p.id !== id);
  await salvarMenu(`admin: remove ${prato.nome}`);
}

// --- Formulário de prato (criar/editar) -------------------------------------

function abrirFormulario(prato) {
  el.formPrato.reset();
  el.pratoImagemArquivo.value = '';

  if (prato) {
    el.formPratoTitulo.textContent = 'Editar prato';
    el.pratoId.value = prato.id;
    el.pratoNome.value = prato.nome || '';
    el.pratoDescricao.value = prato.descricao || '';
    el.pratoPreco.value = prato.preco ?? '';
    el.pratoCategoria.value = prato.categoria || '';
    el.pratoImagemUrl.value = prato.imagem || '';
    el.pratoDisponivel.checked = Boolean(prato.disponivel);
  } else {
    el.formPratoTitulo.textContent = 'Novo prato';
    el.pratoId.value = '';
    el.pratoDisponivel.checked = true;
  }

  el.modal.hidden = false;
}

function fecharFormulario() {
  el.modal.hidden = true;
}

function fileParaBase64SemPrefixo(file) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(',')[1]);
    leitor.onerror = reject;
    leitor.readAsDataURL(file);
  });
}

async function handleSubmitFormulario(event) {
  event.preventDefault();
  const botao = el.formPrato.querySelector('button[type="submit"]');
  botao.disabled = true;

  try {
    let imagem = el.pratoImagemUrl.value.trim();
    const arquivo = el.pratoImagemArquivo.files[0];

    if (arquivo) {
      setStatus('Enviando imagem...', 'carregando');
      const extensao = arquivo.name.split('.').pop();
      const caminhoImagem = `${RESTAURANTS_DIR}/${state.slugAtual}/assets/${gerarIdPrato()}.${extensao}`;
      const base64 = await fileParaBase64SemPrefixo(arquivo);
      await putBinaryFile(
        state.token,
        state.owner,
        state.repo,
        caminhoImagem,
        base64,
        `admin: envia imagem para ${el.pratoNome.value.trim()}`,
        undefined,
        state.branch
      );
      imagem = `assets/${caminhoImagem.split('/').pop()}`;
    }

    const idExistente = el.pratoId.value;
    const dadosPrato = {
      id: idExistente || gerarIdPrato(),
      nome: el.pratoNome.value.trim(),
      descricao: el.pratoDescricao.value.trim(),
      preco: Number(el.pratoPreco.value),
      categoria: el.pratoCategoria.value,
      imagem,
      disponivel: el.pratoDisponivel.checked,
      atualizadoEm: new Date().toISOString(),
    };

    if (idExistente) {
      const indice = state.menu.pratos.findIndex((p) => p.id === idExistente);
      if (indice >= 0) state.menu.pratos[indice] = dadosPrato;
    } else {
      state.menu.pratos.push(dadosPrato);
    }

    fecharFormulario();
    await salvarMenu(`admin: ${idExistente ? 'edita' : 'cria'} ${dadosPrato.nome}`);
  } catch (err) {
    setStatus('Erro ao salvar o prato.', 'erro');
    console.error(err);
  } finally {
    botao.disabled = false;
  }
}

// --- Eventos -----------------------------------------------------------

el.formLogin.addEventListener('submit', handleLogin);
el.btnLogout.addEventListener('click', logout);
el.selectRestaurante.addEventListener('change', (e) => selecionarRestaurante(e.target.value));
el.btnNovoPrato.addEventListener('click', () => abrirFormulario(null));
el.btnCancelarPrato.addEventListener('click', fecharFormulario);
el.formPrato.addEventListener('submit', handleSubmitFormulario);

el.listaPratos.addEventListener('change', (e) => {
  if (e.target.classList.contains('toggle-disponivel')) {
    alternarDisponibilidade(e.target.dataset.id, e.target.checked);
  }
});

el.listaPratos.addEventListener('click', (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  if (e.target.classList.contains('btn-editar')) {
    abrirFormulario(state.menu.pratos.find((p) => p.id === id));
  } else if (e.target.classList.contains('btn-excluir')) {
    excluirPrato(id);
  }
});

// --- Inicialização -------------------------------------------------------

(function init() {
  const detectado = detectarOwnerRepo();
  if (detectado) {
    el.inputOwner.value = detectado.owner;
    el.inputRepo.value = detectado.repo;
  }

  if (restaurarSessao()) {
    entrarNoPainel();
  }
})();
