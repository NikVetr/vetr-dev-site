import {handNeckLibrary} from './library/hand-neck.js';
import {upperLibrary} from './library/upper.js';
import {lowerLibrary} from './library/lower.js';
import {librarySources} from './library/sources.js';

// The movement descriptions and estimated space requirements are original travel adaptations.
// Each source identifies a published demonstration. None evaluated this app's routine or dose.
export const locations = {
  'plane-seat': 'Airplane seat with a neighbor', 'train-seat': 'Train or bus seat',
  'roomy-seat': 'Chair with room around it', 'plane-lavatory': 'Airplane lavatory',
  stall: 'Bathroom stall', 'open-area': 'Open, stationary space',
};

export const reachableLocations = {
  'plane-seat': ['plane-lavatory'], 'plane-lavatory': ['plane-seat'],
  'train-seat': ['stall', 'roomy-seat'], stall: ['train-seat', 'roomy-seat', 'open-area'],
  'roomy-seat': ['stall', 'open-area'], 'open-area': ['roomy-seat', 'stall'],
};

export const targets = {
  neck: 'Neck', shoulders: 'Shoulders', 'upper-back': 'Upper back', chest: 'Chest',
  hands: 'Hands & forearms', hips: 'Hips', knees: 'Knees & thighs',
  calves: 'Calves & feet', 'lower-back': 'Lower back',
};

export const equipment = {
  towel: 'Small towel', band: 'Light resistance band', ball: 'Massage ball', roller: 'Compact foam roller',
  support: 'Secure fixed handhold', 'firm-back': 'Chair with a firm back', step: 'Low fixed step', mat: 'Exercise mat',
};

// These fixtures must be confirmed at the place where the movement is done.
export const fixedEquipment = ['support', 'firm-back', 'step'];

export const limitations = {
  'stay-seated': 'Stay seated', 'stay-standing': 'Stay standing', 'back-support': 'Keep my back supported',
  'poor-balance': 'Avoid balance challenges', 'no-floor': 'Stay off the ground',
  'no-leg-movement': 'Avoid active leg movement', 'no-arm-movement': 'Avoid active arm movement',
  'no-twisting': 'Avoid turning my neck or trunk', 'no-overhead': 'Keep arms below shoulder level',
  'limited-grip': 'Avoid gripping or pulling',
};

export const sources = {
  ...librarySources,
  sitting: { title: 'NHS · Sitting exercises', url: 'https://www.nhs.uk/live-well/exercise/sitting-exercises/' },
  work: { title: 'Newcastle Hospitals · One-minute body check', url: 'https://www.newcastle-hospitals.nhs.uk/services/newcastle-occupational-health-service/information-for-staff/physiotherapy/self-help-leaflets/1-minute-body-check/' },
  flex: { title: 'NHS · Flexibility exercises', url: 'https://www.nhs.uk/live-well/exercise/flexibility-exercises/' },
  strength: { title: 'NHS · Strength exercises', url: 'https://www.nhs.uk/live-well/exercise/strength-exercises/' },
  step: { title: 'NHS · Balance exercises', url: 'https://www.nhs.uk/live-well/exercise/balance-exercises/' },
  shoulder: { title: 'East Sussex MSK · Shoulder posture and band exercises', url: 'https://eastsussexmsk.nhs.uk/wp-content/uploads/2025/09/shoulder-pain-information-booklet.pdf' },
  grip: { title: 'Leicestershire Partnership NHS Trust · Strengthening and stretching', url: 'https://www.leicspart.nhs.uk/wp-content/uploads/2022/07/134-Falls-service-stretching-and-strengthening-exercises-edition-5.pdf' },
  wrist: { title: 'Leeds Teaching Hospitals · Wrist exercises', url: 'https://www.leedsth.nhs.uk/patients/resources/wrist-exercises/' },
  forearm: { title: 'University Hospitals of Leicester · Finger, hand and wrist exercises', url: 'https://yourhealth.leicestershospitals.nhs.uk/library/csi/therapies/physiotherapy/1202-finger-hand-and-wrist-exercises-for-sprains-and-injury/file' },
  seatedLegs: { title: 'Cambridge University Hospitals · Home exercise programme', url: 'https://www.cuh.nhs.uk/patient-information/home-exercise-programme/' },
  ankle: { title: 'Calderdale and Huddersfield · Active at home', url: 'https://www.cht.nhs.uk/fileadmin/site_setup/contentUploads/Services/Clinical/Enhanced_Recovery_After_Surgery/AC_Active_%40_Home_Booklet.pdf' },
  overhead: { title: 'Gloucestershire Hospitals · Chair exercises', url: 'https://www.gloshospitals.nhs.uk/your-visit/patient-information-leaflets/simple-exercises-encourage-weight-loss/' },
  back: { title: 'NHS inform · Back exercises', url: 'https://www.nhsinform.scot/illnesses-and-conditions/muscle-bone-and-joints/neck-and-back-problems-and-conditions/exercises-for-back-pain' },
  knee: { title: 'South Tees Hospitals · Active knee flexion', url: 'https://www.southtees.nhs.uk/resources/active-knee-flexion/' },
  foot: { title: 'United Lincolnshire Hospitals · Foot rolling', url: 'https://www.ulh.nhs.uk/patients/patient-information-library/plantar-fasciitis-exercises/' },
  neckLeeds: { title: 'Leeds Community Healthcare · Neck exercises', url: 'https://leedscommunityhealthcare.nhs.uk/our-services-a-z/musculoskeletal-msk/neck-problems/new-and-undiagnosed-neck-problems/' },
  cuhSeated: { title: 'Cambridge University Hospitals · Seated stretches', url: 'https://www.cuh.nhs.uk/our-services/physiotherapy-outpatients/outpatient-physio-resources/resources/shoulder/seated-stretches/' },
  glutes: { title: 'University of Michigan MHealthy · Back care exercises', url: 'https://hr.umich.edu/sites/default/files/bc-backcarebook-2015.pdf' },
  swbhSeated: { title: 'Sandwell and West Birmingham Hospitals · Seated exercises', url: 'https://www.swbh.nhs.uk/wp-content/uploads/2012/07/Seated-exercises-ML4817.pdf' },
  kingston: { title: 'Kingston and Richmond NHS · Home exercise programme', url: 'https://www.kingstonandrichmond.nhs.uk/patients-and-families/patient-leaflets/home-exercise-programme-falls-prevention' },
  wwlBack: { title: 'Wrightington, Wigan and Leigh NHS · Low back pain exercises, level 1', url: 'https://www.wwl.nhs.uk/media/.leaflets/6214e7c8e2e1f0.63708939.pdf' },
  balance: { title: 'Leicestershire Partnership NHS · Preventing falls', url: 'https://www.leicspart.nhs.uk/wp-content/uploads/2019/02/U0775-Preventing-Falls-leaflet-Update-04.pdf' },
  palms: { title: 'Kaiser Permanente · Shoulder stabilization exercises', url: 'https://mydoctor.kaiserpermanente.org/mas/Images/010526-001%20%2811-06%29_tcm88-727728.pdf' },
  umms: { title: 'University of Maryland Medical System · Back self-massage', url: 'https://health.umms.org/spine-care/relieve-back-pain-with-self-massage/' },
  torbay: { title: 'Torbay and South Devon NHS · Chair-based home exercise programme', url: 'https://www.torbayandsouthdevon.nhs.uk/uploads/chair-based-home-exercise-programme.pdf' },
  quads: { title: 'Arthritis Foundation · Walk With Ease exercises', url: 'https://www.arthritis.org/health-wellness/healthy-living/physical-activity/walking/walk-with-ease/wwe-exercises' },
  breaks: { title: 'Benzo et al. · Sitting interruptions and discomfort (2018)', url: 'https://pubmed.ncbi.nlm.nih.gov/29608539/' },
};

const guidance = 'Published movement guidance. Immediate relief in a travel setting has not been tested here.';
const adapted = 'Adapted from a clinical exercise demonstration. Its effect on everyday travel stiffness is uncertain.';

/**
 * side and forward estimate the clear space beyond each shoulder or in front of the knees
 * for a reference adult. They are planning allowances, not anthropometric measurements.
 * @param {string} motion @param {string} name @param {string[]} targets
 * @param {string} cue @param {string} caution @param {string} source
 * @param {{poses?: string[], uses?: string[], equipment?: string[], side?: number, forward?: number,
 * discretion?: string, evidence?: string, id?: string, stationary?: boolean, overhead?: boolean,
 * family?:string, region?:string, evidenceSource?:string}} [options]
 */
function movement(motion, name, targets, cue, caution, source, options = {}) {
  const poses = options.poses ?? ['seated'];
  return poses.map(pose => ({
    id: pose + '-' + (options.id ?? motion), motion, pose, name, targets, cue, caution,
    equipment: options.equipment ?? [], uses: options.uses ?? [], sourceIds: options.evidenceSource ? [source, options.evidenceSource] : [source],
    animation: options.family ? (options.id ?? motion) : undefined, family: options.family, region: options.region,
    evidence: options.evidence ?? guidance, side: options.side ?? 0, forward: options.forward ?? 0,
    discretion: options.discretion ?? 'quiet', stationary: options.stationary ?? false, overhead: options.overhead ?? false,
  }));
}

const both = ['seated', 'standing'];
const upright = ['standing'];
const floor = ['supine'];

// Motions with both postures are independently selectable and vetoable by ID.
export const moves = [
  ...movement('shoulder-roll', 'Shoulder rolls', ['shoulders', 'upper-back'],
    'Let your arms hang comfortably. Trace small circles with your shoulders, then reverse.',
    'Keep your chin level and make the circles small enough to clear the seat.', 'work', {poses: both, uses: ['arms']}),
  ...movement('heel-lift', 'Seated heel lifts', ['calves'],
    'Keep your toes planted. Lift both heels slowly, then settle them onto the floor.',
    'Use a range that keeps the balls of your feet in contact with the floor.', 'seatedLegs', {uses: ['legs']}),
  ...movement('neck-turn', 'Look left and right', ['neck'],
    'Keep your shoulders facing forward. Turn your head a little to one side, return through center, then change sides.',
    'Keep your eyes level and stop if turning makes you dizzy.', 'sitting', {poses: both, uses: ['twist']}),
  ...movement('hand-open', 'Open and close hands', ['hands'],
    'Draw your fingers into a loose fist. Open your hands again and let the fingers spread.',
    'Keep the knuckles soft and use very little pressure.', 'work', {poses: both, uses: ['arms']}),
  ...movement('neck-tilt', 'Ear toward shoulder', ['neck'],
    'Look ahead. Tip one ear a little toward its shoulder, come back upright, and repeat to the other side.',
    'Let the opposite shoulder stay heavy. Avoid pulling on your head.', 'flex', {poses: both}),
  ...movement('shoulder-squeeze', 'Shoulder blade squeeze', ['shoulders', 'upper-back', 'chest'],
    'Keep the arms low. Draw your shoulder blades gently back, pause briefly, and release while breathing normally.',
    'Keep your ribs still and your neck relaxed.', 'shoulder', {poses: both, uses: ['arms'], evidence: adapted}),
  ...movement('palm-turn', 'Turn palms over', ['hands'],
    'Bend your elbows at your sides. Slowly turn your palms toward the ceiling and then toward the floor.',
    'Turn at the forearms and keep the elbows tucked.', 'wrist', {poses: both, uses: ['arms'], evidence: adapted}),
  ...movement('wrist-bend', 'Wrist bends', ['hands'],
    'Let the fingers relax. Tip the hands up and down at the wrists in a comfortable arc.',
    'Keep the forearms still and skip any direction that feels uncomfortable.', 'work', {poses: both, uses: ['arms']}),
  ...movement('elbow-bend', 'Bend and open elbows', ['hands', 'shoulders'],
    'Keep your elbows close in. Bring the hands toward your shoulders, then lower them slowly.',
    'Check that your forearms clear the seat or surface in front.', 'work', {poses: both, uses: ['arms'], forward: 10}),
  ...movement('toe-lift', 'Seated toe lifts', ['calves'],
    'Leave your heels on the floor. Raise the fronts of your feet, then lower them quietly.',
    'Allow your shoes a little room under the seat in front.', 'ankle', {uses: ['legs']}),
  ...movement('chin-tuck', 'Chin tucks', ['neck'],
    'Look straight ahead. Slide your head back a little to make a double chin. Pause and release.',
    'Keep your eyes level. Stop if you feel dizzy.', 'neckLeeds', {poses: both}),
  ...movement('self-hug', 'Self-hug upper-back stretch', ['upper-back', 'shoulders'],
    'Cross your arms low across your chest and rest each hand on the opposite upper arm. Round your upper back gently, then release.',
    'Let your neck relax and keep the elbows close to your body.', 'cuhSeated',
    {poses: both, uses: ['arms', 'unsupported-back'], evidence: adapted}),
  ...movement('glute-squeeze', 'Buttock squeeze', ['hips'],
    'Gently tighten both buttocks. Keep breathing as you hold briefly, then let the muscles soften fully.',
    'Keep your feet planted and your hips still.', 'glutes', {poses: both, uses: ['legs']}),
  ...movement('knee-squeeze', 'Knee squeeze', ['hips', 'knees'],
    'With your feet flat and your knees touching, gently press your knees together. Hold briefly, then relax.',
    'A folded jacket or small pillow can cushion the contact. Ease off if pressing is uncomfortable.', 'swbhSeated',
    {uses: ['legs'], evidence: 'The hospital exercise uses a pillow. The version with knees touching is a travel adaptation.'}),
  ...movement('foot-slide', 'Seated heel slides', ['knees'],
    'Slide one heel back under your chair, keeping it on the floor. Slide back to the starting position and switch feet.',
    'Check that your heel can clear the seat frame and any bags underneath.', 'kingston', {uses: ['legs'], forward: 10, evidence: adapted}),
  ...movement('ankle-circle', 'Ankle circles', ['calves'],
    'Lift one foot just off the floor. Trace a small circle with your toes in each direction. Set it down and change feet.',
    'Rest the thigh on the seat and leave space for your shoe to turn.', 'kingston', {uses: ['legs'], forward: 8}),
  ...movement('seated-pelvic-tilt', 'Seated pelvic tilts', ['lower-back', 'hips'],
    'Sit upright with both feet flat. Rock your pelvis forward to make a small curve in your low back, then tip it back to gently round your waist.',
    'Keep the movement small enough to leave your feet planted.', 'wwlBack', {id: 'pelvic-tilt', uses: ['unsupported-back']}),
  ...movement('back-round', 'Round and lengthen your back', ['upper-back', 'lower-back'],
    'Let your back round gently as you slouch. Slowly sit taller and allow a small curve to return to your lower back.',
    'Keep both feet planted and use a comfortable range.', 'work', {uses: ['unsupported-back'], discretion: 'moderate'}),
  ...movement('back-arch', 'Standing back arch', ['lower-back'],
    'Stand with your hands on your hips. Keeping your knees steady, bend your back gently and return upright.',
    'Leave room behind you. Keep both feet flat and stay within a pain-free range.', 'wwlBack',
    {poses: upright, uses: ['arms', 'balance', 'unsupported-back'], side: 10, discretion: 'moderate', stationary: true}),
  ...movement('weight-shift', 'Side-to-side weight shift', ['hips'],
    'Hold a fixed support with your feet hip-width apart. Shift your weight a little toward one foot, then the other. Keep both soles down.',
    'Keep your hand on the support. Pause if the floor or vehicle moves unexpectedly.', 'balance',
    {poses: upright, uses: ['legs', 'arms', 'grip', 'balance'], equipment: ['support'], side: 4, forward: 12}),
  ...movement('toe-lift', 'Standing toe lifts', ['calves'],
    'Hold a fixed support. Keep both heels planted and lift the fronts of your feet. Lower your toes slowly.',
    'Stay upright and keep hold throughout.', 'kingston',
    {poses: upright, uses: ['legs', 'arms', 'grip', 'balance'], equipment: ['support'], forward: 12}),
  ...movement('palm-forward', 'Palms-forward chest opener', ['chest', 'shoulders'],
    'Let your arms hang at your sides. Turn your palms forward as you draw your shoulder blades gently back and down. Pause, then release.',
    'Keep your shoulders away from your ears.', 'palms', {poses: both, uses: ['arms']}),
  ...movement('ball-back', 'Upper-back ball release', ['upper-back', 'shoulders'],
    'Sit with both feet planted. Position a massage ball beside your spine, between your upper back and a firm chair back. Lean into it gently and shift a little.',
    'Keep the ball on muscle, away from the spine. Ease off before the pressure becomes painful.', 'umms',
    {uses: ['arms', 'grip', 'unsupported-back'], equipment: ['ball', 'firm-back'], evidence: adapted}),
  ...movement('hamstring-lean', 'Seated hamstring stretch', ['knees', 'hips'],
    'Sit near the front of your chair. Slide one heel forward and straighten that leg. Rest your hands on the bent thigh and lean forward from the hips. Return and change legs.',
    'Keep your back long. Ease out when you feel a gentle pull behind the straight thigh.', 'torbay',
    {uses: ['legs', 'arms', 'balance', 'unsupported-back'], forward: 48, discretion: 'moderate'}),
  ...movement('quad-set', 'Seated thigh tightening', ['knees'],
    'Extend one leg with the heel on the floor. Gently tighten the front of the thigh as if pressing the knee toward the floor. Hold briefly, release and change legs.',
    'Use light effort and let the heel stay down throughout the squeeze.', 'quads',
    {uses: ['legs'], forward: 48}),
  ...movement('trunk-turn', 'Seated upper-back turn', ['upper-back', 'lower-back'],
    'Cross your arms loosely over your chest. Turn your rib cage a short distance each way, keeping the hips forward.',
    'Stay within a comfortable arc and keep both feet planted.', 'sitting', {uses: ['arms', 'twist', 'unsupported-back'], side: 5, discretion: 'moderate'}),
  ...movement('seated-march', 'Seated knee lifts', ['hips', 'knees'],
    'With your feet under your knees, lift one foot a few centimeters. Set it down before lifting the other.',
    'Keep your pelvis still and check that your knee can clear the tray or table.', 'sitting', {uses: ['legs', 'unsupported-back'], discretion: 'moderate'}),
  ...movement('knee-extend', 'Straighten one knee', ['knees', 'calves'],
    'Lift one foot forward by straightening the knee. Lower slowly and change legs.',
    'Look for clear space the length of your lower leg before extending it.', 'seatedLegs', {uses: ['legs'], forward: 48, discretion: 'moderate'}),
  ...movement('chest-open', 'Open the chest', ['chest', 'shoulders'],
    'Sit tall. Reach your arms low and out to the sides, open across the front of your shoulders, then soften.',
    'Use an armless chair and leave space on either side.', 'sitting', {uses: ['arms', 'unsupported-back'], side: 50, discretion: 'any', stationary: true}),
  ...movement('overhead-reach', 'Alternating upward reach', ['shoulders', 'upper-back'],
    'Reach one arm up at a time with your ribs level. Let it lower fully before reaching up with the other.',
    'Check the ceiling clearance yourself before lifting your hand.', 'overhead', {uses: ['arms'], overhead: true, side: 15, discretion: 'any', stationary: true}),
  ...movement('wrist-stretch', 'Forearm stretch', ['hands'],
    'Reach one arm forward with fingers pointing up. Use the other hand to guide them gently back, then release and switch.',
    'Use very light pressure and keep the elbow soft.', 'forearm', {poses: both, uses: ['arms', 'grip'], forward: 40, discretion: 'moderate', evidence: adapted}),
  ...movement('towel-grip', 'Gentle towel squeeze', ['hands'],
    'Rest a rolled towel in one palm. Briefly squeeze it, release fully, and change hands.',
    'Keep breathing throughout and ease off if your fingers cramp.', 'grip', {poses: both, uses: ['arms', 'grip'], equipment: ['towel'], evidence: adapted}),
  ...movement('band-open', 'Band rotation', ['shoulders'],
    'Hold a light band between both hands, elbows bent and tucked against your sides. Turn the forearms outward a little, then guide them back.',
    'Inspect the band and keep it below your chest. Use the lightest comfortable tension.', 'shoulder', {poses: upright, uses: ['arms', 'grip'], equipment: ['band'], side: 25, discretion: 'any', stationary: true, evidence: adapted}),
  ...movement('side-bend', 'Standing side bend', ['lower-back', 'hips'],
    'Stand evenly on both feet. Slide one hand a little down the outside of its thigh, return upright, then change sides.',
    'Keep both feet flat. Stop before your weight starts shifting onto one foot.', 'flex', {poses: upright, uses: ['arms'], side: 8, discretion: 'moderate'}),
  ...movement('heel-lift', 'Supported heel raises', ['calves'],
    'Hold a fixed support in front of you. Rise onto the balls of both feet, pause, then lower with control.',
    'Choose a solid rail on level ground. Keep a hand on it throughout.', 'strength', {poses: upright, equipment: ['support'], uses: ['legs', 'arms', 'grip', 'balance'], forward: 28, discretion: 'moderate', stationary: true}),
  ...movement('knee-bend', 'Supported knee bends', ['knees', 'hips'],
    'Hold a solid support. Bend both knees a little as if starting to sit, then straighten back to standing.',
    'Keep your heels down and your knees aligned with your feet.', 'strength', {poses: upright, equipment: ['support'], uses: ['legs', 'arms', 'grip', 'balance'], forward: 35, discretion: 'moderate', stationary: true}),
  ...movement('hip-side', 'Supported side lift', ['hips'],
    'Stand tall at a secure handhold. Lift one straight leg a little to the side, bring it back, and change legs.',
    'Keep your trunk steady and your foot clear of passersby.', 'strength', {poses: upright, equipment: ['support'], uses: ['legs', 'arms', 'grip', 'balance'], side: 32, discretion: 'any', stationary: true}),
  ...movement('calf-stretch', 'Supported calf stretch', ['calves'],
    'Hold a fixed support. Step one foot back, keep its heel down, and gently bend the front knee. Ease out and change legs.',
    'Keep both feet facing forward on a level, nonslip surface.', 'flex', {poses: upright, equipment: ['support'], uses: ['legs', 'arms', 'grip', 'balance'], forward: 45, discretion: 'any', stationary: true}),
  ...movement('step-up', 'Low step-up', ['knees', 'hips'],
    'Hold the rail. Step onto a low fixed step with one foot, bring the other up beside it, then step down. Change lead foot.',
    'Use a clear, stationary step with room for your whole foot. Keep the rail in reach.', 'step', {poses: upright, equipment: ['support', 'step'], uses: ['legs', 'arms', 'grip', 'balance'], forward: 50, discretion: 'any', stationary: true}),
  ...['ball', 'roller'].flatMap(item => movement('foot-roll', item === 'ball' ? 'Roll foot over a ball' : 'Roll foot over a roller', ['calves'],
    'While seated, rest the arch of one foot on the ' + (item === 'ball' ? 'ball' : 'roller') + '. Guide it gently back and forth, then change feet.',
    'Choose light pressure and a clear floor where the object cannot roll away.', 'foot', {id: 'foot-roll-' + item, equipment: [item], uses: ['legs'], forward: 20, discretion: 'moderate', stationary: true, evidence: adapted})),
  ...movement('heel-slide', 'Reclined heel slides', ['knees', 'hips'],
    'Lie on your back with knees bent. Slide one heel away, then draw it back. Repeat on the other side.',
    'Keep the heel in contact with the surface and use a comfortable range.', 'knee', {poses: floor, uses: ['legs'], discretion: 'any', evidence: adapted}),
  ...movement('pelvic-tilt', 'Reclined pelvic tilts', ['lower-back', 'hips'],
    'Rest on your back with knees bent and feet flat. Tip your pelvis until your low back touches down gently, then release.',
    'Use a small rocking movement and keep breathing throughout.', 'back', {poses: floor, uses: ['legs'], discretion: 'any', evidence: adapted}),
  ...movement('knee-roll', 'Reclined knee rolls', ['lower-back', 'hips'],
    'Lie on your back with both knees bent. Let the knees travel a little to one side together. Return through center and change sides.',
    'Let your shoulders remain supported and stop before they lift.', 'back', {poses: floor, uses: ['legs', 'twist'], side: 30, discretion: 'any', evidence: adapted}),
  ...handNeckLibrary(movement), ...upperLibrary(movement), ...lowerLibrary(movement),
];
