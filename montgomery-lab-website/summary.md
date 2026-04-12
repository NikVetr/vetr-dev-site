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
- The selector labels avoid implementation names like "classy", "biotech", and "metal", while their typography and color treatments signal each design direction.
- `.gitignore` excludes raw Notion exports, raw lab photo archives, raw headshot folders, and cloned legacy website source from deployment. The published site uses generated web assets, and the Resources page links to the public legacy supplemental page rather than bundling the cloned legacy repo.
