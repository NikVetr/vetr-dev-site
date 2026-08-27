#!/usr/bin/env python3
from __future__ import annotations
import html, json, math
from pathlib import Path
import pandas as pd
import mistune
from weasyprint import HTML

ROOT=Path(__file__).resolve().parents[1]
AN=ROOT/'analysis'; D=ROOT/'deliverables'; FROZEN=ROOT/'frozen'
STATS=json.loads((AN/'stats.json').read_text())
FORM=pd.read_csv(D/'form990_evidence.csv')
MAIN=FORM[FORM.primary_eligible==True].copy()
JOBS=pd.read_csv(D/'job_ad_evidence.csv')
QADS=JOBS[JOBS.included_in_quantitative_analysis.eq('yes')].copy()
SELECTED=pd.read_csv(D/'expanded_reference_set.csv')
SENS=pd.read_csv(AN/'summary_statistics.csv')
CAT=pd.read_csv(AN/'leave_category_out.csv')
LOO=pd.read_csv(AN/'leave_one_out_close_scale.csv')
LOG=pd.read_csv(D/'peer_inclusion_exclusion_log.csv')

EXT2_PROTOCOL_SHA=(FROZEN/'extension2_protocol_amendment.md.sha256').read_text().split()[0]
EXT2_UNIVERSE_SHA=(FROZEN/'combined_peer_universe_precomp.csv.sha256').read_text().split()[0]
EXT2_NEW_SHA=(FROZEN/'extension2_new_candidates_precomp.csv.sha256').read_text().split()[0]
EXT3_PROTOCOL_SHA=(FROZEN/'extension3_protocol_amendment.md.sha256').read_text().split()[0]
EXT3_UNIVERSE_SHA=(FROZEN/'combined_peer_universe_3wave_precomp.csv.sha256').read_text().split()[0]
EXT3_NEW_SHA=(FROZEN/'extension3_new_candidates_precomp.csv.sha256').read_text().split()[0]
LEGACY_BRIDGE_SHA=(FROZEN/'legacy_original_peer_bridge_precomp.csv.sha256').read_text().split()[0]

def m(x,nearest=1000):
    if x is None or pd.isna(x):return '-'
    y=round(float(x)/nearest)*nearest if nearest else float(x)
    return f'${y:,.0f}'
def k(x):
    if x is None or pd.isna(x): return '-'
    return f'${round(float(x)/1000):,.0f}K'
def cm(x):
    if x is None or pd.isna(x):return '-'
    x=float(x)
    return f'${x/1e6:.1f}M' if abs(x)>=1e6 else f'${x/1e3:.0f}K'
def esc(x): return html.escape(str(x if x is not None else ''))
def table(headers,rows,cls='compact'):
    h=''.join(f'<th>{esc(x)}</th>' for x in headers)
    body=''.join('<tr>'+''.join(f'<td>{esc(v)}</td>' for v in r)+'</tr>' for r in rows)
    return f'<table class="{cls}"><thead><tr>{h}</tr></thead><tbody>{body}</tbody></table>'

def stats_row(name):
    r=SENS[SENS['sample'].eq(name)].iloc[0]
    return [name.replace('_',' '),int(r.n),m(r.cash_q1),m(r.cash_median),m(r.cash_q3),m(r.cash_weighted_median),m(r.total_median)]

j=STATS['analyst_judgment']
sa=STATS['job_ads']; sf=STATS['form990']
NSEL=STATS['selected_reference_n']; NPRIMARY=STATS['primary_incumbent_n']; NCLEAN=STATS['structurally_clean_incumbent_n']
NTIERS=STATS['selected_tier_counts']
md=[]; add=md.append
add('<div class="cover">')
add('<div class="kicker">EXPANDED INDEPENDENT EXTERNAL COMPENSATION BENCHMARK</div>')
add('# Chief Executive Officer\n## Rethink Priorities')
add('<div class="cover-date">Rebenchmark as of August 17, 2026</div>')
add('<div class="cover-rule"></div>')
add(f'<div class="cover-callout"><strong>Expanded evidence base</strong><br><span class="big">{STATS["selected_reference_n"]} selected organizations</span><br>{NPRIMARY} primary-use incumbent observations ({NCLEAN} structurally clean) &nbsp; | &nbsp; {STATS["job_ads_current_quantitative_n"]} current recruitment ranges</div>')
add('<div class="decision-band"><strong>Advertise $250K-$340K base</strong><br>Expected hire $280K-$320K &nbsp; | &nbsp; Successful incumbent base $290K-$350K &nbsp; | &nbsp; Recurring total $340K-$435K</div>')
add('<div class="cover-foot">The original frozen benchmark remains visible as a baseline. These expansion waves are not blind to the original results; newly added candidates were frozen before systematic pay review. Not a legal opinion.</div>')
add('</div><div class="page-break"></div>')

add('# Executive findings')
add(table(['Decision use','Defensible 2026 range','Descriptive center','Interpretation'],[
 ['External recruitment posting','$250K-$340K base','$295K','Expected hire zone $280K-$320K'],
 ['Successful incumbent','$290K-$350K base','$320K','Judgment anchored between ads and filing cash proxies'],
 ['Recurring total compensation','$340K-$435K','$385K','Supported by filing total proxies; low-to-moderate confidence'],
], 'decision-table'))
add(f'The expanded exercise materially improves sample breadth without converting a public-record convenience sample into a population percentile. The documented universe of 452 unique organizations (450 expansion candidates plus two legacy-only original-protocol peers) produced **{NSEL} selected organizations**, **{NPRIMARY} primary-use incumbent observations** ({NCLEAN} structurally clean), and **{STATS["job_ads_current_quantitative_n"]}** current advertised salary ranges. The conclusions remain ranges rather than salary-to-the-dollar estimates.')
add('The forward-looking result remains led by the closest recruitment advertisements: their midpoint median is about **$251K**, while the broader 15-ad midpoint median falls to about **$216K** because it includes materially smaller and structurally different organizations. RP\'s international, distributed research organization; fundraising and board duties; and fiscal-sponsorship interface justify meaningful headroom above the observed close-peer midpoint.')
add(f'The incumbent filing evidence is much broader than before. The all-primary cash/W-2 proxy median is about **{k(sf["all_primary_eligible"]["cash"]["median"])}**; the structurally clean median is **{k(sf["structurally_clean"]["cash"]["median"])}**; Tier A and expense-matched medians are approximately **{k(sf["tier_A"]["cash"]["median"])}-{k(sf["expense_and_available_staff_match"]["cash"]["median"])}**. These are not exact base salaries. The selected incumbent-base center of $320K sits between the broad/clean and highest-comparability evidence without treating taxable bonuses or other W-2 compensation as salary.')
add(f'Total-proxy medians range from approximately **{k(sf["all_primary_eligible"]["total"]["median"])}** in the broad primary sample and **{k(sf["structurally_clean"]["total"]["median"])}** in the structurally clean sample to **{k(sf["tier_A"]["total"]["median"])}** in Tier A and **{k(sf["expense_and_available_staff_match"]["total"]["median"])}** in the expense/headcount-available match. The $340K-$435K planning range covers the central high-comparability evidence while leaving unusual, one-time, deferred, severance, and relocation items outside the recurring range.')

add('## What changed from the original nine-organization benchmark')
add(table(['Item','Original result','Expanded rebenchmark','Interpretation'],[
 ['Candidate/reference breadth','9 strict-primary organizations',f'{NSEL} selected organizations; 452-name documented universe','Much lower dependence on any single organization'],
 ['Incumbent evidence','6 strict filing peers',f'{NPRIMARY} primary-use filing observations ({NCLEAN} structurally clean)',f'Original $402K cash-proxy median falls to {k(sf["all_primary_eligible"]["cash"]["median"])} broad / {k(sf["tier_A"]["cash"]["median"])} Tier A'],
 ['Recruitment evidence','3 strict; 6 current expanded','3 strict; 5 close; 15 current expanded','Closest ad center remains near $251K'],
 ['Advertised range','$250K-$330K','$250K-$340K','Essentially stable; modestly more upper-end headroom'],
 ['Incumbent base','$285K-$340K','$290K-$350K','Center moves to $320K, near clean expanded filing evidence'],
 ['Recurring total','$335K-$435K','$340K-$435K','Center moves to $385K, near Tier A/close-scale total proxies'],
], 'compact'))

add('## Evidence at a glance')
add(table(['Evidence view','n','Cash/base center','Total center','Use'],[
 ['Strict current job ads',sa['strict_primary']['n'],m(sa['strict_primary']['median_midpoint']),'-','Closest forward-looking salary evidence'],
 ['Close title/scale job ads',sa['close_title_scale']['n'],m(sa['close_title_scale']['median_midpoint']),'-','Includes Dream.Org and Hagley as broader title/scale comparators'],
 ['Expanded current job ads',sa['expanded_current']['n'],m(sa['expanded_current']['median_midpoint']),'-','Shows effect of smaller/structurally different roles'],
 ['All primary filing observations',sf['all_primary_eligible']['n'],m(sf['all_primary_eligible']['cash']['median']),m(sf['all_primary_eligible']['total']['median']),'Broad incumbent evidence'],
 ['Structurally clean filings',sf['structurally_clean']['n'],m(sf['structurally_clean']['cash']['median']),m(sf['structurally_clean']['total']['median']),'Primary conservative center'],
 ['Tier A filings',sf['tier_A']['n'],m(sf['tier_A']['cash']['median']),m(sf['tier_A']['total']['median']),'Best overall function/scale/structure matches'],
 ['Expense + available-staff match',sf['expense_and_available_staff_match']['n'],m(sf['expense_and_available_staff_match']['cash']['median']),m(sf['expense_and_available_staff_match']['total']['median']),'Expenses $5M-$20M and no known staff contradiction'],
 ['Joint expense + known-staff match',sf['joint_expense_and_known_staff_match']['n'],m(sf['joint_expense_and_known_staff_match']['cash']['median']),m(sf['joint_expense_and_known_staff_match']['total']['median']),'Strictest scale view; smaller n'],
 ['Exact Schedule J base',STATS['schedule_j_exact_base_n'],'Not estimable','-','No exact-base observations; no imputation'],
], 'compact'))

add('# 1. Scope, independence, and completion status')
add('## Frozen sequencing')
add(f'The second and third expansion waves added **290 candidates** to the previous 160-name universe, producing **450 frozen expansion candidates**. Two original-protocol peers - Niskanen Center and Results for America - were not duplicated into those files, so the documented universe contains **452 unique organizations**. The second wave was frozen at `2026-08-25T16:07:55-0700`; the third at `2026-08-25T17:12:00-0700`. The final three-wave universe SHA-256 is `{EXT3_UNIVERSE_SHA}`. The two new-candidate files contain 145 organizations each and have SHA-256 values `{EXT2_NEW_SHA}` and `{EXT3_NEW_SHA}`.')
add('This phase is **not blind to the original benchmark**. The analyst had already seen the original nine-peer pay observations and prior recommendation. That exposure is disclosed rather than ignored. The new candidate names, tier rules, and pay-measure rules were frozen before systematic review of their compensation; compensation could not be used to add, remove, promote, demote, or reweight an organization.')
add('## Source and archive limitation')
add('<div class="warning"><strong>Official-source limitation.</strong> Each filing row records the EIN, tax period, filing date, IRS object ID, canonical IRS XML URL, ProPublica navigation URL, extraction location, and arithmetic. This environment could not reliably archive every complete source-native IRS XML/HTML file. The package therefore preserves hashed derivative snapshots and the complete extracted dataset, not a source-native copy of every return. Schedule J exact-base fields remain blank rather than imputed.</div>')
add(table(['Requirement','Result'],[
 ['Documented universe','452 unique organizations: 450 expansion candidates plus 2 legacy-only original peers'],['Selected quantitative reference set',f'{NSEL} organizations: {NTIERS.get("A",0)} Tier A, {NTIERS.get("B",0)} Tier B, {NTIERS.get("C",0)} Tier C'],['Primary-use incumbent observations',f'{NPRIMARY}; {NCLEAN} structurally clean'],['Current quantitative job advertisements','15; preregistered target reached'],['Exact filing base salary','0 observations'],['Offline reproducibility','Complete for archived derivative data and calculations'],], 'compact'))

add('# 2. RP role and scale anchor')
add('The public RP profile is unchanged from the original benchmark. RP is treated as a distributed knowledge-production nonprofit with research, evidence synthesis, commissioned advisory work, open-access outputs, operational support for special projects, fiscal sponsorship, and limited regranting. The primary scale anchor remains approximately **$7.5M of 2026 core budget, $9.3M of identified productive-use capacity, and roughly 45-57 core staff**. Consolidated expense is retained as a sensitivity because it contains material sponsored-project and pass-through activity. [SRC-RP-ABOUT; SRC-RP-2025-RESULTS; SRC-RP-FUNDING; SRC-RP-SPECIAL-PROJECTS]')
add(table(['Dimension','Role-profile treatment'],[
 ['CEO structure','Solo, full-time, organization-wide CEO'],['Core responsibilities','Research/strategy, fundraising, board partnership, culture/talent, operations integration, and external representation'],['Primary scale','$7.5M-$9.3M core operating anchor; roughly 45-57 staff'],['Consolidated sensitivity','Approximately $20.4M historical consolidated expense, not mechanically treated as core scale'],['Sponsored-project complexity','Material fiscal-sponsorship platform; complexity recognized without treating every pass-through dollar as core operations'],['Labor market','US national/remote knowledge-sector leadership, with high-cost-hub competition and international team complexity'],], 'profile-table'))

add('# 3. Expanded reference-set method')
add('The expanded reference set emphasizes functional similarity, operating scale, headcount, effective-altruism affinity, clean top-executive structure, and national labor-market relevance. Cause-area familiarity alone is not sufficient. Grantmaking-dominated, field-delivery-dominated, university-parent, fiscal-host, affiliate, co-CEO, interim, partial-year, and unclear-top-executive cases are either down-weighted, placed in Tier C, or excluded from primary compensation summaries.')
add(table(['Tier','Selected n','Rule of use'],[
 ['A',int((SELECTED.reference_tier=='A').sum()),'Strong function/scale/structure match; principal expanded peer tier'],
 ['B',int((SELECTED.reference_tier=='B').sum()),'Useful peer with one meaningful scale, model, geography, or structure deviation'],
 ['C',int((SELECTED.reference_tier=='C').sum()),'Broad robustness sensitivity; not allowed to dominate the headline'],
], 'compact'))
add(f'The selected {NSEL} organizations include **{NPRIMARY} with primary-use incumbent compensation observations**, of which **{NCLEAN} are structurally clean** under the preregistered classification. The remaining selected organizations still contribute to peer-definition and coverage analysis but are not silently assigned compensation. One observation per legal organization is used.')

add('<div class="landscape">')
add('## Selected reference set - representative row-level evidence')
rows=[]
for _,r in SELECTED.head(28).iterrows():
    rows.append([r.organization,r.reference_tier,r.ea_affinity,cm(r.expenses),'-' if pd.isna(r.employee_count) else int(r.employee_count),'-' if pd.isna(r.comparability_score) else int(round(r.comparability_score)),r.compensation_observation])
add(table(['Organization','Tier','EA affinity','Expenses','Staff','Score','Pay observation'],rows,'evidence-table'))
add(f'### Complete {NSEL}-organization selected set')
items=[]
for _,r in SELECTED.iterrows():
    score='-' if pd.isna(r.comparability_score) else str(int(round(r.comparability_score)))
    items.append(f"{r.organization} (Tier {r.reference_tier}, score {score})")
cols=3; n=(len(items)+cols-1)//cols
listing=[]
for i in range(n):
    listing.append([items[i] if i<len(items) else '', items[i+n] if i+n<len(items) else '', items[i+2*n] if i+2*n<len(items) else ''])
add(table(['Selected organization','Selected organization','Selected organization'],listing,'evidence-table tiny'))
add('</div>')

add('# 4. Current recruitment evidence')
add('Recruitment advertisements are the forward-looking evidence stream. They are analyzed separately from incumbent tax-return compensation. The close five-ad set has a midpoint median of approximately $251K. The full fifteen-ad set centers around $216K because it intentionally includes smaller, remote, fiscally sponsored, dual-entity, and other structurally broader comparisons.')
add('![](analysis/job_ad_ranges_expanded.png)')
add(table(['View','n','Observed envelope','Midpoint median','Range overlap'],[
 ['Strict primary',sa['strict_primary']['n'],f"{m(sa['strict_primary']['observed_min'])}-{m(sa['strict_primary']['observed_max'])}",m(sa['strict_primary']['median_midpoint']),'No exact CPI-adjusted overlap'],
 ['Close title/scale',sa['close_title_scale']['n'],f"{m(sa['close_title_scale']['observed_min'])}-{m(sa['close_title_scale']['observed_max'])}",m(sa['close_title_scale']['median_midpoint']),'No exact overlap'],
 ['Expanded current',sa['expanded_current']['n'],f"{m(sa['expanded_current']['observed_min'])}-{m(sa['expanded_current']['observed_max'])}",m(sa['expanded_current']['median_midpoint']),'No common overlap'],
], 'compact'))
add('<div class="landscape">')
rows=[]
for _,r in QADS.sort_values('adjusted_midpoint_jul2026',ascending=False).iterrows():
    rows.append([r.organization,r.role_title,str(r.posting_date),r.location,m(r.adjusted_min_jul2026),m(r.adjusted_max_jul2026),r.tier,r.source_id])
add(table(['Organization','Role','Posted','Location/mode','Jul-26 min','Jul-26 max','Tier','Source'],rows,'evidence-table'))
add('</div>')
add('The closest ads do not support treating the $340K posting ceiling as an observed median or percentile. It is deliberate search headroom for RP\'s broader role. The lower bound remains near the strict-ad center; the expected-hire zone is the portion of the range most consistent with current observable postings.')

add('# 5. Incumbent Form 990 evidence')
add('Part VII reportable compensation from the organization plus related organizations is treated as a **cash/W-2 proxy**, not exact base salary. Part VII other compensation is reported separately. Filing total proxy equals cash proxy plus Part VII other compensation where Schedule J total is unavailable. No uniform benefits percentage is used, and no base is reverse-engineered from total compensation.')
add('![](analysis/sensitivity_centers.png)')
rows=[stats_row(x) for x in ['all_primary_eligible','structurally_clean','tier_A','expense_and_available_staff_match','joint_expense_and_known_staff_match','EA_core_or_adjacent','functional_only','excluding_predeclared_unusual_structures']]
add(table(['Sample','n','Cash Q1','Cash median','Cash Q3','Weighted cash median','Total median'],rows,'stats-table'))
add(f'The largest systematic split is **EA adjacency versus functional-only peers**. EA-core/adjacent organizations center at roughly {k(sf["EA_core_or_adjacent"]["cash"]["median"])} cash proxy and {k(sf["EA_core_or_adjacent"]["total"]["median"])} total proxy, while functional-only research/policy/philanthropy-infrastructure organizations center at roughly {k(sf["functional_only"]["cash"]["median"])} and {k(sf["functional_only"]["total"]["median"])}. This is not interpreted causally: the groups also differ in age, geography, title mix, funding model, and organizational maturity.')
add('The close-scale leave-one-organization-out test is stable relative to the original six-filing sample: the cash median ranges only from approximately **$341K to $347K**, and the total median from **$380K to $388K**. The expansion substantially reduces dependence on any single filing.')
add('![](analysis/form990_expanded_upper_half.png)')

add('<div class="landscape">')
add('## Filing evidence - all primary observations')
rows=[]
for _,r in MAIN.sort_values(['tier_group','comparability_score','organization'],ascending=[True,False,True]).iterrows():
    rows.append([r.organization,r.ceo_title,int(r.compensation_calendar_year),cm(r.expenses),'-' if pd.isna(r.employee_count) else int(r.employee_count),m(r.cash_proxy_jul2026),m(r.part_vii_other_jul2026),m(r.total_proxy_jul2026),r.tier_group,r.structure_flag,r.source_id])
add(table(['Organization','Top role','Comp yr','Expenses','Staff','Cash proxy','Other','Total proxy','Tier','Flag','Source'],rows,'evidence-table tiny'))
add('</div>')

add('# 6. Sensitivity and uncertainty')
rows=[]
for _,r in CAT.iterrows(): rows.append([r.sensitivity,int(r.n),m(r.cash_median),m(r.total_median)])
add(table(['Sensitivity','n','Cash median','Total median'],rows,'compact'))
add('Key implications:')
add(f'- **Peer definition:** Broadening from Tier A to all primary observations lowers the cash center from about {k(sf["tier_A"]["cash"]["median"])} to {k(sf["all_primary_eligible"]["cash"]["median"])}. Smaller or more delivery-oriented organizations pull down the broad center.')
add('- **EA weighting:** Greater weight on EA-core/adjacent peers supports a lower center; stronger weight on title- and function-matched policy/research institutions supports a higher center.')
add('- **Scale:** Excluding organizations below $5M of expense raises the cash median to about $345K. Consolidated-scale comparisons should therefore affect the upper end more than the central estimate.')
add(f'- **Title:** CEO-titled observations center around {k(sf["CEO_title_match"]["cash"]["median"])} cash proxy versus about {k(sf["ED_or_President"]["cash"]["median"])} for ED/President observations. Title is correlated with organization maturity and scope and should not be treated as a pure title premium.')
add(f'- **Evidence type:** Close advertisements center at {k(sa["close_title_scale"]["median_midpoint"])} base; filing cash proxies center around {k(sf["all_primary_eligible"]["cash"]["median"])}-{k(sf["expense_and_available_staff_match"]["cash"]["median"])}; total proxies center around {k(sf["all_primary_eligible"]["total"]["median"])}-{k(sf["tier_A"]["total"]["median"])}. Pooling them would be a category error.')
add('- **Geography:** Public records do not permit a stable independent remote-versus-hub premium after controlling for role, scale, and topic.')

add('# 7. Direct decision answers')
add('## 1. What should RP advertise externally?')
add('**$250K-$340K annual base salary**, presented as a national, experience-sensitive range. The descriptive center is **$295K**, and the most likely offer zone is **$280K-$320K**. The upper end is search headroom, not an observed percentile.')
add('## 2. What base salary is defensible for a successful incumbent?')
add('**$290K-$350K**, with a descriptive center near **$320K**. The lower half is consistent with EA-adjacent and broad primary evidence; the upper half is more defensible for sustained organization-wide performance, fundraising, research quality, organizational health, and effective management of the core/sponsored-project interface.')
add('## 3. What recurring total compensation range is supported?')
add(f'**$340K-$435K**, centered descriptively around **$385K**, with low-to-moderate confidence. This is supported by the Tier A and expense/headcount-available total-proxy medians near {k(sf["tier_A"]["total"]["median"])} and {k(sf["expense_and_available_staff_match"]["total"]["median"])}, and the functional-only median near {k(sf["functional_only"]["total"]["median"])}. The strict joint expense-and-known-staff subset is lower and is reported separately. Exceptional incentives, one-time transition payments, severance, relocation, and unusual deferred compensation remain outside the recurring range.')
add('## 4. How sensitive is the conclusion?')
add('The posting recommendation is moderately sensitive to whether smaller/structurally different ads are included; the incumbent and total centers are highly sensitive to EA affinity, title mix, and scale band. The large expanded sample makes the result far less sensitive to any single organization, but it does not eliminate nonrandom peer selection or measurement differences.')
add('## 5. What cannot be estimated reliably?')
add('A precise population percentile; exact base salary from the filing sample; a stable geographic premium; the recurring bonus target; employer health and retirement cost; deferred-compensation value; candidate-specific scarcity or retention premiums; and a clean dollar value for RP\'s fiscal-sponsorship complexity cannot be estimated reliably from the public evidence.')

add('# 8. Quality control and reproducibility')
add('Run `./reproduce.sh` from the package root. It rebuilds normalized evidence, statistics, charts, the report, workbook, source manifest, hashes, and validation report from archived local inputs. Validation fails on missing required fields, inconsistent arithmetic, duplicate primary organization observations, checksum mismatch, or report/statistic mismatch.')
add(table(['Control','Validation'],[
 ['Candidate freezes','Verify both 145-name additions, the 450-name three-wave universe, and the original frozen legacy bridge'],['One observation per organization','Require unique organization in primary filing sample'],['Filing arithmetic','Cash = Part VII organization + related; total = cash + other'],['Cutoff','Require filing date no later than 2026-08-17 for primary observations'],['Measure separation','Exact base, cash proxy, other, and total remain distinct'],['Statistics','Independent validation recomputes counts, medians, quartiles, weights, and leave-one-out ranges'],['Artifacts','Manifest checks every local path, byte count, and SHA-256'],], 'compact'))

add('# Appendix A. Frozen files and hashes')
add(table(['Frozen artifact','SHA-256'],[
 ['extension2_protocol_amendment.md',EXT2_PROTOCOL_SHA],['extension2_new_candidates_precomp.csv',EXT2_NEW_SHA],['combined_peer_universe_precomp.csv',EXT2_UNIVERSE_SHA],
 ['extension3_protocol_amendment.md',EXT3_PROTOCOL_SHA],['extension3_new_candidates_precomp.csv',EXT3_NEW_SHA],['combined_peer_universe_3wave_precomp.csv',EXT3_UNIVERSE_SHA],
 ['legacy_original_peer_bridge_precomp.csv',LEGACY_BRIDGE_SHA],
], 'hash-table'))
add('# Appendix B. Definitions')
add(table(['Term','Meaning'],[
 ['Base salary','Annual fixed cash salary stated in a posting or separately disclosed in Schedule J'],['Cash/W-2 proxy','Part VII reportable compensation from organization plus related organizations; may include taxable bonus or other items'],['Other compensation','Part VII column F or separately disclosed deferred/nontaxable items'],['Filing total proxy','Cash/W-2 proxy plus Part VII other compensation when Schedule J total is unavailable'],['Market center','Descriptive decision anchor, not a population percentile'],['Core scale','Operating responsibility excluding separable sponsored-project/pass-through flows'],['Selected reference set','Organizations selected on frozen function, scale, headcount, EA affinity, structure, and geography criteria; not all have usable pay'],
], 'profile-table'))
add('---\n**Benchmark cutoff:** August 17, 2026. **Expansion freezes:** August 25, 2026. **No legal opinion.**')

text='\n\n'.join(md)
# Replace typographic dashes that can render inconsistently.
text=text.replace('–','-').replace('—','-')
out_md=D/'rp_ceo_expanded_rebenchmark_report.md'
out_md.write_text(text,encoding='utf-8')

css='''
@page { size: Letter; margin: 0.62in 0.62in 0.62in 0.62in; @bottom-right { content: counter(page); font-size: 8pt; color: #6b7785; } }
@page landscape { size: Letter landscape; margin: 0.42in; @bottom-right { content: counter(page); font-size: 7pt; color: #6b7785; } }
body { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 9.2pt; line-height: 1.42; color: #172333; }
h1 { color:#132d46; font-size: 20pt; margin: 0 0 10pt 0; page-break-after: avoid; }
h2 { color:#236778; font-size: 13pt; margin: 13pt 0 6pt 0; page-break-after: avoid; }
h3 { color:#236778; font-size: 10.5pt; margin: 9pt 0 4pt 0; page-break-after: avoid; }
p { margin: 0 0 7pt 0; }
ul { margin: 3pt 0 8pt 16pt; padding:0; } li { margin: 2pt 0; }
.cover { min-height: 9.1in; padding: 0.2in 0.15in 0 0.15in; position: relative; }
.kicker { color:#2f7180; font-size: 9pt; letter-spacing: 1.5px; font-weight:700; margin-top:0.35in; }
.cover h1 { font-size:30pt; margin-top:0.75in; margin-bottom:0; color:#102b44; }
.cover h2 { font-size:22pt; margin-top:0; color:#2f7180; }
.cover-date { margin-top:0.25in; color:#5f6d7a; font-size:12pt; }
.cover-rule { height:4px; background:#c27038; margin:0.4in 0; width:2.2in; }
.cover-callout { background:#e7f0f2; border-left:6px solid #2f7180; padding:18px 22px; margin-top:0.55in; font-size:12pt; }
.cover-callout .big { font-size:23pt; color:#102b44; font-weight:700; }
.decision-band { background:#f3eadf; border-left:6px solid #c27038; padding:15px 22px; margin-top:0.25in; font-size:11pt; }
.cover-foot { margin-top:0.28in; color:#6b7785; font-size:8.5pt; width:92%; line-height:1.35; }
.page-break { page-break-before: always; }
.landscape { page: landscape; page-break-before: always; page-break-after: always; }
.warning { background:#fff3df; border-left:5px solid #c27038; padding:10px 13px; margin:8px 0 12px 0; }
table { border-collapse: collapse; width:100%; margin:7pt 0 12pt 0; page-break-inside:auto; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th { background:#17324d; color:white; font-weight:700; text-align:left; padding:6px 7px; vertical-align:middle; }
td { border-bottom:0.5px solid #d8dfe4; padding:5px 7px; vertical-align:middle; }
tbody tr:nth-child(even) { background:#f5f8f9; }
.decision-table th { background:#1d5362; } .decision-table td:nth-child(2), .decision-table td:nth-child(3) { font-weight:700; color:#17324d; }
.compact { font-size:8.1pt; } .profile-table { font-size:8.4pt; } .stats-table { font-size:8pt; }
.evidence-table { font-size:6.8pt; line-height:1.16; } .tiny { font-size:5.75pt; line-height:1.05; }
.evidence-table th, .evidence-table td { padding:2px 3px; }
.hash-table { font-family: "DejaVu Sans Mono", monospace; font-size:7.2pt; }
img { max-width:100%; display:block; margin:10pt auto 5pt auto; }
code { font-family:"DejaVu Sans Mono", monospace; font-size:8pt; color:#17324d; }
hr { border:0; border-top:1px solid #ccd5db; margin:12pt 0; }
'''
html_body=mistune.html(text)
# Fix relative image paths from deliverables to analysis.
html_doc=f'<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body>{html_body}</body></html>'
HTML(string=html_doc,base_url=str(ROOT)).write_pdf(D/'rp_ceo_expanded_rebenchmark_report.pdf')
print(out_md)
