import { siteData } from "./site-content.js";
import { initPhotoCarousels } from "./photo-carousel.js";

const byId = (id) => document.getElementById(id);
const page = document.body.dataset.page || "home";
const activePage = page === "consortium-detail" ? "consortia" : page;
let marginShell;
let marginParallaxFrame = 0;

const pageFieldNotes = {
  home: {
    eyebrow: "Overview",
    title: "Montgomery Lab",
    text: "The Montgomery Lab studies how genetic variation shapes molecular phenotypes, disease mechanisms, and diagnosis.",
    tags: ["Research", "People", "Consortia"],
  },
  research: {
    eyebrow: "Overview",
    title: "Research",
    text: "Across projects, the recurring question is how human genetic variation becomes measurable molecular consequence and eventually clinical relevance.",
    tags: ["Programs", "Projects", "Methods"],
  },
  team: {
    eyebrow: "Overview",
    title: "Team",
    text: "The roster mixes faculty leadership, postdocs, graduate students, staff scientists, and alumni from earlier phases of the lab.",
    tags: ["People", "Leadership", "Alumni"],
  },
  publications: {
    eyebrow: "Overview",
    title: "Publications",
    text: "The publication record traces a path from transcriptome genetics and regulatory variation to rare disease and consortium-scale molecular atlases.",
    tags: ["Reading", "Themes", "Milestones"],
  },
  consortia: {
    eyebrow: "Overview",
    title: "Consortia",
    text: "The lab's consortium work links local projects at Stanford to national efforts in rare disease, exercise biology, precision medicine, and regulatory genomics.",
    tags: ["Scale", "Collaboration", "Programs"],
  },
  resources: {
    eyebrow: "Overview",
    title: "Resources",
    text: "The resources page collects software, datasets, consortium portals, and practical computing material that grew out of the lab's research program.",
    tags: ["Tools", "Guides", "Workflow"],
  },
  join: {
    eyebrow: "Overview",
    title: "Join",
    text: "The lab welcomes people who are interested in experimental and computational genomics and who are ready to engage directly with data, biology, and collaboration.",
    tags: ["Culture", "Onboarding", "Mentorship"],
  },
  news: {
    eyebrow: "Overview",
    title: "Stories",
    text: "The news page brings together recent milestones and older turning points that help explain the lab's scientific trajectory.",
    tags: ["Culture", "Momentum", "Scenes"],
  },
  contact: {
    eyebrow: "Overview",
    title: "Contact",
    text: "Use the contact page for scientific inquiries, collaboration questions, and the official Stanford location and mailing details for the lab.",
    tags: ["Reach Out", "Location", "Links"],
  },
};

const pageDefaultFloatingNotes = {
  home: {
    eyebrow: "Lab context",
    title: "From signal to mechanism",
    body:
      "The homepage is meant to establish the lab's central through-line quickly: human genetic variation is studied at the level of regulation, cellular phenotype, disease mechanism, and diagnosis, with consortia and public resources extending that work outward.",
    tags: ["Variation", "Mechanism", "Diagnosis"],
  },
  research: {
    eyebrow: "Research context",
    title: "Four recurring lenses",
    body:
      "Across projects, the work tends to return to four linked lenses: gene regulation, molecular outliers in rare disease, consortium-scale data generation, and computational methods that make large genomics datasets interpretable.",
    tags: ["Regulation", "Rare disease", "Methods"],
  },
  team: {
    eyebrow: "People context",
    title: "How the lab is organized",
    body:
      "The team page is structured around active scientific roles first, then the alumni network. Current members span faculty leadership, instructors, staff, postdocs, graduate researchers, and administrative support tied to day-to-day lab operations.",
    tags: ["Current members", "Alumni", "Mentorship"],
  },
  publications: {
    eyebrow: "Reading context",
    title: "How to read this page",
    body:
      "The publication list is curated to show the lab's scientific arc rather than to reproduce a full bibliography. The highlighted papers trace a path from transcriptome genetics and regulatory variation to rare disease and large collaborative atlases.",
    tags: ["Milestones", "Themes", "Reading list"],
  },
  consortia: {
    eyebrow: "Collaboration context",
    title: "Why consortia matter here",
    body:
      "The consortium pages show how the lab works at a larger national scale. These programs connect Stanford-based projects to shared data generation, method development, and questions in rare disease, exercise biology, and functional interpretation.",
    tags: ["Scale", "Collaboration", "Data"],
  },
  resources: {
    eyebrow: "Resource context",
    title: "What is collected here",
    body:
      "The resources page combines software released by the lab with manuscript supplements, consortium portals, and practical workflow material. It is meant to show both what the lab has built and what it regularly uses in genomic analysis.",
    tags: ["Software", "Portals", "Workflows"],
  },
  join: {
    eyebrow: "Joining context",
    title: "What a strong inquiry looks like",
    body:
      "The strongest first contact is specific. Prospective members should explain what questions or methods interest them, how their background fits the lab's mix of computation and biology, and which materials they are ready to share now.",
    tags: ["Applications", "Fit", "Preparation"],
  },
  news: {
    eyebrow: "News context",
    title: "Recent and archival milestones",
    body:
      "The news page mixes recent public milestones with older turning points so visitors can see both current momentum and the longer trajectory of the lab's scientific collaborations, papers, and research programs.",
    tags: ["Timeline", "Momentum", "Archive"],
  },
  contact: {
    eyebrow: "Contact context",
    title: "When to use this page",
    body:
      "Use the contact page for scientific inquiries, collaboration questions, application logistics, and official Stanford mailing details. It brings together the main public contact routes without exposing internal-only lab operations.",
    tags: ["Email", "Location", "Official links"],
  },
};

const noteFrom = ({ eyebrow = "Context", title, body, tags = [] }) => ({ eyebrow, title, body, tags });
const entryLabel = (entry) => (typeof entry === "string" ? entry : entry.label);
const linkAttrs = (href) => (href?.startsWith("http") ? ' target="_blank" rel="noreferrer"' : "");
const SCHOLAR_FEED_PATH = "assets/data/scholar-feed.json";

const getDefaultFloatingNote = () => {
  if (page === "consortium-detail") {
    const item = siteData.consortia.find((entry) => entry.id === document.body.dataset.consortium);

    if (item) {
      return {
        eyebrow: "Consortium context",
        title: item.shortName,
        body: `This page summarizes ${item.shortName}, the lab's role in the program, and the scientific questions that collaboration helps address.`,
        tags: item.highlights.slice(0, 3),
      };
    }
  }

  return pageDefaultFloatingNotes[page] || pageDefaultFloatingNotes[activePage] || pageDefaultFloatingNotes.home;
};

const setFloatingNoteContent = (note) => {
  byId("floatingNoteEyebrow").textContent = note.eyebrow || "Context";
  byId("floatingNoteTitle").textContent = note.title;
  byId("floatingNoteBody").textContent = note.body;
  byId("floatingNoteTags").innerHTML = (note.tags || []).map((tag) => `<span>${tag}</span>`).join("");
};

const renderAvatar = (item, { large = false } = {}) => {
  const sizeClass = large ? " member-avatar-large" : "";

  if (item.headshot) {
    return `
      <div class="member-avatar has-photo${sizeClass}">
        <img src="${item.headshot}" alt="${item.name}" loading="lazy"${item.headshotPosition ? ` style="object-position: ${item.headshotPosition};"` : ""}>
      </div>
    `;
  }

  return `
    <div class="member-avatar${sizeClass}">
      <span>${item.initials || makeAvatar(item.name)}</span>
    </div>
  `;
};

const ensureMarginShell = () => {
  if (marginShell) {
    return marginShell;
  }

  marginShell = document.createElement("div");
  marginShell.className = "margin-shell";
  const defaultFloatingNote = getDefaultFloatingNote();
  marginShell.innerHTML = `
    <aside class="margin-rail margin-rail-left" aria-hidden="true">
      <p id="fieldNotesEyebrow" class="eyebrow"></p>
      <h2 id="fieldNotesTitle"></h2>
      <p id="fieldNotesText"></p>
      <div id="fieldNotesTags" class="margin-tag-row"></div>
    </aside>

    <aside id="floatingNote" class="margin-rail margin-rail-right" aria-live="polite">
      <button id="floatingNoteClose" class="floating-note-close" type="button" aria-label="Close note">Close</button>
      <p id="floatingNoteEyebrow" class="eyebrow">${defaultFloatingNote.eyebrow}</p>
      <h3 id="floatingNoteTitle">${defaultFloatingNote.title}</h3>
      <p id="floatingNoteBody">${defaultFloatingNote.body}</p>
      <div id="floatingNoteTags" class="margin-tag-row">${defaultFloatingNote.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
    </aside>
  `;

  document.body.append(marginShell);
  byId("floatingNoteClose")?.addEventListener("click", closeMarginNote);
  return marginShell;
};

const updateMarginParallax = () => {
  marginParallaxFrame = 0;

  if (!marginShell) {
    return;
  }

  const leftRail = marginShell.querySelector(".margin-rail-left");
  const rightRail = byId("floatingNote");
  const wideDesktop = window.matchMedia("(min-width: 1500px)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!leftRail || !rightRail || !wideDesktop || reducedMotion) {
    leftRail?.style.setProperty("--margin-left-parallax", "0px");
    rightRail?.style.setProperty("--margin-right-parallax", "0px");
    return;
  }

  const scroll = window.scrollY || window.pageYOffset || 0;
  const scrollRange = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const progress = Math.min(1, Math.max(0, scroll / scrollRange));
  const eased = progress * (2 - progress);
  const leftOffset = 26 * eased;
  const rightOffset = -18 * eased;

  leftRail.style.setProperty("--margin-left-parallax", `${leftOffset.toFixed(2)}px`);
  rightRail.style.setProperty("--margin-right-parallax", `${rightOffset.toFixed(2)}px`);
};

const scheduleMarginParallax = () => {
  if (marginParallaxFrame) {
    return;
  }

  marginParallaxFrame = window.requestAnimationFrame(updateMarginParallax);
};

const initMarginParallax = () => {
  ensureMarginShell();
  updateMarginParallax();
  window.addEventListener("scroll", scheduleMarginParallax, { passive: true });
  window.addEventListener("resize", scheduleMarginParallax);
};

const renderFieldNoteRail = () => {
  ensureMarginShell();

  let config = pageFieldNotes[page] || pageFieldNotes[activePage] || pageFieldNotes.home;

  if (page === "consortium-detail") {
    const item = siteData.consortia.find((entry) => entry.id === document.body.dataset.consortium);
    if (item) {
      config = {
        eyebrow: "Overview",
        title: item.shortName,
        text: "Each consortium page summarizes the program's scope, the lab's role, and the scientific questions tied to that collaboration.",
        tags: item.highlights.slice(0, 3),
      };
    }
  }

  byId("fieldNotesEyebrow").textContent = config.eyebrow;
  byId("fieldNotesTitle").textContent = config.title;
  byId("fieldNotesText").textContent = config.text;
  byId("fieldNotesTags").innerHTML = config.tags.map((tag) => `<span>${tag}</span>`).join("");
  setFloatingNoteContent(getDefaultFloatingNote());
};

const openMarginNote = (note) => {
  ensureMarginShell();
  const floating = byId("floatingNote");

  setFloatingNoteContent(note);
  floating?.classList.add("is-open");
};

function closeMarginNote() {
  setFloatingNoteContent(getDefaultFloatingNote());
  byId("floatingNote")?.classList.remove("is-open");
}

const attachNoteTrigger = (element, note, { wholeCard = true } = {}) => {
  if (!element || !note?.title || !note?.body) {
    return;
  }

  element.classList.add("note-anchor");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "note-trigger";
  trigger.setAttribute("aria-label", `Open note about ${note.title}`);
  trigger.innerHTML = `<span></span>`;
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    openMarginNote(note);
  });

  element.append(trigger);

  if (wholeCard) {
    element.tabIndex = 0;
    element.addEventListener("click", (event) => {
      if (event.target.closest("a, button, summary, input")) {
        return;
      }

      openMarginNote(note);
    });

    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      if (event.target.closest("a, button, summary, input")) {
        return;
      }

      event.preventDefault();
      openMarginNote(note);
    });
  }
};

const attachNotesByIndex = (elements, notes, options) => {
  Array.from(elements).forEach((element, index) => attachNoteTrigger(element, notes[index], options));
};

const renderNav = () => {
  const desktopNav = byId("desktopNav");
  const mobileNav = byId("mobileNav");
  const desktopDropdown = byId("consortiaDropdown");
  const mobileDropdown = byId("mobileConsortiaDropdown");

  if (!desktopNav || !mobileNav || !desktopDropdown || !mobileDropdown) {
    return;
  }

  desktopNav.innerHTML = siteData.nav
    .map((item) => {
      if (!item.dropdown) {
        return `
          <li>
            <a href="${item.href}" class="nav-link ${item.page === activePage ? "is-active" : ""}">
              ${item.label}
            </a>
          </li>
        `;
      }

      return `
        <li class="nav-dropdown">
          <button
            class="nav-link nav-dropdown-toggle ${item.page === activePage ? "is-active" : ""}"
            type="button"
            aria-expanded="false"
            aria-controls="consortiaDropdown"
          >
            ${item.label}
          </button>
        </li>
      `;
    })
    .join("");

  mobileNav.innerHTML = siteData.nav
    .map((item) => {
      if (!item.dropdown) {
        return `
          <li>
            <a href="${item.href}" class="mobile-nav-link ${item.page === activePage ? "is-active" : ""}">
              ${item.label}
            </a>
          </li>
        `;
      }

      return `
        <li class="mobile-nav-dropdown">
          <button
            class="mobile-nav-link mobile-nav-toggle ${item.page === activePage ? "is-active" : ""}"
            type="button"
            aria-expanded="false"
            aria-controls="mobileConsortiaDropdown"
          >
            ${item.label}
          </button>
        </li>
      `;
    })
    .join("");

  const dropdownItems = (linkClass) =>
    siteData.consortia
      .map(
        (item) => `
          <li>
            <a href="${item.href}" class="${linkClass}">
              <span class="dropdown-item-row">
                <img src="${item.logo}" alt="" class="dropdown-item-logo">
                <span class="dropdown-item-copy">
                  <span class="dropdown-item-name">${item.shortName}</span>
                  <small>${item.role}</small>
                </span>
              </span>
            </a>
          </li>
        `
      )
      .join("");

  desktopDropdown.innerHTML = `<ul>${dropdownItems("dropdown-link")}</ul>`;
  mobileDropdown.innerHTML = `<ul>${dropdownItems("mobile-dropdown-link")}</ul>`;
};

const renderHeaderCtas = () => {
  document.querySelectorAll(".header-cta, .mobile-cta").forEach((node) => {
    node.textContent = siteData.headerCta.label;
    node.setAttribute("href", siteData.headerCta.href);
  });
};

const setFavicon = () => {
  const faviconHref = `${document.body.dataset.page === "consortium-detail" ? "../" : ""}assets/other/canada-president_favicon.png`;
  let icon = document.querySelector("link[rel='icon']");

  if (!icon) {
    icon = document.createElement("link");
    icon.setAttribute("rel", "icon");
    document.head.appendChild(icon);
  }

  icon.setAttribute("type", "image/png");
  icon.setAttribute("href", faviconHref);
};

const renderFooter = () => {
  const footerLinks = byId("footerLinks");
  const footerYear = byId("footerYear");

  if (footerLinks) {
    footerLinks.innerHTML = siteData.footerLinks
      .map((item) => `<a href="${item.href}" target="_blank" rel="noreferrer">${item.label}</a>`)
      .join("");
  }

  if (footerYear) {
    footerYear.textContent = String(new Date().getFullYear());
  }
};

const closeDropdowns = () => {
  document
    .querySelectorAll("[aria-controls='consortiaDropdown'], [aria-controls='mobileConsortiaDropdown']")
    .forEach((button) => {
      button.setAttribute("aria-expanded", "false");
      button.classList.remove("is-open");
    });

  byId("consortiaDropdown")?.classList.remove("is-open");
  byId("mobileConsortiaDropdown")?.classList.remove("is-open");
};

const bindNavigation = () => {
  const navToggle = byId("navToggle");
  const mobilePanel = byId("mobilePanel");
  const desktopDropdownButton = document.querySelector(".nav-dropdown-toggle");
  const mobileDropdownButton = document.querySelector(".mobile-nav-toggle");

  if (!navToggle || !mobilePanel || !desktopDropdownButton || !mobileDropdownButton) {
    return;
  }

  const positionDesktopDropdown = () => {
    const dropdown = byId("consortiaDropdown");

    if (!dropdown) {
      return;
    }

    const buttonRect = desktopDropdownButton.getBoundingClientRect();
    const navRect = desktopDropdownButton.closest(".desktop-nav")?.getBoundingClientRect();

    if (!navRect) {
      return;
    }

    const wasOpen = dropdown.classList.contains("is-open");

    if (!wasOpen) {
      dropdown.style.display = "block";
      dropdown.style.visibility = "hidden";
    }

    const panelWidth = dropdown.getBoundingClientRect().width;
    const centeredLeft = buttonRect.left - navRect.left + buttonRect.width / 2 - panelWidth / 2;
    const maxLeft = Math.max(0, navRect.width - panelWidth);
    const left = Math.min(Math.max(0, centeredLeft), maxLeft);

    if (!wasOpen) {
      dropdown.style.removeProperty("display");
      dropdown.style.removeProperty("visibility");
    }

    dropdown.style.setProperty("--dropdown-left", `${left}px`);
  };

  navToggle.addEventListener("click", () => {
    const next = navToggle.getAttribute("aria-expanded") !== "true";
    navToggle.setAttribute("aria-expanded", String(next));
    mobilePanel.classList.toggle("is-open", next);
    document.body.classList.toggle("menu-open", next);

    if (!next) {
      closeDropdowns();
    }
  });

  desktopDropdownButton.addEventListener("click", () => {
    const dropdown = byId("consortiaDropdown");
    const next = desktopDropdownButton.getAttribute("aria-expanded") !== "true";
    closeDropdowns();
    positionDesktopDropdown();
    desktopDropdownButton.setAttribute("aria-expanded", String(next));
    desktopDropdownButton.classList.toggle("is-open", next);
    dropdown?.classList.toggle("is-open", next);
  });

  mobileDropdownButton.addEventListener("click", () => {
    const dropdown = byId("mobileConsortiaDropdown");
    const next = mobileDropdownButton.getAttribute("aria-expanded") !== "true";
    mobileDropdownButton.setAttribute("aria-expanded", String(next));
    mobileDropdownButton.classList.toggle("is-open", next);
    dropdown?.classList.toggle("is-open", next);
  });

  document.addEventListener("click", (event) => {
    if (
      !event.target.closest(".nav-dropdown") &&
      !event.target.closest(".dropdown-panel") &&
      !event.target.closest(".mobile-nav-dropdown") &&
      !event.target.closest(".mobile-dropdown-panel")
    ) {
      closeDropdowns();
    }

    if (event.target.matches(".mobile-nav-link") && !event.target.classList.contains("mobile-nav-toggle")) {
      navToggle.setAttribute("aria-expanded", "false");
      mobilePanel.classList.remove("is-open");
      document.body.classList.remove("menu-open");
      closeDropdowns();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    navToggle.setAttribute("aria-expanded", "false");
    mobilePanel.classList.remove("is-open");
    document.body.classList.remove("menu-open");
    closeDropdowns();
    closeMarginNote();
  });

  window.addEventListener("resize", () => {
    if (desktopDropdownButton.getAttribute("aria-expanded") === "true") {
      positionDesktopDropdown();
    }
  });
};

const bindReveal = () => {
  const nodes = document.querySelectorAll(".reveal");

  if (!nodes.length) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.16 }
  );

  nodes.forEach((node) => observer.observe(node));
};

const renderHome = () => {
  const stats = byId("homeStats");
  const previews = byId("homePreviewGrid");
  const stories = byId("homeStoryGrid");
  const ribbon = byId("homeConsortiaRibbon");

  if (stats) {
    stats.innerHTML = siteData.home.stats
      .map(
        (item) => `
          <article class="proof-card reveal">
            <p class="proof-value">${item.value}</p>
            <h3>${item.label}</h3>
            <p>${item.detail}</p>
          </article>
        `
      )
      .join("");

    attachNotesByIndex(
      stats.querySelectorAll(".proof-card"),
      siteData.home.stats.map((item) =>
        noteFrom({
          eyebrow: "Snapshot",
          title: item.label,
          body: item.detail,
          tags: ["Homepage"],
        })
      )
    );
  }

  if (previews) {
    previews.innerHTML = siteData.home.previews
      .map(
        (item) => `
          <article class="preview-card reveal">
            <p class="eyebrow">${item.eyebrow}</p>
            <h3>${item.title}</h3>
            <p>${item.text}</p>
            <a href="${item.href}" class="text-link">${item.label}</a>
          </article>
        `
      )
      .join("");

    attachNotesByIndex(
      previews.querySelectorAll(".preview-card"),
      siteData.home.previews.map((item) =>
        noteFrom({
          eyebrow: item.eyebrow,
          title: item.title,
          body: item.text,
          tags: [item.label.replace("Open ", ""), "Overview"],
        })
      )
    );
  }

  if (stories) {
    stories.innerHTML = siteData.home.stories
      .map(
        (item) => `
          <article class="story-card reveal">
            <div class="story-media">
              <img src="${item.image}" alt="${item.alt}">
            </div>
            <div class="story-copy">
              <p class="eyebrow">${item.eyebrow}</p>
              <h3>${item.title}</h3>
              <p>${item.text}</p>
            </div>
          </article>
        `
      )
      .join("");

    attachNotesByIndex(
      stories.querySelectorAll(".story-card"),
      siteData.home.stories.map((item) =>
        noteFrom({
          eyebrow: item.eyebrow,
          title: item.title,
          body: item.text,
          tags: ["Scene"],
        })
      )
    );
  }

  if (ribbon) {
    ribbon.innerHTML = siteData.consortia.map((item) => `<a href="${item.href}">${item.shortName}</a>`).join("");
  }
};

const renderResearch = () => {
  const pillars = byId("researchPillars");
  const projects = byId("activeProjects");

  if (pillars) {
    pillars.innerHTML = siteData.research.pillars
      .map(
        (item) => `
          <article class="research-card research-card-${item.accent} reveal">
            <p class="eyebrow">${item.eyebrow}</p>
            <h3>${item.title}</h3>
            <p>${item.text}</p>
            <ul class="bullet-list">
              ${item.bullets.map((bullet) => `<li>${bullet}</li>`).join("")}
            </ul>
          </article>
        `
      )
      .join("");

    attachNotesByIndex(
      pillars.querySelectorAll(".research-card"),
      siteData.research.pillars.map((item) =>
        noteFrom({
          eyebrow: item.eyebrow,
          title: item.title,
          body: item.text,
          tags: item.bullets.slice(0, 2),
        })
      )
    );
  }

  if (projects) {
    projects.innerHTML = siteData.research.activeProjects
      .map(
        (item) => `
          <article class="list-card reveal">
            <div class="list-card-top">
              <h3>${item.title}</h3>
              <span class="status-pill">${item.status}</span>
            </div>
            <p>${item.text}</p>
            <a href="${item.href}" ${item.href.startsWith("http") ? 'target="_blank" rel="noreferrer"' : ""} class="text-link">
              Learn more
            </a>
          </article>
        `
      )
      .join("");

    attachNotesByIndex(
      projects.querySelectorAll(".list-card"),
      siteData.research.activeProjects.map((item) =>
        noteFrom({
          eyebrow: item.status,
          title: item.title,
          body: item.text,
          tags: ["Project"],
        })
      )
    );
  }
};

const loadScholarFeed = async () => {
  try {
    const response = await fetch(SCHOLAR_FEED_PATH, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("scholar feed unavailable");
    }

    return await response.json();
  } catch {
    return null;
  }
};

const renderPublications = async () => {
  const featureGrid = byId("publicationFeatureGrid");
  const readingList = byId("publicationThemes");
  const scholarGrid = byId("publicationScholarGrid");
  const scholarMeta = byId("publicationScholarMeta");

  if (scholarGrid) {
    const feed = await loadScholarFeed();
    const items = (feed?.items || siteData.publications.featured).slice(0, 6);

    scholarGrid.innerHTML = items
      .map(
        (item) => `
          <article class="publication-card reveal">
            <div class="publication-year">${item.year}${item.citationCount ? ` · ${item.citationCount} cites` : ""}</div>
            <h3>${item.title}</h3>
            <p>${item.venue || item.detail}</p>
            <a href="${item.href}"${linkAttrs(item.href)}>Open in Scholar</a>
          </article>
        `
      )
      .join("");

    if (scholarMeta) {
      scholarMeta.textContent = feed?.fetchedAt
        ? `Refreshed from Google Scholar on ${new Date(feed.fetchedAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}.`
        : "Showing curated publication markers while the Scholar feed is unavailable.";
    }

    attachNotesByIndex(
      scholarGrid.querySelectorAll(".publication-card"),
      items.map((item) =>
        noteFrom({
          eyebrow: item.year,
          title: item.title,
          body: item.venue || item.detail || "Recent publication from the Montgomery Lab Scholar feed.",
          tags: [item.citationCount ? `${item.citationCount} cites` : "Scholar", "Recent"],
        })
      )
    );
  }

  if (featureGrid) {
    featureGrid.innerHTML = siteData.publications.featured
      .map(
        (item) => `
          <article class="publication-card reveal">
            <div class="publication-year">${item.year}</div>
            <h3>${item.title}</h3>
            <p>${item.detail}</p>
            <a href="${item.href}" target="_blank" rel="noreferrer">Read source</a>
          </article>
        `
      )
      .join("");

    attachNotesByIndex(
      featureGrid.querySelectorAll(".publication-card"),
      siteData.publications.featured.map((item) =>
        noteFrom({
          eyebrow: item.year,
          title: item.title,
          body: item.detail,
          tags: ["Publication"],
        })
      )
    );
  }

  if (readingList) {
    readingList.innerHTML = siteData.publications.readingList
      .map((item) => `<li>${item}</li>`)
      .join("");

    attachNoteTrigger(
      readingList.closest(".info-panel"),
      noteFrom({
        eyebrow: "Reading Themes",
        title: "How to approach the literature",
        body: "These themes are meant to help a new visitor understand the lab's scientific arc without reading an exhaustive bibliography on day one.",
        tags: siteData.publications.readingList.slice(0, 3),
      })
    );
  }
};

const renderResources = () => {
  const categories = byId("resourceCategoryGrid");
  const guides = byId("resourceGuideGrid");
  const inventory = byId("resourceDataGrid");

  const renderResourceEntry = (entry) => {
    if (typeof entry === "string") {
      return `<li>${entry}</li>`;
    }

    return `<li><a href="${entry.href}" class="text-link"${linkAttrs(entry.href)}>${entry.label}</a></li>`;
  };

  if (categories) {
    categories.innerHTML = siteData.resources.categories
      .map(
        (item) => `
          <article class="resource-panel reveal">
            <p class="eyebrow">${item.title}</p>
            <p>${item.text}</p>
            <ul class="bullet-list">
              ${item.items.map(renderResourceEntry).join("")}
            </ul>
          </article>
        `
      )
      .join("");

    attachNotesByIndex(
      categories.querySelectorAll(".resource-panel"),
      siteData.resources.categories.map((item) =>
        noteFrom({
          eyebrow: item.title,
          title: item.title,
          body: item.text,
          tags: item.items.map(entryLabel).slice(0, 2),
        })
      )
    );
  }

  if (guides) {
    guides.innerHTML = siteData.resources.featuredGuides
      .map(
        (item) => `
          <article class="resource-card reveal">
            <p class="eyebrow">Featured guide</p>
            <h3>${item.title}</h3>
            <p>${item.text}</p>
            <a href="${item.href}" class="text-link" target="_blank" rel="noreferrer">${item.label}</a>
          </article>
        `
      )
      .join("");

    attachNotesByIndex(
      guides.querySelectorAll(".resource-card"),
      siteData.resources.featuredGuides.map((item) =>
        noteFrom({
          eyebrow: "Guide",
          title: item.title,
          body: item.text,
          tags: ["Resources", "Workflow"],
        })
      )
    );
  }

  if (inventory) {
    inventory.innerHTML = siteData.resources.dataInventory
      .map(
        (item) => `
          <article class="list-card reveal">
            <div class="list-card-top">
              <h3>${item.title}</h3>
            </div>
            <p>${item.text}</p>
            ${item.href ? `<a href="${item.href}" class="text-link"${linkAttrs(item.href)}>${item.label}</a>` : ""}
          </article>
        `
      )
      .join("");

    attachNotesByIndex(
      inventory.querySelectorAll(".list-card"),
      siteData.resources.dataInventory.map((item) =>
        noteFrom({
          eyebrow: "Data access",
          title: item.title,
          body: item.text,
          tags: ["Data"],
        })
      )
    );
  }
};

const renderJoin = () => {
  const checklist = byId("joinChecklistGrid");
  const values = byId("valuesGrid");
  const audiences = byId("joinAudienceGrid");
  const faq = byId("joinFaq");

  if (checklist) {
    checklist.innerHTML = siteData.join.checklist
      .map(
        (item) => `
          <article class="list-card reveal">
            <div class="list-card-top">
              <h3>${item.title}</h3>
            </div>
            <p>${item.text}</p>
          </article>
        `
      )
      .join("");

    attachNotesByIndex(
      checklist.querySelectorAll(".list-card"),
      siteData.join.checklist.map((item) =>
        noteFrom({
          eyebrow: "First month",
          title: item.title,
          body: item.text,
          tags: ["Join", "Onboarding"],
        })
      )
    );
  }

  if (values) {
    values.innerHTML = siteData.join.values
      .map(
        (item) => `
          <article class="preview-card reveal">
            <h3>${item.title}</h3>
            <p>${item.text}</p>
          </article>
        `
      )
      .join("");

    attachNotesByIndex(
      values.querySelectorAll(".preview-card"),
      siteData.join.values.map((item) =>
        noteFrom({
          eyebrow: "Lab Value",
          title: item.title,
          body: item.text,
          tags: ["Culture"],
        })
      )
    );
  }

  if (audiences) {
    audiences.innerHTML = siteData.join.audiences
      .map(
        (item) => `
          <article class="audience-card reveal">
            <h3>${item.title}</h3>
            <p>${item.text}</p>
          </article>
        `
      )
      .join("");

    attachNotesByIndex(
      audiences.querySelectorAll(".audience-card"),
      siteData.join.audiences.map((item) =>
        noteFrom({
          eyebrow: "Audience",
          title: item.title,
          body: item.text,
          tags: ["Join"],
        })
      )
    );
  }

  if (faq) {
    faq.innerHTML = siteData.join.faq
      .map(
        (item) => `
          <details class="faq-item reveal">
            <summary>${item.question}</summary>
            <p>${item.answer}</p>
          </details>
        `
      )
      .join("");

    attachNotesByIndex(
      faq.querySelectorAll(".faq-item"),
      siteData.join.faq.map((item) =>
        noteFrom({
          eyebrow: "FAQ",
          title: item.question,
          body: item.answer,
          tags: ["Onboarding"],
        })
      ),
      { wholeCard: false }
    );
  }
};

const renderConsortia = () => {
  const grid = byId("consortiaGrid");

  if (!grid) {
    return;
  }

  grid.innerHTML = siteData.consortia
    .map(
      (item) => `
        <article class="consortium-card reveal" id="${item.id}">
          <div class="consortium-logo-wrap">
            <img src="${item.logo}" alt="${item.shortName} logo" loading="lazy">
          </div>
          <div class="consortium-copy">
            <p class="eyebrow">${item.role}</p>
            <h3>${item.shortName}</h3>
            <p>${item.name}</p>
            <span>${item.focus}</span>
            <a href="${item.href}" class="text-link">View consortium</a>
          </div>
        </article>
      `
    )
    .join("");

  attachNotesByIndex(
    grid.querySelectorAll(".consortium-card"),
    siteData.consortia.map((item) =>
      noteFrom({
        eyebrow: item.role,
        title: item.shortName,
        body: item.summary || item.focus,
        tags: item.highlights?.slice(0, 2) || ["Consortium"],
      })
    )
  );

  if (window.location.hash) {
    const target = document.querySelector(window.location.hash);
    target?.classList.add("is-target");
  }
};

const renderConsortiumDetail = () => {
  const consortiumId = document.body.dataset.consortium;
  const item = siteData.consortia.find((entry) => entry.id === consortiumId);

  if (!item) {
    return;
  }

  document.title = `${item.shortName} | Montgomery Lab`;
  document.querySelector("meta[name='description']")?.setAttribute("content", item.summary);

  byId("consortiumKicker").textContent = item.role;
  byId("consortiumTitle").textContent = item.name;
  byId("consortiumSummary").textContent = item.summary;
  byId("consortiumLogo").src = item.logo;
  byId("consortiumLogo").alt = `${item.shortName} logo`;
  byId("consortiumShortName").textContent = item.shortName;
  byId("consortiumRoleDetail").textContent = item.roleDetail;
  byId("consortiumFocus").textContent = item.overview;
  byId("consortiumLabContribution").textContent = item.labContribution;

  const highlights = byId("consortiumHighlights");
  if (highlights) {
    const detailHighlights = [item.focus, item.overview, item.labContribution, ...(item.highlights || [])]
      .filter((entry, index, values) => entry && values.indexOf(entry) === index)
      .slice(0, 5);

    highlights.innerHTML = detailHighlights.map((entry) => `<li>${entry}</li>`).join("");
  }

  attachNoteTrigger(
    byId("consortiumRoleDetail").closest(".page-hero-card"),
    noteFrom({
      eyebrow: item.shortName,
      title: item.shortName,
      body: item.roleDetail,
      tags: [item.role],
    })
  );

  attachNoteTrigger(
    byId("consortiumFocus").closest(".info-panel"),
    noteFrom({
      eyebrow: "Overview",
      title: `${item.shortName} overview`,
      body: item.overview,
      tags: item.highlights.slice(0, 2),
    })
  );

  attachNoteTrigger(
    byId("consortiumLabContribution").closest(".info-panel"),
    noteFrom({
      eyebrow: "Lab Contribution",
      title: `How the lab contributes to ${item.shortName}`,
      body: item.labContribution,
      tags: [item.shortName, "Collaboration"],
    })
  );
};

const renderNews = () => {
  const grid = byId("newsStoryGrid");

  if (!grid) {
    return;
  }

  grid.innerHTML = siteData.news.stories
    .map(
        (item) => `
        <article class="story-card reveal">
          <div class="story-media">
            <img src="${item.image}" alt="${item.alt}">
          </div>
          <div class="story-copy">
            <p class="eyebrow">${item.eyebrow}</p>
            <h3>${item.title}</h3>
            <p>${item.text}</p>
          </div>
        </article>
      `
    )
    .join("");

  attachNotesByIndex(
    grid.querySelectorAll(".story-card"),
    siteData.news.stories.map((item) =>
      noteFrom({
        eyebrow: item.eyebrow,
        title: item.title,
        body: item.text,
        tags: ["Story"],
      })
    )
  );
};

const renderTeam = () => {
  const leadership = byId("leadershipCard");
  const current = byId("currentMemberGrid");
  const alumni = byId("alumniGrid");
  const note = byId("teamNote");

  if (leadership) {
    leadership.innerHTML = `
      <article class="leadership-card reveal">
        ${renderAvatar(siteData.team.leadership, { large: true })}
        <div class="leadership-copy">
          <p class="eyebrow">${siteData.team.leadership.role}</p>
          <h2>${siteData.team.leadership.name}</h2>
          <p>${siteData.team.leadership.bio}</p>
          <div class="member-links">
            ${siteData.team.leadership.links
              .map((link) => `<a href="${link.href}" target="_blank" rel="noreferrer">${link.label}</a>`)
              .join("")}
          </div>
        </div>
      </article>
    `;

    attachNoteTrigger(
      leadership.querySelector(".leadership-card"),
      noteFrom({
        eyebrow: siteData.team.leadership.role,
        title: siteData.team.leadership.name,
        body: siteData.team.leadership.bio,
        tags: ["Leadership"],
      })
    );
  }

  if (current) {
    current.innerHTML = siteData.team.currentMembers.map(memberCard).join("");
  }

  if (alumni) {
    alumni.innerHTML = siteData.team.alumni
      .map(
        (item) => `
          <article class="member-card reveal">
            <div class="member-card-body">
              ${renderAvatar(item)}
              <div class="member-meta">
                <p class="eyebrow">${item.role}</p>
                <h3>${item.name}</h3>
                <p>${item.bio}</p>
                <div class="member-chip-row">
                  ${item.bayArea ? `<span class="member-chip">${item.bayArea === "yes" ? "Bay Area" : "Outside Bay Area"}</span>` : ""}
                </div>
                ${item.email ? `<a href="mailto:${item.email}" class="text-link">${item.email}</a>` : ""}
              </div>
            </div>
          </article>
        `
      )
      .join("");

    attachNotesByIndex(
      alumni.querySelectorAll(".member-card"),
      siteData.team.alumni.map((item) =>
        noteFrom({
          eyebrow: item.role,
          title: item.name,
          body: item.bio,
          tags: item.bayArea ? [item.bayArea === "yes" ? "Bay Area" : "Outside Bay Area"] : ["Alumni"],
        })
      )
    );
  }

  if (note) {
    note.textContent = siteData.team.note;
    attachNoteTrigger(
      note,
      noteFrom({
        eyebrow: "Lab Community",
        title: "The wider lab community",
        body: siteData.team.note,
        tags: ["People"],
      })
    );
  }
};

const memberCard = (item) => `
  <details class="member-card reveal">
    <summary>
      ${renderAvatar(item)}
      <div class="member-meta">
        <p class="eyebrow">${item.role}</p>
        <h3>${item.name}</h3>
        <p>${item.bio}</p>
      </div>
    </summary>
    <div class="member-detail">
      <p>${item.detail || item.bio}</p>
    </div>
  </details>
`;

const makeAvatar = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

const renderContact = () => {
  const email = byId("contactEmail");
  const phone = byId("contactPhone");
  const location = byId("contactLocation");
  const mailingAddress = byId("contactMailingAddress");
  const officialLinks = byId("contactOfficialLinks");

  if (email) {
    email.textContent = siteData.contact.email;
    email.href = `mailto:${siteData.contact.email}`;
  }

  if (phone) {
    phone.textContent = siteData.contact.phone;
    phone.href = `tel:${siteData.contact.phoneLink}`;
  }

  if (location) {
    location.textContent = siteData.contact.location;
  }

  if (mailingAddress) {
    mailingAddress.textContent = siteData.contact.mailingAddress;
  }

  if (officialLinks) {
    officialLinks.innerHTML = siteData.contact.officialLinks
      .map((item) => `<a href="${item.href}" target="_blank" rel="noreferrer">${item.label}</a>`)
      .join("");
  }

  attachNotesByIndex(
    document.querySelectorAll(".info-grid .info-panel"),
    [
      noteFrom({
        eyebrow: "Primary Contact",
        title: "How to reach the lab",
        body: "Use the primary contact details for collaboration, scientific questions, and general lab communication.",
        tags: ["Email", "Phone"],
      }),
      noteFrom({
        eyebrow: "Mailing",
        title: "Physical correspondence",
        body: "This address format is suitable for mailed materials and formal correspondence directed to the lab.",
        tags: ["Address"],
      }),
    ]
  );

  attachNoteTrigger(
    officialLinks,
    noteFrom({
      eyebrow: "Official Links",
      title: "External references",
      body: "These links connect the site to the primary Stanford and lab-maintained public references.",
      tags: ["Stanford", "Scholar"],
    })
  );
};

const renderPage = () => {
  switch (page) {
    case "home":
      renderHome();
      break;
    case "research":
      renderResearch();
      break;
    case "publications":
      renderPublications();
      break;
    case "resources":
      renderResources();
      break;
    case "join":
      renderJoin();
      break;
    case "consortia":
      renderConsortia();
      break;
    case "consortium-detail":
      renderConsortiumDetail();
      break;
    case "news":
      renderNews();
      break;
    case "team":
      renderTeam();
      break;
    case "contact":
      renderContact();
      break;
    default:
      break;
  }
};

setFavicon();
renderNav();
renderHeaderCtas();
renderFooter();
renderPage();
renderFieldNoteRail();
initMarginParallax();
bindNavigation();
bindReveal();
initPhotoCarousels(".hero-frame > img, .page-hero-card > img, .hero-side-card > img, .story-media > img");
