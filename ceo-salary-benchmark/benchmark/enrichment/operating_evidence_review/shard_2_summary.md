# Shard 2 operating-evidence review

Reviewed 2026-09-05. The JSONL is compact JSONL: one complete record per
line. It keeps work arrangement, hiring geography, operating geography, and
CEO-specific hiring geography separate. `ceo_scope_basis` identifies whether
CEO scope is direct-role evidence, organization policy, inferred staff market,
or unknown.

## Coverage

- Evidence uses official careers pages, employer ATS pages, dated employer
  posts, or employer-identified job copies. Search logs record both a current
  career search and a historical search attempt.
- Local captures are stored under the ignored job-review source directory
  when retrieval succeeded. Blocked and expired sources retain their URL.

## Results

| Work model | Organizations |
| --- | ---: |
| Remote | 39 |
| Hybrid / mixed | 39 |
| In-person | 3 |
| Unknown | 19 |

Where a source does not say where a role can be filled, hiring scope remains
`unknown`. A remote role restricted to the United States remains `remote` and
uses `us_only` as its separate hiring scope.

CEO market evidence is deliberately sparse: 11 records use a direct executive
role, two use organization policy, seven use the staff market as an explicit
proxy, and 80 remain `unknown`.

## Interpretation notes

An organization address, policy mission, or program service area was never
used as proof of attendance, hiring eligibility, or operating footprint.
Likewise, a remote role whose eligibility is restricted to the United States
remains `remote` while its hiring scope is separately `us_only`. Local
artifacts may be historic; records do not treat them as proof of a current
policy without a dated current source. Pandemic-era material is described in
`historical_notes` rather than carried forward automatically.
