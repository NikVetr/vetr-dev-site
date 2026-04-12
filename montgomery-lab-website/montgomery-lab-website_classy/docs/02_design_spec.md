# Detailed design spec

## Summary

Design a flagship website for the Stephen Montgomery Lab at Stanford that feels cutting-edge, computational, visually alive, and culturally current.

This is **not** a “respectable faculty homepage.” It is a recruitment, collaboration, and research storytelling platform for a world-class genomics lab.

It should feel fancy and impressive **without** becoming precious, opaque, or hard for lab members to maintain.

## Primary audiences

1. Prospective undergraduates
2. Rotation students
3. Prospective PhD students
4. Postdocs
5. Staff scientists / engineers
6. Collaborators
7. Funders / advisory audiences
8. Journalists
9. Patients/families and clinicians interested in rare-disease-facing work

## Primary conversion goals

Within 5–10 seconds, a first-time visitor should understand:
- who the lab is
- what the lab studies
- why the work matters
- that the lab is active now
- how to engage with the lab

## Creative direction

### Desired vibe
- modern
- scientific
- exploratory
- computational
- high-end
- selective
- collaborative
- youthful but not goofy
- confident but not heavy
- more cutting-edge than established

### Undesired vibe
- formal
- stately
- ornate
- conservative
- old institutional
- generic biotech SaaS
- stale academic template
- performatively prestigious

## Visual language

### Core idea
Use a visual system inspired by:
- variant-to-function-to-disease pathways
- expression gradients
- networks
- tissue maps
- layered omics
- dynamic scientific systems

### Typography
Use editorial display + crisp UI sans.

Recommended direction:
- display/headline: elegant editorial serif or high-character neo-grotesk display
- body/UI: Inter, Geist, IBM Plex Sans, or comparable

### Color
Keep Stanford red as a supporting accent, not the dominant page fill.

Suggested palette direction:
- base background: warm white or cool off-white
- dark text: near-black charcoal
- scientific accent: deep blue / indigo
- secondary accent: teal / blue-green
- tertiary accent: Stanford cardinal used sparingly
- occasional highlight: electric cyan or amber for featured items only

### Motion
Use motion sparingly and intentionally.

Allowed:
- subtle fades
- scroll-triggered reveal
- hover transitions
- lightweight animated data textures
- restrained counters or progress indicators
- elegant menu and card microinteractions

Avoid:
- heavy parallax
- scroll-jacking
- excessive particle fields
- overly cinematic page transitions
- decorative movement without informational value

## Navigation requirements

The header should float or stick at the top and remain lightweight, fast, and readable.

Required top-level navigation direction:
- Home
- Research
- Team
- Publications
- Consortia
- Resources
- Join
- News
- Contact

These are anchor sections, not an immutable final sitemap. The agent may refine the information architecture as long as the resulting structure remains straightforward and maintainable.

### Consortia menu behavior

Include a **Consortia** dropdown in the top menu that lists major consortia individually, such as:
- GTEx
- MoTrPAC
- GREGoR
- TOPMed
- Functional ADSP
- Developmental GTEx
- IGVF
- SMaHT
- All of Us
- UDN
- ENCODE4

The dropdown should scale gracefully when consortium membership changes.

## Content strategy

### Site thesis
**From genetic variation to mechanism to diagnosis**

### Core explanatory sentence
The Montgomery Lab studies how genetic variation shapes molecular phenotypes, cellular processes, and disease, using functional genomics, computational/statistical genomics, and large-scale collaborative consortia.

### Distinctive content pillars
- functional genomics
- rare disease and diagnosis
- computational/statistical genomics
- gene regulation and expression
- structural variation and understudied RNA biology
- exercise and environment-responsive biology
- community resources and software
- consortium-scale science

## Asset direction

Use the full `/assets/visual/` library as the primary visual source.

Important constraints:
- there are many gigabytes of photos
- some assets are oversized print-resolution files
- there are also videos
- the agent must explore, score, curate, and optimize the library
- representative images are **examples only** and should not center the design in any one direction

### What to favor visually
- candid collaboration
- whiteboard and meeting moments
- strong full-group photos
- visually clean portraits/headshots when available
- lab culture images with energy and intelligence
- abstracted scientific graphics derived from real science when useful

### What to avoid
- generic stock science imagery
- over-reliance on one single team photo
- overusing novelty/costume images unless they genuinely fit a specific moment
- letting the available media library dictate the whole aesthetic

## UX principles

- show the science quickly
- show the people quickly
- keep page hierarchy obvious
- make major actions easy to find
- support partial data gracefully
- use sophisticated visuals with simple mechanics
- prefer modular repeatable patterns over one-off art-directed widgets

## Maintainability principles

The final site must be easy for lab members to update.

That means:
- structured content collections instead of hard-coded pages where possible
- documented component APIs
- simple asset conventions
- shallow content editing workflows
- placeholders that are explicit and easy to replace
- no fragile animation systems
- no hidden dependencies for common edits
- clear instructions for adding a person, alumni record, publication, consortium, or news item

## Page-level emphasis

### Home
Should feel memorable, fast, and intellectually sharp.

### Research
Should make the scientific programs legible to outsiders without flattening the complexity.

### Team
Should make the lab feel alive and current, with expandable details and alumni outcomes.

### Publications
Should be readable, filterable, and welcoming to newcomers.

### Consortia
Should communicate the lab's scale, network, and collaborative footprint.

### Resources
Should treat tools/software/data as first-class outputs.

### Join / Contact
Should serve multiple audiences with tailored guidance.

### News / Stories
Should feel editorial rather than bureaucratic.
