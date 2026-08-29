# Source-complete missing-compensation research handoff

This is a copy-ready prompt for a research agent. It reconciles the current app, the definitive EA-roster package, and the screened-109 package. The actual unresolved queue is **58 organizations**:

- 24 organizations already selected for the app but lacking a usable positive incumbent-compensation observation;
- 5 genuinely new screened-109 organizations still lacking comparable named-current-executive compensation; and
- 29 provisional directory additions that still need entity, scale, leadership, and compensation validation.

Seven cached Cause IQ pages contain promising filing-derived pay leads, but none of those figures should enter the benchmark until checked against the corresponding source-native return.

---

## BEGIN COPY-READY PROMPT

You are extending an audited nonprofit executive-compensation benchmark. Recover missing compensation and comparable organization metadata from source-native public records, and document negative results just as carefully as positive results. Compensation must never be used to decide whether an organization is eligible as a peer.

Work in a new directory:

`tmp/rp_missing_compensation_recovery/`

Do not modify the current app or validated datasets. Return a patch-ready directory and ZIP.

### Read these files first

Treat these files as the current audit state:

- `app-data.js`
- `benchmark/enrichment/ea_screened109_audit.md`
- `benchmark/enrichment/ea_roster_bundle_audit.md`
- `benchmark/enrichment/ea_screened109_candidate_review.csv`
- `benchmark/enrichment/ea_roster_candidate_review.csv`
- `benchmark/deliverables/expanded_reference_set.csv`
- `benchmark/deliverables/expanded_reference_set_144.csv`
- `benchmark/deliverables/validated_form990_compensation.csv`
- `benchmark/enrichment/ea_roster_validated_compensation.csv`
- `benchmark/enrichment/incumbent_compensation_updates.csv`
- `benchmark/deliverables/source_acquisition_manifest.csv`
- `benchmark/enrichment/missing_compensation_research_queue.csv`

Use `tmp/combined_reference_set_186_screened.csv` only for candidate discovery. It is a stale screening bridge, not a validated dataset containing 186 salary observations.

### Required research result for every organization

Return one entity-disposition row even when no compensation is publicly available. For each organization, establish:

1. candidate cohort and research priority;
2. canonical legal name, aliases/DBAs, jurisdiction, registry type and ID;
3. the exact entity employing the executive, including any fiscal sponsor, host, parent, affiliate, or trading subsidiary;
4. the named organization-wide executive, exact source-native title, start/end dates, hours/FTE, and whether the role is full-year, interim, transitional, co-leadership, founder-led, or unpaid;
5. fiscal/reporting period, compensation calendar year, source type, native currency, and source units;
6. every source-native compensation component described below;
7. filing-comparable total revenue/income, total expenses/expenditure, and employee/FTE count for the same period, preserving the exact definition of each measure;
8. homepage, mission/operating model, legal structure, location, and formal evidence relevant to EA relationship;
9. source-native URL, local filename, MIME type, byte length, SHA-256, retrieval timestamp, and exact page/table/row/XML locator for every numeric claim; and
10. a usable-point-observation decision and recommended `default`, `sensitivity`, `observed_only`, or `not_usable` disposition, with rationale.

Topic, EA relationship, structure, peer tier, and comparability score are separate analyst judgments. Retrieve and cite the underlying facts needed to code them, but do not copy provisional tiers or scores as externally verified facts and do not derive them from pay.

### Compensation extraction rules

For a U.S. Form 990, separately capture:

- Part VII filing-organization reportable compensation;
- Part VII related-organization reportable compensation;
- Part VII other compensation;
- Part VII cash proxy = organization + related organization;
- Part VII total proxy = cash proxy + other compensation;
- Schedule J organization and related-organization base compensation;
- bonus/incentive compensation;
- other reportable compensation;
- retirement/deferred compensation;
- nontaxable benefits; and
- Schedule J total compensation.

Also capture the exact name, title, organization and related-organization hours, former/current status, Form 990 Part I line 5 employees, line 12 revenue, and line 18 expenses. Verify Schedule J arithmetic and preserve any source-internal discrepancy instead of silently changing it. A Part VII figure is reportable cash compensation, not necessarily base salary. A missing Schedule J row remains null; never infer Schedule J base from Part VII.

For Form 990-EZ, preserve officer compensation, benefit-plan contributions, and expense-account/allowance amounts as distinct fields. For Form 990-PF, preserve its different field definitions. Do not relabel either as Schedule J.

For non-U.S. evidence, separately preserve salary, bonus, employer pension/retirement, benefits, total, band or upper bound, currency, and native units exactly as disclosed. Preserve local-language field labels and add an English gloss. Do not perform inflation adjustment or currency conversion in this research package.

When practical, extract every named Part VII or 990-EZ position into `all_reported_positions.csv`, not only the CEO, so the sources remain useful for other position benchmarks.

### Acceptance and rejection rules

Accept a positive point observation only when the source directly attributes the amount to a named organization-wide executive employed by the relevant legal entity during the stated period.

Never turn any of the following into an individual salary:

- aggregate payroll or staff costs;
- aggregate key-management compensation;
- a compensation band, range, or band midpoint;
- another officer's or contractor's pay;
- a budget, grant-database estimate, funds raised, grants made, or money moved;
- payroll divided by headcount;
- Glassdoor or another crowd-sourced estimate;
- compensation paid by an unresolved affiliate; or
- a partial-year amount annualized without explicit source support.

Retain transition, co-leader, and interim records as separate raw rows. Never sum, average, divide, or annualize them to manufacture a benchmark observation. Recruitment ranges belong only in a separate `recruitment` stream, never in incumbent compensation.

An explicit named zero is zero and should be labeled `validated_zero`; an absent row or disclosure is null. “No public named compensation found” is a legitimate result, but must be supported by a negative-search log. Use these controlled outcomes:

- `validated_positive_exact`
- `validated_zero`
- `recruitment_range_only`
- `censored_band_only`
- `aggregate_payroll_only`
- `partial_year_or_transition`
- `not_yet_filed`
- `no_public_named_compensation`
- `entity_boundary_unresolved`
- `manual_save_needed`

### Source hierarchy and preservation

Use source-native public records as evidence. ProPublica, Cause IQ, search results, and grant databases are discovery aids, not final compensation evidence when an original filing is retrievable.

- United States: identify returns through ProPublica/IRS TEOS, then preserve the original IRS XML or filing PDF.
- United Kingdom: Charity Commission for England and Wales, OSCR, or CCNI, plus Companies House and signed accounts.
- Germany: Unternehmensregister/Bundesanzeiger and signed annual/transparency reports.
- Denmark: CVR/Virk, the Danish Business Authority, and signed annual accounts.
- Switzerland: Zefix/cantonal registry plus audited accounts.
- Israel: Registrar of Associations/GuideStar Israel plus audited reports.
- Spain: the relevant association/foundation registry plus filed or audited accounts.
- Philippines: SEC Philippines and official audited statements.
- Kenya: the NGO/PBO registry and audited accounts.
- India and cross-border entities: MCA/FCRA records, audited accounts, and an explicit employer/entity map.
- Historical accounts or recruitment pages: the Internet Archive may establish a dated source, but preserve both the archived URL and original URL.

Archive every source under `sources/raw/`. For a scanned PDF, preserve the original plus an OCR sidecar and manually verify each extracted number against the page image. Record both PDF page and printed form/page where they differ.

If programmatic access fails, do not replace the source with a snippet. Add a row to `manual_save_requests.csv` with organization, direct clickable URL, document/year, proposed filename, expected fields, and exact access failure.

### Priority 0: 24 current app rows without usable positive pay

For each U.S. entity, begin at the linked ProPublica page, identify the IRS object ID, and retrieve the source-native XML/PDF. Inspect the newest return and up to three earlier returns when the newest return is a transition, explicit zero, or non-disclosure. Existing app scale values are leads to verify, not facts to copy.

1. **METR / Model Evaluation and Threat Research** — Tier A; EIN 99-1219864; start at https://projects.propublica.org/nonprofits/organizations/991219864. Cached discovery page: `benchmark/sources/native/manual_browser/src-peer-metr/Model Evaluation and Threat Research _ Covina, CA _ Cause IQ.html`. Current app lead: $8,234,524 expenses and 38 staff. Cause IQ displays Elizabeth Barnes, “CTO & CEO,” $172,737 and Emma Abele, “CEO & COO,” $190,395 for 2024. Determine whether they were true co-CEOs, their terms and hours, and exact Part VII/Schedule J components rather than choosing one arbitrarily.

2. **Center for Humane Technology** — Tier A; EIN 82-3492182; https://projects.propublica.org/nonprofits/organizations/823492182. Cached lead: `benchmark/sources/native/supporting/src-peer-center-for-humane-technology.html`. Current app lead: $5,807,076 expenses and 22 staff. Identify the organization-wide executive and reconcile the legal/employer entity before accepting pay.

3. **IDinsight** — Tier A; EIN 27-4933181; https://projects.propublica.org/nonprofits/organizations/274933181. Cached lead: `benchmark/sources/native/manual_browser/src-peer-idinsight/IDinsight USA _ San Francisco, CA _ Cause IQ.html`. Current app lead: $22,117,626 expenses and 36 staff. Cause IQ displays current CEO Rebecca Gong Sharp at $250,516 and interim CEO Esther Wang at $22,005. Resolve the filing year, transition, legal employer, full-year status, and exact components.

4. **Pure Earth** — Tier A; EIN 13-4075779; https://projects.propublica.org/nonprofits/organizations/134075779. Cached filing: `benchmark/sources/native/form990/202532809349302073_public.xml`; cached discovery page: `benchmark/sources/native/manual_browser/src-peer-pure-earth/Pure Earth _ New York, NY _ Cause IQ.html`. Current app lead: $6,837,260 expenses and 27 staff. The cached filing shows Andrew McCartor, President/CEO, $183,077 cash and $187,008 total, alongside former CEO Richard Fuller. Confirm Andrew's organization-wide scope and term and seek the first clean full-year post-transition return. Do not combine or annualize the two leaders.

5. **Physicians Committee for Responsible Medicine** — Tier A; EIN 52-1394893; https://projects.propublica.org/nonprofits/organizations/521394893. Cached filing: `benchmark/sources/native/form990/202630169349300803_public.xml`; cached discovery page: `benchmark/sources/native/manual_browser/src-peer-physicians-committee-for-responsible-medicine/Physicians Committee for Responsible Medicine (PCRM) _ Washington, DC _ Cause IQ.html`. Current app lead: $23,901,833 expenses and 110 staff. The filing reports President Neal D. Barnard at zero while other staff are paid. Confirm that he is the organization-wide executive, inspect related-organization pay/Schedule J and prior years, and then classify a genuine unpaid role if supported. Do not substitute a different officer.

6. **Legal Priorities Project / Institute for Law & AI** — Tier B; EIN 85-1024198; https://projects.propublica.org/nonprofits/organizations/851024198. Cached lead: `benchmark/sources/native/manual_browser/src-peer-legal-priorities-project/Institute for Law and Ai _ Boston, MA _ Cause IQ.html`. Current app lead: $2,055,293 expenses and 10 staff. Verify the current legal name, whether it files directly or through a host, the organization-wide executive, and the exact employer.

7. **Charter Cities Institute** — Tier B; EIN 82-3264419; https://projects.propublica.org/nonprofits/organizations/823264419. Cached lead: `benchmark/sources/native/supporting/src-peer-charter-cities-institute.html`. Current app lead: $2,680,500 expenses and 11 staff. Recover the named organization-wide executive and source-native components.

8. **Faunalytics** — Tier B; EIN 01-0686889; https://projects.propublica.org/nonprofits/organizations/010686889. Cached leads: `benchmark/sources/native/manual_browser/src-990-faunalytics/Faunalytics - Nonprofit Explorer - ProPublica.html` and `benchmark/sources/native/manual_browser/src-peer-faunalytics/Faunalytics _ San Diego, CA _ Cause IQ.html`. Current app lead: $1,239,663 expenses and 9 staff. Cause IQ displays Executive Director Brooke Haggerty at $92,853. Validate exact year, components, hours, title, and full-year status.

9. **One for the World** — Tier B; EIN 84-2124550; https://projects.propublica.org/nonprofits/organizations/842124550. Cached lead: `benchmark/sources/native/manual_browser/src-peer-one-for-the-world/One For The World _ New York, NY _ Cause IQ.html`. Current app lead: $2,188,287 expenses and 4 staff. Cause IQ displays current ED/trustee Frank Fredericks at $88,615 and former ED Jack Lewars at $100,536. Recover a clean current full-year observation and preserve the former leader separately.

10. **Vegan Outreach** — Tier B; EIN 86-0736818; https://projects.propublica.org/nonprofits/organizations/860736818. Cached lead: `benchmark/sources/native/supporting/src-peer-vegan-outreach.html`. Current app lead: $2,456,187 expenses and 22 staff. Identify the current organization-wide executive and exact filing components.

11. **Resolve to Save Lives** — Tier C; EIN 86-2254152; https://projects.propublica.org/nonprofits/organizations/862254152. Cached lead: `benchmark/sources/native/manual_browser/src-peer-resolve-to-save-lives/Resolve To Save Lives _ Alexandria, VA _ Cause IQ.html`. Current app lead: $65,415,547 expenses and 147 staff. CEO Tom Frieden is named without a displayed amount while COO pay is shown. Determine whether CEO compensation is paid through an affiliate or omitted; do not substitute COO pay.

12. **AI Objectives Institute** — Tier C; EIN 87-3870371; https://projects.propublica.org/nonprofits/organizations/873870371. Cached lead: `benchmark/sources/native/supporting/src-peer-ai-objectives-institute.html`. Current app lead: $1,106,174 expenses and 7 staff. Resolve the current organization-wide executive and source-native pay.

13. **Effective Institutions Project** — Tier C; EIN 93-2725003; https://projects.propublica.org/nonprofits/organizations/932725003. Cached lead: `benchmark/sources/native/supporting/src-peer-effective-institutions-project.html`. Current app lead: $727,915 expenses and 2 staff. Determine explicitly whether the project files independently or is fiscally sponsored, and identify the actual employer.

14. **Candid** — Tier C; EIN 13-1837418; https://projects.propublica.org/nonprofits/organizations/131837418. Cached lead: `benchmark/sources/native/supporting/src-peer-candid.html`. Current app lead: $41,312,473 expenses and 221 staff. Identify the organization-wide executive and exact components; preserve any transition rows separately.

15. **Generation Pledge** — Tier C; EIN 84-2787951; https://projects.propublica.org/nonprofits/organizations/842787951. Cached lead: `benchmark/sources/native/manual_browser/src-peer-generation-pledge/Generation Pledge _ Vauxhall, NJ _ Cause IQ.html`. Current app lead: $1,347,647 expenses and a filing-reported zero employees. Identify the current top executive and whether labor/pay resides in this entity, an affiliate, a sponsor, or contractors.

16. **Alliance to Feed the Earth in Disasters / ALLFED** — Tier C; EIN 83-1717756; https://projects.propublica.org/nonprofits/organizations/831717756. Cached lead: `benchmark/sources/native/supporting/src-peer-alliance-to-feed-the-earth-in-disasters.html`. Current app lead: $1,016,087 expenses and a filing-reported zero employees. Determine whether executive labor/pay sits in this entity, a sponsor, or a contractor relationship.

17. **New Harvest** — Tier C; EIN 20-1425438; https://projects.propublica.org/nonprofits/organizations/201425438. Cached lead: `benchmark/sources/native/supporting/src-peer-new-harvest.html`. Current app lead: $976,255 expenses and 3 staff. Identify the organization-wide executive and exact filing components.

18. **Nonhuman Rights Project** — Tier C; EIN 04-3289466; https://projects.propublica.org/nonprofits/organizations/043289466. Cached lead: `benchmark/sources/native/manual_browser/src-peer-nonhuman-rights-project/Nonhuman Rights Project _ Washington, DC _ Cause IQ.html`. Current app lead: $1,583,477 expenses and 11 staff. Cause IQ displays Executive Director Christopher Berry at $156,635. Validate the filing year, exact components, hours, and full-year status.

19. **Aquatic Life Institute** — Tier C; EIN 87-3020380; https://projects.propublica.org/nonprofits/organizations/873020380. Cached lead: `benchmark/sources/native/supporting/src-peer-aquatic-life-institute.html`. Current app lead: $733,250 expenses and 1 staff. Resolve leadership, employer, and any affiliate/fiscal-sponsor boundary before accepting pay.

20. **Farm Forward** — Tier C; EIN 26-1643614; https://projects.propublica.org/nonprofits/organizations/261643614. Cached lead: `benchmark/sources/native/supporting/src-peer-farm-forward.html`. Current app lead: $1,069,721 expenses and 9 staff. Identify the organization-wide executive and exact components.

21. **Public Library of Science / PLOS** — Tier C; EIN 68-0492065; https://projects.propublica.org/nonprofits/organizations/680492065. Cached lead: `benchmark/sources/native/manual_browser/src-peer-public-library-of-science/Public Library of Science (PLOS) _ Alhambra, CA _ Cause IQ.html`. Current app lead: $36,985,422 expenses and 236 staff. Cause IQ displays CEO Alison Mudditt at $502,639. Validate the exact filing year/components, hours, and current status.

22. **Sentience Institute** — Tier C; EIN 82-2537926; https://projects.propublica.org/nonprofits/organizations/822537926. Cached lead: `benchmark/sources/native/manual_browser/src-peer-sentience-institute/Sentience Institute _ New York, NY _ Cause IQ.html`. Current app lead: $164,090 expenses and 1 staff. Check the complete 990/990-EZ and whether leadership is paid, unpaid, or compensated through another entity.

23. **Center for AI Policy** — Tier C; EIN 93-2050941; https://projects.propublica.org/nonprofits/organizations/932050941. Cached lead: `benchmark/sources/native/supporting/src-peer-center-for-ai-policy.html`. Current app lead: $301,463 expenses and 1 staff. Establish current organization-wide leadership and exact employer/pay.

24. **High Impact Athletes** — Tier C; EIN 87-3955308; https://projects.propublica.org/nonprofits/organizations/873955308. Cached lead: `benchmark/sources/native/manual_browser/src-peer-high-impact-athletes/High Impact Athletes _ Lewes, DE _ Cause IQ.html`. Current app lead: $381,597 expenses and a filing-reported zero employees. Cause IQ displays founder/ED Marcus Daniell at $88,316 for 2023 while Hugo Inglis is Managing Director with no displayed amount. Establish current organization-wide leadership and return current and historical observations separately.

### Priority 1: five screened-109 additions still unresolved

25. **Epoch** — Tier A; EIN 99-4050541; https://projects.propublica.org/nonprofits/organizations/994050541. Additional leads: https://epoch.ai/latest/epoch-impact-report-2025, https://epoch.ai/about/team, and https://app.grantmaking.ai/orgs/058a27fc-14a7-4905-824b-fc902f106164. Its first public 990-EZ reports zero officer compensation. Find the first full-year post-separation filing or explicit official salary/transparency record for Jaime Sevilla. Verify the employer, compensation year, title/hours, audited expenses, and filing-comparable staff. Do not use Jaime's historical RP compensation or a grant-database budget proxy.

26. **GovAI** — Tier A; EIN 99-4000294; https://projects.propublica.org/nonprofits/organizations/994000294. Additional leads: https://cdn.governance.ai/GovAI_Annual_Report_2025.pdf, https://www.governance.ai/about-us, and https://www.governance.ai/people. Map the U.S. and U.K. entities, identify Ben Garfinkel's actual employer, and recover a full-year current-director amount. The available U.S. filing's partial-year executive is not a substitute. Verify the provisional $11.9 million expense and 40-FTE claims from source-native records.

27. **AIM / Charity Entrepreneurship / Ambitious Impact** — Tier B; Charity Commission accounts: https://register-of-charities.charitycommission.gov.uk/en/charity-search/-/charity-details/5173268/accounts-and-annual-returns. Organization leads: https://www.charityentrepreneurship.com/about-us and https://www.ambitiousimpact.com/about. Resolve the legal name, charity/company numbers, and employer. Samantha Kagel became CEO in December 2025, so earlier accounts and transition-year aggregate remuneration are not her full-year pay. Seek the first full-year observation under her tenure, preserve any exact disclosed band as censored rather than point data, reconcile 11 filing employees against 19 website staff, and separate pass-through grant support from operating expenses.

28. **Sinergia Animal** — Tier B; existing report: https://www.sinergiaanimalinternational.org/_files/ugd/54f547_4279039cec6a45ac83c6c57e94222f1f.pdf; homepage: https://www.sinergiaanimalinternational.org/. Identify the legal entity employing Carolina Galvani and search that entity's audited accounts and regulator filings. The report's salary grades are not individual pay; $4.1 million is funds raised and 36 is hires, not audited expense and current staff. Recover named pay, audited expenses, and a same-period employee/FTE measure or document non-disclosure.

29. **Dansk Vegetarisk Forening** — Tier B; signed accounts: https://vegetarisk.dk/wp-content/uploads/2025/04/DVFaarsregnskab2025underskrevet.pdf; staff/organization leads: https://vegetarisk.dk/sekretariatet/ and https://vegetarisk.dk/om-dansk-vegetarisk-forening/. Resolve the CVR/legal entity through Virk, preserve DKK and native units, and search current/prior signed accounts for remuneration specifically attributable to Secretary General Rune-Christoffer Dragsdahl. Aggregate payroll and 27 employees cannot be converted into individual pay.

### Priority 2: 29 provisional directory additions

For every provisional addition, resolve the legal employer and validate the non-pay peer metadata before pursuing compensation. All 29 lack a positive, named, source-validated incumbent observation; 27 lack a validated legal identifier; 24 lack validated revenue; 22 lack validated expenses; and 21 lack a validated staff measure. Even populated provisional fields lack row-level source support and must be rechecked.

Tier A first:

30. **Global Change Data Lab / Our World in Data** — official employer/publisher explanation: https://ourworldindata.org/organization; official GCDL site: https://global-change-data-lab.org/; England and Wales charity 1186433; registry lead: https://register-of-charities.charitycommission.gov.uk/en/charity-search/-/charity-details/5140507/contact-information. Verify the legal entity/Companies House record, reporting year, the provisional £4.244 million income and £2.893 million expense values, employee/FTE count, current Executive Director, and any directly attributable executive-pay disclosure or band. Do not merge Oxford University staff or finances into GCDL.

31. **Lead Exposure Elimination Project** — https://leadelimination.org/. Verify the legal entity/registry and employer, co-CEO versus ED structure and terms, same-entity pay, provisional $13.3 million revenue, $4.9 million expenses, 43 staff, and the portion of expense consisting of grants.

Tier B next:

32. **Albert Schweitzer Foundation** — https://albertschweitzerfoundation.org/; Germany. Resolve the Stiftung/legal registry identity, source-native accounts, reporting year, revenue, expenses, provisional 30 staff, exact Executive Board membership, and any board remuneration.

33. **Forethought** — https://www.forethought.org/; United Kingdom. Resolve the current charity/company and any former fiscal host, first available source-native accounts, provisional 13 staff, CEO/Managing Director identity, employer, and pay/band.

34. **Fortify Health** — https://fortifyhealth.global/; India/international. Map every operating/host entity, identify the CEO's actual employer, and recover audited revenue, expenses, staff/FTE, and named pay without combining entities.

35. **Future Cleantech Architects** — https://fcarchitects.org/; Germany. Resolve the gGmbH/legal registry ID, Bundesanzeiger/company accounts, reporting year, revenue, expenses, staff, Managing Director/CEO identity, and remuneration.

36. **Opportunity Green** — https://opportunitygreen.org/; United Kingdom. Resolve company/charity numbers, source-native accounts, provisional 24 staff, current CEO/employer, and directly disclosed pay or band.

37. **Simon Institute for Longterm Governance** — https://www.simoninstitute.ch/; Switzerland. Resolve UID/legal form, audited accounts, reporting year, revenue, expenses, staff, Executive Director identity, employer, and remuneration.

38. **Social Change Lab** — https://www.socialchangelab.org/; United Kingdom. Resolve company/charity registration, accounts, expenses, staff, Executive Director identity, employer, and pay/band.

39. **Swift Centre for Applied Forecasting** — https://www.swiftcentre.org/; United Kingdom/international. Resolve legal identity/registry, accounts, expenses, staff, Executive Director identity, employer, and pay/band.

40. **Teaching at the Right Level Africa** — https://teachingattherightlevel.org/; Kenya. Resolve NGO/company registration and the CEO's employing entity; recover audited accounts, exact expense, staff/FTE, and named pay without mixing country entities.

41. **Unlimit Health / former SCI Foundation** — https://unlimithealth.org/; United Kingdom/Africa. Resolve charity/company identity, reporting period, current CEO/title/term, provisional £6.804 million income, £8.817 million expenses, 29 staff, and exact remuneration/band. Identify pass-through grants separately.

Tier C last:

42. **Action for Happiness** — https://www.actionforhappiness.org/; United Kingdom. Resolve charity/company identity, reporting period, provisional £426,265 income and £551,274 expenses, staff/FTE, current Chief Executive, and pay/band.

43. **Animal Advocacy Africa** — https://www.animaladvocacyafrica.org/; U.S. EIN 93-1669847; start at https://projects.propublica.org/nonprofits/organizations/931669847. Retrieve the native filing, exact staff, ED title/hours/pay, and operating expense separated from regrants. A preliminary later-filing lead suggests $173,506 rather than the unsupported $227,000 expense value and zero named-officer pay; validate both directly from the return.

44. **Animal Empathy Philippines** — https://animalempathy.ph/. Resolve SEC/legal registration, accounts, revenue, expenses, staff, organization-wide executive identity/title, employer, and pay.

45. **Animal Welfare Observatory** — https://observatoriodebienestaranimal.org/; Spain. Resolve the legal association/foundation and registry, accounts, scale, executive identity, employer, and remuneration.

46. **Apollo Academic Surveys** — https://www.apollosurveys.org/about/; United States. No EIN is validated and the provisional record claims one staff member. Locate the legal/fiscal host and filing first; then establish whether the Director is organization-wide and paid.

47. **Association for Long Term Existence and Resilience / ALTER** — https://alter.org.il/; Israel. Resolve association number, accounts, provisional four staff, Executive Director versus Chair governance, actual employer, and named pay.

48. **Center for Reducing Suffering** — https://centerforreducingsuffering.org/; Europe/remote. Resolve legal entity/host, jurisdiction/registry, accounts, staff, Executive Director identity/title, employer, and pay.

49. **Center for Space Governance** — https://www.spacegovernance.org/; United States/international. Find EIN/legal or fiscal host, filing/accounts, staff, Executive Director, actual employer, and named pay.

50. **Centre for Enabling EA Learning & Research / CEEALAR** — https://www.ceealar.org/learn-more; England and Wales charity 1189768. Use its Charity Commission accounts as the source/legal anchor. Verify the provisional £270,000 expense concept and year, staff/FTE, organization-wide leader, employer, and pay/band.

51. **Consultants for Impact / former Effective Altruism Consulting Network** — https://www.consultantsforimpact.org/about. The official page identifies Sarah Pomeranz as founder/CEO and confirms the former name. Discover the legal/fiscal entity, registry, accounts, scale/staff, and same-entity pay.

52. **Effective Altruism Coaching** — https://www.eacoaching.org/. Resolve legal/host entity, registry, accounts, staff, organization-wide leader, employer, and pay.

53. **Healthier Hens** — https://www.healthierhens.com/. Resolve the current legal/fiscal entity after incubation, accounts, scale/staff, Executive Director identity, employer, and same-entity pay.

54. **High Impact Professionals** — https://www.highimpactprofessionals.org/. Validate the provisional 1.6-FTE measure, legal/fiscal host, accounts/expense year, Executive Director identity, employer, and pay.

55. **Humane Slaughter Association** — https://www.hsa.org.uk/; United Kingdom. Resolve charity ID, accounts/year, provisional £495,156 revenue and £452,518 expenses, staff, CEO identity, employer, and pay/band.

56. **Organisation for the Prevention of Intense Suffering / OPIS** — https://www.preventsuffering.org/; Switzerland. Resolve UID/legal association, accounts, scale/staff, Director versus President governance, employer, and pay.

57. **Probably Good** — https://probablygood.org/; U.S. EIN 99-2361194; start at https://projects.propublica.org/nonprofits/organizations/992361194. A preliminary first-FY2024 filing lead reports $1 million revenue, zero expenses, zero employees, and zero officer compensation as operations began later. Validate the native filing, then look only for a newer return or source-native current salary disclosure; label any recruitment range separately.

58. **SoGive** — https://www.sogive.org/; United Kingdom. Resolve exact legal/fiscal entity, charity/company ID, accounts, scale/staff, Executive Director identity, employer, and pay/band.

### Optional metadata-only cleanup

Magnify Mentoring's compensation is already validated, but its Form 990-EZ does not contain a filing-comparable employee count. If another primary source reports a same-period employee/FTE measure with a clear definition, return it as a metadata-only result. Do not silently substitute website team count for Form 990 Part I line 5.

### Explicit repeat-research and deduplication guard

Do not re-research or add duplicate rows for already resolved cases: Institute for Women's Policy Research, Center for Law and Social Policy, Animal Equality, and Compassion in World Farming USA now have positive app observations despite being blank in the stale combined-186 CSV; Center for Election Science, Foresight Institute, Leverage Research, Qualia Research Institute, and Magnify Mentoring were separately source-validated; GiveWell and Copenhagen Consensus Center are already integrated as sensitivity observations; Sanku – Project Healthy Children is the same EIN/entity as Project Healthy Children and its current filing has already refreshed that row; Center for AI Safety has a corrected current filing observation.

Treat those as reconciliation checks only if encountered. Do not reacquire these existing native files:

- `benchmark/sources/native/form990/givewell_2024_form990.pdf`
- `benchmark/sources/native/form990/copenhagen_consensus_2024_form990.pdf`
- `benchmark/sources/native/form990/sanku_2024_form990.pdf`

### Required output package

Return all of the following:

1. `entity_resolution.csv` — one row per candidate/entity boundary;
2. `compensation_observations.csv` — one row per named executive-period;
3. `all_reported_positions.csv` — all source-reported positions from retrieved filings;
4. `organization_scale.csv` — filing-period revenue, expenses, staff, and exact definitions;
5. `classification_evidence.csv` — separate cited facts for topic/model, EA relationship, location/remote status, and structure;
6. `candidate_dispositions.csv` — one outcome row for each of the 58 candidates;
7. `source_manifest.csv` — one row per archived artifact;
8. `negative_evidence_log.csv` — registries, filing years, pages, search terms, and results checked;
9. `manual_save_requests.csv` — direct clickable URLs for anything blocked;
10. `methodology.md`;
11. `validation_report.md`;
12. `sources/raw/`; and
13. one ZIP containing the complete package.

At minimum, `compensation_observations.csv` must contain:

`candidate_group`, `research_priority`, `candidate_organization`, `canonical_organization`, `legal_entity`, `aliases`, `jurisdiction`, `registry_type`, `registry_id`, `ein`, `employer_entity`, `fiscal_sponsor_or_affiliate`, `executive_name`, `source_title`, `suggested_standardized_position`, `organization_hours`, `related_organization_hours`, `start_date`, `end_date`, `full_year_flag`, `interim_flag`, `transition_flag`, `co_leader_flag`, `founder_flag`, `return_or_document_type`, `reporting_period_start`, `reporting_period_end`, `compensation_calendar_year`, `currency`, `source_units`, `part_vii_organization`, `part_vii_related`, `part_vii_other`, `part_vii_cash_proxy`, `part_vii_total_proxy`, `schedule_j_base_organization`, `schedule_j_base_related`, `schedule_j_bonus_organization`, `schedule_j_bonus_related`, `schedule_j_other_reportable_organization`, `schedule_j_other_reportable_related`, `schedule_j_retirement_organization`, `schedule_j_retirement_related`, `schedule_j_nontaxable_organization`, `schedule_j_nontaxable_related`, `schedule_j_total`, `international_salary`, `international_bonus`, `international_pension`, `international_benefits`, `international_total`, `disclosed_band_lower`, `disclosed_band_upper`, `revenue`, `expenses`, `staff`, `staff_measure_definition`, `source_id`, `source_url`, `local_path`, `source_sha256`, `evidence_locator`, `outcome`, `usable_point_observation`, `recommended_disposition`, `reason`, `caveats`.

The validation report must:

- reconcile all compensation arithmetic;
- list duplicate legal entities, aliases, and unresolved employer boundaries;
- distinguish source-native evidence from navigation pages;
- reconcile provisional scale figures against source-native definitions;
- give entity-clean counts of positive, explicit-zero, transition-only, aggregate-only, band-only, not-yet-filed, manual-save-needed, and unresolved observations; and
- prove every negative conclusion by naming the registries, filing years, and pages checked.

Do not describe the result as “n = X salaries” unless X counts positive, named, entity-deduplicated compensation observations.

## END COPY-READY PROMPT
