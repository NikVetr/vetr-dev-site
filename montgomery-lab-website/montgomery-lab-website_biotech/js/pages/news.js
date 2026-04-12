const renderNews = (mount, content) => {
  const { news } = content;

  mount.innerHTML = `
    <section class="module shell reveal" id="milestones">
      <div class="module-heading">
        <p class="page-kicker">Selected milestones</p>
        <h2>Public milestones across the lab's timeline.</h2>
        <p>This timeline focuses on visible moments that shaped the lab's public scientific footprint rather than trying to be a complete historical archive.</p>
      </div>
      <div class="news-grid">
        ${news
          .map(
            (item) => `
              <article class="news-card hud-panel">
                <img src="${item.image}" alt="${item.title}">
                <div class="news-copy">
                  <p class="terminal-label">${item.year}</p>
                  <h3>${item.title}</h3>
                  <p>${item.text}</p>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>

    <section class="module shell reveal" id="timeline">
      <div class="timeline-list">
        ${news
          .map(
            (item) => `
              <article class="timeline-item hud-panel">
                <p class="terminal-label">${item.year}</p>
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

export { renderNews };
