import express from 'express';
import session from 'express-session';
import pg from 'pg';
import { Signer } from '@aws-sdk/rds-signer';
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { rootCertificates } from 'node:tls';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PostgresSessionStore } from './postgres-session-store.js';

const envFile = fileURLToPath(new URL('.env', import.meta.url));
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const missingConfig = [
  'SESSION_SECRET',
  'DB_HOST',
  'DB_USER',
  'DB_NAME',
  'AWS_REGION',
  'DB_SSL_CA',
]
  .filter((key) => !process.env[key]);
if (missingConfig.length) {
  throw new Error(`Missing ${missingConfig.join(', ')}. Configure the Aurora PostgreSQL settings before starting the app.`);
}

const dbPort = Number(process.env.DB_PORT || 5432);
if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) {
  throw new Error('DB_PORT must be an integer between 1 and 65535.');
}

const signer = new Signer({
  region: process.env.AWS_REGION,
  hostname: process.env.DB_HOST,
  port: dbPort,
  username: process.env.DB_USER,
});

const app = express();

const db = new pg.Pool({
  host: process.env.DB_HOST,
  port: dbPort,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: () => signer.getAuthToken(),
  ssl: {
    ca: [
      ...rootCertificates,
      readFileSync(process.env.DB_SSL_CA, 'utf8'),
    ],
    rejectUnauthorized: true,
  },
  max: 10,
});
db.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});
const sessionStore = new PostgresSessionStore(db);

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: 'potluck.sid',
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24,
  },
}));

app.use((req, res, next) => {
  res.locals.isLoggedIn = Boolean(req.session.userId);
  res.locals.userName = req.session.userName;
  next();
});

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'custom',
});

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

function requireApiLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Please log in to access your assets.' });
  }
  next();
}

function isAssetPayload(body) {
  return typeof body?.name === 'string'
    && body.name.trim().length > 0
    && body.name.trim().length <= 60
    && body.scene !== null
    && typeof body.scene === 'object'
    && !Array.isArray(body.scene)
    && body.scene.object?.type === 'Scene';
}

function isAssetThumbnail(thumbnail) {
  if (thumbnail === null || thumbnail === undefined) return true;
  if (typeof thumbnail !== 'string') return false;

  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(thumbnail);
  if (!match) return false;

  const image = Buffer.from(match[1], 'base64');
  return image.length <= 512 * 1024 && image.toString('base64') === match[1];
}

function serializeAssetScene(scene) {
  const serializedScene = JSON.stringify(scene);
  if (Buffer.byteLength(serializedScene, 'utf8') > 10 * 1024 * 1024) {
    throw new Error('Asset scene exceeds the 10 MB limit.');
  }
  return serializedScene;
}

app.get('/api/assets', requireApiLogin, async (req, res) => {
  try {
    const { rows: assets } = await db.query(
      'SELECT id, name, scene, thumbnail, is_public AS "isPublic", updated_at AS "updatedAt" FROM assets WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.session.userId],
    );
    res.json(assets.map((asset) => ({ ...asset, scene: JSON.parse(asset.scene) })));
  } catch (error) {
    console.error('Unable to load assets:', error);
    res.status(500).json({ error: 'Unable to load your assets right now.' });
  }
});

app.get('/api/community-assets', requireApiLogin, async (req, res) => {
  try {
    const { rows: assets } = await db.query(
      `SELECT assets.id, assets.name, assets.thumbnail,
              users.name AS "sharedBy", assets.updated_at AS "updatedAt"
       FROM assets
       JOIN users ON users.id = assets.user_id
       WHERE assets.is_public = TRUE
       ORDER BY assets.updated_at DESC
       LIMIT 100`,
    );
    res.json(assets.map((asset) => ({ ...asset, scene: JSON.parse(asset.scene) })));
  } catch (error) {
    console.error('Unable to load community assets:', error);
    res.status(500).json({ error: 'Unable to load the community gallery right now.' });
  }
});

app.get('/api/community-assets/:id', requireApiLogin, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(400).json({ error: 'The asset ID is invalid.' });
  }

  try {
    const { rows: [asset] } = await db.query(
      'SELECT id, name, scene FROM assets WHERE id = $1 AND is_public = TRUE',
      [req.params.id],
    );
    if (!asset) {
      return res.status(404).json({ error: 'That community asset is no longer available.' });
    }
    res.json({ ...asset, scene: JSON.parse(asset.scene) });
  } catch (error) {
    console.error('Unable to load community asset:', error);
    res.status(500).json({ error: 'Unable to load that community asset right now.' });
  }
});

app.post('/api/assets', requireApiLogin, async (req, res) => {
  if (!isAssetPayload(req.body) || !isAssetThumbnail(req.body.thumbnail)) {
    return res.status(400).json({ error: 'The asset name, scene, or thumbnail is invalid.' });
  }

  try {
    const id = randomUUID();
    const name = req.body.name.trim();
    const scene = serializeAssetScene(req.body.scene);
    const thumbnail = req.body.thumbnail || null;
    const { rows: [asset] } = await db.query(
      'INSERT INTO assets (id, user_id, name, scene, thumbnail) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [id, req.session.userId, name, scene, thumbnail],
    );
    res.status(201).json({ id: asset.id, name });
  } catch (error) {
    console.error('Unable to create asset:', error);
    res.status(500).json({ error: 'Unable to save this asset right now.' });
  }
});

app.put('/api/assets/:id/share', requireApiLogin, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)
    || typeof req.body?.isPublic !== 'boolean') {
    return res.status(400).json({ error: 'The asset ID or sharing setting is invalid.' });
  }

  try {
    const { rows: [asset] } = await db.query(
      'UPDATE assets SET is_public = $1 WHERE id = $2 AND user_id = $3 RETURNING id, is_public AS "isPublic"',
      [req.body.isPublic, req.params.id, req.session.userId],
    );
    if (!asset) {
      return res.status(404).json({ error: 'That asset could not be found.' });
    }
    res.json(asset);
  } catch (error) {
    console.error('Unable to update asset sharing:', error);
    res.status(500).json({ error: 'Unable to update asset sharing right now.' });
  }
});

app.put('/api/assets/:id', requireApiLogin, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)
    || !isAssetPayload(req.body)
    || !isAssetThumbnail(req.body.thumbnail)) {
    return res.status(400).json({ error: 'The asset ID, name, scene, or thumbnail is invalid.' });
  }

  try {
    const name = req.body.name.trim();
    const scene = serializeAssetScene(req.body.scene);
    const thumbnail = req.body.thumbnail || null;
    const result = await db.query(
      'UPDATE assets SET name = $1, scene = $2, thumbnail = COALESCE($3, thumbnail) WHERE id = $4 AND user_id = $5',
      [name, scene, thumbnail, req.params.id, req.session.userId],
    );
    if (result.rowCount === 0) {
      const { rows: ownedAssets } = await db.query(
        'SELECT id FROM assets WHERE id = $1 AND user_id = $2',
        [req.params.id, req.session.userId],
      );
      if (!ownedAssets.length) {
        return res.status(404).json({ error: 'That asset could not be found.' });
      }
    }
    res.json({ id: req.params.id, name });
  } catch (error) {
    console.error('Unable to update asset:', error);
    res.status(500).json({ error: 'Unable to save this asset right now.' });
  }
});

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

app.post('/login', async (req, res) => {
  const identity = String(req.body.name || '').trim();
  const password = String(req.body.password || '');

  if (!identity || !password) {
    return res.status(400).render('login', { vite: true, error: 'Enter your name/email and password.' });
  }

  try {
    const { rows: users } = await db.query(
      'SELECT id, name, password, description FROM users WHERE LOWER(name) = LOWER($1) OR LOWER(email) = LOWER($2) LIMIT 1',
      [identity, identity],
    );
    const user = users[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).render('login', { vite: true, error: 'Invalid name/email or password.' });
    }

    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.description = user.description;
    await saveSession(req);
    res.redirect('/create');
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).render('login', { vite: true, error: 'Unable to log in right now. Please try again.' });
  }
});

app.post('/signup', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const description = String(req.body.description || '').trim();

  if (!name || !email || !password) {
    return res.status(400).render('register', { vite: true, error: 'Name, email, and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).render('register', { vite: true, error: 'Password must be at least 8 characters.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const { rows: [user] } = await db.query(
      'INSERT INTO users (name, password, email, description) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, passwordHash, email, description || null],
    );

    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.userName = name;
    req.session.description = description;
    await saveSession(req);
    res.redirect('/create');
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).render('register', {
        vite: true,
        error: 'That name or email is already registered.',
      });
    }
    console.error('Signup failed:', error);
    res.status(500).render('register', { vite: true, error: 'Unable to create your account right now. Please try again.' });
  }
});

app.post('/logout', requireLogin, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error('Logout failed:', error);
      return res.status(500).send('Unable to log out right now. Please try again.');
    }
    res.clearCookie('potluck.sid');
    res.redirect('/login');
  });
});

app.get('/', (req, res) => {
  res.render('index', { vite: true });
});

app.get('/create', requireLogin, (req, res) => {
  res.render('mini_maker', { vite: true, userName: req.session.userName });
});

app.get('/profile', requireLogin, (req, res) => {
  res.render('profile', { vite: true, userName: req.session.userName, description: req.session.description });
});

app.get('/login', (req, res) => {
  res.render('login', { vite: true, error: null });
});

app.get('/signup', (req, res) => {
  res.render('register', { vite: true, error: null });
});

app.get('/modeller', requireLogin, (req, res) => {
  res.render('modeller', { vite: true, userName: req.session.userName });
});

app.use(vite.middlewares);

try {
  await db.query('SELECT 1');
  const { rows: [schema] } = await db.query(
    "SELECT to_regclass('public.users') AS users, to_regclass('public.assets') AS assets, to_regclass('public.user_sessions') AS user_sessions",
  );
  const missingTables = Object.entries(schema)
    .filter(([, table]) => !table)
    .map(([name]) => name);
  if (missingTables.length) {
    throw new Error(`Missing database tables: ${missingTables.join(', ')}. Apply schema.sql before starting the app.`);
  }
  await db.query('SELECT is_public FROM assets LIMIT 0');
  const sessionCleanup = setInterval(() => {
    db.query('DELETE FROM user_sessions WHERE expire <= NOW()')
      .catch((error) => console.error('Unable to remove expired sessions:', error));
  }, 15 * 60 * 1000);
  sessionCleanup.unref();
  app.listen(3000, () => {
    console.log('App running at http://localhost:3000');
  });
} catch (error) {
  console.error('Could not connect to the Potluck Aurora PostgreSQL database:', error);
  await db.end();
  process.exitCode = 1;
}
