#!/usr/bin/env python3
"""Cockatiel (Nymphensittich) sprite sheet for the garden minigame (final, from candidate C).

Derived from the PeakPixels *Collared Dove* (single-file sheet).  We read the
dove's Aseprite source (.ase) to get its LAYERS (back leg, front leg, body,
head, wing) and their per-frame cel positions, so every reshaped part rides on
the dove's own animation:

  * every distinct dove cel (a head pose, a body pose, a wing pose) is replaced
    by ONE hand-drawn cockatiel cel (char maps below), pasted at the dove cel's
    position in every frame that uses it -> crest / cheek / wing patch / tail
    are identical wherever the pose repeats;
  * the head sits 1 px lower (one dove neck row dropped) and is 1 px longer at
    the back; it gets a crest that follows the head's angle, a yellow face and
    throat, an orange cheek framed by yellow and a short hooked beak; the body
    gets the cockatiel greys, a slimmer breast, the white wing-covert patch and
    a much longer pointed tail;
  * the long tail never reaches below the feet row in grounded frames (in the
    two jump crouch frames the body sinks but the tail stays put), so every
    grounded clip's union box bottom is the feet row (birds stand on it);
  * a few explicit per-frame pixel fixes (FIXES) clean up seams the dove
    leaves open.

Reads (read-only):  <repo>/assets/birds/collared_dove/Collared Dove.{ase,json,png}
                    <repo>/assets/birds/... (other birds, preview only)
                    <repo>/assets/garden-background.png (preview only)
Writes:             <repo>/assets/birds/cockatiel/Cockatiel.{png,json}
                    with --preview DIR also DIR/preview_sheet.png,
                    DIR/preview_context.png and DIR/manifest.json

Usage:  python3 tools/make_cockatiel.py [--preview DIR]

Deterministic: running it again reproduces the outputs byte-for-byte.
"""
import json, os, struct, sys, zlib

from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, 'assets/birds/cockatiel')
DOVE_DIR = os.path.join(REPO, 'assets/birds/collared_dove')
DOVE_ASE = os.path.join(DOVE_DIR, 'Collared Dove.ase')
DOVE_JSON = os.path.join(DOVE_DIR, 'Collared Dove.json')
DOVE_PNG = os.path.join(DOVE_DIR, 'Collared Dove.png')

SIZE = 0.79          # garden-data.js `size`: 64*0.79/27 = 1.87 screen px per art px, same as the dove
CELL = 64            # frame cell size (same as the dove sheet)
GROUND_Y = 48        # feet row of every grounded dove frame (frame-local)

# Output clips: tag -> dove frame indices (game actions idle/walk/jump/eat/fly).
CLIPS = [
    ('Idle', [1, 2, 3, 4]),
    ('Walk', [12, 13, 14, 15, 16, 17]),
    ('Jump', [5, 6, 7, 8, 9, 10, 11]),
    ('Eat',  [28, 29, 30, 31, 32, 33, 34]),
    ('Fly',  [37, 38]),
]
GROUNDED = set(range(1, 7)) | {11} | set(range(12, 18)) | set(range(28, 35))

# ---------------------------------------------------------------- palette ---
PAL = {
    'K': '#000000',                      # outline (same as the dove pack)
    '1': '#aeacb0', '2': '#8a888e', '3': '#6f6d73', '4': '#5a585d', '5': '#434146',
    'W': '#f1efe8', 'w': '#cfccc4',      # wing patch
    'Y': '#f2d03b', 'y': '#d4a92a',      # face / crest
    'O': '#e7782d',                      # cheek
    'F': '#b5978f', 'f': '#8e746d',      # feet
}
# The beak uses the body greys: upper mandible '1' (#aeacb0), hook '4' (#5a585d).
RGBA = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) + (255,) for k, v in PAL.items()}

# Dove colours -> letters (used to read the source cels).
DOVE = {(0, 0, 0): 'K', (0xe9, 0xd5, 0xc6): 'L', (0xd5, 0xc0, 0xa9): 'M', (0xbe, 0xaa, 0x90): 'S',
        (0xac, 0x98, 0x7c): 'D', (0x55, 0x51, 0x51): 'g', (0x5a, 0x52, 0x4b): 'w', (0x41, 0x39, 0x32): 'v',
        (0x47, 0x51, 0x6e): 'c', (0x65, 0x6f, 0x8c): 'b', (0x7f, 0x8b, 0xaf): 'a',
        (0xad, 0x64, 0x5b): 'f', (0xdc, 0x83, 0x7b): 'p'}
NECK = {'K': 'K', 'D': '3', 'M': '2', 'L': '1', 'S': '3', 'b': '2', 'a': '1', 'c': '3', 'g': '1'}
LEGS = {'K': 'K', 'f': 'f', 'p': 'F'}
GENERIC = {'K': 'K', 'L': '1', 'M': '2', 'S': '3', 'D': '4', 'g': '5', 'w': '5', 'v': '5',
           'c': '3', 'b': '2', 'a': '1', 'f': 'f', 'p': 'F'}


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


# ================================================================== ART ====
# Char maps.  '.' = leave transparent / untouched, other letters = PAL keys.
# Each piece is (rows, dx, dy): rows are pasted at dove-cel origin + (dx, dy).

# ---- head: every upright pose (idle / walk / jump / first eat frame) uses the
# dove's rows 0..4 for the head, so ONE cockatiel head is stamped on all of them.
# Index = dove cel column + 1, first row = cel row -4.  Compared with the dove
# the head sits 1 px lower (the dove's first neck row is dropped: shorter neck,
# bigger-looking head) and is 1 px longer at the back.
HEAD_UP = ([
    ".......KK.",   # r-4  crest tip outline
    "......K22K",   # r-3  crest tip (2 px grey), leaning back
    ".....KYKK.",   # r-2
    "....KYK...",   # r-1
    "...KYYK...",   # r0   crest base (2 px) on the forehead
    "..KYYYKKK.",   # r1   crown
    "..KYYYYY3K",   # r2   yellow crown, grey nape
    ".KKYKYOY3K",   # r3   eye, cheek, yellow behind the cheek
    "K11YYOOY3K",   # r4   hooked beak (upper mandible), cheek
    "K4KYyOO3K.",   # r5   hook tip, cheek
    ".KKYYy3K..",   # r6   yellow throat
], -1, -4)
# The dove's "head forward" walk cel (9 px wide) has the neck slanting back; the
# head is stamped 1 px further back there (softer head bob) and the throat row
# reaches 1 px further back to meet the slanted neck.
THROAT_FWD = ".KKYYy33K."
HEAD_FWD_DX = 1


def head_upright(c, body_top):
    fwd = c['w'] == 9
    out = {}
    for y, r in enumerate(recolor(chars(c), NECK)):
        # rows 0..6 are redrawn; neck rows that sit on the body's top row are
        # left to the body (the dove's collar notch would dent the outline).
        if y < 7 or c['y'] + y >= body_top:
            continue
        for x, ch in enumerate(r):
            if ch != '.':
                out[(x, y)] = ch
    rows, dx, dy = HEAD_UP
    if fwd:
        rows, dx = rows[:-1] + [THROAT_FWD], dx + HEAD_FWD_DX
    out.update(piece(rows, dx, dy))
    return out


# ---- body: standing pose (dove frames 1..28, cut variants included).  The
# breast is 1 px slimmer than the dove's (outline at c1, not c0) so it does not
# read as a pigeon's chest.
BODY_STAND = ([
    ".K32123K..................",   # r0
    ".K321223K.................",   # r1
    ".K3224234K................",   # r2   wing front edge starts (c5)
    ".K324WW334K...............",   # r3   white covert patch: bold diagonal band
    ".K324wWW334K..............",   # r4   along the upper/front part of the wing,
    ".K3243wWW334K.............",   # r5   shade pixels on its lower-front side
    ".K33243wWW334K............",   # r6
    ".K4332433ww334K...........",   # r7
    "..K443355333555KKK........",   # r8   primaries
    "...KK4433555555543KKK.....",   # r9   tail starts under the wing tip
    ".....K444224KK5444433KKK..",   # r10
    "..............KK55544433K.",   # r11  long pointed tail
    "................KKKKKKKK..",   # r12
], 0, 0)
# Crouch frames (jump take-off / landing, dove 6 & 11): the body sinks 1 px but
# the tail stays exactly where it is when standing (tip on the feet row), so the
# tail keeps its shape; rows r7..r11 merge the lowered body with that tail.
BODY_CROUCH = (BODY_STAND[0][:7] + [
    ".K4332433ww334KKKK........",   # r7   wing tip meets the tail's top edge
    "..K443355333555543KKK.....",   # r8
    "...KK4433555555444433KKK..",   # r9
    ".....K444224KKKK55544433K.",   # r10
    "................KKKKKKKK..",   # r11
], 0, 0)


# ---- eat, lean pose (dove frames 29 & 34).  Head + body drawn as ONE piece in
# frame coordinates (x 12.., y 24..), stamped through the body cel at (25,38);
# the dove's head cel for this pose is dropped.  The head is tipped forward, so
# the crest (which leans back on the upright head) stands straight up here.
LEAN = ([
    #         1111111122222222223333333333444444444
    #         2345678901234567890123456789012345678
    "......................................",   # y24
    ".........KK...........................",   # y25
    "........K22K..........................",   # y26  crest tip
    "........KYK...........................",   # y27
    "........KYK...........................",   # y28
    "........KYYKKKK.......................",   # y29  crest base on the crown
    ".........KYYYY3K......................",   # y30
    "........KYYKYOY3K.....................",   # y31  eye, cheek, yellow behind it
    ".......KYYYYOOY3K.....................",   # y32
    ".......KYYYyOO32K.....................",   # y33
    ".......KYyy22123K.....................",   # y34
    "......K1yy332213K.....................",   # y35  beak
    "......K1KK3221223K....................",   # y36
    "......K4K.K222123K....................",   # y37  hook tip
    ".......K..K3222123K...................",   # y38
    "..........K33222123KKK................",   # y39
    "...........K3322212234KK..............",   # y40
    "...........K33322WWW3334KKK...........",   # y41  wing patch
    "...........K33353wWWWw35555KKKKKK.....",   # y42
    "...........K333353333345554444333KKK..",   # y43  long pointed tail
    "............K33335555555544444443333K.",   # y44
    ".............K433333333KKKKKKKKKKKKK..",   # y45
    "..............K4444KKKK...............",   # y46
], 12 - 25, 24 - 38)

# ---- eat, crouched pose (dove frames 30..33): body (cel at x22,y38) ...
BODY_FLAT = ([
    #  0         1         2
    #  01234567890123456789012345678
    ".......KK....................",   # r0
    "....KKK22KKK.................",   # r1
    "..KK22222222KK...............",   # r2
    "KK222WWWW33333KKK............",   # r3  wing patch
    "2222153wWWWw35555KKKKKK......",   # r4
    "22112253333335554443333KKKKK.",   # r5  long tail: the body is level, so the
    "1122222555555554444444333333K",   # r6  tail reaches 2 px further back than
    "3333333444444KKKKKKKKKKKKKKK.",   # r7  when it slopes down to the ground
    "444444444KK..................",   # r8
    "KKKKKK.KK....................",   # r9
], 0, 0)
# ... and its head (cel at x14, y42 / y41 — it bobs while pecking).  The head is
# held like the upright one, so the crest leans back toward the tail exactly
# like the upright crest (same 2 px yellow + 2 px grey tip).
HEAD_GROUND = ([
    "......KK.",   # r-4  crest tip outline
    ".....K22K",   # r-3  crest tip
    "....KYKK.",   # r-2
    "...KYK...",   # r-1
    "..KYYKKKK",   # r0   crest base, crown
    ".KYYYYY23",   # r1
    "KYYKYOY22",   # r2   eye, cheek, yellow behind it
    "KYYYOOY32",   # r3
    "K1YyOO344",   # r4   beak
    "K4KKKKKKK",   # r5   hook tip
    ".K.......",   # r6
], -1, -4)

# ---- flight: head (cel at x15, y26 / y25): the upright face, crest swept back
HEAD_FLY = ([
    "......KKK..",   # r-4
    ".....KY22K.",   # r-3  crest tip (2 px grey), swept back
    "....KYKKK..",   # r-2
    "...KYYK....",   # r-1  crest base (2 px yellow); gap under the tip
    "..KYYYKKK..",   # r0   crown
    "..KYYYYY3K.",   # r1
    ".KKYKYOY3K.",   # r2   eye, cheek, yellow behind it
    "K11YYOOY3K.",   # r3   beak
    "K4KYyOO33..",   # r4   hook tip
    ".KKYy3212..",   # r5
    "...K432....",   # r6
], -1, -4)
# ... body (cel at x18, y29 / y28) with a long pointed tail instead of the fan;
# the belly keeps the dove's two-tone checker (rows r6..r9).
BODY_FLY = ([
    #  0         1         2         3
    #  0123456789012345678901234567890123456
    "...3K................................",   # r0
    "...24K..3............................",   # r1
    "...1211222KKKKK....KKKKKKKKKKKK......",   # r2
    "..3312222222444KKKK333333333333KKK...",   # r3
    "K44332222222222444444444444444444K...",   # r4
    ".K4332222222222233445555555544KKKK...",   # r5
    "..K4323222222323335555555KKKKK.......",   # r6
    "...K4322323232344KKKKKKKKK...........",   # r7
    "...K44332323234KK....................",   # r8
    "....K443323244K......................",   # r9
    ".....KK44434KK.......................",   # r10
    ".......KKKKK.........................",   # r11
], 0, 0)
# ... near wing, raised (dove frame 37) and lowered (dove frame 38)
WING_UP = ([
    "...........K..",   # r0
    "..........KK..",
    "..........K5K.",
    ".........K35K.",
    ".........K35K.",   # r4   primaries
    "........K345K.",
    ".......K3445K.",
    ".......K34445K",
    "......K344445K",   # r8
    ".....KW333334K",   # r9   white coverts along the leading edge
    ".....KWW3334K.",
    "....KWWw3334K.",
    "...KWWw33334K.",
    "...KWWw33334K.",
    "..KWWw333334K.",
    "KKWWw333334K..",
    "...23333334K..",
    "....2222223...",
    "......2222....",
    "........2.....",   # r19
], 0, 0)
WING_DOWN = ([
    "..KKKKK.......",   # r0
    "......3KKK....",
    "....2223334...",
    "...22233334K..",
    "KKWWWw33334K..",   # r4   white coverts along the leading edge
    "..KWWw333334K.",
    "...KWWw33334K.",
    "...KWWw33334K.",
    "....KWw33334K.",
    ".....KW33334K.",   # r9
    ".....K3444445K",   # r10  primaries
    "......K344445K",
    ".......K34445K",
    ".......K3445K.",
    "........K345K.",
    ".........K35K.",
    ".........K35K.",
    "..........K5K.",
    "..........KK..",
    "...........K..",   # r19
], 0, 0)


def piece(rows, dx=0, dy=0):
    out = {}
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch not in '. ':
                out[(x + dx, y + dy)] = ch
    return out


def generic(c, m=GENERIC):
    return piece(recolor(chars(c), m))


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


def art_for(li, c, body_top):
    kind = classify(li, c)
    if kind == 'legs':
        return piece(recolor(chars(c), LEGS))
    if kind == 'head_up':
        return head_upright(c, body_top)
    if kind == 'head_dip':
        return {}                      # drawn as part of LEAN
    if kind == 'body_stand':
        top = stand_top(c)
        art = BODY_STAND if c['y'] + top + len(BODY_STAND[0]) - 1 <= GROUND_Y else BODY_CROUCH
        return piece(art[0], 0, top)
    table = {'body_lean': LEAN, 'body_flat': BODY_FLAT, 'head_ground': HEAD_GROUND,
             'head_fly': HEAD_FLY, 'body_fly': BODY_FLY, 'wing_up': WING_UP, 'wing_down': WING_DOWN}
    return piece(*table[kind])


# ---------------------------------------------------------- composition ---
# Hand fixes after composition, frame-local (x, y) -> palette key, per dove frame.
FIXES = {
    6: {(29, 37): '3'},     # take-off crouch: throat row sits on the body's top row (no double outline)
    11: {(30, 36): 'K'},    # landing crouch: the dove leaves the back of the neck open here
}


def build_frame(fi):
    img = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    px = img.load()
    body = cel(fi, 2)
    body_top = body['y'] + stand_top(body) if classify(2, body) == 'body_stand' else CELL
    for li in range(5):
        c = cel(fi, li)
        if c is None:
            continue
        for (x, y), ch in art_for(li, c, body_top).items():
            X, Y = c['x'] + x, c['y'] + y
            if 0 <= X < CELL and 0 <= Y < CELL:
                px[X, Y] = RGBA[ch]
    for (X, Y), ch in FIXES.get(fi, {}).items():
        px[X, Y] = RGBA[ch]
    if fi in GROUNDED:      # nothing may hang below the feet (birds stand on the union bottom)
        below = img.crop((0, GROUND_Y + 1, CELL, CELL)).getbbox()
        assert below is None, ('pixels below the feet row in dove frame', fi, below)
    return img


# ------------------------------------------------------------- checks ---
def validate(sheet, tags):
    """Fail loudly if the sheet breaks the pack rules."""
    allowed = set(RGBA.values())
    px = sheet.load()
    for y in range(sheet.height):
        for x in range(sheet.width):
            p = px[x, y]
            assert p[3] in (0, 255), ('semi-transparent pixel', x, y)
            assert p[3] == 0 or p in allowed, ('off-palette pixel', x, y, p)
    for t in tags:
        fr = [sheet.crop((k * CELL, 0, (k + 1) * CELL, CELL)) for k in range(t['from'], t['to'] + 1)]
        bottoms = [f.getbbox()[3] for f in fr]
        if t['name'] != 'Fly':      # feet on the clip's bottom row
            assert max(bottoms) == GROUND_Y + 1, (t['name'], bottoms)
    # The 1-px outline must be closed everywhere (crest, beak, tail ...).  The
    # pack itself leaves a few pixels open (feet soles, the belly between the
    # legs), so only openings the dove frame does NOT have count as errors.
    dove = Image.open(DOVE_PNG).convert('RGBA')
    order = [fi for _, fis in CLIPS for fi in fis]
    for k, fi in enumerate(order):
        mine = open_pixels(sheet.crop((k * CELL, 0, (k + 1) * CELL, CELL)))
        base = open_pixels(dove.crop((fi * CELL, 0, (fi + 1) * CELL, CELL)))
        assert mine <= base, ('open outline', 'frame', k, sorted(mine - base))


def open_pixels(img):
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


# ----------------------------------------------------------- previews ---
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


def clip_strip(img, rects, u, gap=3):
    L, T, R, B = u
    w, h = R - L, B - T
    strip = Image.new('RGBA', (gap + len(rects) * (w + gap), h), BG)
    for i, (fx, fy, fw, fh) in enumerate(rects):
        strip.alpha_composite(img.crop((fx + L, fy + T, fx + R, fy + B)), (gap + i * (w + gap), 0))
    return strip


def preview_sheet(path):
    from PIL import ImageDraw
    me = os.path.join(OUT, 'Cockatiel.json')
    dove_tags = {'Idle': 'Idle', 'Walk': 'walk', 'Jump': 'Jump', 'Eat': 'Eat', 'Fly': 'Fly'}
    blocks = []
    for label, js, names in (('Cockatiel (new)', me, {k: k for k in dove_tags}),
                             ('Collared Dove (base)', DOVE_JSON, dove_tags)):
        rows = [clip_strip(*load_clip(js, names[t])) for t, _ in CLIPS]
        blocks.append((label, rows))
    gap = 3
    W = max(r.width for _, rows in blocks for r in rows)
    H = sum(gap + r.height for _, rows in blocks for r in rows) + len(blocks) * (gap + 4)
    can = Image.new('RGBA', (W, H), BG)
    y, marks = 0, []
    for label, rows in blocks:
        marks.append((label, y))
        y += gap + 4
        for r in rows:
            can.alpha_composite(r, (0, y))
            y += r.height + gap
    S = 10
    big = can.resize((W * S, H * S), Image.NEAREST)
    d = ImageDraw.Draw(big)
    for label, yy in marks:
        d.text((gap * S, yy * S + 8), label + '  (rows: idle, walk, jump, eat, fly)', fill=(0, 0, 0, 255))
    big.convert('RGB').save(path, optimize=False)


def preview_context(path):
    bg = Image.open(os.path.join(REPO, 'assets/garden-background.png')).convert('RGB')
    s = 900 / bg.width
    bg = bg.resize((900, round(bg.height * s)), Image.LANCZOS)
    band = bg.crop((0, bg.height - 220, 900, bg.height)).convert('RGBA')
    ground = 220 - 30                                  # garden.js GROUND_BAND = 30
    B = os.path.join(REPO, 'assets/birds')
    lineup = [
        ('pigeon', 0.8, B + '/pigeon/Pigeon.json', 'Idle', False),
        ('sparrow', 0.7, B + '/sparrow/Sparrow.json', 'Idle', False),
        ('dove', 0.7, DOVE_JSON, 'Idle', False),
        ('cockatiel', SIZE, os.path.join(OUT, 'Cockatiel.json'), 'Idle', False),
        ('toucan', 0.8, B + '/toucan/Toucan-Idle.json', None, False),
        ('macaw', 0.8, B + '/blue_macaw/Blue Macaw-Idle.json', None, False),
        ('cockatiel', SIZE, os.path.join(OUT, 'Cockatiel.json'), 'Idle', True),
    ]
    sprites = []
    for name, size, js, tag, mirror in lineup:
        img, rects, (L, T, R, Bt) = load_clip(js, tag)
        fx, fy, _, _ = rects[0]
        sc = 64 * size / (Bt - T)
        spr = img.crop((fx + L, fy + T, fx + R, fy + Bt))
        spr = spr.resize((round((R - L) * sc), round((Bt - T) * sc)), Image.NEAREST)
        if mirror:
            spr = spr.transpose(Image.FLIP_LEFT_RIGHT)
        sprites.append(spr)
    total = sum(sp.width for sp in sprites)
    step = (900 - total) / (len(sprites) + 1)
    x = step
    for sp in sprites:
        band.alpha_composite(sp, (round(x), ground - sp.height))
        x += sp.width + step
    band = band.resize((1800, 440), Image.NEAREST)
    band.convert('RGB').save(path, optimize=False)


def manifest(path):
    entry = ("{ id: 'cockatiel', name: 'Cockatiel', size: %s, rarity: 'rare', cost: 120, "
             "sheet: 'assets/birds/cockatiel/Cockatiel.json',\n"
             "    tags: { idle: 'Idle', walk: 'Walk', jump: 'Jump', eat: 'Eat', fly: 'Fly' } },") % SIZE
    m = {
        'format': 'single',
        'birdsEntry': entry,
        'size': SIZE,
        'palette': sorted(set(PAL.values())),
        'notes': (
            "Final (candidate C polished). Built from the Collared Dove's Aseprite LAYERS (legs/body/head/wing) so the "
            "cockatiel rides on the dove's exact animation; every distinct dove cel is replaced by one hand-drawn "
            "cockatiel cel, pasted wherever the dove reuses it, so crest/cheek/wing patch/tail are identical across "
            "repeated poses. Head: sits 1 px lower than the dove's (one neck row dropped) and is 1 px longer at the back; "
            "crest rises from the forehead and leans back (2 px yellow base, 2 px grey tip), yellow face and throat, "
            "5-px orange cheek framed by yellow, short hooked beak in the body greys. Body: slimmer breast than the dove, "
            "white covert streak on the folded wing, dark primaries, long pointed tail (~13 px past the vent). The crest "
            "follows the head: upright head = leaning back, tipped-forward eat head = straight up, head on the ground = "
            "leaning back toward the tail, flight = swept back. Jump crouch frames keep the standing tail (body sinks, "
            "tail tip stays on the feet row). The flight belly keeps the dove's two-tone checker. Walk head bob limited "
            "to +-1 px. 13 colours, all opaque, outline #000000 like the dove. size 0.79 = 1.87 screen px per art px, "
            "the same as the dove (idle box 27 px tall incl. crest). No grounded frame reaches below the feet row (y=48), "
            "so every grounded clip's union bottom = feet. Frames: Idle 0-3 (dove 1-4), Walk 4-9 (dove 12-17), "
            "Jump 10-16 (dove 5-11), Eat 17-23 (dove 28-34), Fly 24-25 (dove 37-38); durations copied from the dove. "
            "64x64 cells like the dove. Copy Cockatiel.png + Cockatiel.json to assets/birds/cockatiel/ and add "
            "birdsEntry to BIRDS (plus a SPECIES_INFO 'cockatiel' entry, e.g. de: 'Nymphensittich', "
            "latin: 'Nymphicus hollandicus')."),
        'knownIssues': [
            "Idle/walk/jump use one head drawing (the dove reuses one head cel there too), so the face never "
            "blinks or turns; the dove's 2-px 'stretch' eye in jump frame 3 became a normal eye.",
            "The walk keeps the dove's step cycle, including a (now +-1 px) head bob and a 1-px kink in the back of "
            "the neck in Walk 1 and Walk 4.",
            "Fly is only 2 frames (same as the dove's Fly tag the game uses).",
            "The crouched eat body is level, so its tail reaches 2 px further back than the standing tail. Switching "
            "idle to eat shifts the sprite about 3 px sideways (the dove shifts about 3.5 px).",
            "Open outline pixels exist only where the dove has them too: feet soles and the belly between the legs "
            "(walk/jump frames).",
            "The orange cheek (luma about 145) is close to the mid body grey, so in the gradient-mapped rare variants "
            "the cheek is a mid-tone spot on the light face. It is still visible, but not as strong.",
            "Only the 5 game clips are exported (26 frames, re-indexed from 0). The dove's extra tags "
            "(Cooo, Peck, Takeoff, Sleep) and its untagged frame 0 are dropped.",
        ],
    }
    with open(path, 'w') as f:
        json.dump(m, f, indent=2, ensure_ascii=False)
        f.write('\n')
    return m


# ------------------------------------------------------------------ main ---
def main():
    os.makedirs(OUT, exist_ok=True)
    dove_json = json.load(open(DOVE_JSON))
    durations = [f['duration'] for f in dove_json['frames'].values()]
    order = [fi for _, fis in CLIPS for fi in fis]
    sheet = Image.new('RGBA', (CELL * len(order), CELL), (0, 0, 0, 0))
    frames, tags, k = {}, [], 0
    for tag, fis in CLIPS:
        tags.append({'name': tag, 'from': k, 'to': k + len(fis) - 1, 'direction': 'forward', 'color': '#000000ff'})
        for fi in fis:
            sheet.paste(build_frame(fi), (k * CELL, 0))
            frames[f'Cockatiel {k}.ase'] = {
                'frame': {'x': k * CELL, 'y': 0, 'w': CELL, 'h': CELL}, 'rotated': False, 'trimmed': False,
                'spriteSourceSize': {'x': 0, 'y': 0, 'w': CELL, 'h': CELL},
                'sourceSize': {'w': CELL, 'h': CELL}, 'duration': durations[fi]}
            k += 1
    validate(sheet, tags)
    sheet.save(os.path.join(OUT, 'Cockatiel.png'), optimize=False)
    meta = {'app': 'https://www.aseprite.org/', 'version': '1.x-dev', 'image': 'Cockatiel.png',
            'format': 'RGBA8888', 'size': {'w': sheet.width, 'h': sheet.height}, 'scale': '1',
            'frameTags': tags}
    with open(os.path.join(OUT, 'Cockatiel.json'), 'w') as f:
        json.dump({'frames': frames, 'meta': meta}, f, indent=1)
        f.write('\n')
    if '--preview' in sys.argv:
        pdir = sys.argv[sys.argv.index('--preview') + 1]
        os.makedirs(pdir, exist_ok=True)
        preview_sheet(os.path.join(pdir, 'preview_sheet.png'))
        preview_context(os.path.join(pdir, 'preview_context.png'))
        manifest(os.path.join(pdir, 'manifest.json'))


if __name__ == '__main__':
    main()
