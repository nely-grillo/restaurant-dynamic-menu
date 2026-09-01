# Cardápio Dinâmico Multi-Restaurante

Site estático (GitHub Pages) que publica o cardápio de vários restaurantes,
cada um em sua própria URL (`/restaurants/{slug}/`), acessada via QR code na
mesa. Não há back-end nem banco de dados: os dados (`config.json` e
`menu.json`) ficam versionados no próprio repositório Git, e um painel em
`/admin` escreve neles diretamente via API REST do GitHub, autenticado com um
Personal Access Token digitado pelo administrador a cada sessão.

Veja [`especificacao-cardapio-dinamico.md`](especificacao-cardapio-dinamico.md)
para o desenho completo do projeto, e [`CLAUDE.md`](CLAUDE.md) para o guia de
arquitetura usado por assistentes de IA para evoluir o código.

## Estrutura

```
/
├── index.html                 → página institucional (não lista restaurantes)
├── restaurants/
│   ├── exemplo/                → restaurante de demonstração
│   ├── _template/               → modelo para novos restaurantes
│   └── {slug}/
│       ├── index.html
│       ├── config.json
│       ├── menu.json
│       └── assets/
├── admin/                       → painel administrativo (login + CRUD de pratos)
└── shared/                      → código reutilizado pelo site público e pelo admin
```

## Rodando localmente

Como as páginas usam `fetch` e `<script type="module">`, é preciso servir os
arquivos por HTTP (não funciona abrindo o `.html` direto do disco). Qualquer
servidor estático simples resolve, por exemplo:

```bash
python3 -m http.server 8000
# depois acesse http://localhost:8000/restaurants/exemplo/
```

O painel `/admin` também funciona em `localhost` normalmente — basta informar
manualmente o "dono" e o "nome" do repositório na tela de login (a
autodetecção pelo hostname só funciona em `*.github.io`).

## Como adicionar um novo restaurante

1. Duplique a pasta `restaurants/_template/`.
2. Renomeie a cópia para o slug do novo restaurante (ex: `restaurants/pizza-do-joao/`).
3. Edite o `config.json` da nova pasta: `nome`, `descricao`, `logo`, `tema` (cores/fonte) e `categorias`.
4. Se houver logo, coloque o arquivo em `assets/` e aponte o campo `logo` do `config.json` para ele.
5. Faça commit e push. O restaurante passa a existir em `/restaurants/{slug}/`
   e aparece automaticamente no dropdown do painel admin (que lista as pastas
   dentro de `restaurants/`).
6. Gere um QR code apontando para a URL publicada do restaurante e imprima na mesa/cardápio físico.

Não é necessário mexer em nenhum outro arquivo do projeto — `index.html`,
`admin/` e `shared/` são genéricos e servem qualquer restaurante cadastrado.

## Deploy no GitHub Pages

1. Crie um repositório no GitHub e suba este projeto (`git push`).
2. Em **Settings → Pages**, configure a branch `main` (ou `gh-pages`) como
   fonte, com a pasta raiz (`/`) selecionada.
3. Gere um Personal Access Token **fine-grained** em
   [github.com/settings/tokens](https://github.com/settings/tokens):
   - **Repository access:** apenas este repositório.
   - **Permissions:** `Contents` → `Read and write`.
4. Acesse `/admin` no site publicado, cole o dono/repositório e o token, e
   comece a editar. O token não é salvo em nenhum arquivo — fica apenas na
   memória da aba enquanto ela estiver aberta (`sessionStorage`).

## Segurança

O painel `/admin` é uma página pública: qualquer pessoa pode abrir a URL, mas
sem um PAT válido com permissão de escrita no repositório nenhuma alteração é
aceita — a própria API do GitHub rejeita a requisição. A segurança está no
token, não em esconder a página.
