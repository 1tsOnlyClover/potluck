import express from 'express';
import { createServer as createViteServer } from 'vite';

const app = express();

app.set('view engine', 'ejs');
app.set('views', './views');

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'custom',
});

app.use(vite.middlewares);


//if first visit, render the register page
app.get('/', (req, res) => {
  res.render('register', { vite: true });
});
//else render the mini maker page
app.get('/create', (req, res) => {
  res.render('mini_maker', { vite: true });
});

app.get('/profile', (req, res) => {
  res.render('profile', { vite: true });
});

app.listen(3000, () => {
  console.log('App running at http://localhost:3000');
});