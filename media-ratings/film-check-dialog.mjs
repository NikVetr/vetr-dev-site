import { predict } from './core.mjs';
import { node } from './detail.mjs';
import { saveDownload } from './exchange.mjs';
import { filmCheckSchema, sampleOffers, summarizeFilmChecks } from './film-check.mjs';

const storagePrefix = filmCheckSchema + '/';
function savedChecks() {
  const sessions = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(storagePrefix)) sessions.push(JSON.parse(localStorage.getItem(key)));
  }
  return { schema: filmCheckSchema, sessions };
}

export function wireFilmCheck(getSnapshot) {
  const el = (id) => document.getElementById(id);
  const dialog = /** @type {HTMLDialogElement} */ (el('film-check-dialog'));
  const download = /** @type {HTMLButtonElement} */ (el('film-check-export'));
  const summary = el('film-check-summary');
  let session, deck, titleById;
  function refresh() {
    try {
      const s = summarizeFilmChecks(savedChecks());
      download.disabled = !s.offered;
      const score = s.metrics.personalized;
      summary.textContent = s.offered
        ? s.offered +
          ' offered · ' +
          s.counts.rated +
          ' rated · ' +
          s.counts.unseen +
          ' unseen · ' +
          s.counts.skipped +
          ' skipped · ' +
          s.counts.unanswered +
          ' unanswered.' +
          ' Rating coverage ' +
          (s.responseRate * 100).toFixed(0) +
          '%.' +
          (score
            ? ' Of the rated films, ' +
              (100 * score.observedFourStar).toFixed(1) +
              '% reached four stars. The default predicted ' +
              (100 * score.predictedFourStar).toFixed(1) +
              '% and the Gaussian predicted ' +
              (100 * s.metrics.reference.predictedFourStar).toFixed(1) +
              '%.'
            : '')
        : '';
    } catch (error) {
      download.disabled = true;
      summary.textContent = 'Saved checks could not be read. ' + error.message;
    }
  }
  function persist(offers) {
    const update = { ...session, offers };
    localStorage.setItem(storagePrefix + session.id, JSON.stringify(update));
    session = update;
  }
  function display() {
    const offer = session.offers.at(-1);
    el('film-check-progress').textContent = 'Film ' + session.offers.length + ' of ' + deck.length;
    el('film-check-title').textContent = titleById.get(offer.itemId);
    el('film-check-title').focus();
    el('film-check-error').textContent = '';
  }
  function respond(outcome, rating = null) {
    if (!dialog.open) return;
    const offers = session.offers.slice();
    offers[offers.length - 1] = { ...offers.at(-1), outcome, rating };
    const next = deck[offers.length];
    if (next) offers.push(next);
    try {
      persist(offers);
      if (next) display();
      else dialog.close();
    } catch (error) {
      el('film-check-error').textContent = 'Could not save your response. ' + error.message;
    }
  }
  el('film-check-unseen').onclick = () => respond('unseen');
  el('film-check-skip').onclick = () => respond('skipped');
  el('film-check').addEventListener('toggle', refresh);
  dialog.onclose = refresh;
  download.onclick = () => {
    try {
      const data = savedChecks();
      summarizeFilmChecks(data);
      saveDownload('film-recommendation-checks.json', JSON.stringify(data, null, 2), 'application/json');
    } catch (error) {
      summary.textContent = 'Could not export checks. ' + error.message;
    }
  };
  el('film-check-start').onclick = () => {
    try {
      const { catalog, rankedIds, request, titles, reviewWeight, ranking } = getSnapshot();
      const offers = sampleOffers(rankedIds);
      if (!offers.length) throw new Error('There are no unrated films in the current recommendations.');
      const forecasts = ['personalized', 'reference'].map(
        (model) =>
          new Map(
            predict(catalog, { ...request, model }).predictions.map((p) => [p.itemId, p.probabilities]),
          ),
      );
      deck = offers.map((row) => ({
        ...row,
        forecasts: {
          personalized: forecasts[0].get(row.itemId),
          reference: forecasts[1].get(row.itemId),
        },
        outcome: 'unanswered',
        rating: null,
      }));
      titleById = titles;
      el('film-check-unseen').hidden = el('film-check-skip').hidden = false;
      session = {
        id: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        catalog: 'expanded',
        model: request.model,
        given: Object.keys(request.ratings).length,
        volunteered: request.volunteered.length,
        ranking,
        reviewWeight,
        poolSize: Math.min(20, rankedIds.length),
        offers: [],
      };
      el('film-check-stars').replaceChildren(
        ...catalog.scale.map((value) => {
          const b = node('button', value + ' ★');
          b.type = 'button';
          b.ariaLabel = 'Rate ' + value + ' stars';
          b.onclick = () => respond('rated', value);
          return b;
        }),
      );
      dialog.showModal();
      persist([deck[0]]);
      display();
    } catch (error) {
      if (dialog.open) {
        el('film-check-title').textContent = 'Film check unavailable';
        el('film-check-error').textContent = 'Could not save this check. ' + error.message;
        el('film-check-stars').replaceChildren();
        el('film-check-unseen').hidden = el('film-check-skip').hidden = true;
      } else summary.textContent = 'Could not start the film check. ' + error.message;
    }
  };
}
