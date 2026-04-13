import { linkAttrs, makeInitials } from "../shared.js";

const renderMemberVisual = (member) =>
  member.headshot
    ? `<img src="${member.headshot}" alt="${member.name}">`
    : `<span>${makeInitials(member.name)}</span>`;

const renderInspector = (member) => `
  <div class="member-inspector-visual ${member.headshot ? "" : "member-inspector-initials"}">
    ${renderMemberVisual(member)}
  </div>
  <p class="terminal-label">${member.role}</p>
  <h2>${member.name}</h2>
  <p>${member.bio || member.focus}</p>
  <div class="link-row">
    ${
      member.email
        ? `<a href="mailto:${member.email}">Email ${member.name.split(" ")[0]}</a>`
        : `<a href="contact.html">Contact through lab</a>`
    }
  </div>
`;

const renderTeam = (mount, content) => {
  const { team } = content;
  const initialMember = team.roster[0];

  mount.innerHTML = `
    <section class="module shell reveal" id="leadership">
      <div class="lead-grid">
        <article class="lead-card hud-panel">
          <div class="lead-avatar">
            <img src="${team.leadership.headshot}" alt="${team.leadership.name}" style="object-position:${team.leadership.headshotPosition || "50% 50%"}">
          </div>
          <div class="lead-copy">
            <p class="terminal-label">${team.leadership.role}</p>
            <h2>${team.leadership.name}</h2>
            <p>${team.leadership.summary}</p>
            <div class="link-row">
              ${team.leadership.links.map((link) => `<a href="${link.href}"${linkAttrs(link.href)}>${link.label}</a>`).join("")}
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="module shell reveal" id="team-overview">
      <article class="hud-panel stat-panel team-overview-panel">
        <p class="terminal-label">Team overview</p>
        <p>${team.note}</p>
        <div class="mini-metrics">
          <div><strong>${team.roster.length}</strong><span>current members</span></div>
          <div><strong>${team.alumni.length}</strong><span>alumni network</span></div>
          <div><strong>${team.roster.filter((member) => member.headshot).length}</strong><span>profile images</span></div>
        </div>
      </article>
    </section>

    <section class="module shell reveal" id="roster">
      <div class="dual-grid">
        <article class="hud-panel">
          <div class="module-heading compact">
            <p class="page-kicker">Active roster</p>
            <h2>Current members</h2>
          </div>
          <div class="roster-cloud">
            ${team.roster
              .map(
                (member, index) => `
                  <button class="roster-chip roster-chip-button ${index === 0 ? "is-active" : ""}" type="button" data-member-index="${index}">
                    <span class="chip-initial">${makeInitials(member.name)}</span>
                    <div>
                      <strong>${member.name}</strong>
                      <small>${member.role}</small>
                    </div>
                  </button>
                `
              )
              .join("")}
          </div>
        </article>
        <article class="hud-panel member-inspector" id="memberInspector">
          ${renderInspector(initialMember)}
        </article>
      </div>
    </section>

    <section class="module shell reveal" id="alumni">
      <article class="hud-panel">
          <div class="module-heading compact">
            <p class="page-kicker">Alumni</p>
            <h2>Alumni network</h2>
          </div>
          <div class="alumni-cloud">
            ${team.alumni.map((name) => `<span>${name}</span>`).join("")}
          </div>
      </article>
    </section>
  `;

  const inspector = mount.querySelector("#memberInspector");
  const buttons = [...mount.querySelectorAll(".roster-chip-button")];

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const member = team.roster[Number(button.dataset.memberIndex)];
      if (!member || !inspector) {
        return;
      }

      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      inspector.innerHTML = renderInspector(member);
    });
  });
};

export { renderTeam };
