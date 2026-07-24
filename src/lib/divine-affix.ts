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
 *
 * For mageslegacy: the pool contains the full "Legacy of X" base names.
 * The parenthetical annotation (e.g. Amethyst-Topaz) is regenerated from
 * a separate annotation pool — both the legacy type AND the annotation
 * reroll independently, matching poe2db's Divine Orb behaviour where
 * each Legacy of… modifier is a distinct mod that can change to any
 * other Legacy on a Divine.
 */
const UNSCALABLE_VARIANT_POOLS: Record<string, string[]> = {
  mageslegacy: [
    'Legacy of Diamond', 'Legacy of Gold', 'Legacy of Jade',
    'Legacy of Quicksilver', 'Legacy of Ruby', 'Legacy of Sapphire',
    'Legacy of Silver', 'Legacy of Stibnite', 'Legacy of Sulphur',
    'Legacy of Topaz', 'Legacy of Amethyst',
  ],
};

const MAGESLEGACY_ANNOTATIONS = [
  'Amethyst-Topaz', 'Ruby-Sapphire', 'Sulphur-Silver', 'Gold-Diamond',
  'Amethyst', 'Topaz', 'Ruby', 'Sapphire', 'Sulphur', 'Silver',
  'Gold', 'Diamond', 'Jade', 'Quicksilver', 'Stibnite',
];

/**
 * For mageslegacy-style mods: rerolls the entire "Legacy of X" base name
 * AND regenerates the parenthetical annotation.  If the name doesn't match
 * the expected `Legacy of <Type>(<Annotation>)` pattern the name is unchanged.
 */
export function divineVariantAnnotation(
  name: string,
  poolKey: string,
): { name: string; changed: boolean } {
  const pool = UNSCALABLE_VARIANT_POOLS[poolKey];
  if (!pool || pool.length < 2) return { name, changed: false };

  // Match "Legacy of Diamond(Amethyst-Topaz)" → base="Legacy of Diamond", annot="Amethyst-Topaz"
  const m = name.match(/^(Legacy of \w+)(\([^)]+\))$/);
  if (!m) return { name, changed: false };
  const currentBase = m[1];
  const currentAnnot = m[2].slice(1, -1); // strip parens

  // Pick a different legacy type
  const otherBases = pool.filter(v => v !== currentBase);
  if (otherBases.length === 0) return { name, changed: false };
  const newBase = otherBases[Math.floor(Math.random() * otherBases.length)];

  // Generate a new annotation (may be same as old — that's fine)
  const newAnnot = MAGESLEGACY_ANNOTATIONS[
    Math.floor(Math.random() * MAGESLEGACY_ANNOTATIONS.length)
  ];

  const changed = newBase !== currentBase || newAnnot !== currentAnnot;
  return {
    name: newBase + '(' + newAnnot + ')',
    changed,
  };
}
