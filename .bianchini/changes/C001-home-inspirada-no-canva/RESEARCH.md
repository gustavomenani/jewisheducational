# Stack Research — C001

Research mode: repo_only
Motivo: a mudança é visual, usa a stack e os componentes já existentes e não introduz biblioteca, integração ou decisão sensível a versão.

## Stack detectada

- Vue 3.5, Vue Router, Pinia e Vite 6 no frontend.
- Editor visual próprio com `EditableSetting` e `EditableImage`.
- CSS responsivo próprio em `frontend/src/assets/k5-home.css`.

## Inventário local

- Manifests: `package.json`, `frontend/package.json`, `backend/package.json`.
- Lockfiles: `package-lock.json`, `frontend/package-lock.json`, `backend/package-lock.json`.
- Testes: Node Test, Playwright e `npm run verify:release`.
- Padrões locais: configurações publicadas fornecem conteúdo; componentes editáveis preservam edição inline; rotas protegidas permanecem no layout público.

## Decisões aplicadas

- Reaproveitar o motor atual do editor e as chaves já publicáveis.
- Implementar a referência do Canva somente como composição CSS nativa.
- Usar imagens locais responsivas já otimizadas em WebP.
- Remover o showcase/iframe da renderização da Home.

## Riscos e lacunas

- A configuração publicada atualmente mantém a Home oculta por causa do hotfix anterior; a ativação em produção deve ocorrer somente depois da homologação do novo candidato.
