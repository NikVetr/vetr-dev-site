import { linkAttrs } from "../shared.js";

const renderResources = (mount, content) => {
  const { resources } = content;

  mount.innerHTML = `
    <section class="module shell reveal" id="catalog">
      <div class="module-heading">
        <p class="page-kicker">Toolchain</p>
        <h2>Public tools, guides, and shared infrastructure.</h2>
        <p>${resources.intro}</p>
      </div>
      <div class="resource-grid">
        ${resources.categories
          .map(
            (category) => `
              <article class="terminal-panel">
                <p class="terminal-label">${category.title}</p>
                <p>${category.text}</p>
                <ul class="terminal-links">
                  ${category.items.map((item) => `<li><a href="${item.href}"${linkAttrs(item.href)}>${item.label}</a></li>`).join("")}
                </ul>
              </article>
            `
          )
          .join("")}
      </div>
    </section>

    <section class="module shell reveal" id="guides">
      <div class="module-heading">
        <p class="page-kicker">Operational guides</p>
        <h2>Practical routes into the lab's compute culture.</h2>
      </div>
      <div class="guide-grid">
        ${resources.guides
          .map(
            (guide) => `
              <article class="hud-panel">
                <h3>${guide.title}</h3>
                <p>${guide.text}</p>
                <a class="inline-link" href="${guide.href}"${linkAttrs(guide.href)}>Open guide</a>
              </article>
            `
          )
          .join("")}
      </div>
    </section>

    <section class="module shell reveal" id="landscape">
      <div class="module-heading">
        <p class="page-kicker">Data landscape</p>
        <h2>Reference resources behind the work.</h2>
      </div>
      <div class="quick-grid">
        ${resources.inventory
          .map(
            (item) => `
              <article class="hud-panel">
                <h3>${item.title}</h3>
                <p>${item.text}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
};

export { renderResources };
