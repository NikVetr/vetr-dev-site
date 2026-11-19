// The manifest is keyed by the verified article URL across both catalogs.
let cards;

/** @typedef {{url: string, sourceUrl: string, title: string, credit: string, license?: string, licenseUrl?: string, caption?: string}} RecognitionImage */

/**
 * Fetch the bundled recognition cues once on first use.
 * @param {string | null | undefined} articleUrl
 * @returns {Promise<{description: string, image?: RecognitionImage, poster?: RecognitionImage} | null>}
 */
export async function recognitionFor(articleUrl) {
  if (!articleUrl) return null;
  cards ??= fetch(new URL('./recognition.json', import.meta.url))
    .then((response) => {
      if (!response.ok) throw new Error('Could not load recognition cards.');
      return response.json();
    })
    .catch((error) => {
      cards = undefined;
      throw error;
    });
  const data = await cards;
  return Object.hasOwn(data, articleUrl) ? { articleUrl, ...data[articleUrl] } : null;
}

const displayed = new WeakMap();
export function recognitionLink(text, url) {
  const link = document.createElement('a');
  link.textContent = text;
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

// Each surface owns its selection. An old fetch or image error cannot overwrite a newer title.
export function showRecognition(figure, reference, title, describe = undefined) {
  const previous = displayed.get(figure);
  if (previous && previous.reference === reference && previous.title === title) return;
  const selection = { reference, title };
  displayed.set(figure, selection);
  figure.hidden = true;
  figure.replaceChildren();
  if (!reference) return;
  const direct = reference.imageUrl && reference.sourceUrl ? [{
    url: reference.imageUrl, sourceUrl: reference.sourceUrl, title, credit: reference.label,
  }] : [];
  const current = () => displayed.get(figure) === selection;
  function show(photos, poster = null) {
    if (!current()) return;
    const [photo, ...fallback] = photos;
    if (!photo) { figure.hidden = true; figure.replaceChildren(); return; }
    const img = document.createElement('img');
    img.alt = photo.title === title ? title : photo.title + ' · ' + title;
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => { if (current()) figure.hidden = false; };
    img.onerror = () => show(fallback, poster);
    const source = recognitionLink('', photo.sourceUrl);
    source.ariaLabel = photo === poster ? title + ' poster · file and rights' : img.alt + ' · image source';
    source.append(img);
    const credit = document.createElement('figcaption');
    if (photo.caption) credit.append(photo.caption);
    if (photo !== poster || photo.credit !== 'Poster file and rights') {
      if (credit.hasChildNodes()) credit.append(' · ');
      credit.append(recognitionLink(photo.credit || 'Image source', photo.sourceUrl));
    }
    if (photo.license) {
      if (credit.hasChildNodes()) credit.append(' · ');
      credit.append(photo.licenseUrl ? recognitionLink(photo.license, photo.licenseUrl) : photo.license);
    }
    figure.replaceChildren(source);
    if (credit.hasChildNodes()) figure.append(credit);
    img.src = photo.url;
  }
  if (!reference.wikipedia) { show(direct); return; }
  Promise.resolve(reference.recognition ?? recognitionFor(reference.wikipedia)).then(card => {
    if (!current()) return;
    if (describe && card?.description) describe(card.description);
    show([card?.poster, card?.image, ...direct].filter(Boolean), card?.poster);
  }).catch(() => {
    if (!current()) return;
    if (describe) describe('Article preview unavailable.');
    show(direct);
  });
}
