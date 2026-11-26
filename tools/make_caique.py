#!/usr/bin/env python3
"""Caique (Weißbauchpapagei, Pionites leucogaster) sprite sheet for the garden minigame.

Drawn on the PeakPixels *Collared Dove*'s animation with tools/dove_rig.py,
the same way tools/make_cockatiel.py drew the cockatiel: every distinct dove
cel is replaced by one hand-drawn cel (the char maps below), pasted wherever
the dove uses it, so markings are identical wherever a pose repeats.

What makes it read as a white-bellied caique at ~24 px (in-game ~44 px):
  * a big round head with a flat-ish crown and no crest (9 px wide plus the
    beak, a third of the bird's height): an apricot-orange cap over
    forehead, crown and nape that meets the yellow face in a clean line at
    eye level; yellow lores, cheeks and throat; a near-black eye with one
    pale pink pixel of bare eye ring behind it; a strong pale-horn beak
    whose upper mandible curves down over the darker lower mandible to a
    hook tip that points down;
  * a thick neck: the neck is not taken from the dove (its 4-px neck reads
    as a pigeon's).  BODY_STAND carries a 6-px-wide column of throat yellow
    and nape orange above its top row; the head is stamped over it, so when
    the dove stretches its neck (idle bob, jump) the same thick neck shows,
    and when the head sits low the column is hidden behind it;
  * a plump, upright body: a big clean white breast and belly in front
    (three whites, the shade along the wing and the underside), the green
    folded wing on the side (light coverts at the shoulder and along the
    leading edge, a dark feather line, a dark back edge), the blue-black
    primaries as the wedge-shaped wing tip, lime-green thighs and a yellow
    vent where the belly meets the legs, and a SHORT square green tail (3 px past the
    wing tip) - unlike the cockatiel's crest, grey body and long pointed
    tail;
  * the same face in every pose: upright (idle/walk/jump), tipped forward
    (eat lean), lowered to the ground with the hook on the soil (eat
    crouch) and in flight; short, broad, round-tipped wings with green
    coverts and blue-black flight feathers.

The normal colours follow the player's own bird (photo): orange cap,
yellow face, white belly, lime-green thighs, yellow vent, pink feet and a
pale pinkish beak with a pale eye ring - the green-thighed white-bellied
caique.

Palette (27 keys).  Every region a variant recolours has its own key(s):
  K outline (#000000)          E eye             R bare eye ring
  B b beak / beak shade        C cap (forehead + crown)
  X crown flecks (looks like C; dark flecks in the juvenile)
  N nape + back of the head    Q hindneck (the neck column's back)
  Z lores                      Y y cheeks, throat / shade
  W w v breast + belly whites  T t thighs / shade    H h vent / shade
  G g D back + wing coverts    P p flight feathers   L tail
  F f front / back foot
Variants (exact palette swaps of the normal sheet; the card is the genus
Pionites, see js/garden-variants.js):
  blackheaded (Grünzügelpapagei)  C X N black, Q orange band, Z green lores,
                                  Y y yellow-orange, T t orange thighs,
                                  beak, eye ring and feet dark grey
  parblue     (Parblau)           its recessive mutation: black cap, cream
                                  and pale yellow instead of yellow/orange,
                                  turquoise instead of green
  juvenile    (Jungvogel)         brownish flecked cap, yellowish breast and
                                  belly, grey eye ring, brown eye

Writes:  <repo>/assets/birds/caique/Caique.{png,json} (+ Caique-<Variant>.{png,json}
         for colour variants that are not an exact palette swap, e.g. red eyes)
Usage:   python3 tools/make_caique.py [--out DIR] [--preview DIR] [--draft | --check]
         --preview DIR  also write every sheet + preview_frames.png + preview_context.png
         --draft        report problems instead of failing, write nothing to the repo
         --check        strict validation only, write nothing

Deterministic: running it again reproduces the outputs byte-for-byte.
"""
import os
import sys

sys.dont_write_bytecode = True          # importing dove_rig leaves no __pycache__ behind
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dove_rig as rig

NAME = 'Caique'
OUT = os.path.join(rig.REPO, 'assets/birds/caique')
SIZE = 0.68          # garden-data.js `size`: idle box 24 px tall -> 64*0.68/24 = 1.81 screen px per art px (~44 px)

# ---------------------------------------------------------------- palette ---
PAL = {
    'K': '#000000',                      # outline (same as the dove pack)
    'E': '#1e1410',                      # eye: near-black brown
    'R': '#f3e6e1',                      # bare eye ring (pale pinkish white)
    'B': '#f2dfd5', 'b': '#d0b4a8',      # beak: pale pinkish horn / shade (lower mandible, hook tip)
    'C': '#f59a32',                      # cap: forehead + crown (orange)
    'X': '#f59a33',                      # crown flecks (looks like C; dark in the juvenile)
    'N': '#e3801f',                      # nape + back of the head (deeper orange)
    'Q': '#e3801e',                      # hindneck, the neck column's back (looks like N)
    'Z': '#f7d23b',                      # lores: in front of and below the eye (looks like Y)
    'Y': '#f7d23a', 'y': '#dfb02a',      # face: cheeks, throat / shade
    'W': '#fbfaf5', 'w': '#e3e0d8', 'v': '#c6c1b8',   # breast + belly: white ramp
    'T': '#8cc63e', 't': '#6ea832',      # thighs / shade: lime green, as in the photo
    'H': '#f5c62e', 'h': '#d9a822',      # vent + undertail coverts / shade: yellow
    'G': '#5cb043', 'g': '#43923a', 'D': '#2f6f2b',   # back + wing coverts: green ramp
    'P': '#283a78', 'p': '#1b2552',      # flight feathers: blue / blue-black
    'L': '#4a9a3c',                      # tail
    'F': '#e3aaa2', 'f': '#bd8880',      # feet: front leg / back leg (pink)
}
# Keys that look alike here (X/C, Q/N, Z/Y) differ by one hex unit, so every
# variant below stays an exact palette swap of the normal sheet (a `map` in
# js/garden-variants.js, no extra sheet).

# Rare colour variants (ids as in js/garden-variants.js): full palettes, same
# keys.  The card is the genus (Pionites), so its relative and that relative's
# mutation count as colour forms, as for the toucan and the macaw.
VARIANTS = {
    # Grünzügelpapagei (P. melanocephalus): black cap over forehead, crown and
    # nape, orange hindneck band, green lores, yellow-orange cheeks and throat,
    # orange thighs, dark grey beak, eye ring and feet.
    'blackheaded': dict(PAL, C='#2b2a30', X='#2b2a31', N='#1d1c21', Q='#f7901c', Z='#3e9444',
                        Y='#f5c21a', y='#dca712', T='#f28a1e', t='#d46f14', H='#f4a830', h='#d88e22',
                        B='#3c3a40', b='#2a292e', R='#57525a', F='#4e4a4e', f='#38353a'),
    # Parblau: recessive mutation of the Grünzügelpapagei - yellow and orange
    # mostly gone (cream, pale yellow), the greens turn turquoise.
    'parblue': dict(PAL, C='#2b2a30', X='#2b2a31', N='#1d1c21', Q='#eed8c0', Z='#568e88',
                    Y='#f1e6cf', y='#d9cbb0', T='#eee5d2', t='#d6cbb5', H='#ebe2cf', h='#d3c8b2',
                    G='#6dbdb8', g='#58a8a4', D='#3d807f', L='#5696a6',
                    B='#3c3a40', b='#2a292e', R='#5a524e', F='#4e4a4e', f='#38353a'),
    # Jungvogel: dull brownish cap with dark flecks, yellowish breast and belly,
    # grey eye ring, darker horn beak, brown eye.
    'juvenile': dict(PAL, C='#b07040', X='#4a3022', N='#9c6038', Q='#a86e3e',
                     W='#f6eecb', w='#e6d9a8', v='#cbbd8a', R='#b3aeaa', B='#dccdb6', b='#bba98e',
                     E='#3a2418'),
}
assert all(v.keys() == PAL.keys() for v in VARIANTS.values())


# ================================================================== ART ====
# Char maps.  '.' = leave transparent / untouched, other letters = PAL keys.
# Each piece is (rows, dx, dy): rows are pasted at dove-cel origin + (dx, dy).

def at(rows, x0, y0, cel_x, cel_y):
    """A piece drawn in frame coordinates (its first row starts at frame pixel
    (x0, y0)), pasted through a dove cel whose origin is (cel_x, cel_y)."""
    return (rows, x0 - cel_x, y0 - cel_y)


# ---- head: every upright pose (idle / walk / jump / first eat frame).  Index
# = dove head-cel column + 4, first row = cel row -1 (the crown sits 1 px above
# the dove's).  In idle frame 0 the cel is at (23, 27): the beak spans x 19..22,
# the head x 23..31.  The last row only closes the hook tip; the row above it
# (the throat, 8 px wide) sits on the neck column / the body's top row.
HEAD_UP = ([
    "......KKKKK...",   # r-1  flat-ish crown
    ".....KCXCCNK..",   # r0   cap; X = crown flecks (juvenile palettes)
    "....KCCCCXNNK.",   # r1   cap, deeper orange at the back of the head
    "..KKCZERCCNNK.",   # r2   culmen outline, orange forehead, lores, eye, eye ring
    ".KBBYZZYYYNNK.",   # r3   upper mandible; yellow cheek below the cap line; nape
    "KBBbYYYYYYNNK.",   # r4   upper mandible curving down
    "KBKbYYYYYyNNK.",   # r5   gape (K) between upper and lower mandible
    "KbKKKYYYyNNK..",   # r6   hook tip pointing down; throat (bottom row = neck width)
    ".K............",   # r7   under the hook tip
], -4, -1)
# The dove's 9-px "head forward" walk cel: the head is stamped 1 px further
# back than the dove's (a softer bob, 1 px ahead of the neck); FIXES add the
# one nape pixel that bridges it to the neck column.
THROAT_FWD = None
HEAD_FWD_DX = 1
# Every dove head-cel row is covered (the tallest cel has 11 rows), so the rig
# draws none of the dove's thin neck rows: the thick neck is BODY_STAND's
# column.  NECK is therefore never used; it names the column's colours.
HEAD_ROWS = 12
NECK = ['Y', 'Y', 'y', 'N']

# ---- body: standing pose (dove frames 1..28, cut variants included).  Index =
# dove body-cel column + 2; the first four rows (c-4..c-1) are the neck column
# ABOVE the dove body's top row.  The head is drawn over it: with the head low
# (idle 1-2, walk) the column is hidden, as the head rises (idle bob, jump) up
# to four rows of the same 8-px neck show.  The body is short enough to sink 1
# px in the two jump crouch frames without reaching below the feet row, so it
# is also used there (BODY_CROUCH is only the rig's fallback).
BODY_STAND = ([
    #  idx = cel + 2:   0123456789012345678
    "..KYYYyQQK.........",   # c-4  neck column: yellow throat (shade line) | orange hindneck
    "..KYYYyQQK.........",   # c-3
    "..KYYYyQQK.........",   # c-2
    "..KYYYyQQK.........",   # c-1
    "..KWWWwQggK........",   # r0   white breast starts under the throat; hindneck -> green back
    ".KWWWWwGGggK.......",   # r1   shoulder: light green coverts
    "KWWWWwGGGggDK......",   # r2   full round breast
    "KWWWWwGGgggDK......",   # r3
    "KWWWwwGgggggDK.....",   # r4   leading edge of the folded wing (G)
    "KwWWwvGDDgggDK.....",   # r5   dark line: lower edge of the wing coverts
    "KwWWwvvGgDDgPDK....",   # r6   primaries start
    ".KwwwwvvDggPPpK....",   # r7   blue-black wing tip, belly shade under the wing
    ".KvwwwwvvDPPppLKK..",   # r8   tail appears under the wing tip
    "..KvvwTTttDppLLLLK.",   # r9   green thighs; short square tail
    "..KKKKKKTTHHhhLLLK.",   # r10  thighs over the legs (dove belly row), yellow vent under the tail end
    "..............KKK..",   # r11  tail's lower edge
], -2, -4)
BODY_CROUCH = BODY_STAND

# ---- eat, lean pose (dove frames 29 & 34): head + body as ONE piece, frame
# coordinates from (12, 28), pasted through the dove body cel at (25, 38); the
# dove's dipped head is dropped.  The head is tipped forward (beak lower, the
# cap rolled toward the front), the body leans with the tail level.
LEAN = at([
    # x: 1111111122222222223333333333444
    #    2345678901234567890123456789012
    ".......KKKK....................",   # y28  crown
    ".....KKCXCNKK..................",   # y29  cap, flecks
    "....KCCCCCXNNK.................",   # y30
    "....KCCCCCCNNNKK...............",   # y31  nape runs into the back
    "...KCZERCCNNNNggKKK............",   # y32  forehead, lores, eye, eye ring
    "...KYZZYYYyNNgGGgggKK..........",   # y33  yellow cheek; shoulder coverts
    "..KBBYYYYYyNWwGGggggDK.........",   # y34  upper mandible; white breast begins
    "..KBBbYYYyyYWwGgggggDDK........",   # y35
    "..KBKbYYyYYWWwGggDDgggDK.......",   # y36  gape; dark covert line
    "..KbKKKYYYWWWwGgggDDgPDK.......",   # y37  hook tip; throat; wing tip starts
    "...K..KYWWWWwwvGgggPPPpK.......",   # y38
    "......KWWWWWwwvvDgPPppLLK......",   # y39  blue-black wing tip, tail
    "......KWWWWwwwvvvDPPpLLLK......",   # y40
    ".......KWWWwwwvvvDppLLLLK......",   # y41
    ".......KwWWwwvvvvvDpLLLKK......",   # y42  square tail end
    "........KwwwwvvvvvTHhhKK.......",   # y43  thighs, vent
    ".........KvvvvvvTTTHhhK........",   # y44
    "..........KvvvvvTTthhK.........",   # y45
    "...........KKKKKKKKKKKK........",   # y46  belly line over the legs
], 12, 28, 25, 38)

# ---- eat, crouched pose (dove frames 30..33): body (dove cel at 22,38), a low
# round back with the wing tip and the tail, white breast, green thighs and vent
# low at the front ...
BODY_FLAT = at([
    # x: 2222233333333334444
    #    3456789012345678901
    ".....KKKKK.........",   # y38  top of the back
    "...KKgGGGgKKK......",   # y39  shoulder coverts
    "KKKgggGGgggggK.....",   # y40  outline joins the head's crown
    ".NNggGGggggggDK....",   # y41  nape runs into the back (under the head)
    "..NgGGgggggPPDDK...",   # y42  primaries
    "..ggGgggPPPppDLLK..",   # y43  wing tip, tail
    "..WwDggPPpppLLLLLK.",   # y44
    ".WWwvDDDpppLLLLLK..",   # y45  square tail end
    "WWwwvvTTTHhhKKKKK..",   # y46  white breast, green thighs, yellow vent
    "KKKKKTTttKKKK......",   # y47  belly line (only the toes show below)
], 23, 38, 22, 38)
# ... and its head (dove cel at 14,42 / 14,41: it bobs while pecking): the
# upright face lowered until the hook touches the ground (row y48 = feet row);
# its right edge (nape, throat) has no outline and runs into the body.
HEAD_GROUND = at([
    "......KKKKK..",   # y40  crown top
    ".....KCXCCNK.",   # y41  cap, flecks
    "....KCCCCXNNN",   # y42
    "..KKCZERCCNNN",   # y43  forehead, lores, eye, eye ring
    ".KBBYZZYYYNNN",   # y44  upper mandible, cheek
    "KBBbYYYYYYNNW",   # y45
    "KBKbYYYYYyYWW",   # y46  gape, lower mandible; throat into the breast
    "KbKKKYYYyYYWW",   # y47  hook tip
    ".K..KKKKKKKKK",   # y48  hook tip on the ground; chin outline
], 12, 40, 14, 42)

# ---- flight (dove frames 37 & 38).  Head (dove cel at 15,26 / 15,25) and body
# (dove cel at 18,29 / 18,28) keep their offset, so they are drawn together in
# frame-37 coordinates: the upright face, its nape and throat running into a
# plump body with white belly, green thighs, yellow vent and the short square tail.
HEAD_FLY = at([
    "......KKKKK..",   # y24  crown top
    ".....KCXCCNK.",   # y25  cap, flecks
    "....KCCCCXNNK",   # y26
    "..KKCZERCCNNN",   # y27  forehead, lores, eye, eye ring; nape into the back
    ".KBBYZZYYYNNN",   # y28
    "KBBbYYYYYYNNN",   # y29
    "KBKbYYYYYyNNN",   # y30  gape, lower mandible
    "KbKKKYYYyYYNN",   # y31  hook tip; throat
    ".K..KYYYYYY..",   # y32  throat into the breast
], 13, 24, 15, 26)
BODY_FLY = at([
    # x: 1111222222222233333333334
    #    6789012345678901234567890
    "........KKKKKKKKK........",   # y27  back
    ".......NNggggggggKKK.....",   # y28
    ".......NgggggggggggLKKK..",   # y29  tail
    ".......NggggggggggLLLLLK.",   # y30  square tail end
    "...KYYYYgggggggggDLLLLLK.",   # y31  yellow throat
    "..KYYYYYWwgggggDDDLLLLLK.",   # y32  white breast
    "..KYYWWWWWwwggDDDvhLLLKK.",   # y33
    "...KWWWWWWWwwDvvvTHhKK...",   # y34  green thighs, yellow vent, legs tucked
    "....KWWWWWWwwvvvTTHhK....",   # y35
    ".....KWWWWWwwwvvTThK.....",   # y36
    "......KKKwwwvvvttKK......",   # y37  round belly
    ".........KKKKKKKK........",   # y38
], 16, 27, 18, 29)
# ... near wing raised (dove frame 37, cel at 23,15) and lowered (frame 38,
# drawn in frame coordinates from (22,27)): short, broad and round-tipped, green
# coverts along the leading edge, blue-black flight feathers along the trailing
# edge and the tip; the root has no outline and runs into the back.
WING_UP = ([
    "..............",   # r0
    "..............",   # r1
    ".........KKK..",   # r2   rounded tip
    "........KpppK.",   # r3
    ".......KPPppK.",   # r4
    ".......KPPPpK.",   # r5   flight feathers: blue, blue-black trailing edge
    "......KgPPPpK.",   # r6
    "......KgPPPppK",   # r7
    ".....KggPPPppK",   # r8
    ".....KGgPPPppK",   # r9   green coverts along the leading edge
    "....KGggPPPpK.",   # r10
    "....KGggPPPpK.",   # r11
    "...KGGggPPPpK.",   # r12
    "...KGGgggPPpK.",   # r13
    "..KGGggggPPpK.",   # r14
    "KKGGgggggPPK..",   # r15  leading edge meets the body
    "...ggggggPpK..",   # r16  root runs into the back
    "....gggggg....",   # r17
    "......gggg....",   # r18
], 0, 0)
WING_DOWN = at([
    # x: 2222222233333
    #    2345678901234
    "...gGGGgg....",   # y27  wing root, runs into the back
    "..gGGGGggg...",   # y28
    ".KGGGgggggD..",   # y29  leading edge (coverts)
    ".KGGggggggDK.",   # y30
    "..KGggggPPpK.",   # y31  flight feathers
    "..KGgggPPPpK.",   # y32
    "..KGggPPPPpK.",   # y33
    "...KGgPPPPpK.",   # y34
    "...KgPPPPppK.",   # y35
    "...KPPPPPppK.",   # y36
    "....KPPPPppK.",   # y37
    "....KPPPPpK..",   # y38
    ".....KPPPpK..",   # y39
    ".....KPPPpK..",   # y40
    "......KPppK..",   # y41
    "......KpppK..",   # y42
    ".......KKK...",   # y43  rounded tip
], 22, 27, 22, 29)

# ---------------------------------------------------------- composition ---
# Hand fixes after composition, frame-local (x, y) -> palette key, per dove frame.
FIXES = {
    6: {(30, 37): 'g'},     # take-off crouch: the throat row lies on the body's top row
                            # (no doubled outline at the back of the neck)
    12: {(29, 33): 'N'},    # walk, head forward: nape bridges the head (1 px ahead)
    15: {(29, 33): 'N'},    # to the neck column
}

ART = rig.Art(pal=PAL, head_up=HEAD_UP, throat_fwd=THROAT_FWD, head_fwd_dx=HEAD_FWD_DX, neck=NECK,
              body_stand=BODY_STAND, body_crouch=BODY_CROUCH, lean=LEAN, body_flat=BODY_FLAT,
              head_ground=HEAD_GROUND, head_fly=HEAD_FLY, body_fly=BODY_FLY, wing_up=WING_UP,
              wing_down=WING_DOWN, fixes=FIXES, head_rows=HEAD_ROWS)


def main(argv=sys.argv[1:]):
    opt = lambda f: argv[argv.index(f) + 1] if f in argv else None
    draft, check = '--draft' in argv, '--check' in argv
    out = None if (draft or check) else (opt('--out') or OUT)
    rep = rig.build(NAME, ART, out, variants=VARIANTS, strict=not draft, preview_dir=opt('--preview'), size=SIZE)
    for p in rep['problems']:
        print('PROBLEM', p)
    print({k: v for k, v in rep.items() if k != 'problems'})


if __name__ == '__main__':
    main()
