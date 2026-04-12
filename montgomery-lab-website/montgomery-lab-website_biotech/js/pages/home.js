import { linkAttrs } from "../shared.js";

const renderHome = (mount, content) => {
  const { hero, research, consortia, resources, publications, news, dock } = content;
  const pageJumps = dock.filter((item) => item.id !== "home");

  mount.innerHTML = `
    <section class="hero-shell shell">
      <div class="hero-copy reveal">
        <p class="terminal-label status-pill">${hero.status}</p>
        <h1>${hero.title}</h1>
        <p class="hero-lede">${hero.lede}</p>
        <div class="hero-chip-row">
          ${hero.chips.map((chip) => `<span>${chip}</span>`).join("")}
        </div>
        <div class="hero-actions">
          <a class="action-primary" href="${hero.primaryCta.href}">${hero.primaryCta.label}</a>
          <a class="action-secondary" href="${hero.secondaryCta.href}">${hero.secondaryCta.label}</a>
        </div>
        <div class="metric-grid">
          ${hero.metrics
            .map(
              (metric) => `
                <article class="metric-card">
                  <p class="metric-value">${metric.value}</p>
                  <p class="metric-label">${metric.label}</p>
                </article>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="hero-visual reveal">
        <article class="visual-frame visual-frame-main">
          <img src="${hero.imageA.src}" alt="${hero.imageA.alt}">
          <div class="frame-caption">
            <p class="terminal-label">Working session</p>
            <p>${hero.imageA.caption}</p>
          </div>
        </article>
        <article class="visual-frame visual-frame-side">
          <img src="${hero.imageB.src}" alt="${hero.imageB.alt}">
          <div class="frame-caption">
            <p class="terminal-label">Current team</p>
            <p>${hero.imageB.caption}</p>
          </div>
        </article>
        <article class="hud-panel visual-frame terminal-stack">
          <p class="terminal-label">Research preview</p>
          <div class="stack-grid">
            ${research.cards
              .slice(0, 4)
              .map(
                (card) => `
                  <div class="stack-cell">
                    <p>${card.eyebrow}</p>
                    <strong>${card.title}</strong>
                  </div>
                `
              )
              .join("")}
          </div>
        </article>
      </div>
    </section>

    <section class="module shell reveal" id="destinations">
      <div class="module-heading">
        <p class="page-kicker">Command dock</p>
        <h2>Move directly into research, people, papers, tools, and collaboration.</h2>
        <p>Each destination emphasizes a different part of the lab's public work, from scientific programs and published outputs to recruitment, resources, and contact routes.</p>
      </div>
      <div class="jump-grid">
        ${pageJumps
          .map(
            (item) => `
              <a class="jump-card hud-panel" href="${item.href}">
                <p class="terminal-label">${item.label}</p>
                <h3>${content.pages[item.id].title}</h3>
                <p>${content.pages[item.id].lede}</p>
              </a>
            `
          )
          .join("")}
      </div>
    </section>

    <section class="module shell reveal" id="engines">
      <div class="module-heading">
        <p class="page-kicker">Research engines</p>
        <h2>Four active routes from signal to biological consequence.</h2>
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

    <section class="module shell reveal" id="outputs">
      <div class="module-heading">
        <p class="page-kicker">Output streams</p>
        <h2>Papers, tools, consortia, and milestones.</h2>
      </div>
      <div class="quick-grid">
        <article class="hud-panel">
          <p class="terminal-label">Selected publications</p>
          <p>${publications.featured[2].title}</p>
          <a class="inline-link" href="publications.html">Open paper stream</a>
        </article>
        <article class="hud-panel">
          <p class="terminal-label">Partner network</p>
          <p>${consortia[0].shortName}, ${consortia[1].shortName}, ${consortia[2].shortName}, and ${consortia[3].shortName} anchor the lab inside large collaborative ecosystems.</p>
          <a class="inline-link" href="consortia.html">Open partner network</a>
        </article>
        <article class="hud-panel">
          <p class="terminal-label">Toolchain</p>
          <p>Public tools include ${resources.categories[0].items.slice(0, 4).map((tool) => tool.label).join(", ")}, plus workflow and portal infrastructure.</p>
          <a class="inline-link" href="resources.html">Open resources</a>
        </article>
        <article class="hud-panel">
          <p class="terminal-label">Milestone timeline</p>
          <p>${news[0].year}, ${news[1].year}, and ${news[2].year} mark distinct phases of the lab's public scientific arc.</p>
          <a class="inline-link" href="news.html">Open timeline</a>
        </article>
      </div>
    </section>
  `;
};

export { renderHome };
