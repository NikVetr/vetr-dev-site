# Montgomery Lab Biotech Design Document

## Creative direction

This alternative site should feel like a genomics startup command center rather than an academic editorial brochure. The design language is intentionally louder, darker, and more future-facing:

- black and deep graphite foundations
- electric green and acid-lime highlights
- luminous glass panels, scanlines, and glow
- moving background systems that suggest DNA, code, computation, and networked biology
- a tone that frames the lab as technically aggressive, computationally sophisticated, and built for scale

The goal is not to parody startup aesthetics. It should still feel precise and premium, but its center of gravity should be "advanced platform for genomic discovery" rather than "quietly prestigious research group."

## Product concept

Working concept: **Montgomery Lab OS**

Instead of a conventional website with a top navigation bar, this build behaves like a networked system interface:

- multiple dedicated pages
- a fixed vertical command dock for page jumps
- strong page-level hero states rather than a shared top bar
- theatrical scroll motion and parallax layers inside each page
- a mix of scientific content, team information, consortia, tools, recruitment, and contact presented as an integrated operating environment

This keeps the new site structurally distinct from the current website rather than simply re-skinned.

## Information architecture

The site should retain much of the same public content, but reorganize it into a different narrative.

### Page map

1. **Home / Boot**
   - introduce the Montgomery Lab as a functional genomics and molecular interpretation engine
   - establish the startup-biotech tone immediately
   - show metrics, moving code, floating DNA forms, and fast links to the rest of the system

2. **Research / Signal Stack**
   - present the main scientific engines
   - gene regulation
   - rare disease and outlier interpretation
   - molecular phenotyping
   - consortium-scale data science and methods

3. **Publications / Output Stream**
   - selected milestone papers
   - major publication themes
   - a publication layer that feels like shipping product output rather than a bibliography

4. **Team / Human Network**
   - leadership spotlight
   - current team roster
   - alumni / network layer
   - frame the lab as a high-performance technical team rather than a faculty directory

5. **Consortia / Partner Network**
   - highlight the major collaborative programs
   - use logos and network-map styling
   - emphasize scale, data generation, and translational reach

6. **Resources / Toolchain**
   - public software
   - portals and supplements
   - computational workflow and analysis culture
   - present the lab as a builder of infrastructure, not just a consumer of it

7. **Join / Recruitment Protocol**
   - direct guidance on joining the lab
   - who should contact whom
   - what materials to send
   - what kind of researcher fits the lab

8. **News / Signal History**
   - selected milestones and timepoints
   - a timeline view of the lab's public scientific arc

9. **Contact / Transmission**
   - recent milestones
   - official contact details
   - public links
   - final conversion layer

## Motion system

Motion should be a first-class part of the identity.

- full-page parallax layers tied to scroll progress
- floating DNA helix constructs that drift at different depths
- code columns that slide behind the main content
- glowing panels that react to viewport entry
- section cards that tilt or translate slightly on hover
- fixed command dock with active section tracking

The motion should be noticeably stronger than in the current site, but still readable and performant.

## Visual system

### Palette

- near-black background with layered charcoal gradients
- saturated green primary glow
- secondary lime and cyan accents for system states
- occasional white text for high-contrast emphasis

### Typography

- body and interface: modern sans with strong weight control
- secondary technical voice: monospace labels, command fragments, code snippets
- large headlines should feel engineered and kinetic rather than classical

### Surfaces

- dark glass cards
- bordered HUD panels
- luminous separators
- radial glow halos
- subtle scanline texture and grid overlays

## Content strategy

The content should stay recognizable as the Montgomery Lab:

- same major research themes
- same current roster backbone
- same consortia
- same join and contact essentials
- same public resources and tools

But the presentation should shift:

- fewer polite summaries
- more declarative positioning
- more emphasis on systems, scale, computation, and infrastructure
- more language that frames the lab as building platforms for discovery

## Asset strategy

Use copied assets from the current project so this build remains self-contained:

- generated homepage and hero images
- generated headshots
- consortium logos
- local fonts and favicon

These assets should be recomposed differently rather than simply dropped into the old slots.

## Implementation plan

1. Create structured content in `js/content.js`.
2. Build a family of page shells: `index.html`, `research.html`, `publications.html`, `team.html`, `consortia.html`, `resources.html`, `join.html`, `news.html`, and `contact.html`.
3. Implement the full visual system in `style.css`.
4. Use a small shared runtime and separate page modules to:
   - render the shared command dock
   - render page-specific content blocks from dedicated modules
   - build decorative background systems
   - drive parallax and active-page state
5. Run local browser verification for desktop and mobile.

## Success criteria

The finished site should:

- feel unmistakably different from the current one
- retain the essential Montgomery Lab content
- look premium and deliberate, not gimmicky
- feel more like a biotech platform or product launch than a university microsite
- deliver aggressive but coherent motion and atmosphere
