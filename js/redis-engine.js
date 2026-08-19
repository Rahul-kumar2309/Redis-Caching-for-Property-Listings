/**
 * RedisEngine — Browser-side Redis simulation layer
 * Persists to localStorage. Supports TTL, namespace isolation,
 * glob-style key search, and runtime hit/miss statistics.
 */

const STORAGE_KEY = '__redis_cache__';
const STATS_KEY   = '__redis_stats__';

class RedisEngine {
  constructor() {
    this._load();
    this._loadStats();
    // Sweep expired keys on boot
    this._evictExpired();
  }

  /* ─── Persistence ─────────────────────────────────────────── */

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this._store = raw ? JSON.parse(raw) : {};
    } catch {
      this._store = {};
    }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._store));
    } catch (e) {
      console.warn('[RedisEngine] localStorage write failed:', e.message);
    }
  }

  _loadStats() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      this._stats = raw ? JSON.parse(raw) : { hits: 0, misses: 0, sets: 0, dels: 0 };
    } catch {
      this._stats = { hits: 0, misses: 0, sets: 0, dels: 0 };
    }
  }

  _saveStats() {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(this._stats));
    } catch { /* non-critical */ }
  }

  /* ─── TTL helpers ─────────────────────────────────────────── */

  _isExpired(entry) {
    if (!entry.expiresAt) return false;
    return Date.now() > entry.expiresAt;
  }

  _evictExpired() {
    let evicted = 0;
    for (const key of Object.keys(this._store)) {
      if (this._isExpired(this._store[key])) {
        delete this._store[key];
        evicted++;
      }
    }
    if (evicted > 0) this._save();
    return evicted;
  }

  /* ─── Core Commands ───────────────────────────────────────── */

  /**
   * SET key value [EX seconds]
   * @returns {{ ok: true }}
   */
  set(key, value, ttlSeconds = null, namespace = 'default') {
    const entry = {
      value,
      namespace,
      createdAt: Date.now(),
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
      ttlSeconds: ttlSeconds || null,
    };
    this._store[key] = entry;
    this._stats.sets++;
    this._save();
    this._saveStats();
    return { ok: true };
  }

  /**
   * GET key
   * @returns {{ found: true, value, meta } | { found: false, reason }}
   */
  get(key) {
    const entry = this._store[key];
    if (!entry) {
      this._stats.misses++;
      this._saveStats();
      return { found: false, reason: 'key_not_exist' };
    }
    if (this._isExpired(entry)) {
      delete this._store[key];
      this._save();
      this._stats.misses++;
      this._saveStats();
      return { found: false, reason: 'expired' };
    }
    this._stats.hits++;
    this._saveStats();
    const ttlRemaining = entry.expiresAt
      ? Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000))
      : null;
    return {
      found: true,
      value: entry.value,
      meta: {
        namespace: entry.namespace,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt,
        ttlRemaining,
      },
    };
  }

  /**
   * DEL key
   * @returns {{ deleted: boolean }}
   */
  del(key) {
    if (!this._store[key]) return { deleted: false };
    delete this._store[key];
    this._stats.dels++;
    this._save();
    this._saveStats();
    return { deleted: true };
  }

  /**
   * EXPIRE key seconds — update TTL on an existing key
   * @returns {{ ok: boolean, reason? }}
   */
  expire(key, seconds) {
    const entry = this._store[key];
    if (!entry) return { ok: false, reason: 'key_not_exist' };
    if (this._isExpired(entry)) {
      delete this._store[key];
      this._save();
      return { ok: false, reason: 'expired' };
    }
    entry.expiresAt  = Date.now() + seconds * 1000;
    entry.ttlSeconds = seconds;
    this._save();
    return { ok: true };
  }

  /**
   * PERSIST key — remove TTL, make key permanent
   */
  persist(key) {
    const entry = this._store[key];
    if (!entry) return { ok: false, reason: 'key_not_exist' };
    entry.expiresAt  = null;
    entry.ttlSeconds = null;
    this._save();
    return { ok: true };
  }

  /**
   * KEYS pattern — glob-style (* and ?) matching
   * @returns {Array<{ key, namespace, ttlRemaining, createdAt }>}
   */
  keys(pattern = '*', namespace = null) {
    this._evictExpired();
    const regex = this._globToRegex(pattern);
    return Object.entries(this._store)
      .filter(([k, v]) => {
        const matchPattern = regex.test(k);
        const matchNs = namespace ? v.namespace === namespace : true;
        return matchPattern && matchNs;
      })
      .map(([k, v]) => ({
        key: k,
        namespace: v.namespace,
        createdAt: v.createdAt,
        expiresAt: v.expiresAt,
        ttlRemaining: v.expiresAt
          ? Math.max(0, Math.round((v.expiresAt - Date.now()) / 1000))
          : null,
        valuePreview: this._preview(v.value),
      }));
  }

  /**
   * FLUSHALL — wipe entire store
   */
  flush() {
    this._store = {};
    this._save();
    return { ok: true };
  }

  /**
   * DBSIZE + stats
   */
  stats() {
    this._evictExpired();
    const allKeys = Object.values(this._store);
    const now = Date.now();
    const withTTL = allKeys.filter(e => e.expiresAt !== null);
    // Rough memory estimate: JSON byte length
    const memBytes = new Blob([JSON.stringify(this._store)]).size;
    return {
      totalKeys:  allKeys.length,
      withTTL:    withTTL.length,
      persistent: allKeys.length - withTTL.length,
      hits:       this._stats.hits,
      misses:     this._stats.misses,
      sets:       this._stats.sets,
      dels:       this._stats.dels,
      hitRate:    this._hitRate(),
      memoryKB:   (memBytes / 1024).toFixed(2),
    };
  }

  /* ─── Utilities ───────────────────────────────────────────── */

  _hitRate() {
    const total = this._stats.hits + this._stats.misses;
    if (total === 0) return '0%';
    return ((this._stats.hits / total) * 100).toFixed(1) + '%';
  }

  _preview(value) {
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return str.length > 60 ? str.slice(0, 60) + '…' : str;
  }

  _globToRegex(pattern) {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp('^' + escaped + '$');
  }

  /**
   * Seed demo data for first-time users
   */
  seedDemo() {
    if (Object.keys(this._store).length > 0) return;
    const listings = [
      { id: 'prop:001', title: '3BHK Sea View Apt', price: 4500000, status: 'active',   agent: 'A-101' },
      { id: 'prop:002', title: 'Studio Downtown',   price: 1200000, status: 'pending',  agent: 'A-102' },
      { id: 'prop:003', title: '4BHK Villa Garden', price: 9800000, status: 'active',   agent: 'A-101' },
      { id: 'prop:004', title: '2BHK Riverside',    price: 3200000, status: 'sold',     agent: 'A-103' },
      { id: 'prop:005', title: 'Office Space CBD',  price: 7500000, status: 'active',   agent: 'A-104' },
    ];
    listings.forEach((l, i) => {
      this.set(`listing:${l.id}`, l, i % 2 === 0 ? 3600 : null, 'listings');
    });
    this.set('session:floor-staff-1', { userId: 'staff-001', role: 'viewer' }, 900, 'sessions');
    this.set('config:cache-version', '2.4.1', null, 'config');
    this.set('stats:daily-views', 142, 86400, 'analytics');
  }
}

// Singleton export
window.RedisEngine = RedisEngine;
