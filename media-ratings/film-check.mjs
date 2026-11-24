// Five uniform offers without replacement from the first twenty eligible recommendations.
import { invalidRequest } from '../shared/request.js';

export const filmCheckSchema = 'film-recommendation-check/v1';
const models = ['personalized', 'reference'];
const outcomes = ['rated', 'unseen', 'skipped', 'unanswered'];

export function sampleOffers(rankedIds, random = Math.random) {
  const pool = rankedIds.slice(0, 20).map((itemId, i) => ({ itemId, rank: i + 1 }));
  const take = Math.min(5, pool.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, take);
}

function validateSession(session) {
  const bad = (message) => {
    throw invalidRequest('sessions', message);
  };
  if (
    !session ||
    typeof session.id !== 'string' ||
    !session.id ||
    session.catalog !== 'expanded' ||
    typeof session.model !== 'string' ||
    !Number.isInteger(session.poolSize) ||
    session.poolSize < 1 ||
    session.poolSize > 20 ||
    !Array.isArray(session.offers) ||
    !session.offers.length ||
    session.offers.length > Math.min(session.poolSize, 5)
  )
    bad('Invalid film check session.');
  const items = new Set(),
    ranks = new Set();
  for (const [i, offer] of session.offers.entries()) {
    if (
      !offer ||
      typeof offer.itemId !== 'string' ||
      !offer.itemId ||
      items.has(offer.itemId) ||
      !Number.isInteger(offer.rank) ||
      offer.rank < 1 ||
      offer.rank > session.poolSize ||
      ranks.has(offer.rank) ||
      !outcomes.includes(offer.outcome) ||
      (offer.outcome === 'unanswered' && i !== session.offers.length - 1) ||
      (offer.outcome === 'rated'
        ? !(
            typeof offer.rating === 'number' &&
            Number.isInteger(2 * offer.rating) &&
            offer.rating >= 0.5 &&
            offer.rating <= 5
          )
        : offer.rating !== null)
    )
      bad('Invalid or repeated film check offer.');
    items.add(offer.itemId);
    ranks.add(offer.rank);
    for (const model of models) {
      const p = offer.forecasts?.[model];
      if (
        !Array.isArray(p) ||
        p.length !== 10 ||
        !p.every((x) => Number.isFinite(x) && x >= 0 && x <= 1) ||
        Math.abs(p.reduce((a, b) => a + b, 0) - 1) > 1e-7
      )
        bad('Expected ten normalized forecast probabilities.');
    }
  }
}

// Report descriptive offer-weighted statistics. Exports from the same session can overlap.
export function summarizeFilmChecks(input) {
  const sessions = new Map();
  for (const file of Array.isArray(input) ? input : [input]) {
    if (file?.schema !== filmCheckSchema || !Array.isArray(file.sessions))
      throw invalidRequest('schema', 'Expected a film recommendation check export.');
    for (const session of file.sessions) {
      validateSession(session);
      const previous = sessions.get(session.id);
      if (previous) {
        // A saved snapshot can have one outstanding response followed by later offers.
        const [early, late] = [session, previous].sort(
          (a, b) =>
            a.offers.length - b.offers.length ||
            Number(a.offers.at(-1).outcome !== 'unanswered') -
              Number(b.offers.at(-1).outcome !== 'unanswered'),
        );
        const context = [
          'startedAt',
          'catalog',
          'model',
          'given',
          'volunteered',
          'ranking',
          'reviewWeight',
          'poolSize',
        ];
        if (
          context.some((key) => early[key] !== late[key]) ||
          !early.offers.every((o, i) => {
            const next = late.offers[i];
            return (
              o.itemId === next.itemId &&
              o.rank === next.rank &&
              (o.outcome === 'unanswered' || (o.outcome === next.outcome && o.rating === next.rating)) &&
              models.every((model) => o.forecasts[model].every((p, j) => p === next.forecasts[model][j]))
            );
          })
        )
          throw invalidRequest('sessions', 'Conflicting snapshots of the same session.');
        sessions.set(late.id, late);
      } else sessions.set(session.id, session);
    }
  }
  const offers = [...sessions.values()].flatMap((s) => s.offers);
  const counts = Object.fromEntries(outcomes.map((k) => [k, offers.filter((o) => o.outcome === k).length]));
  const rated = offers.filter((o) => o.outcome === 'rated');
  const metrics = Object.fromEntries(
    models.map((model) => {
      if (!rated.length) return [model, null];
      const bins = Array.from({ length: 10 }, () => ({ n: 0, predicted: 0, observed: 0 }));
      let forecast = 0,
        actual = 0,
        brier = 0,
        squared = 0;
      for (const offer of rated) {
        const p = offer.forecasts[model],
          q = p.slice(7).reduce((a, b) => a + b, 0);
        const yes = Number(offer.rating >= 4);
        actual += yes;
        forecast += q;
        brier += (q - yes) ** 2;
        squared += (p.reduce((a, v, j) => a + (v * (j + 1)) / 2, 0) - offer.rating) ** 2;
        const bin = bins[Math.min(9, Math.floor(q * 10))];
        bin.n++;
        bin.predicted += q;
        bin.observed += yes;
      }
      return [
        model,
        {
          predictedFourStar: forecast / rated.length,
          observedFourStar: actual / rated.length,
          brier: brier / rated.length,
          rmse: Math.sqrt(squared / rated.length),
          bins: bins.flatMap((b, i) =>
            b.n ? [{ bin: i, n: b.n, predicted: b.predicted / b.n, observed: b.observed / b.n }] : [],
          ),
        },
      ];
    }),
  );
  return {
    sessions: sessions.size,
    offered: offers.length,
    counts,
    responseRate: offers.length ? rated.length / offers.length : null,
    metrics,
  };
}
