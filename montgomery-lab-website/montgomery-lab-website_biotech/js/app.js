import { biotechContent } from "./content.js";
import { byId, renderDock, initBrandGlitch, renderPageIntro, renderFooter, renderDockTerminal, bindReveal, initScene } from "./shared.js";
import { renderHome } from "./pages/home.js";
import { renderResearch } from "./pages/research.js";
import { renderPublications } from "./pages/publications.js";
import { renderTeam } from "./pages/team.js";
import { renderConsortia } from "./pages/consortia.js";
import { renderResources } from "./pages/resources.js";
import { renderJoin } from "./pages/join.js";
import { renderNews } from "./pages/news.js";
import { renderContact } from "./pages/contact.js";

const page = document.body.dataset.page || "home";

const renderers = {
  home: renderHome,
  research: renderResearch,
  publications: renderPublications,
  team: renderTeam,
  consortia: renderConsortia,
  resources: renderResources,
  join: renderJoin,
  news: renderNews,
  contact: renderContact,
};

const mount = byId("contentMount");
const renderPage = renderers[page] || renderHome;

document.title = `${biotechContent.pages[page]?.title || biotechContent.meta.title} | ${biotechContent.meta.title}`;
renderDock(biotechContent, page);
initBrandGlitch();
renderDockTerminal(biotechContent, page);
renderPageIntro(biotechContent, page);

if (mount) {
  renderPage(mount, biotechContent);
}

renderFooter(biotechContent, page);
initScene(biotechContent);
bindReveal();
