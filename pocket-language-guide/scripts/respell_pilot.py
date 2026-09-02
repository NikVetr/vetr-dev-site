#!/usr/bin/env python3
"""PROTOTYPE respelling transducer + measurement harness (feasibility pilot).

    python3 scripts/respell_pilot.py evidence [codes...]   # correspondence tables
    python3 scripts/respell_pilot.py ceiling  [codes...]   # oracle / held-out ceilings
    python3 scripts/respell_pilot.py score    [codes...]   # run the rules, grade them
    python3 scripts/respell_pilot.py stress   [codes...]   # does IPA stress survive
    python3 scripts/respell_pilot.py length                # vowel-length notation

Everything it writes lands in tmp/respell-pilot/. It reads data/ but never
writes there.
"""
import collections, csv, glob, json, os, random, re, sys
import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import respell_pilot_ipa as P

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tmp', 'respell-pilot')
RULES = os.path.join(ROOT, 'scripts', 'respell_pilot_rules.en-US.yaml')
VOWELS = 'aeiou'


# --------------------------------------------------------------- corpus access
def load_corpus(code):
    lang = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'data', 'lang', code, '*.csv'))):
        with open(f, newline='', encoding='utf-8') as fh:
            for r in csv.DictReader(fh):
                lang[r['concept_id']] = r
    rows = []
    with open(os.path.join(ROOT, 'data', 'respell', 'overrides',
                           f'{code}__en__en-US.csv'), newline='', encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            cid, respell = r['concept_id'], r['respell'].strip()
            if cid in lang and respell:
                e = lang[cid]
                rows.append({'cid': cid, 'text': e['text'], 'respell': respell,
                             'pinyin': e.get('romanization_pinyin', ''),
                             'hepburn': e.get('romanization_hepburn', '')})
    return rows


def gt_words(respell):
    return [w for w in (t.strip('?!.;') for t in re.split(r'\s+', respell.strip())) if w]


def analyse(code):
    """Target text -> [Word]. Placeholders and gender alternates are handled the
    way the curated sheets handle them, so alignment is not thrown off by them."""
    rows = load_corpus(code)
    if code == 'zh-Hans':
        return rows, lambda r: _words(_src_tokens(r['pinyin']), lambda w: P.zh_row(w)[0])
    vocab = sorted({P._split_tail(w)[0] for r in rows for w in _src_tokens(r['text'])
                    if not _is_ph(w)})
    lex = P.lexicon(vocab, code)
    json.dump(lex, open(f'{OUT}/{code}-lex.json', 'w'), ensure_ascii=False, indent=0)
    cl = P.onset_clusters(lex)
    return rows, lambda r: _words(_src_tokens(r['text']),
                                  lambda w: P.ipa_row(w, lex, code, cl)[0])


def _is_ph(w):
    return '{' in w or w == '/' or not re.search(r'[^\W_]', w, re.UNICODE)


def _src_tokens(text):
    """Tokens, with a word-internal gender alternate reduced to its first form
    (the curated sheets respell only that) and `+ cosa` metatext dropped."""
    toks = []
    for w in P.tokenize(text):
        if w == '+':
            break
        if '/' in w and w != '/':
            w = w.split('/')[0]
        toks.append(w)
    return toks


def _words(toks, one):
    out = []
    for w in toks:
        out.append({'src': w, 'tail': '', 'syls': None} if _is_ph(w) else one(w))
    return out


# ------------------------------------------------------------------- transducer
def load_rules(code, inventory=frozenset()):
    """The rule table is one file per (source, accent). `inventory` is the set of
    IPA symbols the target language actually uses, read off its own ipa column;
    rules may condition on it, which is how one table can write /p/ as <p> for a
    voicing language and as <b> for an aspirating one without a curated flag."""
    r = yaml.safe_load(open(RULES))
    t = (r.get('targets') or {}).get(code) or {}
    keep = [x for x in (t.get('phonemes') or []) + r['phonemes']
            if _inv_ok(x, inventory)]
    keep.sort(key=lambda x: -len(x['ipa']))     # longest IPA match wins
    return {'policy': {**r['policy'], **(t.get('policy') or {})},
            'splits': t['splits'] if 'splits' in t else r['splits'],
            'phonemes': keep, 'inventory': inventory,
            'fixups': (t.get('syllable_fixups') or []) + r['syllable_fixups']}


def _inv_ok(rule, inv):
    need, forbid = rule.get('if_inventory'), rule.get('unless_inventory')
    if need and not all(x in inv for x in need.split()):
        return False
    if forbid and any(x in inv for x in forbid.split()):
        return False
    return True


def inventory_of(words_iter, min_count=3):
    """Every 1-3 symbol substring the target's IPA contains at least `min_count`
    times, which is enough for a rule to ask "does this language have /pʰ/" or
    "can its /ŋ/ end a word" (`ŋ#`). The threshold is there so that one
    loanword cannot invent a phoneme: Spanish has exactly one word-final /ŋ/,
    in `roaming`, against 34 pre-velar ones."""
    c = collections.Counter()
    for words in words_iter:
        for w in words:
            t = ''.join(s['onset'] + s['nucleus'] + s['coda'] for s in w['syls'] or []) + '#'
            c.update(t[i:i + k] for i in range(len(t)) for k in (1, 2, 3))
    return frozenset(k for k, v in c.items() if v >= min_count)


def _holds(rule, ctx, prev_out):
    n = rule.get('if_nucleus')
    if n and ctx.get('nucleus') not in n.split():
        return False
    nx = rule.get('before_onset')
    if nx and ctx.get('next_onset', '')[:1] not in nx.split():
        return False
    pv = rule.get('after_nucleus')
    if pv and ctx.get('prev_nucleus') not in pv.split():
        return False
    for w in rule.get('when') or []:
        neg = w.startswith('not_')
        k = w[4:] if neg else w
        if ctx[k] == neg:
            return False
    ao = rule.get('after_out')
    if ao and not any(prev_out.endswith(x) for x in ao.split()):
        return False
    return True


def _spell_slot(ipa, slot, rules, ctx, out=''):
    head, i = len(out), 0
    while i < len(ipa):
        for rule in rules['phonemes']:
            if rule['slot'] not in (slot, 'any'):
                continue
            g = rule['ipa']
            if ipa.startswith(g, i) and _holds(rule, ctx, out):
                out += rule['out']
                i += len(g)
                break
        else:
            out += ipa[i]          # unknown symbol: pass through so it shows up
            i += 1
    return out[head:]


def _apply_splits(syls, rules):
    """Break an unreadable rising diphthong out into its own syllable."""
    out = []
    for s in syls:
        for sp in rules['splits']:
            g = sp['glide']
            head = s['onset']
            if not head or not s['nucleus'].startswith(g):
                continue
            if sp.get('only_after') and head not in sp['only_after'].split():
                continue
            if head in (sp.get('except_after') or '').split():
                continue
            out.append({'onset': head, 'nucleus': 'i' if g == 'j' else 'u',
                        'coda': '', 'stress': 0, 'tone': '', 'split': True})
            s = {**s, 'onset': '', 'nucleus': s['nucleus'][1:]}
            break
        out.append(s)
    return out


def respell_word(syls, rules):
    syls = _apply_splits(syls, rules)
    n = len(syls)
    pieces = []
    for i, s in enumerate(syls):
        ctx = {'word_initial': i == 0, 'word_final': i == n - 1,
               'open': not s['coda'], 'closed': bool(s['coda']),
               'has_onset': bool(s['onset']), 'no_onset': not s['onset'],
               'nucleus': s['nucleus'],
               'next_onset': syls[i + 1]['onset'] if i + 1 < n else '',
               'prev_nucleus': syls[i - 1]['nucleus'] if i else '',
               'stressed': s['stress'] == 1, 'unstressed': s['stress'] != 1}
        txt = _spell_slot(s['onset'], 'onset', rules, ctx)
        txt += _spell_slot(s['nucleus'], 'nucleus', rules, ctx, txt)
        txt += _spell_slot(s['coda'], 'coda', rules, ctx, txt)
        for f in rules['fixups']:
            if not _holds(f, ctx, ''):
                continue
            new = re.sub(f['match'], f['out'], txt)
            if new != txt:
                txt = new
                break
        if rules['policy']['length'] == 'double' and 'ː' in s['nucleus'] + s['coda']:
            txt = re.sub(r'([aeiou]+)', r'\1\1', txt, count=1)
        pieces.append(txt.upper() if (s['stress'] == 1 and n >= rules['policy']
                                      ['stress_min_syllables']
                                      and rules['policy']['stress'] == 'caps') else txt)
    return rules['policy']['syllable_separator'].join(pieces)


def respell_row(words, rules):
    out = []
    for w in words:
        out.append((w['src'] if w['syls'] is None
                    else respell_word(w['syls'], rules) if w['syls'] else '?')
                   + w.get('tail', ''))
    return rules['policy']['word_separator'].join(out)


# ------------------------------------------------------------------- alignment
def align(code):
    """Rows with the curated respelling split syllable-for-syllable against the
    IPA. The source-side reader splits are applied first, because they are part
    of the rule set: an English reader is given `see-ah` for /sja/."""
    rows, mk = analyse(code)
    built = [mk(r) for r in rows]
    rules = load_rules(code, inventory_of(built))
    res = []
    for r, words in zip(rows, built):
        gw = gt_words(r['respell'])
        rec = {**r, 'words': words, 'gw': gw, 'pairs': [], 'why': ''}
        if len(words) != len(gw):
            rec['why'] = 'word-count'
        else:
            for w, g in zip(words, gw):
                if w['syls'] is None or '{' in g:
                    continue
                if not w['syls']:
                    rec['why'] = 'no-ipa'
                    continue
                syls = _apply_splits(w['syls'], rules)
                gs = g.rstrip(',:').split('-')
                if len(gs) != len(syls):
                    rec['why'] = rec['why'] or 'syl-count'
                    continue
                for i, (s, t) in enumerate(zip(syls, gs)):
                    rec['pairs'].append({**s, 'gt': t, 'i': i, 'n': len(syls),
                                         'wfinal': i == len(syls) - 1,
                                         'winitial': i == 0})
        res.append(rec)
    return res


# ------------------------------------------------------------------- scoring
def norm(s):
    return re.sub(r'[^a-z{}]', '', s.lower())


def syl_norm(s):
    return [re.sub(r'[^a-z]', '', x) for x in re.split(r'[- ]', s.lower()) if x]


def edit(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def classify(gt, got):
    """Coarse cause for a mismatch, cheapest-explanation first."""
    if got == gt:
        return 'exact'
    if norm(got) == norm(gt):
        return 'stress/case or syllable division only'
    if norm(got).replace('-', '') != norm(gt).replace('-', '') and \
       syl_norm(got) != syl_norm(gt) and len(syl_norm(got)) != len(syl_norm(gt)):
        return 'syllable count differs'
    d = edit(norm(got), norm(gt))
    gs, ts = syl_norm(got), syl_norm(gt)
    if len(gs) == len(ts):
        diff = [(a, b) for a, b in zip(gs, ts) if a != b]
        if len(diff) == 1 and edit(*diff[0]) <= 1:
            return 'one letter in one syllable'
        if all(edit(a, b) <= 1 for a, b in diff):
            return 'one letter per syllable, several syllables'
    return f'multi-letter ({d} edits)'


def score(code, verbose=True):
    recs = align(code)
    rules = load_rules(code, inventory_of(r['words'] for r in recs))
    rows = []
    for r in recs:
        got = respell_row(r['words'], rules)
        gt = r['respell']
        rows.append({'cid': r['cid'], 'text': r['text'], 'gt': gt, 'got': got,
                     'why_align': r['why'], 'cause': classify(gt, got),
                     'ned': edit(norm(got), norm(gt)) / max(1, len(norm(gt)))})
    st = collections.Counter(x['cause'] for x in rows)
    n = len(rows)
    syl_hit = syl_tot = 0
    for x in rows:
        a, b = syl_norm(x['got']), syl_norm(x['gt'])
        syl_tot += len(b)
        if len(a) == len(b):
            syl_hit += sum(1 for p, q in zip(a, b) if p == q)
    if verbose:
        print(f'\n### {code}  n={n}')
        print(f'  exact match                  {st["exact"]:5d}  {100*st["exact"]/n:5.1f}%')
        loose = st['exact'] + st['stress/case or syllable division only']
        print(f'  + differs only in stress/div {loose:5d}  {100*loose/n:5.1f}%')
        near = loose + st['one letter in one syllable']
        print(f'  + one letter, one syllable   {near:5d}  {100*near/n:5.1f}%')
        print(f'  syllable-level agreement            {100*syl_hit/max(1,syl_tot):5.1f}%'
              f'  ({syl_hit}/{syl_tot})')
        print(f'  mean normalised edit distance       {sum(x["ned"] for x in rows)/n:5.3f}')
        print('  causes:')
        for k, v in st.most_common():
            print(f'    {k:44s} {v:5d}  {100*v/n:5.1f}%')
    with open(f'{OUT}/{code}-scored.tsv', 'w') as fh:
        fh.write('cid\ttext\tcurated\tgenerated\tcause\tned\talign\n')
        for x in sorted(rows, key=lambda x: -x['ned']):
            fh.write(f'{x["cid"]}\t{x["text"]}\t{x["gt"]}\t{x["got"]}\t{x["cause"]}'
                     f'\t{x["ned"]:.3f}\t{x["why_align"]}\n')
    return rows, st


# ------------------------------------------------------------------- ceilings
FEATS = {
    'syllable only':       lambda p: (p['onset'], p['nucleus'], p['coda']),
    '+ open/closed+final': lambda p: (p['onset'], p['nucleus'], p['coda'], p['wfinal']),
    '+ stress':            lambda p: (p['onset'], p['nucleus'], p['coda'], p['wfinal'],
                                      p['stress']),
    '+ word-initial':      lambda p: (p['onset'], p['nucleus'], p['coda'], p['wfinal'],
                                      p['stress'], p['winitial']),
}


def ceiling(code):
    recs = [r for r in align(code) if not r['why'] and r['pairs']]
    pairs = [p for r in recs for p in r['pairs']]
    print(f'\n### {code}: {len(recs)} rows align syllable-for-syllable, {len(pairs)} syllables')
    random.seed(11)
    idx = list(range(len(recs)))
    random.shuffle(idx)
    folds = [set(idx[i::5]) for i in range(5)]
    for name, f in FEATS.items():
        tab = collections.defaultdict(collections.Counter)
        for p in pairs:
            tab[f(p)][p['gt'].lower()] += 1
        modal = {k: c.most_common(1)[0][0] for k, c in tab.items()}
        sh = sum(1 for p in pairs if modal[f(p)] == p['gt'].lower())
        rh = sum(1 for r in recs if all(modal[f(p)] == p['gt'].lower() for p in r['pairs']))
        # held out: fit the table on 4 folds, apply to the 5th
        hs = ht = hr = hrt = 0
        for fold in folds:
            tr = [p for i, r in enumerate(recs) if i not in fold for p in r['pairs']]
            t2 = collections.defaultdict(collections.Counter)
            for p in tr:
                t2[f(p)][p['gt'].lower()] += 1
            m2 = {k: c.most_common(1)[0][0] for k, c in t2.items()}
            for i in fold:
                ok = True
                for p in recs[i]['pairs']:
                    ht += 1
                    if m2.get(f(p)) == p['gt'].lower():
                        hs += 1
                    else:
                        ok = False
                hrt += 1
                hr += ok
        print(f'  {name:20s} keys={len(tab):5d} | in-sample syl {100*sh/len(pairs):5.1f}%'
              f' row {100*rh/len(recs):5.1f}% | held-out syl {100*hs/ht:5.1f}%'
              f' row {100*hr/hrt:5.1f}%')


# ---------------------------------------------------------- stress and length
def stress_check(code):
    recs = [r for r in align(code) if not r['why'] and r['pairs']]
    tot = hit = nostress = 0
    conf = collections.Counter()
    for r in recs:
        for w, g in zip(r['words'], gt_words(r['respell'])):
            if w['syls'] is None or '{' in g or not w['syls']:
                continue
            gs = g.split('-')
            if len(gs) != len(w['syls']) or len(gs) < 2:
                continue
            gt_i = [i for i, x in enumerate(gs) if x.isupper() or
                    (re.search(r'[A-Z]', x) and x == x.upper())]
            ip_i = [i for i, s in enumerate(w['syls']) if s['stress'] == 1]
            tot += 1
            if not ip_i:
                nostress += 1
            conf[(len(gt_i), len(ip_i))] += 1
            if gt_i and ip_i and gt_i[0] == ip_i[0]:
                hit += 1
            elif not gt_i and not ip_i:
                hit += 1
    print(f'  {code}: {tot} polysyllabic words; stress position agrees on '
          f'{hit} ({100*hit/max(1,tot):.1f}%); IPA carried no stress mark in {nostress}')
    print(f'    (n_caps_syllables, n_ipa_stresses) -> count: '
          f'{dict(sorted(conf.items(), key=lambda x:-x[1])[:6])}')


def length_check(codes):
    """Does the curated respelling encode vowel length, and does the IPA carry
    it? For every aligned syllable, compare what the curator wrote for the same
    onset+quality with and without a length mark on the nucleus."""
    print(f'{"lang":6s} {"syls":>5s} {"long":>6s} {"share":>6s}  contrasting pairs '
          f'(same onset+vowel, short vs long)')
    for code in codes:
        recs = [r for r in align(code) if not r['why'] and r['pairs']]
        pairs = [p for r in recs for p in r['pairs']]
        if not pairs:
            print(f'{code:6s} -- no alignment')
            continue
        by = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
        for p in pairs:
            nuc = p['nucleus']
            key = (p['onset'], nuc.replace('ː', '').replace('ˑ', ''), p['coda'])
            by[key]['long' if 'ː' in nuc else 'short'][p['gt'].lower()] += 1
        nl = sum(1 for p in pairs if 'ː' in p['nucleus'])
        shown = []
        for key, d in sorted(by.items(), key=lambda kv: -sum(len(x) for x in kv[1].values())):
            if len(d) == 2 and len(shown) < 4:
                a = d['short'].most_common(1)[0][0]
                b = d['long'].most_common(1)[0][0]
                if a != b:
                    shown.append(f'{"".join(key)}: {a} / {b}')
        print(f'{code:6s} {len(pairs):5d} {nl:6d} {100*nl/len(pairs):5.1f}%  '
              + ' | '.join(shown))


def length_demo():
    """The one target whose curated sheet already notates length: Japanese, via
    the Hepburn column. Shown against espeak-ng's own length marks."""
    from phonemizer.backend import EspeakBackend
    b = EspeakBackend('ja', with_stress=True, language_switch='remove-flags')
    rows = load_corpus('ja')
    long_hep = [r for r in rows if re.search(r'[āīūēōâîûêô]|([aeiou])\1', r['hepburn'] or '')]
    print(f'  ja: {len(long_hep)}/{len(rows)} rows have a long vowel in the curated Hepburn')
    dbl = [r for r in long_hep if re.search(r'(hh|aa|oo|ee|ii|uu)', r['respell'])]
    print(f'      {len(dbl)} of those ({100*len(dbl)/len(long_hep):.0f}%) double a letter '
          f'in the curated respelling; the sheet writes o: as <ohh> and a: as <aah>')
    ipa = b.phonemize([r['text'] for r in long_hep[:200]], strip=True)
    with_mark = sum(1 for x in ipa if 'ː' in x)
    print(f'      espeak-ng marks length with <ː> in {with_mark}/200 of them')
    for r, x in list(zip(long_hep, ipa))[:6]:
        print(f'        {r["text"][:14]:16s} {r["hepburn"][:20]:22s} {x[:34]:36s} {r["respell"][:32]}')


# ------------------------------------------------------------------ Japanese
# Japanese is not one of the two pilot targets, but it is the cheap-or-expensive
# question in miniature: espeak-ng's ja voice cannot read kanji at all (it
# renders it as the English words "Chinese letter"), while the pack already
# ships a curated Hepburn column. This measures whether that column alone
# recovers the units the curated respelling divides on.
JA_ONSETS = ('kky', 'ppy', 'tch', 'ssh', 'chch', 'ch', 'sh', 'ts', 'ky', 'gy', 'ny',
             'hy', 'by', 'py', 'my', 'ry', 'jy', 'dy', 'ty', 'k', 'g', 's', 'z', 't',
             'd', 'n', 'h', 'b', 'p', 'm', 'y', 'r', 'w', 'f', 'j', 'v')
JA_VOWELS = 'aeiouāīūēō'


def ja_syllables(word):
    """Hepburn -> the units the curated ja respelling hyphenates on: a syllable,
    with the moraic n as a coda (<kohn-nih>, not <ko-n-ni>) and the first half
    of a geminate closing the syllable before it (<mah-gat-teh>)."""
    w, out, i = word.lower(), [], 0
    while i < len(w):
        if w[i] not in JA_VOWELS and w[i] != "'":
            for o in JA_ONSETS:
                if w.startswith(o, i):
                    break
            else:
                o = w[i]
            # a doubled consonant closes the previous syllable
            if out and len(o) == 1 and w.startswith(o * 2, i):
                out[-1] += o
                i += 1
                continue
            if o == 'n' and (i + 1 >= len(w) or w[i + 1] not in JA_VOWELS
                             or (w[i + 1] == "'" if False else False)):
                if out:                       # moraic n
                    out[-1] += 'n'
                else:
                    out.append('n')
                i += 1
                continue
            i += len(o)
        else:
            o = ''
        if i < len(w) and w[i] in JA_VOWELS:
            v = w[i]
            i += 1
            if i < len(w) and w[i] == 'ー':
                i += 1
            out.append(o + v)
        elif o:
            out.append(o)
        if i < len(w) and w[i] == "'":
            i += 1
    # final /u/ after /s/ devoices to nothing: masu -> mahss, desu -> dess
    if len(out) > 1 and out[-1] == 'su':
        out.pop()
        out[-1] += 'su'
    # /ei/ is one long vowel, not two units: rei -> rehh
    for k in range(len(out) - 1, 0, -1):
        if out[k] == 'i' and out[k - 1].endswith('e'):
            out[k - 1] += 'i'
            out.pop(k)
    return out


def mora_check():
    rows = load_corpus('ja')
    wtot = wok = 0
    bad = []
    for r in rows:
        hw = [w for w in re.split(r'\s+', (r['hepburn'] or '').strip()) if w]
        gw = gt_words(r['respell'])
        if len(hw) != len(gw):
            continue
        for h, g in zip(hw, gw):
            if '{' in h:
                continue
            m = ja_syllables(h.strip('.,?!'))
            n = g.rstrip(',:').split('-')
            wtot += 1
            if len(m) == len(n):
                wok += 1
            elif len(bad) < 40:
                bad.append((h, '-'.join(m), g))
        # word counts
    nrow = sum(1 for r in rows
               if len([w for w in re.split(r'\s+', (r['hepburn'] or '').strip()) if w])
               == len(gt_words(r['respell'])))
    print(f'  ja: curated Hepburn words == curated respelling words in '
          f'{nrow}/{len(rows)} rows ({100*nrow/len(rows):.1f}%)')
    print(f'      syllable count agrees in {wok}/{wtot} words ({100*wok/wtot:.1f}%)')
    for b in bad[:14]:
        print(f'        {b[0]:22s} {b[1]:26s} {b[2]}')


# ----------------------------------------------------------------- evidence
def evidence(code):
    recs = align(code)
    pairs = [p for r in recs for p in r['pairs']]
    why = collections.Counter(r['why'] or 'ok' for r in recs)
    print(f'\n### {code}: {len(recs)} rows -> {dict(why)}, {len(pairs)} aligned syllables')
    for name, key in (('syllable', lambda p: p['onset'] + '|' + p['nucleus'] + p['coda']),
                      ('onset', lambda p: p['onset']),
                      ('rime', lambda p: p['nucleus'] + p['coda'])):
        tab = collections.defaultdict(collections.Counter)
        for p in pairs:
            tab[key(p)][p['gt'].lower()] += 1
        with open(f'{OUT}/{code}-{name}-evidence.tsv', 'w') as fh:
            fh.write(f'{name}\tcount\ttop_share\tspellings\n')
            for k, c in sorted(tab.items(), key=lambda kv: -sum(kv[1].values())):
                t = sum(c.values())
                fh.write(f'{k}\t{t}\t{c.most_common(1)[0][1]/t:.3f}\t'
                         f'{" ".join(f"{a}:{b}" for a, b in c.most_common(8))}\n')
        if name == 'syllable':
            cons = sum(c.most_common(1)[0][1] for c in tab.values())
            print(f'  {len(tab)} distinct IPA syllables; a perfect syllable lexicon would '
                  f'reproduce {100*cons/max(1,len(pairs)):.1f}% of curated syllables')
    return recs


# Each probe is a normalisation applied to both strings. The first probe that
# makes them equal is the cause: a failure attributed to "ah/a" differs only in
# which digraph was chosen for a vowel, one attributed to "b/v" is unrecoverable
# from IPA. Ordered cheapest-explanation first.
PROBES = [
    ('stress (capitals only)',      lambda s: s.lower()),
    ('syllable division',           lambda s: s.lower().replace('-', '')),
    ('b/v -- not recoverable from IPA',
                                    lambda s: re.sub('[bv]', 'b', s.lower())),
    ('vowel digraph ah/a, oh/o, eh/e',
                                    lambda s: re.sub(r'([aeo])h', r'\1', s.lower())),
    ('ow/aow, oh/ow diphthong shape',
                                    lambda s: s.lower().replace('aow', 'ow').replace('oh', 'ow')),
    ('sh/sy sibilant choice',       lambda s: s.lower().replace('sy', 'sh')),
    ('ee/i, oo/u vowel digraph',    lambda s: s.lower().replace('ee', 'i').replace('oo', 'u')),
    ('r/rr trill length',           lambda s: s.lower().replace('rr', 'r')),
    ('single vowel letter elsewhere',
                                    lambda s: re.sub(r'[aeiouy]+', 'V', s.lower())),
    ('single consonant letter',     lambda s: re.sub(r'[^aeiouy -]+', 'C', s.lower())),
]


def taxonomy(code, show=3):
    rows, _ = score(code, verbose=False)
    buckets = collections.defaultdict(list)
    for x in rows:
        if x['cause'] == 'exact':
            buckets['exact'].append(x)
            continue
        if re.search(r'\{(target|source)\}', x['got']):
            buckets['names a language: needs the language-name table'].append(x)
            continue
        if re.search(r'[^\x00-\x7f]', x['got']):
            buckets['G2P produced no usable IPA (symbol row, loanword)'].append(x)
            continue
        for name, f in PROBES:
            a, b = f(x['got']), f(x['gt'])
            if a == b or (name != 'stress (capitals only)'
                          and a.replace('-', '') == b.replace('-', '')):
                buckets[name].append(x)
                break
        else:
            buckets['unrelated: two or more independent differences'].append(x)
    n = len(rows)
    print(f'\n## {code}: failure taxonomy over {n} rows')
    order = sorted(buckets.items(), key=lambda kv: -len(kv[1]))
    for name, xs in order:
        print(f'  {len(xs):4d}  {100*len(xs)/n:5.1f}%  {name}')
    with open(f'{OUT}/{code}-taxonomy.tsv', 'w') as fh:
        fh.write('bucket\tcid\ttext\tcurated\tgenerated\n')
        for name, xs in order:
            for x in xs:
                fh.write(f'{name}\t{x["cid"]}\t{x["text"]}\t{x["gt"]}\t{x["got"]}\n')
    print(f'  (all cases in {OUT}/{code}-taxonomy.tsv)')
    for name, xs in order:
        if name == 'exact':
            continue
        print(f'\n  --- {name} ({len(xs)})')
        for x in xs[:show]:
            print(f'      {x["text"][:34]:36s} curated {x["gt"][:42]:44s} got {x["got"][:42]}')
    return buckets


def coverage(codes):
    """Per language: can the pipeline see the syllables at all, what could a
    complete rule table achieve (held-out oracle), and how many IPA symbols the
    current en-US table has no rule for."""
    print(f'{"lang":8s} {"rows":>5s} {"algn":>6s} {"syls":>5s} {"types":>6s} '
          f'{"oracle-syl":>11s} {"oracle-row":>11s} {"unseen":>7s} {"gaps":>5s}  '
          f'uncovered IPA symbols')
    random.seed(11)
    for code in codes:
        recs = align(code)
        rules = load_rules(code, inventory_of(r['words'] for r in recs))
        good = [r for r in recs if not r['why'] and r['pairs']]
        pairs = [p for r in good for p in r['pairs']]
        if not pairs:
            print(f'{code:8s} {len(recs):5d}   0.0%  -- no syllable alignment')
            continue
        key = lambda p: (p['onset'], p['nucleus'], p['coda'], p['wfinal'])
        idx = list(range(len(good)))
        random.shuffle(idx)
        hs = ht = hr = hrt = miss = 0
        for f in range(5):
            fold = set(idx[f::5])
            tab = collections.defaultdict(collections.Counter)
            for i, r in enumerate(good):
                if i not in fold:
                    for p in r['pairs']:
                        tab[key(p)][p['gt'].lower()] += 1
            modal = {k: c.most_common(1)[0][0] for k, c in tab.items()}
            for i in fold:
                ok = True
                for p in good[i]['pairs']:
                    ht += 1
                    k = key(p)
                    if k not in modal:
                        miss += 1
                    if modal.get(k) == p['gt'].lower():
                        hs += 1
                    else:
                        ok = False
                hrt += 1
                hr += ok
        # rule gaps: IPA symbols the table passes straight through
        gaps = collections.Counter()
        for r in good:
            for p in r['pairs']:
                for part in ('onset', 'nucleus', 'coda'):
                    got = _spell_slot(p[part], part, rules,
                                      {'word_initial': p['winitial'], 'word_final': p['wfinal'],
                                       'open': not p['coda'], 'closed': bool(p['coda']),
                                       'has_onset': bool(p['onset']), 'no_onset': not p['onset'],
                                       'nucleus': p['nucleus'], 'next_onset': '',
                                       'stressed': p['stress'] == 1, 'unstressed': p['stress'] != 1})
                    for ch in got:
                        if ord(ch) > 127:
                            gaps[ch] += 1
        types = len({(p['onset'], p['nucleus'], p['coda']) for p in pairs})
        print(f'{code:8s} {len(recs):5d} {100*len(good)/len(recs):5.1f}% {len(pairs):5d} '
              f'{types:6d} {100*hs/ht:10.1f}% {100*hr/hrt:10.1f}% {100*miss/ht:6.1f}% '
              f'{len(gaps):5d}  {"".join(k for k, _ in gaps.most_common(14))}')


def sweep():
    """The same rule table, unchanged, against every target espeak-ng can reach.
    es and zh-Hans are the two it was written from; the rest are held out."""
    print(f'{"lang":8s} {"rows":>5s} {"aligned":>8s} {"exact":>7s} {"loose":>7s} '
          f'{"near":>7s} {"syl":>7s} {"nedit":>6s}  note')
    for code in ['es', 'zh-Hans'] + [c for c in sorted(P.VOICES) if c != 'es']:
        try:
            rows, st = score(code, verbose=False)
        except Exception as e:
            print(f'{code:8s} {"":>5s} {"":>8s} -- {type(e).__name__}: {str(e)[:50]}')
            continue
        n = len(rows)
        al = 100 * sum(1 for x in rows if not x['why_align']) / n
        ex = 100 * st['exact'] / n
        lo = ex + 100 * st['stress/case or syllable division only'] / n
        ne = lo + 100 * st['one letter in one syllable'] / n
        hit = tot = 0
        for x in rows:
            a, b = syl_norm(x['got']), syl_norm(x['gt'])
            tot += len(b)
            if len(a) == len(b):
                hit += sum(1 for p, q in zip(a, b) if p == q)
        med = sum(x['ned'] for x in rows) / n
        tag = 'tuned on' if code in ('es', 'zh-Hans') else 'held out'
        print(f'{code:8s} {n:5d} {al:7.1f}% {ex:6.1f}% {lo:6.1f}% {ne:6.1f}% '
              f'{100*hit/max(1,tot):6.1f}% {med:6.3f}  {tag}')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'score'
    codes = sys.argv[2:] or ['es', 'zh-Hans']
    if cmd == 'length':
        length_check(sys.argv[2:] or ['es', 'zh-Hans', 'de', 'ar', 'hi', 'it', 'tr'])
        length_demo()
    elif cmd == 'sweep':
        sweep()
    elif cmd == 'mora':
        mora_check()
    elif cmd == 'coverage':
        coverage(sys.argv[2:] or ['es', 'zh-Hans'] + [c for c in sorted(P.VOICES) if c != 'es'])
    else:
        for c in codes:
            {'evidence': evidence, 'ceiling': ceiling, 'score': score,
             'stress': stress_check, 'taxonomy': taxonomy}[cmd](c)
