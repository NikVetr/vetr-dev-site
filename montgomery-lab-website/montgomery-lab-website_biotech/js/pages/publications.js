import { hydrateScholarFeed, linkAttrs } from "../shared.js";

const renderPublications = (mount, content) => {
  const { publications } = content;

  mount.innerHTML = `
    <section class="module shell reveal" id="overview">
      <div class="publication-hero">
        <article class="hud-panel publication-note">
          <p class="terminal-label">Paper stream</p>
          <h2>Selected papers that define the lab's scientific arc.</h2>
          <p>These publications trace a path from early transcriptome genetics to cross-tissue regulation, rare-disease interpretation, and recent consortium-scale atlas work.</p>
        </article>
        <article class="visual-frame publication-image">
          <img src="${publications.image}" alt="Scientific meeting scene associated with Montgomery Lab publications">
          <div class="frame-caption">
            <p class="terminal-label">Scientific meetings</p>
            <p>Scientific output is paired with methods, data resources, and collaborative follow-through.</p>
          </div>
        </article>
      </div>
    </section>

    <section class="module shell reveal" id="recent">
      <div class="module-heading compact">
        <p class="page-kicker">Recent from Scholar</p>
        <h2>Most recent papers from the live publication stream.</h2>
        <p id="scholarFeedMeta" class="page-lede"></p>
      </div>
      <div id="scholarFeedGrid" class="publication-grid"></div>
    </section>

    <section class="module shell reveal" id="milestones">
      <div class="module-heading">
        <p class="page-kicker">Milestone papers</p>
        <h2>Selected reference points.</h2>
      </div>
      <div class="publication-grid">
        ${publications.featured
          .map(
            (paper) => `
              <article class="hud-panel publication-card">
                <p class="terminal-label">${paper.year}</p>
                <h3>${paper.title}</h3>
                <p>${paper.detail}</p>
                <a class="inline-link" href="${paper.href}"${linkAttrs(paper.href)}>Open source</a>
              </article>
            `
          )
          .join("")}
      </div>
    </section>

    <section class="module shell reveal" id="themes">
      <div class="module-heading">
        <p class="page-kicker">Focus streams</p>
        <h2>Recurring publication themes.</h2>
      </div>
      <div class="stream-grid">
        ${publications.streams
          .map(
            (stream) => `
              <article class="hud-panel">
                <h3>${stream.title}</h3>
                <p>${stream.text}</p>
              </article>
            `
          )
          .join("")}
      </div>
      <div class="quick-grid">
        ${publications.selected
          .map(
            (item) => `
              <article class="hud-panel">
                <p class="terminal-label">${item.eyebrow}</p>
                <h3>${item.title}</h3>
                <p>${item.text}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;

  hydrateScholarFeed("scholarFeedGrid", "scholarFeedMeta", publications.featured);
};

export { renderPublications };
