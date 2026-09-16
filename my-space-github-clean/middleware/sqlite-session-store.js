// SQLite 共享会话存储 - 支持 PM2 cluster 多进程
const session = require('express-session');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class SQLiteStore extends session.Store {
  constructor(options = {}) {
    super();
    const dbPath = options.dbPath || path.join(__dirname, '..', 'data', 'sessions.db');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired INTEGER NOT NULL
      )
    `);
    this.ttl = options.ttl || 7 * 24 * 60 * 60 * 1000;
    // 每小时清理过期会话
    this._cleanupTimer = setInterval(() => this.cleanup(), 60 * 60 * 1000);
    if (this._cleanupTimer.unref) this._cleanupTimer.unref();
  }

  set(sid, sess, callback) {
    try {
      const maxAge = sess.cookie && sess.cookie.maxAge;
      const expired = maxAge ? Date.now() + maxAge : Date.now() + this.ttl;
      this.db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)')
        .run(sid, JSON.stringify(sess), expired);
      callback && callback(null);
    } catch (err) {
      callback && callback(err);
    }
  }

  get(sid, callback) {
    try {
      const row = this.db.prepare('SELECT sess, expired FROM sessions WHERE sid = ?').get(sid);
      if (!row) return callback(null, null);
      if (row.expired < Date.now()) {
        this.destroy(sid);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.sess));
    } catch (err) {
      callback(err);
    }
  }

  destroy(sid, callback) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback && callback(null);
    } catch (err) {
      callback && callback(err);
    }
  }

  touch(sid, sess, callback) {
    try {
      const maxAge = sess.cookie && sess.cookie.maxAge;
      const expired = maxAge ? Date.now() + maxAge : Date.now() + this.ttl;
      this.db.prepare('UPDATE sessions SET expired = ? WHERE sid = ?').run(expired, sid);
      callback && callback(null);
    } catch (err) {
      callback && callback(err);
    }
  }

  cleanup() {
    try {
      this.db.prepare('DELETE FROM sessions WHERE expired < ?').run(Date.now());
    } catch (e) { /* ignore */ }
  }
}

module.exports = SQLiteStore;
