import express from 'express';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import mysql from 'mysql2';
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from 'vite';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('.env', import.meta.url));
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const missingConfig = ['SESSION_SECRET', 'MYSQL_HOST', 'MYSQL_USER']
  .filter((key) => !process.env[key]);
if (missingConfig.length) {
  throw new Error(`Missing ${missingConfig.join(', ')}. Copy .env.example to .env and fill in your local settings.`);
}

const app = express();

const db = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'potluck',
  waitForConnections: true,
  connectionLimit: 10,
});
const dbPromise = db.promise();

const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({}, db);

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
    const [assets] = await dbPromise.execute(
      'SELECT id, name, scene, thumbnail, updated_at AS updatedAt FROM assets WHERE user_id = ? ORDER BY updated_at DESC',
      [req.session.userId],
    );
    res.json(assets.map((asset) => ({ ...asset, scene: JSON.parse(asset.scene) })));
  } catch (error) {
    console.error('Unable to load assets:', error);
    res.status(500).json({ error: 'Unable to load your assets right now.' });
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
    await dbPromise.execute(
      'INSERT INTO assets (id, user_id, name, scene, thumbnail) VALUES (?, ?, ?, ?, ?)',
      [id, req.session.userId, name, scene, thumbnail],
    );
    res.status(201).json({ id, name });
  } catch (error) {
    console.error('Unable to create asset:', error);
    res.status(500).json({ error: 'Unable to save this asset right now.' });
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
    const [result] = await dbPromise.execute(
      'UPDATE assets SET name = ?, scene = ?, thumbnail = COALESCE(?, thumbnail) WHERE id = ? AND user_id = ?',
      [name, scene, thumbnail, req.params.id, req.session.userId],
    );
    if (result.affectedRows === 0) {
      const [ownedAssets] = await dbPromise.execute(
        'SELECT id FROM assets WHERE id = ? AND user_id = ?',
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
    const [users] = await dbPromise.execute(
      'SELECT id, name, password, description FROM users WHERE name = ? OR email = ? LIMIT 1',
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
    const [result] = await dbPromise.execute(
      'INSERT INTO users (name, password, email, description) VALUES (?, ?, ?, ?)',
      [name, passwordHash, email, description || null],
    );

    await regenerateSession(req);
    req.session.userId = result.insertId;
    req.session.userName = name;
    req.session.description = description;
    await saveSession(req);
    res.redirect('/create');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
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
  await dbPromise.query('SELECT 1');
  const [thumbnailColumn] = await dbPromise.execute(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    ['assets', 'thumbnail'],
  );
  if (!thumbnailColumn.length) {
    await dbPromise.query('ALTER TABLE assets ADD COLUMN thumbnail MEDIUMTEXT NULL AFTER scene');
  }
  app.listen(3000, () => {
    console.log('App running at http://localhost:3000');
  });
} catch (error) {
  console.error('Could not connect to the Potluck MySQL database:', error);
  await dbPromise.end();
  process.exitCode = 1;
}
