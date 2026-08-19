/**
 * app.js — Redis Caching Dashboard
 * Main application controller: UI binding, panel navigation,
 * form validation, async simulation, audit log.
 */

/* ─── Bootstrap ─────────────────────────────────────────────── */

const redis    = new RedisEngine();
const audit    = [];        // in-memory audit log

// Seed demo data on first load
redis.seedDemo();

// ── Panel Navigation ──────────────────────────────────────────

const panels   = document.querySelectorAll('.panel');
const navItems = document.querySelectorAll('.nav-item[data-panel]');

function showPanel(panelId) {
  panels.forEach(p => p.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));

  const target = document.getElementById(`panel-${panelId}`);
  const navBtn = document.querySelector(`.nav-item[data-panel="${panelId}"]`);

  if (target) target.classList.add('active');
  if (navBtn) navBtn.classList.add('active');

  // Update breadcrumb
  const label = navBtn ? navBtn.querySelector('.nav-label')?.textContent : panelId;
  document.getElementById('breadcrumb-current').textContent = label;

  Analytics.onPageView(panelId);

  // Refresh panel-specific content
  if (panelId === 'dashboard') refreshDashboard();
  if (panelId === 'keys')      renderKeyBrowser();
  if (panelId === 'audit')     renderAuditLog();
}

navItems.forEach(btn => {
  btn.addEventListener('click', () => showPanel(btn.dataset.panel));
});

// ── Clock ──────────────────────────────────────────────────────

function updateClock() {
  const el = document.getElementById('topbar-time');
  if (el) el.textContent = new Date().toLocaleTimeString();
}
setInterval(updateClock, 1000);
updateClock();

// ── Connection Status (Simulated) ──────────────────────────────

function checkConnectivity() {
  const dot   = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  if (!dot || !label) return;
  const online = navigator.onLine;
  dot.className   = 'status-dot' + (online ? '' : ' offline');
  label.textContent = online ? 'Connected · localStorage' : 'Offline — Read Only';
}

window.addEventListener('online',  checkConnectivity);
window.addEventListener('offline', checkConnectivity);
checkConnectivity();

/* ─── Toast System ───────────────────────────────────────────── */

function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');

  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  toast.innerHTML = `
    <span style="font-size:16px">${icons[type] || 'ℹ'}</span>
    <span>${sanitizeForDisplay(message)}</span>`;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration + 300);
}

/* ─── Audit Log ──────────────────────────────────────────────── */

function logAudit(action, key, extra = {}) {
  audit.unshift({ action, key, extra, ts: new Date() });
  if (audit.length > 200) audit.pop();
  // Update badge
  const badge = document.getElementById('audit-badge');
  if (badge) badge.textContent = audit.length;
}

function renderAuditLog() {
  const container = document.getElementById('audit-log-list');
  if (!container) return;

  if (audit.length === 0) {
    container.innerHTML = emptyState('📋', 'No Actions Yet', 'Actions you perform will appear here.');
    return;
  }

  container.innerHTML = audit.slice(0, 100).map(entry => `
    <div class="log-entry">
      <div class="log-dot ${entry.action.toLowerCase()}"></div>
      <div class="log-content">
        <div class="flex items-center gap-3">
          <span class="log-action">${entry.action}</span>
          ${entry.key ? `<span class="log-key">${sanitizeForDisplay(entry.key)}</span>` : ''}
        </div>
        <div class="log-time">${entry.ts.toLocaleTimeString()} · ${entry.ts.toLocaleDateString()}</div>
      </div>
    </div>
  `).join('');
}

/* ─── Dashboard ──────────────────────────────────────────────── */

function refreshDashboard() {
  const s = redis.stats();

  setText('stat-total-keys',  s.totalKeys);
  setText('stat-with-ttl',    s.withTTL);
  setText('stat-persistent',  s.persistent);
  setText('stat-memory',      s.memoryKB + ' KB');
  setText('stat-hits',        s.hits);
  setText('stat-misses',      s.misses);
  setText('stat-sets',        s.sets);
  setText('stat-dels',        s.dels);
  setText('stat-hit-rate',    s.hitRate);

  // Ring chart
  const pct = parseFloat(s.hitRate) || 0;
  const dashoffset = 201 - (201 * pct / 100);
  const ring = document.getElementById('ring-fill');
  if (ring) ring.style.strokeDashoffset = dashoffset;
}

/* ─── SET Panel ──────────────────────────────────────────────── */

(function initSetPanel() {
  const form = document.getElementById('form-set');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const keyEl    = document.getElementById('set-key');
    const valueEl  = document.getElementById('set-value');
    const ttlEl    = document.getElementById('set-ttl');
    const nsEl     = document.getElementById('set-namespace');

    const rawKey   = keyEl.value.trim();
    const rawValue = valueEl.value.trim();
    const rawTTL   = ttlEl.value.trim();
    const ns       = nsEl.value || 'default';

    // Reset validation state
    clearFieldError(keyEl);
    clearFieldError(valueEl);
    clearFieldError(ttlEl);

    let valid = true;

    // Validate key
    const keyCheck = Sanitizer.validateKey(rawKey);
    if (!keyCheck.valid) {
      showFieldError(keyEl, keyCheck.error);
      valid = false;
    }

    // Validate value
    if (!rawValue) {
      showFieldError(valueEl, 'Value cannot be empty.');
      valid = false;
    }

    // Validate TTL
    const ttlCheck = Sanitizer.validateTTL(rawTTL);
    if (!ttlCheck.valid) {
      showFieldError(ttlEl, ttlCheck.error);
      valid = false;
    }

    if (!valid) {
      showToast('Please fix the highlighted errors.', 'error');
      return;
    }

    // Sanitize inputs
    const safeKey   = Sanitizer.sanitizeKey(rawKey);
    const safeValue = Sanitizer.sanitizeValue(rawValue);
    const ttlSecs   = rawTTL ? parseInt(rawTTL, 10) : null;

    // Simulate network latency (bad-connectivity NFR)
    await simulateLatency(form);

    redis.set(safeKey, safeValue, ttlSecs, ns);
    logAudit('SET', safeKey, { ttl: ttlSecs, ns });
    Analytics.onSet(safeKey, !!ttlSecs);

    showToast(`Key "${safeKey}" cached successfully.`, 'success');

    // Reset form
    form.reset();
    document.getElementById('set-ttl-display').textContent = '';
  });

  // TTL preview
  document.getElementById('set-ttl')?.addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    const el = document.getElementById('set-ttl-display');
    if (el) el.textContent = isNaN(v) ? '' : formatTTL(v);
  });
})();

/* ─── GET Panel ──────────────────────────────────────────────── */

(function initGetPanel() {
  const form = document.getElementById('form-get');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const keyEl  = document.getElementById('get-key');
    const rawKey = keyEl.value.trim();

    clearFieldError(keyEl);

    const keyCheck = Sanitizer.validateKey(rawKey);
    if (!keyCheck.valid) {
      showFieldError(keyEl, keyCheck.error);
      return;
    }

    await simulateLatency(form);

    const safeKey = Sanitizer.sanitizeKey(rawKey);
    const result  = redis.get(safeKey);

    logAudit('GET', safeKey);
    Analytics.onGet(safeKey, result.found);

    renderGetResult(result, safeKey);
  });
})();

function renderGetResult(result, key) {
  const box = document.getElementById('get-result-box');
  if (!box) return;

  if (result.found) {
    const ttlLine = result.meta.ttlRemaining !== null
      ? `TTL Remaining : ${formatTTL(result.meta.ttlRemaining)}`
      : `TTL           : (no expiry — persistent)`;
    const pct = result.meta.expiresAt && result.meta.ttlRemaining !== null
      ? Math.round((result.meta.ttlRemaining / (result.meta.expiresAt - result.meta.createdAt) * 1000) * 100)
      : 100;

    box.className = 'result-box hit';
    box.innerHTML = `
      <span class="result-label">✓ Cache Hit</span>
      <div>Key   : <strong>${sanitizeForDisplay(key)}</strong></div>
      <div>Value : <strong>${sanitizeForDisplay(String(result.value))}</strong></div>
      <div>NS    : ${sanitizeForDisplay(result.meta.namespace)}</div>
      <div>${ttlLine}</div>
      ${result.meta.expiresAt ? `
        <div class="ttl-bar-wrap mt-4">
          <div class="ttl-bar ${pct < 20 ? 'critical' : pct < 50 ? 'low' : ''}"
               style="width:${Math.min(100,pct)}%"></div>
        </div>` : ''}
    `;
  } else {
    const reasons = {
      key_not_exist: `The key "${key}" does not exist in the cache.`,
      expired:       `The key "${key}" existed but has expired (TTL elapsed).`,
    };
    box.className = 'result-box miss';
    box.innerHTML = `
      <span class="result-label">✕ Cache Miss</span>
      <div>${reasons[result.reason] || 'Key not found.'}</div>
    `;
  }
}

/* ─── Keys Browser Panel ─────────────────────────────────────── */

let keysFilter = { pattern: '*', namespace: null };

(function initKeysPanel() {
  const searchInput = document.getElementById('keys-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(async (e) => {
      keysFilter.pattern = e.target.value.trim() || '*';
      await simulateLatency(document.getElementById('keys-list-wrap'), 200);
      renderKeyBrowser();
      Analytics.onSearch(keysFilter.pattern, redis.keys(keysFilter.pattern, keysFilter.namespace).length);
    }, 300));
  }
})();

function renderKeyBrowser() {
  const container = document.getElementById('keys-list-wrap');
  if (!container) return;

  const entries = redis.keys(keysFilter.pattern, keysFilter.namespace);

  // Render namespace pills
  renderNamespacePills();

  if (entries.length === 0) {
    container.innerHTML = emptyState('🔍', 'No Cached Keys Found',
      keysFilter.pattern !== '*'
        ? `No keys match the pattern "${keysFilter.pattern}".`
        : 'The cache is empty. Use the SET panel to add entries.');
    return;
  }

  container.innerHTML = entries.map(entry => `
    <div class="key-item" role="row">
      <span class="key-name" title="${sanitizeForDisplay(entry.key)}">${sanitizeForDisplay(entry.key)}</span>
      <span class="key-preview">${sanitizeForDisplay(entry.valuePreview)}</span>
      <span class="badge badge-muted" style="font-size:10px">${sanitizeForDisplay(entry.namespace)}</span>
      <span class="key-ttl ${entry.ttlRemaining === null ? 'no-ttl' : ''}">
        ${entry.ttlRemaining !== null ? '⏱ ' + formatTTL(entry.ttlRemaining) : '∞ persist'}
      </span>
      <div class="key-actions">
        <button class="btn btn-ghost btn-sm"
          aria-label="Get value of ${sanitizeForDisplay(entry.key)}"
          onclick="quickGet('${escapeAttr(entry.key)}')">GET</button>
        <button class="btn btn-danger btn-sm"
          aria-label="Delete key ${sanitizeForDisplay(entry.key)}"
          onclick="deleteKey('${escapeAttr(entry.key)}')">DEL</button>
      </div>
    </div>
  `).join('');

  // Update badge
  const badge = document.getElementById('keys-badge');
  if (badge) badge.textContent = entries.length;
}

function renderNamespacePills() {
  const wrap = document.getElementById('ns-pills');
  if (!wrap) return;

  const all = redis.keys('*');
  const namespaces = [...new Set(all.map(k => k.namespace))];

  wrap.innerHTML = `
    <button class="ns-pill ${keysFilter.namespace === null ? 'active' : ''}"
      aria-pressed="${keysFilter.namespace === null}"
      onclick="filterByNamespace(null)">All</button>
    ${namespaces.map(ns => `
      <button class="ns-pill ${keysFilter.namespace === ns ? 'active' : ''}"
        aria-pressed="${keysFilter.namespace === ns}"
        onclick="filterByNamespace('${escapeAttr(ns)}')">
        ${sanitizeForDisplay(ns)}
      </button>
    `).join('')}
  `;
}

function filterByNamespace(ns) {
  keysFilter.namespace = ns;
  renderKeyBrowser();
}

function quickGet(key) {
  showPanel('get');
  const el = document.getElementById('get-key');
  if (el) {
    el.value = key;
    document.getElementById('form-get').requestSubmit();
  }
}

async function deleteKey(key) {
  await simulateLatency(document.getElementById('keys-list-wrap'), 150);
  const result = redis.del(key);
  if (result.deleted) {
    logAudit('DEL', key);
    Analytics.onDelete(key);
    showToast(`Key "${key}" deleted.`, 'success');
    renderKeyBrowser();
    refreshDashboard();
  } else {
    showToast(`Key "${key}" not found.`, 'warning');
  }
}

/* ─── TTL Manager Panel ──────────────────────────────────────── */

(function initTTLPanel() {
  const form = document.getElementById('form-expire');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const keyEl = document.getElementById('expire-key');
    const ttlEl = document.getElementById('expire-ttl');
    const rawKey = keyEl.value.trim();
    const rawTTL = ttlEl.value.trim();

    clearFieldError(keyEl);
    clearFieldError(ttlEl);

    let valid = true;
    const keyCheck = Sanitizer.validateKey(rawKey);
    if (!keyCheck.valid) { showFieldError(keyEl, keyCheck.error); valid = false; }

    const ttlCheck = Sanitizer.validateTTL(rawTTL);
    if (!ttlCheck.valid || !rawTTL) {
      showFieldError(ttlEl, rawTTL ? ttlCheck.error : 'TTL is required for this action.');
      valid = false;
    }

    if (!valid) return;

    await simulateLatency(form, 200);

    const safeKey = Sanitizer.sanitizeKey(rawKey);
    const result  = redis.expire(safeKey, parseInt(rawTTL, 10));

    if (result.ok) {
      logAudit('EXPIRE', safeKey, { ttl: rawTTL });
      Analytics.onExpire(safeKey, rawTTL);
      showToast(`TTL updated for "${safeKey}".`, 'success');
      form.reset();
    } else {
      const msg = result.reason === 'expired' ? 'Key has already expired.' : 'Key does not exist.';
      showToast(msg, 'error');
    }
  });

  // Persist button
  document.getElementById('btn-persist')?.addEventListener('click', async () => {
    const keyEl  = document.getElementById('expire-key');
    const rawKey = keyEl.value.trim();
    clearFieldError(keyEl);

    const keyCheck = Sanitizer.validateKey(rawKey);
    if (!keyCheck.valid) { showFieldError(keyEl, keyCheck.error); return; }

    await simulateLatency(document.getElementById('form-expire'), 200);

    const safeKey = Sanitizer.sanitizeKey(rawKey);
    const result  = redis.persist(safeKey);

    if (result.ok) {
      logAudit('PERSIST', safeKey);
      Analytics.onPersist(safeKey);
      showToast(`Key "${safeKey}" is now persistent.`, 'success');
    } else {
      showToast('Key not found or already expired.', 'error');
    }
  });
})();

/* ─── Flush Panel ────────────────────────────────────────────── */

document.getElementById('btn-show-flush')?.addEventListener('click', () => {
  const count = redis.keys('*').length;
  document.getElementById('flush-key-count').textContent = count;
  document.getElementById('flush-modal').classList.add('visible');
});

document.getElementById('btn-cancel-flush')?.addEventListener('click', () => {
  document.getElementById('flush-modal').classList.remove('visible');
});

document.getElementById('btn-confirm-flush')?.addEventListener('click', async () => {
  document.getElementById('flush-modal').classList.remove('visible');
  const count = redis.keys('*').length;

  await simulateLatency(document.getElementById('panel-flush'), 400);

  redis.flush();
  logAudit('FLUSH', '*', { keysCleared: count });
  Analytics.onFlush(count);
  showToast(`Cache flushed — ${count} key(s) removed.`, 'warning');
  refreshDashboard();
});

// Close modal on backdrop click
document.getElementById('flush-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.remove('visible');
  }
});

/* ─── Utilities ──────────────────────────────────────────────── */

function simulateLatency(container, ms = 350) {
  return new Promise(resolve => {
    let overlay = container?.querySelector('.loading-overlay');
    if (!overlay) {
      // Add a temporary inline spinner
      const parent = container instanceof HTMLFormElement
        ? container.closest('.card') || container
        : container;
      overlay = document.createElement('div');
      overlay.className = 'loading-overlay visible';
      overlay.innerHTML = '<div class="spinner"></div>';
      overlay.style.position = 'absolute';
      overlay.style.zIndex = '200';
      overlay.style.borderRadius = 'inherit';
      parent.style.position = 'relative';
      parent.appendChild(overlay);
      setTimeout(() => { overlay.remove(); parent.style.position = ''; resolve(); }, ms);
    } else {
      overlay.classList.add('visible');
      setTimeout(() => { overlay.classList.remove('visible'); resolve(); }, ms);
    }
  });
}

function showFieldError(el, message) {
  el.setAttribute('aria-invalid', 'true');
  el.style.borderColor = 'var(--color-danger)';
  el.style.boxShadow   = '0 0 0 3px var(--color-danger-dim)';

  const errEl = el.parentElement?.querySelector('.form-error');
  if (errEl) {
    errEl.textContent = message;
    errEl.classList.add('visible');
  }
}

function clearFieldError(el) {
  el.removeAttribute('aria-invalid');
  el.style.borderColor = '';
  el.style.boxShadow   = '';

  const errEl = el.parentElement?.querySelector('.form-error');
  if (errEl) {
    errEl.textContent = '';
    errEl.classList.remove('visible');
  }
}

function emptyState(icon, title, desc) {
  return `
    <div class="empty-state" role="status" aria-label="${title}">
      <div class="empty-icon" aria-hidden="true">${icon}</div>
      <h3>${title}</h3>
      <p>${desc}</p>
    </div>`;
}

function formatTTL(seconds) {
  if (seconds === null || isNaN(seconds)) return '∞';
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function sanitizeForDisplay(str) {
  return Sanitizer.sanitizeText(String(str));
}

function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/* ─── Init ───────────────────────────────────────────────────── */

// Start on dashboard
showPanel('dashboard');

// Refresh dashboard stats every 30 seconds
setInterval(() => {
  const currentPanel = document.querySelector('.panel.active')?.id;
  if (currentPanel === 'panel-dashboard') refreshDashboard();
}, 30_000);

console.log(
  '%c[Redis Caching Dashboard]%c Application initialized.',
  'color:#4A9EF7;font-weight:bold',
  'color:inherit'
);
