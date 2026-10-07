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

app.get('/', (req, res) => {
  res.render('modeller', { vite: true });
});

app.listen(3000, () => {
  console.log('App running at http://localhost:3000');
});