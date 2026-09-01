# Guia de arquitetura (para assistentes de IA)

Este arquivo existe para que futuras sessões de IA consigam evoluir o projeto
rapidamente e com segurança, sem precisar reler todo o código toda vez. A
especificação original e completa está em
[`especificacao-cardapio-dinamico.md`](especificacao-cardapio-dinamico.md) —
este documento é um resumo operacional, não a substitui.

## Restrição fundamental (não negociável)

O site roda no GitHub Pages: **só arquivos estáticos**. Não introduzir build
step, bundler, framework, dependências npm obrigatórias, back-end ou banco de
dados externo. Qualquer sugestão de mudança que exija um desses itens deve ser
recusada ou levada de volta ao usuário antes de implementar — é uma restrição
de produto, não um detalhe técnico.

Os dados vivem como JSON versionado no Git (`config.json` / `menu.json` por
restaurante). O "banco de dados" é o próprio repositório; a "API de escrita" é
a REST API do GitHub (Contents API) chamada pelo painel `/admin` no navegador,
autenticada com um PAT fine-grained digitado pelo usuário a cada sessão
(nunca persistido em arquivo).

## Mapa de dependências

```
restaurants/{slug}/index.html ──► shared/menu-renderer.js ──► shared/theme.css
                                   (só leitura: fetch de config.json/menu.json)

admin/index.html ──► admin/admin.js ──► shared/github-api.js
                                          (única parte que escreve no repo)
```

- `shared/menu-renderer.js` e `shared/theme.css` são consumidos **apenas**
  pelas páginas públicas dos restaurantes. Não deixe nada relativo ao admin
  vazar para cá.
- `shared/github-api.js` é consumido **apenas** pelo `admin/admin.js`. O site
  público nunca deve importar este arquivo (ele não precisa de token nem de
  chamadas à API do GitHub).
- Cada `restaurants/{slug}/index.html` é idêntico entre restaurantes — é só um
  shell que chama `carregarERenderizarCardapio()`. Se precisar mudar o HTML
  público, replique a mudança em `restaurants/exemplo/index.html`,
  `restaurants/_template/index.html` e em qualquer outro restaurante já criado
  (não há um único ponto de verdade para esse HTML porque cada pasta é
  independente e auto-contida — isso é intencional, ver seção seguinte).

## Por que cada restaurante é uma pasta 100% independente

Decisão de design da especificação: cada restaurante deve poder ser
duplicado/copiado sem tocar em nada fora da sua própria pasta. Isso significa
que o `index.html` de cada restaurante é um arquivo próprio (não gerado), e
`restaurants/_template/` existe justamente para ser a cópia-base. Ao alterar o
comportamento comum do cardápio público, prefira mudar `shared/` (que é
importado por todos) e só mexer nos `index.html` individuais quando a mudança
for estrutural (ex: nova tag `<link>`).

## Modelo de dados (contrato)

`config.json` e `menu.json` — ver exemplos completos e a lista de campos
obrigatórios na seção 4 de `especificacao-cardapio-dinamico.md`. Pontos que já
geraram decisões de código e não devem ser "corrigidos" sem querer:

- `menu.pratos[].imagem` vazio/ausente ⇒ o card usa `config.logo` como
  imagem, sem tentar carregar um `src` vazio primeiro (evita ícone de imagem
  quebrada). Mesmo comportamento se a imagem informada falhar (`onerror`).
  Lógica em `shared/menu-renderer.js` (`criarCardPrato`).
- `config.banner` vazio/ausente ⇒ nenhuma faixa é exibida, **sem** fallback
  (é decorativo, diferente da imagem do prato). Se o banner falhar ao
  carregar, o elemento é removido do DOM (`onerror` em `renderMenu`).
- `id` de prato é gerado como `${slug}-${timestamp}` (`admin/admin.js`,
  `gerarIdPrato`). Não depende de UUID nem de contador sequencial — dois
  cliques rápidos no mesmo milissegundo teoricamente colidem, mas na prática
  (uso manual, um admin por vez) não é um problema real; não vale a pena
  adicionar complexidade para isso a menos que apareça de verdade.

## Fluxo de escrita do admin (importante para não quebrar)

Toda alteração (`toggle`, criar, editar, excluir prato) segue sempre:
`GET` (ou usa o `sha` já em memória) → modifica o objeto `state.menu` em
memória → `PUT` do `menu.json` inteiro reescrito, com o `sha` obtido.

Implicações ao adicionar novas ações:

1. **Nunca** faça `PUT` sem passar o `sha` mais recente conhecido — a Contents
   API responde 409 se o arquivo mudou desde a última leitura (edição
   concorrente por outra aba/pessoa). Hoje isso não tem retry automático: o
   erro só aparece no `status` da UI pedindo para recarregar. Se for
   implementar múltiplos admins simultâneos, essa é a lacuna a resolver
   primeiro.
2. Texto (JSON) precisa passar por `textToBase64`/`base64ToText` em
   `shared/github-api.js` (UTF-8 seguro) — nunca usar `btoa`/`atob` puro em
   conteúdo com acentuação, quebra silenciosamente.
3. Imagens enviadas pelo formulário vão para
   `restaurants/{slug}/assets/{id-do-prato}.{extensão}` via `putBinaryFile`
   (sem `sha`, pois é sempre um arquivo novo — se um dia permitir reenviar a
   mesma imagem, será preciso buscar o `sha` existente antes).
4. `config.json` (cores, nome, categorias) ainda **não** é editável pelo
   painel — é a "fase 2" citada na especificação (seção 6.7). Se for
   implementado, seguir o mesmo padrão: `getFile` → editar em memória →
   `putFile` com `sha`.

## Convenções de código

- JavaScript vanilla com ES modules (`import`/`export`), sem transpilação —
  então só usar sintaxe já suportada nos navegadores atuais.
- Nomes de campos de domínio (`nome`, `preco`, `disponivel`, `categoria`) e
  comentários em português, seguindo a especificação original. Mantenha essa
  língua para consistência — não misturar com inglês em novos campos.
- Sem comentários explicando o óbvio; comentários existentes marcam decisões
  não óbvias (como as da seção acima). Ao adicionar lógica não trivial, siga
  o mesmo padrão: comente o "porquê", não o "o quê".
- Sem framework de testes configurado (projeto 100% estático, sem build). Para
  validar mudanças: sirva o repo com um servidor HTTP simples (ver README →
  "Rodando localmente") e verifique no navegador — use a skill
  `browser-automation` para automatizar essa checagem em vez de pedir para o
  usuário olhar a tela.

## Ao pedir para "adicionar um campo" no prato/restaurante

Checklist para não deixar a mudança pela metade:

1. Atualizar o exemplo em `especificacao-cardapio-dinamico.md` (seção 4) —
   é a fonte de verdade do schema.
2. Atualizar `restaurants/exemplo/menu.json` ou `config.json` com um valor de
   demonstração.
3. Atualizar `restaurants/_template/` com o valor vazio/padrão equivalente.
4. Renderização pública: `shared/menu-renderer.js`.
5. Painel admin: campo no formulário (`admin/index.html`) + leitura/escrita em
   `admin/admin.js` (`abrirFormulario` e `handleSubmitFormulario`).

## Estado propositalmente fora do escopo

Estas lacunas são conhecidas e não são bugs — não "corrigir" sem alinhar com
o usuário antes, pois envolvem trade-offs de produto:

- Sem paginação/busca no admin (assume poucas dezenas de pratos por restaurante).
- Sem compressão/redimensionamento de imagem antes do upload (o admin envia o
  arquivo como o usuário escolheu).
- Sem controle de conflito além do `sha` da Contents API (ver seção acima).
- Sem internacionalização — tudo em português, moeda fixa em BRL.
