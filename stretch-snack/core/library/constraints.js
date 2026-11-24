// Motion-specific demands in addition to those implied by the starting posture.
// Variants with a different setup can appear by their full catalog ID.
const demands = {
  'hands-loaded': 'wall-push-up counter-step-back underarm-shoulder-stretch seat-press prone-press-up kneeling-plank roller-it-band roller-adductor frog-stretch mountain-climber groiner spiderman-lunge inchworm worlds-greatest-stretch wall-dog bird-dog downward-dog wrist-rock',
  'hip-precautions': 'plantar-stretch hip-back piriformis-pull knee-fallout hip-flexor-stretch sit-to-stand clam side-leg-lift figure-four seated-hip-flexor bed-edge-hip-stretch chair-squat knee-hug wide-knee-lean warrior-two warrior-one garland-squat happy-baby reclined-butterfly knee-cross-twist pigeon butterfly pike-fold rollover-straddle hydrant-circle groiner iron-cross frog-stretch cossack-squat couch-stretch body-circle leg-swing side-leg-swing worlds-greatest-stretch hip-90-90 hip-car spiderman-lunge squat-to-stand inchworm walking-knee-hug toy-soldier step-over pancake long-sit-reach hip-cross cross-twist hamstring-step',
  'no-kneeling': 'chair-pose garland-squat pigeon gate-pose kneeling-plank groiner cossack-squat squat-to-stand worlds-greatest-stretch spiderman-lunge hip-90-90 walking-quad-pull happy-baby knee-hug quad-stretch',
  'no-forward-bend': 'back-round forward-rest seated-forward-bend forward-fold pyramid wide-leg-fold head-to-knee long-sit-reach pike-fold body-circle inchworm squat-to-stand rollover-straddle hamstring-lean hamstring-step pancake rock-back child-pose wide-knee-lean',
  'no-inversion': 'downward-dog legs-up-wall wide-leg-fold forward-fold pike-fold rollover-straddle inchworm squat-to-stand',
};
const limits = Object.entries(demands).map(([rule, values]) => ({rule, motions:new Set(values.split(' '))}));

export function postureLimits(pose, motion, id) {
  const restrictions = limits.filter(({motions}) => motions.has(motion) || motions.has(id)).map(({rule}) => rule);
  if (pose === 'prone') restrictions.push('no-prone');
  if (pose === 'hands-and-knees') restrictions.push('hands-loaded','no-kneeling');
  if (pose === 'kneeling') restrictions.push('no-kneeling');
  return [...new Set(restrictions)];
}

export const isFloor = pose => ['supine','prone','side-lying','hands-and-knees','kneeling','long-sitting'].includes(pose);
