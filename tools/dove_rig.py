#!/usr/bin/env python3
"""Shared rig for garden birds drawn on the Collared Dove's animation.

tools/make_cockatiel.py drew the cockatiel by replacing every distinct cel of
the PeakPixels *Collared Dove* (read from its Aseprite LAYERS: back leg, front
leg, body, head, wing) with one hand-drawn cel, pasted at the dove cel's
position in every frame that uses it, so the new bird rides on the dove's own
animation.  This module is that machinery made reusable: a species script only
supplies its drawing (char maps) and palettes and calls build().

    import dove_rig as rig
    ART = rig.Art(pal=PAL, head_up=..., body_stand=..., ...)
    rig.build('Budgie', ART, 'assets/birds/budgie', variants={'Lutino': LUTINO})

Char maps: a piece is (rows, dx, dy); rows are strings, '.' or ' ' = leave
transparent / untouched, every other character is a palette key.  A piece is
pasted at the dove cel's origin + (dx, dy).  Palette key 'K' is the 1-px
outline and must be #000000 in the normal palette (like the dove pack).

The pieces (see make_cockatiel.py for a complete worked example):
  head_up      upright head, stamped on every upright head cel (idle / walk /
               jump / first eat frame).  Rows 0..head_rows-1 of the dove cel
               are covered by it; dove rows below that which still sit above
               the body's top row are the neck, recoloured with `neck`.
  throat_fwd   replaces head_up's LAST row on the dove's 9-px-wide "head
               forward" walk cel, where head_up is also shifted head_fwd_dx px.
  neck         dove letter -> key (dict) or keys by position behind the front
               outline (list, front -> back; the last entry repeats).
  body_stand   standing body; dy is relative to the dove body's first row
  body_crouch  used instead when body_stand would reach below the feet row
               (jump take-off / landing crouch)
  lean         eat, lean pose (dove frames 29 & 34): head + body as ONE piece,
               positioned through the body cel; the dove's dipped head is dropped
  body_flat    eat, crouched body (dove frames 30..33)
  head_ground  eat, head on the ground (bobs with the dove's head cel)
  head_fly, body_fly, wing_up, wing_down   flight (dove frames 37 & 38)
  legs         dove leg letter -> key (default K->K, f->f (back leg), p->F)
  fixes        {dove frame: {(x, y): key}} pixel fixes after composition

Usage (module):   build() writes <out>/<Name>.{png,json} and one sheet per
                  variant palette, after validate() (palette, feet on the
                  ground row, closed outline, no stray pixels).
Usage (command):  python3 tools/dove_rig.py --dump      print the dove's cels
                  python3 tools/dove_rig.py --selftest  rebuild the cockatiel
                  from make_cockatiel.py's drawing and compare byte-for-byte

Deterministic: the same drawing always gives byte-identical files.
"""
import json, os, struct, sys, zlib

from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOVE_DIR = os.path.join(REPO, 'assets/birds/collared_dove')
DOVE_ASE = os.path.join(DOVE_DIR, 'Collared Dove.ase')
DOVE_JSON = os.path.join(DOVE_DIR, 'Collared Dove.json')
DOVE_PNG = os.path.join(DOVE_DIR, 'Collared Dove.png')

CELL = 64            # frame cell size (same as the dove sheet)
GROUND_Y = 48        # feet row of every grounded dove frame (frame-local)
DOVE_ART_PX = 1.87   # screen px per art px of the dove in the garden (size 0.7, idle box 24 px)

# Output clips: tag -> dove frame indices (game actions idle/walk/jump/eat/fly).
CLIPS = [
    ('Idle', [1, 2, 3, 4]),
    ('Walk', [12, 13, 14, 15, 16, 17]),
    ('Jump', [5, 6, 7, 8, 9, 10, 11]),
    ('Eat',  [28, 29, 30, 31, 32, 33, 34]),
    ('Fly',  [37, 38]),
]
TAGS = {'idle': 'Idle', 'walk': 'Walk', 'jump': 'Jump', 'eat': 'Eat', 'fly': 'Fly'}
GROUNDED = set(range(1, 7)) | {11} | set(range(12, 18)) | set(range(28, 35))
ORDER = [fi for _, fis in CLIPS for fi in fis]

# Dove colours -> letters (used to read the source cels).
DOVE = {(0, 0, 0): 'K', (0xe9, 0xd5, 0xc6): 'L', (0xd5, 0xc0, 0xa9): 'M', (0xbe, 0xaa, 0x90): 'S',
        (0xac, 0x98, 0x7c): 'D', (0x55, 0x51, 0x51): 'g', (0x5a, 0x52, 0x4b): 'w', (0x41, 0x39, 0x32): 'v',
        (0x47, 0x51, 0x6e): 'c', (0x65, 0x6f, 0x8c): 'b', (0x7f, 0x8b, 0xaf): 'a',
        (0xad, 0x64, 0x5b): 'f', (0xdc, 0x83, 0x7b): 'p'}
LEGS = {'K': 'K', 'f': 'f', 'p': 'F'}


# ------------------------------------------------------------ .ase reader ---
def parse_ase(path):
    b = open(path, 'rb').read()
    _, magic, nframes, W, H, depth = struct.unpack_from('<IHHHHH', b, 0)
    assert magic == 0xA5E0 and depth == 32
    off, layers, frames = 128, [], []
    for _ in range(nframes):
        fbytes, fmagic, oldn, dur = struct.unpack_from('<IHHH', b, off)
        assert fmagic == 0xF1FA
        newn = struct.unpack_from('<I', b, off + 12)[0]
        p, cels = off + 16, []
        for _ in range(newn or oldn):
            csize, ctype = struct.unpack_from('<IH', b, p)
            d = p + 6
            if ctype == 0x2004:
                n = struct.unpack_from('<H', b, d + 16)[0]
                layers.append(b[d + 18:d + 18 + n].decode('utf8'))
            elif ctype == 0x2005:
                li, x, y, _op, ct = struct.unpack_from('<HhhBH', b, d)
                cel = dict(layer=li, x=x, y=y, type=ct)
                q = d + 16
                if ct == 1:
                    cel['link'] = struct.unpack_from('<H', b, q)[0]
                elif ct in (0, 2):
                    w, h = struct.unpack_from('<HH', b, q)
                    data = b[q + 4:p + csize]
                    if ct == 2:
                        data = zlib.decompress(data)
                    cel.update(w=w, h=h, data=data[:w * h * 4])
                cels.append(cel)
            p += csize
        frames.append(cels)
        off += fbytes
    return dict(W=W, H=H, layers=layers, frames=frames)


ASE = parse_ase(DOVE_ASE)


def cel(fi, li):
    for c in ASE['frames'][fi]:
        if c['layer'] == li:
            if c['type'] == 1:
                src = cel(c['link'], li)
                return dict(src, x=c['x'], y=c['y'])
            return c
    return None


def chars(c):
    out = []
    for y in range(c['h']):
        row = ''
        for x in range(c['w']):
            i = (y * c['w'] + x) * 4
            row += '.' if c['data'][i + 3] == 0 else DOVE[tuple(c['data'][i:i + 3])]
        out.append(row)
    return out


def recolor(rows, m):
    return [''.join('.' if ch == '.' else m[ch] for ch in r) for r in rows]


def piece(rows, dx=0, dy=0):
    out = {}
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch not in '. ':
                out[(x + dx, y + dy)] = ch
    return out


# ------------------------------------------------------- classification ---
def classify(li, c):
    rows = chars(c)
    if li in (0, 1):
        return 'legs'
    if li == 3:
        if c['w'] in (7, 9):
            return 'head_up'
        if c['w'] == 14:
            return 'head_dip'
        if rows[0] == '..KKKKKK':
            return 'head_ground'
        return 'head_fly'
    if li == 2:
        if any(r.startswith('.KDMLMDK') for r in rows):
            return 'body_stand'
        return {21: 'body_lean', 24: 'body_flat', 28: 'body_fly'}[c['w']]
    if li == 4:
        return 'wing_up' if c['y'] < 20 else 'wing_down'


def stand_top(c):
    """Row of the standing body's first real row inside a dove body cel."""
    return next(i for i, r in enumerate(chars(c)) if r.startswith('.KDMLMDK'))


# ------------------------------------------------------------------ art ---
class Art:
    """One species' drawing on the dove rig (see the module docstring)."""

    def __init__(self, pal, head_up, neck, body_stand, body_crouch, lean, body_flat, head_ground,
                 head_fly, body_fly, wing_up, wing_down, throat_fwd=None, head_fwd_dx=0, head_rows=7,
                 legs=None, fixes=None):
        self.pal = dict(pal)
        assert self.pal.get('K', '').lower() == '#000000', "palette key 'K' must be the #000000 outline"
        self.head_up, self.neck = head_up, neck
        self.throat_fwd, self.head_fwd_dx, self.head_rows = throat_fwd, head_fwd_dx, head_rows
        self.body_stand, self.body_crouch = body_stand, body_crouch
        self.lean, self.body_flat, self.head_ground = lean, body_flat, head_ground
        self.head_fly, self.body_fly, self.wing_up, self.wing_down = head_fly, body_fly, wing_up, wing_down
        self.legs = dict(legs or LEGS)
        self.fixes = fixes or {}
        used = set()
        for name in ('head_up', 'body_stand', 'body_crouch', 'lean', 'body_flat', 'head_ground',
                     'head_fly', 'body_fly', 'wing_up', 'wing_down'):
            for r in getattr(self, name)[0]:
                used |= set(r) - set('. ')
        used |= set(throat_fwd or '') - set('. ')
        used |= set(self.legs.values())
        used |= set(neck.values()) if isinstance(neck, dict) else set(neck)
        for fx in self.fixes.values():
            used |= set(fx.values())
        missing = used - set(self.pal)
        assert not missing, ('keys used in the drawing but missing from the palette', sorted(missing))

    # -- the replacement for one dove cel, in cel-local coordinates
    def neck_row(self, row):
        if isinstance(self.neck, dict):
            return ''.join('.' if ch == '.' else self.neck[ch] for ch in row)
        i0, out = row.find('K'), ''
        for x, ch in enumerate(row):
            if ch in '.K' or i0 < 0 or x < i0:
                out += ch if ch in '.K' else self.neck[0]
            else:
                out += self.neck[min(x - i0 - 1, len(self.neck) - 1)]
        return out

    def head_upright(self, c, body_top):
        out = {}
        for y, r in enumerate(chars(c)):
            # rows covered by head_up are redrawn; neck rows that sit on the body's
            # top row are left to the body (the dove's collar notch would dent the outline).
            if y < self.head_rows or c['y'] + y >= body_top:
                continue
            for x, ch in enumerate(self.neck_row(r)):
                if ch != '.':
                    out[(x, y)] = ch
        rows, dx, dy = self.head_up
        if c['w'] == 9:                       # the dove's "head forward" walk cel
            if self.throat_fwd is not None:
                rows = list(rows[:-1]) + [self.throat_fwd]
            dx += self.head_fwd_dx
        out.update(piece(rows, dx, dy))
        return out

    def art_for(self, li, c, body_top):
        kind = classify(li, c)
        if kind == 'legs':
            return piece(recolor(chars(c), self.legs))
        if kind == 'head_up':
            return self.head_upright(c, body_top)
        if kind == 'head_dip':
            return {}                          # drawn as part of `lean`
        if kind == 'body_stand':
            top = stand_top(c)
            rows, dx, dy = self.body_stand
            low = max(y for y, r in enumerate(rows) if r.strip('. '))
            if c['y'] + top + dy + low > GROUND_Y:
                rows, dx, dy = self.body_crouch
            return piece(rows, dx, dy + top)
        table = {'body_lean': self.lean, 'body_flat': self.body_flat, 'head_ground': self.head_ground,
                 'head_fly': self.head_fly, 'body_fly': self.body_fly, 'wing_up': self.wing_up,
                 'wing_down': self.wing_down}
        return piece(*table[kind])

    def frame(self, fi, pal=None):
        """Compose dove frame `fi` in this drawing; returns (image, problems)."""
        rgba = rgba_of(pal or self.pal)
        img = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
        px = img.load()
        body = cel(fi, 2)
        body_top = body['y'] + stand_top(body) if classify(2, body) == 'body_stand' else CELL
        problems = []
        for li in range(5):
            c = cel(fi, li)
            if c is None:
                continue
            for (x, y), ch in self.art_for(li, c, body_top).items():
                X, Y = c['x'] + x, c['y'] + y
                if 0 <= X < CELL and 0 <= Y < CELL:
                    px[X, Y] = rgba[ch]
                else:
                    problems.append(('pixel outside the 64x64 cell', 'dove frame', fi, (X, Y)))
        for (X, Y), ch in self.fixes.get(fi, {}).items():
            px[X, Y] = rgba[ch]
        if fi in GROUNDED:      # nothing may hang below the feet (birds stand on the union bottom)
            below = img.crop((0, GROUND_Y + 1, CELL, CELL)).getbbox()
            if below is not None:
                problems.append(('pixels below the feet row', 'dove frame', fi, below))
        return img, problems


def rgba_of(pal):
    return {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) + (255,) for k, v in pal.items()}


# ----------------------------------------------------------------- sheet ---
def compose(art, pal=None):
    """The whole sheet (every clip frame side by side) + frames/tags metadata + problems."""
    dove_json = json.load(open(DOVE_JSON))
    durations = [f['duration'] for f in dove_json['frames'].values()]
    sheet = Image.new('RGBA', (CELL * len(ORDER), CELL), (0, 0, 0, 0))
    frames, tags, problems, k = [], [], [], 0
    for tag, fis in CLIPS:
        tags.append({'name': tag, 'from': k, 'to': k + len(fis) - 1, 'direction': 'forward', 'color': '#000000ff'})
        for fi in fis:
            img, probs = art.frame(fi, pal)
            sheet.paste(img, (k * CELL, 0))
            problems += probs
            frames.append({'frame': {'x': k * CELL, 'y': 0, 'w': CELL, 'h': CELL}, 'rotated': False,
                           'trimmed': False, 'spriteSourceSize': {'x': 0, 'y': 0, 'w': CELL, 'h': CELL},
                           'sourceSize': {'w': CELL, 'h': CELL}, 'duration': durations[fi]})
            k += 1
    return sheet, frames, tags, problems


def open_pixels(img):
    """Coloured, non-outline pixels that touch transparency (an opening in the outline)."""
    px, out = img.load(), set()
    for y in range(img.height):
        for x in range(img.width):
            p = px[x, y]
            if p[3] == 0 or p[:3] == (0, 0, 0):
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                X, Y = x + dx, y + dy
                if not (0 <= X < img.width and 0 <= Y < img.height) or px[X, Y][3] == 0:
                    out.add((x, y))
                    break
    return out


def islands(img):
    """Groups of opaque pixels (8-connected) apart from the biggest one."""
    px, seen, groups = img.load(), set(), []
    for y in range(img.height):
        for x in range(img.width):
            if px[x, y][3] == 0 or (x, y) in seen:
                continue
            stack, g = [(x, y)], []
            seen.add((x, y))
            while stack:
                a, b = stack.pop()
                g.append((a, b))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        X, Y = a + dx, b + dy
                        if (0 <= X < img.width and 0 <= Y < img.height and (X, Y) not in seen
                                and px[X, Y][3] != 0):
                            seen.add((X, Y))
                            stack.append((X, Y))
            groups.append(g)
    groups.sort(key=len, reverse=True)
    return groups[1:]


def validate(art, sheet, tags, pal=None, allow_open=()):
    """Problems (list of tuples) where the sheet breaks the pack rules.

    `allow_open` = extra frame-local (x, y) openings tolerated in every frame;
    feet pixels (legs colours) may always touch transparency."""
    problems = []
    rgba = rgba_of(pal or art.pal)
    allowed = set(rgba.values())
    feet = {rgba[k] for k in set(art.legs.values()) if k != 'K'}
    px = sheet.load()
    for y in range(sheet.height):
        for x in range(sheet.width):
            p = px[x, y]
            if p[3] not in (0, 255):
                problems.append(('semi-transparent pixel', x, y))
            elif p[3] and p not in allowed:
                problems.append(('off-palette pixel', x, y, p))
    for t in tags:
        fr = [sheet.crop((k * CELL, 0, (k + 1) * CELL, CELL)) for k in range(t['from'], t['to'] + 1)]
        bottoms = [f.getbbox()[3] for f in fr]
        if t['name'] != 'Fly' and max(bottoms) != GROUND_Y + 1:      # feet on the clip's bottom row
            problems.append(('feet not on the ground row', t['name'], bottoms))
    # The 1-px outline must be closed everywhere (crest, beak, tail ...).  The
    # pack itself leaves a few pixels open (feet soles, the belly between the
    # legs), so only openings the dove frame does NOT have count.
    dove = Image.open(DOVE_PNG).convert('RGBA')
    for k, fi in enumerate(ORDER):
        f = sheet.crop((k * CELL, 0, (k + 1) * CELL, CELL))
        fpx = f.load()
        mine = {p for p in open_pixels(f) if fpx[p] not in feet}
        base = open_pixels(dove.crop((fi * CELL, 0, (fi + 1) * CELL, CELL))) | set(allow_open)
        if mine - base:
            problems.append(('open outline', 'sheet frame', k, 'dove frame', fi, sorted(mine - base)))
        for g in islands(f):
            problems.append(('stray pixels (not attached to the bird)', 'sheet frame', k, sorted(g)[:6]))
    return problems


def palette_map(base_pal, var_pal):
    """{base hex: variant hex} for an exact palette swap from the base sheet to the
    variant, or None when one base colour would need two different variant
    colours (then the variant needs its own sheet)."""
    m = {}
    for k, v in base_pal.items():
        a, b = v.lower(), var_pal[k].lower()
        if m.get(a, b) != b:
            return None
        m[a] = b
    return {a: b for a, b in m.items() if a != b}


def write_sheet(out_dir, name, sheet, frames, tags):
    os.makedirs(out_dir, exist_ok=True)
    sheet.save(os.path.join(out_dir, name + '.png'), optimize=False)
    meta = {'app': 'https://www.aseprite.org/', 'version': '1.x-dev', 'image': name + '.png',
            'format': 'RGBA8888', 'size': {'w': sheet.width, 'h': sheet.height}, 'scale': '1',
            'frameTags': tags}
    named = {f'{name} {k}.ase': fr for k, fr in enumerate(frames)}
    with open(os.path.join(out_dir, name + '.json'), 'w') as f:
        json.dump({'frames': named, 'meta': meta}, f, indent=1)
        f.write('\n')


def idle_box(sheet, tags):
    t = next(t for t in tags if t['name'] == 'Idle')
    L = T = 10 ** 9
    R = B = -1
    for k in range(t['from'], t['to'] + 1):
        bb = sheet.crop((k * CELL, 0, (k + 1) * CELL, CELL)).getbbox()
        if bb:
            L, T, R, B = min(L, bb[0]), min(T, bb[1]), max(R, bb[2]), max(B, bb[3])
    return R - L, B - T


def size_for(sheet, tags, art_px=DOVE_ART_PX):
    """garden-data.js `size` giving `art_px` screen px per art px (64 * size / idle height)."""
    return round(art_px * idle_box(sheet, tags)[1] / 64, 2)


def swap(sheet, m):
    """The sheet with the exact palette swap `m` ({hex: hex}) applied, like
    garden-art.js paletteSwapPixels does at runtime."""
    lut = {tuple(int(a[i:i + 2], 16) for i in (1, 3, 5)): tuple(int(b[i:i + 2], 16) for i in (1, 3, 5))
           for a, b in m.items()}
    out = sheet.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            p = px[x, y]
            if p[3] and p[:3] in lut:
                px[x, y] = lut[p[:3]] + (p[3],)
    return out


def build(name, art, out_dir=None, variants=None, strict=True, allow_open=(), preview_dir=None,
          size=None, lineup=None):
    """Compose and validate the sheet and its colour variants.

    variants = {id: palette} (full palettes with the same keys as art.pal).  A
    variant that is an exact palette swap of the normal sheet becomes a `map`
    for js/garden-variants.js; one that is not (e.g. a red eye where the normal
    eye shares the outline's black) gets its own sheet <name>-<Id>.{png,json}.

    Writes <out_dir>/<name>.{png,json} and the variant sheets that are needed
    (out_dir=None: write nothing).  With preview_dir, also writes EVERY sheet
    there plus preview_frames.png (all frames, enlarged) and
    preview_context.png (the bird and its variants among garden birds at
    in-game scale, using `size` or the dove-density size).
    With strict=False problems are reported instead of raised (for iterating).
    Returns a report dict."""
    sheet, frames, tags, problems = compose(art)
    problems += validate(art, sheet, tags, allow_open=allow_open)
    box = idle_box(sheet, tags)
    size = size or size_for(sheet, tags)
    report = {'name': name, 'problems': problems, 'idle_box': box, 'size': size,
              'size_at_dove_density': size_for(sheet, tags),
              'screen_px_per_art_px': round(64 * size / box[1], 2), 'variants': {}}
    alpha = sheet.getchannel('A').tobytes()
    outs = [(name, sheet, frames, True)]
    for vid, vpal in (variants or {}).items():
        if set(vpal) != set(art.pal):
            problems.append(('variant palette keys differ from the normal palette', vid,
                             sorted(set(vpal) ^ set(art.pal))))
            continue
        vs, vframes, _, vprob = compose(art, vpal)
        assert vs.getchannel('A').tobytes() == alpha        # a pure per-key colour swap
        problems += [('variant ' + vid,) + tuple(p) for p in vprob]
        m = palette_map(art.pal, vpal)
        if m is not None:
            assert swap(sheet, m).tobytes() == vs.tobytes(), ('palette map does not reproduce', vid)
            report['variants'][vid] = {'map': m}
        else:
            report['variants'][vid] = {'sheet': f'{name}-{vid[:1].upper() + vid[1:]}.json'}
        outs.append((f'{name}-{vid[:1].upper() + vid[1:]}', vs, vframes, m is None))
    if strict and problems:
        raise SystemExit('\n'.join(map(str, problems)))
    if out_dir:
        for n, s, fr, needed in outs:
            if needed:
                write_sheet(out_dir, n, s, fr, tags)
    if preview_dir:
        preview_dir = os.path.abspath(preview_dir)
        os.makedirs(preview_dir, exist_ok=True)
        for n, s, fr, _ in outs:
            write_sheet(preview_dir, n, s, fr, tags)
        paths = [os.path.join(preview_dir, n + '.json') for n, _, _, _ in outs]
        preview_frames(os.path.join(preview_dir, 'preview_frames.png'), paths)
        birds = [(lab, sz, js, tag, False) for lab, sz, js, tag in (LINEUP if lineup is None else lineup)]
        birds += [(os.path.basename(p)[:-5], size, p, 'Idle', False) for p in paths]
        preview_context(os.path.join(preview_dir, 'preview_context.png'), birds,
                        width=max(1100, 140 * len(birds)))
    return report


# --------------------------------------------------------------- previews ---
BG = (0xbe, 0xdc, 0xb4, 255)


def alpha_union(img, rects):
    """garden.js clipContentBox: union alpha (>8) box of a clip's frames, frame-local."""
    L = T = 10 ** 9
    R = B = -1
    for (fx, fy, fw, fh) in rects:
        bb = img.crop((fx, fy, fx + fw, fy + fh)).getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
        if bb:
            L, T, R, B = min(L, bb[0]), min(T, bb[1]), max(R, bb[2]), max(B, bb[3])
    return (L, T, R, B)


def load_clip(json_path, tag=None):
    """garden.js loadClip for both layouts -> (img, [frame rects], union box)."""
    data = json.load(open(json_path))
    img = Image.open(json_path[:-5] + '.png').convert('RGBA')
    fr = data['frames']
    if isinstance(fr, list):
        seq = fr
    else:
        seq = list(fr.values())
        if tag:
            t = next((t for t in data['meta'].get('frameTags', []) if t['name'] == tag), None)
            if t:
                seq = seq[t['from']:t['to'] + 1]
    rects = [(f['frame']['x'], f['frame']['y'], f['frame']['w'], f['frame']['h']) for f in seq]
    return img, rects, alpha_union(img, rects)


def preview_frames(path, json_paths, scale=6, crop=(2, 10, 62, 52)):
    """Every frame of each sheet, enlarged, one sheet per row block, labelled."""
    from PIL import ImageDraw
    x0, y0, x1, y1 = crop
    w, h = (x1 - x0) * scale, (y1 - y0) * scale
    blocks = []
    for js in json_paths:
        data = json.load(open(js))
        img = Image.open(js[:-5] + '.png').convert('RGBA')
        names = {}
        for t in data['meta']['frameTags']:
            for k in range(t['from'], t['to'] + 1):
                names[k] = f"{t['name']} {k - t['from']}"
        blocks.append((os.path.basename(js)[:-5], img, list(data['frames'].values()), names))
    cols = 9
    rows = sum((len(fr) + cols - 1) // cols for _, _, fr, _ in blocks)
    can = Image.new('RGBA', (8 + cols * (w + 8), 8 + rows * (h + 20) + len(blocks) * 22), BG)
    d = ImageDraw.Draw(can)
    y = 8
    for label, img, fr, names in blocks:
        d.text((8, y), label, fill=(0, 0, 0, 255))
        y += 22
        for k, f in enumerate(fr):
            cx = 8 + (k % cols) * (w + 8)
            cy = y + (k // cols) * (h + 20)
            fx, fy = f['frame']['x'], f['frame']['y']
            can.alpha_composite(img.crop((fx + x0, fy + y0, fx + x1, fy + y1)).resize((w, h), Image.NEAREST),
                                (cx, cy + 12))
            d.text((cx, cy), names.get(k, str(k)), fill=(0, 0, 0, 255))
            gy = cy + 12 + (GROUND_Y + 1 - y0) * scale
            d.line((cx, gy, cx + w, gy), fill=(170, 40, 40, 255))
        y += ((len(fr) + cols - 1) // cols) * (h + 20)
    can.convert('RGB').save(path)


LINEUP = [   # (label, garden-data size, json, tag) — birds to stand next to in the context preview
    ('sparrow', 0.7, 'assets/birds/sparrow/Sparrow.json', 'Idle'),
    ('dove', 0.7, 'assets/birds/collared_dove/Collared Dove.json', 'Idle'),
    ('cockatiel', 0.79, 'assets/birds/cockatiel/Cockatiel.json', 'Idle'),
    ('pigeon', 0.8, 'assets/birds/pigeon/Pigeon.json', 'Idle'),
    ('macaw', 0.8, 'assets/birds/blue_macaw/Blue Macaw-Idle.json', None),
    ('toucan', 0.8, 'assets/birds/toucan/Toucan-Idle.json', None),
]


def preview_context(path, birds, width=1100, zoom=2):
    """The birds standing on the garden background at their in-game scale
    (garden.js: 64 * size px for the idle clip's content height).
    `birds` = [(label, size, json path, tag, mirror)]."""
    bg = Image.open(os.path.join(REPO, 'assets/garden-background.png')).convert('RGB')
    s = width / bg.width
    bg = bg.resize((width, round(bg.height * s)), Image.LANCZOS)
    band = bg.crop((0, bg.height - 220, width, bg.height)).convert('RGBA')
    ground = 220 - 30                                  # garden.js GROUND_BAND = 30
    sprites = []
    for _label, size, js, tag, mirror in birds:
        img, rects, (L, T, R, Bt) = load_clip(js if os.path.isabs(js) else os.path.join(REPO, js), tag)
        fx, fy, _, _ = rects[0]
        sc = 64 * size / (Bt - T)
        spr = img.crop((fx + L, fy + T, fx + R, fy + Bt))
        spr = spr.resize((round((R - L) * sc), round((Bt - T) * sc)), Image.NEAREST)
        if mirror:
            spr = spr.transpose(Image.FLIP_LEFT_RIGHT)
        sprites.append(spr)
    total = sum(sp.width for sp in sprites)
    step = (width - total) / (len(sprites) + 1)
    x = step
    for sp in sprites:
        band.alpha_composite(sp, (round(x), ground - sp.height))
        x += sp.width + step
    band = band.resize((width * zoom, 220 * zoom), Image.NEAREST)
    band.convert('RGB').save(path)


# ----------------------------------------------------------------- tools ---
def dump():
    """Print every distinct dove cel (as letters) and where each frame uses it."""
    seen = {}
    for tag, fis in CLIPS:
        for fi in fis:
            parts = []
            for li in range(5):
                c = cel(fi, li)
                if c is None:
                    parts.append(f'L{li}:-')
                    continue
                key = (li, tuple(chars(c)))
                if key not in seen:
                    seen[key] = f'{classify(li, c)}#{sum(1 for k in seen if k[0] == li)}'
                parts.append(f"L{li}:{seen[key]}@({c['x']},{c['y']}) {c['w']}x{c['h']}")
            print(tag, fi, ' | '.join(parts))
    for (li, rows), name in seen.items():
        print('=====', name, 'layer', ASE['layers'][li])
        for r in rows:
            print('   ', r)


def selftest():
    """Rebuild the cockatiel from make_cockatiel.py's drawing; must match the committed sheets."""
    import tempfile
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import make_cockatiel as mc
    art = Art(pal=mc.PAL, head_up=mc.HEAD_UP, neck=mc.NECK, throat_fwd=mc.THROAT_FWD,
              head_fwd_dx=mc.HEAD_FWD_DX, body_stand=mc.BODY_STAND, body_crouch=mc.BODY_CROUCH,
              lean=mc.LEAN, body_flat=mc.BODY_FLAT, head_ground=mc.HEAD_GROUND, head_fly=mc.HEAD_FLY,
              body_fly=mc.BODY_FLY, wing_up=mc.WING_UP, wing_down=mc.WING_DOWN, legs=mc.LEGS, fixes=mc.FIXES)
    with tempfile.TemporaryDirectory() as tmp:
        rep = build('Cockatiel', art, tmp, variants={'Lutino': mc.LUTINO})
        for n in ('Cockatiel', 'Cockatiel-Lutino'):
            for ext in ('.png', '.json'):
                a = open(os.path.join(tmp, n + ext), 'rb').read()
                b = open(os.path.join(mc.OUT, n + ext), 'rb').read()
                assert a == b, ('differs from the committed sheet', n + ext)
    print('selftest ok: cockatiel rebuilt byte-for-byte', rep['idle_box'], rep['size_at_dove_density'])


if __name__ == '__main__':
    if '--dump' in sys.argv:
        dump()
    elif '--selftest' in sys.argv:
        selftest()
    else:
        print(__doc__)
