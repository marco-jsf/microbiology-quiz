#!/usr/bin/env python3
"""Cockatoo (Gelbhaubenkakadu, Cacatua galerita) sprite sheet for the garden minigame.

Drawn on the PeakPixels *Collared Dove*'s animation with tools/dove_rig.py,
the same way tools/make_cockatiel.py drew the cockatiel: every distinct dove
cel is replaced by one hand-drawn cel (the char maps below), pasted wherever
the dove uses it, so markings are identical wherever a pose repeats.

What makes it a Sulphur-crested Cockatoo at ~2 screen px per art px:
  * a big, bold sulphur-yellow crest (7 px wide, 8 rows): two long feathers
    whose tips curl forward toward the beak and a third feather that points
    back over the nape; lit yellow at the front, a darker gold along the back
    edge, white forehead feathers in front of its base.  The cockatiel's crest
    is a 1-2 px wisp; this one is a solid fan;
  * clean white plumage shaded only with cool light blue-greys (no cream, no
    pigeon grey): white on the lit upper front, the blue-grey ramp on the
    belly, the back, the wing edge and the flight feathers;
  * a big, strongly hooked, near-black beak (upper mandible with a lighter
    culmen, hook tip in front of the deep lower mandible), a black eye in a
    whitish-blue bare eye ring, a faint pale-yellow wash on the ear coverts;
  * a large round head on a thick neck and a stocky, deep-chested body with a
    broad, short tail whose underside is washed pale yellow (the underside of
    the raised wing in flight too); grey feet.
Proportions: idle box 25 x 30 px including the crest (head 15 px wide with the
beak), bigger than the pigeon in the garden (SIZE 0.94 = 2.0 screen px per art
px, about 60 px tall).

How the drawing sits on the dove rig:
  * HEAD_ROWS = 11 covers every row of the dove's head cels, so the dove's
    thin neck is never drawn.  Instead BODY_STAND starts with a 10-px-wide
    neck column (rows r-4..r0) whose front and back outlines are in the same
    columns as the head's throat and nape: when the dove raises its head the
    column shows (0-2 rows while standing, more in the jump stretch), when it
    lowers it the head covers the column.  The neck stays thick in every frame.
  * The head does not bob forward in the walk (cockatoos waddle, they do not
    nod like pigeons): HEAD_FWD_DX = 2 cancels the dove's 2-px forward cel.
  * Three head drawings, all with the same face (eye ring, eye, ear wash,
    beak) and the same two-curl crest: upright (HEAD_UP), looking down at the
    ground (shared by LEAN and HEAD_GROUND, checked below) and flying
    (HEAD_FLY, the crest laid back with its tips flicked up).
  * Flight: head and body move together, so they are drawn as one figure
    (FLY_ROWS) and cut into HEAD_FLY and BODY_FLY.  The raised wing shows its
    yellow-washed underside, the lowered wing its white upper side.

Palette keys (19): K outline, E eye, R eye ring, B/b beak, F/f feet (front /
back leg), Y/y crest, C ear wash, U/u underwing + undertail wash, 1-3 head,
neck and underparts (white -> mid shade), 5-8 back, wings and tail (white ->
the dark flight-feather tips).  The two plumage ramps share their hexes here
but are separate keys, so a variant can colour the head/underparts and the
upperparts differently.
Variants (relatives in the genus Cacatua): umbrella = Weißhaubenkakadu (white
crest), moluccan = Molukkenkakadu (pastel salmon plumage, salmon-red crest),
citron = Orangehaubenkakadu (orange crest, pale orange ear coverts).

Writes:  <repo>/assets/birds/cockatoo/Cockatoo.{png,json} (+ Cockatoo-<Variant>.{png,json}
         for colour variants that are not an exact palette swap, e.g. red eyes)
Usage:   python3 tools/make_cockatoo.py [--out DIR] [--preview DIR] [--draft | --check]
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

NAME = 'Cockatoo'
OUT = os.path.join(rig.REPO, 'assets/birds/cockatoo')
SIZE = 0.94          # garden-data.js `size`: 64 * 0.94 / 30 = 2.0 screen px per art px, ~60 px tall

# ---------------------------------------------------------------- palette ---
# 'K' = the #000000 outline (like the dove pack).  Every region a variant may
# recolour has its own key(s); keys may share a hex in the normal palette.
PAL = {
    'K': '#000000',                                                   # outline
    '1': '#fdfdfb', '2': '#e9ebee', '3': '#cfd3da',                   # head, neck, breast, belly (light -> dark)
    '5': '#fdfdfb', '6': '#e9ebee', '7': '#cfd3da', '8': '#aab0bb',   # back, wings, tail (light -> dark)
    'Y': '#f8d83a', 'y': '#e0b31c',                                   # crest, crest shade
    'C': '#f6eb9e',                                                   # ear-covert wash
    'U': '#f3e58c', 'u': '#dcc867',                                   # underwing / undertail wash, its shade
    'R': '#cfdeee',                                                   # bare eye ring
    'E': '#000000',                                                   # eye
    'B': '#2c2c31', 'b': '#4a4a52',                                   # beak, beak highlight (culmen)
    'F': '#62626e', 'f': '#4a4a55',                                   # feet: front leg, back leg
}

# Rare colour variants (ids as in js/garden-variants.js): full palettes, same
# keys.  The card is the genus Cacatua, so close relatives are its colour forms
# (as for the toucan and the macaw).  All three are exact palette swaps.
VARIANTS = {
    # Weißhaubenkakadu (C. alba): white crest and ear coverts; underwing and
    # undertail keep their yellow wash; whitish-blue eye ring.
    'umbrella': dict(PAL, Y='#fcfcf8', y='#e8e3cf', C='#fcfcf9', R='#dde8f1'),
    # Molukkenkakadu (C. moluccensis): pastel salmon plumage (one ramp for both
    # plumage key groups), salmon-red crest, yellowish underwing and undertail,
    # white eye ring.
    'moluccan': dict(PAL, **{'1': '#fce3d8', '2': '#f5cbbb', '3': '#e4ad9a',
                             '5': '#fce3d8', '6': '#f5cbbb', '7': '#e4ad9a', '8': '#c8907e'},
                     Y='#f5a083', y='#e06a50', C='#f7cdbb', U='#f7d68a', u='#e0b862', R='#f3f6f8'),
    # Orangehaubenkakadu (C. citrinocristata): orange crest, pale orange ear
    # coverts, pale blue eye ring.
    'citron': dict(PAL, Y='#f5a033', y='#d97a1c', C='#f8c98a', R='#cfe2f2'),
}

# ------------------------------------------------------------------- art ---
# (rows, dx, dy) pieces — see dove_rig.py's docstring and make_cockatiel.py.

# ---- upright head (idle / walk / jump / first eat frame).  Index = dove
# head-cel col + 4, first row = cel row -7.  The nape (col 9) is vertical
# from the eye down, like the neck column it sits on.
HEAD_ROWS = 11          # all dove head-cel rows are covered: BODY_STAND carries the neck
HEAD_UP = ([
    #0123456789ABCDEF
    "...KKK..KK......",   # r-7  crest: tips of the front and middle feathers
    "..KYYYKKYYK.....",   # r-6    both tips curl forward, toward the beak
    "...KKYYKKYYK....",   # r-5    two feathers, split by the outline
    ".....KYYKKYyK...",   # r-4
    ".....KYYYYYyyK..",   # r-3    third feather points back over the nape
    ".....KYYYYyyK...",   # r-2    crest sweeps up and back; gold shade on its back edge
    ".....KYYYyyK....",   # r-1
    "....K11YYyyK....",   # r0   crest base on the crown, white forehead feathers in front
    "...K1111111K....",   # r1   round crown
    "..KKRRR11112K...",   # r2   bare eye ring above the eye
    ".KbbRER1C1122K..",   # r3   eye in its ring, culmen highlight, ear-covert wash
    "KbBBBRRCCC122K..",   # r4   big near-black upper mandible
    "KBBKKK11CC122K..",   # r5   gape line
    "KBKBBK1111122K..",   # r6   hook tip in front of the deep lower mandible
    ".K.KKK1111122K..",   # r7   chin; the throat continues in BODY_STAND's neck column
], -4, -7)
THROAT_FWD = None       # the walk's 9-px "head forward" cel uses the same head ...
HEAD_FWD_DX = 2         # ... at the same place (no pigeon-like head bob)
NECK = ['1', '1', '1', '2']   # (dove neck rows are never drawn with HEAD_ROWS = 11)

# ---- body, standing (dove frames 1..28).  Index = body col + 2, first row =
# 4 rows above the dove body's top row.
BODY_STAND = ([
    #210123456789012345678901
    "..K11111122K............",   # r-4  thick neck column, same outline columns as
    "..K11111122K............",   # r-3  the head's throat and nape: hidden under a
    "..K11111122K............",   # r-2  low head, 0-2 rows show while standing,
    "..K11111122K............",   # r-1  more in the jump stretch
    "..K11111122K............",   # r0   (dove body's top row)
    ".K1111116556K...........",   # r1   shoulder: top of the folded wing
    ".K11111655556K..........",   # r2
    "K1111175555556K.........",   # r3   deep round breast; wing's leading edge
    "K11111755555556K........",   # r4
    "K111127555555566K.......",   # r5   wrist
    "K1111227555556676K......",   # r6
    ".K2111227855566667K.....",   # r7   lower edge of the folded wing
    "..K2112222786666778K....",   # r8   flight feathers
    "...K3222222237887888K...",   # r9   shaded belly, primary tips
    "....KKKKKKKKK3UU66666K..",   # r10  belly outline over the legs; vent; pale-yellow undertail
    ".............KKUUu6667K.",   # r11  broad, short tail
    "...............KKKKKKK..",   # r12  tail edge on the feet row (body at its lowest)
], -2, -4)
# Jump crouch frames (dove 6 & 11): the body sinks 1 px, so the tail closes one
# row earlier and still ends on the feet row.
BODY_CROUCH = (BODY_STAND[0][:-2] + [
    ".............KKKKKKKKK..",   # r11  tail edge
], -2, -4)

# ---- eat, lean pose (dove frames 29 & 34): head + body as ONE piece in frame
# coordinates (x 13.., y 25..), stamped through the body cel at (25, 38).  The
# head looks down at the ground (beak pointing down, crest standing up); the
# body slopes back to the tail.
LEAN = ([
    #345678901234567890123456789012345678
    "...KKK.KK...........................",   # y25  crest
    "..KYYYKYYK..........................",   # y26
    "...KKYYKYYKK........................",   # y27
    ".....KYYKYYyK.......................",   # y28
    ".....KYYYYYyyK......................",   # y29
    ".....KYYYYyyK.......................",   # y30
    "....K1YYYyyK........................",   # y31
    "...K111YYyy2K.......................",   # y32  crest base, white forehead
    "..K1111111122K......................",   # y33  crown
    ".K1RRR11111222KK....................",   # y34  eye ring; nape flows into the back
    ".K1RER1C11122255KK..................",   # y35  eye, ear wash
    "KbbRRRCCC112226555KK................",   # y36  beak pointing down; shoulder
    "KbBBKK1CC11222655555KK..............",   # y37
    "KBBBBK1111222275555666KK............",   # y38  wing's leading edge
    "KBBKBBK11122222755566667KK..........",   # y39  hook tip
    ".KBKKBK1122222227666677777KK........",   # y40
    "..KK.KK112222222277777777788KK......",   # y41  lower edge of the wing
    "......K11222222222233388888666KK....",   # y42  primary tips, tail
    ".......K222222222233UUu666666777KK..",   # y43  pale-yellow undertail
    "........K32222222333UUUu6667777777K.",   # y44
    ".........K333333333KKKKKKKKKKKKKKK..",   # y45
    "..........KKKKKKKKK.................",   # y46  belly outline over the legs
], 13 - 25, 25 - 38)

# ---- eat, crouched (dove frames 30..33): body (cel at x22, y38) ...
BODY_FLAT = ([
    #234567890123456789012345678     frame x 22.., y 36..
    ".......KKKKKKK.............",   # y36  back
    "......K5555556K............",   # y37
    ".....K655555556KK..........",   # y38
    "....K265555555566KK........",   # y39  x26 is open where the head joins
    "....127555555566677KK......",   # y40  wing's leading edge
    "....11275555666677788KK....",   # y41
    "....1122766666777778887KK..",   # y42
    "....122277777777788886666K.",   # y43  lower edge of the wing, primaries, tail
    "....22222233UUU66666666777K",   # y44  pale-yellow undertail
    "....2223333UUuu6666777777K.",   # y45
    "....333333333KKKKKKKKKKKK..",   # y46
    "....KKKKKKKKK..............",   # y47  belly on the legs, feet show below
], 0, 36 - 38)
# ... and the head on the ground (cel at x14, y42 / y41 — it bobs while
# pecking): the looking-down head of LEAN with the beak on the ground.  Its
# right edge (x25) is open where it joins the body; the body's open front
# (x26, y40..46) stays covered in both bob positions.
HEAD_GROUND = ([
    #01234567890123
    "...KKK.KK.....",   # r0   crest (as in LEAN)
    "..KYYYKYYK....",   # r1
    "...KKYYKYYKK..",   # r2
    ".....KYYKYYyK.",   # r3
    ".....KYYYYYyyK",   # r4
    ".....KYYYYyyK.",   # r5
    "....K1YYYyyK..",   # r6
    "...K111YYyy2KK",   # r7   top of the join to the body
    "..K11111111222",   # r8   crown
    ".K1RRR11111222",   # r9   eye ring
    ".K1RER1C111222",   # r10  eye, ear wash
    "KbbRRRCCC11222",   # r11  beak
    "KbBBKK1CC11222",   # r12
    "KBBBBK11112222",   # r13
    "KBBKBBK1112222",   # r14  hook tip
    ".KBKKBK1122222",   # r15  throat
    "..KK.KKKKKKKKK",   # r16  beak and throat on the ground (y48 / y47)
], -2, -10)
# the looking-down head is one drawing: identical in LEAN and HEAD_GROUND
assert all(LEAN[0][r][:9] == HEAD_GROUND[0][r][:9] for r in range(16))

# ---- flight (dove frames 37 & 38): head and body move together, so they are
# one figure in frame-37 coordinates (x 11.., y 22..), cut into the head piece
# (cel at x15, y26 / y25) and the body piece (cel at x18, y29 / y28).  The
# crest is laid back with its tips flicked up behind the head; the face is the
# upright one; the broad tail shows its pale-yellow underside.
FLY_ROWS = ([
    #1234567890123456789012345678901234567
    "............KK.......................",   # y22  crest tips flicked up
    "...........KYK.......................",   # y23
    ".......KKKKYYK.......................",   # y24
    ".....KKYYYYYYK.......................",   # y25  crest laid back over the crown
    "....K11YYYYyyYK......................",   # y26
    "..KKRRR1YyyyKKKKKKK..................",   # y27  eye ring; back
    ".KbbRER1C1122255555KKKKK.............",   # y28  eye, ear wash
    "KbBBBRRCCC12225555555555KKKK.........",   # y29  beak
    "KBBKKK11CC122255555555555666KKKK.....",   # y30
    "KBKBBK11111222255555556666666666KK...",   # y31  hook tip
    ".K.KKK1111122222555556666666777777K..",   # y32  tail
    ".....K11111222222666666666777777777K.",   # y33
    ".....K11111122222233333UUUUUUuuuuuuK.",   # y34  pale-yellow underside of the tail
    ".....K2111111222223333UUUUKKKKKKKKK..",   # y35
    "......K2111111222233KKKKKK...........",   # y36  belly
    "......K2211111222333K................",   # y37
    ".......K22222223333K.................",   # y38
    "........KK33333333KK.................",   # y39
    "..........KKKKKKKK...................",   # y40
], 11, 22)
# the face is the upright head's (eye, ear wash, beak)
assert all(FLY_ROWS[0][6 + r][:13] == HEAD_UP[0][10 + r][:13] for r in range(5))


def cut(fig, keep):
    """The pixels of figure (rows, x0, y0) for which keep(x, y) is true, as rows at (x0, y0)."""
    rows, x0, y0 = fig
    return [''.join(ch if keep(x0 + i, y0 + j) else '.' for i, ch in enumerate(r)) for j, r in enumerate(rows)]


IN_HEAD = lambda x, y: x <= 24 and y <= 32                                   # head + nape
HEAD_FLY = (cut(FLY_ROWS, IN_HEAD), 11 - 15, 22 - 26)
BODY_FLY = (cut(FLY_ROWS, lambda x, y: not IN_HEAD(x, y)), 11 - 18, 22 - 29)

# ... near wing raised (frame 37, cel at x23, y15): we see its underside —
# white coverts along the leading edge, pale-yellow washed flight feathers,
# three spread primary tips; the root blends into the back.
WING_UP = ([
    #345678901234567890     frame x 23.., y 12..
    "..........K.......",   # y12  primary tips
    ".........KUK.K....",   # y13
    "........KUUKKUK...",   # y14
    "........K5UUUUUK..",   # y15
    ".......K55UUUUUKK.",   # y16
    ".......K555UUUuUK.",   # y17
    "......K5555UUUuK..",   # y18  white coverts | yellow-washed flight feathers
    "......K5555UUUuuK.",   # y19
    ".....K55555UUUuK..",   # y20
    ".....K555555UUuuK.",   # y21
    "....K5555555UUuK..",   # y22
    "....K5555555UUuuK.",   # y23
    "....K55555555UUuK.",   # y24
    "....K55555555UUuK.",   # y25
    "....K555555555UuK.",   # y26
    "....K6555555556uK.",   # y27
    "....K665555556666K",   # y28
    ".....66555555666K.",   # y29  root, blends into the back
    ".....666666666K...",   # y30
    "......6666666.....",   # y31
], 23 - 23, 12 - 15)
# ... near wing lowered (frame 38, cel at x22, y29): we see its upper side —
# white coverts, blue-grey flight feathers, two primary tips.
WING_DOWN = ([
    #2345678901234567890     frame x 22.., y 29..
    ".....55555555666...",   # y29  root, blends into the body
    "....K55555556666K..",   # y30
    "....K55555566667K..",   # y31
    ".....K5555666677K..",   # y32  coverts
    ".....K5556666677K..",   # y33
    "......K556666777K..",   # y34  flight feathers
    "......K566667777K..",   # y35
    ".......K56667778K..",   # y36
    ".......K56667778K..",   # y37
    "........K5667778K..",   # y38
    "........K5667778K..",   # y39
    ".........K56677K...",   # y40
    ".........K56777K...",   # y41
    "..........K6677K...",   # y42
    "..........K6K7K....",   # y43  primary tips
    "...........K.K.....",   # y44
], 22 - 22, 29 - 29)

# Hand fixes after composition, frame-local (x, y) -> key, per dove frame.
FIXES = {
    6: {(32, 38): '2'},     # take-off crouch: the low head's nape outline lands inside the neck
}

ART = rig.Art(pal=PAL, head_up=HEAD_UP, throat_fwd=THROAT_FWD, head_fwd_dx=HEAD_FWD_DX, neck=NECK,
              body_stand=BODY_STAND, body_crouch=BODY_CROUCH, lean=LEAN, body_flat=BODY_FLAT,
              head_ground=HEAD_GROUND, head_fly=HEAD_FLY, body_fly=BODY_FLY, wing_up=WING_UP,
              wing_down=WING_DOWN, head_rows=HEAD_ROWS, fixes=FIXES)


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
