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

export { renderConsortia };
