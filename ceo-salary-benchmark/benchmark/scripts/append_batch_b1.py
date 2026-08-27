from __future__ import annotations
import pandas as pd, numpy as np
from pathlib import Path
W=Path('/mnt/data/rp_ceo_expanded_benchmark_v2'); p=W/'data/form990_evidence_working.csv'
df=pd.read_csv(p); peer=pd.read_csv(W/'data/previous_160_peer_universe.csv').set_index('organization')

def add(name, **r):
 global df
 if name in set(df.organization): return
 m=peer.loc[name]
 row=dict(organization=name,ein=r.pop('ein'),source_wave='previous_expansion',peer_tier=m.provisional_tier,ea_affinity=m.ea_affinity_precomp,comparability_score=m.comparability_score,employee_count=m.employee_count,part_vii_related=0,schedule_j_base=np.nan,retrieved_at='2026-08-25',extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link',**r)
 row['cash_proxy']=row['part_vii_org']+row['part_vii_related']; row['total_proxy']=row['cash_proxy']+row['part_vii_other']
 row['official_irs_url']=f"https://apps.irs.gov/pub/epostcard/990/xml/{str(row['irs_object_id'])[:4]}/{row['irs_object_id']}_public.xml"
 row['propublica_url']=f"https://projects.propublica.org/nonprofits/organizations/{row['ein'].replace('-','')}"
 df=pd.concat([df,pd.DataFrame([row])],ignore_index=True)

add('Living Goods',ein='20-5010527',ceo_name='Elizabeth Ann Jarman',ceo_title='CEO/Officer',top_executive_basis='explicit CEO; 2024 filing excluded due CEO transition',tax_period_begin='2023-01-01',tax_period_end='2023-12-31',compensation_calendar_year=2023,filing_date='2024-11-14',irs_object_id='202433199349307518',part_vii_org=247500,part_vii_other=0,revenue=17489687,expenses=23722146,full_year_status='yes',founder_flag='no',structure_flag='delivery_hybrid_older_clean',analysis_status='primary_with_structure_flag',exclusion_reason='',notes='2024 had CEOs through September/from October; prior full-year observation used. Global health delivery hybrid.')
add('The Humane League',ein='04-3817491',ceo_name='Victoria Bond',ceo_title='President',top_executive_basis='top organization-wide executive; later filing has interim leadership',tax_period_begin='2024-01-01',tax_period_end='2024-12-31',compensation_calendar_year=2024,filing_date='2025-09-05',irs_object_id='202512489349301801',part_vii_org=223031,part_vii_other=23029,revenue=27934789,expenses=19963588,full_year_status='yes',founder_flag='no',structure_flag='campaign_advocacy_model',analysis_status='primary_with_structure_flag',exclusion_reason='',notes='Used 2024 because 2025 filing reflected interim president/executive leadership.')
add('Mercy For Animals',ein='54-2076145',ceo_name='Leah Garces',ceo_title='Chief Executive Officer',top_executive_basis='explicit CEO',tax_period_begin='2024-01-01',tax_period_end='2024-12-31',compensation_calendar_year=2024,filing_date='2025-08-13',irs_object_id='202502259349301135',part_vii_org=195079,part_vii_other=7282,revenue=23344663,expenses=23908480,full_year_status='yes',founder_flag='no',structure_flag='campaign_advocacy_model',analysis_status='primary_with_structure_flag',exclusion_reason='',notes='Animal advocacy/campaign model; included in broad topical sensitivity, not research-only view.')
df.to_csv(p,index=False)
print(len(df)); print(df.analysis_status.value_counts())
