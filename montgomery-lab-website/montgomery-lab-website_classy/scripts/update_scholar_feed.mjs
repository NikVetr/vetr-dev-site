import { mkdir, writeFile } from "node:fs/promises";

const SOURCE_URL =
  "https://scholar.google.com/citations?hl=en&user=117h3CAAAAAJ&view_op=list_works&sortby=pubdate";
const OUTPUT_PATH = new URL("../assets/data/scholar-feed.json", import.meta.url);

const decodeHtml = (value) =>
  value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&#8230;/g, "...")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const absolutize = (href) => (href.startsWith("http") ? href : `https://scholar.google.com${href}`);

const response = await fetch(SOURCE_URL, {
  headers: {
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  },
});

if (!response.ok) {
  throw new Error(`Failed to fetch Google Scholar profile: ${response.status}`);
}

const html = await response.text();
const rows = [...html.matchAll(/<tr class="gsc_a_tr">([\s\S]*?)<\/tr>/g)].slice(0, 12);

const items = rows
  .map((match) => {
    const row = match[1];
    const titleMatch = row.match(/<a[^>]*href="([^"]+)"[^>]*class="gsc_a_at"[^>]*>([\s\S]*?)<\/a>/);
    const metaMatches = [...row.matchAll(/<div class="gs_gray">([\s\S]*?)<\/div>/g)].map((entry) => decodeHtml(entry[1]));
    const citeMatch = row.match(/class="gsc_a_ac gs_ibl">([^<]*)<\/a>/);
    const yearMatch = row.match(/class="gsc_a_h gsc_a_hc gs_ibl">(\d{4})<\/span>/);

    if (!titleMatch || !yearMatch) {
      return null;
    }

    return {
      title: decodeHtml(titleMatch[2]),
      href: absolutize(titleMatch[1]),
      authors: metaMatches[0] || "",
      venue: metaMatches[1] || "",
      year: yearMatch[1],
      citationCount: Number.parseInt((citeMatch?.[1] || "").trim(), 10) || null,
    };
  })
  .filter(Boolean);

const payload = {
  sourceUrl: SOURCE_URL,
  fetchedAt: new Date().toISOString(),
  items,
};

await mkdir(new URL("../assets/data/", import.meta.url), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Wrote ${items.length} Scholar entries to ${OUTPUT_PATH.pathname}`);
