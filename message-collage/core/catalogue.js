// The bundled font families: which file is which face, relative to message-collage/. Inter's
// and Source Serif Pro's upright faces are name-tags' copies, read from there. Licences and
// sources: fonts/LICENSES.md. Kept apart from fonts.js, which reads the files with fontkit, so
// the page can list the families without loading fontkit.

export const FAMILIES = Object.freeze({
  'Source Serif Pro': {
    category: 'serif',
    faces: { plain: '../name-tags/fonts/SourceSerifPro-Regular.ttf', bold: '../name-tags/fonts/SourceSerifPro-Bold.ttf', italic: 'fonts/SourceSerifPro-It.woff2', 'bold-italic': 'fonts/SourceSerifPro-BoldIt.woff2' },
  },
  Inter: {
    category: 'sans-serif',
    faces: { plain: '../name-tags/fonts/Inter-Regular.ttf', bold: '../name-tags/fonts/Inter-Bold.ttf', italic: 'fonts/Inter-Italic.woff2', 'bold-italic': 'fonts/Inter-BoldItalic.woff2' },
  },
  'Courier Prime': {
    category: 'monospace',
    faces: { plain: 'fonts/CourierPrime-Regular.woff2', bold: 'fonts/CourierPrime-Bold.woff2', italic: 'fonts/CourierPrime-Italic.woff2', 'bold-italic': 'fonts/CourierPrime-BoldItalic.woff2' },
  },
  'Lobster Two': {
    category: 'script',
    faces: { plain: 'fonts/LobsterTwo-Regular.woff2', bold: 'fonts/LobsterTwo-Bold.woff2', italic: 'fonts/LobsterTwo-Italic.woff2', 'bold-italic': 'fonts/LobsterTwo-BoldItalic.woff2' },
  },
  'Playfair Display': {
    category: 'display',
    faces: { plain: 'fonts/PlayfairDisplay-Regular.woff2', bold: 'fonts/PlayfairDisplay-Bold.woff2', italic: 'fonts/PlayfairDisplay-Italic.woff2', 'bold-italic': 'fonts/PlayfairDisplay-BoldItalic.woff2' },
  },
});

/** The URL of a face file (file: in Node, http(s): in a browser). @param {string} file */
export const fontUrl = (file) => new URL(`../${file}`, import.meta.url);
