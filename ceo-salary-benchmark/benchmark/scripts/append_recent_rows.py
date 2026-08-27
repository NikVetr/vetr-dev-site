from __future__ import annotations
import pandas as pd, numpy as np
from pathlib import Path
W=Path('/mnt/data/rp_ceo_expanded_benchmark_v2')
p=W/'data/form990_evidence_working.csv'
df=pd.read_csv(p)
peer=pd.read_csv(W/'data/previous_160_peer_universe.csv')
lookup=peer.set_index('organization')

def meta(name):
    r=lookup.loc[name]
    return dict(source_wave='previous_expansion', peer_tier=r['provisional_tier'], ea_affinity=r['ea_affinity_precomp'], comparability_score=r['comparability_score'], employee_count=r['employee_count'])

def add(**r):
    if r['organization'] in set(df.organization):
        print('skip existing', r['organization']); return
    r={**meta(r['organization']), **r}
    r.setdefault('part_vii_related',0); r.setdefault('schedule_j_base',np.nan)
    r['cash_proxy']=r.get('part_vii_org',np.nan)+r.get('part_vii_related',0) if pd.notna(r.get('part_vii_org',np.nan)) else np.nan
    r['total_proxy']=r['cash_proxy']+r.get('part_vii_other',0) if pd.notna(r['cash_proxy']) else np.nan
    r['official_irs_url']=f"https://apps.irs.gov/pub/epostcard/990/xml/{str(r['irs_object_id'])[:4]}/{r['irs_object_id']}_public.xml" if r.get('irs_object_id') else ''
    r['propublica_url']=f"https://projects.propublica.org/nonprofits/organizations/{r['ein'].replace('-','')}"
    r.setdefault('retrieved_at','2026-08-25'); r.setdefault('extraction_location','ProPublica filing-derived table; official IRS object ID identified from XML link')
    globals()['df']=pd.concat([globals()['df'],pd.DataFrame([r])],ignore_index=True)

add(organization='Precision Development',ein='81-0779400',ceo_name='Owen Barder',ceo_title='Chief Executive Officer',top_executive_basis='explicit CEO; latest filing excluded due March 2024 departure',tax_period_begin='2023-01-01',tax_period_end='2023-12-31',compensation_calendar_year=2023,filing_date='2024-11-14',irs_object_id='202433199349302193',part_vii_org=224927,part_vii_other=22600,revenue=6178835,expenses=5234047,full_year_status='yes',founder_flag='no',structure_flag='older_clean_due_transition',analysis_status='primary_older_clean',exclusion_reason='',notes='2024 filing showed CEO until March 2024; prior full-year observation used without annualization.')
add(organization='Results for Development',ein='20-8530747',ceo_name='Gina Lagomarsino',ceo_title='President & CEO',top_executive_basis='explicit CEO',tax_period_begin='2024-01-01',tax_period_end='2024-12-31',compensation_calendar_year=2024,filing_date='2025-09-30',irs_object_id='202512739349302306',part_vii_org=384084,part_vii_other=13800,revenue=49137699,expenses=48542325,full_year_status='yes',founder_flag='no',structure_flag='above_primary_scale',analysis_status='primary_with_structure_flag',exclusion_reason='',notes='Above RP core scale; retained in broad and wider-scale sensitivities.')
add(organization='Animal Equality',ein='47-2420444',ceo_name='Sharon Maria Nunez Gough',ceo_title='President',top_executive_basis='US legal-entity president; multiple paid directors',tax_period_begin='2024-01-01',tax_period_end='2024-12-31',compensation_calendar_year=2024,filing_date='2025-10-27',irs_object_id='202533009349301263',part_vii_org=100966,part_vii_other=9893,revenue=4411463,expenses=5192778,full_year_status='yes',founder_flag='yes',structure_flag='international_affiliate_multiple_directors',analysis_status='structural_sensitivity',exclusion_reason='',notes='Not pooled in clean organization-wide CEO summaries because the US legal entity is part of a global structure and has multiple paid directors.')
add(organization='Last Mile Health',ein='26-1401736',ceo_name='Lisha McCormick',ceo_title='Chief Executive Officer',top_executive_basis='explicit CEO',tax_period_begin='2024-07-01',tax_period_end='2025-06-30',compensation_calendar_year=2024,filing_date='2026-05-15',irs_object_id='202631359349305343',part_vii_org=249008,part_vii_other=7164,revenue=21567118,expenses=26962344,full_year_status='yes',founder_flag='no',structure_flag='delivery_hybrid',analysis_status='primary_with_structure_flag',exclusion_reason='',notes='Global health delivery and systems-strengthening hybrid; retained outside research-only sensitivity.')
add(organization='StrongMinds',ein='46-2090059',ceo_name='Sean Mayberry',ceo_title='Chief Executive Officer',top_executive_basis='explicit CEO',tax_period_begin='2024-01-01',tax_period_end='2024-12-31',compensation_calendar_year=2024,filing_date='2025-06-20',irs_object_id='202511719349300036',part_vii_org=240015,part_vii_other=7453,revenue=9289461,expenses=9651790,full_year_status='yes',founder_flag='yes',structure_flag='delivery_hybrid',analysis_status='primary_with_structure_flag',exclusion_reason='',notes='Evidence-based direct-service model; retained in broad functional sensitivity.')
add(organization='Animal Legal Defense Fund',ein='94-2681680',ceo_name='Chris Green',ceo_title='Executive Director',top_executive_basis='explicit ED',tax_period_begin='2024-07-01',tax_period_end='2025-06-30',compensation_calendar_year=2024,filing_date='2026-05-04',irs_object_id='202631249349301878',part_vii_org=287102,part_vii_other=29811,revenue=19716926,expenses=17525202,full_year_status='yes',founder_flag='no',structure_flag='legal_advocacy_hybrid',analysis_status='primary_with_structure_flag',exclusion_reason='',notes='Legal advocacy/litigation is a material operating-model difference.')
add(organization='Exponent Philanthropy',ein='65-0617866',ceo_name='Paul Daugherty',ceo_title='Chief Executive Officer',top_executive_basis='explicit CEO',tax_period_begin='2025-01-01',tax_period_end='2025-12-31',compensation_calendar_year=2025,filing_date='2026-06-18',irs_object_id='202621699349300132',part_vii_org=297424,part_vii_other=53300,revenue=3267087,expenses=3343665,full_year_status='yes',founder_flag='no',structure_flag='below_primary_scale',analysis_status='primary',exclusion_reason='',notes='Below RP core scale but comparable national philanthropy-field infrastructure role.')
add(organization='Compassion in World Farming USA',ein='46-1822635',ceo_name='Benjamin Williamson',ceo_title='US Director',top_executive_basis='top US legal-entity executive; latest filing excluded due transition',tax_period_begin='2023-04-01',tax_period_end='2024-03-31',compensation_calendar_year=2023,filing_date='2024-09-24',irs_object_id='202402689349300735',part_vii_org=103049,part_vii_other=20358,revenue=2356610,expenses=2417841,full_year_status='yes',founder_flag='no',structure_flag='international_affiliate_older_clean',analysis_status='structural_sensitivity',exclusion_reason='',notes='US affiliate rather than global organization-wide CEO; prior clean year retained only as structural sensitivity.')

df.to_csv(p,index=False)
print('rows',len(df))
print(df.analysis_status.value_counts().to_string())
