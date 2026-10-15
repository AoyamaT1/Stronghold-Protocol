import fs from 'node:fs';

function cleanNum(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return v;
  if (Number.isInteger(v) || Math.abs(v) >= 1e6) return v;
  return Math.round(v * 1e6) / 1e6;
}

function formatValue(v, fmt) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v);
  if (!fmt) return String(cleanNum(v));
  const pct = fmt.endsWith('%');
  const core = pct ? fmt.slice(0, -1) : fmt;
  const decimals = core.includes('.') ? core.split('.')[1].length : 0;
  const x = pct ? v * 100 : v;
  const rounded = Math.sign(x) * Math.round(Math.abs(x) * 10 ** decimals + 1e-9) / 10 ** decimals;
  return rounded.toFixed(decimals) + (pct ? '%' : '');
}

function unescapeNewlines(s) { return typeof s === 'string' ? s.replace(/\\n/g, '\n') : s; }

function stripRich(s) {
  if (typeof s !== 'string') return s ?? null;
  return unescapeNewlines(s)
    .replace(/<[@$#][^<>]*>/g, '')
    .replace(/<\/>/g, '')
    .replace(/<\/?color[^<>]*>/gi, '')
    .replace(/<\/?[bi]>/gi, '');
}

function richRaw(s) { return typeof s === 'string' ? unescapeNewlines(s) : s ?? null; }

function resolvePlaceholders(text, bb, bbStr = {}, label = '') {
  if (typeof text !== 'string') return text ?? null;
  const lower = new Map();
  for (const [k, v] of Object.entries(bb || {})) lower.set(k.toLowerCase(), v);
  const lowerStr = new Map();
  for (const [k, v] of Object.entries(bbStr || {})) lowerStr.set(k.toLowerCase(), v);
  return text.replace(/\{(-?)([^{}:]+)(?::([^{}]+))?\}/g, (m, neg, key, fmt) => {
    const k = key.trim().toLowerCase();
    if (lowerStr.has(k) && (!lower.has(k) || !fmt)) return lowerStr.get(k);
    if (lower.has(k)) {
      const v = lower.get(k);
      return formatValue(neg ? -v : v, fmt);
    }
    console.warn(`unresolved placeholder ${m} in ${label}`);
    return m;
  });
}

function textPair(raw, bb, bbStr, label) {
  const resolved = bb ? resolvePlaceholders(richRaw(raw), bb, bbStr, label) : richRaw(raw);
  return { desc: stripRich(resolved), descRaw: resolved };
}

const chessPath = 'mods/ave-mujica/data/chess.json';
const data = JSON.parse(fs.readFileSync(chessPath, 'utf8'));

for (const [id, c] of Object.entries(data)) {
  // Format all skills in skills array
  if (Array.isArray(c.skills)) {
    for (const s of c.skills) {
      const raw = s.descRaw || s.desc;
      const pair = textPair(raw, s.bb, s.bbStr, `${id}.${s.skillId}`);
      s.desc = pair.desc;
      s.descRaw = pair.descRaw;
    }
  }

  // Format root default skill
  if (c.skill) {
    const raw = c.skill.descRaw || c.skill.desc;
    const pair = textPair(raw, c.skill.bb, c.skill.bbStr, `${id}.${c.skill.skillId}`);
    c.skill.desc = pair.desc;
    c.skill.descRaw = pair.descRaw;
  }

  // Format trait
  if (c.trait) {
    const raw = c.trait.descRaw || c.trait.desc;
    const pair = textPair(raw, c.trait.bb, c.trait.bbStr, `${id}.trait`);
    c.trait.desc = pair.desc;
    c.trait.descRaw = pair.descRaw;
  }
  if (c.traitBase) {
    const raw = c.traitBase.descRaw || c.traitBase.desc;
    const pair = textPair(raw, c.traitBase.bb, c.traitBase.bbStr, `${id}.traitBase`);
    c.traitBase.desc = pair.desc;
    c.traitBase.descRaw = pair.descRaw;
  }

  // Format modules traitOverride
  if (Array.isArray(c.modules)) {
    for (const m of c.modules) {
      if (m.traitOverride) {
        const raw = m.traitOverride.descRaw || m.traitOverride.desc;
        const pair = textPair(raw, m.traitOverride.bb, m.traitOverride.bbStr, `${id}.${m.uniEquipId}.traitOverride`);
        m.traitOverride.desc = pair.desc;
        m.traitOverride.descRaw = pair.descRaw;
      }
    }
  }
}

fs.writeFileSync(chessPath, JSON.stringify(data, null, 2), 'utf8');
console.log('Successfully formatted all skill and module descriptions in mods/ave-mujica/data/chess.json!');
