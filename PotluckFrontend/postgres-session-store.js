import session from 'express-session';

export class PostgresSessionStore extends session.Store {
  constructor(pool) {
    super();
    this.pool = pool;
  }

  get(sid, callback) {
    this.pool.query(
      'SELECT sess FROM user_sessions WHERE sid = $1 AND expire > NOW()',
      [sid],
    ).then(({ rows }) => callback(null, rows[0]?.sess))
      .catch(callback);
  }

  set(sid, sess, callback) {
    const expires = sess.cookie?.expires
      ? new Date(sess.cookie.expires)
      : new Date(Date.now() + (sess.cookie?.maxAge ?? 24 * 60 * 60 * 1000));
    this.pool.query(
      `INSERT INTO user_sessions (sid, sess, expire)
       VALUES ($1, $2, $3)
       ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`,
      [sid, sess, expires],
    ).then(() => callback(null))
      .catch(callback);
  }

  touch(sid, sess, callback) {
    const expires = sess.cookie?.expires
      ? new Date(sess.cookie.expires)
      : new Date(Date.now() + (sess.cookie?.maxAge ?? 24 * 60 * 60 * 1000));
    this.pool.query(
      'UPDATE user_sessions SET sess = $2, expire = $3 WHERE sid = $1',
      [sid, sess, expires],
    ).then(() => callback(null))
      .catch(callback);
  }

  destroy(sid, callback) {
    this.pool.query('DELETE FROM user_sessions WHERE sid = $1', [sid])
      .then(() => callback(null))
      .catch(callback);
  }

  clear(callback) {
    this.pool.query('DELETE FROM user_sessions')
      .then(() => callback(null))
      .catch(callback);
  }

  length(callback) {
    this.pool.query('SELECT COUNT(*)::integer AS count FROM user_sessions')
      .then(({ rows }) => callback(null, rows[0].count))
      .catch(callback);
  }
}
