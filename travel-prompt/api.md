# Travel Prompt

The browser and CLI compose a plain-text request for the user's preferred chat assistant. Open `/travel-prompt/` from a local HTTP server serving the site root. Choose a workflow, fill in the request, then copy or share the preview. The app does not call a chat, mapping, or booking API.

Use `window.TravelPrompt.submit(request)`, import `submit` from `core/prompt.mjs`, or run `node travel-prompt/cli.mjs request.json`. The CLI accepts JSON from stdin when invoked without a file and prints one JSON result. Unknown fields and invalid values raise `invalid_request` with an issues array containing the offending field path. CLI exit status 1 indicates invalid input and 2 indicates a usage or file error.

## Example

```json
{
  "mode": "lodging",
  "place": "Kyoto Station",
  "checkIn": "2027-04-11",
  "checkOut": "2027-04-14",
  "budget": "JPY 60,000",
  "budgetBasis": "stay",
  "roomCount": 1,
  "adults": 2,
  "children": 1,
  "childAges": [4],
  "party": "group",
  "people": [
    {"name": "Alex", "access": "Step-free entrance"},
    {"name": "Sam", "preferences": {"quiet": 2}}
  ],
  "room": "Twin beds plus a child's bed",
  "results": 3
}
```

The result has a `mode` and a printable `prompt` string. This example compares three properties near Kyoto Station for a three-night stay with two adults and a four-year-old sharing one room. The spending limit covers the whole stay. The two named travelers supply their own preferences.

## Request fields

Fields are optional. Omitting `mode` gives a restaurant request for one person. Missing dates and location remain unknown. A menu request without images or menu text asks the assistant to request them.

| Field | Allowed values or meaning |
| --- | --- |
| `mode` | `restaurant`, `menu`, `lodging`, `outing` |
| `party`, `people` | `solo` with one traveler (default), or `group` with two or more travelers |
| `ordering` | `separate` or `shared` for group dining |
| `place`, `coordinates` | Place or landmark text, optionally with `{"latitude":35.0,"longitude":135.8}` |
| `shortlist` | Text with names or links to existing candidates. Restaurant, lodging and outing modes limit research to these places when supplied. |
| `budget`, `flexibility` | Amount and currency per person (for all rooms in lodging), and any spending flexibility |
| `travel`, `travelTime` | Array containing any of `Walk`, `Public transit`, `Bicycle`, `Car or rideshare`, and a text time limit |
| `timing`, `needs`, `notes` | Time constraints, current requirements, and one-time free text |
| `results` | Integer from 1 to 10, default 3 |
| `hunger`, `focus` | Appetite/occasion text for food, and menu focus of `Food and drinks`, `Food` or `Drinks` |
| `menuText`, `photoCount` | Text from the menu and a nonnegative integer counting menu images the user will attach |
| `checkIn`, `checkOut` | ISO dates for lodging, with departure after arrival |
| `budgetBasis` | Lodging budget period, either `night` (default) or `stay`. Applies to the entire booking. |
| `adults`, `children`, `roomCount` | Optional integer booking counts. Adults and children can be zero, rooms must be positive. Omit a count or supply `null` to leave it unspecified. Named preference profiles can cover a subset of the guests. |
| `childAges` | Optional list of ages at check-in, in whole years from 0 to 17. Include as many ages as you wish, up to the number of children when specified. |
| `room`, `property` | Room configuration and property type text |
| `visitDate`, `visitLength` | Outing date in YYYY-MM-DD format and total available time including travel, e.g. `90 minutes`. Use `timing` for the time window or return deadline. |

Each traveler accepts `name`, `diet`, `allergies`, `foodNotes`, `stayNeeds`, `outingNotes` and `access` as text. When a diet is supplied, `venue` distinguishes an accommodating venue (`any`) from a dedicated venue (`prefer` or `required`). `substitutions` can be `ask`, `fine`, or `listed`. Accessibility requirements apply across workflows. Each prompt includes personal interests and preferences for its own workflow.

The `preferences` object assigns integer scores from −2 (strongly avoid) to +2 (strongly prefer). Zero is neutral. Food keys are `regional`, `adventurous`, `spice`, `bitter`, `sweet`, `hoppy`, `alcohol`. Lodging keys are `quiet`, `transit`, `kitchen`, `aircon`, `walkability`, `breakfast`, `character`. Outing keys are `museums`, `heritage`, `outdoors`, `markets`, `shows`, `tours`, `handsOn`. Group outing briefs ask for a shared activity, the interests it serves, and verification of access, tickets, opening times and travel against the available time.

## Browser data and handoff

The app stores named profiles locally only when saved or updated. A profile includes the solo/group setting, meal sharing choice and each traveler's usual needs and preferences. Subsequent edits apply to the current request until explicitly saved. A selected profile loads on the next visit. One-time notes, location, dates, guest counts, child ages, budgets and photos stay out of saved profiles. Mode-specific request drafts and menu photos last for the current page session.

Take or import photos, tap a thumbnail to read the page at full size, and replace or reorder pages. “Make one PDF” combines the pages locally in their displayed order, with each page retaining its aspect ratio. Changes to the photos invalidate the previous PDF. The app offers the system share sheet when this browser supports the payload. Receiving apps can handle text and images differently. The copy control, per-page download links, the PDF download, and direct assistant links let the user complete a handoff manually. Location is requested only by the GPS button. The browser needs permission and a secure context for location and system sharing.

Run `node --test travel-prompt/tests/*.test.mjs` for core checks and `node --test travel-prompt/tests/*.browser.mjs` for UI checks. The browser test accepts the site's `PLAYWRIGHT` and `BROWSER_ENGINE` settings.
