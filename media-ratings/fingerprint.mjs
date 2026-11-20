import { latestRatingDate, populationModel } from './calendar.mjs';
import { dot } from '../intuitions/lib/linalg.js';
import { pnormInterval } from '../intuitions/lib/normal.js';
import { gaussianProjection } from './core.mjs';
import { tasteProfile } from './taste.mjs';
import { comparisonGroups, describeAxes } from './axis-annotations.mjs';

const average = (values) => values.reduce((sum, x) => sum + x, 0) / values.length;
const cache = new WeakMap();

function describeClass(catalog, profile, populationMean, groups, usesHalfStars) {
  const scale = catalog.scale,
    range = scale.at(-1) - scale[0];
  const shift = (profile.mean - populationMean) / range;
  const strongest = profile.affinities.indexOf(Math.max(...profile.affinities));
  const leaning =
    strongest >= 0 && profile.affinities[strongest] >= range * 0.05
      ? groups[strongest][0] + ' leaning'
      : null;
  if (catalog.scaleLabels?.join('|') === 'No|Maybe|Yes') {
    const [no, maybe, yes] = profile.mass;
    if (yes >= 0.75) return 'Broad interest';
    if (no >= 0.75) return 'Very selective';
    if (maybe >= 0.35) return 'Often undecided';
    return leaning ?? 'Mixed interests';
  }
  if (usesHalfStars) {
    const half = profile.mass.reduce((s, p, j) => s + (Number.isInteger(scale[j]) ? 0 : p), 0);
    const style = half < 0.2 ? 'whole stars' : 'half steps';
    const level =
      shift < -0.16
        ? 'Tough'
        : shift < -0.06
          ? 'Selective'
          : shift > 0.08
            ? 'Generous'
            : Math.abs(shift) < 0.015
              ? 'Near average'
              : shift > 0
                ? 'Above average'
                : 'Below average';
    return level + ' · ' + style;
  }
  return (
    leaning ?? (shift > 0.05 ? 'Higher ratings' : shift < -0.05 ? 'Lower ratings' : 'Near-average ratings')
  );
}

// The signatures use expected ratings on the recorded scale, even when the
// active component lives in Gaussian liability space.
function classSignatures(catalog, model) {
  let byModel = cache.get(catalog);
  if (!byModel) {
    byModel = new WeakMap();
    cache.set(catalog, byModel);
  }
  if (byModel.has(model)) return byModel.get(model);
  const { items, scale } = catalog;
  const secondMoments = items.map(() => 0);
  const squaredScale = scale.map(x => x*x);
  const groups = comparisonGroups(catalog).groups.map(group => [group.name, group.members]);
  const profiles = model.components.map((c) => {
    const mass = scale.map(() => 0);
    const means = items.map((_, i) => {
      const row =
        c.probabilities?.[i] ??
        scale.map((_, j) =>
          pnormInterval(
            model.cuts[j - 1] ?? -Infinity,
            model.cuts[j] ?? Infinity,
            c.mean[i],
            Math.sqrt(c.covariance[i][i]),
          ),
        );
      row.forEach((p, j) => {
        mass[j] += p / items.length;
      });
      secondMoments[i] += c.weight * dot(row, squaredScale);
      return dot(row, scale);
    });
    return { mass, means, mean: average(means), prior: c.weight };
  });
  const populationMean = profiles.reduce((s, p) => s + p.prior * p.mean, 0);
  const baseline = items.map((_, i) => profiles.reduce((s, p) => s + p.prior * p.means[i], 0));
  const usesHalfStars = scale.length === 10 && scale.every((x, j) => x === (j + 1) / 2);
  const classes = profiles.map((p) => {
    const centered = p.means.map((v, i) => v - baseline[i] - (p.mean - populationMean));
    const affinities = groups.map(([, ids]) => average(ids.map((i) => centered[i])));
    const profile = { ...p, affinities };
    return {
      label:
        profiles.length === 1
          ? 'Full population'
          : describeClass(catalog, profile, populationMean, groups, usesHalfStars),
      mass: p.mass,
      mean: p.mean,
      prior: p.prior,
      affinities,
    };
  });
  const spread = secondMoments.map((m,i) => Math.sqrt(Math.max(0, m-baseline[i]**2)));
  const signature = { groups, classes, usesHalfStars, baseline, spread };
  byModel.set(model, signature);
  return signature;
}

export function preferenceFingerprint(
  catalog,
  {
    model: requested = undefined,
    ratings = {},
    samples = 256,
    centerClassMeans = true,
    volunteered = [],
    ratedOn = {},
    axisIndices = undefined,
  } = {},
  projection = null,
) {
  const key =
    requested ??
    catalog.defaultModel ??
    (catalog.models.reference ? 'reference' : catalog.selection?.ordinalModel) ??
    Object.keys(catalog.models)[0];
  if (!Object.hasOwn(catalog.models, key)) throw new Error('Choose a fitted fingerprint model.');
  const active = catalog.models[key];
  const model = populationModel(catalog, active, latestRatingDate(ratedOn));
  const categorical = model.kind === 'latent-class';
  const view =
    projection ??
    (categorical
      ? tasteProfile(catalog, ratings, key, null, centerClassMeans, volunteered, ratedOn)
      : gaussianProjection(catalog, { model: key, ratings, samples, axisIndices, centerClassMeans, overview: true }));
  const { weights } = view;
  const { classes, groups, usesHalfStars, baseline, spread } = classSignatures(catalog, model);
  const positions = view.mean ?? view.projection.map((axis) => dot(axis.scores, weights));
  const evidence = catalog.items.flatMap((it, i) => {
    if (!categorical || !Object.hasOwn(ratings, it.itemId)) return [];
    const value = ratings[it.itemId];
    const observed = populationModel(catalog, active, ratedOn[it.itemId]);
    const probabilities = observed.components.map((c) => c.probabilities[i][catalog.scale.indexOf(value)]);
    const base = classes.reduce((sum, c, k) => sum + c.prior * probabilities[k], 0);
    return [{ title: it.title, value, probabilities, base }];
  });
  const types = classes
    .map((p, index) => {
      const signals = evidence
        .filter((r) => r.base > 0)
        .map((r) => ({
          title: r.title,
          value: r.value,
          ratio: r.probabilities[index] / r.base,
        }));
      signals.sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)));
      return {
        index,
        label: p.label,
        prior: p.prior,
        probability: weights[index],
        mean: p.mean,
        mass: p.mass,
        signal: signals[0] ?? null,
      };
    })
    .sort((a, b) => b.probability - a.probability);
  const ratedCount = Object.keys(ratings).length;
  const affinities = groups
    .map(([label, ids], j) => ({
      label,
      count: ids.length,
      shift: classes.reduce((s, p, k) => s + weights[k] * p.affinities[j], 0),
    }))
    .sort((a, b) => b.shift - a.shift);
  const all = view.allAxes ?? view.projection;
  const allScores = view.allScores ?? (view.allAxes ? all.map(axis => dot(axis.scores, weights)) : positions);
  const descriptions = describeAxes(catalog, all, baseline, spread);
  const allAxes = all.map((axis, i) => ({
    ...descriptions[i],
    index: axis.index, score: allScores[i], fraction: axis.fraction,
    standardScore: axis.variance > 0 ? allScores[i] / Math.sqrt(axis.variance) : 0,
  }));
  const byIndex = new Map(allAxes.map(axis => [axis.index, axis]));
  const axes = view.projection.map(axis => byIndex.get(axis.index));
  const mass = catalog.scale.map((_, j) => classes.reduce((s, p, k) => s + p.mass[j] * weights[k], 0));
  const uniqueLeader = types.length > 1 && types[0].probability - types[1].probability > 1e-12;
  return {
    ratedCount,
    classes: types,
    match: ratedCount && uniqueLeader ? types[0] : null,
    axes,
    allAxes,
    displayAxes: allAxes.filter(axis => axis.interpretable),
    affinities,
    mean: dot(mass, catalog.scale),
    populationMean: classes.reduce((s, p) => s + p.mean * p.prior, 0),
    mass,
    usesHalfStars,
    categorical,
  };
}
