# Potluck Frontend

## Run locally

1. Install Node.js and the PostgreSQL client. The Express application now
   targets Aurora PostgreSQL and authenticates with AWS IAM; it does not
   support local password-based PostgreSQL connections.
2. Ensure the Aurora PostgreSQL cluster is reachable from the app host and
   that IAM database authentication is enabled. Restrict its security group
   to the app host.
3. Create a PostgreSQL login for the app and grant it the `rds_iam` role. A
   database administrator should apply `schema.sql` using a migration/admin
   role, then grant the app role access:

   ```sql
   GRANT rds_iam TO potluck_app;
   GRANT CONNECT ON DATABASE potluck TO potluck_app;
   GRANT USAGE ON SCHEMA public TO potluck_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON users, assets, user_sessions TO potluck_app;
   GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO potluck_app;
   ```

   The AWS identity used by the app also needs `rds-db:connect` permission
   for that cluster resource ID and database username. The permission ARN
   format is
   `arn:aws:rds-db:<region>:<account-id>:dbuser:<cluster-resource-id>/<database-username>`.
4. Copy `.env.example` to `.env`. Set the Aurora endpoint, database, IAM
   database username, AWS region, and the path to the AWS RDS CA bundle.
   The AWS SDK uses the standard AWS credential provider chain. For local
   development, install AWS CLI v2, configure an IAM profile with
   `aws configure --profile potluck`, verify it with
   `aws sts get-caller-identity --profile potluck`, and set
   `AWS_PROFILE=potluck` in `.env`. The IAM user needs `rds-db:connect` for
   this cluster resource ID and database user. Never put AWS access keys or
   database passwords in `.env`.
5. Apply `schema.sql` to the target database using a migration/admin role
   (`DB_MIGRATION_USER`). From PowerShell, with AWS CLI, `psql`, and the
   environment values configured:

   ```powershell
   $env:PGPASSWORD = aws rds generate-db-auth-token --hostname $env:DB_HOST --port $env:DB_PORT --region $env:AWS_REGION --username $env:DB_MIGRATION_USER
   $env:PGSSLROOTCERT = $env:DB_SSL_CA
   $env:PGSSLMODE = 'verify-full'
   try {
     psql --host=$env:DB_HOST --port=$env:DB_PORT --username=$env:DB_MIGRATION_USER --dbname=$env:DB_NAME --file=.\schema.sql
   } finally {
     Remove-Item Env:PGPASSWORD
   }
   ```

   The schema creates missing tables and indexes; it does not drop tables or
   migrate old records. Apply it to a new/empty database as intended for this
   transition. The app verifies the required tables exist on startup and
   stores login sessions in PostgreSQL.
6. Run `npm install`, then `npm run dev`, and open <http://localhost:3000>.
   Verify signup, login/logout, asset creation, editing, and loading from a
   second session before scheduling cutover. Existing sessions will need to
   log in again.

Asset thumbnails are rendered in the browser each time an asset is saved and
stored with that asset in PostgreSQL. The older PHP files under `js/` are not
used by the Express server and still connect to MySQL; migrate them separately
if they are deployed or invoked.

## Community asset gallery

On the mini maker page, the Asset Gallery has **My Assets** and **Community**
tabs. Use **Publish to community** on one of your saved assets to make it
available to all signed-in users; use **Remove from community** to unpublish
it. Published assets appear in the Community tab, where clicking or dragging
one into the canvas adds a copy to the current mini. Publishing is explicit,
and only the asset owner can change its sharing setting. The gallery currently
shows the 100 most recently updated published assets. Asset scenes load only
when selected, so browsing the gallery does not download every 3D model.

Apply the updated `schema.sql` to an existing PostgreSQL database before
restarting the app; it adds the `is_public` column and its index without
deleting existing assets. Existing assets remain private by default.
