"""PROTOTYPE (feasibility pilot, not shipped code).

IPA acquisition + syllabification for the respelling pilot. Two targets:

  es       espeak-ng (voice es-419) -- Latin-American Spanish, which is the
           variety the curated respellings assume (seseo, yeismo).
  zh-Hans  the pack's own curated Pinyin column -> IPA by table (dragonmapper).
           espeak-ng's `cmn` voice emits non-standard ASCII ("ts.", "s.", tone
           digits glued into the rime) and is not usable as an IPA source.

Output is a uniform structure so the transducer never sees a language name:

  row  = {"cid","text","words":[Word]}
  Word = {"src","syls":[Syl]}
  Syl  = {"onset":str,"nucleus":str,"coda":str,"stress":0|1|2,"tone":str}

`stress` and `tone` come from the IPA itself, which is what lets one rule set
serve every target: a target without lexical stress simply never sets it.
"""
import re, sys

# ---------------------------------------------------------------- inventories
# Language-independent: espeak-ng emits IPA, so the vowel set is the IPA vowel
# set. espeak writes a falling diphthong's offglide as <ɪ>/<ʊ>, which the span
# logic below absorbs into the preceding nucleus; a lone ɪ or ʊ next to a
# consonant is still a full vowel.
VOWELS = set('iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒ')
GLIDES = set('jwɥ')
VOWEL_TAIL = set('ːˑ̃̃ ̯')          # length, nasalisation: part of the nucleus
# espeak emits phonetic detail; a voiced fricative that is an allophone of a
# stop must count as that stop when deciding what may open a syllable, or
# Spanish <ah-BLAR> comes out as <ahb-LAR>.
ALLOPHONES = {'β': 'b', 'ð': 'd', 'ɣ': 'ɡ', 'ʋ': 'v'}

# espeak-ng's es-419 output needs three normalisations before it is usable as a
# phonemic string. All three are G2P artefacts, not dialect choices.
ESPEAK_ES_FIXUPS = [
    ('ɾɾ', 'r'),    # word-initial r and orthographic rr both come out doubled
    ('jj', 'ʝ'),    # <ll>/<y> come out as ʝ in some words and jj in others
    ('ɛ', 'e'),     # pre-nasal allophone of /e/
    ('tʃ', 'ʧ'),    # one affricate, so it is not divided across a syllable break
]
def onset_clusters(lexicon):
    """Which consonant clusters may open a syllable, read off the language's own
    IPA: whatever opens a word may open a syllable. Spanish therefore gets
    /pɾ bl tɾ/ but not /st/ (so <es-TA>, not <e-STA>), while German gets /ʃt/,
    with no phonotactic table curated per language."""
    out = set()
    for ipa in lexicon.values():
        ph = [ALLOPHONES.get(c, c) for c in ipa
              if c not in STRESS_MARKS and c not in VOWEL_TAIL]
        run = ''
        for c in ph:
            if c in VOWELS or c in GLIDES:
                break
            run += c
        for k in (2, 3):
            if len(run) >= k:
                out.add(run[:k])
    return out

STRESS_MARKS = {'ˈ': 1, 'ˌ': 2}
TONE_CHARS = set('˥˦˧˨˩')


def _normalize_es(ipa):
    for a, b in ESPEAK_ES_FIXUPS:
        ipa = ipa.replace(a, b)
    if ipa.endswith('ʝ'):           # word-final <y> is a glide, not a fricative
        ipa = ipa[:-1] + 'j'
    return ipa


def split_syllables(ipa, clusters=frozenset()):
    """Syllabify an IPA word: nucleus spans, then onset maximisation over a
    cluster table. Language-independent except for the espeak-es normalisation."""
    ipa = _normalize_es(ipa)
    units = []                       # [(phoneme, stress_of_pending_syllable)]
    pending = 0
    for ch in ipa:
        if ch in STRESS_MARKS:
            pending = STRESS_MARKS[ch]
            continue
        if ch in VOWEL_TAIL:         # length / nasalisation joins its vowel
            if units:
                units[-1] = (units[-1][0] + ch, units[-1][1])
            continue
        units.append((ch, pending))
        pending = 0

    n = len(units)
    ph = [p for p, _ in units]
    if not any(p[0] in VOWELS for p in ph):
        return [{'onset': ''.join(ph), 'nucleus': '', 'coda': '',
                 'stress': 0, 'tone': ''}]

    # nucleus spans: a vowel plus its falling glides, then its rising glides.
    # A glide that sits between two vowels is rising, i.e. it opens the second.
    spans, i = [], 0
    while i < n:
        if ph[i][0] in VOWELS:
            lo = hi = i
            while hi + 1 < n and (ph[hi + 1] in GLIDES or ph[hi + 1][0] in 'ɪʊ'):
                hi += 1
            while hi > lo and ph[hi] in GLIDES and hi + 1 < n and ph[hi + 1][0] in VOWELS:
                hi -= 1
            spans.append([lo, hi])
            i = hi + 1
        else:
            i += 1
    taken = {j for lo, hi in spans for j in range(lo, hi + 1)}
    for sp in spans:
        while sp[0] - 1 >= 0 and ph[sp[0] - 1] in GLIDES and sp[0] - 1 not in taken:
            sp[0] -= 1
            taken.add(sp[0])

    cuts = []
    for (_, ahi), (blo, _) in zip(spans, spans[1:]):
        inter = list(range(ahi + 1, blo))
        if not inter:
            cut = blo
        elif len(inter) == 1:
            cut = inter[0]
        elif len(inter) > 2 and _fold(ph, inter[-3:]) in clusters:
            cut = inter[-3]
        elif _fold(ph, inter[-2:]) in clusters:
            cut = inter[-2]
        else:
            cut = inter[-1]
        cuts.append(cut)

    bounds = [0] + cuts + [n]
    out = []
    for (s0, s1), sp in zip(zip(bounds, bounds[1:]), spans):
        chunk = units[s0:s1]
        lo, hi = sp[0] - s0, sp[1] - s0
        st = max((x for _, x in chunk), default=0)
        out.append({'onset': ''.join(p for p, _ in chunk[:lo]),
                    'nucleus': ''.join(p for p, _ in chunk[lo:hi + 1]),
                    'coda': ''.join(p for p, _ in chunk[hi + 1:]),
                    'stress': st, 'tone': ''})
    return out


def _fold(ph, idx):
    return ''.join(ALLOPHONES.get(ph[j], ph[j]) for j in idx)


def _promote_single_stress(word_syls):
    """espeak marks stress even on monosyllables and adds secondary stress the
    curated sheets never capitalise. Keep exactly one primary per word."""
    prim = [s for s in word_syls if s['stress'] == 1]
    if not prim:                     # only secondary marks survived
        sec = [s for s in word_syls if s['stress'] == 2]
        if sec:
            sec[0]['stress'] = 1
    for s in word_syls:
        if s['stress'] == 2:
            s['stress'] = 0
    seen = False
    for s in word_syls:
        if s['stress'] == 1:
            if seen:
                s['stress'] = 0
            seen = True
    return word_syls


# ------------------------------------------------------------------- Mandarin
ZH_VOWELS = set('aeiouyɑɔɛɜəɤɨɯʊɥœɪ')
ZH_MEDIALS = set('jwɥ')


def _split_syllable_zh(ipa):
    """One Mandarin syllable of dragonmapper IPA -> onset/medial+nucleus/coda."""
    tone = ''.join(c for c in ipa if c in TONE_CHARS)
    core = ''.join(c for c in ipa if c not in TONE_CHARS)
    i = 0
    while i < len(core) and core[i] not in ZH_VOWELS:
        i += 1
    onset, rest = core[:i], core[i:]
    j = len(rest)
    while j > 0 and rest[j - 1] in 'nŋɻ':
        j -= 1
    return {'onset': onset, 'nucleus': rest[:j], 'coda': rest[j:],
            'stress': 0, 'tone': tone}


# ---------------------------------------------------------------- entry points
# target -> espeak-ng voice. th has no espeak voice at all; zh-Hans is done
# from the pack's own Pinyin column instead, because espeak's cmn voice does
# not emit standard IPA.
VOICES = {'ar': 'ar', 'de': 'de', 'es': 'es-419', 'fr': 'fr-fr', 'hi': 'hi',
          'id': 'id', 'it': 'it', 'ja': 'ja', 'ko': 'ko', 'pt': 'pt-br',
          'ru': 'ru', 'sw': 'sw', 'tr': 'tr', 'vi': 'vi'}


def lexicon(words, code='es'):
    from phonemizer.backend import EspeakBackend
    b = EspeakBackend(VOICES[code], with_stress=True, language_switch='remove-flags')
    ipa = b.phonemize(list(words), strip=True)
    if code == 'es':
        ipa = [_normalize_es(x) for x in ipa]
    return dict(zip(words, ipa))


def ipa_row(text, lex, code='es', clusters=frozenset()):
    out = []
    for w in tokenize(text):
        w, tail = _split_tail(w)
        ipa = lex.get(w, '')
        out.append({'src': w, 'tail': tail, 'ipa': ipa,
                    'syls': _promote_single_stress(
                        split_syllables(ipa, clusters)) if ipa else []})
    return out


def zh_row(pinyin):
    from dragonmapper import transcriptions as tr
    out = []
    for w in tokenize(pinyin):
        w, tail = _split_tail(w)
        try:
            ipa = tr.pinyin_to_ipa(w)
        except Exception:
            out.append({'src': w, 'tail': tail, 'ipa': '', 'syls': []})
            continue
        out.append({'src': w, 'tail': tail, 'ipa': ipa.replace(' ', '.'),
                    'syls': [_split_syllable_zh(s) for s in ipa.split()]})
    return out


# A comma or colon survives into the respelling in every curated sheet, so it
# is carried on the token rather than stripped.
_PUNCT = '¿¡?!.;"“”«»…()[]、。？！'
_TAIL = '，,:：'


def _split_tail(w):
    t = w.rstrip()[-1:]
    return (w.rstrip(_TAIL), {'，': ',', '：': ':'}.get(t, t)) if t in _TAIL else (w, '')


def tokenize(text):
    text = text.strip()
    toks = []
    for w in re.split(r'\s+', text):
        w = w.strip(_PUNCT)
        if w:
            toks.append(w)
    return toks
