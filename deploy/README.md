# Deployment policy

Production has one supported target: Firebase Hosting and the `api` Cloud
Function in project `jewish-educational-resources`.

Use `firebase deploy` only after the frontend build, backend tests, staging
behavior tests, and read-only production smoke checks pass. Inject
`VITE_FIREBASE_API_KEY`, `FRONTEND_URL`, `JWT_SECRET`, and the enabled payment
and SMTP credentials from the build environment or Secret Manager; no
credential belongs in this directory. `npm run verify:release` is the
predeploy gate and runs the backend/frontend tests, syntax checks, asset checks,
and build.

The normal `api` Function never receives `MIGRATION_SECRET`. Destructive import
and password-reset helpers are mounted only in the private `migrationApi`
Function, which requires both a Cloud IAM identity token and the externally
managed migration secret. The normal release provisions that secret for the
private Function but never binds it to `api`. Set `MIGRATION_API_URL` only for the explicit,
approved migration scripts; never point Hosting `/api/**` at that Function.

The Firebase release scripts resolve the repository root from their own
location, so they can be invoked from any working directory. The guarded
legacy-database migration scripts also require `LEGACY_SSH_HOST` and
`LEGACY_REMOTE_ROOT` from the environment; no historical workstation or VPS
path is embedded in a release script.

The VPS, Supabase, and Vercel scripts are retained only for historical
reference and fail closed. They must not be used to publish or mutate data.
Production migration/import scripts additionally require an explicit
`ALLOW_PRODUCTION_MIGRATION=1`, `MIGRATION_API_URL`, a Cloud IAM token, and
externally supplied secrets.
