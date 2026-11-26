# vetr.dev license

Copyright © 2025–2026 Nik Vetr. All rights reserved, except as granted below.

This repository is the source of the website at https://vetr.dev. Being able to read the source does not grant rights to reuse it. These terms cover the code, text, images and other content in this repository and on the site, apart from the exceptions listed at the end.

## What you may do

1. **Use the tools.** Anyone may use the tools on vetr.dev in a web browser, for any purpose. What you make with them (your crosswords, figures, name tags, prompts, palettes and so on) is yours, and you may use it however you like. A credit to vetr.dev is appreciated but not required for these results.

2. **Call the documented interfaces, with credit.** You may use the programmatic interfaces listed in [`llms.txt`](llms.txt) and described in each tool's `api.md`, whether you call them from the browser (`window.<Tool>.submit` and the documented exporters) or from the command-line scripts. You may keep a local copy of this repository for the purpose of running those scripts. This applies to personal, research and commercial work, including software and services that call the interfaces on behalf of their users.

   In return, credit vetr.dev wherever your users or readers would look for credits, such as the interface, documentation, an About page, or a paper's methods section. Name the tool and link it, for example:

   > Made with Crossword Generator from vetr.dev (https://vetr.dev/crossword/)

## What you may not do without written permission

- Copy, mirror, republish or redistribute this repository's source code or site content, in whole or in substantial part, or publish modified versions of it.
- Offer any of these tools, or a substantially similar copy of one, as your own hosted service or app.
- Crawl or bulk-download the site, or use its code or content to train or fine-tune machine-learning models. Fetching `llms.txt`, the `api.md` files and what a documented interface needs in order to run is fine.
- Remove or obscure the required credit.

For permissions, contact the author through https://github.com/NikVetr.

## No warranty

The tools, interfaces and content are provided "as is", without warranty of any kind, express or implied, including fitness for a particular purpose and non-infringement. The author is not liable for any claim, damages or other liability arising from their use. Check results that matter, especially statistical outputs and anything that will be printed, cut or published.

## Exceptions: parts under their own licenses

- **Third-party code, fonts and assets** keep their own licenses, recorded beside them: `shared/vendor/LICENSES.md`, `crossword/vendor/LICENSES.md`, `name-tags/vendor/LICENSES.md`, `photomosaic/vendor/LICENSES.md`, `message-collage/fonts/LICENSES.md`, `stan2r/vendor/` (including `elk/LICENSE.md` and `katex/LICENSE`), `stretch-snack/form-motion/CREDITS.md`, `pocket-language-guide/data/flags/LICENSE.txt`, and any other license or credits file inside a tool's folder.
- **Third-party data** keeps its source's terms, as documented with each dataset (for example MovieLens, Book-Crossing and the other sources described in `media-ratings/README.md` and the files it links).
- **Wanderwart content** under `pocket-language-guide/data/` is licensed under CC BY-SA 4.0, as described in `pocket-language-guide/LICENSE-DATA`.
- **autoCHAIR (`agendamatic/`) and the Wanderwart application code (`pocket-language-guide/`, apart from its data)** are licensed under the MIT License:

  > Copyright © 2026 Nik Vetr
  >
  > Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
  >
  > The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
  >
  > THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
