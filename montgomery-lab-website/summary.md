# Montgomery Lab Website Concepts Summary

This directory contains three independent static Montgomery Lab website concepts and a lightweight comparison shell.

## Architecture

- `index.html` is a full-viewport concept switcher. It defaults to `montgomery-lab-website_classy/index.html` and swaps the other variants into an iframe through three visually distinct selector buttons: Classic Signal, Genome OS, and Stage Rig.
- `montgomery-lab-website_classy/` remains the refined academic/professional concept.
- `montgomery-lab-website_biotech/` remains the dark green, high-tech, terminal-oriented concept.
- `montgomery-lab-website_metal/` remains the heavy-metal concept with setlist navigation, stage effects, and an opt-in MIDI/amp music controller.

## Design Decisions

- The shell uses an iframe rather than merging the sites into one shared bundle so each concept stays standalone and can still be copied, served, or deployed independently.
- The switcher is intentionally compact, vertical, and fixed in the bottom-right corner so reviewers can compare the concepts without changing each variant's internal navigation model.
- The wrapper uses the same shared favicon image as the concept sites.
- Each standalone concept carries its own themed scrollbar styling inside the iframe so the browser chrome that remains visible in each concept matches that concept’s visual language.
- Each standalone concept now also has its own local photo-carousel module. The modules use the same optimized lab-photo pool but preserve standalone deployability by avoiding a shared parent-directory runtime dependency.
- The three concepts now diverge on mobile as well as desktop: Classic Signal uses a polished pill header, Genome OS uses a compact neon command header with a toggle drawer, and Stage Rig uses a short ticket-header with a hidden setlist menu.
- Carousel image queues now vary by page and carousel position inside each concept, and each concept now biases toward page-specific photo pools so repeated subpage imagery feels less templated even when the same generated asset set is shared.
- Recent refinement work also tightened the mobile menu glyphs, made the Genome OS mobile drawer opaque for readability, and upgraded the Stage Rig `BIOINFORMATICS` control into a true 0-10 dial with a taped-on `11`.
- Recent refinement work also added consortium-specific subpages to the Genome OS and Stage Rig concepts, widened the Genome OS PI lead panel, reduced repeated photo defaults across subpages, and taught the Classic Signal consortium detail card to switch between top-mounted wide logos and left-rail tall logos.
- The selector labels avoid implementation names like "classy", "biotech", and "metal", while their typography and color treatments signal each design direction.
- `.gitignore` excludes raw Notion exports, raw lab photo archives, raw headshot folders, and cloned legacy website source from deployment. The published site uses generated web assets, and the Resources page links to the public legacy supplemental page rather than bundling the cloned legacy repo.
