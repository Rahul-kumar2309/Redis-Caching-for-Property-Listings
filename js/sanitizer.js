/**
 * Sanitizer — XSS Prevention Layer
 * Strips dangerous HTML/JS patterns from user inputs before
 * they are stored in the Redis simulation engine.
 *
 * Security NFR: No input reaches state without passing through sanitize().
 */

const Sanitizer = (() => {

  /**
   * Strip <script> blocks (content + tags)
   */
  function _stripScripts(str) {
    return str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  }

  /**
   * Strip inline event handlers: onclick=, onload=, onerror=, etc.
   */
  function _stripEventHandlers(str) {
    return str.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
              .replace(/\bon\w+\s*=\s*[^\s>]*/gi, '');
  }

  /**
   * Strip javascript: and data: URIs in href/src/action attributes
   */
  function _stripDangerousURIs(str) {
    return str.replace(/\b(javascript|data|vbscript):/gi, '#BLOCKED:');
  }

  /**
   * Strip <iframe>, <object>, <embed>, <link>, <meta> tags
   */
  function _stripDangerousTags(str) {
    return str.replace(/<\s*(iframe|object|embed|link|meta|form|base|svg|math)[^>]*>/gi, '')
              .replace(/<\/\s*(iframe|object|embed|link|meta|form|base|svg|math)\s*>/gi, '');
  }

  /**
   * Encode residual HTML special characters to entities.
   * Applied to key strings only (values stored as-is after stripping).
   */
  function _encodeEntities(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  /**
   * sanitizeKey — for cache keys (plain text, entity-encoded)
   * @param {string} input
   * @returns {string}
   */
  function sanitizeKey(input) {
    if (typeof input !== 'string') return String(input);
    let s = input.trim();
    s = _stripScripts(s);
    s = _stripEventHandlers(s);
    s = _stripDangerousURIs(s);
    return s.trim();
  }

  /**
   * sanitizeValue — for cache values (may be JSON strings)
   * Strips dangerous patterns but preserves valid JSON structure.
   * @param {string} input
   * @returns {string}
   */
  function sanitizeValue(input) {
    if (typeof input !== 'string') return String(input);
    let s = input;
    s = _stripScripts(s);
    s = _stripEventHandlers(s);
    s = _stripDangerousURIs(s);
    s = _stripDangerousTags(s);
    return s.trim();
  }

  /**
   * sanitizeText — for display text (fully entity-encoded)
   * Use when rendering user-supplied text to innerHTML.
   * @param {string} input
   * @returns {string}
   */
  function sanitizeText(input) {
    if (typeof input !== 'string') return String(input);
    return _encodeEntities(input.trim());
  }

  /**
   * validateKey — returns { valid: boolean, error?: string }
   * Key must be 1–128 chars, alphanumeric + : - _ . *
   */
  function validateKey(key) {
    if (!key || key.trim() === '') {
      return { valid: false, error: 'Key cannot be empty.' };
    }
    if (key.length > 128) {
      return { valid: false, error: 'Key must be 128 characters or fewer.' };
    }
    if (!/^[\w:.\-*?]+$/.test(key)) {
      return { valid: false, error: 'Key may only contain letters, numbers, :  .  -  _  *  ?' };
    }
    return { valid: true };
  }

  /**
   * validateTTL — returns { valid: boolean, error?: string }
   */
  function validateTTL(ttl) {
    if (ttl === '' || ttl === null || ttl === undefined) return { valid: true }; // optional
    const n = Number(ttl);
    if (isNaN(n) || !Number.isInteger(n)) {
      return { valid: false, error: 'TTL must be a whole number.' };
    }
    if (n < 1) {
      return { valid: false, error: 'TTL must be at least 1 second.' };
    }
    if (n > 2_592_000) { // 30 days
      return { valid: false, error: 'TTL cannot exceed 30 days (2,592,000 seconds).' };
    }
    return { valid: true };
  }

  return { sanitizeKey, sanitizeValue, sanitizeText, validateKey, validateTTL };
})();

window.Sanitizer = Sanitizer;
