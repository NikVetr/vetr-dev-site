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
