#!/usr/bin/env python3
"""Validate chapter JSON files against data/schema.md.

  python3 tools/validate.py                 # all registered chapters + any data/vl*.json
  python3 tools/validate.py data/vl01-neuroglia.json
"""
import glob, json, os, re, sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TYPES = {'single', 'multi', 'combo', 'open', 'label', 'order'}
ALLOWED_TAGS = {'b', 'i', 'sub', 'sup', 'br'}


def check_html(s, where, errs):
    for tag in re.findall(r'</?\s*([a-zA-Z0-9]+)', s or ''):
        if tag.lower() not in ALLOWED_TAGS:
            errs.append(f'{where}: unerlaubtes HTML-Tag <{tag}>')


def check_file(path, seen_ids):
    errs, warns = [], []
    try:
        ch = json.load(open(path, encoding='utf-8'))
    except Exception as e:
        return [f'{path}: JSON-Fehler: {e}'], []
    for k in ('id', 'title', 'short', 'color', 'topics', 'questions'):
        if k not in ch:
            errs.append(f'{path}: Kapitel-Feld "{k}" fehlt')
    topics = set(ch.get('topics', []))
    used = Counter()
    for q in ch.get('questions', []):
        qid = q.get('id', '?')
        w = f'{os.path.basename(path)}:{qid}'
        if qid in seen_ids:
            errs.append(f'{w}: doppelte ID (auch in {seen_ids[qid]})')
        seen_ids[qid] = os.path.basename(path)
        if not qid.startswith(ch.get('id', '') + '-'):
            errs.append(f'{w}: ID muss mit "{ch.get("id")}-" beginnen')
        t = q.get('type')
        if t not in TYPES:
            errs.append(f'{w}: unbekannter type {t!r}'); continue
        for k in ('topic', 'source', 'ref', 'stem', 'explanation'):
            if not q.get(k):
                errs.append(f'{w}: Feld "{k}" fehlt/leer')
        if q.get('topic') not in topics:
            errs.append(f'{w}: topic {q.get("topic")!r} nicht in topics')
        used[q.get('topic')] += 1
        if q.get('source') not in ('exam', 'slides', 'book'):
            errs.append(f'{w}: source muss exam|slides|book sein')
        if q.get('source') == 'exam' and not q.get('exam'):
            errs.append(f'{w}: source=exam ohne "exam"-Semester')
        check_html(q.get('stem'), w + ' stem', errs)
        check_html(q.get('explanation'), w + ' explanation', errs)
        if t in ('single', 'multi'):
            opts = q.get('options') or []
            nc = sum(1 for o in opts if o.get('correct'))
            if len(opts) < 2: errs.append(f'{w}: < 2 options')
            if nc < 1: errs.append(f'{w}: keine richtige Option')
            if t == 'single' and nc != 1: errs.append(f'{w}: single braucht genau 1 richtige Option (hat {nc})')
            if t == 'multi' and nc < 1: errs.append(f'{w}: multi ohne richtige Option')
            for o in opts:
                if not o.get('t'): errs.append(f'{w}: leere Option')
                check_html(o.get('t'), w + ' option', errs)
            if len({o.get('t') for o in opts}) != len(opts): errs.append(f'{w}: doppelte Optionstexte')
        elif t == 'combo':
            st = q.get('statements') or []
            if len(st) < 3: errs.append(f'{w}: combo braucht ≥ 3 statements')
            letters = 'ABCDEFGH'[:len(st)]
            right = ''.join(l for l, s in zip(letters, st) if s.get('correct'))
            if 'combos' in q:
                cs = q['combos']
                if right not in cs: errs.append(f'{w}: richtige Kombination "{right}" fehlt in combos {cs}')
                for c in cs:
                    if any(ch_ not in letters for ch_ in c): errs.append(f'{w}: combo "{c}" nutzt unbekannte Buchstaben')
                if len(set(cs)) != len(cs): errs.append(f'{w}: doppelte combos')
            for s in st: check_html(s.get('t'), w + ' statement', errs)
        elif t == 'open':
            pts = q.get('points') or []
            if not pts: errs.append(f'{w}: open ohne points')
            need = q.get('need')
            if need is not None and not (1 <= need <= len(pts)): errs.append(f'{w}: need={need} passt nicht zu {len(pts)} points')
            for p in pts:
                if not (isinstance(p, str) and p.strip()) and not (isinstance(p, dict) and p.get('t') and p.get('g')):
                    errs.append(f'{w}: point muss Text oder {{"t","g"}} sein: {p!r}')
            groups = {p['g'] for p in pts if isinstance(p, dict)}
            if groups and any(isinstance(p, str) for p in pts): errs.append(f'{w}: gemischte points (mit/ohne Gruppe)')
            if groups and len(groups) < 2: errs.append(f'{w}: Gruppen ergeben erst ab 2 Kategorien Sinn')
            if groups and need is not None: warns.append(f'{w}: need wird bei Gruppen ignoriert')
        elif t == 'label':
            labs = q.get('labels') or []
            if len(labs) < 2: errs.append(f'{w}: label braucht ≥ 2 labels')
            if 'src' not in q: errs.append(f'{w}: label ohne src')
            for l in labs:
                if not l.get('answer'): errs.append(f'{w}: label ohne answer')
                if 'find' not in l and 'box' not in l: errs.append(f'{w}: label ohne find/box')
            if not q.get('image'):
                errs.append(f'{w}: Bild noch nicht gebaut (figtool.py build)')
            else:
                if not os.path.exists(os.path.join(ROOT, q['image'])): errs.append(f'{w}: Bild fehlt: {q["image"]}')
                for l in labs:
                    if 'x' not in l: errs.append(f'{w}: Label "{l.get("answer")}" ohne Koordinaten (neu bauen)')
            if len({l.get('answer') for l in labs}) != len(labs): warns.append(f'{w}: doppelte Label-Antworten')
        elif t == 'order':
            it = q.get('items') or []
            if not (3 <= len(it) <= 8): errs.append(f'{w}: order braucht 3–8 items')
            if len(set(it)) != len(it): errs.append(f'{w}: doppelte items')
        for key, img in (('stemSrc', 'stemImage'), ('answerSrc', 'answerImage')):
            if key in q:
                if not q.get(img): errs.append(f'{w}: {key} ohne gebautes {img}')
                elif not os.path.exists(os.path.join(ROOT, q[img])): errs.append(f'{w}: Bild fehlt: {q[img]}')
    for tp in topics:
        if not used[tp]: warns.append(f'{path}: topic "{tp}" hat keine Fragen')
    return errs, warns


def main():
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(ROOT, 'data', 'vl*.json')) + glob.glob(os.path.join(ROOT, 'data', 'x*.json')))
    seen, all_e, all_w = {}, [], []
    for f in files:
        e, w = check_file(f, seen)
        all_e += e; all_w += w
        ch = json.load(open(f, encoding='utf-8')) if not e or 'JSON' not in e[0] else {'questions': []}
        c = Counter(q.get('type') for q in ch.get('questions', []))
        src = Counter(q.get('source') for q in ch.get('questions', []))
        print(f'{os.path.basename(f):40s} {len(ch.get("questions", [])):3d} Fragen  ' +
              ' '.join(f'{k}:{c[k]}' for k in sorted(c)) + f'  | exam:{src["exam"]} slides:{src["slides"]}')
    for w in all_w: print('⚠', w)
    for e in all_e: print('✗', e)
    print(f'\n{len(all_e)} Fehler, {len(all_w)} Warnungen')
    sys.exit(1 if all_e else 0)


if __name__ == '__main__':
    main()
