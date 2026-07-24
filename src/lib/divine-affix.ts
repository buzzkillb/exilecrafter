/**
 * Reroll numeric values within an affix name. Handles both formats:
 *   - Rolled:  "+118(100-119) to maximum Life"  ->  "+115(100-119) to maximum Life"
 *   - Template: "(100-119) to maximum Life"     ->  "113(100-119) to maximum Life"
 * Returns the original string unchanged if no numeric range is present.
 */
export function divineAffixName(name: string): { name: string; changed: boolean } {
  var R1 = new RegExp('(\\+?\\d+(?:\\.\\d+)?)\\s*\\(\\s*(\\d+(?:\\.\\d+)?)\\s*[-\\u2014]\\s*(\\d+(?:\\.\\d+)?)\\s*\\)');
  var m = name.match(R1);
  if (m) {
    var min = parseFloat(m[2]);
    var max = parseFloat(m[3]);
    var decimals = (m[2].indexOf('.') !== -1 || m[3].indexOf('.') !== -1) ? 2 : 0;
    var factor = Math.pow(10, decimals);
    var newVal = Math.round((min + Math.random() * (max - min)) * factor) / factor;
    // Preserve leading + sign from the original rolled value
    var sign = m[1].charAt(0) === '+' ? '+' : '';
    return {
      name: name.replace(m[0], m[0].replace(m[1], sign + String(newVal))),
      changed: newVal !== parseFloat(m[1]),
    };
  }

  var R2 = new RegExp('\\(\\s*(\\d+(?:\\.\\d+)?)\\s*[-\\u2014]\\s*(\\d+(?:\\.\\d+)?)\\s*\\)');
  var tm = name.match(R2);
  if (tm) {
    var min2 = parseFloat(tm[1]);
    var max2 = parseFloat(tm[2]);
    var decimals2 = (tm[1].indexOf('.') !== -1 || tm[2].indexOf('.') !== -1) ? 2 : 0;
    var factor2 = Math.pow(10, decimals2);
    var newVal2 = Math.round((min2 + Math.random() * (max2 - min2)) * factor2) / factor2;
    var signTest = new RegExp('^\\+\\d');
    var rolled = signTest.test(name) || name.indexOf('Adds ') === 0 || name.indexOf('Grants ') === 0 || new RegExp('^\\d').test(name)
      ? String(newVal2)
      : (newVal2 >= 0 ? '+' + newVal2 : String(newVal2));
    return {
      name: name.replace(tm[0], rolled + tm[0]),
      changed: true,
    };
  }

  return { name: name, changed: false };
}

/**
 * Known variant sets for unique mods whose wiki annotations carry
 * descriptive type-tags that Divine Orbs can reroll.
 * Each entry maps a wiki descriptiveName (or body-text keyword) to the
 * pool of possible variant tokens that may appear as `(Foo-Bar)` in the
 * rolled name.
 */
const UNSCALABLE_VARIANT_POOLS: Record<string, string[]> = {
  // Mageblood "Legacy of…" mods — the hidden 1-14 internal range
  // maps to these flask-type combinations reported by the wiki.
  mageslegacy: [
    'Diamond', 'Gold', 'Jade', 'Quicksilver', 'Ruby', 'Sapphire',
    'Silver', 'Stibnite', 'Sulphur', 'Topaz', 'Amethyst',
    'Amethyst-Topaz', 'Ruby-Sapphire', 'Sulphur-Silver', 'Gold-Diamond',
  ],
};

/**
 * Pick a random different variant from the pool. If the name has no
 * recognised `(Variant)` annotation the name is unchanged.
 */
export function divineVariantAnnotation(
  name: string,
  poolKey: string,
): { name: string; changed: boolean } {
  const pool = UNSCALABLE_VARIANT_POOLS[poolKey];
  if (!pool || pool.length < 2) return { name, changed: false };

  const m = name.match(/\(([^)]+)\)$/);
  if (!m) return { name, changed: false };
  const current = m[1];

  // Pick a different variant if possible; if the pool is tiny just cycle.
  const others = pool.filter(v => v !== current);
  if (others.length === 0) return { name, changed: false };
  const pick = others[Math.floor(Math.random() * others.length)];
  return {
    name: name.replace(m[0], '(' + pick + ')'),
    changed: true,
  };
}
