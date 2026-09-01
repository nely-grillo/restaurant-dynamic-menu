/*
  Renderização do cardápio público a partir de config.json + menu.json.
  Usado por restaurants/{slug}/index.html. Não depende de github-api.js —
  o site público só lê arquivos estáticos via fetch, nunca escreve nada.
*/

/** Aplica cores/fonte do restaurante como CSS variables em :root. */
export function applyTheme(config) {
  const tema = config.tema || {};
  const root = document.documentElement.style;
  if (tema.corPrimaria) root.setProperty('--cor-primaria', tema.corPrimaria);
  if (tema.corSecundaria) root.setProperty('--cor-secundaria', tema.corSecundaria);
  if (tema.corTexto) root.setProperty('--cor-texto', tema.corTexto);
  if (tema.fonte) root.setProperty('--fonte', tema.fonte);
  if (config.nome) document.title = config.nome;
}

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function criarCardPrato(prato, config) {
  const card = document.createElement('article');
  card.className = 'prato-card';

  const img = document.createElement('img');
  img.className = 'prato-card__imagem';
  img.alt = prato.nome || 'Prato';
  img.loading = 'lazy';
  // Sem imagem própria -> usa a logo do restaurante direto, sem tentar carregar um src vazio.
  img.src = prato.imagem || config.logo || '';
  img.onerror = () => {
    img.onerror = null;
    img.src = config.logo || '';
  };
  card.appendChild(img);

  const corpo = document.createElement('div');
  corpo.className = 'prato-card__corpo';

  const nome = document.createElement('h3');
  nome.className = 'prato-card__nome';
  nome.textContent = prato.nome;
  corpo.appendChild(nome);

  if (prato.descricao) {
    const desc = document.createElement('p');
    desc.className = 'prato-card__descricao';
    desc.textContent = prato.descricao;
    corpo.appendChild(desc);
  }

  const preco = document.createElement('p');
  preco.className = 'prato-card__preco';
  preco.textContent = formatarPreco(prato.preco);
  corpo.appendChild(preco);

  card.appendChild(corpo);
  return card;
}

/** Agrupa pratos disponíveis por categoria, na ordem definida em config.categorias. */
function agruparPorCategoria(pratos, categorias) {
  const grupos = new Map(categorias.map((c) => [c, []]));
  pratos
    .filter((p) => p.disponivel)
    .forEach((p) => {
      const chave = grupos.has(p.categoria) ? p.categoria : 'Outros';
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(p);
    });
  return grupos;
}

/**
 * Monta o cardápio completo (header, banner opcional, categorias e cards)
 * dentro do elemento `root`.
 */
export function renderMenu(config, menu, root) {
  applyTheme(config);
  root.innerHTML = '';

  if (config.banner) {
    const banner = document.createElement('img');
    banner.className = 'restaurante-banner';
    banner.alt = '';
    banner.src = config.banner;
    // Elemento puramente decorativo: se falhar, apenas remove, sem fallback.
    banner.onerror = () => banner.remove();
    root.appendChild(banner);
  }

  const header = document.createElement('header');
  header.className = 'restaurante-header';
  if (config.logo) {
    const logo = document.createElement('img');
    logo.className = 'restaurante-header__logo';
    logo.src = config.logo;
    logo.alt = config.nome || '';
    header.appendChild(logo);
  }
  const texto = document.createElement('div');
  texto.className = 'restaurante-header__texto';
  const h1 = document.createElement('h1');
  h1.textContent = config.nome || '';
  texto.appendChild(h1);
  if (config.descricao) {
    const p = document.createElement('p');
    p.textContent = config.descricao;
    texto.appendChild(p);
  }
  header.appendChild(texto);
  root.appendChild(header);

  const pratos = (menu && menu.pratos) || [];
  const categorias = config.categorias || [];
  const grupos = agruparPorCategoria(pratos, categorias);
  const temAlgumPrato = [...grupos.values()].some((lista) => lista.length > 0);

  if (!temAlgumPrato) {
    const vazio = document.createElement('p');
    vazio.className = 'estado-vazio';
    vazio.textContent = 'Nenhum prato disponível no momento.';
    root.appendChild(vazio);
  } else {
    for (const [categoria, lista] of grupos) {
      if (lista.length === 0) continue;
      const secao = document.createElement('section');
      secao.className = 'categoria';

      const titulo = document.createElement('h2');
      titulo.className = 'categoria__titulo';
      titulo.textContent = categoria;
      secao.appendChild(titulo);

      const grid = document.createElement('div');
      grid.className = 'pratos-grid';
      lista.forEach((prato) => grid.appendChild(criarCardPrato(prato, config)));
      secao.appendChild(grid);

      root.appendChild(secao);
    }
  }

  const rodape = document.createElement('p');
  rodape.className = 'rodape';
  rodape.textContent = config.nome || '';
  root.appendChild(rodape);
}

const INTERVALO_VERIFICACAO_MS = 60_000;

// Query string única a cada chamada: evita que o CDN do GitHub Pages ou o
// cache do navegador sirvam uma versão antiga de config.json/menu.json
// durante a verificação periódica.
function buscarDados() {
  const cacheBuster = `?_=${Date.now()}`;
  return Promise.all([
    fetch(`./config.json${cacheBuster}`, { cache: 'no-store' }).then((r) => r.json()),
    fetch(`./menu.json${cacheBuster}`, { cache: 'no-store' }).then((r) => r.json()),
  ]);
}

function criarAvisoAtualizacao(root, onClick) {
  const aviso = document.createElement('button');
  aviso.type = 'button';
  aviso.className = 'aviso-atualizacao';
  aviso.textContent = 'Cardápio atualizado — toque para ver as novidades';
  aviso.addEventListener('click', onClick);
  root.prepend(aviso);
  return aviso;
}

/**
 * Busca config.json + menu.json relativos à página atual e renderiza no
 * elemento root. Depois de carregado, passa a verificar periodicamente se
 * houve mudança (cliente com a aba já aberta) e mostra um aviso clicável em
 * vez de re-renderizar sozinho, para não interromper quem já está lendo.
 */
export async function carregarERenderizarCardapio(root) {
  let dadosAtuais;
  try {
    const [config, menu] = await buscarDados();
    dadosAtuais = { config, menu };
    renderMenu(config, menu, root);
  } catch (err) {
    root.innerHTML = '';
    const erro = document.createElement('p');
    erro.className = 'estado-erro';
    erro.textContent = 'Não foi possível carregar o cardápio no momento.';
    root.appendChild(erro);
    console.error('Erro ao carregar cardápio:', err);
    return;
  }

  let aviso = null;
  let dadosPendentes = null;

  setInterval(async () => {
    try {
      const [config, menu] = await buscarDados();
      const dadosNovos = { config, menu };
      if (JSON.stringify(dadosNovos) === JSON.stringify(dadosPendentes || dadosAtuais)) return;

      dadosPendentes = dadosNovos;
      if (!aviso) {
        aviso = criarAvisoAtualizacao(root, () => {
          renderMenu(dadosPendentes.config, dadosPendentes.menu, root);
          dadosAtuais = dadosPendentes;
          dadosPendentes = null;
          aviso = null;
        });
      }
    } catch (err) {
      // Falha silenciosa: mantém o cardápio já carregado na tela e tenta de novo no próximo ciclo.
      console.error('Erro ao verificar atualização do cardápio:', err);
    }
  }, INTERVALO_VERIFICACAO_MS);
}
