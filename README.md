# Jewish Educational Resources

Biblioteca de materiais educacionais judaicos — Vue 3 + Express + MariaDB.

Monorepo completo (frontend + backend + deploy). Repos separados para produção:

- **Produção oficial:** Firebase Hosting + Cloud Functions (`jewish-educational-resources`)

## Requisitos

- Node.js 22+
- MariaDB / MySQL (ou Supabase Postgres em desenvolvimento)
- Python 3 (opcional, para gerar PDFs)

## Instalação

```bash
npm run install:all
npm run db:setup
npm run db:migrate
```

Copie `backend/.env.example` para `backend/.env` e ajuste as variáveis.

## Desenvolvimento

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- Admin padrão: `admin@example.com` / `admin123`

## Scripts úteis

```bash
npm run db:seed-activities      # seed de atividades
npm run db:seed-aleph-bet         # Aleph-Bet (22 letras, grade)
npm run db:regenerate-pdfs        # regenerar PDFs (fpdf)
npm run db:regenerate-pdfs-gemini # regenerar PDFs via Gemini
```

## Deploy

O deploy oficial é feito com `firebase deploy` a partir deste diretório. O
`firebase.json` usa a Function `api` para `/api/**` e `/uploads/**` e o
Hosting para o frontend. Os arquivos antigos de VPS e Vercel são mantidos
apenas como histórico/compatibilidade e não devem ser usados para produção;
eles não apontam mais para o servidor legado.

Segredos devem vir do ambiente ou do Firebase Secret Manager. Nunca coloque
JWT, senhas de banco, chaves OAuth ou segredos de migração em scripts,
`.env` versionado ou comandos de deploy.

