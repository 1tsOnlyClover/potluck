# Potluck Frontend

## Run locally with Neon

1. Install Node.js and dependencies:

   ```powershell
   npm install
   ```

2. Copy `.env.example` to `.env` if needed and set `SESSION_SECRET` to a
   random, private value. Keep `.env` out of source control.
3. Sign in to Neon and link this workspace to the intended project if it is
   not already linked:

   ```powershell
   neon login
   neon env pull
   ```

   `neon env pull` writes `DATABASE_URL` (the pooled application connection)
   and `DATABASE_URL_UNPOOLED` (for schema operations) to `.env`.
4. Apply the PostgreSQL schema using the direct connection:

   ```powershell
   $env:DATABASE_URL = (Get-Content .env | Where-Object { $_ -match '^DATABASE_URL_UNPOOLED=' } | ForEach-Object { ($_ -split '=', 2)[1] })
   node --input-type=module -e "import pg from 'pg'; import { readFileSync } from 'node:fs'; const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }); try { await pool.query(readFileSync('schema.sql', 'utf8')); } finally { await pool.end(); }"
   Remove-Item Env:DATABASE_URL
   ```

5. Start the app:

   ```powershell
   npm start
   ```

The Express app uses `pg` with Neon's pooled connection string for ordinary
queries and session storage. The direct connection string is reserved for
schema changes and other operations that require a persistent PostgreSQL
session. The app verifies the required tables when it starts.
