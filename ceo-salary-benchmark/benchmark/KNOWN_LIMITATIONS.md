# Known limitations

1. **The earlier ZIP was not source-complete.** The file previously named `rp_ceo_expanded_rebenchmark_complete.zip` contained derivative text snapshots but no complete official IRS XML returns. The current workspace now contains all 135 XML returns, but the earlier ZIP remains an analytical reproduction archive rather than a raw-evidence archive.

2. **Retrieval is complete, but the strict corrected release is not.** All 353 current manifest records are locally preserved. The strict packager continues to fail closed because it requires both source presence and agreement with the original expected extraction fields; 123 historical records retain documented expected-data issues rather than retrieval gaps.

3. **The extension is not blind to the original benchmark.** The original nine-peer pay observations and prior recommendation were known before the second and third expansion waves. Newly added candidate universes and scoring rules were frozen before systematic review of new-peer compensation, but complete analyst blindness cannot be claimed.

4. **Quarantined RP target-pay exposure.** During the original Phase 0 public-scale research, a public search-result page incidentally displayed RP's own 2024 officer-compensation figures. Those values were quarantined, are not reproduced in the deliverables, and were not used to select peers, set methods, choose ranges, or validate conclusions.

5. **The original Schedule J extraction was incomplete.** Independent parsing recovered exact Schedule J base compensation for 110 of 116 primary-use observations. These values are in `deliverables/validated_form990_compensation.csv`; the original evidence table and report incorrectly state that no exact-base observations exist. Part VII reportable compensation remains a cash/W-2 proxy and must not be treated as exact base salary.

6. **Incomplete headcount coverage.** Employee counts are unavailable for 73 of the 116 primary-use filing observations. The strict joint expense-and-known-staff sensitivity contains only 17 organizations. The broader scale view retains missing-headcount cases only when the expense measure is in band and no known staff figure contradicts it.

7. **Nonrandom public-record sample.** The expanded set is much larger than the original, but it remains a judgment-selected public-record sample rather than a random draw from a defined population. Reported medians are descriptive centers, not population percentiles.

8. **Role and structure heterogeneity.** CEO, President/CEO, President, and organization-wide Executive Director roles differ. Founder status, dual-senior-executive arrangements, related-organization pay, older clean years, and other structures are flagged and tested in sensitivities.

9. **Recruitment evidence remains limited.** Fifteen current advertisements are quantitative, but only three are strict primary and five are close title/scale matches. The $340,000 posting ceiling is deliberate search headroom, not an observed market percentile.

10. **Some original recruitment URLs expired.** Complete lawful mirrors now verify all 15 primary quantitative ranges and all three sensitivity-only ranges. The H-CAP mirror confirms its $150,000-$170,000 range, 13-person remote team, January 28 posting timestamp, and March 15 priority deadline. The MSI mirrors also correct its excluded role title to Executive Director.

11. **Geographic effects are not separately identifiable.** Remote status, high-cost geography, title, topic, maturity, and scale are confounded in the public evidence. No mechanical city multiplier is used.

12. **Total compensation is a planning range.** The recurring total range excludes unusual one-time incentives, transition payments, severance, relocation, and exceptional deferred compensation. Benefits and bonus design cannot be estimated precisely from the public evidence.

13. **One primary filing row requires correction.** Center for AI Safety's source XML reports Part VII organization compensation of $314,534 and other compensation of $6,749, not $242,953 and $22,764. The independently validated deliverable contains the corrected values; the original report is retained unchanged as the audited artifact.

14. **Later-wave score components are not fully reconstructable.** The first expansion preserves every component score, while later frozen candidate tables preserve pre-compensation descriptors but not a complete component-by-component scoring ledger. Final scores should be treated as analyst judgments until that ledger is rebuilt.

15. **The frozen cohort and living app cohort are different audit layers.** The 144-reference/116-primary files remain immutable historical checkpoints. The app's dated living amendment admits six independently source-validated post-freeze observations under a fixed pay-blind role rule, producing 122 default incumbent cash rows and 114 Schedule J base rows. Their later-wave scores remain provisional and are not inputs to incumbent Auto-weights; the row-level amendment preserves every old and new disposition.
