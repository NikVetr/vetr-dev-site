# Implementation checklist

## Phase 0: source verification
- [ ] verify current official titles and affiliations
- [ ] verify current people roster
- [ ] verify contact details
- [ ] verify current consortium participation
- [ ] verify current publications feed/source of truth
- [ ] verify social/profile links

## Phase 1: asset audit
- [ ] crawl `/assets/visual/`
- [ ] generate asset manifest
- [ ] identify top 20 hero candidates
- [ ] identify top 40 carousel/story candidates
- [ ] identify headshot inventory and missing headshots
- [ ] identify available video clips and create poster frames
- [ ] create optimized derivatives
- [ ] mark low-quality/problematic assets
- [ ] confirm that representative images are treated as examples, not defaults

## Phase 2: content modeling
- [ ] populate people schema
- [ ] populate alumni schema
- [ ] populate publications schema
- [ ] populate consortia schema
- [ ] populate resources schema
- [ ] create site settings config for navigation/footer/social links
- [ ] draft homepage and join-page copy
- [ ] mark placeholders clearly

## Phase 3: UX and IA
- [ ] confirm site map
- [ ] define top-level navigation
- [ ] define consortia dropdown contents and ordering
- [ ] wireframe desktop
- [ ] wireframe mobile
- [ ] define floating header behavior
- [ ] define team dropdown interaction
- [ ] define publication filtering behavior
- [ ] define consortia layout and detail page behavior
- [ ] define resources page layout

## Phase 4: visual design
- [ ] create moodboard from internal assets
- [ ] select type system
- [ ] select color system
- [ ] design homepage hero
- [ ] design research pillar cards
- [ ] design team cards
- [ ] design alumni section
- [ ] design consortia dropdown and cards
- [ ] design join/contact page
- [ ] design publication and resource cards
- [ ] validate that the tone feels cutting-edge rather than formal/institutional

## Phase 5: build
- [ ] scaffold framework
- [ ] implement content collections
- [ ] implement data-driven navigation
- [ ] implement layout and navigation
- [ ] implement consortia dropdown
- [ ] implement image pipeline
- [ ] implement responsive grid system
- [ ] implement team card dropdowns
- [ ] implement publication filtering
- [ ] implement resource filtering or grouping if needed
- [ ] implement carousels if used
- [ ] implement SEO metadata
- [ ] implement analytics if approved

## Phase 6: accessibility
- [ ] keyboard test all interactive controls
- [ ] focus state audit
- [ ] reduced-motion support
- [ ] contrast audit
- [ ] semantic landmark audit
- [ ] alt text audit
- [ ] screen-reader smoke test
- [ ] verify dropdowns and expandable cards are accessible

## Phase 7: performance
- [ ] optimize largest images
- [ ] preload only critical hero media
- [ ] lazy-load noncritical media
- [ ] compress videos and use posters
- [ ] Lighthouse audit
- [ ] check Core Web Vitals
- [ ] confirm no pages depend on 30MB+ originals

## Phase 8: maintainability
- [ ] document how to add/edit a person
- [ ] document how to add/edit an alumni record
- [ ] document how to add/edit a consortium
- [ ] document how to add/edit a publication
- [ ] document how to add/edit a resource/tool
- [ ] document how to change navigation and social links
- [ ] document asset derivative workflow
- [ ] document deployment/update workflow

## Phase 9: launch readiness
- [ ] remove placeholder copy where possible
- [ ] replace placeholder images where possible
- [ ] verify links
- [ ] final proofread
- [ ] final mobile QA
- [ ] final desktop QA
- [ ] final stakeholder review
