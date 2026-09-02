#!/usr/bin/env python3
from __future__ import annotations
import json, math, re, hashlib
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'; ANALYSIS=ROOT/'analysis'; DELIV=ROOT/'deliverables'
ANALYSIS.mkdir(exist_ok=True); DELIV.mkdir(exist_ok=True)
TARGET_INDEX=333.918

# ---------- helpers ----------
def slug(s:str)->str:
    return re.sub(r'[^a-z0-9]+','-',str(s).lower()).strip('-')[:70]

def weighted_median(values, weights):
    d=pd.DataFrame({'v':values,'w':weights}).dropna().sort_values('v')
    if d.empty:return np.nan
    return float(d.loc[d.w.cumsum().ge(d.w.sum()/2).idxmax(),'v'])

def desc(x:pd.Series)->dict:
    x=pd.to_numeric(x,errors='coerce').dropna()
    if x.empty:return {'n':0,'min':None,'q1':None,'median':None,'q3':None,'max':None,'mean':None}
    return {'n':int(len(x)),'min':float(x.min()),'q1':float(x.quantile(.25)),'median':float(x.median()),'q3':float(x.quantile(.75)),'max':float(x.max()),'mean':float(x.mean())}

def weighted_desc(d:pd.DataFrame,col:str)->dict:
    out=desc(d[col])
    out['weighted_median']=weighted_median(d[col],d['analysis_weight']) if len(d) else None
    return out

def tier_group(x:str)->str:
    return 'A' if x in ('strict_primary','Tier A expanded primary') else ('B' if x in ('secondary','Tier B weighted secondary') else 'C')

def money_round(x,unit=1000):
    if x is None or (isinstance(x,float) and math.isnan(x)): return None
    return int(round(float(x)/unit)*unit)

# ---------- CPI ----------
cpi_path=DATA/'cpi_u.csv'
if not cpi_path.exists(): cpi_path=Path('/mnt/data/rp_original_full/rp_ceo_benchmark/data/cpi_u.csv')
cpi=pd.read_csv(cpi_path)
idx={str(r.period):float(r.index_value) for _,r in cpi.iterrows()}
for y in (2023,2024):
    vals=[v for k,v in idx.items() if k.startswith(f'{y}-') and k[-3:]!='AVG']
    idx[f'{y}-AVG']=sum(vals)/len(vals)
annual={2022:idx['2022-AVG'],2023:idx['2023-AVG'],2024:idx['2024-AVG'],2025:idx['2025-AVG'],2026:TARGET_INDEX}

# ---------- Form 990 ----------
f=pd.read_csv(DATA/'form990_evidence_working.csv')
prev=pd.read_csv(DATA/'previous_160_peer_universe.csv')
score_map=dict(zip(prev.organization,pd.to_numeric(prev.comparability_score,errors='coerce')))
score_map.update({'Niskanen Center':85.0,'Results for America':74.0})
for i,r in f.iterrows():
    if pd.isna(r.get('comparability_score')):
        f.loc[i,'comparability_score']=score_map.get(r.organization,80.0)
    source_val=r.get('source_id','')
    if pd.isna(source_val) or not str(source_val).strip() or str(source_val).strip().lower()=='nan':
        f.loc[i,'source_id']='SRC-990-EXT-'+slug(r.organization).upper()

for col in ['part_vii_org','part_vii_related','part_vii_other','cash_proxy','total_proxy','schedule_j_base','revenue','expenses','employee_count','comparability_score']:
    f[col]=pd.to_numeric(f[col],errors='coerce')

def adjust(row,col):
    val=row[col]
    yr=row['compensation_calendar_year']
    if pd.isna(val) or pd.isna(yr): return np.nan
    return float(val)*TARGET_INDEX/annual.get(int(yr),TARGET_INDEX)
for col in ['part_vii_org','part_vii_related','part_vii_other','cash_proxy','total_proxy','schedule_j_base']:
    f[col+'_jul2026']=f.apply(lambda r:adjust(r,col),axis=1)
f['cpi_factor']=f.apply(lambda r:TARGET_INDEX/annual.get(int(r.compensation_calendar_year),TARGET_INDEX) if pd.notna(r.compensation_calendar_year) else np.nan,axis=1)
f['tier_group']=f.peer_tier.map(tier_group)
f['source_id']=f['source_id'].fillna('').astype(str)
f['primary_eligible']=f.analysis_status.fillna('').str.startswith('primary')
f['structurally_clean']=f.analysis_status.isin(['primary','primary_older_clean'])
f['current_comp_year']=f.compensation_calendar_year.ge(2024)
f['close_expense']=f.expenses.between(5_000_000,20_000_000)
f['staff_known']=f.employee_count.notna()
f['staff_in_band']=f.employee_count.between(15,100)
# Continuity view: expense matched and no known staff contradiction. Missing staff is retained but disclosed.
f['close_scale']=f.close_expense & (~f.staff_known | f.staff_in_band)
f['joint_scale_known_staff']=f.close_expense & f.staff_known & f.staff_in_band
main=f[f.primary_eligible].copy()
mean_score=main.comparability_score.mean()
main['analysis_weight']=(main.comparability_score/mean_score).clip(.5,1.5)
f['analysis_weight']=np.nan
f.loc[main.index,'analysis_weight']=main.analysis_weight
f.to_csv(DELIV/'form990_evidence.csv',index=False)
main.to_csv(ANALYSIS/'form990_primary_normalized.csv',index=False)

# ---------- selected reference set ----------
oldsel=prev[prev.reference_membership.isin(['Expanded operating set (A+B)','Expanded broad sensitivity (C)'])].copy()
main_orgs=set(main.organization)
old_orgs=set(oldsel.organization)
new_orgs=sorted(main_orgs-old_orgs)
combined_freeze=pd.read_csv(ROOT/'frozen/combined_peer_universe_3wave_precomp.csv')
new_map=combined_freeze.drop_duplicates('organization',keep='last').set_index('organization').to_dict('index')
fmap=main.set_index('organization').to_dict('index')
legacy_bridge_names={'Niskanen Center','Results for America'}
records=[]
for _,r in oldsel.iterrows():
    pay=fmap.get(r.organization,{})
    tg='A' if str(r.provisional_tier).startswith('Tier A') else ('B' if str(r.provisional_tier).startswith('Tier B') else 'C')
    records.append({
        'organization':r.organization,'reference_tier':tg,'tier_label':r.provisional_tier,
        'selection_wave':'first expansion','topic_cluster':r.topic_cluster,'ea_affinity':r.ea_affinity_precomp,
        'country_or_region':r.country_or_region_precomp,'expected_structure':r.expected_structure_precomp,
        'ein':r.ein,'revenue':r.revenue,'expenses':r.expenses,'employee_count':r.employee_count,
        'comparability_score':r.comparability_score,'selection_status':'selected quantitative reference organization',
        'compensation_observation':'yes' if r.organization in main_orgs else 'not collected/clean observation unavailable',
        'cash_proxy_jul2026':pay.get('cash_proxy_jul2026',np.nan),'total_proxy_jul2026':pay.get('total_proxy_jul2026',np.nan),
        'ceo_title':pay.get('ceo_title',''),'compensation_year':pay.get('compensation_calendar_year',np.nan),
        'propublica_url':pay.get('propublica_url',''),'official_irs_url':pay.get('official_irs_url',''),
        'selection_note':'Selected under the first expansion protocol before systematic pay review.'
    })
for org in new_orgs:
    p=fmap[org]; meta=new_map.get(org,{})
    if org in legacy_bridge_names:
        selection_wave='original frozen protocol / legacy bridge'
        selection_note='Selected under the original frozen protocol before compensation review; retained as a legacy bridge observation.'
    elif str(p.get('source_wave',''))=='extension3':
        selection_wave='third expansion / filing verification'
        selection_note='Added by the third-expansion freeze and retained after role/scale/title verification; pay did not determine selection.'
    else:
        selection_wave='second expansion / filing verification'
        selection_note='Added by the second-expansion freeze and retained after role/scale verification; pay did not determine selection.'
    records.append({
        'organization':org,'reference_tier':p['tier_group'],'tier_label':p['peer_tier'],
        'selection_wave':selection_wave,'topic_cluster':meta.get('topic_cluster','Research, evaluation, policy, or EA-adjacent evidence organization'),
        'ea_affinity':p.get('ea_affinity',meta.get('ea_affinity_precomp','functional-only')),
        'country_or_region':meta.get('country_or_region_precomp','US'),'expected_structure':meta.get('expected_structure_precomp','independent nonprofit'),
        'ein':p.get('ein',''),'revenue':p.get('revenue',np.nan),'expenses':p.get('expenses',np.nan),'employee_count':p.get('employee_count',np.nan),
        'comparability_score':p.get('comparability_score',np.nan),'selection_status':'selected quantitative reference organization',
        'compensation_observation':'yes','cash_proxy_jul2026':p.get('cash_proxy_jul2026',np.nan),'total_proxy_jul2026':p.get('total_proxy_jul2026',np.nan),
        'ceo_title':p.get('ceo_title',''),'compensation_year':p.get('compensation_calendar_year',np.nan),
        'propublica_url':p.get('propublica_url',''),'official_irs_url':p.get('official_irs_url',''),
        'selection_note':selection_note
    })
selected=pd.DataFrame(records).drop_duplicates('organization')
selected['reference_tier']=pd.Categorical(selected.reference_tier,categories=['A','B','C'],ordered=True)
selected=selected.sort_values(['reference_tier','comparability_score','organization'],ascending=[True,False,True]).reset_index(drop=True)
selected.to_csv(DELIV/'expanded_reference_set.csv',index=False)
selected.to_csv(DELIV/f'expanded_reference_set_{len(selected)}.csv',index=False)

# ---------- peer inclusion/exclusion log (450 expansion candidates + 2 legacy-only frozen peers) ----------
comb_path=ROOT/'frozen/combined_peer_universe_3wave_precomp.csv'
if not comb_path.exists(): comb_path=ROOT/'frozen/combined_peer_universe_precomp.csv'
comb=pd.read_csv(comb_path)
# Add legacy-only organizations that were frozen in the original pre-compensation protocol
# but were not duplicated into the later expansion candidate files.
legacy_path=ROOT/'frozen/legacy_original_peer_bridge_precomp.csv'
if legacy_path.exists():
    legacy=pd.read_csv(legacy_path)
    missing=legacy[legacy.organization.isin(legacy_bridge_names) & ~legacy.organization.isin(comb.organization)].copy()
    if len(missing):
        add=pd.DataFrame({
            'candidate_id':['LEGACY-'+str(i+1).zfill(3) for i in range(len(missing))],
            'freeze_timestamp':['original benchmark protocol']*len(missing),
            'analysis_cutoff':['2026-08-17']*len(missing),
            'compensation_seen_before_freeze':missing.compensation_seen_at_selection.values,
            'preselected_status':missing.preselection_status.values,
            'organization':missing.organization.values,
            'topic_cluster':['Research, evaluation, philanthropy infrastructure, and policy']*len(missing),
            'ea_affinity_precomp':['functional-only']*len(missing),
            'country_or_region_precomp':['US']*len(missing),
            'expected_structure_precomp':['independent nonprofit']*len(missing),
            'precomp_note':missing.functional_basis.values,
            'discovery_source_url':['']*len(missing),
            'extension_wave':['original_frozen_legacy_bridge']*len(missing),
            'new_pay_eligible':['no']*len(missing),
        })
        comb=pd.concat([comb,add],ignore_index=True,sort=False)
selected_map=selected.set_index('organization').to_dict('index')
form_map=f.set_index('organization').to_dict('index')
logs=[]
for _,r in comb.iterrows():
    org=r.organization
    sel=selected_map.get(org)
    fr=form_map.get(org)
    prior_tier=str(r.get('provisional_tier',''))
    if sel:
        status='included'; final_tier='Tier '+str(sel['reference_tier']); reason='Selected under frozen function/scale/EA/structure rules; compensation did not determine selection.'
    elif fr and not str(fr.get('analysis_status','')).startswith('primary'):
        status='excluded_or_structural'; final_tier=str(fr.get('analysis_status','')); reason=str(fr.get('exclusion_reason','') or fr.get('notes',''))
    elif 'Structural/context' in prior_tier:
        status='structural_context'; final_tier='structural/context'; reason=str(r.get('scale_notes','') or r.get('precomp_note',''))
    elif 'Screened out' in prior_tier:
        status='screened_out'; final_tier='screened out'; reason=str(r.get('scale_notes','') or r.get('precomp_note',''))
    elif 'Not yet verified' in prior_tier or pd.isna(r.get('verified_org_name')):
        status='frozen_candidate_not_selected'; final_tier='not selected'; reason=f'Frozen candidate; not promoted into the {len(selected)}-organization quantitative reference set during this pass.'
    else:
        status='not_selected'; final_tier=prior_tier or 'not selected'; reason=str(r.get('scale_notes','') or r.get('precomp_note',''))
    logs.append({
        'candidate_id':r.get('candidate_id',''),'organization':org,'extension_wave':r.get('extension_wave',''),
        'topic_cluster':r.get('topic_cluster',''),'ea_affinity_precomp':r.get('ea_affinity_precomp',''),
        'expected_structure_precomp':r.get('expected_structure_precomp',''),'compensation_seen_before_freeze':r.get('compensation_seen_before_freeze',''),
        'final_status':status,'final_tier':final_tier,'final_reason':reason,
        'compensation_analysis_status':fr.get('analysis_status','not collected') if fr else 'not collected',
        'source_url':r.get('scale_source_url','') or r.get('discovery_source_url','')
    })
pd.DataFrame(logs).to_csv(DELIV/'peer_inclusion_exclusion_log.csv',index=False)

# ---------- job ads normalization ----------
jobs=pd.read_csv(DATA/'job_ad_evidence_expanded.csv')
job_additions=ROOT/'enrichment'/'goodstructures_job_ad_additions.csv'
if job_additions.exists():
    additions=pd.read_csv(job_additions)
    missing=set(jobs.columns)-set(additions.columns)
    if missing:
        raise ValueError(f'GoodStructures job-ad additions lack canonical fields: {sorted(missing)}')
    jobs=pd.concat([jobs,additions],ignore_index=True,sort=False)
if jobs.source_id.duplicated().any():
    raise ValueError(f'Duplicate job-ad source IDs: {jobs.loc[jobs.source_id.duplicated(keep=False), "source_id"].tolist()}')
for col in ['salary_min','salary_max','annual_budget_or_expense','staff_count']:
    jobs[col]=pd.to_numeric(jobs[col],errors='coerce')
def period_index(p):
    p=str(p)
    if p in idx:return idx[p]
    if p.startswith('2025'):return idx['2025-AVG']
    if p.startswith('2026'):return TARGET_INDEX
    return TARGET_INDEX
jobs['cpi_factor']=jobs.cpi_period.apply(lambda x:TARGET_INDEX/period_index(x))
jobs['adjusted_min_jul2026']=jobs.salary_min*jobs.cpi_factor
jobs['adjusted_max_jul2026']=jobs.salary_max*jobs.cpi_factor
jobs['adjusted_midpoint_jul2026']=(jobs.adjusted_min_jul2026+jobs.adjusted_max_jul2026)/2
jobs.to_csv(DELIV/'job_ad_evidence.csv',index=False)
qads=jobs[jobs.included_in_quantitative_analysis.eq('yes')].copy()
strict_ads=qads[qads.tier.eq('strict_primary')]
close_ad_orgs=['Technical Assistance Collaborative','San Francisco Estuary Institute','PEAK Grantmaking','Dream.Org','Hagley Museum and Library']
close_ads=qads[qads.organization.isin(close_ad_orgs)]
original6=qads[qads.source_id.str.contains('TAC|SFEI|PEAK|CLIMATE|LEADERSTRUST|FFIS',regex=True)]

def ad_summary(d):
    return {
        'n':int(len(d)),'observed_min':float(d.adjusted_min_jul2026.min()) if len(d) else None,
        'observed_max':float(d.adjusted_max_jul2026.max()) if len(d) else None,
        'median_midpoint':float(d.adjusted_midpoint_jul2026.median()) if len(d) else None,
        'q1_midpoint':float(d.adjusted_midpoint_jul2026.quantile(.25)) if len(d) else None,
        'q3_midpoint':float(d.adjusted_midpoint_jul2026.quantile(.75)) if len(d) else None,
        'overlap_low':float(d.adjusted_min_jul2026.max()) if len(d) else None,
        'overlap_high':float(d.adjusted_max_jul2026.min()) if len(d) else None,
        'has_exact_overlap':bool(d.adjusted_min_jul2026.max() <= d.adjusted_max_jul2026.min()) if len(d) else False
    }

# ---------- statistics / sensitivities ----------
samples={
    'original_strict_primary':main[(main.source_wave.eq('legacy_original')) & (main.peer_tier.eq('strict_primary'))],
    'all_primary_eligible':main,
    'structurally_clean':main[main.structurally_clean],
    'tier_A':main[main.tier_group.eq('A')],
    'tier_A_B':main[main.tier_group.isin(['A','B'])],
    'expense_and_available_staff_match':main[main.close_scale],
    'joint_expense_and_known_staff_match':main[main.joint_scale_known_staff],
    'expense_match_only':main[main.close_expense],
    'current_comp_year_2024_2025':main[main.compensation_calendar_year.ge(2024)],
    'EA_core_or_adjacent':main[main.ea_affinity.ne('functional-only')],
    'functional_only':main[main.ea_affinity.eq('functional-only')],
    'nonfounder':main[main.founder_flag.ne('yes')],
    'CEO_title_match':main[main.ceo_title.str.contains('CEO|Chief Executive',case=False,na=False)],
    'ED_or_President':main[~main.ceo_title.str.contains('CEO|Chief Executive',case=False,na=False)],
}
# predeclared unusual structures, not pay-threshold filtering
unusual_flags={'unusually_high_cash_proxy_relative_to_prior_years','founder_and_unusually_high_cash_proxy','above_scale_related_org_pay','all_cash_from_related_org','founder_president_plus_ceo','dual_senior_executive'}
samples['excluding_predeclared_unusual_structures']=main[~main.structure_flag.isin(unusual_flags)]
sens=[]
for name,d in samples.items():
    for measure in ['cash_proxy_jul2026','total_proxy_jul2026']:
        z=weighted_desc(d,measure); z.update({'sample':name,'measure':measure})
        sens.append(z)
sens_df=pd.DataFrame(sens)
sens_df.to_csv(ANALYSIS/'sensitivity_summary.csv',index=False)

# winsorized 5/95 and trimmed 5%
robust=[]
for measure in ['cash_proxy_jul2026','total_proxy_jul2026']:
    x=main[measure].dropna().sort_values()
    lo,hi=x.quantile(.05),x.quantile(.95)
    robust.append({'measure':measure,'raw_median':x.median(),'winsorized_median':x.clip(lo,hi).median(),'trimmed_mean':x.iloc[math.floor(.05*len(x)):math.ceil(.95*len(x))].mean(),'p05':lo,'p95':hi})
pd.DataFrame(robust).to_csv(ANALYSIS/'robustness_summary.csv',index=False)

# leave-one-out close-scale sample
close=main[main.close_scale].copy()
loo=[]
for org in close.organization:
    d=close[close.organization.ne(org)]
    loo.append({'removed':org,'remaining_n':len(d),'cash_median':d.cash_proxy_jul2026.median(),'total_median':d.total_proxy_jul2026.median()})
loo_df=pd.DataFrame(loo)
loo_df.to_csv(ANALYSIS/'leave_one_out_close_scale.csv',index=False)

# leave-category-out
cats=[]
cat_defs={
    'remove EA-core/adjacent':main.ea_affinity.ne('functional-only'),
    'remove functional-only':main.ea_affinity.eq('functional-only'),
    'remove above-$20M expenses':main.expenses.gt(20_000_000),
    'remove below-$5M expenses':main.expenses.lt(5_000_000),
    'remove founders':main.founder_flag.eq('yes'),
    'remove older compensation years':main.compensation_calendar_year.lt(2024),
    'remove predeclared unusual structures':main.structure_flag.isin(unusual_flags),
}
for name,mask in cat_defs.items():
    d=main[~mask]
    cats.append({'sensitivity':name,'n':len(d),'cash_median':d.cash_proxy_jul2026.median(),'total_median':d.total_proxy_jul2026.median()})
pd.DataFrame(cats).to_csv(ANALYSIS/'leave_category_out.csv',index=False)

# analyst ranges: intentionally rounded decision judgment, not computed percentiles
judgment={
    'external_posting':{'low':250000,'high':340000,'center':295000,'expected_hire_low':280000,'expected_hire_high':320000},
    'incumbent_base':{'low':290000,'high':350000,'center':320000},
    'recurring_total':{'low':340000,'high':435000,'center':385000,'confidence':'low-to-moderate'},
}
stats={
    'cutoff':'2026-08-17','target_cpi_period':'2026-07','target_cpi_index':TARGET_INDEX,
    'expansion_candidate_universe_n':int(len(pd.read_csv(ROOT/'frozen/combined_peer_universe_3wave_precomp.csv'))),'documented_peer_log_n':int(len(comb)),'candidate_universe_n':int(len(comb)),'selected_reference_n':int(len(selected)),'primary_incumbent_n':int(len(main)),'structurally_clean_incumbent_n':int(main.structurally_clean.sum()),'all_collected_form990_n':int(len(f)),'numeric_primary_plus_structural_n':int((f.analysis_status.fillna('').str.startswith('primary') | f.analysis_status.eq('structural_sensitivity')).sum()),
    'job_ads_current_quantitative_n':int(len(qads)),'schedule_j_exact_base_n':int(main.schedule_j_base.notna().sum()),
    'selected_tier_counts':{str(k):int(v) for k,v in selected.reference_tier.value_counts().sort_index().items()},
    'pay_status_counts':{str(k):int(v) for k,v in f.analysis_status.value_counts().items()},
    'job_ads':{'strict_primary':ad_summary(strict_ads),'close_title_scale':ad_summary(close_ads),'expanded_current':ad_summary(qads),'original_six':ad_summary(original6)},
    'form990':{name:{'n':int(len(d)),'cash':weighted_desc(d,'cash_proxy_jul2026'),'total':weighted_desc(d,'total_proxy_jul2026')} for name,d in samples.items()},
    'leave_one_out_close':{'n':int(len(close)),'cash_median_min':float(loo_df.cash_median.min()),'cash_median_max':float(loo_df.cash_median.max()),'total_median_min':float(loo_df.total_median.min()),'total_median_max':float(loo_df.total_median.max())},
    'analyst_judgment':judgment,
}
(ANALYSIS/'stats.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')

# concise summary table
summary_rows=[]
for name in ['all_primary_eligible','structurally_clean','tier_A','tier_A_B','expense_and_available_staff_match','joint_expense_and_known_staff_match','expense_match_only','EA_core_or_adjacent','functional_only','excluding_predeclared_unusual_structures']:
    d=samples[name]
    summary_rows.append({'sample':name,'n':len(d),'cash_median':d.cash_proxy_jul2026.median(),'cash_q1':d.cash_proxy_jul2026.quantile(.25),'cash_q3':d.cash_proxy_jul2026.quantile(.75),'cash_weighted_median':weighted_median(d.cash_proxy_jul2026,d.analysis_weight),'total_median':d.total_proxy_jul2026.median(),'total_q1':d.total_proxy_jul2026.quantile(.25),'total_q3':d.total_proxy_jul2026.quantile(.75),'total_weighted_median':weighted_median(d.total_proxy_jul2026,d.analysis_weight)})
pd.DataFrame(summary_rows).to_csv(ANALYSIS/'summary_statistics.csv',index=False)

# ---------- charts ----------
def save_ads_chart():
    d=qads.sort_values('adjusted_midpoint_jul2026')
    fig,ax=plt.subplots(figsize=(9,6.3))
    y=np.arange(len(d))
    ax.hlines(y,d.adjusted_min_jul2026/1000,d.adjusted_max_jul2026/1000,linewidth=5,color='#2f6f7e')
    ax.scatter(d.adjusted_midpoint_jul2026/1000,y,s=28,color='#17324d',zorder=3)
    ax.axvspan(250,340,color='#dbe8ec',alpha=.8)
    ax.axvline(295,color='#bb6b35',linewidth=2)
    ax.set_yticks(y,d.organization)
    ax.set_xlabel('Advertised annual base salary, July 2026 dollars ($000)')
    ax.set_title('Expanded current recruitment evidence',loc='left',fontweight='bold')
    ax.grid(axis='x',alpha=.22); ax.spines[['top','right','left']].set_visible(False); ax.tick_params(axis='y',length=0)
    fig.tight_layout(); fig.savefig(ANALYSIS/'job_ad_ranges_expanded.png',dpi=180,bbox_inches='tight'); plt.close(fig)
def save_pay_chart():
    d=main.sort_values('cash_proxy_jul2026').tail(35)
    fig,ax=plt.subplots(figsize=(9,8.5))
    y=np.arange(len(d))
    ax.hlines(y,d.cash_proxy_jul2026/1000,d.total_proxy_jul2026/1000,color='#9eb9c0',linewidth=2)
    ax.scatter(d.cash_proxy_jul2026/1000,y,s=25,color='#17324d',label='Part VII cash/W-2 proxy')
    ax.scatter(d.total_proxy_jul2026/1000,y,s=25,color='#bb6b35',label='Filing total proxy')
    ax.axvspan(340,435,color='#eee5d9',alpha=.7)
    ax.set_yticks(y,d.organization,fontsize=7)
    ax.set_xlabel('Compensation, July 2026 dollars ($000)')
    ax.set_title('Upper half of expanded incumbent filing observations',loc='left',fontweight='bold')
    ax.legend(frameon=False,fontsize=8); ax.grid(axis='x',alpha=.22); ax.spines[['top','right','left']].set_visible(False); ax.tick_params(axis='y',length=0)
    fig.tight_layout(); fig.savefig(ANALYSIS/'form990_expanded_upper_half.png',dpi=180,bbox_inches='tight'); plt.close(fig)
def save_sensitivity_chart():
    s=pd.DataFrame(summary_rows)
    fig,ax=plt.subplots(figsize=(8.7,4.7))
    y=np.arange(len(s))
    ax.scatter(s.cash_median/1000,y,s=55,label='Cash/W-2 proxy median',color='#17324d')
    ax.scatter(s.total_median/1000,y,s=55,label='Total-proxy median',color='#bb6b35')
    ax.hlines(y,s.cash_q1/1000,s.cash_q3/1000,color='#8baab3',linewidth=3)
    labels=[x.replace('_',' ') for x in s['sample']]
    ax.set_yticks(y,labels); ax.set_xlabel('July 2026 dollars ($000)')
    ax.set_title('Evidence centers depend on peer definition and measure',loc='left',fontweight='bold')
    ax.grid(axis='x',alpha=.22); ax.spines[['top','right','left']].set_visible(False); ax.tick_params(axis='y',length=0); ax.legend(frameon=False,fontsize=8)
    fig.tight_layout(); fig.savefig(ANALYSIS/'sensitivity_centers.png',dpi=180,bbox_inches='tight'); plt.close(fig)
save_ads_chart(); save_pay_chart(); save_sensitivity_chart()

print(json.dumps({'candidate_universe':len(comb),'selected_reference':len(selected),'primary_pay':len(main),'structurally_clean':int(main.structurally_clean.sum()),'current_ads':len(qads),'cash_median':main.cash_proxy_jul2026.median(),'total_median':main.total_proxy_jul2026.median()},indent=2))
