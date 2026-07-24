/**
 * Reroll numeric values within an affix name. Handles both formats:
 *   - Rolled:  "+118(100-119) to maximum Life"  ->  "+115(100-119) to maximum Life"
 *   - Template: "(100-119) to maximum Life"     ->  "113(100-119) to maximum Life"
 * Returns the original string unchanged if no numeric range is present.
 */
export function divineAffixName(name: string): { name: string; changed: boolean } {
  var R1 = new RegExp('(\\+?\\d+(?:\\.\\d+)?)\\s*\\(\\s*(\\d+(?:\\.\\d+)?)\\s*[-\u2014]\\s*(\\d+(?:\\.\\d+)?)\\s*\\)');
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

  var R2 = new RegExp('\\(\\s*(\\d+(?:\\.\\d+)?)\\s*[-\u2014]\\s*(\\d+(?:\\.\\d+)?)\\s*\\)');
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
