/**
 * Analytics — Simulated Telemetry Layer
 *
 * NFR: Log a structured ping to the console whenever a primary
 * action is completed.  Format:
 *   [Analytics] User interacted with Redis Caching | <event>
 *
 * In production this would POST to an analytics endpoint.
 */

const Analytics = (() => {

  const SESSION_ID = 'sess_' + Math.random().toString(36).slice(2, 10);
  const USER_AGENT = navigator.userAgent.slice(0, 50);

  const EVENT_TYPES = Object.freeze({
    SET:    'CACHE_SET',
    GET:    'CACHE_GET',
    DELETE: 'CACHE_DELETE',
    SEARCH: 'CACHE_SEARCH',
    EXPIRE: 'CACHE_EXPIRE',
    FLUSH:  'CACHE_FLUSH',
    PERSIST:'CACHE_PERSIST',
    VIEW:   'PAGE_VIEW',
  });

  /**
   * Core ping function
   * @param {string} eventType — one of EVENT_TYPES
   * @param {object} meta      — additional context
   */
  function ping(eventType, meta = {}) {
    const payload = {
      event:     eventType,
      sessionId: SESSION_ID,
      timestamp: new Date().toISOString(),
      ...meta,
    };

    // Primary telemetry log (NFR requirement)
    console.log(
      `%c[Analytics]%c User interacted with Redis Caching | ${eventType}`,
      'color:#4A9EF7;font-weight:bold',
      'color:inherit',
      payload
    );
  }

  function onSet(key, hasTTL)   { ping(EVENT_TYPES.SET,    { key, hasTTL }); }
  function onGet(key, hit)       { ping(EVENT_TYPES.GET,    { key, cacheHit: hit }); }
  function onDelete(key)         { ping(EVENT_TYPES.DELETE, { key }); }
  function onSearch(pattern, count) { ping(EVENT_TYPES.SEARCH, { pattern, resultsCount: count }); }
  function onExpire(key, ttl)    { ping(EVENT_TYPES.EXPIRE, { key, newTTL: ttl }); }
  function onFlush(count)        { ping(EVENT_TYPES.FLUSH,  { keysCleared: count }); }
  function onPersist(key)        { ping(EVENT_TYPES.PERSIST,{ key }); }
  function onPageView(panel)     { ping(EVENT_TYPES.VIEW,   { panel }); }

  return { onSet, onGet, onDelete, onSearch, onExpire, onFlush, onPersist, onPageView, EVENT_TYPES };
})();

window.Analytics = Analytics;
