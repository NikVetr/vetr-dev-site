/** Locate declarations for editor navigation after Stan has checked the source.
 * The compiler's debug AST hides locations. This scans declaration boundaries
 * only; it does not interpret expressions or contribute model semantics.
 * @param {string} source @returns {Map<string,number>}
 */
export function declarationLines(source) {
  /** @type {{text:string,line:number}[]} */
  const tokens = [];
  let line = 1, previous = 0;
  for (const match of source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z_0-9]*|\S/g)) {
    line += (source.slice(previous, match.index).match(/\n/g) ?? []).length;
    const text = match[0];
    if (!text.startsWith('//') && !text.startsWith('/*')) tokens.push({ text, line });
    line += (text.match(/\n/g) ?? []).length;
    previous = match.index + text.length;
  }
  /** @type {Map<string,number>} */
  const result = new Map();
  let i = 0;
  /** @param {string} open @param {string} close */
  function skip(open, close) {
    if (tokens[i]?.text !== open) return;
    let depth = 0;
    do { const t = tokens[i++].text; if (t === open) depth++; if (t === close) depth--; } while (depth > 0 && i < tokens.length);
  }
  while (i < tokens.length) {
    const t = tokens[i].text;
    // These words are reserved type tokens, so they cannot be assignment targets.
    if (t !== 'array' && !['int', 'real', 'vector', 'row_vector'].includes(t)) { i++; continue; }
    if (t === 'array') { i++; skip('[', ']'); }
    if (!['int', 'real', 'vector', 'row_vector'].includes(tokens[i]?.text)) { i++; continue; }
    i++;
    if (tokens[i]?.text === '<') {
      i++;
      while (i < tokens.length && tokens[i].text !== '>') {
        if (tokens[i].text === '(') skip('(', ')');
        else if (tokens[i].text === '[') skip('[', ']');
        else i++;
      }
      i++;
    }
    skip('[', ']');
    while (i < tokens.length) {
      const name = tokens[i++];
      if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name.text)) break;
      result.set(name.text, name.line);
      // Skip an initializer without mistaking its commas for more declarations.
      while (i < tokens.length && ![',', ';'].includes(tokens[i].text)) {
        if (tokens[i].text === '(') skip('(', ')');
        else if (tokens[i].text === '[') skip('[', ']');
        else if (tokens[i].text === '{') skip('{', '}');
        else i++;
      }
      if (tokens[i++]?.text !== ',') break;
    }
  }
  return result;
}
