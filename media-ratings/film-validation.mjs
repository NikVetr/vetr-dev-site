import { node } from './detail.mjs';

export function renderFilmValidation(host, report) {
  const { confirmation, models } = report;
  /** @type {[string, (row: any) => string][]} */
  const fields = [
    ['Category log loss', (row) => row.logLoss.toFixed(4)],
    ['RMSE (stars)', (row) => row.rmse.toFixed(4)],
    ['Brier (≥4 stars)', (row) => row.brier.toFixed(4)],
    ['Ranked probability score', (row) => row.rps.toFixed(4)],
    [
      'Calibration gap (≥4 stars)',
      (row) => (100 * row.reliability.find((r) => r.cutoff === 4).meanAbsoluteGap).toFixed(2) + ' pp',
    ],
    [
      '90% predictive coverage',
      (row) => (100 * row.intervals.find((r) => r.level === 0.9).tieAdjusted.mean).toFixed(2) + '%',
    ],
    ['Central range width (stars)', (row) => row.intervals.find((r) => r.level === 0.9).width.toFixed(2)],
  ];
  const columns = [
    ['personalized', 'Current default'],
    ['reference', 'Gaussian reference'],
    ['latentClass', 'Eight classes'],
    ['recalibrated', 'Recalibrated (study)'],
  ];
  const table = node('table');
  table.createCaption().textContent = 'Film forecasts for new MovieLens respondents, 2022–23';
  const head = table.createTHead().insertRow();
  for (const label of ['Measure', ...columns.map(([, name]) => name)]) {
    const th = node('th', label);
    th.scope = 'col';
    head.append(th);
  }
  const body = table.createTBody();
  for (const [label, format] of fields) {
    const row = body.insertRow(),
      th = node('th', label);
    th.scope = 'row';
    row.append(th);
    for (const [id] of columns) row.insertCell().textContent = format(models[id]);
  }
  const scroll = node('div');
  scroll.className = 'film-comparison-scroll';
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.ariaLabel = 'Film model comparison';
  scroll.append(table);
  host.replaceChildren(
    scroll,
    node(
      'p',
      confirmation.people.toLocaleString() +
        ' people supplied their first four film ratings. ' +
        'The models predicted ' +
        confirmation.ratings.toLocaleString() +
        ' strictly later ratings. The correction was fitted on separate 2020–21 respondents.',
    ),
    node(
      'p',
      'Calibration gap compares observed and predicted four-star rates in ten probability bands. ' +
        'Coverage should be close to 90% after adjusting for ties on the half-star scale. Width measures the span between the two endpoint ratings.',
    ),
  );
}
