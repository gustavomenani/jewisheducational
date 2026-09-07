# Relatório final — debug insano e homologação exemplar

Data da verificação: 2026-08-20 01:00 (America/Sao_Paulo)

## Resultado executivo

O código local foi corrigido e passou pelos gates isolados de build, backend, frontend e navegador. Nenhum deploy foi executado e nenhum dado de produção foi criado, alterado ou excluído.

O domínio oficial ainda está servindo o release antigo. Portanto, a homologação local está aprovada, mas a produção não pode ser declarada corrigida até o release final ser publicado e os bloqueios externos serem resolvidos.

## Correções aplicadas

- Logout e expiração de sessão encerram o editor, removem drafts locais e impedem que configurações privadas vazem para páginas públicas.
- Respostas antigas de recursos, biblioteca, download, favoritos, preview de PDF e apresentação não sobrescrevem uma rota mais nova.
- Popup bloqueado tem fallback para navegação na mesma aba.
- Download funciona em duas etapas: abertura da página intermediária e entrega somente no botão final; o primeiro clique não chama o endpoint protegido de anexo.
- Apresentações continuam view-only e aceitam Espaço/PageDown além das setas.
- Grades abre/fecha com clique, Enter, Espaço e Escape, preserva foco e não inventa níveis quando a configuração está vazia.
- CTA público navega; no editor, apenas seleciona o bloco.
- Filtros, modais, drawer mobile, mostrar senha, retorno de foco e mensagens de autenticação foram corrigidos para teclado e acessibilidade.
- Favoritos receberam proteção contra corridas entre pastas e contagem global baseada nos contadores das pastas.
- Upload em massa com falha de Slides agora faz rollback do material, arquivos, capa gerada e Storage; limpezas que falharem são registradas para retry.
- Readiness foi separado do liveness e verifica configuração completa, acesso real ao Storage, banco, Stripe e SMTP.
- Migração deixou de ignorar violação real de índice único, exporta todas as tabelas persistentes, preserva tabelas futuras em namespace explícito, registra manifesto de execução e divide payloads por tamanho.
- Segredos da migração não são interpolados no código Node temporário; a API normal não monta a rota de migração.
- Webhook Stripe resolve o plano escolhido pelo `planKey` e mantém idempotência.
- Nomes e URLs inseridos em e-mails HTML são escapados.
- `nanoid`, `postcss` e `protobufjs` foram fixados em versões patch seguras via overrides compatíveis.
- O build gera o mesmo shell SEO em `frontend/dist` e `backend/generated`.

Principais arquivos envolvidos: [DownloadView.vue](C:/Users/User/Documents/jewisheducationalresources-copia-main/frontend/src/views/DownloadView.vue), [SlideViewerModal.vue](C:/Users/User/Documents/jewisheducationalresources-copia-main/frontend/src/components/SlideViewerModal.vue), [FavoritesView.vue](C:/Users/User/Documents/jewisheducationalresources-copia-main/frontend/src/views/FavoritesView.vue), [app.js](C:/Users/User/Documents/jewisheducationalresources-copia-main/backend/app.js), [resources.js](C:/Users/User/Documents/jewisheducationalresources-copia-main/backend/routes/resources.js), [migrate.js](C:/Users/User/Documents/jewisheducationalresources-copia-main/backend/routes/migrate.js), [stripe.js](C:/Users/User/Documents/jewisheducationalresources-copia-main/backend/utils/stripe.js), [firebase-full-deploy.sh](C:/Users/User/Documents/jewisheducationalresources-copia-main/deploy/firebase-full-deploy.sh) e [import-to-firebase.sh](C:/Users/User/Documents/jewisheducationalresources-copia-main/deploy/import-to-firebase.sh).

## Evidências locais

| Gate | Resultado |
|---|---:|
| Build Vite | passou; 813 módulos transformados |
| Shell SEO gerado | passou; arquivos idênticos |
| Backend | 73/73 passaram |
| Frontend | 119/119 passaram |
| Release contract | 1/1 passou |
| `node --check` backend | 89/89 arquivos passaram |
| Playwright staging | 24/24 testes executáveis passaram; 3 skips intencionais |
| Viewports Playwright | 390px, 768px e 1280px |
| Axe | home, biblioteca e login sem violações |
| `npm ci --dry-run` | raiz, frontend e backend passaram |

O Playwright usou `DB_DRIVER=memory`, Storage temporário, JWT de teste, frontend/backend locais e dados descartáveis. Os artefatos de navegador ficam em [qa/playwright/artifacts](C:/Users/User/Documents/jewisheducationalresources-copia-main/qa/playwright/artifacts) e o relatório em [qa/playwright/report/index.html](C:/Users/User/Documents/jewisheducationalresources-copia-main/qa/playwright/report/index.html).

Hashes do release local:

- `frontend/dist/index.html`: `F51A07B6AE90BE46B283BC8638F729F29D81E2FE921DE670CC75BDC82B890F5A`
- `backend/generated/index.html`: `F51A07B6AE90BE46B283BC8638F729F29D81E2FE921DE670CC75BDC82B890F5A`
- `frontend/dist/assets/index-DarUTZFF.js`: `16C69ED7686E0FF6EE8C26C7AF453BC94D6D5A5480EF32F9227E4DBEBC1172A6`

O ambiente disponível executou Node `v24.18.0`; o release está fixado em Node 22 por [`.nvmrc`](C:/Users/User/Documents/jewisheducationalresources-copia-main/.nvmrc) e pelos engines. Node 22 não está instalado neste computador.

## Smoke test somente leitura — produção

Executado em `https://jewisheducationalresources.org` sem login, gravação ou alteração de dados:

| URL | Resultado observado |
|---|---|
| `/api/health` | `200`, backend Firebase |
| `/api/ready` | `404` — Function/Hosting antigo ainda publicado |
| `/api/settings` | `200` |
| `/api/categories` | `200` |
| `/api/resources?limit=3` | `200`, ainda lista material de teste |
| `/robots.txt` | `200 text/html`, devolve shell SPA antigo em vez de `text/plain` |
| `/sitemap.xml` | `200 text/html`, devolve shell SPA antigo em vez de XML |
| `/`, `/library`, `/login` | `200`, shell antigo com `lang="pt-BR"` |
| arquivo protegido sem autenticação | `401` |
| `www.jewisheducationalresources.org` | certificado TLS `SEC_E_WRONG_PRINCIPAL`; com verificação ignorada, retorna `404` |

Os registros públicos de teste e o placeholder conhecido continuam no release online. Não foram apagados automaticamente, respeitando a allowlist exigida pelo plano.

## Pendências que bloqueiam o release

- Publicar o build local no Firebase Hosting e a Function compatível.
- Confirmar Secret Manager/IAM com Firebase CLI ou `gcloud`, incluindo `JWT_SECRET`, `MIGRATION_SECRET`, Stripe e SMTP.
- Executar o release com Node 22.
- Corrigir DNS/certificado e redirect do domínio `www`.
- Depois do deploy, repetir `/api/ready`, robots, sitemap, rotas SPA, contadores e eventos GA4 Real-time.
- A auditoria de dependências ainda mostra 3 moderadas no frontend (ECharts/UUID transitivos do `pptx-preview`) e 9 moderadas no backend (UUID transitivo da cadeia Firebase). As correções sugeridas pelo npm são upgrades major; não foram forçadas para não quebrar o visualizador ou o Firebase.
- Bash/WSL não está instalado no Windows local; os scripts `.sh` foram revisados estruturalmente, mas `bash -n` precisa ser executado no ambiente de release.

## Aprovação

**Código local:** aprovado pelos gates disponíveis.

**Produção:** bloqueada até deploy, secrets/IAM e certificado `www` serem confirmados. Nenhuma publicação foi feita nesta etapa.

## Tentativa de publicação — 2026-08-23

O acesso ao Firebase foi validado para o projeto `jewish-educational-resources`.
`JWT_SECRET` e `MIGRATION_SECRET` possuem versões ativas, e o service account da
Function possui `roles/secretmanager.secretAccessor` nos dois secrets.

O `firebase deploy --dry-run --only functions,hosting,firestore,storage`
executou o build, as regras e todos os gates locais, mas foi interrompido antes
de qualquer alteração porque estes secrets ainda não existem no Secret Manager:

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Nenhum valor foi inventado, nenhum secret foi sobrescrito e nenhum deploy
parcial foi feito. A produção permanece no release antigo: `/api/ready` ainda
retorna `404`, e `robots.txt`/`sitemap.xml` ainda retornam o shell HTML antigo.
O próximo deploy deve ser executado somente depois de cadastrar os oito
secrets com valores reais no projeto Firebase e repetir o dry-run.

## Atualização pós-backup e publicação pública — 2026-08-23

Antes da publicação foi criado o backup completo em:

`C:\Users\User\Documents\jer-production-backups\20260823-163718`

Conteúdo verificado do backup:

- 8 contas do Firebase Authentication;
- 15 coleções do Firestore e 4.857 documentos;
- 291 objetos do Storage, totalizando 76.093.040 bytes;
- snapshots públicos e manifestos com hashes SHA-256.

A comparação pós-deploy confirmou:

- as 8 contas continuam com os mesmos IDs;
- nenhum documento anterior foi removido ou alterado de forma inesperada;
- os 10 novos registros em `page_views` e a atualização do contador são apenas
  os acessos gerados pelos testes de leitura;
- os 291 objetos do Storage continuam presentes e com os mesmos tamanhos.

Foi publicado com sucesso o release público no Firebase Hosting e nas
Functions `api` e `subscriptionReminders`, depois de o gate passar com:

- backend: 73/73 testes;
- frontend: 119/119 testes;
- release contract: 1/1;
- build Vite e geração do shell concluídos;
- regras de Firestore/Storage e Hosting publicados.

Smoke test pós-publicação em `https://jewisheducationalresources.org`:

| Verificação | Resultado |
|---|---|
| `/api/health` | `200` |
| `/api/ready` | `200`, banco e Storage prontos |
| `/api/settings` | `200` |
| `/api/categories` | `200` |
| `/api/resources?limit=3` | `200` |
| `/robots.txt` | `200 text/plain` |
| `/sitemap.xml` | `200 application/xml` |
| arquivo protegido sem login | `401` |

O deploy público não executou migração, exclusão, upload, publicação de
conteúdo nem alteração de contas. Pagamentos e e-mail continuam
explicitamente desabilitados (`PAYMENTS_ENABLED=false` e
`EMAIL_ENABLED=false`), conforme o escopo informado.

### Bloqueio restante de permissão

A função privada `migrationApi` não foi publicada porque a conta que executa
o Firebase CLI ainda não possui `cloudfunctions.functions.setIamPolicy`. Isso
não bloqueia o site público já publicado; bloqueia somente a criação da
Function privada de migração.

Para liberar o deploy completo, o Owner do projeto deve conceder à conta de
deploy o papel **Cloud Functions Admin** (`roles/cloudfunctions.admin`) no
projeto `jewish-educational-resources`. O acesso ao Secret Manager já está
correto para `JWT_SECRET` e `MIGRATION_SECRET`. Depois da concessão, basta
repetir o deploy incluindo `migrationApi`; nenhuma migração será executada
automaticamente.

**Estado final:** site público publicado e verificado; dados preservados;
`migrationApi` pendente apenas por IAM.

## Verificação posterior de IAM — 2026-08-23

Após a conta de deploy receber o papel `roles/owner` no projeto, foi executado
um deploy isolado de `functions:api:migrationApi`. O resultado foi:

- `functions[api:migrationApi(us-central1)] Successful create operation`;
- runtime Node.js 22;
- acesso do service account ao `MIGRATION_SECRET` concedido corretamente;
- chamada sem autenticação à Function retornou `403`;
- `/api/health` continuou retornando `200`;
- `/api/ready` continuou retornando `200`;
- `/api/migrate/import` permaneceu inexistente na API pública (`404`).

O bloqueio de permissão foi resolvido. O estado anterior de `migrationApi`
pendente por IAM fica substituído por esta verificação.

## Ajustes finais solicitados pela cliente — 2026-08-23

Foram adicionados controles reversíveis no editor e publicados no Hosting:

- rodapé global ocultável por `footer_show`;
- ícone da página da biblioteca ocultável;
- títulos `Subtopics:` e `Materials found:` ocultos por padrão;
- cartões laterais de tipo, como `Worksheets`, ocultos por padrão;
- materiais e botões de subtópicos permanecem disponíveis;
- conteúdo do rodapé não é apagado e pode ser reativado no editor.

O deploy público da Function `api` e do Hosting terminou com sucesso. O gate
completo passou com backend `73/73`, frontend `121/121` e release contract
`1/1`.

Verificação visual pós-deploy em navegador, na categoria
`/library/category/parshas-hashavua`:

- HTTP `200`;
- zero erros de console;
- 2 botões de subtópicos mantidos;
- 8 cartões de materiais mantidos;
- 0 títulos `Subtopics:`;
- 0 títulos `Materials found:`;
- 0 cartões de tipo `Worksheets`;
- 0 ícones de cabeçalho da biblioteca;
- 0 rodapés públicos.
