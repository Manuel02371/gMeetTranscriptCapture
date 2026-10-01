/**
 * A DOM small enough to pin selector behaviour, and no larger.
 *
 * The container strategies in content.js are selector strings, so the only
 * honest test of "does this find a German caption region" is one that resolves
 * real CSS attribute selectors. jsdom would do it, but this repo has no
 * dependencies and no build step on purpose, so the handful of selector forms
 * actually used are matched here:
 *
 *   [attr]   [attr="v"]   [attr*="v"]   [attr*="v" i]   and compounds of those
 *
 * Anything else throws rather than silently matching nothing — a selector form
 * this matcher does not understand must not pass as "no match".
 */

const ATTR_RE = /\[([a-zA-Z-]+)(?:(\*?=)"([^"]*)"(\s+i)?)?\]/y;

/** Parse one compound selector ([role="region"][aria-label*="x" i]) into clauses. */
function parseCompound(selector) {
  const sel = selector.trim();
  const clauses = [];
  ATTR_RE.lastIndex = 0;
  let pos = 0;
  while (pos < sel.length) {
    ATTR_RE.lastIndex = pos;
    const m = ATTR_RE.exec(sel);
    if (!m) throw new Error(`fake-dom: unsupported selector syntax: ${selector}`);
    clauses.push({
      name: m[1],
      op: m[2] || null,            // null = attribute presence only
      value: m[3] ?? null,
      ci: Boolean(m[4]),
    });
    pos = ATTR_RE.lastIndex;
  }
  if (!clauses.length) throw new Error(`fake-dom: unsupported selector: ${selector}`);
  return clauses;
}

function matchesCompound(el, clauses) {
  return clauses.every(c => {
    const actual = el.getAttribute(c.name);
    if (actual === null) return false;
    if (c.op === null) return true;
    const a = c.ci ? actual.toLowerCase() : actual;
    const b = c.ci ? c.value.toLowerCase() : c.value;
    return c.op === '*=' ? a.includes(b) : a === b;
  });
}

function matches(el, selector) {
  return selector.split(',').some(part => matchesCompound(el, parseCompound(part)));
}

/**
 * @param {string} tag
 * @param {object} attrs      aria-label, role, jsname, …
 * @param {Array|string} kids child elements, or this element's own text
 */
function el(tag, attrs = {}, kids = []) {
  const children = typeof kids === 'string' ? [] : kids;
  const ownText = typeof kids === 'string' ? kids : '';

  const node = {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    children,
    parentElement: null,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    get textContent() {
      return ownText + children.map(c => c.textContent).join(' ');
    },
    matches: (selector) => matches(node, selector),
    closest(selector) {
      for (let cur = node; cur; cur = cur.parentElement) {
        if (matches(cur, selector)) return cur;
      }
      return null;
    },
    querySelector: (selector) => descendants(node).find(d => matches(d, selector)) || null,
    querySelectorAll: (selector) => descendants(node).filter(d => matches(d, selector)),
  };
  for (const kid of children) kid.parentElement = node;
  return node;
}

function descendants(node) {
  return node.children.flatMap(c => [c, ...descendants(c)]);
}

/** A document stub over `root`, shaped like the one in load-content-script.js. */
function fakeDocument(root) {
  const all = () => [root, ...descendants(root)];
  return {
    body: root,
    activeElement: null,
    documentElement: root,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    querySelector: (selector) => all().find(d => matches(d, selector)) || null,
    querySelectorAll: (selector) => all().filter(d => matches(d, selector)),
  };
}

module.exports = { el, fakeDocument, matches };
