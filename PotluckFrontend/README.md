# Potluck Frontend

## Run locally

1. Install Node.js and MySQL, and make sure the MySQL server is running.
2. In this folder, initialize the local database once with `mysql -u root -p < schema.sql`.
   Use the MySQL username from your `.env` if it is not `root`.
3. Copy `.env.example` to `.env` and set the MySQL connection values to match your local MySQL setup.
4. Run `npm install`, then `npm run dev`.
5. Open <http://localhost:3000>.

The server automatically loads `.env` when it starts, including when run with
`node server.js`. The `.env` file is local-only and is ignored by Git. The
example values match the legacy local MySQL settings used in this project;
change them if your MySQL setup differs. The schema script can be run again
without overwriting existing data.
