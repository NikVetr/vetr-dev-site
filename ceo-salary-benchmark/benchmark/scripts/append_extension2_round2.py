from __future__ import annotations

import math
from pathlib import Path
import pandas as pd
import numpy as np

W = Path('/mnt/data/rp_ceo_expanded_benchmark_v2')
p = W / 'data' / 'form990_evidence_working.csv'
df = pd.read_csv(p)

BASE = {
    'source_wave': 'extension2',
    'schedule_j_base': np.nan,
    'employee_count': np.nan,
    'retrieved_at': '2026-08-25',
}

rows: list[dict] = []

def add(**kw):
    r = BASE.copy()
    r.update(kw)
    r.setdefault('part_vii_related', 0.0)
    r.setdefault('part_vii_other', 0.0)
    if pd.notna(r.get('part_vii_org', np.nan)):
        r['cash_proxy'] = float(r['part_vii_org']) + float(r.get('part_vii_related', 0) or 0)
        r['total_proxy'] = r['cash_proxy'] + float(r.get('part_vii_other', 0) or 0)
    else:
        r['cash_proxy'] = np.nan
        r['total_proxy'] = np.nan
    oid = str(r.get('irs_object_id', '') or '')
    if oid:
        r['official_irs_url'] = f'https://apps.irs.gov/pub/epostcard/990/xml/{oid[:4]}/{oid}_public.xml'
    if r.get('ein'):
        r['propublica_url'] = f"https://projects.propublica.org/nonprofits/organizations/{str(r['ein']).replace('-', '')}"
    rows.append(r)

add(
    organization='Demos', ein='13-4105066', peer_tier='Tier A expanded primary', ea_affinity='EA-adjacent', comparability_score=91,
    ceo_name='Taifa Smith Butler', ceo_title='President', top_executive_basis='President is organization-wide top executive',
    tax_period_begin='2024-07-01', tax_period_end='2025-06-30', compensation_calendar_year=2024, filing_date='2025-11-11',
    irs_object_id='202503159349306085', part_vii_org=290800, part_vii_related=0, part_vii_other=57692,
    revenue=7617808, expenses=8584066, full_year_status='yes', founder_flag='no', structure_flag='none', analysis_status='primary', exclusion_reason='',
    notes='National research, policy, and ideas organization with close expense scale and organization-wide president.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn568175view0.'
)
add(
    organization='Vera Institute of Justice', ein='13-1941627', peer_tier='Tier C broad sensitivity', ea_affinity='functional-only', comparability_score=72,
    ceo_name='Nicholas Turner', ceo_title='President', top_executive_basis='President is organization-wide top executive',
    tax_period_begin='2024-07-01', tax_period_end='2025-06-30', compensation_calendar_year=2024, filing_date='2026-05-15',
    irs_object_id='202631359349314463', part_vii_org=596633, part_vii_related=0, part_vii_other=66532,
    revenue=40162188, expenses=50053981, full_year_status='yes', founder_flag='no', structure_flag='large_scale_and_implementation_mix', analysis_status='primary_with_structure_flag', exclusion_reason='',
    notes='Research and justice-policy institution but materially larger than RP and with extensive implementation activity.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn327197view0.'
)
add(
    organization='Center for Public Integrity', ein='54-1512177', peer_tier='Tier B weighted secondary', ea_affinity='EA-adjacent', comparability_score=84,
    ceo_name='Paul Cheung', ceo_title='Chief Executive Officer', top_executive_basis='Explicit CEO; latest filing excluded because of leadership transition',
    tax_period_begin='2023-01-01', tax_period_end='2023-12-31', compensation_calendar_year=2023, filing_date='2024-08-26',
    irs_object_id='202412399349300756', part_vii_org=306912, part_vii_related=0, part_vii_other=28061,
    revenue=3834099, expenses=6141454, full_year_status='yes', founder_flag='no', structure_flag='older_clean_due_transition', analysis_status='primary_older_clean', exclusion_reason='',
    notes='Prior clean full-year CEO observation used because the latest filing reflected a partial-year transition; no annualization.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn327197view1.'
)
add(
    organization='Brennan Center for Justice', ein='13-3839293', peer_tier='Tier C broad sensitivity', ea_affinity='functional-only', comparability_score=68,
    ceo_name='Michael Waldman', ceo_title='President', top_executive_basis='President alongside separately paid Executive Director',
    tax_period_begin='2024-07-01', tax_period_end='2025-06-30', compensation_calendar_year=2024, filing_date='2026-05-09',
    irs_object_id='202621289349303897', part_vii_org=650385, part_vii_related=0, part_vii_other=50231,
    revenue=73820955, expenses=58143269, full_year_status='yes', founder_flag='no', structure_flag='university_affiliate_dual_top_leadership_large_scale', analysis_status='structural_sensitivity', exclusion_reason='',
    notes='Large university-affiliated policy center with both a president and separately compensated executive director; not pooled in clean primary analysis.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn327197view2.'
)
add(
    organization='GivingTuesday', ein='84-2929872', peer_tier='Tier A expanded primary', ea_affinity='EA-adjacent', comparability_score=92,
    ceo_name='Asha Curran', ceo_title='Chief Executive Officer and President', top_executive_basis='Explicit CEO and President',
    tax_period_begin='2024-07-01', tax_period_end='2025-06-30', compensation_calendar_year=2024, filing_date='2026-05-01',
    irs_object_id='202601219349300720', part_vii_org=420352, part_vii_related=0, part_vii_other=42521,
    revenue=3656742, expenses=8638316, full_year_status='yes', founder_flag='yes', structure_flag='none', analysis_status='primary', exclusion_reason='',
    notes='Global generosity research, data, field-building, and movement-infrastructure organization with close expense scale.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn807748view0.'
)
add(
    organization='Institute for Nonprofit News', ein='27-2614911', peer_tier='Tier A expanded primary', ea_affinity='functional-only', comparability_score=87,
    ceo_name='Karen Rundlet', ceo_title='Chief Executive Officer', top_executive_basis='Explicit CEO',
    tax_period_begin='2024-01-01', tax_period_end='2024-12-31', compensation_calendar_year=2024, filing_date='2026-01-26',
    irs_object_id='202630269349301213', part_vii_org=214828, part_vii_related=0, part_vii_other=0,
    revenue=15594880, expenses=15663213, full_year_status='yes', founder_flag='no', structure_flag='membership_and_grant_support_mix', analysis_status='primary', exclusion_reason='',
    notes='National knowledge, standards, capacity-building, and network-infrastructure organization; some member-grant activity.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn807748view1.'
)
add(
    organization='Creative Commons', ein='04-3585301', peer_tier='Tier B weighted secondary', ea_affinity='EA-adjacent', comparability_score=88,
    ceo_name='Anna Tumadottir', ceo_title='Chief Executive Officer', top_executive_basis='Explicit CEO',
    tax_period_begin='2024-01-01', tax_period_end='2024-12-31', compensation_calendar_year=2024, filing_date='2025-11-13',
    irs_object_id='202543179349306294', part_vii_org=230000, part_vii_related=0, part_vii_other=24431,
    revenue=2439364, expenses=3912384, full_year_status='yes', founder_flag='no', structure_flag='below_primary_scale_global_network', analysis_status='primary', exclusion_reason='',
    notes='Open knowledge and digital public-goods organization; below RP core scale and operates through a global network.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn807748view2.'
)
add(
    organization='Sightline Institute', ein='52-1833599', peer_tier='Tier B weighted secondary', ea_affinity='functional-only', comparability_score=82,
    ceo_name='Alan Durning', ceo_title='Executive Director', top_executive_basis='Explicit Executive Director',
    tax_period_begin='2024-01-01', tax_period_end='2024-12-31', compensation_calendar_year=2024, filing_date='2025-08-12',
    irs_object_id='202522249349300332', part_vii_org=198548, part_vii_related=0, part_vii_other=29398,
    revenue=2520867, expenses=3249823, full_year_status='yes', founder_flag='yes', structure_flag='below_primary_scale_regional', analysis_status='primary', exclusion_reason='',
    notes='Research and policy institute with strong functional similarity but smaller and regionally focused.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn805570view0.'
)
add(
    organization='Clean Air Task Force', ein='04-3512550', peer_tier='Tier C broad sensitivity', ea_affinity='EA-adjacent', comparability_score=75,
    ceo_name='Armond Cohen', ceo_title='Executive Director', top_executive_basis='Explicit Executive Director',
    tax_period_begin='2024-01-01', tax_period_end='2024-12-31', compensation_calendar_year=2024, filing_date='2025-10-09',
    irs_object_id='202522829349300322', part_vii_org=350340, part_vii_related=0, part_vii_other=45275,
    revenue=50064607, expenses=40445925, full_year_status='yes', founder_flag='yes', structure_flag='above_primary_scale', analysis_status='primary_with_structure_flag', exclusion_reason='',
    notes='Highly relevant climate-policy and technical-research organization, but materially larger than RP.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn805570view1.'
)
add(
    organization='Sentient Media', ein='83-0804345', peer_tier='Tier C broad sensitivity', ea_affinity='EA-adjacent', comparability_score=69,
    ceo_name='Anna Bradley', ceo_title='Executive Director', top_executive_basis='Explicit Executive Director',
    tax_period_begin='2024-01-01', tax_period_end='2024-12-31', compensation_calendar_year=2024, filing_date='2025-10-09',
    irs_object_id='202512829349301726', part_vii_org=100000, part_vii_related=0, part_vii_other=0,
    revenue=2237457, expenses=1194078, full_year_status='yes', founder_flag='no', structure_flag='well_below_scale_media_model', analysis_status='primary_with_structure_flag', exclusion_reason='',
    notes='EA-adjacent animal and food-systems media organization, but far below RP scale and primarily journalistic.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn805570view2.'
)
add(
    organization='Project Healthy Children', ein='83-0396815', peer_tier='Tier B weighted secondary', ea_affinity='EA-adjacent', comparability_score=83,
    ceo_name='Felix Brooks-Church', ceo_title='President and Chief Executive Officer', top_executive_basis='Explicit CEO; older clean observation because latest filing did not identify CEO compensation',
    tax_period_begin='2022-10-01', tax_period_end='2023-09-30', compensation_calendar_year=2022, filing_date='2024-08-12',
    irs_object_id='202422259349302007', part_vii_org=97940, part_vii_related=0, part_vii_other=114549,
    revenue=6440940, expenses=9122441, full_year_status='yes', founder_flag='yes', structure_flag='unusually_high_other_compensation_older_clean', analysis_status='primary_older_clean', exclusion_reason='',
    notes='Close expense scale and EA-adjacent global-health work; very large other-compensation component requires separate treatment.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn805570view3.'
)
add(
    organization='Environmental Law Institute', ein='52-0901863', peer_tier='Tier A expanded primary', ea_affinity='functional-only', comparability_score=90,
    ceo_name='H. Jordan Diamond', ceo_title='President', top_executive_basis='President is organization-wide top executive',
    tax_period_begin='2024-01-01', tax_period_end='2024-12-31', compensation_calendar_year=2024, filing_date='2025-09-18',
    irs_object_id='202522619349300012', part_vii_org=300743, part_vii_related=0, part_vii_other=20344,
    revenue=7186072, expenses=8907598, full_year_status='yes', founder_flag='no', structure_flag='none', analysis_status='primary', exclusion_reason='',
    notes='Research, policy, education, and convening institute with close expense scale.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn481574view0.'
)
add(
    organization='Food Animal Concerns Trust', ein='36-3172605', peer_tier='Tier C broad sensitivity', ea_affinity='EA-adjacent', comparability_score=65,
    ceo_name='Harry Rhodes', ceo_title='Executive Director', top_executive_basis='Explicit Executive Director',
    tax_period_begin='2024-07-01', tax_period_end='2025-06-30', compensation_calendar_year=2024, filing_date='2026-01-14',
    irs_object_id='202620149349300022', part_vii_org=124934, part_vii_related=0, part_vii_other=0,
    revenue=901531, expenses=1058203, full_year_status='yes', founder_flag='no', structure_flag='well_below_scale', analysis_status='primary_with_structure_flag', exclusion_reason='',
    notes='EA-adjacent food-systems advocacy organization, but far below RP scale.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn491560view0.'
)
add(
    organization='Center for a Humane Economy', ein='83-2620507', peer_tier='Tier B weighted secondary', ea_affinity='EA-adjacent', comparability_score=76,
    ceo_name='', ceo_title='', top_executive_basis='No clean paid organization-wide CEO or Executive Director listed in accessible filing table',
    tax_period_begin='2023-11-01', tax_period_end='2024-10-31', compensation_calendar_year=2024, filing_date='2025-09-02',
    irs_object_id='202502459349301350', part_vii_org=np.nan, part_vii_related=np.nan, part_vii_other=np.nan,
    revenue=3869202, expenses=3205159, full_year_status='unknown', founder_flag='unknown', structure_flag='no_clean_top_executive_observation', analysis_status='excluded_measurement', exclusion_reason='No clean paid organization-wide CEO/ED observation in accessible filing table.',
    notes='Latest return listed compensated directors of philanthropy and policy rather than a clearly identified organization-wide CEO equivalent.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn491560view1.'
)
add(
    organization='Internet Security Research Group', ein='46-3344200', peer_tier='Tier A expanded primary', ea_affinity='EA-adjacent', comparability_score=91,
    ceo_name='Joshua Aas', ceo_title='Executive Director', top_executive_basis='Explicit Executive Director',
    tax_period_begin='2024-01-01', tax_period_end='2024-12-31', compensation_calendar_year=2024, filing_date='2025-07-07',
    irs_object_id='202501889349300640', part_vii_org=352850, part_vii_related=0, part_vii_other=44856,
    revenue=9563960, expenses=7925896, full_year_status='yes', founder_flag='yes', structure_flag='none', analysis_status='primary', exclusion_reason='',
    notes='Technical public-interest infrastructure nonprofit with close expense scale and distributed knowledge-work model.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn791228view0.'
)
add(
    organization='Arms Control Association', ein='23-7124588', peer_tier='Tier C broad sensitivity', ea_affinity='EA-adjacent', comparability_score=69,
    ceo_name='Daryl Kimball', ceo_title='Executive Director', top_executive_basis='Explicit Executive Director',
    tax_period_begin='2024-07-01', tax_period_end='2025-06-30', compensation_calendar_year=2024, filing_date='2026-05-14',
    irs_object_id='202621349349307892', part_vii_org=124630, part_vii_related=0, part_vii_other=51984,
    revenue=1490547, expenses=1689329, full_year_status='yes', founder_flag='no', structure_flag='well_below_scale', analysis_status='primary_with_structure_flag', exclusion_reason='',
    notes='Nuclear-risk and arms-control research/advocacy organization; topical relevance but far below RP scale.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn682727view0.'
)
add(
    organization='Physicians for Social Responsibility', ein='23-7059731', peer_tier='Tier C broad sensitivity', ea_affinity='EA-adjacent', comparability_score=68,
    ceo_name='Brian Campbell', ceo_title='Executive Director', top_executive_basis='Explicit Executive Director',
    tax_period_begin='2024-01-01', tax_period_end='2024-12-31', compensation_calendar_year=2024, filing_date='2025-10-01',
    irs_object_id='202512749349301461', part_vii_org=150000, part_vii_related=0, part_vii_other=3000,
    revenue=1615747, expenses=2180066, full_year_status='yes', founder_flag='no', structure_flag='well_below_scale_membership_advocacy', analysis_status='primary_with_structure_flag', exclusion_reason='',
    notes='Nuclear-risk and public-health advocacy organization; topical relevance but materially below RP scale.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn682727view1.'
)
add(
    organization='Center for AI and Digital Policy', ein='86-3350258', peer_tier='Tier C broad sensitivity', ea_affinity='EA-adjacent', comparability_score=61,
    ceo_name='Merve Hickok', ceo_title='President', top_executive_basis='President and separately compensated Executive Director',
    tax_period_begin='2025-01-01', tax_period_end='2025-12-31', compensation_calendar_year=2025, filing_date='2026-05-15',
    irs_object_id='202631359349302858', part_vii_org=90500, part_vii_related=0, part_vii_other=0,
    revenue=501578, expenses=656889, full_year_status='yes', founder_flag='no', structure_flag='dual_top_leadership_and_far_below_scale', analysis_status='structural_sensitivity', exclusion_reason='',
    notes='Highly relevant AI-policy topic, but far below scale and has both a paid president and paid executive director.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn681252view1.'
)
add(
    organization='Open Technology Fund', ein='84-3126447', peer_tier='Tier C broad sensitivity', ea_affinity='EA-adjacent', comparability_score=68,
    ceo_name='Laura Cunningham', ceo_title='President', top_executive_basis='President is organization-wide top executive',
    tax_period_begin='2023-10-01', tax_period_end='2024-09-30', compensation_calendar_year=2023, filing_date='2025-08-12',
    irs_object_id='202502249349302770', part_vii_org=231659, part_vii_related=0, part_vii_other=14821,
    revenue=50635708, expenses=50950076, full_year_status='yes', founder_flag='no', structure_flag='grantmaking_pass_through_and_large_scale', analysis_status='structural_sensitivity', exclusion_reason='',
    notes='Technology and internet-freedom mission is relevant, but the entity is grantmaking/pass-through-heavy and much larger than RP core scale.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn906101view0.'
)
add(
    organization='Institute for the Study of War', ein='26-0273675', peer_tier='Tier A expanded primary', ea_affinity='EA-adjacent', comparability_score=89,
    ceo_name='Kimberly Kagan', ceo_title='President', top_executive_basis='President is organization-wide top executive',
    tax_period_begin='2024-01-01', tax_period_end='2024-12-31', compensation_calendar_year=2024, filing_date='2025-10-17',
    irs_object_id='202502909349301720', part_vii_org=221040, part_vii_related=0, part_vii_other=8400,
    revenue=8244937, expenses=6699775, full_year_status='yes', founder_flag='yes', structure_flag='none', analysis_status='primary', exclusion_reason='',
    notes='Independent research institute with close scale and global-risk relevance.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn884541view0.'
)
add(
    organization='Ploughshares Fund', ein='94-2764520', peer_tier='Tier B weighted secondary', ea_affinity='EA-adjacent', comparability_score=76,
    ceo_name='Emma Belcher', ceo_title='President', top_executive_basis='President alongside separately compensated Executive Director',
    tax_period_begin='2024-07-01', tax_period_end='2025-06-30', compensation_calendar_year=2024, filing_date='2026-04-07',
    irs_object_id='202620979349300102', part_vii_org=402031, part_vii_related=0, part_vii_other=43205,
    revenue=5221356, expenses=7613345, full_year_status='yes', founder_flag='no', structure_flag='grantmaking_and_dual_top_leadership', analysis_status='structural_sensitivity', exclusion_reason='',
    notes='Close expense scale and global-risk relevance, but grantmaking/fund-distribution model and separate paid Executive Director preclude clean pooling.',
    extraction_location='ProPublica filing-derived table; official IRS object ID identified from XML link; browser source turn798240view0.'
)

new = pd.DataFrame(rows)
for c in df.columns:
    if c not in new.columns:
        new[c] = np.nan
new = new[df.columns]
existing = set(df['organization'].astype(str))
new = new[~new['organization'].astype(str).isin(existing)].copy()
out = pd.concat([df, new], ignore_index=True)
out.to_csv(p, index=False)
print(f'Appended {len(new)} rows; total {len(out)}')
print(out['analysis_status'].value_counts(dropna=False).to_string())
