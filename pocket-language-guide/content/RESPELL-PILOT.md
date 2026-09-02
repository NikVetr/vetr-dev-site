# Respelling pilot: can `respell(ipa, 'en', 'en-US')` be generated?

A measured feasibility study, not a feature. Nothing under `core/`, `ui/`, `data/`
or `tests/` was touched. The prototype is `scripts/respell_pilot.py`,
`scripts/respell_pilot_ipa.py` and `scripts/respell_pilot_rules.en-US.yaml`; all
output lands in `tmp/respell-pilot/` (gitignored), with the full transcript in
`tmp/respell-pilot/RESULTS.txt`.

`content/RESPELL-SYSTEMS.md` answers the neighbouring question — which *source*
languages have a system to borrow. This file answers whether the machine half
works, against the 12,001 curated cells as ground truth.

## The answer in one paragraph

**Yes, and further along than expected — but as a fallback layer, not a
replacement.** A single 99-entry rule table, keyed on IPA and written from the
corpus rather than from a published key, exactly reproduces **66.8%** of the 758
curated Spanish respellings and **71.8%** of the 754 Mandarin ones. At the syllable
level it agrees with the human on **91.0%** and **91.6%**. The important number is
the third one: after normalising away every spelling-convention difference the
pilot identified, only **4.7%** of Spanish rows and **13.0%** of Mandarin rows still
disagree about what an English reader should *say* — and in the largest single
disagreement class the machine is right and the human is wrong. This is not the
dangerous outcome. It is not producing plausible-looking wrong pronunciations; it is
producing correct pronunciations spelled slightly differently from a human's habit.

The reason it cannot be a replacement is that the 16 curated sheets are not mutually
consistent, so no deterministic function can match all of them. That is measured
below, and it is why the override layer must stay authoritative.

## 1. Can we get IPA at all?

Nothing was installed. There is no `espeak-ng` binary, no `espeak`, no
`phonemizer`, no `epitran`, no `pypinyin`. `sudo` needs a password, so
`apt install espeak-ng` is unavailable.

**But `libespeak-ng1` is already installed**, and that turns out to be the whole
ball game:

```
/usr/lib/x86_64-linux-gnu/libespeak-ng.so.1 -> libespeak-ng.so.1.1.49   (v1.50)
/usr/lib/x86_64-linux-gnu/espeak-ng-data/    94 *_dict files
```

The shared library and its full data directory are present from a transitive
dependency; only the CLI front-end is missing. PyPI is reachable, so
`pip3 install --user phonemizer` (3.4.0) is enough — phonemizer loads the library
through `ctypes` and finds `espeak-ng-data` next to it, with no root and no
`espeak-ng` executable:

```python
EspeakBackend('es-419', with_stress=True).phonemize(['¿Dónde está el baño?'])
# ['dˈonde estˈa el βˈaɲo']
```

So the answer to "can we get IPA" is **yes, for 14 of the 16 targets, today, with
one `pip install --user`**. Also installed and used: `dragonmapper` (Pinyin→IPA),
`pykakasi` (kanji→kana). Reproducing this needs
`pip3 install --user phonemizer dragonmapper pykakasi`.

Four findings that change the plan:

- **Thai has no espeak-ng voice at all.** There is no `th_dict`, and
  `espeak-ng-data/lang/tai/` contains only Shan. Thai IPA has to come from
  somewhere else entirely. That is consistent with `summary.md` already deferring
  Thai dictionary line-breaking — Thai is the one target where the *whole* pipeline
  is missing, not just a rule.
- **espeak-ng's `cmn` voice does not emit IPA.** It produces
  `ts.ˈo-5 s.ˈi.5 ts.ˈə5ŋ` for 这是正确 — ASCII stand-ins for the retroflexes and
  tone digits glued into the rime. It is unusable as an `ipa` column. The Mandarin
  IPA in this pilot came from **the pack's own curated Pinyin column** through a
  syllable table (`dragonmapper`), which yields standard IPA with the Chao tone
  letters `ʈʂɤ˥˩ ʂɨ˥˩ ʈʂɤŋ˥˩ tɕʰɥœ˥˩` — exactly the repertoire `summary.md` says the
  Latin faces already ship.
- **espeak-ng's `ja` voice cannot read kanji.** It renders 月曜日 as
  `tʃˈaɪniːzlˈe̞tə tʃˈaɪniːzlˈe̞tə` — it is literally speaking the words "Chinese
  letter". Kana works (`パスポート` → `pˌäsɯᵝpˈo̞o̞to̞`). Running `pykakasi` first fixes
  it (`月曜日` → `げつようび` → `ɡˌe̞tsɯᵝjo̞ˈɯᵝbi`), but the cheaper route is the pack's
  existing Hepburn column — see §9.
- **The voice matters as much as the language.** espeak's default `es` is Castilian:
  107 instances of `θ` and 34 of `ʎ` in the Spanish lexicon. The curated respellings
  are seseo and yeísmo (`ah-sen-SOR`, `ah-YEE`), so the correct voice is `es-419`,
  which produces zero of each. Picking `es` over `es-419` would have cost roughly
  140 words before a single rule was written. `fr` must be spelled `fr-fr` and `pt`
  must be `pt-br`; the bare codes raise "not supported".

## 2. Why Spanish and Mandarin

**Spanish** because its orthography is near-phonemic, so espeak-ng is effectively a
deterministic transducer with reliable stress. That isolates the variable under
test: any disagreement is the *respelling* rule set's fault, not the G2P's. It puts
an upper bound on what the design can do when IPA is free.

**Mandarin** because it breaks every assumption Spanish satisfies. Han characters
carry no pronunciation, so G2P is a lookup-and-disambiguate problem rather than a
letter-to-sound one. The existing romanisation actively misleads (`q x zh c`). Tone
is lexical and has to be either carried or dropped by explicit policy. And the
syllable is rigid — onset + medial + nucleus + coda + tone — which tests whether a
rule table designed for phoneme-sized rules can also express rime-sized ones.

They also differ in a way that turned out to matter more than either: the two sheets
were written by different hands with different conventions, which is what surfaced
the per-target problem in §4.

Japanese was used as a third, cheaper probe for the length and mora questions (§8,
§9) but is not one of the two measured targets.

## 3. The transducer

`scripts/respell_pilot_rules.en-US.yaml`, shaped like the planned
`data/respell/<src>/rules.yaml`: one file per (source language, accent), keyed on
IPA, with no target language named in the shared part.

```
policy:            5 switches (separator, stress, tone, length, min syllables)
splits:            2 reader-driven syllable splits
phonemes:         96 ordered longest-match rules, IPA -> English letters
syllable_fixups:   3 repairs on the assembled syllable
targets:           zh-Hans: 2 phoneme overrides, 4 fixups, splits disabled
```

22 of the 96 phoneme rules carry a context condition. The engine is ~130 lines and
supports exactly the predicates the corpus turned out to need: `word_initial`,
`word_final`, `open`, `closed`, `stressed`, `has_onset`/`no_onset`, `after_out`
(what the rule table has already emitted for this syllable), `before_onset`,
`after_nucleus`, and `if_inventory`/`unless_inventory`.

**Every rule was read off the corpus, not off a published key.** The evidence tables
in `tmp/respell-pilot/*-evidence.tsv` list, for each IPA syllable / onset / rime,
what the humans actually wrote and how often. Three examples of rules that no
published key would have given:

- **`/a/` takes the `ah` digraph only in an open, word-internal syllable.** Curated:
  507 of 512 such tokens are `ah`; 444 of 478 open *word-final* ones are bare `a`;
  every closed one is bare. So `PAH-ra`, `es-TA`, `KWAN-toh`. 97% of 1,108 tokens
  from one rule.
- **`do` and `to` are English words read /uː/.** Open `/o/` after a coronal stop is
  `oh` (`ðo` → `doh` 98/98, `to` → `toh` 83/112); after every other onset it is bare
  (`no` 93/93, `ko` 50/50, `ɾo` 41/41, `ɡo` 31/31). The generative principle is not
  phonological at all — it is "does the bare letter pair happen to be an English
  word with the wrong value".
- **`_ow` versus `_aow` in Mandarin** is the same principle. `how` and `dow` are read
  /aʊ/, which is right, so they stay; `bow`, `show`, `low`, `mow`, `sow` are read
  /oʊ/, which is wrong, so the curator wrote `baow`, `shaow`, `lyaow`, `maow`. And
  `ʂoʊ` → `show` (21/21) because there the English word says the right thing.

**One rule shape is worth keeping in the real file: conditioning on the target's own
phoneme inventory.** Spanish `/p t k/` must be written `p t k`; Mandarin `/p t k/`
must be written `b d g`. Same IPA symbols, opposite output. The principled
discriminator is typological — a language that contrasts `/p/` with `/pʰ/` has no
voiced stop for `b` to collide with — and it is computable from the target's own
`ipa` column with no curated flag:

```yaml
- {slot: any, ipa: 'p', out: 'b', if_inventory: 'pʰ'}
- {slot: any, ipa: 'p', out: 'p'}
```

Getting this wrong cost 30 percentage points of Mandarin agreement before it was
found. The same mechanism decides `ts`→`dz` vs `ts`, and whether `/ŋ/` before a
velar is `ng` or the allophone `n` (`TEN-go`, not `TENG-go`) — that one asks whether
the target's `/ŋ/` can end a word (`unless_inventory: 'ŋ#'`), which Mandarin's can
288 times and Spanish's can once, in `roaming`. An inventory symbol needs three
occurrences to count, so one loanword cannot invent a phoneme.

Syllabification is likewise derived rather than tabulated: **whatever consonant
cluster can open a word in a language can open a syllable in it.** Read off the
Spanish lexicon that gives exactly `bl bɾ fɾ kl kɾ pl pɾ tɾ ɡɾ` and correctly
excludes `st`, so `es-TA` does not become `e-STA`. German would get `ʃt` from the
same procedure. Voiced fricative allophones fold to their stops first, or `ah-BLAR`
comes out `ahb-LAR`.

## 4. The numbers

| | Spanish | Mandarin |
|---|---|---|
| curated rows | 758 | 754 |
| rows the pipeline can align syllable-for-syllable | 98.5% | 96.2% |
| **exact match** | **66.8%** | **71.8%** |
| + differs only in capitals or hyphen placement | 67.8% | 74.0% |
| + differs by one letter in one syllable | 90.0% | 91.6% |
| syllable-level agreement | 91.0% | 91.6% |
| mean normalised edit distance | 0.028 | 0.028 |
| residue after normalising every known convention difference | **4.7%** | **13.0%** |

To answer the question as posed: this is **67–72% exact and usably close on another
22–24%**, with a hard residue of 5–13% where the two strings would really be said
differently. It is not the 40/40 case and it is not the dangerous case.

### The ceiling, and why the rule table beats memorisation

The corpus sets a hard limit on any deterministic function of the IPA, because the
humans were not self-consistent. Fitting the modal curated spelling for every
(onset, nucleus, coda, word-final) key and applying it back to the same data:

| | in-sample syllable | in-sample row | **held-out syllable** | **held-out row** |
|---|---|---|---|---|
| Spanish, syllable identity only | 92.7% | 62.6% | 89.3% | 50.1% |
| Spanish, + open/closed + word-final | 96.2% | 78.4% | 91.8% | **59.9%** |
| Spanish, + stress | 97.8% | 86.0% | 92.4% | 61.9% |
| Mandarin, syllable identity only | 95.8% | 84.3% | 93.0% | **74.6%** |
| Mandarin, + open/closed + word-final | 97.0% | 88.0% | 91.3% | 69.4% |

Held-out is 5-fold by row. Two things follow.

**The 99-entry rule table (66.8% / 71.8%) is at or above what a memorised syllable
lexicon achieves on unseen rows (59.9% / 70.6%).** Rules generalise and a lexicon
does not: 4–5% of held-out syllable types were never seen in training. So the rule
table is doing real work, not curve-fitting — which also means the in-sample figures
above are not badly inflated, since a 99-entry table cannot memorise 12,001 cells.

**The in-sample row ceiling is 78–88%, not 100%.** Even a perfect deterministic
function of the syllable plus its context cannot exceed that, because the same IPA
gets two different curated spellings. The measured self-inconsistency on the three
biggest cases:

| | modal spelling wins |
|---|---|
| Mandarin `/ɕ/` → `sh` (103) or `sy` (58) | 64% |
| Mandarin `/ɑʊ/` → `ow` (137) or `aow` (84) | 62% |
| Spanish open `/o/` after `/t/` → `toh` (83) or `to` (29) | 74% |

`星期一` is `sheeng-chee ee` and `西` is `shee`, but `谢谢` is `syeh-syeh` and `雪` is
`syweh`. Nothing in the IPA distinguishes them. **About a fifth of the residual
disagreement is the corpus disagreeing with itself**, and no amount of rule work
removes it.

## 5. Failure taxonomy

Each mismatch is attributed to one cause by applying normalisations cheapest-first
and recording which one makes the two strings equal. Full lists in
`tmp/respell-pilot/{es,zh-Hans}-taxonomy.tsv`.

### Spanish, 758 rows

| n | % | cause |
|---|---|---|
| 506 | 66.8% | exact |
| 106 | 14.0% | **b/v — not recoverable from IPA** |
| 78 | 10.3% | vowel digraph choice: `ah`/`a`, `oh`/`o` |
| 33 | 4.4% | two or more independent differences |
| 24 | 3.2% | one consonant letter |
| 6 | 0.8% | row names a language — needs the language-name table |
| 3 | 0.4% | syllable division |
| 3 | 0.4% | stress capitals |
| 2 | 0.3% | no usable IPA (currency symbol, loanword) |

### Mandarin, 754 rows

| n | % | cause |
|---|---|---|
| 541 | 71.8% | exact |
| 53 | 7.0% | two or more independent differences |
| 42 | 5.6% | one vowel letter (`mun`/`men`, `chwen`/`chwan`) |
| 36 | 4.8% | `sh`/`sy` sibilant choice |
| 30 | 4.0% | one consonant letter (mostly the same `sh`/`sy`) |
| 19 | 2.5% | `ow`/`aow` diphthong shape |
| 17 | 2.3% | vowel digraph choice |
| 10 | 1.3% | `ee`/`i`, `oo`/`u` |
| 6 | 0.8% | row names a language |

### The cases, grouped by what they tell us

**Group A — the machine is right and the curator followed spelling (106 rows, 14.0%
of Spanish, the single largest class).** Spanish `b` and `v` are one phoneme. The
curator wrote `v` wherever Spanish spells `v`:

```
Vengo de turismo             curated VEN-go deh too-REES-mo            got BEN-go deh too-REES-mo
Lave esta ropa, por favor    curated LAH-veh ES-ta RO-pa, por fah-VOR  got LAH-beh ES-ta RO-pa, por fah-BOR
el visado                    curated el vee-SAH-doh                    got el bee-SAH-doh
¿Va a llover hoy?            curated va a yo-VER oy                    got ba a yo-BER oy
tren de alta velocidad       curated tren deh AL-ta veh-lo-see-DAD      got tren deh AL-ta beh-lo-see-DAD
```

Read aloud by an English speaker, `BEN-go` is the correct Spanish pronunciation and
`VEN-go` is not. **This class inflates the error rate while improving the output.**
18.3% of Spanish rows contain an orthographic `v`, which is the size of the ceiling
this imposes on exact-match against the Spanish sheet specifically. The same shape
appears in the German sheet's `⟨v w s⟩` problem that `RESPELL-SYSTEMS.md` flags.

A smaller instance of the same thing: espeak assimilates `/n/` before a labial, so
`enfermo` → `em-FER-mo`, which is what a Spaniard says; the curator wrote
`en-FER-mo`.

**Group B — digraph choice on a vowel the corpus itself cannot decide (78 + 42 + 19
+ 17 rows).** The reader says the same thing either way.

```
¿Hay acceso sin escalones?   curated eye ak-SEH-so seen es-kah-LOH-nes  got ...es-kah-LO-nes
¿Dónde está la comisaría?    curated DON-deh es-TA la ko-mee-sah-REE-ah  got ...ko-mee-sah-REE-a
登山口                        curated dung-shan-koh                       got dung-shahn-koh
有空房吗？                    curated yoh kohng-fahng ma                  got yoh kong-fahng ma
哪里可以买票？                curated nah-lee kuh-yee mye pyow            got ...mye pyaow
明天                          curated ming-tyen                           got meeng-tyen
我对青霉素过敏                curated waw dway cheeng-may-soo gwaw-min    got ...gwaw-meen
```

**Group C — the sibilant coin flip (66 Mandarin rows across two buckets).** Pure
curator variance; the pilot picked `sh` before a medial and `sy` elsewhere and takes
the loss both ways.

```
星期一                        curated sheeng-chee ee              got syeeng-chee ee
游客中心                      curated yoh-kuh jong-sheen          got yoh-kuh jong-syeen
需要给小费吗？                curated syoo-yow gay syaow-fay ma   got ...gay shyaow-fay ma
要脱鞋吗？                    curated yow twaw syeh ma            got yow twaw shyeh ma
```

**Group D — word grouping, where the Pinyin column and the respelling disagree (22
Mandarin rows).** `jǐ diǎn` is two Pinyin words and one hyphenated respelling word.
This is a data-consistency question, not a transducer question.

```
现在几点？                    curated shyen-dzye jee-dyen   got shyen-dzye jee dyen
一月                          curated ee yweh               got ee-yweh
接驳车最晚几点？              curated jyeh-baw-chuh dzway-wahn jee-dyen   got jyeh-bwaw-chuh ... jee dyen
```

**Group E — the row names a language (6 rows each).** `No hablo {target}` is respelled
`no AH-blo es-pah-NYOL`: the curator resolved the placeholder *and* respelled the
result. This needs `data/registry/language-names/`, which `summary.md` already calls
the project's only O(N²) table. Not a transducer failure; it is a missing input.

**Group F — G2P errors, the only class that could ship a wrong pronunciation (≈8
Spanish rows).**

```
Cerrado temporalmente   curated seh-RRAH-doh tem-po-ral-MEN-teh  got seh-RRAH-doh tem-po-RAL-men-teh
el roaming              curated el RO-meen                       got el rro-AH-meeng
¿…check-out más tarde?  curated ...el chek-OWT mas TAR-deh        got ...el CHEH-kowt mas TAR-deh
¥                       curated yen                              got ¥
```

Two sub-kinds. Stress misplacement by espeak (`temporalmente`) is a genuine wrong
answer. Loanwords are worse in principle: espeak applies Spanish letter-to-sound to
`roaming` and `check-out`, and the curator respelled them as English. Both are
mechanically detectable — the loanword case by a Latin-script token that is also an
English word, the stress case not at all except by review. **This is the class to
gate on, and it is small.**

**Group G — syllable division (3 Spanish rows).** `inhalador` → curated `een-ah-`,
generated `ee-nah-`. The curator resyllabified to stop `ee-nah` being read as a
single vowel. Real, rare, and the least harmful kind of difference.

### One systematic difference that is a rule, not a failure

The largest single source of *alignment* failure at the start was not noise. 199 of
Spanish's 247 syllable-count disagreements were the same thing: the curator breaks a
rising diphthong into hiatus, because an English reader cannot read `sya`.

```
farmacia   /faɾ.ma.sja/   →  far-MAH-see-ah   (4 syllables from 3)
tiempo     /tjem.po/      →  tee-EM-po
quién      /kjen/         →  kee-EN
habitación /a.βi.ta.sjon/ →  ah-bee-tah-see-ON
```

That is a source-side reader rule and it lives in `splits:`. It also had to be
**disabled for Mandarin**, whose sheet keeps the medial (`dyen`, not `dee-EN`) — see
below.

## 6. The per-target problem, and why it is still O(N)

The one architectural finding that the numbers forced. Three cases where identical
IPA gets different curated output in the two sheets:

| IPA | Spanish sheet | Mandarin sheet |
|---|---|---|
| `/tjɛn/`-shaped onset + medial `j` | `tee-EM-po` (split into hiatus) | `dyen` (medial kept) |
| `/a/` in a closed syllable | `KWAN-toh`, `tan`, `mar` (bare `a`) | `kahn`, `wahn`, `fahn` (`ah`) |
| `/ɛn/` in a closed syllable | `en` | `en` — but `/ən/` is `un` or `men` |

There is no IPA-visible discriminator. These are two humans with two habits. So the
shared rule file needs a small per-target block, and the pilot's is:

```yaml
targets:
  zh-Hans:
    splits: []                                    # keep the medial glide
    phonemes: [2 entries]
    syllable_fixups: [4 entries]
```

**Six entries for a whole language. That is the cost, and it is per target, not per
pair** — so the O(N) claim survives intact. 17 IPA columns + 1 rule file per source,
each with a ≤10-entry block per target, still generates all 272 pairs. What it means
practically is that the shipped `rules.yaml` schema should have the `targets:` key
from the start; retrofitting it across 16 files later is the expensive version, which
is the same conclusion `RESPELL-SYSTEMS.md` reaches about `deviations:`.

The honest framing for the owner: a generated respelling will not match a *curated*
sheet's habits without those six entries, but it will be equally readable without
them. The per-target block buys agreement with existing cells, not correctness.

## 7. Stress

**IPA stress marks survive espeak-ng cleanly and the position is usually right.**
`with_stress=True` gives `ˈ` and `ˌ`; the two normalisations needed are to drop
secondary stress (the curated sheets never capitalise it — `ascensor` is
`ˌasensˈoɾ` but `ah-sen-SOR`) and to keep exactly one primary per word.

Measured on syllable-aligned polysyllabic words: does the syllable espeak marks
primary match the syllable the curator capitalised?

| target | polysyllabic words | stress position agrees |
|---|---|---|
| es | 1,265 | **99.4%** |
| pt | 734 | 99.2% |
| it | 1,309 | 98.2% |
| sw | 1,180 | 98.1% |
| ru | 1,101 | 94.7% |
| de | 1,008 | 92.6% |
| id | 1,614 | 92.3% |
| tr | 1,097 | **68.1%** |
| hi | 964 | 63.2% |
| fr | 466 | 60.3% |
| ar | 393 | 56.0% |
| zh-Hans | 818 | 100% (neither marks it) |
| ko | 938 | **0%** |
| vi | 138 | **0%** |

So: **derivable for Romance, Swahili, Russian, German and Indonesian; not derivable
for Turkish, Hindi, Arabic or French.** French is the instructive one — 177 of 466
words have curated capitals nowhere while espeak marks a stress, because French
stress is phrasal and the curated sheet capitalises the phrase-final syllable
(`par-lay voo zahn-GLEH`). Word-level stress marks are wrong for French *by design*,
not by G2P error. Turkish at 68% is a real espeak weakness.

**And the pilot's own policy has a bug worth reporting.** `policy: stress: caps`
applied wherever the IPA carries `ˈ` reproduces the four no-caps sheets (ja, ko, vi,
zh-Hans) only because the Mandarin IPA came from Pinyin, which carries no stress
mark. espeak *does* emit `ˈ` for Korean and Vietnamese, which have no lexical stress
— so an IPA-only heuristic would wrongly capitalise 938 Korean and 138 Vietnamese
words. **Stress marking needs one curated boolean per target language**
(`has_lexical_stress`), not a derived test. That is one field in
`data/registry/languages.csv`, it agrees exactly with the 11-vs-5 split
`RESPELL-SYSTEMS.md` reads off the corpus, and it is the one place in this pilot
where the derived approach fails and curation is required.

## 8. Vowel length

**How it rides in the data: it does not.** Because the respelling is generated from
IPA plus a rule set that is already keyed on (source language, accent), optionality
costs no data at all — it is a switch in the rule file, which is exactly where a
reader's preferences already live:

```yaml
policy:
  length: none      # none | double
```

`none` is the plain form and the default, so a reader who does not want it gets it by
doing nothing. Switching to `double` repeats the vowel letter in any syllable whose
IPA nucleus carries `ː`. No column is added, no cell is duplicated, and no curated
row changes. If the sheet ever wants it as a user-facing toggle it is one more
`accent`-like key on the same rule file, not a second `data/respell/` tree.

**Tested on real rows.** Which targets actually carry a length contrast, measured as
the share of aligned syllables whose IPA nucleus has `ː`:

| target | syllables | with `ː` | share |
|---|---|---|---|
| hi | 2,846 | 1,440 | 50.6% |
| ar | 1,091 | 299 | 27.4% |
| de | 3,568 | 891 | 25.0% |
| it | 4,698 | 261 | 5.6% |
| tr | 3,381 | 38 | 1.1% |
| **es** | 4,865 | **0** | **0%** |
| **zh-Hans** | 3,060 | **0** | **0%** |

So the notation is **inert for both pilot targets** — neither Spanish nor Mandarin
has a length contrast, and turning `double` on for them changes nothing. It matters
for Hindi, Arabic and German, and for Japanese.

**Japanese is the proof that the doubling convention is right, because the corpus
already invented it.** 286 of 754 Japanese rows have a long vowel in the curated
Hepburn column, and **285 of them (100%, one row off) double a letter in the curated
respelling**:

```
どうぞ       dōzo       →  dohh-zoh
パスポート   pasupōto   →  pah-su-pohh-toh
カードで…    kādo de…   →  kaah-doh deh…
今日         kyō        →  kyohh
```

`ō` is `ohh`, `ā` is `aah`, `ū` is `oo`. So the recommended notation is not a
proposal at all — it is `policy: length: double` reproducing what one curator
already did unprompted, which is the strongest possible argument for it. Note the
convention doubles the *silent* `h` of the digraph rather than the vowel letter
(`ohh`, not `oo` for `ō`), which is a rule the source-side file should record
explicitly because it is not what "double the vowel" naively means.

espeak marks the length with `ː` in 180 of 200 of those rows once the kanji problem
is solved, so the input signal is there.

## 9. Cost per language

Two independent axes, both measured. `algn` is the share of rows the pipeline can
line up syllable-for-syllable with the curated respelling — a floor on what any rule
set can score. `oracle-row` is what a *complete* rule table could reach on unseen
rows, decoupled from how many rules were actually written here (5-fold held-out
modal spelling per syllable-in-context). `gaps` is how many IPA symbols the current
99-entry table has no rule for.

| target | rows | algn | oracle-row | unseen keys | gaps | verdict |
|---|---|---|---|---|---|---|
| zh-Hans | 754 | 96.2% | **70.6%** | 4.8% | 0 | done (from Pinyin) |
| sw | 748 | 72.7% | 66.4% | 1.8% | 2 | cheap |
| id | 748 | 90.2% | 64.9% | 6.9% | 1 | cheap |
| es | 758 | 98.3% | 59.9% | 4.0% | 0 | done |
| vi | 748 | 41.8% | 52.7% | 16.8% | 6 | alignment problem first |
| tr | 746 | 85.4% | 52.0% | 10.7% | 4 | cheap rules, bad stress |
| it | 744 | 94.1% | 51.3% | 5.4% | 1 | cheap |
| hi | 746 | 73.5% | 45.4% | 13.1% | 8 | moderate |
| ko | 747 | 74.8% | 44.4% | 12.0% | 5 | moderate |
| pt | 748 | 56.0% | 40.3% | 9.6% | 3 | moderate |
| de | 756 | 91.3% | 37.8% | 13.8% | 4 | moderate |
| ja | 754 | 2.9% | — | — | 4 | needs a segmenter, then cheap |
| fr | 756 | 57.0% | 35.0% | 15.3% | 4 | expensive |
| ru | 746 | 87.8% | 27.6% | 14.4% | 5 | expensive |
| ar | 754 | 35.9% | 17.3% | 29.7% | 7 | expensive |
| th | 748 | — | — | — | — | **no G2P exists** |

`summary.md` predicted "machine G2P covers the shallow half (es, id, tr, sw, ru,
mostly de) cheaply, while th, ja, zh, ko, hi, en and fr have systematic phrase-level
errors". **That is right about five of six and wrong about two.**

- **Mandarin is the cheapest language in the set, not one of the expensive ones**,
  because the pack already ships a curated Pinyin column and Pinyin→IPA is a closed
  ~410-syllable table. The IPA column for `zh-Hans` needs no human review at all —
  it is a mechanical transform of data that has already been reviewed.
- **Japanese is cheap for the same reason.** The Hepburn column is already there,
  and `Hepburn words == curated respelling words in 754 of 754 rows (100.0%)`. With
  three rules — moraic `n` closes the preceding syllable, the first half of a
  geminate closes it too, final `-su` devoices to nothing — **syllable count agrees
  in 2,318 of 2,398 words (96.7%)**. The residue is `-tei-` and `ii`. So Japanese
  does not need espeak, does not need a kanji reader, and does not need a reviewer
  pass for the *units*; it needs a rule set over Hepburn.
- **Russian is expensive, not cheap.** 766 distinct syllable types over 3,477
  syllables and a 27.6% held-out ceiling: espeak's `ru` emits vowel reduction and
  palatalisation as phonetic detail (`ʲ ɭ ʑ ɵ ʌ`) that the curated respelling
  smooths away. Shallow orthography did not help.
- **The alignment column is the real cost driver for four languages.** Arabic 35.9%,
  Vietnamese 41.8%, Portuguese 56.0% and French 57.0% fail before any rule runs,
  because the curated sheets use a coarser unit than the IPA does — French 1.53
  syllables per word against Spanish 2.11, Vietnamese 1.15 with hyphens on only 46%
  of rows. Those sheets are not wrong; they are describing something else, and the
  rule set has to be told which unit to emit.
- **Japanese's 2.9% is a tokenisation artefact, not a phonology one** — Japanese text
  has no spaces, so word alignment against a space-separated respelling fails
  immediately. It is fixed by using Hepburn, above.

**How much of the 776-row IPA column needs human review.** IPA only ever draws on
`entry` rows — 398 of 776 concepts, as `summary.md` notes — so the real per-language
volume is under 400 cells, and the pilot's corpus is 745–758 rows because it counts
the phrases that exist. On that basis:

| | languages | machine-generated, spot-check only | needs a reviewer pass |
|---|---|---|---|
| romanisation already curated | zh-Hans, ja | ~100% | 0 |
| shallow orthography, espeak agrees | es, it, id, sw, tr | ~90% | the ~10% of rows with a loanword or a stress exception |
| deep or phonetically-detailed espeak output | de, pt, fr, ru, ko, hi, ar | ~60% | the rest, plus every row where G2P stress disagrees |
| no G2P | th | 0% | all of it |

The cheap tier is cheaper than `summary.md` assumed and the expensive tier is
narrower, but Thai got worse: it is not "expensive", it is "no tool exists in this
environment".

## 10. Is this worth building, and in what order

**Yes, as a fallback under the override layer, and the agreement rate justifies it
now.**

### What rate justifies shipping generated respellings as a fallback

The right threshold is not an exact-match rate. Exact-match against a curated sheet
measures agreement with one human's spelling habits, and 14% of the Spanish
disagreements are cases where the machine is *more* accurate than the human. The
threshold that matters for a card someone uses in a pharmacy is: **how often does the
generated string, read aloud by an English speaker, produce a pronunciation a native
would not recognise?**

Measured, that is **4.7% for Spanish and 13.0% for Mandarin** (rows still differing
after normalising away every identified convention difference). Narrowing to the
sub-class that would actually mislead — a capitalised syllable in a different place,
or no usable IPA at all:

| | Spanish | Mandarin |
|---|---|---|
| a capital sits on a different syllable | 8 rows (1.1%) | 0 |
| no usable IPA (currency symbol) | 2 rows (0.3%) | 0 |
| row contains a Latin-script loanword espeak mis-read | 16 rows (2.1%) | 3 rows (0.4%) |

So **1.4% of Spanish rows and none of the Mandarin rows carry a genuinely wrong
pronunciation**, plus a loanword class that is detectable by inspection rather than
by review. Mandarin's entire 13.0% residue is spelling convention.

For a column that today is **empty on 256 of 272 pairs**, a 1% wrong-pronunciation
rate under a curated override layer is a clear improvement over a blank cell. The
comparison is not generated-vs-curated; it is generated-vs-nothing.

Two gates make it safe:

1. **Never let a generated respelling silently replace a curated one.** The override
   layer stays authoritative — that is already the design, and it means the 16
   existing sheets never change.
2. **Refuse to generate rather than generate badly**, in three named cases: the row
   contains a Latin-script token in a non-Latin-script language (loanword), the row
   contains `{target}`/`{source}` and the language-name table has no entry, or the
   G2P returned nothing. All three are cheap to detect and together they account for
   most of the Group F residue. This is the same posture `summary.md` already takes
   with `confidence >= 2` on emergency numbers and with the `empty-column` warning:
   withhold rather than guess.

### Build order

1. **`en`/`en-US` first**, as `RESPELL-SYSTEMS.md` also concludes, and this pilot is
   most of it. The 99-entry table already covers Spanish and Mandarin with zero
   uncovered symbols; the work is extending `phonemes:` over the other 14 targets'
   inventories, which the `gaps` column sizes at 1–8 symbols each.
2. **The `ipa` column for `zh-Hans` and `ja`**, mechanically, from the Pinyin and
   Hepburn columns that already exist. No reviewer. These are free and they prove the
   column out end to end.
3. **`ipa` for es, it, id, sw, tr** from espeak-ng, with a reviewer pass restricted
   to rows flagged by the three refusal gates. Five shallow languages, ~10% review
   volume each.
4. **The `has_lexical_stress` boolean** in `data/registry/languages.csv` — 16 values,
   the only curated input the whole pipeline needs, and without it Korean and
   Vietnamese get capitals they must not have.
5. **`de, pt, fr, ru, ko, hi, ar`**, where the alignment unit has to be decided
   before the rules are written. For French and Portuguese that decision (which
   syllable unit the sheet emits) is worth more than any number of rules.
6. **`th` last, and separately**, because it needs a G2P that does not exist here.

### What breaks first at scale

- **The alignment unit, not the rules.** Four languages fail before a rule runs.
  Adding rules to a language whose curated sheet uses a different syllable unit
  raises nothing.
- **Stress on Turkish, Hindi, Arabic and French.** 68%, 63%, 56%, 60%. Capitals are
  the most visible thing in the column, so a wrong capital is the most visible error.
  For French the fix is structural (phrasal stress, not word stress); for Turkish it
  is a better G2P.
- **Curator inconsistency becomes a governance problem.** With a generator in place,
  the 16 existing sheets become 16 test suites that disagree with each other. The
  Mandarin `sh`/`sy` split at 64% is not a bug to fix; it is a decision nobody made.
  Either the generated output becomes the convention and the curated cells are
  gradually normalised to it, or the `targets:` blocks grow to encode each curator's
  habits. The first is cheaper and should be chosen deliberately rather than by
  default.
- **Loanwords, in every language.** espeak applies the target's letter-to-sound rules
  to `check-out`, `roaming`, `wifi`, `eSIM`. This is exactly the "plausible-looking
  wrong pronunciation" risk, and it is concentrated in the vocabulary a traveller is
  most likely to point at.
- **The language-name rows.** 6 rows per pack, they need the O(N²) name table, and
  they are the rows a lost traveller uses.

### What would make me say "not yet"

Nothing in Spanish or Mandarin. But **Thai should be treated as out of scope until a
G2P exists**, and **French and Portuguese should not be attempted until someone
decides what a French respelling's syllable is** — for those three the honest answer
today is "not yet, because the input is missing", and that is worth knowing before
any rule is written.

## Reproducing

```
pip3 install --user phonemizer dragonmapper pykakasi

python3 scripts/respell_pilot.py evidence          # correspondence tables from the corpus
python3 scripts/respell_pilot.py score             # exact/near/syllable rates + failures
python3 scripts/respell_pilot.py taxonomy es       # failures grouped by cause
python3 scripts/respell_pilot.py ceiling           # in-sample and held-out oracles
python3 scripts/respell_pilot.py coverage          # per-language cost table
python3 scripts/respell_pilot.py sweep             # the same rule table on 15 targets
python3 scripts/respell_pilot.py stress  <codes>   # stress-position agreement
python3 scripts/respell_pilot.py length            # vowel-length contrast per target
python3 scripts/respell_pilot.py mora              # Japanese, from the Hepburn column
```
