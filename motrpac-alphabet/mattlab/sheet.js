/* Native vector thumbnails and character-sheet exports. No external assets. */
(function (global) {
  'use strict';
  const Core = global.PainterCore || (typeof require === 'function' ? require('./core.js') : null);
  if (!Core) throw new Error('PainterSheet needs PainterCore.');
  const CROP = Object.freeze({x:260,y:132,width:1004,height:748});
  const escape = Core.xmlEscape;
  function cleanText(value, fallback, limit) {
    const text = String(value === undefined || value === null ? fallback : value)
      .replace(/[\u0000-\u001F\u007F]/g,'');
    return Array.from(text).filter(function (character) {
      const point = character.codePointAt(0);
      return point < 0xD800 || point > 0xDFFF;
    }).slice(0,limit || 120).join('') || fallback;
  }
  function normalizedFills(value) {
    const input = value && typeof value === 'object' ? value : {};
    const result = Object.create(null);
    Core.FACES.forEach(function (face) {
      result[face.id] = Core.normalizeColor(Object.prototype.hasOwnProperty.call(input,face.id) ? input[face.id] : '#FFFFFF');
    });
    return result;
  }
  function normalizeEntries(entries) {
    if (!Array.isArray(entries) || !entries.length) throw new Error('Choose at least one design for the character sheet.');
    if (entries.length > 512) throw new Error('A character sheet can contain up to 512 designs.');
    return entries.map(function (entry, index) {
      if (!entry || typeof entry !== 'object') throw new Error('A character-sheet entry is invalid.');
      const key = cleanText(entry.key,'design-' + (index + 1),80);
      let label = entry.label === ' ' || entry.key === ' ' ? 'Space' : cleanText(entry.label === undefined ? key : entry.label,key,80);
      if (entry.kind === 'design' && !entry.label) label = cleanText(entry.name,'Design ' + (index + 1),80);
      return {key:key,label:label,fills:normalizedFills(entry.fills),kind:entry.kind === 'design' ? 'design' : 'character',
        status:entry.status === 'blank' ? 'blank' : entry.status === 'guess' ? 'guess' : 'edited'};
    });
  }
  function wrappedText(value, maxCharacters) {
    const words = value.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(function (word) {
      const points = Array.from(word);
      if (points.length > maxCharacters) {
        if (line) { lines.push(line); line = ''; }
        for (let offset = 0; offset < points.length; offset += maxCharacters) {
          const part = points.slice(offset,offset + maxCharacters).join('');
          if (offset + maxCharacters < points.length) lines.push(part);
          else line = part;
        }
      } else if (Array.from(line + (line ? ' ' : '') + word).length <= maxCharacters) {
        line += (line ? ' ' : '') + word;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }
  function headerLayout(width, margin, count, options) {
    const opts = options || {};
    const title = cleanText(opts.title,'Cardinal character studies',120);
    const subtitle = cleanText(opts.subtitle,count + ' studies · 20 original polygons per design',160);
    const titleSize = width < 600 ? 22 : 28;
    const titleStep = titleSize + 5;
    const available = width - margin * 2;
    const titleLines = wrappedText(title,Math.max(8,Math.floor(available / (titleSize * 0.62))));
    const subtitleLines = wrappedText(subtitle,Math.max(12,Math.floor(available / (12 * 0.60))));
    const titleY = titleSize + 10;
    const subtitleY = titleY + (titleLines.length - 1) * titleStep + 22;
    return {title:title,subtitle:subtitle,titleSize:titleSize,titleStep:titleStep,
      titleLines:titleLines,subtitleLines:subtitleLines,titleY:titleY,subtitleY:subtitleY,
      height:subtitleY + (subtitleLines.length - 1) * 16 + 27};
  }
  function layout(entries, options) {
    const count = typeof entries === 'number' ? entries : Array.isArray(entries) ? entries.length : 0;
    if (!Number.isInteger(count) || count < 1 || count > 512) throw new Error('A sheet needs 1–512 designs.');
    const opts = options || {};
    const columns = Math.min(count,Math.max(1,Math.min(12,Math.round(Number(opts.columns) || 6))));
    const rows = Math.ceil(count / columns);
    const cellWidth = 232;
    const cellHeight = 202;
    const margin = 24;
    const width = margin * 2 + columns * cellWidth;
    const headerInfo = headerLayout(width,margin,count,opts);
    const header = headerInfo.height;
    return {count:count,columns:columns,rows:rows,cellWidth:cellWidth,cellHeight:cellHeight,
      margin:margin,header:header,width:width,headerInfo:headerInfo,
      height:header + rows * cellHeight + margin};
  }
  function pngDimensions(entries, options) {
    const shape = layout(entries,options);
    const requested = Math.min(4,Math.max(0.25,Number(options && options.scale) || 2));
    // Keep large ASCII sheets inside common canvas dimension and memory budgets.
    const scale = Math.min(requested,8192 / shape.width,8192 / shape.height,
      Math.sqrt(14000000 / (shape.width * shape.height)));
    return {width:Math.max(1,Math.floor(shape.width * scale)),height:Math.max(1,Math.floor(shape.height * scale)),scale:scale};
  }
  function thumbnailSvg(fills, options) {
    const colors = normalizedFills(fills);
    const opts = options || {};
    const outline = opts.outline !== false;
    const title = cleanText(opts.title,'Polygon study',120);
    const parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="260 132 1004 748" width="100%" height="100%" role="img" aria-label="' + escape(title) + '">'];
    // No IDs, uses, clip paths, or external references: safe to repeat in a gallery.
    if (opts.background !== 'transparent') parts.push('<rect x="260" y="132" width="1004" height="748" fill="#FFFFFF"/>');
    Core.FACES.forEach(function (face) {
      parts.push('<path d="' + face.d + '" fill="' + colors[face.id] + '"' +
        (outline ? ' stroke="#929AA0" stroke-width="2.5" stroke-linejoin="round"' : '') + '/>');
    });
    parts.push('</svg>');
    return parts.join('');
  }
  function svgString(entries, options) {
    const data = normalizeEntries(entries);
    const opts = options || {};
    const grid = layout(data,opts);
    const title = grid.headerInfo.title;
    const outline = opts.outline !== false;
    const showLabels = opts.labels !== false;
    const outlineColor = Core.normalizeColor(opts.outlineColor || '#8E989F');
    const outlineWidth = Math.max(0.5,Math.min(8,Number(opts.outlineWidth) || 2.5));
    const parts = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + grid.width + '" height="' + grid.height + '" viewBox="0 0 ' + grid.width + ' ' + grid.height + '" role="img" aria-labelledby="sheet-title sheet-description">',
      '<title id="sheet-title">' + escape(title) + '</title>',
      '<desc id="sheet-description">Character sheet containing ' + data.length + ' studies. Every design uses the twenty approved original polygon paths. Colors and corner policies are taken from the supplied designs.</desc>',
      '<defs>',
      '<clipPath id="sheet-logo-outline"><path d="' + Core.SILHOUETTE + '" fill-rule="evenodd" clip-rule="evenodd"/></clipPath>'
    ];
    Core.FACES.forEach(function (face, index) { parts.push('<path id="sheet-piece-' + index + '" d="' + face.d + '"/>'); });
    parts.push('</defs>');
    parts.push('<rect width="' + grid.width + '" height="' + grid.height + '" fill="#FFFFFF"/>');
    parts.push('<g font-family="ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" fill="#25363D">');
    grid.headerInfo.titleLines.forEach(function (line,index) {
      parts.push('<text x="' + grid.margin + '" y="' + (grid.headerInfo.titleY + index * grid.headerInfo.titleStep) +
        '" font-size="' + grid.headerInfo.titleSize + '" font-weight="650">' + escape(line) + '</text>');
    });
    grid.headerInfo.subtitleLines.forEach(function (line,index) {
      parts.push('<text x="' + grid.margin + '" y="' + (grid.headerInfo.subtitleY + index * 16) +
        '" font-size="12" fill="#68777F">' + escape(line) + '</text>');
    });
    data.forEach(function (entry,index) {
      const x = grid.margin + (index % grid.columns) * grid.cellWidth;
      const y = grid.header + Math.floor(index / grid.columns) * grid.cellHeight;
      const artX = x + 10;
      const artY = y + 8;
      const scale = (grid.cellWidth - 28) / CROP.width;
      const label = entry.label;
      parts.push('<g id="sheet-cell-' + index + '" aria-label="' + escape(label) + '">');
      parts.push('<rect x="' + x + '" y="' + y + '" width="' + (grid.cellWidth - 12) + '" height="' + (grid.cellHeight - 12) + '" rx="10" fill="#FFFFFF" stroke="#E2E6E8" stroke-width="1"/>');
      parts.push('<g transform="translate(' + artX + ' ' + artY + ') scale(' + scale + ') translate(-' + CROP.x + ' -' + CROP.y + ')">');
      parts.push('<g clip-path="url(#sheet-logo-outline)">');
      parts.push('<g stroke-width="1.2" stroke-linejoin="round" aria-hidden="true">');
      Core.FACES.forEach(function (face,faceIndex) {
        const color = entry.fills[face.id];
        parts.push('<use xlink:href="#sheet-piece-' + faceIndex + '" fill="' + color + '" stroke="' + color + '"/>');
      });
      parts.push('</g><g>');
      Core.FACES.forEach(function (face,faceIndex) {
        parts.push('<use id="sheet-cell-' + index + '-face-' + faceIndex + '" xlink:href="#sheet-piece-' + faceIndex + '" fill="' + entry.fills[face.id] + '"/>');
      });
      parts.push('</g>');
      if (outline) {
        parts.push('<g fill="none" stroke="' + outlineColor + '" stroke-width="' + outlineWidth + '" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">');
        Core.FACES.forEach(function (_,faceIndex) { parts.push('<use xlink:href="#sheet-piece-' + faceIndex + '"/>'); });
        parts.push('</g>');
      }
      parts.push('</g></g>');
      if (showLabels) {
        const labelSize = Math.min(16,Math.max(10,(grid.cellWidth - 40) / (Array.from(label).length * 0.58)));
        parts.push('<text x="' + (x + (grid.cellWidth - 12) / 2) + '" y="' + (y + grid.cellHeight - 29) + '" text-anchor="middle" font-size="' + labelSize.toFixed(2) + '" font-weight="600">' + escape(label) + '</text>');
      }
      parts.push('</g>');
    });
    parts.push('</g></svg>');
    return parts.join('\n');
  }
  function svgBlob(entries,options) {
    return new Blob([svgString(entries,options)],{type:'image/svg+xml;charset=utf-8'});
  }
  async function pngBlob(entries,options) {
    if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('PNG character-sheet export needs a browser.');
    const dims = pngDimensions(entries,options);
    const canvas = document.createElement('canvas');
    canvas.width = dims.width;
    canvas.height = dims.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot create a PNG canvas.');
    const url = URL.createObjectURL(svgBlob(entries,options));
    try {
      const image = new Image();
      await new Promise(function (resolve,reject) {
        image.onload = resolve;
        image.onerror = function () { reject(new Error('The character sheet could not be rendered.')); };
        image.src = url;
      });
      context.clearRect(0,0,canvas.width,canvas.height);
      context.drawImage(image,0,0,canvas.width,canvas.height);
      return await new Promise(function (resolve,reject) {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('The browser could not create this PNG. Try the SVG character sheet.'));
        },'image/png');
      });
    } finally { URL.revokeObjectURL(url); }
  }
  const API = Object.freeze({
    CROP:CROP,layout:layout,pngDimensions:pngDimensions,thumbnailSvg:thumbnailSvg,
    svgString:svgString,svgBlob:svgBlob,pngBlob:pngBlob
  });
  global.PainterSheet = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
