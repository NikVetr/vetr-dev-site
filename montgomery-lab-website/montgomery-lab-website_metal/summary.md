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
- On desktop, the amp controls become a wide fixed left-margin MIDI/amp rack styled like a physical control surface, while the main stage remains centered beneath the ticket; narrower screens keep the controls inline to avoid covering content.
- The MIDI rack loads a page-associated lab song, exposes beveled play/pause/prev/next hardware-style buttons, a page-track toggle, a hidden full playlist dropdown, and a smoked-glass waveform display, but never starts playback until the user presses play.
- Partner-program logos are rendered directly on large transparent full-width card headers with glow instead of white tiles, and the partner grid uses a two-column layout on desktop so wide logos have room.
- Background rune labels include science terms and consortium names, drifting upward from off-screen bottom to off-screen top so visible loop resets are avoided.
- Content remains static and local-first so the site can be served with a simple static server while still feeling interactive through JavaScript-rendered panels and effects.
