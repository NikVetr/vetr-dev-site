const byId = (id) => document.getElementById(id);

const linkAttrs = (href) => (href.startsWith("http") ? ' target="_blank" rel="noreferrer"' : "");

const makeInitials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

const TERMINAL_STORAGE_KEY = "mlos-terminal-state";
const BRAND_GLITCH_POOL = [
  "Machine Learning",
  "Methylation Level",
  "Multiple Loci",
  "Maximum Likelihood",
  "Marginal Likelihood",
  "Markdown Language",
  "Meta Learning",
  "Mendelian Law",
  "Medical Laboratory",
  "Memory Leak",
  "Medical Literature",
  "Marker Linkage",
];
const SCHOLAR_FEED_PATH = "assets/data/scholar-feed.json";

const pagePath = (page, section = "") => {
  if (page === "home") {
    return section ? `/${section}` : "/";
  }

  return section ? `/${page}/${section}` : `/${page}`;
};

const getSectionIndex = () => ({
  home: ["destinations", "engines", "outputs"],
  research: ["engines", "pipeline", "projects"],
  publications: ["overview", "milestones", "themes"],
  team: ["leadership", "roster", "alumni"],
  consortia: ["programs", "roles"],
  resources: ["catalog", "guides", "landscape"],
  join: ["audiences", "entry", "faq"],
  news: ["milestones", "timeline"],
  contact: ["channels", "signals"],
});

const getDirectoryMap = (content) =>
  Object.fromEntries(
    content.dock.map((item) => [
      item.id,
      {
        href: item.href,
        path: pagePath(item.id),
        aliases: [
          item.id,
          item.href.replace(/\.html$/i, "").toLowerCase(),
          item.label.toLowerCase(),
          item.label.toLowerCase().replace(/\.sh$/i, ""),
          content.pages[item.id]?.title?.toLowerCase() || "",
        ]
          .flatMap((value) => [value, ...value.split(/[^a-z0-9]+/)])
          .filter(Boolean),
      },
    ])
  );

const normalizeCommandTarget = (value) => value.trim().toLowerCase().replace(/^\/+|\/+$/g, "");

const getCurrentLocation = (page) => {
  const section = window.location.hash ? window.location.hash.replace(/^#/, "") : "";
  return {
    page,
    section,
    path: pagePath(page, section),
  };
};

const helpLines = [
  "pwd      print the current Montgomery Lab path",
  "ls       list pages from / or sections from the current page",
  "cd       move to a page or a section",
  "open     alias for cd",
  "man      show detailed help for a command",
  "help     print this command list",
  "clear    clear terminal history",
];

const defaultTerminalState = (path) => ({
  cwd: path,
  lastPath: path,
  left: null,
  top: null,
  width: null,
  height: null,
  minimized: false,
  hidden: false,
  maximized: false,
  history: [
    { type: "prompt", text: "help" },
    ...helpLines.map((line) => ({ type: "output", text: line })),
  ],
});

const loadTerminalState = (currentPath) => {
  try {
    const raw = sessionStorage.getItem(TERMINAL_STORAGE_KEY);

    if (!raw) {
      return defaultTerminalState(currentPath);
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed.history)) {
      return defaultTerminalState(currentPath);
    }

    if (
      parsed.history.length <= helpLines.length + 4 &&
      parsed.history.some((entry) => entry?.text === "Montgomery Lab terminal online.")
    ) {
      return defaultTerminalState(currentPath);
    }

    return {
      cwd: currentPath,
      lastPath: parsed.lastPath || currentPath,
      left: null,
      top: null,
      width: null,
      height: null,
      minimized: false,
      hidden: false,
      maximized: false,
      history: parsed.history.slice(-36),
    };
  } catch {
    return defaultTerminalState(currentPath);
  }
};

const saveTerminalState = (state) => {
  try {
    sessionStorage.setItem(
      TERMINAL_STORAGE_KEY,
      JSON.stringify({
        cwd: state.cwd,
        lastPath: state.lastPath,
        left: state.left,
        top: state.top,
        width: state.width,
        height: state.height,
        minimized: false,
        hidden: false,
        maximized: false,
        history: state.history.slice(-36),
      })
    );
  } catch {
    // no-op if storage is unavailable
  }
};

const pushHistory = (state, entry) => {
  state.history.push(entry);
  state.history = state.history.slice(-36);
};

const appendOutputLines = (state, lines) => {
  lines.forEach((line) => pushHistory(state, { type: "output", text: line }));
};

const manText = {
  pwd: [
    "pwd",
    "  print the current Montgomery Lab path.",
  ],
  ls: [
    "ls",
    "  list pages from / or sections from the current page.",
  ],
  cd: [
    "cd <target>",
    "  move to a page or a section on the current page.",
    "  examples: cd research, cd roster, cd /contact, cd pipeline",
  ],
  open: [
    "open <target>",
    "  alias for cd.",
  ],
  man: [
    "man <command>",
    "  show detailed help for pwd, ls, cd, open, help, clear.",
  ],
  help: [
    "help",
    "  print the command list.",
  ],
  clear: [
    "clear",
    "  clear terminal history.",
  ],
};

const makeSequence = (length) => {
  const bases = ["A", "C", "G", "T"];
  return Array.from({ length }, () => bases[Math.floor(Math.random() * bases.length)]).join("");
};

const renderDock = (content, page) => {
  const dock = byId("dockNav");

  if (!dock) {
    return;
  }

  dock.innerHTML = content.dock
    .map(
      (item) => `
        <a href="${item.href}" class="dock-link ${item.id === page ? "is-active" : ""}" data-page-id="${item.id}">
          <span class="dock-index">${item.label.slice(0, 2)}</span>
          <span class="dock-label">${item.label.toLowerCase()}</span>
        </a>
      `
    )
    .join("");
};

const initBrandGlitch = () => {
  const primary = document.querySelector(".brand-primary");
  const secondary = document.querySelector(".brand-secondary");

  if (!primary) {
    return;
  }

  primary.textContent = "Montgomery Lab";
  if (secondary) {
    secondary.textContent = "stanford medicine";
  }

  const variants = [...BRAND_GLITCH_POOL].sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * 3) + 1);
  let step = 0;
  primary.classList.add("is-glitching");

  const interval = window.setInterval(() => {
    const next = variants[step] || "Montgomery Lab";
    primary.textContent = next;
    step += 1;
    if (step >= variants.length) {
      window.clearInterval(interval);
      window.setTimeout(() => {
        primary.textContent = "Montgomery Lab";
        primary.classList.remove("is-glitching");
      }, 90);
    }
  }, 180);
};

const renderPageIntro = (content, page) => {
  const mount = byId("pageHero");
  const meta = content.pages[page];

  if (!mount || !meta || page === "home") {
    return;
  }

  mount.innerHTML = `
    <div class="page-intro shell reveal">
      <div class="page-intro-copy">
        <p class="page-kicker">${meta.eyebrow}</p>
        <h1>${meta.title}</h1>
        <p class="page-lede">${meta.lede}</p>
      </div>
      <div class="page-intro-panel hud-panel">
        <p class="terminal-label">${meta.panelLabel}</p>
        <h2>${meta.panelTitle}</h2>
        <ul class="hud-list">
          ${meta.panelItems.map((item) => `<li>${item}</li>`).join("")}
        </ul>
      </div>
    </div>
  `;
};

const renderFooter = (content, page) => {
  const mount = byId("footerMount");
  const nextIndex = (content.dock.findIndex((item) => item.id === page) + 1) % content.dock.length;
  const next = content.dock[nextIndex];

  if (!mount) {
    return;
  }

  mount.innerHTML = `
    <div class="shell footer-shell">
      <div>
        <p class="terminal-label">Montgomery Lab OS</p>
        <p>Functional genomics, molecular phenotypes, rare disease, public tools, and collaboration at platform scale.</p>
      </div>
      <a href="${next.href}" class="footer-jump">Next / ${next.label.toLowerCase()}</a>
    </div>
  `;
};

const renderScholarCards = (items) =>
  items
    .map(
      (item) => `
        <article class="hud-panel publication-card scholar-card">
          <p class="terminal-label">${item.year}${item.citationCount ? ` · ${item.citationCount} cites` : ""}</p>
          <h3>${item.title}</h3>
          <p>${item.venue || item.authors}</p>
          <a class="inline-link" href="${item.href}"${linkAttrs(item.href)}>Open in Scholar</a>
        </article>
      `
    )
    .join("");

const hydrateScholarFeed = async (mountId, metaId, fallbackItems = []) => {
  const mount = byId(mountId);
  const meta = metaId ? byId(metaId) : null;

  if (!mount) {
    return;
  }

  try {
    const response = await fetch(SCHOLAR_FEED_PATH, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("scholar feed unavailable");
    }

    const feed = await response.json();
    const items = (feed.items || []).slice(0, 6);

    if (!items.length) {
      throw new Error("scholar feed empty");
    }

    mount.innerHTML = renderScholarCards(items);

    if (meta) {
      const fetchedDate = feed.fetchedAt ? new Date(feed.fetchedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
      meta.textContent = fetchedDate ? `Refreshed from Google Scholar on ${fetchedDate}.` : "Refreshed from Google Scholar.";
    }
  } catch {
    mount.innerHTML = renderScholarCards(
      fallbackItems.map((item) => ({
        ...item,
        citationCount: null,
      }))
    );

    if (meta) {
      meta.textContent = "Showing curated publication markers while the Scholar feed is unavailable.";
    }
  }
};

const buildCodeField = (content) => {
  const mount = byId("codeField");

  if (!mount) {
    return;
  }

  mount.innerHTML = Array.from({ length: 10 }, (_, index) => {
    const sequenceColumn = index % 3 !== 0;
    const lines = Array.from({ length: 8 }, (_, lineIndex) =>
      sequenceColumn
        ? makeSequence(16 + ((index + lineIndex) % 10))
        : content.keywords[(index + lineIndex) % content.keywords.length]
    );
    const startRem = -18 + ((index * 7) % 28);
    const speed = 0.035 + ((index % 5) * 0.012);
    const driftX = ((index % 4) - 1.5) * 8;

    return `
      <div class="code-column ${sequenceColumn ? "code-column-sequence" : "code-column-keyword"}" data-depth="${(index % 5) + 1}" data-speed="${speed.toFixed(3)}" style="top:${startRem}rem; --column-drift-x:${driftX}px;">
        ${lines.map((line) => `<span>${line}</span>`).join("")}
      </div>
    `;
  }).join("");
};

const buildHelixField = () => {
  const mount = byId("helixField");

  if (!mount) {
    return;
  }

  const clusters = Array.from({ length: 4 }, (_, clusterIndex) => {
    const width = 148;
    const height = 360;
    const midX = width / 2;
    const amplitude = 26 + clusterIndex * 3;
    const leftPoints = [];
    const rightPoints = [];
    const rungLines = [];

    for (let stepIndex = 0; stepIndex <= 18; stepIndex += 1) {
      const y = 10 + stepIndex * 18.5;
      const theta = (stepIndex / 18) * Math.PI * 2;
      const wave = Math.sin(theta);
      const depth = Math.cos(theta);
      const leftX = midX - amplitude * wave;
      const rightX = midX + amplitude * wave;
      const leftRadius = 3.2 + (depth + 1) * 1.25;
      const rightRadius = 3.2 + (1 - depth) * 1.25;

      leftPoints.push(`${leftX.toFixed(2)},${y.toFixed(2)}`);
      rightPoints.push(`${rightX.toFixed(2)},${y.toFixed(2)}`);
      rungLines.push(
        `<line class="helix-rung-line" x1="${leftX.toFixed(2)}" y1="${y.toFixed(2)}" x2="${rightX.toFixed(2)}" y2="${y.toFixed(2)}"></line>` +
          `<circle class="helix-node helix-node-left" cx="${leftX.toFixed(2)}" cy="${y.toFixed(2)}" r="${leftRadius.toFixed(2)}"></circle>` +
          `<circle class="helix-node helix-node-right" cx="${rightX.toFixed(2)}" cy="${y.toFixed(2)}" r="${rightRadius.toFixed(2)}"></circle>`
      );
    }

    return `
      <div class="helix-cluster helix-${clusterIndex + 1}" data-depth="${clusterIndex + 1}">
        <svg class="helix-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">
          <polyline class="helix-backbone helix-backbone-left" points="${leftPoints.join(" ")}"></polyline>
          <polyline class="helix-backbone helix-backbone-right" points="${rightPoints.join(" ")}"></polyline>
          ${rungLines.join("")}
        </svg>
      </div>
    `;
  });

  mount.innerHTML = clusters.join("");
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

const scrollToSection = (section) => {
  const target = document.getElementById(section);

  if (!target) {
    return false;
  }

  target.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", `#${section}`);
  return true;
};

const renderTerminalHistory = (state, output) => {
  output.innerHTML = state.history
    .slice(-16)
    .map((entry) => `<div class="terminal-line terminal-line-${entry.type}">${entry.text}</div>`)
    .join("");
  output.scrollTop = output.scrollHeight;
};

const resolveTarget = (content, page, rawTarget) => {
  const target = normalizeCommandTarget(rawTarget);
  const sections = getSectionIndex();
  const directories = getDirectoryMap(content);

  if (!target || target === ".") {
    return { kind: "noop" };
  }

  if (target === "..") {
    const current = getCurrentLocation(page);
    if (current.section) {
      return { kind: "section-root" };
    }

    return { kind: "page", pageId: "home", href: directories.home.href, path: directories.home.path };
  }

  if (target === "home" || target === "boot") {
    return { kind: "page", pageId: "home", href: directories.home.href, path: directories.home.path };
  }

  const absoluteParts = target.startsWith("/") ? target.split("/").filter(Boolean) : [];

  if (absoluteParts.length) {
    if (absoluteParts.length === 1 && sections.home.includes(absoluteParts[0])) {
      return { kind: "page-section", pageId: "home", href: `index.html#${absoluteParts[0]}`, path: pagePath("home", absoluteParts[0]), section: absoluteParts[0] };
    }

    const [pageToken, sectionToken] = absoluteParts;
    const pageMatch = Object.entries(directories).find(([, item]) => item.aliases.includes(pageToken));

    if (pageMatch) {
      const [pageId, pageData] = pageMatch;
      if (sectionToken && sections[pageId]?.includes(sectionToken)) {
        return { kind: "page-section", pageId, href: `${pageData.href}#${sectionToken}`, path: pagePath(pageId, sectionToken), section: sectionToken };
      }

      return { kind: "page", pageId, href: pageData.href, path: pageData.path };
    }
  }

  const pageMatch = Object.entries(directories).find(([, item]) => item.aliases.includes(target));

  if (pageMatch) {
    const [pageId, pageData] = pageMatch;
    return { kind: "page", pageId, href: pageData.href, path: pageData.path };
  }

  if (sections[page]?.includes(target)) {
    return { kind: "section", section: target, path: pagePath(page, target) };
  }

  return { kind: "missing", target };
};

const renderDockTerminal = (content, page) => {
  const mount = byId("floatingTerminal");

  if (!mount) {
    return;
  }

  const current = getCurrentLocation(page);
  const state = loadTerminalState(current.path);
  const firstLoad = state.history.length <= helpLines.length + 2;

  if (!firstLoad && state.lastPath !== current.path) {
    pushHistory(state, { type: "output", text: `entered ${current.path}` });
  }

  state.cwd = current.path;
  state.lastPath = current.path;
  saveTerminalState(state);

  mount.innerHTML = `
    <section class="floating-terminal-shell">
      <div class="floating-terminal-head">
        <button type="button" class="terminal-dot terminal-dot-red terminal-control" data-terminal-action="close" aria-label="Close terminal"></button>
        <button type="button" class="terminal-dot terminal-dot-amber terminal-control" data-terminal-action="minimize" aria-label="Minimize terminal"></button>
        <button type="button" class="terminal-dot terminal-dot-green terminal-control" data-terminal-action="maximize" aria-label="Maximize terminal"></button>
        <strong>lab-terminal</strong>
      </div>
      <div id="dockTerminalOutput" class="floating-terminal-output" aria-live="polite"></div>
      <form id="dockTerminalForm" class="floating-terminal-form">
        <label class="floating-terminal-prompt" for="dockTerminalInput">></label>
        <input id="dockTerminalInput" class="floating-terminal-input" type="text" name="command" autocomplete="off" spellcheck="false" placeholder="enter command">
      </form>
      ${["n", "e", "s", "w", "ne", "se", "sw", "nw"].map((edge) => `<span class="terminal-resize-handle terminal-resize-${edge}" data-resize-edge="${edge}"></span>`).join("")}
    </section>
    <button id="terminalMinimizedTab" class="terminal-minimized-tab" type="button" hidden>lab-terminal</button>
  `;

  const output = byId("dockTerminalOutput");
  const form = byId("dockTerminalForm");
  const input = byId("dockTerminalInput");
  const shell = mount.querySelector(".floating-terminal-shell");
  const head = mount.querySelector(".floating-terminal-head");

  if (!output || !form || !input || !shell || !head) {
    return;
  }

  const dock = document.querySelector(".command-dock");
  let dockLauncher = byId("terminalDockLauncher");

  if (!dockLauncher && dock) {
    dockLauncher = document.createElement("button");
    dockLauncher.id = "terminalDockLauncher";
    dockLauncher.className = "dock-terminal-launcher";
    dockLauncher.type = "button";
    dockLauncher.textContent = "lab-terminal";
    dockLauncher.hidden = true;
    dock.append(dockLauncher);
  }

  const defaultTop = 22;
  const getRightWorkspace = () => {
    const minLeft = Math.max(window.innerWidth * 0.54, 720);
    const maxWidth = Math.max(320, window.innerWidth - minLeft - 18);
    return { minLeft, maxWidth };
  };

  const applyTerminalLayout = () => {
    const { minLeft, maxWidth } = getRightWorkspace();
    const defaultWidth = Math.min(576, maxWidth);
    const defaultHeight = Math.min(430, window.innerHeight - 44);
    const width = state.maximized ? maxWidth : Math.min(Math.max(state.width || defaultWidth, 340), maxWidth);
    const height = state.maximized ? window.innerHeight - 34 : Math.min(Math.max(state.height || defaultHeight, 220), window.innerHeight - 34);
    const maxLeft = Math.max(minLeft, window.innerWidth - width - 18);
    const minTop = 16;
    const maxTop = Math.max(minTop, window.innerHeight - height - 18);
    const left = state.maximized ? minLeft : Math.min(Math.max(state.left ?? window.innerWidth - width - 20, minLeft), maxLeft);
    const top = state.maximized ? minTop : Math.min(Math.max(state.top ?? defaultTop, minTop), maxTop);

    mount.style.left = `${left}px`;
    mount.style.right = "auto";
    mount.style.top = `${top}px`;
    mount.style.width = `${width}px`;
    mount.style.height = `${height}px`;
    shell.classList.toggle("is-minimized", state.minimized);
    shell.classList.toggle("is-hidden", state.hidden);
    shell.classList.toggle("is-maximized", state.maximized);
    mount.classList.toggle("is-minimized", state.minimized);
    mount.classList.toggle("is-hidden", state.hidden);
    mount.classList.toggle("is-maximized", state.maximized);

    const minimizedTab = byId("terminalMinimizedTab");
    if (minimizedTab) {
      minimizedTab.hidden = !state.minimized || state.hidden;
    }

    if (dockLauncher) {
      dockLauncher.hidden = !state.hidden;
    }

    state.left = left;
    state.top = top;
    state.width = width;
    state.height = height;
    saveTerminalState(state);
  };

  const resetTerminalHistory = () => {
    const fresh = defaultTerminalState(getCurrentLocation(page).path);
    state.history = fresh.history;
  };

  const refresh = () => {
    const location = getCurrentLocation(page);
    state.cwd = location.path;
    renderTerminalHistory(state, output);
    saveTerminalState(state);
  };

  applyTerminalLayout();
  renderTerminalHistory(state, output);

  document.querySelectorAll(".dock-link").forEach((link) => {
    link.addEventListener("click", () => {
      const nextPage = link.dataset.pageId || "";
      const nextPath = pagePath(nextPage);
      pushHistory(state, { type: "prompt", text: `open ${nextPath}` });
      state.lastPath = nextPath;
      saveTerminalState(state);
    });
  });

  window.addEventListener("hashchange", refresh);
  window.addEventListener("resize", applyTerminalLayout);

  dockLauncher?.addEventListener("click", () => {
    state.hidden = false;
    state.minimized = false;
    state.maximized = false;
    state.left = null;
    state.top = null;
    applyTerminalLayout();
    input.focus();
  });

  byId("terminalMinimizedTab")?.addEventListener("click", () => {
    state.minimized = false;
    state.hidden = false;
    applyTerminalLayout();
    input.focus();
  });

  head.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".terminal-control") || state.maximized) {
      return;
    }

    const rect = mount.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    mount.classList.add("is-dragging");
    head.setPointerCapture(event.pointerId);

    const handleMove = (moveEvent) => {
      const width = mount.offsetWidth;
      const height = shell.offsetHeight;
      const { minLeft } = getRightWorkspace();
      const maxLeft = Math.max(minLeft, window.innerWidth - width - 18);
      const minTop = 16;
      const maxTop = Math.max(minTop, window.innerHeight - height - 18);

      state.left = Math.min(Math.max(moveEvent.clientX - offsetX, minLeft), maxLeft);
      state.top = Math.min(Math.max(moveEvent.clientY - offsetY, minTop), maxTop);
      applyTerminalLayout();
    };

    const handleEnd = () => {
      mount.classList.remove("is-dragging");
      head.removeEventListener("pointermove", handleMove);
      head.removeEventListener("pointerup", handleEnd);
      head.removeEventListener("pointercancel", handleEnd);
    };

    head.addEventListener("pointermove", handleMove);
    head.addEventListener("pointerup", handleEnd);
    head.addEventListener("pointercancel", handleEnd);
  });

  mount.querySelectorAll(".terminal-resize-handle").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      if (state.maximized || state.minimized || state.hidden) {
        return;
      }

      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      const edge = handle.dataset.resizeEdge || "";
      const startX = event.clientX;
      const startY = event.clientY;
      const start = {
        left: state.left,
        top: state.top,
        width: state.width,
        height: state.height,
      };

      const resizeMove = (moveEvent) => {
        const { minLeft, maxWidth } = getRightWorkspace();
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        const minWidth = 340;
        const minHeight = 220;
        let nextLeft = start.left;
        let nextTop = start.top;
        let nextWidth = start.width;
        let nextHeight = start.height;

        if (edge.includes("e")) {
          nextWidth = Math.min(Math.max(start.width + dx, minWidth), maxWidth);
        }

        if (edge.includes("s")) {
          nextHeight = Math.min(Math.max(start.height + dy, minHeight), window.innerHeight - 34);
        }

        if (edge.includes("w")) {
          nextWidth = Math.min(Math.max(start.width - dx, minWidth), maxWidth);
          nextLeft = Math.min(Math.max(start.left + dx, minLeft), start.left + start.width - minWidth);
        }

        if (edge.includes("n")) {
          nextHeight = Math.min(Math.max(start.height - dy, minHeight), window.innerHeight - 34);
          nextTop = Math.min(Math.max(start.top + dy, 16), start.top + start.height - minHeight);
        }

        state.left = nextLeft;
        state.top = nextTop;
        state.width = nextWidth;
        state.height = nextHeight;
        applyTerminalLayout();
      };

      const resizeEnd = () => {
        handle.removeEventListener("pointermove", resizeMove);
        handle.removeEventListener("pointerup", resizeEnd);
        handle.removeEventListener("pointercancel", resizeEnd);
      };

      handle.addEventListener("pointermove", resizeMove);
      handle.addEventListener("pointerup", resizeEnd);
      handle.addEventListener("pointercancel", resizeEnd);
    });
  });

  mount.querySelectorAll(".terminal-control").forEach((control) => {
    control.addEventListener("click", () => {
      const action = control.dataset.terminalAction;

      if (action === "minimize") {
        state.minimized = true;
        state.hidden = false;
        applyTerminalLayout();
        return;
      }

      if (action === "maximize") {
        if (state.maximized) {
          state.maximized = false;
          state.left = null;
          state.top = null;
          state.width = null;
          state.height = null;
        } else {
          state.maximized = true;
        }
        state.minimized = false;
        state.hidden = false;
        applyTerminalLayout();
        input.focus();
        return;
      }

      if (action === "close") {
        state.hidden = true;
        state.minimized = false;
        state.maximized = false;
        applyTerminalLayout();
      }
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const raw = input.value.trim();

    if (!raw) {
      return;
    }

    pushHistory(state, { type: "prompt", text: raw });

    const [command, ...args] = raw.split(/\s+/);
    const normalizedCommand = command.toLowerCase();
    const argString = args.join(" ");

    if (normalizedCommand === "clear") {
      state.history = [];
      saveTerminalState(state);
      renderTerminalHistory(state, output);
      input.value = "";
      return;
    }

    if (normalizedCommand === "pwd") {
      pushHistory(state, { type: "output", text: getCurrentLocation(page).path });
      refresh();
      input.value = "";
      return;
    }

    if (normalizedCommand === "help") {
      appendOutputLines(state, helpLines);
      refresh();
      input.value = "";
      return;
    }

    if (normalizedCommand === "man") {
      appendOutputLines(state, manText[args[0]?.toLowerCase()] || ["man: command not found"]);
      refresh();
      input.value = "";
      return;
    }

    if (normalizedCommand === "ls") {
      const currentLocation = getCurrentLocation(page);
      const sections = getSectionIndex();

      if (!currentLocation.section) {
        const listing =
          currentLocation.page === "home"
            ? content.dock
                .map((item) => item.label.toLowerCase())
                .join("\n")
            : (sections[currentLocation.page] || []).join("\n");
        appendOutputLines(state, (listing || "empty").split("\n"));
      } else {
        pushHistory(state, { type: "output", text: "No deeper sections." });
      }

      refresh();
      input.value = "";
      return;
    }

    if (normalizedCommand === "cd" || normalizedCommand === "open") {
      const resolved = resolveTarget(content, page, argString);

      if (resolved.kind === "noop") {
        pushHistory(state, { type: "output", text: getCurrentLocation(page).path });
        refresh();
        input.value = "";
        return;
      }

      if (resolved.kind === "section-root") {
        history.replaceState(null, "", window.location.pathname);
        pushHistory(state, { type: "output", text: pagePath(page) });
        refresh();
        input.value = "";
        return;
      }

      if (resolved.kind === "section") {
        if (scrollToSection(resolved.section)) {
          pushHistory(state, { type: "output", text: `entered ${resolved.path}` });
          state.lastPath = resolved.path;
        } else {
          pushHistory(state, { type: "error", text: `cd: section not found: ${resolved.section}` });
        }

        refresh();
        input.value = "";
        return;
      }

      if (resolved.kind === "page" || resolved.kind === "page-section") {
        state.lastPath = resolved.path;
        saveTerminalState(state);
        window.location.href = resolved.href;
        return;
      }

      pushHistory(state, { type: "error", text: `cd: no such destination: ${resolved.target}` });
      refresh();
      input.value = "";
      return;
    }

    pushHistory(state, { type: "error", text: `${normalizedCommand}: command not found` });
    refresh();
    input.value = "";
  });
};

let sceneFrame = 0;
let sceneNodes = {
  codeColumns: [],
  helixClusters: [],
};

const updateScene = () => {
  sceneFrame = 0;

  const scroll = window.scrollY || window.pageYOffset || 0;
  const range = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const progress = scroll / range;

  document.documentElement.style.setProperty("--page-progress", progress.toFixed(4));

  sceneNodes.codeColumns.forEach((node, index) => {
    const depth = Number(node.dataset.depth || 1);
    const speed = Number(node.dataset.speed || 0.06);
    const driftX = Number((node.style.getPropertyValue("--column-drift-x") || "0px").replace("px", "")) || 0;
    const x = driftX * Math.sin(progress * Math.PI * 1.3);
    const y = scroll * speed;
    node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  });

  sceneNodes.helixClusters.forEach((node, index) => {
    const depth = Number(node.dataset.depth || 1);
    const y = scroll * (0.012 + depth * 0.005);
    const x = Math.sin(progress * Math.PI + index) * (10 + depth * 2);
    const rotateY = -18 + progress * (26 + depth * 3);
    const rotateZ = (index % 2 === 0 ? 1 : -1) * (4 + progress * 8);
    node.style.transform = `translate3d(${x}px, ${y}px, 0) perspective(960px) rotateX(${6 - depth}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`;
  });
};

const scheduleScene = () => {
  if (sceneFrame) {
    return;
  }

  sceneFrame = window.requestAnimationFrame(updateScene);
};

const initScene = (content) => {
  buildCodeField(content);
  buildHelixField();
  sceneNodes = {
    codeColumns: [...document.querySelectorAll(".code-column")],
    helixClusters: [...document.querySelectorAll(".helix-cluster")],
  };
  updateScene();
  window.addEventListener("scroll", scheduleScene, { passive: true });
  window.addEventListener("resize", scheduleScene);
};

export {
  byId,
  linkAttrs,
  makeInitials,
  renderDock,
  initBrandGlitch,
  renderPageIntro,
  renderFooter,
  hydrateScholarFeed,
  renderDockTerminal,
  bindReveal,
  initScene,
};
