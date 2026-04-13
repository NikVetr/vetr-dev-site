import { biotechContent } from "./content.js";
import { byId, renderDock, initBrandGlitch, renderPageIntro, renderFooter, renderDockTerminal, bindReveal, initScene } from "./shared.js";
import { renderHome } from "./pages/home.js";
import { renderResearch } from "./pages/research.js";
import { renderPublications } from "./pages/publications.js";
import { renderTeam } from "./pages/team.js";
import { renderConsortia, renderConsortiumDetail } from "./pages/consortia.js";
import { renderResources } from "./pages/resources.js";
import { renderJoin } from "./pages/join.js";
import { renderNews } from "./pages/news.js";
import { renderContact } from "./pages/contact.js";
import { initPhotoCarousels } from "./photo-carousel.js";

const page = document.body.dataset.page || "home";
const pageKey = page === "consortium-detail" ? "consortia" : page;
const consortiumId = document.body.dataset.consortium || "";
const consortium = biotechContent.consortia.find((item) => item.id === consortiumId);

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

const mount = byId("contentMount");
const renderPage = renderers[page] || renderHome;

document.title = `${page === "consortium-detail" && consortium ? consortium.shortName : biotechContent.pages[pageKey]?.title || biotechContent.meta.title} | ${biotechContent.meta.title}`;
renderDock(biotechContent, pageKey);
initBrandGlitch();
renderDockTerminal(biotechContent, pageKey);

if (page !== "consortium-detail") {
  renderPageIntro(biotechContent, pageKey);
}

if (mount) {
  renderPage(mount, biotechContent);
}

renderFooter(biotechContent, pageKey);
initScene(biotechContent);
bindReveal();
initPhotoCarousels(".visual-frame > img, .news-card > img");
