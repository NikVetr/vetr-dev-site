from __future__ import annotations
from pathlib import Path
import pandas as pd

W=Path('/mnt/data/rp_ceo_expanded_benchmark_v2')
p=W/'data/job_ad_evidence_expanded.csv'
df=pd.read_csv(p, dtype=str, keep_default_na=False)
# Resolve the one vague-date CPI field conservatively at the July 2026 target (no adjustment).
df.loc[df['organization'].eq('Environmental Leadership Program') & df['cpi_period'].eq(''),'cpi_period']='2026-07'
df.loc[df['organization'].eq('Environmental Leadership Program'),'cpi_basis_note']='Exact posting month unavailable; July 2026 target used, producing no inflation adjustment.'
cols=df.columns.tolist()
rows=[]
def add(**kw):
    r={c:'' for c in cols}; r.update(kw); rows.append(r)

add(
 source_id='SRC-AD-ANDYHILL-2026', organization='Andy Hill Cancer Research Endowment (CARE) Fund', role_title='Executive Director',
 posting_date='2026-06-25', closing_date='2026-08-24', salary_min='220000', salary_max='250000', currency='USD', salary_is_base='yes',
 salary_text='$220,000-$250,000 depending on qualifications and experience', location='Bothell, Washington / statewide Washington', remote_status='Statewide remote/hybrid', geographic_restrictions='Must reside in Washington State',
 mission_operating_model='Public-private cancer-research endowment catalyzing research grants, innovation, and statewide research infrastructure.', annual_budget_or_expense='', scale_measure='grantmaking research endowment; operating scale not stated in posting', scale_year='2026', staff_count='',
 responsibilities='Enterprise strategy, research-grantmaking leadership, stakeholder and government relations, fundraising/partnerships, operations, staff, and board.', reporting_relationship='Board of Directors',
 original_url='https://careers.councilofnonprofits.org/jobs/executive-director-in-bothell-washington-us/', resolved_url='https://careers.councilofnonprofits.org/jobs/executive-director-in-bothell-washington-us/', retrieved_at='2026-08-25T16:45:00-0700', upstream_provenance='source-native nonprofit job board cached rendering', archive_path='sources/raw/src-ad-andyhill-2026.txt', tier='expanded_secondary_structural', included_in_quantitative_analysis='yes',
 inclusion_reason='Strong research-leadership and public-policy interface; retained as structural sensitivity because the operating model is research grantmaking/public-private rather than RP-like knowledge production.', exclusion_reason='', evidence_quality_notes='Full job-board content was available in search cache but the live page later redirected after expiry; cached facts and original URL preserved.', source_line_refs='turn341398search1; turn118965search8', cpi_period='2026-06', cpi_basis_note='Posting-month CPI.'
)
add(
 source_id='SRC-AD-GBWN-2026', organization='Great Basin Water Network', role_title='Executive Director', posting_date='2026-08-05', closing_date='2026-10-04', salary_min='110000', salary_max='120000', currency='USD', salary_is_base='yes', salary_text='$110,000-$120,000', location='Reno or Las Vegas, Nevada', remote_status='Remote with extensive travel', geographic_restrictions='Must be based in Reno or Las Vegas',
 mission_operating_model='Lean water-policy, conservation, research, science, education, litigation, and advocacy network.', annual_budget_or_expense='385034', scale_measure='FY2024 Form 990 expenses used only to characterize scale; posting states one full-time employee', scale_year='2024', staff_count='1',
 responsibilities='Chief executive, strategic leadership, public voice, fundraising, advocacy, coalition-building, organizational capacity, and board partnership.', reporting_relationship='Board of Directors',
 original_url='https://careers.councilofnonprofits.org/jobs/executive-director-in-reno-nevada-us/', resolved_url='https://careers.councilofnonprofits.org/jobs/executive-director-in-reno-nevada-us/', retrieved_at='2026-08-25T16:45:00-0700', upstream_provenance='source-native nonprofit job board', archive_path='sources/raw/src-ad-gbwn-2026.txt', tier='expanded_secondary_scale', included_in_quantitative_analysis='yes',
 inclusion_reason='Strong policy/research function and full executive scope, but one employee and sub-$0.5M expense scale; included only in broad scale sensitivity.', exclusion_reason='', evidence_quality_notes='Complete job-board copy. Posting explicitly identifies the ED as the sole full-time employee.', source_line_refs='turn596223view1 lines 18-45; scale corroboration turn341398search0', cpi_period='2026-07', cpi_basis_note='July 2026 target used because posting date is August 5 and July was the latest CPI available by the August 17 cutoff.'
)
add(
 source_id='SRC-AD-NJLCV-2026', organization='New Jersey League of Conservation Voters', role_title='Executive Director and Chief Executive Officer', posting_date='2026-06-23', closing_date='2026-08-22', salary_min='180000', salary_max='220000', currency='USD', salary_is_base='yes', salary_text='$180,000-$220,000', location='Trenton, New Jersey', remote_status='On-site/hybrid not consistently stated across copies', geographic_restrictions='New Jersey / Trenton leadership presence',
 mission_operating_model='Statewide environmental policy, advocacy, coalition leadership, electoral strategy, communications, and public engagement across a family of organizations.', annual_budget_or_expense='', scale_measure='not stated in accessible posting', scale_year='2026', staff_count='',
 responsibilities='Strategy, boards, staff and culture, fundraising, policy and political leadership, coalition-building, operations, and public representation.', reporting_relationship='Boards of the affiliated organizations',
 original_url='https://careers.councilofnonprofits.org/jobs/executive-director-and-chief-executive-officer-in-trenton-new-jersey-us/', resolved_url='https://careers.councilofnonprofits.org/jobs/executive-director-and-chief-executive-officer-in-trenton-new-jersey-us/', retrieved_at='2026-08-25T16:45:00-0700', upstream_provenance='source-native nonprofit job board cached rendering', archive_path='sources/raw/src-ad-njlcv-2026.txt', tier='expanded_secondary_structural', included_in_quantitative_analysis='yes',
 inclusion_reason='Title and policy-leadership match; retained as structural sensitivity because it leads a politically active family of affiliated entities and is state-focused.', exclusion_reason='', evidence_quality_notes='The live page expired after retrieval; cached job-board text and corroborating complete copies preserve the range and responsibilities.', source_line_refs='turn341398search4; turn341398search7; turn341398search11', cpi_period='2026-06', cpi_basis_note='Posting-month CPI.'
)
adddf=pd.DataFrame(rows,columns=cols)
existing=set(df['source_id'])
adddf=adddf[~adddf['source_id'].isin(existing)]
out=pd.concat([df,adddf],ignore_index=True)
out.to_csv(p,index=False)
for r in rows:
    path=W/r['archive_path']; path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('w',encoding='utf-8') as f:
        f.write('DERIVATIVE SOURCE SNAPSHOT\n')
        f.write('This is not source-native HTML/PDF. It preserves extracted facts and browser references used in the analysis.\n\n')
        for k,v in r.items(): f.write(f'{k}: {v}\n')
print('rows',len(out),'quantitative yes',sum(out.included_in_quantitative_analysis.eq('yes')))
