# LDI Payload Hub

A minimalist Next.js/React dashboard for LDI NETWORK, exported as a static site
for https://ron-delhaye-studios.github.io/LDI-HUB/.

## Features

- Owner email/password login for RonDelhayeStudios@gmail.com.
- Create and view projects; create, view, edit, and delete project payloads.
- Project, agent, and status filters; unassigned-agent support.
- Plain text instructions, Drive/GitHub links, and output summary.
- Responsive layout, loading/error states, safe external links, and sign-out.

Payload form values are stored under `content_payload.instructions`,
`drive_link`, `github_link`, and `output_summary`. Other keys from a loaded JSON
object are preserved. Only HTTP/HTTPS links are accepted. Agent labels are
THALEIA, LUNA, GPT, INDY; statuses are draft, queued, in_progress, completed.

## Local development

Use Node.js 24 LTS and run:

```bash
npm ci
npm run dev
```

Open http://localhost:3000/LDI-HUB/. The public Supabase URL and legacy anon key
are preconfigured in `src/lib/public-config.ts`. They are intentionally visible
in the browser. No password or service-role key is included. Optional overrides
are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.

The app relies on Supabase RLS for authorization. The client email check is only
a UI guard. Email/password sessions are browser-local; there are no protected
Next.js server routes or private server-rendered queries.

## GitHub Pages deployment

Target repository: https://github.com/Ron-Delhaye-Studios/LDI-HUB

1. Create the public repository and initialize its `main` branch with a README.
2. Grant the connected GitHub app access to this repository so source can be
   committed. Place the contents of this directory at the repository root.
3. Under repository Settings → Pages, select GitHub Actions as the build source.
4. Push to `main` or manually run Deploy LDI Payload Hub under Actions.

`.github/workflows/deploy-pages.yml` installs the lockfile, checks types, tests
RLS in isolated Postgres, builds the static export, uploads `out/`, and deploys
it with GitHub Pages. It uses short-lived GitHub permissions, not a personal
access token. `configure-pages` attempts to enable Pages if needed; if GitHub
requires administrator setup, complete step 3 and rerun the workflow.

`next.config.ts` sets `output: 'export'`, `basePath: '/LDI-HUB'`, and
`trailingSlash: true`. `public/.nojekyll` keeps the `_next` assets accessible.
No Node server is needed in production. If the branch is not named `main`,
update the workflow trigger to match the branch.

## Supabase setup and access

Project: ypfhcqeispdunewubxjm (LDI NETWORK).
Existing tables: `public.projects`, `public.payloads`, `public.system_nodes`.

The security correction in `sql/dashboard-access.sql` was applied via the
Supabase migration API as `ldi_dashboard_owner_access` during LDI-HUB-005.
It changes no tables or data. It normalizes the owner email comparison,
excludes anonymous Auth accounts, grants only SELECT/INSERT/UPDATE/DELETE to
`authenticated`, removes browser TRUNCATE/TRIGGER/REFERENCES privileges, and
adds a restrictive owner boundary to guard against older permissive policies.
The owner can manage all rows across all three tables.

Owner account creation and email confirmation were completed through the Admin
API. Actual password sign-in and owner REST access to all three tables were
verified; the verification session was signed out. The temporary token-protected
setup function was disabled (HTTP 410). No credentials are in this repository.

The owner must exist in Supabase Authentication → Users, separately from the
Supabase dashboard login. Create RonDelhayeStudios@gmail.com with an email and
password you control, and confirm its email. Do not send passwords to agents or
commit them. Disable public signups for this private dashboard. Anonymous
visitors and other signed-in accounts have no row access.

The current policy authorizes the signed email claim, case-insensitively.
`sql/owner-access.sql` is the earlier optional UUID-based model; do not execute
it as part of this frontend deployment. Switching to it requires the owner Auth
user to exist and a separately reviewed access migration.

## SQL migration history in GitHub

Use the existing remote history as the source of truth. The SQL template under
`sql/` is a reference; the GitHub workflow does not execute migrations.
When setting up versioned history, use the Supabase CLI:

```bash
npx supabase --help
npx supabase init
npx supabase login
npx supabase link --project-ref ypfhcqeispdunewubxjm
npx supabase db pull
npx supabase migration list
```

Capture the current schema/history and reconcile generated migration files
before any `db push`. New changes belong in `supabase/migrations/`, created with
`supabase migration new <name>`. Do not replay already-applied table creation or
this access correction against the live project blindly. Never invent migration
timestamps or store production passwords in migration files.

## Validation

```bash
npm run check
npm test
npm run build
```

Tests run in isolated PGlite/Postgres, not the live database. They verify owner
CRUD, anonymous and outsider denial, repeated migration application, and safe
TRUNCATE permissions even in the presence of a deliberately open legacy policy.
The static build is in `out/` and is configured for the `/LDI-HUB/` path.

Check the live URL and its JS/CSS assets after GitHub Pages reports deployment
success. Sign in as the owner, create a project, create/edit/delete a temporary
payload, and check all filters. A real owner sign-in test requires the owner to
enter their own password; it cannot be inferred from SQL administrator access.

## Boundaries

Drive and GitHub fields store links, without synchronizing external services.
The list shows up to 200 payloads; filter by agent or status to narrow it. Use
Refresh for other clients' changes. Editing uses last-write-wins and preserves
extra keys from the loaded object, not from concurrent edits made afterward.
System-node administration and project deletion are not exposed in this UI.
Existing foreign keys prevent deleting projects while they have payloads.

AD ASTRA PROCEDAMUS.
