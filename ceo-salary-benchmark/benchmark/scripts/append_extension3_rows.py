#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import pandas as pd
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'data' / 'form990_evidence_working.csv'
df = pd.read_csv(PATH)

retrieved = '2026-08-25'

def irs_url(object_id: str) -> str:
    return f'https://apps.irs.gov/pub/epostcard/990/xml/{object_id[:4]}/{object_id}_public.xml'

def row(
    organization, ein, peer_tier, ea_affinity, score, ceo_name, ceo_title,
    top_basis, tax_begin, tax_end, comp_year, filing_date, object_id,
    pp_url, org_comp, related, other, revenue, expenses, status='primary',
    full_year='yes', founder='no', structure='none', exclusion='', notes='',
    extraction=''
):
    cash = None if pd.isna(org_comp) else float(org_comp) + (0.0 if pd.isna(related) else float(related))
    total = None if cash is None else cash + (0.0 if pd.isna(other) else float(other))
    return {
        'organization': organization,
        'ein': ein,
        'source_wave': 'extension3',
        'peer_tier': peer_tier,
        'ea_affinity': ea_affinity,
        'comparability_score': score,
        'ceo_name': ceo_name,
        'ceo_title': ceo_title,
        'top_executive_basis': top_basis,
        'tax_period_begin': tax_begin,
        'tax_period_end': tax_end,
        'compensation_calendar_year': comp_year,
        'filing_date': filing_date,
        'irs_object_id': object_id,
        'official_irs_url': irs_url(object_id),
        'propublica_url': pp_url,
        'part_vii_org': org_comp,
        'part_vii_related': related,
        'part_vii_other': other,
        'cash_proxy': cash,
        'total_proxy': total,
        'schedule_j_base': np.nan,
        'revenue': revenue,
        'expenses': expenses,
        'employee_count': np.nan,
        'full_year_status': full_year,
        'founder_flag': founder,
        'structure_flag': structure,
        'analysis_status': status,
        'exclusion_reason': exclusion,
        'notes': notes,
        'retrieved_at': retrieved,
        'extraction_location': extraction,
    }

rows = [
    row('DataKind','46-4082076','Tier A expanded primary','EA-adjacent',92,
        'Lauren Woodman','Chief Executive Officer','Organization-wide CEO',
        '2024-10-01','2025-09-30',2024,'2026-04-03','202640939349300014',
        'https://projects.propublica.org/nonprofits/organizations/464082076',
        230000,0,11500,21931317,7005078,
        notes='Data-science technical-assistance and social-impact research organization; close operating expense scale. Revenue was temporarily much higher than expenses in this filing, so expenses anchor scale.',
        extraction='ProPublica filing-derived table and XML link; browser source turn933533view0 lines 21-89.'),
    row('ORCID','27-5142743','Tier A expanded primary','EA-adjacent',91,
        'Christian Shillum','Executive Director','Organization-wide Executive Director',
        '2024-01-01','2024-12-31',2024,'2025-06-25','202501769349301020',
        'https://projects.propublica.org/nonprofits/organizations/275142743',
        292165,0,26746,6811163,5803116,
        notes='Global open-science identity and research infrastructure membership nonprofit; close expense scale.',
        extraction='ProPublica filing-derived table and XML link; browser source turn933533view1 lines 22-90.'),
    row('OpenSecrets','52-1275227','Tier B weighted secondary','functional-only',84,
        'Hilary Braseth','Executive Director','Organization-wide Executive Director',
        '2025-01-01','2025-12-31',2025,'2026-07-15','202631979349301803',
        'https://projects.propublica.org/nonprofits/organizations/521275227',
        222497,0,12787,4281039,3374050,
        notes='Public-interest political data and research infrastructure; below Tier A expense band but strong functional match.',
        extraction='ProPublica filing-derived table and XML link; browser source turn933533view2 lines 21-89.'),
    row('MuckRock Foundation','81-1485228','Tier B weighted secondary','functional-only',82,
        'Michael Morisy','Executive Director','Organization-wide Executive Director in the most recent filing with a clean paid ED observation',
        '2023-01-01','2023-12-31',2023,'2024-11-06','202403119349300920',
        'https://projects.propublica.org/nonprofits/organizations/811485228',
        126234,0,0,3776685,3231701,status='primary_older_clean',
        structure='latest_filing_no_paid_ed_observation',
        notes='Open-government data and public-interest information infrastructure. The 2024 filing listed only unpaid officers; the prior 2023 full-year ED observation is retained as an explicitly older-clean sensitivity.',
        extraction='ProPublica filing-derived table and XML link; browser source turn933533view3 lines 92-163.'),
    row('NumFOCUS','45-4547709','Tier A expanded primary','EA-adjacent',89,
        'Leah Silen','Executive Director','Organization-wide Executive Director',
        '2024-01-01','2024-12-31',2024,'2025-10-24','202512979349301136',
        'https://projects.propublica.org/nonprofits/organizations/454547709',
        156845,0,7941,8376226,11090430,status='primary_with_structure_flag',
        structure='open_source_fiscal_sponsor_and_membership_model',
        notes='Open-source scientific-computing infrastructure and fiscal-sponsorship platform. Included in broad primary analysis but not the structurally clean subset.',
        extraction='ProPublica filing-derived table and XML link; browser source turn509907view0 lines 23-91.'),
    row('Software Freedom Conservancy','41-2203632','Tier B weighted secondary','EA-adjacent',85,
        'Karen M Sandler','President and Executive Director','Organization-wide President and Executive Director',
        '2024-03-01','2025-02-28',2024,'2026-01-16','202640169349300604',
        'https://projects.propublica.org/nonprofits/organizations/412203632',
        178851,0,62291,3214723,3805350,status='primary_with_structure_flag',
        structure='open_source_fiscal_sponsor_model',
        notes='Open-source public-interest organization and fiscal sponsor; below Tier A expense band. Other compensation is reported separately and not treated as base.',
        extraction='ProPublica filing-derived table and XML link; browser source turn509907view1 lines 21-89.'),
    row('Open Source Initiative','91-2037395','Tier C broad sensitivity','EA-adjacent',70,
        'Stefano Maffuli','Executive Director','Organization-wide Executive Director',
        '2024-01-01','2024-12-31',2024,'2025-11-03','202533079349301473',
        'https://projects.propublica.org/nonprofits/organizations/912037395',
        188678,0,0,1093077,1013797,status='primary_with_structure_flag',
        structure='well_below_scale_membership_governance',
        notes='Strong open-technology governance relevance but materially below RP scale; Tier C only.',
        extraction='ProPublica filing-derived table and XML link; browser source turn509907view2 lines 21-89.'),
    row('Grantmakers for Education','33-0919329','Tier B weighted secondary','functional-only',84,
        'Nicole R Leach','Executive Director','Organization-wide Executive Director',
        '2024-01-01','2024-12-31',2024,'2025-11-03','202543079349303299',
        'https://projects.propublica.org/nonprofits/organizations/330919329',
        235266,0,46749,3389406,3206947,
        notes='Philanthropy field-building, knowledge, and membership organization; below Tier A scale but functionally relevant.',
        extraction='ProPublica filing-derived table and XML link; browser source turn509907view3 lines 21-90.'),
    row('TechCongress','81-1839685','Tier B weighted secondary','EA-adjacent',87,
        'Travis Moore','Executive Director / Board Secretary','Organization-wide Executive Director; board president is unpaid',
        '2025-01-01','2025-12-31',2025,'2026-07-14','202621959349301032',
        'https://projects.propublica.org/nonprofits/organizations/811839685',
        257694,0,36211,7320089,3725264,
        notes='Technology-policy talent and capacity-building nonprofit; current filing is below Tier A expense band but has a national executive scope.',
        extraction='ProPublica filing-derived table and XML link; browser source turn568961view0 lines 21-89.'),
    row('Global Health Corps','80-0512336','Tier B weighted secondary','EA-adjacent',80,
        'Heather Anderson','Chief Executive Officer','Organization-wide CEO',
        '2024-08-01','2025-07-31',2024,'2026-01-13','202600139349300115',
        'https://projects.propublica.org/nonprofits/organizations/800512336',
        233774,0,8530,3224553,3112237,status='primary_with_structure_flag',
        structure='talent_fellowship_and_program_delivery_mix',
        notes='EA-adjacent global-health talent and field-building comparator; delivery model and smaller expense scale reduce weight.',
        extraction='ProPublica filing-derived table and XML link; browser source turn568961view1 lines 21-90.'),
    row('Economic Innovation Group','46-2450336','Tier B weighted secondary','functional-only',86,
        'John Lettieri','President and CEO','Organization-wide President and CEO',
        '2024-01-01','2024-12-31',2024,'2025-11-17','202513219349307891',
        'https://projects.propublica.org/nonprofits/organizations/462450336',
        479718,0,55589,5679893,5806034,status='primary_with_structure_flag',
        structure='501c4_and_first_class_travel_disclosed',
        notes='Economic-policy research organization and close-scale comparator. Retained despite high compensation under the no-pay-driven-removal rule; 501(c)(4) status and travel disclosure are labeled.',
        extraction='ProPublica filing-derived table and XML link; browser source turn518192view0 lines 29-100.'),
    row('Jain Family Institute','47-4407203','Tier A expanded primary','EA-adjacent',92,
        'Michael B Stynes','CEO and Director','Organization-wide CEO',
        '2024-01-01','2024-12-31',2024,'2025-11-18','202523219349327407',
        'https://projects.propublica.org/nonprofits/organizations/474407203',
        213500,0,40893,5330418,5374057,
        notes='Research, policy design, and evidence organization with close scale and strong functional relevance.',
        extraction='ProPublica filing-derived table and XML link; browser source turn518192view1 lines 21-89.'),
    row('Fresh Energy','41-1735501','Tier A expanded primary','functional-only',87,
        'Brenda Cassellius','Executive Director','Organization-wide Executive Director for the full 2024 compensation calendar year',
        '2024-02-01','2025-01-31',2024,'2025-11-12','202513169349301031',
        'https://projects.propublica.org/nonprofits/organizations/411735501',
        238121,0,22095,7134049,7006749,
        structure='departed_at_fiscal_year_end_after_full_compensation_year',
        notes='Climate and energy policy organization with close operating scale. Filing says ED served until Jan. 2025; the compensation convention is calendar 2024, during which she served throughout.',
        extraction='ProPublica filing-derived table and XML link; browser source turn497898view0 lines 21-89.'),
    row('Institute for Market Transformation','94-3241464','Tier A expanded primary','functional-only',88,
        'Alex Dews','CEO','CEO listed in filing, but prior filing listed another Executive Director and Alex Dews as Managing Director',
        '2024-01-01','2024-12-31',2024,'2025-10-09','202512829349300921',
        'https://projects.propublica.org/nonprofits/organizations/943241464',
        211550,0,22047,6537555,8135948,status='structural_sensitivity',
        full_year='unclear',structure='possible_role_transition_during_compensation_year',
        exclusion='Exact CEO start date was not established; excluded from primary rather than silently treating as full-year.',
        notes='Strong climate-policy and technical-assistance comparator, retained only as a labeled transition sensitivity.',
        extraction='ProPublica filing-derived table and prior-year comparison; browser source turn692537view0 lines 25-174.'),
    row('Project Drawdown','38-3705448','Tier A expanded primary','EA-adjacent',91,
        'Jonathan Foley','Executive Director','Organization-wide Executive Director',
        '2024-01-01','2024-12-31',2024,'2025-09-09','202512529349301621',
        'https://projects.propublica.org/nonprofits/organizations/383705448',
        417968,0,60392,8269185,4479322,
        notes='Climate research, synthesis, and communications organization; slightly below Tier A expense floor but very strong functional match and national scope.',
        extraction='ProPublica filing-derived table and XML link; browser source turn692537view1 lines 22-90.'),
    row('Energy for Growth Hub','83-1609680','Tier B weighted secondary','EA-adjacent',82,
        'Todd Moss','Executive Director','Organization-wide Executive Director',
        '2024-01-01','2024-12-31',2024,'2025-11-17','202513219349322806',
        'https://projects.propublica.org/nonprofits/organizations/831609680',
        420000,0,78616,2561222,2824520,
        notes='Global-development and energy-policy research organization; below RP scale but strong thematic and functional relevance. High observation retained under frozen rules.',
        extraction='ProPublica filing-derived table and XML link; browser source turn692537view2 lines 21-89.'),
    row('Better Food Foundation','81-4537521','Tier C broad sensitivity','EA-adjacent',69,
        'Jennifer Channin','Executive Director','Organization-wide Executive Director',
        '2024-01-01','2024-12-31',2024,'2025-11-13','202533169349305288',
        'https://projects.propublica.org/nonprofits/organizations/814537521',
        93250,0,4000,1677632,1787294,status='primary_with_structure_flag',
        structure='well_below_scale_food_system_strategy',
        notes='EA-adjacent food-system strategy comparator; materially below RP scale and included only in Tier C sensitivity.',
        extraction='ProPublica filing-derived table and XML link; browser source turn224604view0 lines 21-89.'),
]

# Preserve idempotence: replace only these third-wave organizations.
orgs = {r['organization'] for r in rows}
df = df[~df['organization'].isin(orgs)].copy()
add = pd.DataFrame(rows)
# Align to existing schema, allowing future columns to be added by normalization.
for c in df.columns:
    if c not in add.columns:
        add[c] = np.nan
for c in add.columns:
    if c not in df.columns:
        df[c] = np.nan
add = add[df.columns]
out = pd.concat([df, add], ignore_index=True)
out.to_csv(PATH, index=False)
print(f'Wrote {PATH}: {len(out)} rows ({len(rows)} extension3 additions)')
print(out['analysis_status'].value_counts().to_string())
