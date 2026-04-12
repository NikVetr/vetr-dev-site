# Architectural plan

## Recommended stack

Use a modern static-first framework with structured content collections.

### Preferred options
1. Next.js with app router + MDX/content collections
2. Astro with content collections
3. SvelteKit only if the implementing agent strongly prefers it

## Why this stack
- supports custom visual design
- handles image optimization
- allows structured content
- easy to maintain by a technically literate lab
- works well for hybrid static + dynamic content
- supports future extension without requiring a redesign

## Repository structure recommendation

```text
/
  app or src/
  components/
  content/
    people/
    alumni/
    publications/
    consortia/
    resources/
    news/
    pages/
    site-settings/
  assets/
    visual/
    representative/
    generated/
  public/
  scripts/
  docs/
```

## Maintainability design rules

- keep content separate from presentation
- prefer typed content collections over ad hoc JSON blobs
- isolate one-off homepage art direction from reusable page components
- document every custom component used by non-engineers
- make top navigation data-driven
- make consortia dropdown items data-driven
- avoid unnecessary CMS complexity if a Git-based content workflow is enough
- leave behind an onboarding document for future lab maintainers

## Content model

### people
Fields:
- name
- slug
- role
- category
- pronouns (optional)
- email (optional)
- image
- imageAlt
- shortBlurb
- longBio
- interests
- links
- active
- sortOrder

### alumni
Fields:
- name
- formerRole
- years
- currentPlacement
- placementLink
- image
- notes

### publications
Fields:
- title
- year
- authors
- venue
- doi
- pubmed
- preprint
- url
- abstractShort
- tags
- consortium
- featured
- codeLink
- dataLink

### consortia
Fields:
- name
- slug
- shortName
- summary
- labRole
- logo
- website
- selectedPubs
- navOrder
- themeColor
- status

### resources
Fields:
- name
- slug
- category
- summary
- link
- paperLink
- status
- logoOrIcon
- tags

### site-settings
Use a central config file for:
- top navigation
- consortia dropdown entries
- social/profile links
- contact details
- footer links
- homepage featured slugs

## Key pages and modules

### home
Modules:
- hero
- proof strip
- research pillars
- consortia band
- featured stories
- team preview
- join CTA
- footer

### research
Modules:
- overview
- pillar sections
- representative figures/images
- linked papers/resources

### team
Modules:
- leadership
- current members grid
- expandable bios
- alumni placements

### publications
Modules:
- featured papers
- searchable list
- filters
- newcomer reading list

### consortia
Modules:
- consortia overview
- consortium cards
- consortium detail templates
- related publications/resources

### resources
Modules:
- tools/resources cards
- software/data highlights
- status labels

### join
Modules:
- join overview
- audience-specific accordions/cards
- FAQ
- contact

### news
Modules:
- featured story
- filterable cards
- archive

## Navigation plan

Use a floating header with:
- logo/wordmark
- top-level nav items
- consortia dropdown
- optional CTA button such as Join or Contact

The nav should degrade gracefully on mobile with:
- a compact drawer
- clear accordions for nested menu items
- no hover-only access to critical destinations

## UI component library plan

Create reusable components:
- FloatingHeader
- NavigationMenu
- ConsortiumDropdown
- SectionIntro
- HeroMedia
- ResearchPillarCard
- ConsortiumCard
- ConsortiumMiniLink
- StoryCard
- TeamCard
- ExpandableBio
- AlumniRow
- PublicationFilters
- PublicationCard
- ResourceCard
- CTASection
- MediaCarousel
- ContactPanel
- FAQAccordion

## Asset pipeline plan

The asset workflow must accommodate a very large local media library.

Requirements:
- crawl `/assets/visual/`
- build a manifest with metadata and candidate uses
- generate optimized derivatives
- preserve originals untouched
- create poster images for videos
- detect likely hero/background/team/carousel candidates
- prefer generated web assets over originals at runtime

Suggested derivative directories:
- `assets/generated/hero/`
- `assets/generated/cards/`
- `assets/generated/team/`
- `assets/generated/carousel/`
- `assets/generated/backgrounds/`
- `assets/generated/video-posters/`

## Documentation deliverables the agent should leave behind

- `docs/CONTRIBUTING.md`
- `docs/content-editing-guide.md`
- `docs/asset-workflow.md`
- `docs/navigation-reference.md`
- `docs/component-catalog.md`
- `docs/deployment-notes.md`

## Extendibility requirements

The site should be able to add, without structural rewrites:
- a new consortium
- a new lab member
- a new alumni record
- a new publication tag/category
- a new resource/tool entry
- a new news item
- an occasional landing page for a program or initiative
