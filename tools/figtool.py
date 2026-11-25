#!/usr/bin/env python3
"""Figure tool for "label" (Schaubild beschriften) questions.

Slides are 960 x 540 pt PDFs. All coordinates in specs are PDF points
(= pixels of a 72-dpi render), origin top-left.

Subcommands
  grid  <pdf> <page> <out.png> [--crop x0 y0 x1 y1]
        Render a page (1.5x) with a labelled 50-pt coordinate grid, so you can
        read off boxes for labels that are baked into raster images.
  sheet <pdf> <out-prefix>
        Contact sheets (3x3 slides per PNG, page numbers in red) to skim a deck.
  words <pdf> <page> [--crop x0 y0 x1 y1]
        Print every text word on the page with its bbox (points).
  build <chapter.json> --pdf-dir DIR [--only ID] [--preview DIR]
        For every question with "type":"label" and a "src" block: render the
        page at 2x, crop, paint over each label (and each "hide" box), save
        assets/figures/<id>.webp and write image/iw/ih and per-label x/y/w/h
        (percent of the cropped image) back into the chapter JSON.
        --preview DIR additionally writes <id>-preview.png with numbered red
        outlines + answers, to check that every blank sits on the right label.

Label spec (inside the question):
  "src": {"pdf": "VL01Neuroglia 2026.pdf", "page": 20, "crop": [x0,y0,x1,y1],
          "hide": [[x0,y0,x1,y1], ...]}            # optional extra masks
  "labels": [
    {"find": "inner tongue", "answer": "...", "accept": [...]},   # PDF text
    {"find": "axon", "nth": 1, ...},                               # 2nd match
    {"box": [x0,y0,x1,y1], "answer": "...", "accept": [...]}       # raster text
  ]
"""
import argparse, json, os, re, subprocess, sys, tempfile, unicodedata
from html import unescape
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIG_DIR = os.path.join(ROOT, 'assets', 'figures')
SCALE = 2.0      # render scale for final figures (144 dpi)
PAD = 2.5        # points of padding around each mask


def render(pdf, page, scale):
    tmp = tempfile.mkdtemp()
    out = os.path.join(tmp, 'p')
    subprocess.run(['pdftoppm', '-f', str(page), '-l', str(page), '-r', str(int(72 * scale)),
                    '-png', '-singlefile', pdf, out], check=True)
    return Image.open(out + '.png').convert('RGB')


def words(pdf, page):
    tmp = tempfile.mkdtemp()
    out = os.path.join(tmp, 'w.html')
    subprocess.run(['pdftotext', '-f', str(page), '-l', str(page), '-bbox', pdf, out], check=True)
    html = open(out, encoding='utf-8').read()
    res = []
    for m in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', html):
        x0, y0, x1, y1 = map(float, m.groups()[:4])
        res.append((unescape(m.group(5)), x0, y0, x1, y1))
    return res


def norm(s):
    s = unicodedata.normalize('NFKD', s).lower()
    return re.sub(r'[^a-z0-9+\-]', '', s)


def inside(w, crop):
    if not crop:
        return True
    cx, cy = (w[1] + w[3]) / 2, (w[2] + w[4]) / 2
    return crop[0] <= cx <= crop[2] and crop[1] <= cy <= crop[3]


def find_phrase(ws, phrase, crop, nth=0):
    toks = [norm(t) for t in phrase.split() if norm(t)]
    cand = [w for w in ws if inside(w, crop)]
    hits = []
    for i in range(len(cand) - len(toks) + 1):
        if all(norm(cand[i + k][0]) == toks[k] for k in range(len(toks))):
            seg = cand[i:i + len(toks)]
            hits.append([min(w[1] for w in seg), min(w[2] for w in seg),
                         max(w[3] for w in seg), max(w[4] for w in seg)])
    if len(hits) <= nth:
        near = ' | '.join(w[0] for w in cand)
        raise SystemExit(f'  ✗ text "{phrase}" (nth={nth}) not found in crop. Words in crop: {near}')
    return hits[nth]


def ring_color(img, box):
    """Median colour of a thin ring just outside box (image px)."""
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    W, H = img.size
    px = []
    for x in range(max(0, x0 - 3), min(W, x1 + 3)):
        for y in (y0 - 3, y1 + 2):
            if 0 <= y < H:
                px.append(img.getpixel((x, y)))
    for y in range(max(0, y0), min(H, y1)):
        for x in (x0 - 3, x1 + 2):
            if 0 <= x < W:
                px.append(img.getpixel((x, y)))
    if not px:
        return (255, 255, 255)
    return tuple(sorted(p[c] for p in px)[len(px) // 2] for c in range(3))


MAX_W = 1400   # px; figures are shown at most ~930 px wide (×1.5 for sharpness)


def save_fig(img, rel):
    """Save a figure as WebP, downscaled to MAX_W (coordinates are percentages)."""
    if img.width > MAX_W:
        img = img.resize((MAX_W, round(img.height * MAX_W / img.width)), Image.LANCZOS)
    img.save(os.path.join(ROOT, rel), 'WEBP', quality=85, method=6)
    return img.size


def font(size):
    for f in ('/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Helvetica.ttc'):
        try:
            return ImageFont.truetype(f, size)
        except Exception:
            pass
    return ImageFont.load_default()


def cmd_grid(a):
    s = 1.5
    img = render(a.pdf, a.page, s)
    crop = a.crop
    d = ImageDraw.Draw(img)
    f = font(13)
    W, H = img.size
    for v in range(0, 961, 50):
        x = v * s
        d.line([(x, 0), (x, H)], fill=(255, 0, 0) if v % 100 == 0 else (255, 150, 150), width=1)
        d.text((x + 2, 2), str(v), fill=(200, 0, 0), font=f)
        d.text((x + 2, H - 16), str(v), fill=(200, 0, 0), font=f)
    for v in range(0, 541, 50):
        y = v * s
        d.line([(0, y), (W, y)], fill=(0, 0, 255) if v % 100 == 0 else (150, 150, 255), width=1)
        d.text((2, y + 2), str(v), fill=(0, 0, 200), font=f)
        d.text((W - 30, y + 2), str(v), fill=(0, 0, 200), font=f)
    if crop:
        img = img.crop(tuple(int(c * s) for c in crop))
    img.save(a.out)
    print('wrote', a.out, img.size, '(grid labels are PDF points)')


def cmd_sheet(a):
    """Contact sheets: 3x3 slides per PNG (480x270 each) with page numbers."""
    tmp = tempfile.mkdtemp()
    subprocess.run(['pdftoppm', '-r', '36', '-png', a.pdf, os.path.join(tmp, 'p')], check=True)
    files = sorted(os.listdir(tmp), key=lambda s: int(re.findall(r'\d+', s)[-1]))
    f = font(18)
    os.makedirs(os.path.dirname(os.path.abspath(a.prefix)), exist_ok=True)
    for s in range(0, len(files), 9):
        sheet = Image.new('RGB', (3 * 480 + 8, 3 * 270 + 8), (40, 40, 40))
        for k, fn in enumerate(files[s:s + 9]):
            im = Image.open(os.path.join(tmp, fn)).convert('RGB').resize((476, 266))
            x, y = (k % 3) * 482 + 4, (k // 3) * 272 + 4
            sheet.paste(im, (x, y))
            pg = int(re.findall(r'\d+', fn)[-1])
            ImageDraw.Draw(sheet).rectangle([x, y, x + 44, y + 22], fill=(200, 0, 0))
            ImageDraw.Draw(sheet).text((x + 4, y + 1), str(pg), fill=(255, 255, 255), font=f)
        out = f'{a.prefix}-{s // 9 + 1:02d}.png'
        sheet.save(out)
        print('wrote', out, f'(pages {s + 1}–{min(s + 9, len(files))})')


def cmd_words(a):
    for w in words(a.pdf, a.page):
        if inside(w, a.crop):
            print(f'{w[1]:7.1f} {w[2]:6.1f} {w[3]:7.1f} {w[4]:6.1f}  {w[0]}')


def build_one(q, pdf_dir, preview_dir):
    src = q['src']
    pdf = os.path.join(pdf_dir, src['pdf'])
    if not os.path.exists(pdf):
        raise SystemExit(f'  ✗ PDF not found: {pdf}')
    page = int(src['page'])
    crop = src.get('crop') or [0, 0, 960, 540]
    ws = words(pdf, page)
    img = render(pdf, page, SCALE)
    boxes = []
    for lab in q['labels']:
        if 'box' in lab:
            b = list(map(float, lab['box']))
        elif 'find' in lab:
            b = find_phrase(ws, lab['find'], crop, lab.get('nth', 0))
        else:
            raise SystemExit(f'  ✗ label without find/box in {q["id"]}: {lab}')
        boxes.append([b[0] - PAD, b[1] - PAD, b[2] + PAD, b[3] + PAD])
    hides = [[h[0] - PAD, h[1] - PAD, h[2] + PAD, h[3] + PAD] for h in src.get('hide', [])]
    d = ImageDraw.Draw(img)
    for b in boxes + hides:
        pb = [v * SCALE for v in b]
        d.rectangle(pb, fill=ring_color(img, pb))
    cx0, cy0, cx1, cy1 = [int(round(v * SCALE)) for v in crop]
    out = img.crop((cx0, cy0, cx1, cy1))
    W, H = out.size
    os.makedirs(FIG_DIR, exist_ok=True)
    rel = f'assets/figures/{q["id"]}.webp'
    q['image'] = rel
    q['iw'], q['ih'] = save_fig(out, rel)
    for lab, b in zip(q['labels'], boxes):
        x0 = (b[0] * SCALE - cx0) / W * 100
        y0 = (b[1] * SCALE - cy0) / H * 100
        lab['x'], lab['y'] = round(x0, 2), round(y0, 2)
        lab['w'] = round((b[2] - b[0]) * SCALE / W * 100, 2)
        lab['h'] = round((b[3] - b[1]) * SCALE / H * 100, 2)
        if not (-1 <= x0 <= 100 and -1 <= y0 <= 100):
            print(f'  ⚠ {q["id"]}: label "{lab["answer"]}" lies outside the crop')
    if preview_dir:
        pv = out.copy()
        pd = ImageDraw.Draw(pv)
        f = font(20)
        for i, (lab, b) in enumerate(zip(q['labels'], boxes), 1):
            r = [b[0] * SCALE - cx0, b[1] * SCALE - cy0, b[2] * SCALE - cx0, b[3] * SCALE - cy0]
            pd.rectangle(r, outline=(230, 0, 0), width=3)
            pd.text((r[0] + 3, r[1] + 1), f'{i} {lab["answer"]}', fill=(230, 0, 0), font=f)
        os.makedirs(preview_dir, exist_ok=True)
        pv.save(os.path.join(preview_dir, f'{q["id"]}-preview.png'))
    print(f'  ✓ {q["id"]}: {len(boxes)} labels → {rel} ({W}x{H})')


def build_plain(q, key, suffix, pdf_dir):
    """stemSrc/answerSrc → plain crop (optional hide boxes) → stemImage/answerImage."""
    src = q[key]
    pdf = os.path.join(pdf_dir, src['pdf'])
    if not os.path.exists(pdf):
        raise SystemExit(f'  ✗ PDF not found: {pdf}')
    crop = src.get('crop') or [0, 0, 960, 540]
    img = render(pdf, int(src['page']), SCALE)
    d = ImageDraw.Draw(img)
    for h in src.get('hide', []):
        pb = [(h[0] - PAD) * SCALE, (h[1] - PAD) * SCALE, (h[2] + PAD) * SCALE, (h[3] + PAD) * SCALE]
        d.rectangle(pb, fill=ring_color(img, pb))
    out = img.crop(tuple(int(round(v * SCALE)) for v in crop))
    rel = f'assets/figures/{q["id"]}-{suffix}.webp'
    os.makedirs(FIG_DIR, exist_ok=True)
    save_fig(out, rel)
    q[suffix + 'Image'] = rel
    print(f'  ✓ {q["id"]}: {suffix} image → {rel} ({out.size[0]}x{out.size[1]})')


def cmd_build(a):
    path = a.chapter
    data = json.load(open(path, encoding='utf-8'))
    n = 0
    for q in data.get('questions', []):
        if a.only and q['id'] != a.only:
            continue
        if q.get('type') == 'label' and 'src' in q:
            build_one(q, a.pdf_dir, a.preview)
            n += 1
        for key, suffix in (('stemSrc', 'stem'), ('answerSrc', 'answer')):
            if key in q:
                build_plain(q, key, suffix, a.pdf_dir)
                n += 1
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print(f'built {n} figure(s); updated {path}')


def main():
    p = argparse.ArgumentParser()
    sp = p.add_subparsers(dest='cmd', required=True)
    g = sp.add_parser('grid'); g.add_argument('pdf'); g.add_argument('page', type=int); g.add_argument('out')
    g.add_argument('--crop', nargs=4, type=float)
    w = sp.add_parser('words'); w.add_argument('pdf'); w.add_argument('page', type=int)
    w.add_argument('--crop', nargs=4, type=float)
    s = sp.add_parser('sheet'); s.add_argument('pdf'); s.add_argument('prefix')
    b = sp.add_parser('build'); b.add_argument('chapter'); b.add_argument('--pdf-dir', required=True)
    b.add_argument('--only'); b.add_argument('--preview')
    a = p.parse_args()
    {'grid': cmd_grid, 'words': cmd_words, 'build': cmd_build, 'sheet': cmd_sheet}[a.cmd](a)


if __name__ == '__main__':
    main()
