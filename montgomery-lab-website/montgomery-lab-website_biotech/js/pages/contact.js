import { linkAttrs } from "../shared.js";

const renderContact = (mount, content) => {
  const { contact, news } = content;

  mount.innerHTML = `
    <section class="module shell reveal" id="channels">
      <div class="contact-grid">
        <article class="hud-panel">
          <p class="terminal-label">Primary channels</p>
          <div class="contact-list">
            <a href="mailto:${contact.email}">${contact.email}</a>
            <a href="mailto:${contact.admin}">${contact.admin}</a>
            <a href="tel:6507259641">${contact.phone}</a>
          </div>
        </article>
        <article class="hud-panel">
          <p class="terminal-label">Location</p>
          <p>${contact.location}</p>
          <p>${contact.mailing}</p>
        </article>
        <article class="hud-panel">
          <p class="terminal-label">Official links</p>
          <div class="link-column">
            ${contact.links.map((link) => `<a href="${link.href}"${linkAttrs(link.href)}>${link.label}</a>`).join("")}
          </div>
        </article>
      </div>
    </section>

    <section class="module shell reveal" id="signals">
      <div class="module-heading">
        <p class="page-kicker">Selected milestones</p>
        <h2>Recent external visibility.</h2>
      </div>
      <div class="quick-grid">
        ${news
          .slice(0, 3)
          .map(
            (item) => `
              <article class="hud-panel">
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

export { renderContact };
