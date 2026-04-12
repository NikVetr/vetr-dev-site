# Montgomery Lab Metal Site Design

## Intent

This third independent Montgomery Lab website should feel like a black-and-white heavy metal show poster, a backstage pass, and a molecular atlas fused into one interface. It should be loud, graphic, physical, and strange, but still usable for faculty, trainees, collaborators, and applicants who need real information about the lab.

The prior versions occupy two different identities:

- The first site: established, elegant, institutional, editorial.
- The biotech site: neon, hacker-like, terminal-driven, computational.
- This metal site: monochrome, jagged, high-contrast, poster-driven, amp-controlled, and molecularly theatrical.

## Visual System

The palette is intentionally limited:

- black, near-black, and charcoal as the base
- white and bone as the primary text tones
- brushed silver for borders, blades, rules, and dimensional panels
- ember orange/red only as an accent for flames, warnings, and active states

The Montgomery Lab metal logo is a primary artifact, not an accessory. The square `lab_logo-metal.jpg` can serve as the hero badge, while the monocolor SVG can be used as a watermark, background seal, or footer mark.

Typography should feel like a gig poster without becoming illegible. Large titles should be condensed, uppercase, sharpened with text-shadow, clipping, and skew rather than relying on a niche external font. Body copy should remain highly readable.

## Information Architecture

This should not use the previous top bar or biotech command dock. The core structure is a **setlist**:

- `01 / OVERTURE` = Home
- `02 / RIFFS` = Research
- `03 / VINYL` = Publications
- `04 / CREW` = Team
- `05 / TOUR` = Consortia
- `06 / GEAR` = Resources
- `07 / AUDITION` = Join
- `08 / ARCHIVE` = News
- `09 / SIGNAL` = Contact

Each HTML page is still a real, separate static page, but navigation appears as a torn paper setlist taped across the top of the stage rather than a traditional nav bar or a fixed side dock. The active page is written into a boxed “current song” area on the setlist, with the remaining tracks arranged in columns like a real pre-show set sheet.

## Signature Interaction

The metal-themed gimmick is an inline **Stage Rig**:

- It looks like a wide amplifier / pedalboard strip below the taped setlist.
- It contains a “now playing” readout for the current page.
- It has intensity buttons such as `clean`, `overdrive`, and `inferno`.
- It has page-aware “liner notes” that translate the metal metaphor back into science.
- It should update CSS variables rather than trigger expensive full-page rendering.

The stage rig gives the site a counterpart to the biotech terminal without copying its spatial logic: not a CLI and not a floating side widget, but a physical control surface integrated into the concert-stage layout. It reinforces lab science by mapping knobs to ideas like `signal gain`, `multi-omic mix`, and `variant distortion`.

## Motion

Motion should be more theatrical than the first site but cheaper and more stable than the biotech background:

- CSS-driven flame flicker using gradients and transforms.
- Slowly drifting chrome spikes and chain-like separators.
- Lightweight parallax on background layers only.
- Reveal animations for content blocks.
- Optional amp-intensity changes that alter glow, flame opacity, and background contrast.

Avoid animating layout-critical content. The visual energy should come from fixed/decorative layers and hover states, not from cards moving into each other.

## Page Treatment

Home should feel like the front of a tour poster: a taped setlist, a stage rig, a logo altar using the metal lab mark, a huge headline, one major photo, and four short proof points.

Research should be the “riff lab”: four engines framed as riffs or amplifiers, plus a signal chain from variant input to interpretation.

Publications should become a discography: recent Scholar feed as live releases, milestone papers as records, focus streams as genres.

Team should become the crew wall: PI feature, clickable current roster, headshot inspector, and alumni list.

Consortia should become the tour map: partner programs as venue badges/logos with roles and outputs.

Resources should become the gear table: public tools, project resources, portal layer, and practical guides.

Join should become auditions: what to send, who to contact, onboarding route, and expectations.

News should become an archive of tour dates / milestones.

Contact should become signal routing: email, phone, location, and official links.

## Technical Approach

- Static multipage site with dedicated HTML shells.
- Shared `js/content.js` model adapted from the biotech version for authenticity.
- Shared renderer in `js/app.js` with page-specific render functions kept simple.
- No framework and no build step.
- Local assets only.
- Keep performance stable by avoiding `backdrop-filter`, large JS animation loops, or layout-shifting parallax.

## Success Criteria

- It is clearly a third design, not a reskin of either prior site.
- It incorporates the existing heavy metal lab logo prominently.
- It contains the same substantive Montgomery Lab content categories as the other sites.
- It has a memorable metal-specific interaction model.
- It remains usable on desktop and mobile.
- It is visually bold without sacrificing readability.
