/**
 * Serialize untrusted data for an inline JSON script element.
 *
 * JSON.stringify alone does not escape `</script>`, so an external value could
 * terminate the element and inject markup. Escaping the HTML-significant
 * characters preserves a lossless JSON round trip without creating HTML.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function serializeJsonForScript(value) {
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new TypeError('Inline JSON value must be serializable.');
  }

  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
