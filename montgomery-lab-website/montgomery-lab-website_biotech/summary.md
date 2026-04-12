# Montgomery Lab OS Summary

## Project overview

This directory contains a separate Montgomery Lab website concept built in a radically different visual and structural language from the main site. Instead of an editorial Stanford-lab presentation, this build treats the lab like a biotech platform interface: dark, high-contrast, green-on-black, motion-heavy, and organized around the idea of a genomic operating system.

The result is still a static multipage website, but it deliberately avoids the original top-bar information architecture. Navigation is handled through a fixed command dock on desktop and a horizontally scrollable mobile dock. The content remains recognizably Montgomery Lab content: research themes, team roster, consortia, tools, join guidance, milestones, and contact channels all come from the same public-facing backbone as the main site.

## Technical architecture

The biotech build is plain HTML, CSS, and ES modules, but the internal structure is intentionally different from the original site's single shared renderer pattern.

- `index.html`, `research.html`, `publications.html`, `team.html`, `consortia.html`, `resources.html`, `join.html`, `news.html`, and `contact.html` are dedicated page shells.
- `js/content.js` contains the structured content model for the whole site: page metadata, dock entries, hero content, research cards, publication streams, team data, consortium data, resources, join guidance, milestones, and contact information.
- `js/shared.js` contains shared runtime behavior and utilities:
  - command dock rendering
  - dock-terminal rendering and command parsing
  - brand glitch animation
  - page-intro rendering
  - footer rendering
  - initials and link helpers
  - code-rain, nucleotide-sequence, and helix background generation
  - reveal animation and scroll-parallax setup
- `js/pages/` contains page-owned render modules:
  - `home.js`
  - `research.js`
  - `publications.js`
  - `team.js`
  - `consortia.js`
  - `resources.js`
  - `join.js`
  - `news.js`
  - `contact.js`
- `js/app.js` is now only a small bootstrap file that selects the current page, calls the correct renderer, and initializes shared behavior.

This split was a deliberate technical decision. The biotech version needed to feel like its own system rather than a reskin, and moving to page-owned render modules made that true both visually and structurally.

## Codebase structure

- `DESIGN.md`
  - the biotech design document describing the command-dock architecture, motion system, and visual goals
- `index.html`
  - landing page with hero, command-dock jump grid, research preview, and output-stream preview
- `research.html`
  - research engines, signal pipeline, and active project track
- `publications.html`
  - live Scholar-fed papers, milestone papers, publication themes, and output framing
- `team.html`
  - PI spotlight, featured profiles, current roster, and alumni cloud
- `consortia.html`
  - consortium cards plus a role-and-output matrix
- `resources.html`
  - software/tools, project resources, guides, and data landscape
- `join.html`
  - audience-specific application guidance, onboarding steps, values, and FAQ
- `news.html`
  - selected milestones and a timeline presentation of signal history
- `contact.html`
  - direct contact channels, location, official links, and public-signal recap
- `style.css`
  - the visual system: palette, `*.sh` dock labels, enlarged draggable floating terminal panel, glitch branding, neon-glass cards, motion layers, page grids, and responsive behavior
- `js/content.js`
  - central structured data model for the site
- `js/shared.js`
  - shared rendering, terminal logic, Scholar-feed hydration, and motion helpers
- `js/pages/*.js`
  - page-specific renderers
- `js/app.js`
  - bootstrap/runtime entry point
- `scripts/update_scholar_feed.mjs`
  - refresh script that fetches recent papers from the live Google Scholar profile and writes a local JSON feed for the biotech publications page
- `assets/data/scholar-feed.json`
  - cached recent-publication feed generated from Google Scholar
- `assets/fonts/`
  - local Manrope font files copied into the biotech site so it remains self-contained
- `assets/generated/`
  - copied optimized imagery for hero panels, publication/news imagery, and headshots
- `assets/consortium_logos/`
  - copied consortium logos used in the partner network page
- `assets/brand/favicon.png`
  - branded favicon copy used by all biotech pages

## Content sources and continuity

This site reuses the same content backbone already assembled for the main Montgomery Lab website:

- current roster and alumni structure
- PI information and contact routes
- research themes across regulation, rare disease, and molecular phenotypes
- consortium memberships and roles
- public tools, workflow guides, and portal links
- join instructions and onboarding expectations
- selected milestone events such as GTEx and MoTrPAC

The biotech build repackages that material in a louder and more systems-oriented voice. It is not intended to introduce a different factual narrative; it is intended to present the same lab through a different design ideology.

## Technologies used

- HTML5 for page shells
- modern CSS for layout, gradients, glass surfaces, responsive behavior, and motion styling
- ES modules for page-specific rendering and shared runtime behavior
- local WOFF2 font hosting for performance and to avoid visible network font swaps
- Playwright for multipage desktop and mobile browser smoke tests
- local Python HTTP serving for development verification
- a local Node-based Google Scholar fetch script for keeping recent papers current without requiring a backend

## Design and implementation decisions

- **Command dock instead of top nav:** the dock is the primary structural break from the main site. It changes the feel immediately and supports the “Montgomery Lab OS” concept.
- **Built-in floating terminal:** the site now includes a larger floating terminal panel on desktop that supports `pwd`, `ls`, `cd`, `open`, `man`, `help`, and `clear`. It mirrors GUI navigation, understands page sections as local directories, allows direct keyboard navigation across the site, opens directly into a pre-rendered `help` transcript, always initializes in the top-right corner, can be dragged and edge-resized within the right-side workspace, minimizes to a bottom tab, closes into a sidebar launcher, and maximizes into the right rail.
- **Page-owned modules instead of one giant renderer:** separating renderers into `js/pages/` makes each page easier to develop independently and reinforces that this is not just the original site's architecture with different colors.
- **Dark biotech visual system:** black and graphite foundations, electric green highlights, cyan accents, glow, scanlines, code rain, floating nucleotide strings, and slower, more three-dimensional SVG-rendered double-helix forms create the “biotech startup / systems console” identity the user requested.
- **Aggressive but readable motion:** scroll-reactive nucleotide columns, bounded content drift, drifting helix clusters, and reveal transitions add theatrical movement without letting the actual text panels collide with one another. The Genome OS hero now stacks its media below the large copy at desktop sizes, and intermediate breakpoints hide the floating terminal while keeping the dock, which prevents wide screens, medium-width screens, and zoomed desktop views from compressing the content shell.
- **Themed browser surfaces:** the Genome OS concept now styles the main page scrollbar with green/cyan terminal colors instead of leaving the default grey browser scrollbar.
- **Theme-aware lab photo carousels:** static group and lab-scene images are enhanced into hover-revealed carousels with green terminal controls, eight-photo queues, top dot navigation, and photo-specific captions while keeping headshots and logos static.
- **Shared content backbone with different voice:** the same factual lab content is preserved, but the presentation emphasizes systems, scale, tools, collaboration, and infrastructure.
- **Separate Publications and News pages:** the first pass folded some of this material into other pages, but the final structure restores them as proper destinations so the site carries more of the main site's public content.
- **Dock widened and terminal separated:** the desktop dock is now wide enough to hold real labels without clipping, and the command terminal has been moved into its own larger floating panel on the right so it is actually readable and usable.
- **Pipeline-style dock naming:** the primary navigation now reads like a numbered bioinformatics pipeline, using executable-looking labels such as `01_boot.sh`, `02_signals.sh`, and `03_papers.sh`, and the terminal's root `ls` output reflects the same convention.
- **Brand glitch on page load:** the `Montgomery Lab` label in the dock glitches through a short, readable burst of one to three related `ML` acronyms on page load before settling back to the real lab name.
- **Network page inspector:** the old Featured Profiles section has been removed. Current-member chips now open a sticky profile inspector with a photo or initials, role, bio/focus text, and a contact route when available.
- **Consortia cards rebalanced:** the partner-network cards now use a logo-plus-copy layout so consortium marks sit beside their role and summary text instead of colliding with it when the desktop shell narrows around the floating terminal.
- **Static Scholar feed instead of fragile live browser scraping:** the biotech publications page now hydrates a local JSON feed generated from the live Google Scholar profile, which avoids CORS issues while still surfacing recent papers and Scholar links.
- **Skip link restored:** the biotech build keeps the dramatic interface while preserving a basic accessibility affordance that the first pass dropped.
- **Real favicon path and self-contained assets:** the biotech build copies required assets into its own directory so it can stand alone without depending on the original site directory at runtime.

## How the parts connect

1. Each HTML page declares `data-page` and provides shared mount points.
2. `js/app.js` reads that page id and chooses a dedicated renderer from `js/pages/`.
3. `js/content.js` provides the structured data those renderers consume.
4. `js/shared.js` injects the dock, terminal, page intro, footer, and animated background systems.
5. `style.css` applies the unified biotech visual system across all pages.

The result is a separate, self-contained Montgomery Lab site that preserves the core public content while changing both the visual identity and the underlying page organization.
