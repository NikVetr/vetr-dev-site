# GoodStructures non-CEO posting integration

This layer adds source-validated recruitment observations to existing non-CEO position benchmarks. GoodStructures was used for discovery and duplicate detection; each quantitative observation is supported by a preserved employer-authored page. Two records with spelling variants for the Institute for Law & AI and two observations of the same Center for AI Safety vacancy are each represented once.

Seven postings enter the app: one COO, three Chiefs of Staff, one Development Director, one Research Director, and one Senior Researcher. They remain a separate `Job posting` pay source. Their analytical point is the midpoint of the employer's annual USD range, and their source-native range remains visible. July 2026 adjustment uses the CPI-U index for the employer page's posting month. Missing posting-period expenses and staff remain null rather than being copied from a different Form 990 year. The Institute for Law & AI postings are joined to the existing Legal Priorities Project row because the preserved profile identifies the same EIN 85-1024198 and lists Institute for Law & AI as the current organization name.

The GiveWell page states $205,600 for most U.S. locations and $226,800 for New York City or the San Francisco Bay Area. The app therefore preserves $205,600–$226,800 as a location-dependent range; it does not repeat the GoodStructures lower endpoint as though it were a universal single salary.

The LEEP Chief of Staff record is archived but rejected from the quantitative app. The employer document labels the scraped example range as SGD and gives different ranges for India, Pakistan, and Thailand, while GoodStructures labels the extracted value USD. No conversion or midpoint is inferred from that inconsistent record.

The reviewed rows, decisions, source locators, and checksums are in `benchmark/enrichment/goodstructures_position_job_ad_review.csv`. Original pages are preserved under `benchmark/sources/native/job_ads/` and copied into `evidence/original/` by the app-data build.

## Second-highest disclosed employee ratio

The app also exposes `Second-highest eligible employee pay in the same filing` as a numeric axis variable. For each pay definition (Schedule J base, Part VII cash, and Part VII total), it ranks unique people within one source filing and selects rank two. Eligible people must have at least 30 combined reported weekly hours, functional or organization-wide scope, no former-officer flag, and no known compensation-year transition. Trustees-only and governance rows are excluded. The denominator is unavailable unless the same filing contains at least two eligible positive amounts under the selected pay definition.

This statistic is a rank among people the Form 990 discloses, not a claim that the filing lists the organization's complete payroll. The hover details show the selected person's name, title, and number of eligible disclosures in the filing.
