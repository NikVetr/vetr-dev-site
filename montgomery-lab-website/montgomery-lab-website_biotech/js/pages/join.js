const renderJoin = (mount, content) => {
  const { join, contact } = content;

  mount.innerHTML = `
    <section class="module shell reveal" id="audiences">
      <div class="module-heading">
        <p class="page-kicker">Recruitment protocol</p>
        <h2>Who should reach out and what to send.</h2>
        <p>${join.intro}</p>
      </div>
      <div class="audience-grid">
        ${join.audiences
          .map(
            (audience) => `
              <article class="hud-panel">
                <p class="terminal-label">${audience.title}</p>
                <p>${audience.text}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>

    <section class="module shell reveal" id="entry">
      <div class="module-heading">
        <p class="page-kicker">Entry sequence</p>
        <h2>How onboarding is structured.</h2>
      </div>
      <div class="steps-grid">
        ${join.steps
          .map(
            (step, index) => `
              <article class="step-card hud-panel">
                <span class="step-index">0${index + 1}</span>
                <h3>${step.title}</h3>
                <p>${step.text}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>

    <section class="module shell reveal" id="faq">
      <div class="dual-grid">
        <article class="hud-panel compact-values-panel">
          <p class="terminal-label">Operating values</p>
          <div class="value-cloud">
            ${join.values.map((value) => `<span>${value}</span>`).join("")}
          </div>
        </article>
        <article class="hud-panel">
          <p class="terminal-label">Frequently asked</p>
          <div class="faq-list">
            ${join.faq
              .map(
                (item) => `
                  <article class="faq-card">
                    <h3>${item.question}</h3>
                    <p>${item.answer}</p>
                  </article>
                `
              )
              .join("")}
          </div>
          <div class="link-row">
            <a href="mailto:${contact.email}">Email Stephen Montgomery</a>
            <a href="mailto:${contact.admin}">Email Char Armitage</a>
          </div>
        </article>
      </div>
    </section>
  `;
};

export { renderJoin };
