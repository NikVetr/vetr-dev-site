const renderConsortia = (mount, content) => {
  const { consortia } = content;

  mount.innerHTML = `
    <section class="module shell reveal" id="programs">
      <div class="module-heading">
        <p class="page-kicker">Partner network</p>
        <h2>Programs that expand the lab's scientific reach.</h2>
        <p>The Montgomery Lab shows up in collaborations where shared standards, public data products, and scientific scale are inseparable.</p>
      </div>
      <div class="partner-grid">
        ${consortia
          .map(
            (item) => `
              <article class="partner-card hud-panel">
                <div class="partner-logo">
                  <img src="${item.logo}" alt="${item.shortName}">
                </div>
                <div class="partner-copy">
                  <p class="terminal-label">${item.role}</p>
                  <h3>${item.shortName}</h3>
                  <p>${item.summary}</p>
                  <p class="partner-output">${item.output}</p>
                  <a class="inline-link" href="${item.href}">Open program dossier</a>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>

    <section class="module shell reveal" id="roles">
      <div class="module-heading">
        <p class="page-kicker">Role map</p>
        <h2>What the lab contributes inside these programs.</h2>
      </div>
      <div class="matrix-grid">
        ${consortia
          .map(
            (item) => `
              <article class="hud-panel matrix-card">
                <p class="terminal-label">${item.shortName}</p>
                <h3>${item.role}</h3>
                <p>${item.output}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
};

const renderConsortiumDetail = (mount, content) => {
  const consortiumId = document.body.dataset.consortium || "";
  const item = content.consortia.find((entry) => entry.id === consortiumId);

  if (!item) {
    mount.innerHTML = `
      <section class="module shell reveal">
        <div class="module-heading">
          <p class="page-kicker">Program lookup</p>
          <h2>Consortium detail not found.</h2>
          <p>The requested consortium record is missing from the current Genome OS build.</p>
          <a class="inline-link" href="consortia.html">Return to partner network</a>
        </div>
      </section>
    `;
    return;
  }

  mount.innerHTML = `
    <section class="module shell reveal" id="program-detail">
      <div class="lead-grid consortium-lead-grid">
        <article class="lead-card hud-panel consortium-lead-card">
          <div class="lead-avatar consortium-lead-logo">
            <img src="${item.logo}" alt="${item.shortName}">
          </div>
          <div class="lead-copy">
            <p class="terminal-label">${item.role}</p>
            <h2>${item.name}</h2>
            <p>${item.summary}</p>
            <div class="link-row">
              <a href="consortia.html">Back to partner network</a>
              <a href="research.html">Research engines</a>
            </div>
          </div>
        </article>
        <article class="hud-panel stat-panel">
          <p class="terminal-label">${item.shortName}</p>
          <h3>${item.focus}</h3>
          <p>${item.roleDetail}</p>
          <ul class="hud-list">
            ${item.highlights.map((highlight) => `<li>${highlight}</li>`).join("")}
          </ul>
        </article>
      </div>
    </section>

    <section class="module shell reveal" id="context">
      <div class="dual-grid consortium-detail-grid">
        <article class="hud-panel">
          <div class="module-heading compact">
            <p class="page-kicker">Overview</p>
            <h2>What this program is built to answer.</h2>
          </div>
          <p>${item.overview}</p>
        </article>
        <article class="hud-panel">
          <div class="module-heading compact">
            <p class="page-kicker">Lab contribution</p>
            <h2>How the lab operates inside it.</h2>
          </div>
          <p>${item.labContribution}</p>
        </article>
      </div>
    </section>

    <section class="module shell reveal" id="program-switchboard">
      <div class="module-heading">
        <p class="page-kicker">Switchboard</p>
        <h2>Jump to another consortium dossier.</h2>
      </div>
      <div class="partner-grid">
        ${content.consortia
          .map(
            (entry) => `
              <a class="partner-card hud-panel consortium-jump-card ${entry.id === item.id ? "is-active" : ""}" href="${entry.href}">
                <div class="partner-logo">
                  <img src="${entry.logo}" alt="${entry.shortName}">
                </div>
                <div class="partner-copy">
                  <p class="terminal-label">${entry.role}</p>
                  <h3>${entry.shortName}</h3>
                  <p>${entry.focus}</p>
                </div>
              </a>
            `
          )
          .join("")}
      </div>
    </section>
  `;
};

export { renderConsortia, renderConsortiumDetail };
