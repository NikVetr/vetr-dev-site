import { shuffled } from './shuffle.js';
import { recordAnswer } from './drill-store.js';
import { showSign } from './sign-media.js';

/** @param {import('./sign-media.js').Sign[]} signs @param {AbortSignal} lifetime
 * @param {(err:unknown)=>void} report */
export function startQuiz(signs, lifetime, report) {
  const direction = /** @type {HTMLSelectElement} */ (document.getElementById('quiz-direction'));
  const count = /** @type {HTMLElement} */ (document.getElementById('quiz-count'));
  const prompt = /** @type {HTMLElement} */ (document.getElementById('quiz-prompt'));
  const film = /** @type {HTMLElement} */ (document.getElementById('quiz-video'));
  const actions = /** @type {HTMLElement} */ (document.getElementById('quiz-actions'));
  const feedback = /** @type {HTMLElement} */ (document.getElementById('quiz-feedback'));
  let deck = shuffled(signs, Math.random);
  let index = 0, correct = 0;
  let question = new AbortController();
  lifetime.addEventListener('abort', () => question.abort(), { once:true });

  /** @param {string} label @param {()=>void} run */
  function action(label, run) {
    const button = document.createElement('button');
    button.textContent = label;
    button.onclick = run;
    actions.append(button);
  }
  function restart() {
    deck = shuffled(signs, Math.random);
    index = 0; correct = 0;
    render();
  }
  function render() {
    question.abort();
    question = new AbortController();
    film.replaceChildren();
    actions.replaceChildren();
    feedback.textContent = '';
    const recognize = direction.value === 'recognize';
    if (index === deck.length) {
      count.textContent = '';
      prompt.textContent = 'Practice complete';
      feedback.textContent = recognize ? correct + ' of ' + deck.length + ' correct.' : deck.length + ' signs practiced.';
      action('Practice again', restart);
      return;
    }
    const sign = deck[index];
    count.textContent = (index + 1) + ' of ' + deck.length;
    const next = () => action(index + 1 === deck.length ? 'Finish' : 'Next sign', () => { index++; render(); });
    if (recognize) {
      prompt.textContent = 'What does this sign mean?';
      showSign(film, sign, question.signal);
      const others = shuffled(signs.filter(s => s.id !== sign.id), Math.random).slice(0,3);
      for (const option of shuffled([sign, ...others], Math.random)) {
        action(option.label, () => {
          const right = option.id === sign.id;
          if (right) correct++;
          actions.replaceChildren();
          feedback.textContent = right ? 'Correct · ' + sign.label : 'The sign means “' + sign.label + '”.';
          void recordAnswer('ase__en', 'asl-cafe.' + sign.id, right ? 'right' : 'wrong').catch(report);
          next();
        });
      }
    } else {
      prompt.textContent = 'How would you sign “' + sign.label + '”?';
      action('Reveal animation', () => {
        actions.replaceChildren();
        showSign(film, sign, question.signal);
        next();
      });
    }
  }
  direction.addEventListener('change', restart, { signal:lifetime });
  render();
}
