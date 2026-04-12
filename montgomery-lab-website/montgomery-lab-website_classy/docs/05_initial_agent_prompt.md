# Initial prompt for the agentic AI

You are designing and implementing a new website for the Stephen Montgomery Lab at Stanford.

Your job is **not** to produce a conventional academic faculty site. Your job is to create a modern, scientific, visually ambitious, cutting-edge lab website that feels active, selective, collaborative, and alive.

The site should look impressive, but it must also be straightforwardly documented and maintainable by lab members after launch.

Read these files first:
- `docs/01_research_memo.md`
- `docs/02_design_spec.md`
- `docs/03_architecture_plan.md`
- `docs/04_implementation_checklist.md`
- `docs/09_maintainability_and_governance.md`

## Hard requirements

1. Use a floating/sticky header with links to the common lab-site sections.
   Minimum direction:
   - Home
   - Research
   - Team
   - Publications
   - Consortia
   - Resources
   - Join
   - News
   - Contact

2. Include a **Consortia** dropdown in the top menu listing the major consortia individually.
   At minimum account for:
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

3. Create a Team page that:
   - shows all current lab members
   - supports click-to-expand or dropdown details for bios/contact info
   - includes alumni at the bottom with placement information
   - handles missing headshots and bios gracefully with placeholders

4. Create a Join/Contact page that contains distinct sections for:
   - prospective undergraduates
   - rotation students
   - PhD students
   - postdocs
   - collaborators
   - general inquiries

5. Use the full local asset library under `/assets/visual/` as the primary visual source.
   - You must explore the directory tree yourself.
   - There are many gigabytes of photos and some videos.
   - Some files are oversized print-resolution images.
   - You must curate and optimize them for web use.
   - Representative examples are in `assets/representative/`, but they are **not** priorities or defaults.

6. The aesthetic should be:
   - more modern
   - more scientific
   - more cutting-edge
   - less formal
   - less stodgy
   - less “respectable institutional”

7. Do not ship a site that depends on huge original image files.
   - Generate optimized derivatives.
   - Use poster frames and compressed clips for video.

8. Do not build a fragile showpiece.
   - Use structured content.
   - Use modular components.
   - Leave behind clear contributor docs.
   - Make the navigation and consortia menu data-driven.

## Content and positioning requirements

The site should clearly communicate:
- variant to function to disease
- functional genomics
- computational/statistical genomics
- rare disease and diagnosis
- large-scale consortia participation
- active lab culture and mentorship

Prominently represent consortium participation, including:
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

Treat tools/resources as first-class outputs, not footnotes.

## Process requirements

1. Audit the asset tree and generate a manifest.
2. Propose a final sitemap. The example sections in this repo are directional, not exhaustive.
3. Propose a maintainable content model.
4. Select the strongest media for each context rather than reusing the representative examples by default.
5. Build the site with clean documentation for future maintainers.

## Output quality bar

The finished site should feel like a best-in-class modern research lab website, while remaining easy for future lab members to update, extend, and debug.
