import pandas as pd
from pathlib import Path
p=Path('/mnt/data/rp_ceo_expanded_benchmark_v2/data/form990_evidence_working.csv')
df=pd.read_csv(p)
base=dict(source_wave='extension2',ea_affinity='EA-adjacent',schedule_j_base=None,employee_count=None,founder_flag='no',retrieved_at='2026-08-25')
rows=[]
def add(**k):
 d=base.copy(); d.update(k); d['cash_proxy']=d['part_vii_org']+d.get('part_vii_related',0); d['total_proxy']=d['cash_proxy']+d.get('part_vii_other',0); rows.append(d)
add(organization='Institute for Security and Technology',ein='47-5677755',peer_tier='Tier B weighted secondary',comparability_score=86,ceo_name='Philip Reiner',ceo_title='CEO',top_executive_basis='explicit CEO',tax_period_begin='2024-01-01',tax_period_end='2024-12-31',compensation_calendar_year=2024,filing_date='2025-11-17',irs_object_id='202523219349310552',official_irs_url='https://apps.irs.gov/pub/epostcard/990/xml/2025/202523219349310552_public.xml',propublica_url='https://projects.propublica.org/nonprofits/organizations/475677755',part_vii_org=324624,part_vii_related=0,part_vii_other=41801,revenue=3587978,expenses=4436894,full_year_status='yes',structure_flag='lower_edge_scale',analysis_status='primary',exclusion_reason=None,notes='Technology and security policy research/implementation organization; expenses near the lower edge of the expanded band.',extraction_location='ProPublica filing-derived table lines 21-90; IRS object ID from XML link')
add(organization='Quincy Institute for Responsible Statecraft',ein='84-2285143',peer_tier='Tier A expanded primary',comparability_score=91,ceo_name='Lora Lumpe',ceo_title='Chief Executive Officer',top_executive_basis='explicit CEO',tax_period_begin='2024-01-01',tax_period_end='2024-12-31',compensation_calendar_year=2024,filing_date='2025-11-12',irs_object_id='202523169349300137',official_irs_url='https://apps.irs.gov/pub/epostcard/990/xml/2025/202523169349300137_public.xml',propublica_url='https://projects.propublica.org/nonprofits/organizations/842285143',part_vii_org=287373,part_vii_related=0,part_vii_other=52655,revenue=5498898,expenses=7389743,full_year_status='yes',structure_flag='none',analysis_status='primary',exclusion_reason=None,notes='National foreign-policy research institute with close expense scale and explicit solo CEO.',extraction_location='ProPublica filing-derived table lines 21-89; IRS object ID from XML link')
add(organization='Center for New American Security',ein='20-8084828',peer_tier='Tier A expanded primary',comparability_score=86,ceo_name='Richard Fontaine',ceo_title='CEO',top_executive_basis='explicit CEO',tax_period_begin='2023-10-01',tax_period_end='2024-09-30',compensation_calendar_year=2023,filing_date='2025-08-20',irs_object_id='202542329349300819',official_irs_url='https://apps.irs.gov/pub/epostcard/990/xml/2025/202542329349300819_public.xml',propublica_url='https://projects.propublica.org/nonprofits/organizations/208084828',part_vii_org=777325,part_vii_related=0,part_vii_other=0,revenue=14063810,expenses=13803095,full_year_status='yes',structure_flag='none',analysis_status='primary',exclusion_reason=None,notes='National-security and technology-policy research institute; compensation calendar year 2023 because the fiscal year ended September 2024.',extraction_location='ProPublica filing-derived table lines 25-94; IRS object ID from XML link')
adddf=pd.DataFrame(rows)
for c in df.columns:
 if c not in adddf.columns: adddf[c]=None
adddf=adddf[df.columns]
for org in adddf.organization: df=df[~((df.organization==org)&(df.source_wave=='extension2'))]
out=pd.concat([df,adddf],ignore_index=True)
out.to_csv(p,index=False)
print(out.shape); print(out.analysis_status.value_counts())
