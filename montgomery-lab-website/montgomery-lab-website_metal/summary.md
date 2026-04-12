# Montgomery Lab Metal Site Summary

This directory is an independent static website variant for the Montgomery Lab. It uses the same broad lab content as the other site versions, but presents it through a heavy-metal concept: a torn setlist ticket for navigation, stage effects, amp controls, record-like publication cards, and high-contrast black, bone, chrome, and ember styling.

## Architecture

- `index.html`, `research.html`, `team.html`, `publications.html`, `consortia.html`, `resources.html`, `join.html`, `news.html`, and `contact.html` are thin static page shells. Each page sets `body[data-page]` so the shared JavaScript can render the correct content.
- `js/content.js` stores the reusable lab content, navigation metadata, page copy, team roster, consortia, resources, publications, contact details, and the local lab song playlist.
- `js/app.js` renders the shared setlist ticket, stage effects, MIDI/amp controller, deterministic per-song waveform display, page-specific sections, team member inspector, publication hydration hooks, and opt-in audio playback controls.
- `style.css` contains the full visual system, responsive layouts, stage effects, sticky setlist ticket navigation, and reduced-motion fallbacks.

## Design Decisions

- The primary navigation is a floating sticky concert-ticket/setlist rather than a conventional top bar, making this version structurally distinct from the professional and biotech variants.
- The lab’s metal logo is integrated directly into the ticket as a large printed mark with contrast/sepia blending, avoiding duplicate textual branding or secondary subtitle copy.
- The page background uses CSS-only brushed metal, diamond-plate texture, stage-light vignettes, spikes, and flame silhouettes rather than a soft generic glow.
- On desktop, the amp controls become a fixed left-margin MIDI/amp rack styled like a physical control surface, while medium desktop breakpoints reserve space for the rig so it cannot cover the poster; narrower screens keep the controls inline to avoid covering content.
- The MIDI rack loads a page-associated lab song, exposes beveled play/pause/prev/next hardware-style buttons, a page-track toggle, a hidden full playlist dropdown, and a smoked-glass waveform display, but never starts playback until the user presses play.
- The home poster headline is rendered as a custom three-line lockup, `BIOINFORMATICS / TURNED UP TO / ELEVEN`, and the rack includes a dedicated `BIOINFORMATICS` dial with a printed 0-10 scale plus a taped-on `11` marker.
- Partner-program logos are rendered directly on large transparent full-width card headers with glow instead of white tiles, and the partner grid uses a two-column layout on desktop so wide logos have room.
- Background rune labels include science terms and consortium names, drifting upward from off-screen bottom to off-screen top so visible loop resets are avoided.
- Content remains static and local-first so the site can be served with a simple static server while still feeling interactive through JavaScript-rendered panels and effects.
- The fixed ticket no longer uses an extra top scrim to hide scrolled foreground elements; this preserves the requested raw stage-scroll behavior. Major display text now uses the bundled Manrope font at supported weights instead of platform-specific `Impact` fallbacks, which prevents the extremely bold Windows rendering path.
- The main page scrollbar uses a dark steel-and-ember treatment so the browser scroll affordance matches the stage-rig concept instead of falling back to a generic grey control.
- Floating rune text is now scroll-driven rather than autonomously animated, avoiding platform-specific animation inconsistencies while keeping the stage background reactive.
- Group and lab-scene photos now use metal-styled hover carousels with ember triangle controls, dot navigation, and photo-specific captions. The medium-desktop hero breakpoint was also retuned so the poster copy and image no longer overlap.
- On mobile, the torn-ticket navigation collapses into a short sticky header with the metal logo on the left and a circular menu toggle on the right, while the full setlist hides inside a drawer.
- The mobile menu glyph now uses tighter bar spacing and the logo is pulled closer to the left edge so the compact header reads more like a real stage credential than a centered card.
- The amp rack now includes a dedicated `BIOINFORMATICS` dial with a fixed red 0-10 ring, evenly spaced numeric labels from 0 through 10, matching tick marks, a pointer aligned to the taped-on `11`, and a home-page headline lockup reading `BIOINFORMATICS / TURNED UP TO / ELEVEN`.
- News/archive stills and photo-carousel pools were rebalanced so page defaults do not keep repeating the same generated lab scenes across the metal concept.
