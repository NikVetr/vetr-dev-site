# Montgomery Lab website agent repo scaffold

This repository is a planning and scaffolding package for an agentic AI or design/dev team to build a new website for the Stephen Montgomery Lab at Stanford.

It intentionally does **not** implement the site. It provides:

- a detailed design spec
- a technical architecture plan
- an implementation checklist
- an initial prompt for an agentic AI
- page-by-page content briefs
- starter content schemas and placeholder data
- asset-selection rules for a very large photo/video library
- governance and maintainability guidance
- a small set of representative images in `assets/representative/`

## Desired outcome

A modern, scientific, visually ambitious, cutting-edge lab website that feels alive, selective, and current rather than formal, institutional, or static.

It should feel impressive without becoming fragile. Lab members should be able to update, extend, and repair it without needing to redesign the whole site or understand a complex frontend system.

## Recommended top-level site sections

- Home
- Research
- Team
- Publications
- Consortia
- Resources
- Join / Contact
- News / Stories

The exact sitemap is **not fixed**. These are anchor sections, not hard limits. The implementing agent should propose the best final structure while preserving straightforward navigation and maintainability.

## Key constraints

- Use the full local asset tree (not included here) as the primary visual source.
- The agent must explore and curate from the full media library, including large print-resolution photos and videos.
- The representative images in `assets/representative/` are only mood samples. They should not disproportionately steer the final design.
- The site should support missing data gracefully with placeholders for headshots, bios, and alumni placement.
- The header should float/stick and expose the major sections.
- Include a **Consortia** dropdown in the top navigation that lists the major consortia individually.
- Team cards should expand or dropdown to reveal bios, links, and contact information.
- Alumni should appear on the Team page with placement/outcome information at the bottom.
- The final implementation should privilege maintainability, clear documentation, structured content, and modular components.

## Representative images

Three representative images are included in `assets/representative/` only to help establish broad visual range and lab-culture tone. They are **not** necessarily priority hero images and should not dictate composition, casting, or page hierarchy.

## Documents to read first

1. `docs/01_research_memo.md`
2. `docs/02_design_spec.md`
3. `docs/03_architecture_plan.md`
4. `docs/04_implementation_checklist.md`
5. `docs/05_initial_agent_prompt.md`
6. `docs/09_maintainability_and_governance.md`

## Suggested working model for the agent

1. Read the research memo and design spec.
2. Crawl the asset tree and build an asset inventory.
3. Select candidate visual sets per page and per component.
4. Propose a final sitemap and navigation model.
5. Build content collections from the templates under `content/`.
6. Produce wireframes.
7. Produce visual comps.
8. Implement.
9. Run QA using the checklist.
10. Leave behind clear contributor documentation for lab members.

## Notes on factual content

This scaffold includes a research memo based on publicly accessible Stanford and related pages as of 2026-04-02. Before launch, the agent should refresh:
- current people list
- current publication list
- current consortium participation
- current resources/software links
- current social/profile links
