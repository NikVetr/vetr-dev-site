# Montgomery Lab Website Summary

## Project overview

This repository now contains a static multipage website concept for the Montgomery Lab at Stanford University. The site is designed to feel editorial, visually distinctive, and professionally credible while still staying easy to maintain as plain web files.

The information architecture is no longer a single long homepage. Instead, the root site is organized into focused destinations for research, team, publications, consortia, resources, joining the lab, news, and contact. The homepage acts as a concise front door, and each major navigation item opens its own page. The consortia section now also includes individual detail pages for each consortium rather than only anchor jumps on a single aggregate page.

## Technical architecture

The implementation is intentionally lightweight and static-first:

- `index.html` is the homepage shell.
- `research.html`, `team.html`, `publications.html`, `consortia.html`, `resources.html`, `join.html`, `news.html`, and `contact.html` provide dedicated top-level destinations.
- `consortia/*.html` provides consortium-specific detail pages driven by a shared template plus page-level `data-consortium` identifiers.
- `style.css` defines the visual system, responsive layout, and shared component styling across all pages.
- `js/site-content.js` holds structured content objects for navigation, research pillars, project cards, team roster data, consortia, resources, join-page guidance, stories, and contact/footer links.
- `js/main.js` acts as a shared renderer and interaction layer. It detects the current page via `data-page`, renders the correct sections, and powers shared UI behavior such as:
  - desktop navigation
  - consortia dropdown menu
  - consortium detail-page rendering
  - desktop gutter field notes
  - mobile floating note drawer
  - mobile navigation drawer
  - mobile consortia submenu
  - intersection-based reveal animations
  - footer year updates
  - consortium detail-logo aspect switching so wide logos stay in a shallow top band while tall logos can sit on the left side of the detail card

This approach keeps content and page logic separate without introducing a framework or build pipeline. It is straightforward to maintain now, and it leaves a clean migration path if the lab later wants Astro, Next.js, or a CMS-backed setup.

## Codebase structure

- `index.html`
  - short homepage with hero, stats, previews, stories, and consortia ribbon
- `research.html`
  - scientific pillars and active project directions
- `team.html`
  - PI profile, current members, and alumni with mixed real and generated headshot support
- `publications.html`
  - recent Scholar-fed papers, selected milestone papers, and reading themes, with a photographed focus-area side panel
- `consortia.html`
  - consortium cards and dropdown-linked anchors
- `consortia/*.html`
  - individual consortium detail pages
- `resources.html`
  - linked public tools, manuscript supplements, consortium portals, workflow guides, and data landscape section
- `join.html`
  - direct application guidance, onboarding, first-week checklist, culture, and FAQ
- `news.html`
  - recent public milestones plus archived highlights from the legacy site
- `contact.html`
  - email, phone, location, mailing address, official links, and a photographed contact side panel
- `style.css`
  - design tokens, layouts, responsive behavior, cards, navigation, and page-specific styling
- `fonts.css`
  - locally hosted `Fraunces` and `Manrope` font-face definitions used across every page to avoid visible webfont swaps
- `js/site-content.js`
  - reusable structured content across the site
- `js/main.js`
  - shared rendering and interaction logic, including page-wide favicon injection and Scholar-feed hydration for the publications page
- `scripts/update_scholar_feed.mjs`
  - refresh script that fetches the latest papers from Stephen Montgomery's Google Scholar profile and writes a local JSON feed for static-page rendering
- `assets/data/scholar-feed.json`
  - cached recent-publication feed generated from Google Scholar for use on the publications page
- `assets/generated/home/`
  - optimized WebP derivatives used for homepage and story imagery
- `assets/generated/page-hero/`
  - additional optimized WebP derivatives used on text-heavy interior page hero panels
- `assets/fonts/`
  - locally hosted webfont files for `Fraunces` and `Manrope`
- `assets/generated/headshots/`
  - resized WebP headshots used on the team page
- `assets/notion/`
  - exported lab wiki materials used to shape team, join, resources, and project content

## Content sources and how they connect

The public-facing content was assembled from three main sources:

- official public sources such as Stanford Medicine pages, the PI profile, legacy lab site, and public consortium/publication pages
- the exported internal lab wiki in `assets/notion/`
- the cloned legacy website source in `assets/legacy_website/`

The Notion export informed several parts of the site:

- current-member and alumni names for the team page
- culture and values for the join page
- onboarding expectations, first-week checklist, and FAQ
- resource categories, computing guides, and operational topics
- project directions that appear on the research page
- data-inventory themes that now surface on the resources page
- project-momentum framing that now informs the news page
- mailing-address formatting for the contact page

The legacy website contributed a different kind of value:

- concise homepage language and research framing from the older public site
- authentic recruiting guidance for postdocs, Stanford PhD rotations, and Stanford undergraduates
- historical news items such as GTEx milestones and the lab joining MoTrPAC
- hand-written member bios and older headshots for overlapping current members and alumni
- older resource architecture around tools, manuscripts, and consortium portals

That material was translated into structured page content rather than embedded verbatim. The site uses the internal and legacy material to improve specificity while keeping the public copy concise and professional.

## Technologies used

- HTML5 for semantic page structure
- modern CSS for layout, typography, gradients, card surfaces, and responsive behavior
- ES modules for shared content and lightweight client-side rendering
- locally hosted webfonts:
  - `Fraunces` for display typography
  - `Manrope` for interface and body text
- local Python HTTP serving for development checks
- Playwright-driven browser testing for desktop/mobile rendering and navigation behavior
- `ffmpeg` for generating optimized local image derivatives
- local WOFF2 font hosting to reduce cross-page font flash and remove dependency on Google Fonts at render time
- a local Node-based Google Scholar fetch script for refreshing recent-publication data without adding a backend

## Design and implementation decisions

- **Multipage over single-page:** the site now matches the lab’s needs better by giving team, research, resources, and contact their own destinations instead of forcing everything into one scroll.
- **Static-first implementation:** plain HTML, CSS, and JavaScript were the fastest way to produce a polished result without adding framework overhead.
- **Local font hosting over remote font CSS:** the site now serves `Fraunces` and `Manrope` locally with preload hints, which removes the visible fallback-to-webfont rerender that was happening when moving between pages.
- **Shared renderer instead of copy-pasted page logic:** the pages remain static documents, but repeated content and behaviors are centralized in `js/site-content.js` and `js/main.js`.
- **Shared head behavior where it reduces duplication:** the site now sets the favicon through the shared JavaScript layer so the custom icon stays consistent across both top-level pages and consortium detail pages without duplicating near-identical head markup everywhere.
- **Local photography as the visual anchor:** real lab images make the site feel specific and credible in a way stock or abstract imagery would not.
- **Homepage media composition over awkward cropping:** the landing-page hero now uses a wide working-session photo as the primary image, with additional secondary image tiles so the visual emphasis stays on people and lab activity rather than a narrow crop seam.
- **Homepage hero layout tuned to avoid dead space:** the landing-page media column now uses a stacked-photo layout instead of leaving a stray third grid cell, which reduces the awkward blank area that had opened below the hero text.
- **Homepage hero now uses role-specific image placements:** a shallow support image fills the lower-left hero gap on wide screens, while the right-side portrait tile now uses a dedicated dinner photo that holds people better than the earlier ceiling-heavy crop.
- **Homepage portrait crop now uses the full available column height:** the right-side dinner portrait no longer fights a second stacked image below it, so it can align with the `Scientific profile` panel and preserve more of the people in frame.
- **Homepage lower-left band now prioritizes photography over redundant summary cards:** the former `Research scope` and `Lab environment` mini-panels were removed so the lab-community image can occupy the full lower-left band and align cleanly with the lower edge of the right-side hero panels.
- **Consortia dropdown tightened further:** the desktop consortium menu now uses a narrower panel, smaller internal padding, and slightly reduced logo sizing while staying centered beneath the `Consortia` tab.
- **Broader use of the lab photo archive:** the homepage no longer relies mainly on a small representative subset. It now pulls from a wider spread of images in `assets/lab_photos`, reducing repetition and making the site feel more like a living lab archive.
- **Notion-derived specificity without internal tone leakage:** the exported wiki added concrete detail, but the public copy was rewritten to avoid sounding like scaffolding or internal notes.
- **Legacy-site content reuse instead of invented filler:** hand-written prose from the previous lab website now drives much of the join-page guidance, team bios, and historical news framing, which reduced placeholder text and preserved authentic lab voice.
- **Subpage copy audit before cleanup:** a page-by-page audit was used to find leftover meta wording, then the flagged phrases were rewritten into direct content rather than leaving design-process language visible on the public site.
- **Dedicated consortium destinations:** dropdown items and consortium cards now route to actual detail pages, which gives large collaborations the prominence the user asked for.
- **Header cleanup over duplicated calls-to-action:** the secondary header CTA now reads `How to Join`, and the primary navigation no longer repeats `Join` as a separate tab.
- **Consortium branding in navigation:** the consortia dropdown now includes mini logos, and the consortium detail hero cards use bare logos so transparent assets render cleanly.
- **Consortium dropdown layout tuned for scanning:** consortium entries now render as full-width left-aligned rows with larger logos beside the name and role, and the desktop dropdown is centered beneath the `Consortia` tab while temporarily highlighting that tab only when the menu is open.
- **Margin-note system for wide screens:** the outer gutters are now used as intentional UI through a left context rail and a right floating note panel that opens from marked cards; smaller screens get the same note system as a bottom drawer.
- **Page-aware note defaults instead of meta instructions:** the right-hand note panel now opens with substantive page-level context by default, and when a visitor closes a card-specific note it resets to that page's baseline explanation rather than generic instructional copy.
- **Subtle full-page parallax on the wide-screen margin rails:** the left and right contextual rails now drift at slightly different speeds across the full document scroll range for large desktop layouts, adding motion without interfering with the existing note-open and note-close behavior.
- **Explicit placeholder strategy on team data:** the team page now has a real multipage destination even before every bio/headshot is finalized. The roster is split cleanly into current members and alumni, including current administrative support, and the alumni cards use a dedicated static layout so long emails and location chips remain readable.
- **Expanded headshot coverage from legacy assets:** the team page now uses resized headshots from both the new `assets/headshots/` folder and the cloned legacy website when a matching public image exists, while keeping initials-based fallbacks for the rest of the roster.
- **Per-person crop control for portraits:** headshot rendering now supports custom `object-position` values so whitespace-heavy source photos can be tightened without destructive manual edits.
- **Images added to otherwise text-heavy side panels:** the publications and contact hero side panels now carry lab imagery so those pages feel less diagrammatic and less dependent on text alone.
- **Broader interior-page photo usage:** the Resources, Publications, Contact, and Join hero side panels now use distinct images drawn from different parts of `assets/lab_photos`, reducing repetition and making the interior pages feel less templated.
- **Static Scholar feed instead of fragile live browser scraping:** the publications page now hydrates from a local JSON feed generated from the live Google Scholar profile, which avoids CORS and markup-stability problems while still surfacing the most recent papers and Scholar links.
- **Theme-aligned scrollbar:** the refined academic concept now styles the main page scrollbar with the site’s blue/teal palette so it does not clash with the otherwise custom visual system.
- **Editorial photo carousels:** group and lab-scene photos now become hover-revealed carousels with subtle blue/teal controls and dot navigation, using page-specific photo pools so the classy concept does not recycle the same image sequence across every subpage while leaving headshots and consortium logos unchanged.
- **Mobile header alignment:** the mobile header now keeps the `ML` mark and lab name left-aligned while pushing the hamburger control to the far right edge of the pill, and the carousel queues vary by page so repeated image sets are less obvious.
- **News imagery de-duplicated from the homepage:** the archival news cards no longer reuse the same homepage social and outdoors stills as aggressively, which makes the news page feel less like a repeat of the landing-page story strip.

## How the parts connect

1. Each HTML file defines a page shell with shared header/footer placeholders and page-specific content containers.
2. `js/site-content.js` exports the structured content used throughout the site.
3. `js/main.js` reads `body[data-page]`, renders the appropriate datasets into those containers, and binds shared interactions. Consortium detail pages additionally use `body[data-consortium]` to load consortium-specific copy.
4. `style.css` provides the consistent visual system and responsive layout rules that apply across all pages.
5. `scripts/update_scholar_feed.mjs` refreshes `assets/data/scholar-feed.json` from the live Google Scholar profile, and `js/main.js` hydrates that feed into the publications page with a curated fallback.
6. Optimized local images in `assets/generated/home/` and `assets/generated/headshots/` support the homepage, story-oriented sections, and team page without shipping oversized originals.

The result is a maintainable static site with a cleaner information architecture, stronger public-facing copy, and a clear place to expand content later.
