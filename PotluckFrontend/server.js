import express from 'express';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import mysql from 'mysql2';
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from 'vite';

if (!process.env.SESSION_SECRET || !process.env.MYSQL_HOST || !process.env.MYSQL_USER) {
  throw new Error('Set SESSION_SECRET, MYSQL_HOST, and MYSQL_USER before starting the app.');
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

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'custom',
});

app.use(vite.middlewares);

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

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
      'SELECT id, name, password FROM users WHERE name = ? OR email = ? LIMIT 1',
      [identity, identity],
    );
    const user = users[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).render('login', { vite: true, error: 'Invalid name/email or password.' });
    }

    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.userName = user.name;
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
  res.render('profile', { vite: true, userName: req.session.userName });
});

app.get('/login', (req, res) => {
  res.render('login', { vite: true, error: null });
});

app.get('/signup', (req, res) => {
  res.render('register', { vite: true, error: null });
});

try {
  await dbPromise.query('SELECT 1');
  app.listen(3000, () => {
    console.log('App running at http://localhost:3000');
  });
} catch (error) {
  console.error('Could not connect to the Potluck MySQL database:', error);
  await dbPromise.end();
  process.exitCode = 1;
}
