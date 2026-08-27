#!/usr/bin/env python3
from __future__ import annotations
import os, shutil, hashlib, mimetypes, json, re
from pathlib import Path
import pandas as pd

ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'sources/raw'; RAW.mkdir(parents=True,exist_ok=True)
BASE_MANIFEST=ROOT/'data/original_source_manifest.csv'
if not BASE_MANIFEST.exists():
    raise FileNotFoundError(f'Missing self-contained base manifest: {BASE_MANIFEST}')

manifest=[]
orig_m=pd.read_csv(BASE_MANIFEST)
corrections_path=ROOT/'data/source_record_corrections.csv'
if corrections_path.exists():
    corrections=pd.read_csv(corrections_path,dtype=str).fillna('').set_index('source_id')
    unknown=set(corrections.index)-set(orig_m.source_id.astype(str))
    if unknown:
        raise ValueError(f'Corrections reference unknown source IDs: {sorted(unknown)}')
    for idx,row in orig_m.iterrows():
        sid=str(row.source_id)
        if sid not in corrections.index:
            continue
        for column,value in corrections.loc[sid].items():
            if column in orig_m.columns and str(value).strip():
                orig_m.at[idx,column]=value
for _,r in orig_m.iterrows():
    rr=r.to_dict(); rr['local_archive_path']=f"sources/raw/{Path(str(r.local_archive_path)).name}"
    manifest.append(rr)

# Form 990 derivative snapshots.
f=pd.read_csv(ROOT/'deliverables/form990_evidence.csv')
for _,r in f.iterrows():
    sid=str(r.source_id)
    fn=f"{sid.lower().replace('_','-')}.txt"
    path=RAW/fn
    lines=[
        'DERIVATIVE FORM 990 EVIDENCE SNAPSHOT',
        'This is not a source-native return. It preserves the filing identifiers, extracted Part VII values, scale fields, and validation notes used by the offline analysis.',
        ''
    ]
    for c in f.columns:
        v=r.get(c,'')
        if pd.isna(v): v=''
        lines.append(f'{c}: {v}')
    path.write_text('\n'.join(lines)+'\n',encoding='utf-8')
    manifest.append({
        'source_id':sid,'organization':r.organization,'document_type':'Form 990 filing-derived snapshot',
        'original_url':r.official_irs_url,'resolved_url':r.propublica_url,'retrieval_timestamp':r.retrieved_at,
        'local_archive_path':f'sources/raw/{fn}','mime_type':'text/plain; charset=utf-8','byte_length':'','sha256':'',
        'tax_period':f"{r.tax_period_begin} to {r.tax_period_end}",'ein':r.ein,'irs_object_id':r.irs_object_id,
        'provenance_class':'official filing-derived derivative','upstream_provenance':'Official IRS filing identifier; ProPublica used for navigation/corroboration',
        'extraction_location':r.extraction_location,'validation_notes':'Cash proxy arithmetic and total-proxy arithmetic validated; source-native IRS XML could not be archived in this environment.'
    })

# Selected peer profile snapshots, including organizations without clean pay.
sel=pd.read_csv(ROOT/'deliverables/expanded_reference_set.csv')
prev=pd.read_csv(ROOT/'data/previous_160_peer_universe.csv')
prev_map=prev.set_index('organization').to_dict('index')
for _,r in sel.iterrows():
    sid='SRC-PEER-'+re.sub(r'[^A-Z0-9]+','-',r.organization.upper()).strip('-')[:65]
    fn=sid.lower()+'.txt'; path=RAW/fn
    pm=prev_map.get(r.organization,{})
    source_url=pm.get('scale_source_url','') or r.propublica_url or r.official_irs_url
    txt=['DERIVATIVE PEER-PROFILE SNAPSHOT','Selection and scale facts only; compensation was not used to select or score the organization.','']
    for c in sel.columns:
        v=r.get(c,''); v='' if pd.isna(v) else v; txt.append(f'{c}: {v}')
    if pm:
        for c in ['scale_source_url','scale_source_type','scale_retrieval_date','scale_notes','function_score','expense_score','staff_score','ea_score','structure_score','geography_score']:
            v=pm.get(c,''); v='' if pd.isna(v) else v; txt.append(f'prior_{c}: {v}')
    path.write_text('\n'.join(map(str,txt))+'\n',encoding='utf-8')
    manifest.append({
        'source_id':sid,'organization':r.organization,'document_type':'Peer selection and scale profile','original_url':source_url,'resolved_url':source_url,
        'retrieval_timestamp':'2026-08-25T16:07:55-0700','local_archive_path':f'sources/raw/{fn}','mime_type':'text/plain; charset=utf-8','byte_length':'','sha256':'',
        'tax_period':r.compensation_year if not pd.isna(r.compensation_year) else '','ein':r.ein,'irs_object_id':'','provenance_class':'derivative',
        'upstream_provenance':'Public Form 990 rendering, organization profile, or filing-derived scale record',
        'extraction_location':'expanded_reference_set.csv and prior frozen peer profile','validation_notes':'Selection fields frozen without using compensation; full source-native profile page not archived.'
    })

# New/expanded job-ad snapshots. Original source IDs already present in original manifest.
jobs=pd.read_csv(ROOT/'deliverables/job_ad_evidence.csv')
existing_ids={str(x.get('source_id','')) for x in manifest}
for _,r in jobs.iterrows():
    sid=str(r.source_id)
    if sid in existing_ids: continue
    local=str(r.archive_path) if str(r.archive_path) not in ('nan','') else f'sources/raw/{sid.lower()}.txt'
    path=ROOT/local
    if not path.exists():
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text('DERIVATIVE JOB-ADVERTISEMENT SNAPSHOT\n\n'+''.join(f'{c}: {"" if pd.isna(r[c]) else r[c]}\n' for c in jobs.columns),encoding='utf-8')
    manifest.append({
        'source_id':sid,'organization':r.organization,'document_type':'CEO/ED recruitment advertisement','original_url':r.original_url,'resolved_url':r.resolved_url,
        'retrieval_timestamp':r.retrieved_at,'local_archive_path':local,'mime_type':'text/plain; charset=utf-8','byte_length':'','sha256':'',
        'tax_period':'','ein':'','irs_object_id':'','provenance_class':'derivative','upstream_provenance':r.upstream_provenance,
        'extraction_location':r.source_line_refs,'validation_notes':r.evidence_quality_notes
    })

# Protocol/data provenance snapshots.
for sid,org,doc,path in [
    ('SRC-PROTOCOL-EXT2','Rethink Priorities benchmark','Frozen method',ROOT/'frozen/extension2_protocol_amendment.md'),
    ('SRC-UNIVERSE-EXT2','Rethink Priorities benchmark','Frozen second-wave candidate universe',ROOT/'frozen/combined_peer_universe_precomp.csv'),
    ('SRC-PROTOCOL-EXT3','Rethink Priorities benchmark','Frozen third-wave method',ROOT/'frozen/extension3_protocol_amendment.md'),
    ('SRC-UNIVERSE-EXT3','Rethink Priorities benchmark','Frozen three-wave candidate universe',ROOT/'frozen/combined_peer_universe_3wave_precomp.csv'),
    ('SRC-CANDIDATES-EXT2','Rethink Priorities benchmark','Frozen second-wave new-candidate list',ROOT/'frozen/extension2_new_candidates_precomp.csv'),
    ('SRC-CANDIDATES-EXT3','Rethink Priorities benchmark','Frozen third-wave new-candidate list',ROOT/'frozen/extension3_new_candidates_precomp.csv'),
    ('SRC-LEGACY-BRIDGE','Rethink Priorities benchmark','Original frozen peer bridge',ROOT/'frozen/legacy_original_peer_bridge_precomp.csv'),
]:
    manifest.append({'source_id':sid,'organization':org,'document_type':doc,'original_url':'','resolved_url':'','retrieval_timestamp':'2026-08-25T16:07:55-0700','local_archive_path':str(path.relative_to(ROOT)),'mime_type':'text/markdown; charset=utf-8' if path.suffix=='.md' else 'text/csv; charset=utf-8','byte_length':'','sha256':'','tax_period':'','ein':'','irs_object_id':'','provenance_class':'frozen analysis input','upstream_provenance':'Locally frozen before systematic new-peer compensation review','extraction_location':str(path.relative_to(ROOT)),'validation_notes':'SHA-256 frozen and checked by validation.'})

# De-duplicate exact source IDs, preferring later expanded rows only when IDs collide.
by={}
for r in manifest: by[str(r['source_id'])]=r
manifest=list(by.values())
# Fill bytes/hash and fail if missing.
for r in manifest:
    path=ROOT/str(r['local_archive_path'])
    if not path.exists(): raise FileNotFoundError(path)
    b=path.read_bytes(); r['byte_length']=len(b); r['sha256']=hashlib.sha256(b).hexdigest()
    if not r.get('mime_type'): r['mime_type']=mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
cols=['source_id','organization','document_type','original_url','resolved_url','retrieval_timestamp','local_archive_path','mime_type','byte_length','sha256','tax_period','ein','irs_object_id','provenance_class','upstream_provenance','extraction_location','validation_notes']
out=pd.DataFrame(manifest)
for c in cols:
    if c not in out: out[c]=''
out=out[cols].sort_values(['document_type','organization','source_id'])
out.to_csv(ROOT/'deliverables/source_manifest.csv',index=False)
print('manifest records',len(out),'raw files',len(list(RAW.glob('*'))))
