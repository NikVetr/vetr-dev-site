import { metalContent } from "./content.js";
import { initPhotoCarousels } from "./photo-carousel.js";

const pageId = document.body.dataset.page || "home";
const pageKey = pageId === "consortium-detail" ? "consortia" : pageId;
const main = document.getElementById("mainStage");
const consortiumId = document.body.dataset.consortium || "";
const consortium = metalContent.consortia.find((item) => item.id === consortiumId);
const page = metalContent.pages[pageKey] || metalContent.pages.home;

const linkAttrs = (href) => (href.startsWith("http") ? ' target="_blank" rel="noreferrer"' : "");

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

const currentNav = () => metalContent.nav.find((item) => item.id === pageKey) || metalContent.nav[0];

const waveformBars = (songIndex = 0) =>
  Array.from({ length: 58 }, (_, barIndex) => {
    const wave =
      Math.sin((barIndex + 1) * (songIndex + 2) * 0.32) * 0.46 +
      Math.sin((barIndex + 4) * (songIndex + 3) * 0.13) * 0.32 +
      Math.sin((barIndex + 7) * 0.77) * 0.22;
    const level = Math.round(22 + Math.abs(wave) * 72);
    return `<span style="--level:${Math.min(96, Math.max(18, level))}%"></span>`;
  }).join("");

const adjacentNav = (offset) => {
  const index = metalContent.nav.findIndex((item) => item.id === pageKey);
  const next = (index + offset + metalContent.nav.length) % metalContent.nav.length;
  return metalContent.nav[next];
};

const renderPageTitle = () =>
  pageId === "home"
    ? `
      <h1 class="metal-title-stack" aria-label="Bioinformatics turned up to eleven">
        <span class="metal-title-line metal-title-line-1">Bioinformatics</span>
        <span class="metal-title-line metal-title-line-2">Turned up to</span>
        <span class="metal-title-line metal-title-line-3">Eleven</span>
      </h1>
    `
    : `<h1>${page.title}</h1>`;

const renderSetlist = () => {
  const mount = document.getElementById("setlistNav");

  if (!mount) {
    return;
  }

  mount.innerHTML = `
    <a class="poster-brand" href="index.html" aria-label="Montgomery Lab home">
      <img src="assets/logos/lab_logo-metal_background_lab-not-band_monocolor.svg" alt="">
    </a>
    <div class="setlist-title">
      <p class="eyebrow">Setlist taped to the stage</p>
      <strong>${currentNav().track} / ${currentNav().label}</strong>
    </div>
    <nav class="setlist-links">
      ${metalContent.nav
        .map(
          (item) => `
            <a class="setlist-link ${item.id === pageKey ? "is-active" : ""}" href="${item.href}">
              <span>${item.track}</span>
              <strong>${item.label}</strong>
              <small>${item.subtitle}</small>
            </a>
          `
        )
        .join("")}
    </nav>
    <button class="setlist-mobile-toggle" type="button" aria-expanded="false" aria-controls="setlistMobileLinks">
      <span></span>
      <span></span>
      <span></span>
      <span class="sr-only">Toggle setlist navigation</span>
    </button>
  `;

  const links = mount.querySelector(".setlist-links");
  const toggle = mount.querySelector(".setlist-mobile-toggle");
  links?.setAttribute("id", "setlistMobileLinks");
  toggle?.addEventListener("click", () => {
    const next = !mount.classList.contains("is-open");
    mount.classList.toggle("is-open", next);
    toggle.setAttribute("aria-expanded", String(next));
  });
};

const renderStageFx = () => {
  const mount = document.getElementById("stageFx");

  if (!mount) {
    return;
  }

  const riffs = [
    "ATGCTAGGATCC",
    "GTEx",
    "rare variant",
    "MoTrPAC",
    "splice QTL",
    "ACGTACGT",
    "multi-omic",
    "EIGENMT",
    "GREGoR",
    "TOPMed",
    "Functional ADSP",
    "dGTEx",
    "IGVF",
    "SMaHT",
    "All of Us",
    "UDN",
    "ENCODE4",
    "molecular QTL",
    "variant-to-function",
    "regulatory atlas",
    "rare disease",
    "transcriptome"
  ];

  mount.innerHTML = `
    <div class="flame-wall"></div>
    <div class="chrome-seal"><img src="assets/logos/lab_logo-metal_background_lab-not-band_monocolor.svg" alt=""></div>
    ${Array.from({ length: 18 }, (_, index) => `<span class="spike spike-${index + 1}"></span>`).join("")}
    ${Array.from({ length: 22 }, (_, index) => `<span class="rune rune-${index + 1}" style="--rune-start:${112 + ((index * 23) % 130)}vh">${riffs[index % riffs.length]}</span>`).join("")}
  `;
};

const bindRuneScroll = () => {
  const runes = Array.from(document.querySelectorAll(".rune"));

  if (!runes.length) {
    return;
  }

  const states = runes.map((rune, index) => ({
    rune,
    start: 112 + ((index * 23) % 130),
    distance: 165 + ((index * 17) % 95),
    rotate: getComputedStyle(rune).getPropertyValue("--rune-rotate").trim() || "0deg",
  }));
  let frame = 0;

  const update = () => {
    frame = 0;
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = window.scrollY / scrollable;

    states.forEach(({ rune, start, distance, rotate }) => {
      rune.style.transform = `translate3d(0, ${start - progress * distance}vh, 0) rotate(${rotate})`;
    });
  };

  const requestUpdate = () => {
    if (!frame) {
      frame = requestAnimationFrame(update);
    }
  };

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  update();
};

const renderAmpRig = () => {
  const mount = document.getElementById("ampRig");
  const current = currentNav();
  const songs = metalContent.songs || [];
  const pageSongIndex = Math.max(
    0,
    songs.findIndex((song) => song.pages?.includes(pageKey))
  );
  const followPage = localStorage.getItem("ml-metal-follow-page-track") !== "false";
  const storedSongIndex = Number(localStorage.getItem("ml-metal-song-index"));
  const initialSongIndex =
    followPage || !Number.isInteger(storedSongIndex) || storedSongIndex < 0 || storedSongIndex >= songs.length
      ? pageSongIndex
      : storedSongIndex;

  if (!mount) {
    return;
  }

  mount.innerHTML = `
    <div class="amp-head" aria-label="Montgomery Lab MIDI amp controller">
      <div class="amp-readout">
        <p class="eyebrow">MIDI amp rack</p>
        <h2>${current.track} / ${current.label}</h2>
        <p id="ampReadout">${page.ampNote}</p>
      </div>
      <div class="deck-display">
        <span class="deck-led" aria-hidden="true"></span>
        <p class="eyebrow">Loaded track</p>
        <strong id="deckTrackName">${songs[initialSongIndex]?.title || "No track loaded"}</strong>
        <div id="deckWaveform" class="deck-waveform" aria-hidden="true">${waveformBars(initialSongIndex)}</div>
      </div>
      <div class="transport-row" aria-label="Music playback controls">
        <button id="deckPrev" class="transport-button" type="button" aria-label="Previous track">prev</button>
        <button id="deckPlay" class="transport-button is-primary" type="button" aria-label="Play selected track">play</button>
        <button id="deckNext" class="transport-button" type="button" aria-label="Next track">next</button>
      </div>
      <div class="bio-knob-panel" aria-label="Bioinformatics level set past ten">
        <p class="eyebrow">Bioinformatics</p>
        <div class="bio-knob" aria-hidden="true">
          <span class="bio-knob-tick bio-knob-tick-0"></span>
          <span class="bio-knob-mark bio-knob-mark-0">0</span>
          <span class="bio-knob-tick bio-knob-tick-1"></span>
          <span class="bio-knob-mark bio-knob-mark-1">1</span>
          <span class="bio-knob-tick bio-knob-tick-2"></span>
          <span class="bio-knob-mark bio-knob-mark-2">2</span>
          <span class="bio-knob-tick bio-knob-tick-3"></span>
          <span class="bio-knob-mark bio-knob-mark-3">3</span>
          <span class="bio-knob-tick bio-knob-tick-4"></span>
          <span class="bio-knob-mark bio-knob-mark-4">4</span>
          <span class="bio-knob-tick bio-knob-tick-5"></span>
          <span class="bio-knob-mark bio-knob-mark-5">5</span>
          <span class="bio-knob-tick bio-knob-tick-6"></span>
          <span class="bio-knob-mark bio-knob-mark-6">6</span>
          <span class="bio-knob-tick bio-knob-tick-7"></span>
          <span class="bio-knob-mark bio-knob-mark-7">7</span>
          <span class="bio-knob-tick bio-knob-tick-8"></span>
          <span class="bio-knob-mark bio-knob-mark-8">8</span>
          <span class="bio-knob-tick bio-knob-tick-9"></span>
          <span class="bio-knob-mark bio-knob-mark-9">9</span>
          <span class="bio-knob-tick bio-knob-tick-10"></span>
          <span class="bio-knob-mark bio-knob-mark-10">10</span>
          <span class="bio-knob-tape">11</span>
          <span class="bio-knob-dial"></span>
        </div>
      </div>
      <div class="amp-knobs" aria-label="Controller faders">
        <label><span>gain</span><input id="gainKnob" type="range" min="0" max="100" value="58"></label>
        <label><span>omics</span><input id="omicsKnob" type="range" min="0" max="100" value="72"></label>
        <label><span>volume</span><input id="deckVolume" type="range" min="0" max="100" value="78"></label>
        <label><span>drive</span><input type="range" min="0" max="100" value="64"></label>
        <label><span>delay</span><input type="range" min="0" max="100" value="35"></label>
        <label><span>reverb</span><input type="range" min="0" max="100" value="48"></label>
      </div>
      <div class="pad-grid" aria-label="Backlit MIDI pads" aria-hidden="true">
        ${Array.from({ length: 8 }, (_, index) => `<span class="midi-pad ${index === pageSongIndex ? "is-hot" : ""}"></span>`).join("")}
      </div>
      <div class="stomp-row">
        <button class="stomp is-active" type="button" data-mode="clean">clean</button>
        <button class="stomp" type="button" data-mode="overdrive">overdrive</button>
        <button class="stomp" type="button" data-mode="inferno">inferno</button>
      </div>
      <div class="track-console">
        <label class="follow-toggle"><input id="followPageTrack" type="checkbox" ${followPage ? "checked" : ""}> page track</label>
        <button id="trackDrawerToggle" class="drawer-toggle" type="button" aria-expanded="false" aria-controls="trackDrawer">tracklist</button>
        <div id="trackDrawer" class="track-drawer" hidden>
          <label>
            <span class="eyebrow">Actual lab songs</span>
            <select id="deckTrackSelect">
              ${songs.map((song, index) => `<option value="${index}" ${index === initialSongIndex ? "selected" : ""}>${song.title}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>
      <audio id="labDeckAudio" preload="metadata"></audio>
    </div>
  `;

  const applyMode = (mode) => {
    document.body.dataset.mode = mode;
    mount.querySelectorAll(".stomp").forEach((button) => button.classList.toggle("is-active", button.dataset.mode === mode));
    localStorage.setItem("ml-metal-mode", mode);
  };

  const applyRange = () => {
    const gain = Number(document.getElementById("gainKnob")?.value || 58);
    const omics = Number(document.getElementById("omicsKnob")?.value || 72);
    document.documentElement.style.setProperty("--gain", (0.35 + gain / 100).toFixed(2));
    document.documentElement.style.setProperty("--omics", (0.3 + omics / 100).toFixed(2));
  };

  const audio = document.getElementById("labDeckAudio");
  const playButton = document.getElementById("deckPlay");
  const trackName = document.getElementById("deckTrackName");
  const trackWaveform = document.getElementById("deckWaveform");
  const trackSelect = document.getElementById("deckTrackSelect");
  const volume = document.getElementById("deckVolume");
  let activeSongIndex = initialSongIndex;

  const updatePlayButton = () => {
    if (!playButton || !audio) {
      return;
    }
    playButton.textContent = audio.paused ? "play" : "pause";
    playButton.setAttribute("aria-label", audio.paused ? "Play selected track" : "Pause selected track");
  };

  const setSong = (index, shouldPlay = false) => {
    if (!audio || !songs.length) {
      return;
    }

    activeSongIndex = (index + songs.length) % songs.length;
    const song = songs[activeSongIndex];
    audio.src = song.src;
    if (trackName) {
      trackName.textContent = song.title;
    }
    if (trackWaveform) {
      trackWaveform.innerHTML = waveformBars(activeSongIndex);
    }
    if (trackSelect) {
      trackSelect.value = String(activeSongIndex);
    }
    localStorage.setItem("ml-metal-song-index", String(activeSongIndex));

    if (shouldPlay) {
      audio.play().catch(() => updatePlayButton());
    } else {
      updatePlayButton();
    }
  };

  mount.querySelectorAll(".stomp").forEach((button) => button.addEventListener("click", () => applyMode(button.dataset.mode)));
  mount.querySelectorAll("input[type='range']").forEach((input) => input.addEventListener("input", applyRange));
  playButton?.addEventListener("click", () => {
    if (!audio?.src) {
      setSong(activeSongIndex);
    }
    if (audio?.paused) {
      audio.play().catch(() => updatePlayButton());
    } else {
      audio?.pause();
    }
  });
  document.getElementById("deckPrev")?.addEventListener("click", () => setSong(activeSongIndex - 1, Boolean(audio && !audio.paused)));
  document.getElementById("deckNext")?.addEventListener("click", () => setSong(activeSongIndex + 1, Boolean(audio && !audio.paused)));
  trackSelect?.addEventListener("change", (event) => setSong(Number(event.target.value), Boolean(audio && !audio.paused)));
  volume?.addEventListener("input", () => {
    if (audio) {
      audio.volume = Number(volume.value) / 100;
    }
  });
  audio?.addEventListener("play", updatePlayButton);
  audio?.addEventListener("pause", updatePlayButton);
  audio?.addEventListener("ended", () => setSong(activeSongIndex + 1, true));
  document.getElementById("trackDrawerToggle")?.addEventListener("click", (event) => {
    const drawer = document.getElementById("trackDrawer");
    const expanded = event.currentTarget.getAttribute("aria-expanded") === "true";
    event.currentTarget.setAttribute("aria-expanded", String(!expanded));
    if (drawer) {
      drawer.hidden = expanded;
    }
  });
  document.getElementById("followPageTrack")?.addEventListener("change", (event) => {
    localStorage.setItem("ml-metal-follow-page-track", String(event.target.checked));
    if (event.target.checked) {
      setSong(pageSongIndex, Boolean(audio && !audio.paused));
    }
  });
  applyMode(localStorage.getItem("ml-metal-mode") || "clean");
  applyRange();
  if (audio && volume) {
    audio.volume = Number(volume.value) / 100;
  }
  setSong(initialSongIndex);
};

const pageHero = () => `
  <section class="page-hero reveal">
    <div class="hero-copy">
      <p class="eyebrow">${page.kicker}</p>
      ${renderPageTitle()}
      <p class="lede">${page.lede}</p>
    </div>
    <figure class="hero-card">
      <img src="${page.image}" alt="">
      <figcaption>${page.ampNote}</figcaption>
    </figure>
  </section>
`;

const cardGrid = (items, className = "card-grid") => `
  <div class="${className}">
    ${items
      .map(
        (item) => `
          <article class="metal-card">
            ${item.eyebrow || item.label || item.year || item.status ? `<p class="eyebrow">${item.eyebrow || item.label || item.year || item.status}</p>` : ""}
            <h3>${item.title}</h3>
            <p>${item.text || item.detail}</p>
            ${
              item.bullets
                ? `<ul class="bolt-list">${item.bullets.map((bullet) => `<li>${bullet}</li>`).join("")}</ul>`
                : ""
            }
            ${item.href ? `<a class="slash-link" href="${item.href}"${linkAttrs(item.href)}>Open</a>` : ""}
          </article>
        `
      )
      .join("")}
  </div>
`;

const renderHome = () => `
  <section class="home-poster reveal">
    <div class="poster-copy">
      <p class="eyebrow">${page.kicker}</p>
      ${renderPageTitle()}
      <p class="lede">${page.lede}</p>
      <div class="chip-row">${metalContent.hero.chips.map((chip) => `<span>${chip}</span>`).join("")}</div>
    </div>
    <figure class="poster-photo">
      <img src="${page.image}" alt="Montgomery Lab members in a working session">
      <figcaption>Work, conversation, active whiteboards, and rapid scientific iteration.</figcaption>
    </figure>
  </section>
  <section class="section-block reveal">
    <div class="section-heading">
      <p class="eyebrow">Tour poster</p>
      <h2>Choose a track from the setlist.</h2>
    </div>
    <div class="tour-grid">
      ${metalContent.nav
        .filter((item) => item.id !== "home")
        .map(
          (item) => `
            <a class="tour-card" href="${item.href}">
              <span>${item.track}</span>
              <strong>${item.label}</strong>
              <small>${metalContent.pages[item.id].lede}</small>
            </a>
          `
        )
        .join("")}
    </div>
  </section>
  <section class="section-block reveal">
    <div class="metric-rack">
      ${metalContent.hero.metrics.map((metric) => `<article><strong>${metric.value}</strong><span>${metric.label}</span></article>`).join("")}
    </div>
  </section>
`;

const renderResearch = () => `
  ${pageHero()}
  <section class="section-block reveal">
    <div class="section-heading"><p class="eyebrow">Amplifiers</p><h2>Research riffs.</h2><p>${metalContent.research.intro}</p></div>
    ${cardGrid(metalContent.research.cards, "card-grid two-up")}
  </section>
  <section class="section-block reveal">
    <div class="section-heading"><p class="eyebrow">Signal chain</p><h2>From variant input to translation.</h2></div>
    ${cardGrid(metalContent.research.pipeline, "chain-grid")}
  </section>
  <section class="section-block reveal">
    <div class="section-heading"><p class="eyebrow">Project track</p><h2>Representative live programs.</h2></div>
    ${cardGrid(metalContent.research.projects, "card-grid two-up")}
  </section>
`;

const publicationCards = (items) =>
  items
    .map(
      (item) => `
        <article class="record-card">
          <p class="eyebrow">${item.year || ""}${item.citationCount ? ` / ${item.citationCount} cites` : ""}</p>
          <h3>${item.title}</h3>
          <p>${item.venue || item.authors || item.detail}</p>
          <a class="slash-link" href="${item.href}"${linkAttrs(item.href)}>Open</a>
        </article>
      `
    )
    .join("");

const hydrateScholar = async () => {
  const mount = document.getElementById("scholarRecords");
  const meta = document.getElementById("scholarMeta");

  if (!mount) {
    return;
  }

  try {
    const response = await fetch(metalContent.publications.feedPath, { cache: "no-store" });
    const feed = await response.json();
    const items = (feed.items || []).slice(0, 6);

    if (!items.length) {
      throw new Error("empty feed");
    }

    mount.innerHTML = publicationCards(items);
    if (meta) {
      meta.textContent = feed.fetchedAt ? `Recent Scholar feed refreshed ${new Date(feed.fetchedAt).toLocaleDateString()}.` : "Recent Scholar feed loaded.";
    }
  } catch {
    mount.innerHTML = publicationCards(metalContent.publications.featured);
    if (meta) {
      meta.textContent = "Showing curated milestones while the Scholar feed is unavailable.";
    }
  }
};

const renderPublications = () => `
  ${pageHero()}
  <section class="section-block reveal">
    <div class="section-heading"><p class="eyebrow">Live releases</p><h2>Recent from Scholar.</h2><p id="scholarMeta"></p></div>
    <div id="scholarRecords" class="record-grid">${publicationCards(metalContent.publications.featured)}</div>
  </section>
  <section class="section-block reveal">
    <div class="section-heading"><p class="eyebrow">Milestone vinyl</p><h2>Selected reference points.</h2></div>
    <div class="record-grid">${publicationCards(metalContent.publications.featured)}</div>
  </section>
  <section class="section-block reveal">
    <div class="section-heading"><p class="eyebrow">Genres</p><h2>Recurring publication themes.</h2></div>
    ${cardGrid(metalContent.publications.streams)}
  </section>
`;

const memberVisual = (member) =>
  member.headshot
    ? `<img src="${member.headshot}" alt="${member.name}">`
    : `<div class="initial-avatar">${initials(member.name)}</div>`;

const inspectorMarkup = (member) => `
  <div class="inspector-visual">${memberVisual(member)}</div>
  <p class="eyebrow">${member.role}</p>
  <h3>${member.name}</h3>
  <p>${member.focus}</p>
  <a class="slash-link" href="${member.email ? `mailto:${member.email}` : "contact.html"}">${member.email ? "Email" : "Contact route"}</a>
`;

const bindTeam = () => {
  const inspector = document.getElementById("memberInspector");
  const crew = metalContent.team.roster.filter((member) => member.name !== metalContent.team.leadership.name);

  document.querySelectorAll("[data-member-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const member = crew[Number(button.dataset.memberIndex)];
      if (!member || !inspector) {
        return;
      }
      document.querySelectorAll("[data-member-index]").forEach((item) => item.classList.toggle("is-active", item === button));
      inspector.innerHTML = inspectorMarkup(member);
    });
  });
};

const renderTeam = () => {
  const { leadership, roster, alumni, note } = metalContent.team;
  const crew = roster.filter((member) => member.name !== leadership.name);
  const first = crew[0];

  return `
    ${pageHero()}
    <section class="section-block reveal">
      <article class="lead-feature">
        <div class="lead-image"><img src="${leadership.headshot}" alt="${leadership.name}"></div>
        <div>
          <p class="eyebrow">${leadership.role}</p>
          <h2>${leadership.name}</h2>
          <p>${leadership.summary}</p>
          <div class="link-row">${leadership.links.map((link) => `<a href="${link.href}"${linkAttrs(link.href)}>${link.label}</a>`).join("")}</div>
        </div>
      </article>
    </section>
    <section class="section-block reveal">
      <div class="section-heading"><p class="eyebrow">Crew wall</p><h2>Current lab members.</h2><p>${note}</p></div>
      <div class="crew-layout">
        <div class="crew-grid">
          ${crew
            .map(
              (member, index) => `
                <button class="crew-chip ${index === 0 ? "is-active" : ""}" type="button" data-member-index="${index}">
                  <span>${initials(member.name)}</span><strong>${member.name}</strong><small>${member.role}</small>
                </button>
              `
            )
            .join("")}
        </div>
        <article id="memberInspector" class="member-inspector">${inspectorMarkup(first)}</article>
      </div>
    </section>
    <section class="section-block reveal">
      <div class="section-heading"><p class="eyebrow">Back catalog</p><h2>Alumni network.</h2></div>
      <div class="alumni-wall">${alumni.map((name) => `<span>${name}</span>`).join("")}</div>
    </section>
  `;
};

const renderConsortia = () => `
  ${pageHero()}
  <section class="section-block reveal">
    <div class="section-heading"><p class="eyebrow">Tour routing</p><h2>Partner programs.</h2></div>
    <div class="partner-grid">
      ${metalContent.consortia
        .map(
          (item) => `
            <article class="partner-card">
              <div class="partner-logo"><img src="${item.logo}" alt="${item.shortName}"></div>
              <div><p class="eyebrow">${item.role}</p><h3>${item.shortName}</h3><p>${item.summary}</p><strong>${item.output}</strong><div class="link-row"><a href="${item.href}">Open tour stop</a></div></div>
            </article>
          `
        )
        .join("")}
    </div>
  </section>
`;

const renderConsortiumDetail = () => {
  if (!consortium) {
    return `
      <section class="section-block reveal">
        <div class="section-heading"><p class="eyebrow">Tour routing</p><h2>Consortium not found.</h2><p>The requested tour stop is not available in the current Stage Rig build.</p></div>
      </section>
    `;
  }

  return `
    <section class="page-hero reveal">
      <div class="hero-copy">
        <p class="eyebrow">${consortium.role}</p>
        <h1>${consortium.name}</h1>
        <p class="lede">${consortium.summary}</p>
        <div class="link-row">
          <a href="consortia.html">All tour stops</a>
          <a href="research.html">Research riffs</a>
        </div>
      </div>
      <article class="hero-card consortium-hero-card">
        <div class="partner-logo consortium-hero-logo"><img src="${consortium.logo}" alt="${consortium.shortName}"></div>
        <div class="consortium-hero-copy">
          <p class="eyebrow">${consortium.shortName}</p>
          <strong>${consortium.focus}</strong>
          <p>${consortium.roleDetail}</p>
        </div>
      </article>
    </section>
    <section class="section-block reveal">
      <div class="chain-grid consortium-detail-grid">
        <article class="metal-card">
          <p class="eyebrow">Overview</p>
          <h3>What this program is built to answer.</h3>
          <p>${consortium.overview}</p>
        </article>
        <article class="metal-card">
          <p class="eyebrow">Lab contribution</p>
          <h3>How the lab plays inside it.</h3>
          <p>${consortium.labContribution}</p>
        </article>
      </div>
    </section>
    <section class="section-block reveal">
      <div class="section-heading"><p class="eyebrow">Tour notes</p><h2>Key threads in this stop.</h2></div>
      ${cardGrid(consortium.highlights.map((highlight) => ({ title: highlight, text: consortium.shortName })), "card-grid consortium-highlight-grid")}
    </section>
    <section class="section-block reveal">
      <div class="section-heading"><p class="eyebrow">Switchboard</p><h2>Jump to another consortium stop.</h2></div>
      <div class="partner-grid">
        ${metalContent.consortia
          .map(
            (item) => `
              <a class="partner-card consortium-jump-card ${item.id === consortium.id ? "is-active" : ""}" href="${item.href}">
                <div class="partner-logo"><img src="${item.logo}" alt="${item.shortName}"></div>
                <div><p class="eyebrow">${item.role}</p><h3>${item.shortName}</h3><p>${item.focus}</p><strong>${item.output}</strong></div>
              </a>
            `
          )
          .join("")}
      </div>
    </section>
  `;
};

const renderResources = () => `
  ${pageHero()}
  <section class="section-block reveal">
    <div class="section-heading"><p class="eyebrow">Gear list</p><h2>Public tools and infrastructure.</h2><p>${metalContent.resources.intro}</p></div>
    <div class="gear-grid">
      ${metalContent.resources.categories
        .map(
          (category) => `
            <article class="metal-card">
              <p class="eyebrow">${category.title}</p>
              <p>${category.text}</p>
              <ul class="link-list">${category.items.map((item) => `<li><a href="${item.href}"${linkAttrs(item.href)}>${item.label}</a></li>`).join("")}</ul>
            </article>
          `
        )
        .join("")}
    </div>
  </section>
  <section class="section-block reveal">
    <div class="section-heading"><p class="eyebrow">Road cases</p><h2>Operational guides.</h2></div>
    ${cardGrid(metalContent.resources.guides)}
  </section>
`;

const renderJoin = () => `
  ${pageHero()}
  <section class="section-block reveal">
    <div class="section-heading"><p class="eyebrow">Audition instructions</p><h2>Who should reach out and what to send.</h2><p>${metalContent.join.intro}</p></div>
    ${cardGrid(metalContent.join.audiences)}
  </section>
  <section class="section-block reveal">
    <div class="section-heading"><p class="eyebrow">House rules</p><h2>Operating values.</h2></div>
    <div class="value-row">${metalContent.join.values.map((value) => `<span>${value}</span>`).join("")}</div>
    <div class="link-row big-links"><a href="mailto:${metalContent.contact.email}">Email Stephen Montgomery</a><a href="mailto:${metalContent.contact.admin}">Email Char Armitage</a></div>
  </section>
`;

const renderNews = () => `
  ${pageHero()}
  <section class="section-block reveal">
    <div class="section-heading"><p class="eyebrow">Archive tapes</p><h2>Selected public milestones.</h2></div>
    <div class="news-grid">
      ${metalContent.news
        .map(
          (item) => `
            <article class="news-card">
              <img src="${item.image}" alt="">
              <div><p class="eyebrow">${item.year}</p><h3>${item.title}</h3><p>${item.text}</p></div>
            </article>
          `
        )
        .join("")}
    </div>
  </section>
`;

const renderContact = () => `
  ${pageHero()}
  <section class="section-block reveal">
    <div class="contact-grid">
      <article class="metal-card"><p class="eyebrow">Direct line</p><h2>Email</h2><a class="slash-link" href="mailto:${metalContent.contact.email}">${metalContent.contact.email}</a><a class="slash-link" href="mailto:${metalContent.contact.admin}">${metalContent.contact.admin}</a><a class="slash-link" href="tel:6507259641">${metalContent.contact.phone}</a></article>
      <article class="metal-card"><p class="eyebrow">Venue</p><h2>Location</h2><p>${metalContent.contact.location}</p><p>${metalContent.contact.mailing}</p></article>
      <article class="metal-card"><p class="eyebrow">Official channels</p><h2>Links</h2><ul class="link-list">${metalContent.contact.links.map((link) => `<li><a href="${link.href}"${linkAttrs(link.href)}>${link.label}</a></li>`).join("")}</ul></article>
    </div>
  </section>
`;

const renderers = {
  home: renderHome,
  research: renderResearch,
  publications: renderPublications,
  team: renderTeam,
  consortia: renderConsortia,
  "consortium-detail": renderConsortiumDetail,
  resources: renderResources,
  join: renderJoin,
  news: renderNews,
  contact: renderContact,
};

const bindReveal = () => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal").forEach((node) => observer.observe(node));
};

renderStageFx();
bindRuneScroll();
renderSetlist();
renderAmpRig();

if (main) {
  main.innerHTML = renderers[pageId]?.() || renderHome();
}

  document.title = `${pageId === "consortium-detail" && consortium ? consortium.shortName : page.title} | ${metalContent.meta.title}`;
bindReveal();
initPhotoCarousels(".poster-photo > img, .hero-card > img, .news-card > img");

if (pageId === "team") {
  bindTeam();
}

if (pageId === "publications") {
  hydrateScholar();
}
