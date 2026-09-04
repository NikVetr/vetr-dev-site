# Organization operating metadata validation

**Audit snapshot:** 2026-09-04

**Result:** PASS for key coverage, schema consistency, evidence-field
completeness, and archived-file integrity. Semantic coverage remains uneven,
especially for fiscal-sponsor status.

## Scope

This is a structural and descriptive audit of the consolidated operating
metadata layer against its five reviewed input CSVs, methodology, manual-request
files, and source manifest. The current local application data was loaded only
to derive the organization-key universe. No source page was revisited and no
claim was re-adjudicated.

The methodology deliberately applies strict, compensation-independent rules:
`is_remote=true` needs organization-wide evidence of a fully remote,
remote-first, or distributed model without regular office attendance;
`serves_as_fiscal_sponsor=true` needs evidence that the entity itself hosts
other projects. Lack of evidence remains `unknown`, not `false`.

## Coverage and consistency

| Check | Result |
| --- | ---: |
| Organization occurrences across application collections | 665 |
| Unique application organization keys | 201 |
| Consolidated rows / unique keys | 201 / 201 |
| Missing / extra / duplicate consolidated keys | 0 / 0 / 0 |
| Reviewed input rows / unique keys | 201 / 201 |
| Batch partition sizes (batches 1–4, then RP) | 63 / 63 / 62 / 12 / 1 |
| Rows with both evidence fields populated | 201 (100.0%) |
| Rows with a URL or local artifact for both claims | 201 (100.0%) |
| Rows with a non-empty caveat | 201 (100.0%) |

The consolidated key set exactly equals both the reviewed-input union and the
current application universe. Rows are case-insensitively sorted. All 12 fields
other than `remote_category` are preserved exactly from the input rows;
`remote_category` is deterministically normalized from `is_remote` to
`remote`, `in-person / hybrid`, or `unknown`. All 201 normalized pairs agree.

## Classification coverage

All percentages use 201 organizations as the denominator.

| Field | Value | Count | Share |
| --- | --- | ---: | ---: |
| Remote operating model | `true` | 49 | 24.4% |
|  | `false` | 66 | 32.8% |
|  | `unknown` | 86 | 42.8% |
|  | **Resolved (`true` or `false`)** | **115** | **57.2%** |
| Serves as fiscal sponsor | `true` | 14 | 7.0% |
|  | `false` | 4 | 2.0% |
|  | `unknown` | 183 | 91.0% |
|  | **Resolved (`true` or `false`)** | **18** | **9.0%** |

Overall row-level confidence is high for 66 organizations (32.8%), medium for
90 (44.8%), and low for 45 (22.4%). Confidence is a single row-level field, not
a separate assessment for each claim. All 45 low-confidence rows have
`unknown` fiscal-sponsor status; 45 of the 86 unknown remote rows are low
confidence.

## Source-manifest and manual-request checks

The manifest has 402 unique organization/claim entries: one work-model and one
fiscal-sponsor entry for each of 201 organizations. Every manifest URL, local
path, and retrieval date matches its consolidated row. Of the 402 entries, 400
have a source URL and two are supported by a local artifact without a URL. There
are 229 locally archived claim entries (57.0%) referencing 197 unique files;
all referenced files exist, are non-empty, and match the manifest byte length
and SHA-256 digest. The remaining 173 entries are URL-only.

There are four manual retrieval requests for four distinct organizations (2.0%
of the universe), and all four organizations still have consolidated rows:

| Organization | Remote | Fiscal sponsor | Confidence |
| --- | --- | --- | --- |
| Generation Pledge | `unknown` | `unknown` | low |
| MuckRock Foundation | `true` | `true` | high |
| Social Science Research Council | `unknown` | `true` | medium |
| Center for Economic and Policy Research | `unknown` | `unknown` | low |

A manual request denotes a blocked or unarchived direct artifact, not
necessarily an unresolved classification.

## Temporal and comparability caveats

- Every row and manifest entry records retrieval on 2026-09-04. This is a
  point-in-time evidence snapshot; `retrieved_at` is not necessarily the policy
  effective date, and operating models or sponsorship programs may change.
- `unknown` is an explicit evidence state. In particular, the 91.0% unknown
  fiscal-sponsor share must not be read as evidence that those organizations do
  not sponsor projects. Comparisons can reflect documentation and source-access
  differences as well as real organizational differences.
- The two fields use different negative rules. Remote `false` combines regular
  office/site-based and hybrid arrangements, while fiscal-sponsor `false`
  requires affirmative legal or program evidence. Their resolved rates are not
  directly comparable.
- Organization-wide remote status is stricter than a role-level remote option.
  Conversely, the displayed `in-person / hybrid` category intentionally
  collapses two distinct arrangements; retained evidence and caveats contain
  the finer detail.
- Evidence formats and periods vary across organization pages, recruitment
  materials, filings, and reports. URL-only sources are also more exposed to
  content drift or link loss than archived artifacts.
- Organization coverage is based on exact current application keys. Future
  additions, renames, aliases, or mergers require a fresh equality check rather
  than assuming automatic key reconciliation.
- The metadata supports categorical model effects and optional similarity
  weights. It does not establish a causal relationship between either operating
  characteristic and compensation.

## Validation conclusion

The layer is structurally complete for the current 201-organization universe,
with internally consistent controlled values and a valid two-claim manifest.
Downstream use should retain `unknown` as its own category and should disclose
the materially lower resolved coverage for fiscal-sponsor status (9.0%) than
for remote operating model (57.2%). The four manual artifact requests and 173
URL-only claim entries remain the principal preservation follow-ups.
