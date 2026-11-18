'use strict';
const session = require('express-session');

class PostgresSessionStore extends session.Store {
  constructor(sql, options = {}) {
    super();
    this.sql = sql;
    this.ttlMs = options.ttlMs || 7 * 24 * 60 * 60 * 1000;
  }

  async init() {
    await this.sql\`CREATE TABLE IF NOT EXISTS uranium.web_sessions (
      sid text PRIMARY KEY,
      sess jsonb NOT NULL,
      expire timestamptz NOT NULL
    )\`;
    await this.sql\`CREATE INDEX IF NOT EXISTS uranium_web_sessions_expire_idx ON uranium.web_sessions (expire)\`;
    await this.pruneExpired();
  }

  expiry(sess) {
    const explicit = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : 0;
    const maxAge = Number(sess?.cookie?.maxAge);
    const value = explicit || (Number.isFinite(maxAge) && maxAge > 0 ? Date.now() + maxAge : Date.now() + this.ttlMs);
    return new Date(Math.max(Date.now() + 1000, value));
  }

  get(sid, callback) {
    (async () => {
      const rows = await this.sql\`SELECT sess FROM uranium.web_sessions WHERE sid = ${sid} AND expire > now() LIMIT 1\`;
      return rows[0]?.sess || null;
    })().then(value => callback(null, value), callback);
  }

  set(sid, sess, callback = () => {}) {
    this.sql\`INSERT INTO uranium.web_sessions (sid, sess, expire)
      VALUES (${sid}, ${this.sql.json(sess)}, ${this.expiry(sess)})
      ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire\`
      .then(() => callback(null), callback);
  }

  touch(sid, sess, callback = () => {}) {
    this.sql\`UPDATE uranium.web_sessions SET expire = ${this.expiry(sess)} WHERE sid = ${sid}\`
      .then(() => callback(null), callback);
  }

  destroy(sid, callback = () => {}) {
    this.sql\`DELETE FROM uranium.web_sessions WHERE sid = ${sid}\`
      .then(() => callback(null), callback);
  }

  async pruneExpired() {
    await this.sql\`DELETE FROM uranium.web_sessions WHERE expire <= now()\`;
  }
}

module.exports = PostgresSessionStore;
