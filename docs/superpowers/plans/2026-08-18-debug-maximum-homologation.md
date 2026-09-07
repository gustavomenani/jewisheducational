# Debug máximo e homologação final — 2026-08-19

## Escopo

Execução realizada em staging local descartável com `DB_DRIVER=memory`,
`UPLOAD_DIR` temporário e JWT de teste. Nenhum teste criou, publicou, enviou,
excluiu ou pagou qualquer coisa em produção. JWT e `MIGRATION_SECRET` não foram
alterados.

## Correções implementadas

- CTA público navega normalmente; no editor, seleciona o bloco sem cancelar o
  comportamento público.
- Recursos e biblioteca distinguem carregamento, vazio e erro; têm retry e a
  biblioteca preserva materiais quando categorias falham. Limpar filtros também
  limpa a busca.
- Download passou a ter duas etapas: a página intermediária abre primeiro e a
  entrega protegida só ocorre no botão final. Apresentações continuam view-only.
- Analytics foi separado em abertura da página, clique final, início e conclusão;
  `download_completed` é a conversão principal e eventos duplicados são evitados.
- Modal de autenticação e drawer mobile têm botão, backdrop, Escape, retorno de
  foco, `aria-expanded` e contenção de teclado.
- Grades respeita configuração, abre/fecha por clique e teclado, fecha por
  Escape/clique externo e usa `menuitem` corretamente. Não inventa níveis quando
  a configuração está vazia.
- Footer não usa mais `/library` como fallback falso para Terms, Privacy e
  Updates; URLs externas e internas são tratadas separadamente e links sem URL
  válida ficam ocultos.
- Placeholder público `dsfsd` é removido sem apagar textos personalizados.
- Uploads, thumbnails, capas, imagens PNG/WebP, duplicação e descarte têm
  validação, armazenamento correto e rollback de arquivos/registros parciais.
- Adapters de memória, MySQL e Firestore foram alinhados para IDs, `insertId`,
  listas, assinaturas, quotas, favoritos e analytics; fallback de produção para
  memória foi bloqueado.
- Quotas têm reserva idempotente e concorrente; autenticação opcional não fica
  pendurada; cadastro concorrente retorna `409`; Stripe é idempotente por
  `event.id`; publicação retorna erro de servidor quando a falha é interna.
- Setup de banco executa schema e migrações idempotentes. Firebase, Hosting,
  Functions, Firestore e Storage ficaram documentados como release único; os
  caminhos antigos de VPS/Supabase/Vercel falham fechados.
- `robots.txt`, `sitemap.xml`, SSR de título/descrição/canonical/Open Graph/
  JSON-LD e regras de `noindex` foram validados. O checker de release também
  confirma que imports emitidos pelo build existem no Hosting.

## Evidências locais

- `npm run verify:release`: passou em 19/08/2026.
  - build Vite: 812 módulos transformados;
  - backend: 65 testes, 65 aprovados;
  - frontend: 113 testes, 113 aprovados;
  - scripts de release: 1 teste, 1 aprovado;
  - `node --check` em todo o backend: aprovado;
  - verificação de assets emitidos: aprovada.
- Staging: `/api/health` retornou `200` com liveness e `/api/ready` retornou
  `200` com banco, storage e configuração prontos. `robots.txt` foi `text/plain`
  e `sitemap.xml` foi `application/xml`.
- Browser em 390, 768 e 1280px: home, CTA, biblioteca, busca, limpeza de
  filtros, Grades, menu mobile, login protegido, modal, material e rotas de
  download/apresentação foram exercitados. O axe terminou com zero violações;
  contrastes sobre fundos com imagem/transformação ficaram como revisão manual,
  não como violações automáticas.
- Falha simulada de categorias preservou os materiais da biblioteca. Falha
  simulada do recurso removeu o spinner e exibiu alerta acessível com Retry.
- Download: primeiro carregamento chamou somente `prepare`/`intent`; após o
  clique final chamou uma única entrega `/api/downloads/1/1` com `200`.
  Apresentação chamou somente `/api/downloads/view/1/1` e não exibiu download.

## Pendências e limite da homologação

- Não houve deploy nesta etapa. A produção só deve receber release depois que a
  conta disponibilizar `JWT_SECRET` e `MIGRATION_SECRET` pelo Secret Manager e
  o gate for repetido no ambiente de publicação.
- MySQL, Firestore, Firebase Storage, Stripe real e o painel Real-time do GA4
  não foram acessados com credenciais reais; os contratos foram testados em
  adapters, HTTP temporário e staging. O atraso normal de processamento do GA4
  deve ser considerado ao validar o painel.
- O certificado/redirect do domínio `www` continua pendente de acesso ao
  gerenciamento do domínio. O domínio oficial Firebase permanece o único alvo
  documentado.
- O build mantém apenas o aviso não bloqueante de chunks grandes de PDF/PPTX.

## Critério para publicação

Publicar somente após fornecer os segredos externamente, repetir o gate,
confirmar o ID do GA4 salvo no banco/build, executar o deploy unificado e fazer
smoke tests read-only de health, settings, categorias, materiais, capas, rotas
SPA e endpoints protegidos.

## Segunda rodada intensiva — resultado final

Esta rodada repetiu a verificacao depois das correcoes, com navegador real em
desktop (1280px) e celular (390px), staging descartavel e novos testes
comportamentais. O resultado final foi:

- `npm run verify:release`: passou novamente; build com 812 modulos, 68 testes
  backend aprovados, 116 testes frontend aprovados, 1 teste de scripts,
  `node --check` do backend e auditoria de assets aprovados.
- Acessibilidade axe: zero violacoes nas rotas publicas, biblioteca, categorias,
  materiais, login, recurso e dez telas administrativas auditadas. Foram
  corrigidos contrastes de acoes da biblioteca, placeholder de apresentacao e
  pasta Uncategorized, alem do nome acessivel das miniaturas sem capa.
- Download em duas etapas: a pagina abriu com preview inline; nao houve chamada
  ao anexo no primeiro passo. O clique final fez uma unica entrega `200` e os
  totais de staging ficaram em 1 para `resource_download_click`,
  `download_page_open`, `download_started` e `download_completed`.
- Apresentacao: arquivo PPTX valido foi renderizado com 1 slide; a rota chamou
  apenas `/downloads/view/...`, exibiu a barra de slides e nao exibiu acao de
  download.
- Editor: zero elementos `contenteditable`; Enter selecionou o titulo e abriu
  o inspetor lateral; CTA em edicao selecionou o campo e CTA publicado navegou.
- Grades: abriu por clique, ficou com `aria-expanded=true`, fechou por Escape,
  devolveu foco ao gatilho e exibiu apenas os niveis configurados.
- Smoke HTTP: health, readiness, settings, categorias e materiais retornaram
  `200`; preview, download e Analytics anonimos retornaram `401`.
- Os materiais e arquivos PPTX/PDF criados apenas para QA foram removidos do
  banco e do Storage temporario; os slugs de QA retornam `404`.

Esta evidencia confirma o codigo local e o staging isolado. Ela nao equivale a
deploy em producao: continuam pendentes as credenciais reais do Secret Manager,
validacao de MySQL/Firestore/Storage reais, confirmacao no Real-time do GA4 e a
configuracao do certificado/redirect de `www`.

## Auditoria read-only do dominio oficial

Em `https://jewisheducationalresources.org/`, sem alterar dados ou executar
acoes administrativas, foi confirmado que a producao ainda nao recebeu o
release local:

- A pagina responde `200`, mas entrega os assets antigos (`index-Dm53Mdh4.js` /
  `index-stm08o61.css`), enquanto o build validado localmente gera
  `index-D9mr6SNe.js` / `index-Bkv3ENmb.css`.
- O shell publicado ainda esta em `lang="pt-BR"`, usa apenas a descricao SEO
  antiga e nao entrega canonical, Open Graph ou JSON-LD no HTML inicial.
- O conteudo publico ainda mostra o placeholder `dsfsd`, nao mostra o hero novo
  e o rodape ainda exibe `Updates`.
- `robots.txt` e `sitemap.xml` retornam `200` com `Content-Type: text/html` e o
  shell SPA, em vez de texto/XML. `/api/health` retorna `200`, mas `/api/ready`
  retorna `404`, indicando Function antiga.
- Acessibilidade live encontrou contraste insuficiente, `h1` vazio, ordem de
  headings incorreta e logo do rodape sem nome acessivel; esses achados nao
  aparecem no staging depois das correcoes.
- O host `www` continua falhando na verificacao TLS nesta maquina.

Conclusao: o codigo local esta homologado, mas o dominio oficial continua
rodando a versao anterior. Nenhuma escrita foi feita em producao; o deploy
unificado continua bloqueado ate disponibilizar os segredos e executar a
publicacao autorizada.
