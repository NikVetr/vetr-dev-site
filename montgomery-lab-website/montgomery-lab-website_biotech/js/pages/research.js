const renderResearch = (mount, content) => {
  const { research } = content;

  mount.innerHTML = `
    <section class="module shell reveal" id="engines">
      <div class="module-heading">
        <p class="page-kicker">Research engines</p>
        <h2>From human variation to molecular mechanism.</h2>
        <p>${research.intro}</p>
      </div>
      <div class="engine-grid">
        ${research.cards
          .map(
            (card) => `
              <article class="engine-card hud-panel">
                <p class="terminal-label">${card.eyebrow}</p>
                <h3>${card.title}</h3>
                <p>${card.text}</p>
                <ul class="signal-list">
                  ${card.bullets.map((bullet) => `<li>${bullet}</li>`).join("")}
                </ul>
              </article>
            `
          )
          .join("")}
      </div>
    </section>

    <section class="module shell reveal" id="pipeline">
      <div class="module-heading">
        <p class="page-kicker">Pipeline</p>
        <h2>How signal moves through the lab.</h2>
      </div>
      <div class="pipeline-grid">
        ${research.pipeline
          .map(
            (step) => `
              <article class="pipeline-card hud-panel">
                <p class="terminal-label">${step.label}</p>
                <h3>${step.title}</h3>
                <p>${step.text}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>

    <section class="module shell reveal" id="projects">
      <div class="module-heading">
        <p class="page-kicker">Project track</p>
        <h2>Representative live programs.</h2>
      </div>
      <div class="track-grid">
        ${research.projectTrack
          .map(
            (project) => `
              <article class="track-card hud-panel">
                <div class="track-top">
                  <h3>${project.title}</h3>
                  <span>${project.status}</span>
                </div>
                <p>${project.text}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
};

export { renderResearch };
