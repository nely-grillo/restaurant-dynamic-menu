# Especificação de Projeto: Cardápio Dinâmico Multi-Restaurante (GitHub Pages)

> Cole este documento inteiro como prompt inicial para o assistente de código (Copilot Chat, Claude Code, etc.) dentro do VSCode. Ele contém todo o contexto necessário para gerar o projeto do zero.

## 1. Contexto e restrição fundamental

O site será hospedado no **GitHub Pages**, que serve apenas **arquivos estáticos** (HTML/CSS/JS). Não há servidor, não há linguagem back-end (PHP, Node, Python) rodando, e não há banco de dados relacional/não relacional tradicional.

Por isso, os dados do cardápio (pratos, disponibilidade, config visual) serão armazenados como **arquivos JSON versionados no próprio repositório Git**. O Git funciona como a "camada de persistência". Não usar nenhum serviço externo (sem Firebase, sem Netlify CMS/Decap com OAuth externo, sem banco em nuvem). Tudo deve viver dentro do repositório do GitHub.

A edição administrativa é feita por um **painel HTML/JS que se comunica diretamente com a API REST do GitHub** (`https://api.github.com/repos/...`), lendo e escrevendo os arquivos JSON via commits automáticos. A autenticação de escrita é feita com um **Personal Access Token (PAT) do GitHub, fine-grained, com escopo restrito a este repositório** (permissão apenas de leitura/escrita de "Contents"). O token é digitado pelo administrador a cada sessão e fica apenas em memória/`sessionStorage` do navegador — nunca é salvo em nenhum arquivo do repositório.

**Importante sobre segurança:** o painel `/admin` é uma página pública (qualquer um pode acessar a URL), mas sem um PAT válido com permissão de escrita no repositório, nenhuma alteração pode ser salva — a própria API do GitHub rejeita a requisição. Ou seja, a segurança real está no token, não em esconder a página. Adicionar uma tela de login simples (campo para colar o token) antes de exibir o painel.

## 2. Stack tecnológica

- HTML, CSS e JavaScript puro (vanilla), sem frameworks, sem etapa de build/bundler.
- Sem dependências de npm obrigatórias (pode usar bibliotecas via CDN se necessário, mas evitar).
- Compatível com GitHub Pages "as is": basta dar push que o site já funciona.

## 3. Estrutura de pastas do repositório

```
/
├── index.html                    → página interna/institucional (ex: "site em construção" ou link genérico do projeto). NÃO deve listar nem linkar os restaurantes cadastrados — cada restaurante é acessado diretamente pela sua própria URL (`/restaurants/{slug}/`) através de um QR code impresso na mesa/cardápio físico, sem navegação cruzada entre restaurantes
├── restaurants/
│   ├── restaurante-exemplo/
│   │   ├── index.html            → cardápio público deste restaurante
│   │   ├── config.json           → nome, logo, cores, fontes, textos
│   │   ├── menu.json             → lista de pratos deste restaurante
│   │   └── assets/
│   │       └── logo.png
│   └── outro-restaurante/
│       ├── index.html
│       ├── config.json
│       ├── menu.json
│       └── assets/
├── admin/
│   ├── index.html                → painel administrativo (login + seleção de restaurante)
│   ├── admin.js                  → lógica de autenticação e chamadas à API do GitHub
│   └── admin.css
├── shared/
│   ├── menu-renderer.js          → função reutilizável que lê config.json + menu.json e monta o HTML do cardápio
│   ├── theme.css                 → estilos base usando CSS variables (sobrescritas por config.json de cada restaurante)
│   └── github-api.js             → funções genéricas: getFile(path), updateFile(path, content, sha)
└── README.md                     → instruções de uso e de como adicionar um novo restaurante
```

## 4. Modelo de dados

### `config.json` (um por restaurante)
```json
{
  "slug": "restaurante-exemplo",
  "nome": "Restaurante Exemplo",
  "descricao": "Comida caseira todos os dias",
  "logo": "assets/logo.png",
  "banner": "assets/banner.jpg",
  "tema": {
    "corPrimaria": "#8B0000",
    "corSecundaria": "#FFF8E7",
    "corTexto": "#222222",
    "fonte": "'Poppins', sans-serif"
  },
  "categorias": ["Entradas", "Pratos principais", "Sobremesas", "Bebidas"]
}
```

### `menu.json` (um por restaurante)
```json
{
  "pratos": [
    {
      "id": "prato-0001",
      "nome": "Feijoada",
      "descricao": "Feijoada completa com acompanhamentos",
      "preco": 45.90,
      "categoria": "Pratos principais",
      "imagem": "assets/feijoada.jpg",
      "disponivel": true,
      "atualizadoEm": "2026-08-31T12:00:00Z"
    }
  ]
}
```

Campos obrigatórios: `id` (gerado automaticamente, ex: slug + timestamp), `nome`, `preco`, `categoria`, `disponivel`. Os demais são opcionais.

No `config.json`, o campo `banner` também é opcional: se não for preenchido (ou o arquivo não existir), a página do restaurante simplesmente não exibe a faixa/banner no topo — sem imagem quebrada e sem fallback nesse caso, pois é um elemento puramente decorativo.

## 5. Funcionalidades do site público (`restaurants/{slug}/index.html`)

- Carrega `config.json` e `menu.json` via `fetch` (caminho relativo).
- Aplica tema (cores, fonte, logo, nome) via CSS variables definidas em JS a partir do `config.json`.
- Exibe apenas os pratos com `disponivel: true`, agrupados por `categoria`.
- Layout responsivo (mobile-first), cards com imagem, nome, descrição e preço formatado em R$.
- **Imagem do prato:** se o campo `imagem` do prato estiver vazio ou o arquivo não carregar (evento `onerror` da tag `<img>`), exibir a **logo do restaurante** (`config.json → logo`) como imagem de fallback no lugar da foto do prato, para o card nunca ficar com espaço vazio ou ícone de imagem quebrada.
- **Banner do restaurante:** se `config.json → banner` estiver preenchido, exibir uma faixa/imagem de destaque no topo da página, acima da lista de pratos (ex: foto do salão, da fachada ou de um prato principal). Se o campo não existir ou estiver vazio, a página é renderizada normalmente sem essa faixa — não usar nenhuma imagem de fallback aqui, já que é elemento opcional/decorativo, não essencial como o card do prato.
- Sem nenhum link visível de admin, nem link para outros restaurantes ou para o `index.html` raiz (o acesso é feito diretamente pela URL via QR code — não deve existir navegação que exponha a lista de restaurantes cadastrados).

## 6. Funcionalidades do painel administrativo (`/admin`)

1. **Login:** campo para colar o GitHub PAT (fine-grained, escopo do repositório). Validar o token fazendo uma chamada simples à API (ex: buscar o próprio repositório) antes de liberar o painel.
2. **Seleção do restaurante:** dropdown lendo as pastas existentes em `restaurants/`.
3. **Lista de pratos** do restaurante selecionado, com:
   - Toggle (checkbox/switch) para marcar `disponivel` true/false — ação rápida do dia a dia.
   - Botões de editar e excluir cada prato.
4. **Cadastro de novo prato:** formulário com nome, descrição, preço, categoria (select vindo de `config.json`), imagem (URL, ou upload que salva o arquivo em `assets/` via API do GitHub) e disponibilidade inicial.
5. **Edição de prato existente:** mesmo formulário, pré-preenchido.
6. **Salvar:** cada ação de salvar/editar/excluir/toggle deve:
   - Buscar o `menu.json` atual via API do GitHub (`GET /repos/{owner}/{repo}/contents/{path}`) para pegar o `sha` mais recente.
   - Atualizar o JSON em memória.
   - Fazer commit da nova versão via `PUT /repos/{owner}/{repo}/contents/{path}` com mensagem de commit descritiva (ex: `"admin: atualiza disponibilidade de Feijoada"`).
7. **Gestão de configuração visual (opcional, fase 2):** editar cores/nome/logo do restaurante direto pelo painel, escrevendo em `config.json`.
8. **Feedback visual:** indicar loading durante commits, sucesso/erro após cada ação.
9. **Logout:** botão para limpar o token da sessão.

## 7. Como adicionar um novo restaurante (documentar no README)

1. Duplicar a pasta `restaurants/_template/` (criar uma pasta modelo com `config.json` e `menu.json` vazios/de exemplo).
2. Renomear para o slug do novo restaurante.
3. Editar `config.json` com nome, cores e categorias.
4. O restaurante aparece automaticamente no painel admin e pode ser acessado em `/restaurants/{slug}/`.

## 8. Requisitos não funcionais

- Código comentado e organizado por responsabilidade (renderização, tema, API do GitHub, UI do admin).
- Sem bibliotecas pesadas; priorizar carregamento rápido.
- Acessibilidade básica: contraste adequado, `alt` em imagens, navegação por teclado no admin.
- Compatibilidade com os principais navegadores atuais (Chrome, Firefox, Safari, Edge).

## 9. Passo a passo de deploy (documentar no README)

1. Criar repositório no GitHub e subir o projeto.
2. Em Settings → Pages, configurar a branch `main` (ou `gh-pages`) como fonte, pasta raiz `/`.
3. Gerar um PAT fine-grained em github.com/settings/tokens com acesso apenas a este repositório e permissão "Contents: Read and write".
4. Acessar `/admin` no site publicado, colar o token e começar a editar.

## 10. O que peço ao assistente de código

- Gerar toda a estrutura de pastas e arquivos acima.
- Implementar `shared/github-api.js` com funções genéricas `getFile`, `updateFile`, `createFile` reutilizáveis pelo admin.
- Implementar `shared/menu-renderer.js` para renderizar o cardápio a partir dos JSONs.
- Criar um restaurante de exemplo (`restaurants/exemplo/`) com 5-6 pratos fictícios para eu poder testar visualmente.
- Criar a pasta `restaurants/_template/` com JSONs vazios/modelo para facilitar a criação de novos restaurantes.
- Escrever o `README.md` com as instruções das seções 7 e 9 acima.
- Não usar frameworks, bundlers ou dependências externas além do estritamente necessário.
