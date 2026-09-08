'use strict';
// CLAIM_GUARD — blocks unsupported claims in generation prompts and in text the model rendered into the
// image, unless the claim originates from USER_PROVIDED_FACTS (or approved supported input). Deterministic.
// Categories: medical, guarantee, certification, testimonial/review, numeric performance, price/promo,
// legal, logo/brand-mark.
const PATTERNS = {
  medical: [/\bcure(s|d)?\b/i, /\bclinically proven\b/i, /\bpain[- ]free\b/i, /\bpermanent(ly)?\b/i, /\bmedically\b/i, /\bFDA\b/i],
  guarantee: [/\bguarantee(d|s)?\b/i, /\b100%\b/, /\brisk[- ]free\b/i, /\bmoney[- ]back\b/i],
  certification: [/\bcertified\b/i, /\baccredited\b/i, /\bofficial\b/i, /\bapproved by\b/i],
  testimonial: [/\btestimonial\b/i, /\breview(s)?\b/i, /\brated\b/i, /\bcustomers? say\b/i, /"[^"]{8,}"\s*[—-]\s*\w/],
  numeric_performance: [/\b\d+%\b/, /\bx\d+\b/i, /\bnº?\s?1\b/i, /\bnumber one\b/i, /\btop[- ]rated\b/i, /\bbest[- ]selling\b/i],
  price_promo: [/\$\s?\d/, /\b\d+\s?(usd|eur|mxn|€|£)\b/i, /\b\d+%\s?off\b/i, /\bdiscount\b/i, /\bsale\b/i, /\bfree\b/i],
  legal: [/\bwarranty\b/i, /\bterms and conditions\b/i, /\blegally\b/i, /\bpatented\b/i],
  logo: [/\blogo\b/i, /\btrademark\b/i, /\b®\b/, /\b™\b/],
};

// userFacts: { allow_claims:bool, approved_claims:[strings] }. approved substrings are allowed through.
function isApproved(text, userFacts) {
  if (!userFacts) return false;
  if (userFacts.allow_claims) return true;
  const approved = (userFacts.approved_claims || []).map(s => String(s).toLowerCase());
  const t = String(text).toLowerCase();
  return approved.some(a => a && t.includes(a));
}

// Scan a blob of text. Returns { clean, violations:[{category, match, text}] }.
function scan(text, userFacts) {
  const violations = [];
  const s = String(text || '');
  for (const [cat, regexes] of Object.entries(PATTERNS)) {
    for (const re of regexes) {
      const m = re.exec(s);
      if (m && !isApproved(m[0], userFacts)) violations.push({ category: cat, match: m[0], context: s.slice(Math.max(0, m.index - 20), m.index + 30) });
    }
  }
  return { clean: violations.length === 0, violations };
}

// Guard a full generation request + any generated_text array. Returns aggregate result.
function guard({ prompt, overlay, generated_text, user_facts }) {
  const targets = [];
  if (prompt) targets.push({ where: 'prompt', text: prompt });
  if (overlay) for (const k of ['headline', 'supporting_copy', 'cta']) if (overlay[k]) targets.push({ where: 'overlay.' + k, text: overlay[k] });
  for (const g of generated_text || []) targets.push({ where: 'generated_text', text: g.text, claim_like: g.claim_like });
  const all = [];
  for (const t of targets) { const r = scan(t.text, user_facts); for (const v of r.violations) all.push(Object.assign({ where: t.where }, v)); }
  return { clean: all.length === 0, violations: all, blocked_categories: Array.from(new Set(all.map(v => v.category))) };
}

module.exports = { scan, guard, isApproved, PATTERNS };
