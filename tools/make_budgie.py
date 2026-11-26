#!/usr/bin/env python3
"""Budgerigar (Wellensittich) sprite sheet for the garden minigame.

Drawn on the PeakPixels *Collared Dove*'s animation with tools/dove_rig.py,
the same way tools/make_cockatiel.py drew the cockatiel: every distinct dove
cel is replaced by one hand-drawn cel (the char maps below), pasted wherever
the dove uses it, so markings are identical wherever a pose repeats.

The bird: a wild-type light-green budgie (Melopsittacus undulatus).
  * Size and shape: the smallest parrot of the garden. The idle box is 22 x 22
    art px (crown to feet); SIZE 0.64 gives 41 screen px (dove 45, cockatiel
    51) at the pack's density of ~1.86 screen px per art px. A round head
    without crest (8 rows, 10 px wide with the beak) on a short neck, a slim,
    upright body and a long, tapering, pointed tail that runs out along the
    ground behind the feet (its lower outline on the feet row).
  * Face: a yellow mask over forehead, lores, cheeks and throat, shaded darker
    under the beak and toward the back of the cheek. The eye sits in plain
    yellow just in front of the barring. A blue cere sits above a small
    olive-horn beak whose dark hook tip points down over the lower mandible.
    The violet-blue cheek patch (2 px, lighter front / darker back) sits at the
    lower cheek above the rear throat spot, as on the real bird, and two single
    black throat spots sit on the yellow throat below the beak.
  * "Wellen": thin black bars on a yellow ground over the crown, the back of
    the head and the nape (keys h/H), continuing onto the mantle. The folded
    wing is black-dominant scallops, full black rows alternating with yellow
    edge rows broken into short dashes (keys w/W), ending in dark primaries
    (P) over the tail base. The sides of the neck, the breast, belly, flanks
    and rump are green (3 tones, darker toward the outline and underside), the
    tail is dark blue (2 tones) and the feet are grey-blue.
  * Every pose carries the same face and markings. The upright head is reused
    unchanged in the eat lean pose (lowered in front of the breast) and in
    flight (its lower back rows open into the body). On the ground it is the
    same face with the beak pressed down onto the ground row and the cheek
    patch and throat spots moved up beside the beak. The barred back is a
    black-dominant scallop band in the lean and crouched poses; in flight the
    raised / lowered wing shows barred coverts on its inner half and dark
    primaries with a green outer edge.
  * The cockatiel next to it is grey, crested, orange-cheeked and much
    longer-tailed; the budgie differs in every one of these.

Rig notes: the head piece covers dove head-cel rows 1..8 (HEAD_ROWS = 9; dove
rows below that which still sit above the body are the neck, coloured by NECK,
and only appear in the stretched jump frames). The head's three lower rows and
the body's two top rows end in the same outline column, so the dove's head bob
(the head sinks 0..3 rows into the body) never doubles the nape outline.
HEAD_FWD_DX = 2 keeps the head over the body in the dove's "head forward" walk
frames (a budgie walks without the dove's head thrust). One pixel fix (FIXES)
cleans the take-off crouch.

Palette keys (22): K outline, E eye, Y/y mask, S throat spots, V/v cheek patch,
C cere, B/b beak and hook tip, h/H head and nape barring (black bars / yellow
ground), w/W wing barring (black scallops / yellow edges), 1/2/3 body green,
P primaries, T/t tail, F/f feet. Head and wing barring have separate keys so a
later variant can treat them differently (e.g. an Opaline or a Clearwing).
Variants: 'blue' (green -> sky blue, yellow -> white) and 'violet' (green ->
violet, yellow -> white) are exact palette swaps; 'lutino' (all yellow, pale
markings, silvery cheeks, red eye, pink cere and feet) gets its own sheet
because the normal eye shares the outline's black.

Writes:  <repo>/assets/birds/budgie/Budgie.{png,json} (+ Budgie-Lutino.{png,json};
         the blue and violet variants are palette maps, see the build report)
Usage:   python3 tools/make_budgie.py [--out DIR] [--preview DIR] [--draft | --check]
         --preview DIR  also write every sheet + preview_frames.png + preview_context.png
         --draft        report problems instead of failing, write nothing to the repo
         --check        strict validation only, write nothing

Deterministic: running it again reproduces the outputs byte-for-byte.
"""
import os
import sys

sys.dont_write_bytecode = True       # importing the rig leaves no __pycache__ in tools/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dove_rig as rig

NAME = 'Budgie'                                   # sheet file name
OUT = os.path.join(rig.REPO, 'assets/birds/budgie')
SIZE = 0.64                                       # garden-data.js `size`: 64 * 0.64 / 22 = 1.86 screen px per art px

# ---------------------------------------------------------------- palette ---
# 'K' = the #000000 outline (like the dove pack).  Every hex is distinct except
# the eye, which shares the outline's black like the dove's and cockatiel's.
PAL = {
    'K': '#000000',                      # outline
    'E': '#000000',                      # eye
    'Y': '#f4e04d', 'y': '#d6bd2c',      # face mask: forehead, lores, cheeks, throat / its shade
    'S': '#111111',                      # throat spots
    'V': '#5a4fc0', 'v': '#3e3596',      # cheek patch (front / back)
    'C': '#4f74cc',                      # cere
    'B': '#c8b67e', 'b': '#9c8a58',      # beak (upper mandible) / hook tip
    'h': '#1c1c18', 'H': '#e8d84a',      # head + nape barring: black bars / yellow ground
    'w': '#1d1d19', 'W': '#e6d648',      # back + wing barring: black scallops / yellow edges
    '1': '#6cc040', '2': '#52a32f', '3': '#3b7f24',   # body green: light / mid / dark
    'P': '#2c3a2a',                      # primaries and flight feathers
    'T': '#2e4f9a', 't': '#1f3670',      # tail: upper / lower
    'F': '#8a94ab', 'f': '#6b7590',      # feet: front leg / back leg
}

# Rare colour variants (ids as in js/garden-variants.js): full palettes, same keys.
VARIANTS = {
    # Himmelblau (blue series, recessive): no yellow psittacofulvin - the green
    # turns sky blue and every yellow white; the black waves and throat spots,
    # the violet cheek patch and the dark blue tail stay.
    'skyblue': dict(PAL, **{'1': '#86cdf0', '2': '#5fa9dc', '3': '#3f86bf',
                            'Y': '#f6f7f4', 'y': '#d5dbe0', 'H': '#f6f7f4', 'W': '#e8eef2',
                            'P': '#1f2634'}),
    # Lutino (Ino, sex-linked): no melanin - pure yellow, the waves and throat
    # spots vanish, silvery cheek patches, pale flight feathers and tail, red
    # eyes (its own sheet: the normal eye shares the outline's black), pink
    # cere and feet.
    'lutino': dict(PAL, **{'1': '#fbe55c', '2': '#f1d040', '3': '#dcb42c',
                           'Y': '#fbe55c', 'y': '#e4c53c', 'S': '#fbe55c',
                           'H': '#fbe55c', 'h': '#fbe55c', 'W': '#f7de4a', 'w': '#f2d444',
                           'V': '#eeedf2', 'v': '#cfd0da', 'P': '#f6f1d6',
                           'T': '#f3eecd', 't': '#d8cfa6', 'E': '#c8243a', 'C': '#dca6b5',
                           'B': '#f0c070', 'b': '#c99a48', 'F': '#eaaaa3', 'f': '#c8847e'}),
    # Violett (blue + one dark factor + the violet factor): deep violet body,
    # white mask, black waves, violet-blue cheek patch, dark violet tail.
    'violet': dict(PAL, **{'1': '#9478d8', '2': '#7d5bc8', '3': '#573a9e',
                           'Y': '#f6f7f4', 'y': '#d5dbe0', 'H': '#f6f7f4', 'W': '#ece9f4',
                           'V': '#4a2fae', 'v': '#321c84', 'P': '#1f1b2a',
                           'T': '#4a2f94', 't': '#321f6c'}),
}

# ------------------------------------------------------------------- art ---
# (rows, dx, dy) pieces — see dove_rig.py's docstring and make_cockatiel.py.
# Comments give frame coordinates for the dove's Idle frame 1 (head cel at
# (23,27), body cel at (23,36), feet on y48) unless a piece says otherwise.

# ---- head: every upright pose (idle / walk / jump / first eat frame).
# Index = dove head-cel column + 1, first row = cel row 1 (the crown sits 1 px
# lower than the dove's head top).  Bars alternate row by row behind the eye.
HEAD_UP = ([
    "...KKKK...",   # y28  crown outline
    "..KYYYHKK.",   # y29  yellow forehead, first yellow bar ground, outline steps down the back
    ".KYYYHhhhK",   # y30  black bar over the back of the head
    ".KYYEYHHHK",   # y31  eye in plain yellow, yellow ground behind it
    ".KCYYYhhhK",   # y32  blue cere at the face front, black bar
    "KBBYYYyHK.",   # y33  upper mandible (2 px), shaded cheek back; nape outline column starts
    "KbKyYVvhK.",   # y34  hook tip pointing down, mouth line, shade under the beak, cheek patch, bar
    ".KySYSyHK.",   # y35  two throat spots on the yellow throat (rear one under the patch)
], -1, 1)
HEAD_ROWS = 9        # dove head-cel rows 0..8 are the head; rows 9.. above the body are neck
THROAT_FWD = None    # not needed: the head is not shifted on the "head forward" walk cel
HEAD_FWD_DX = 2      # cancels that cel's 2-px forward offset: no dove-style head thrust
# Neck rows (only in the stretched jump frames), front -> back behind the outline:
# yellow throat, yellow, green side of the neck, black nape bar.
NECK = ['Y', 'Y', '2', 'h']

# ---- body: standing pose (dove frames 1..28 incl. the cut variants).
# Columns from x23; the slim breast keeps its outline on x23, the back slopes
# 1 px per row from the nape; the tail leaves the body under the wing tip.
BODY_STAND = ([
    "KYYY2hhK.............",   # y36  lower throat (yellow), green side of the neck, nape bar
    "K21112HK.............",   # y37  breast (rim darker), mantle: yellow ground
    "K21112hhK............",   # y38  mantle bar; nape outline column ends, back starts to slope
    "K21112WWWK...........",   # y39  first wing row: yellow covert edges
    "K21112wwwwK..........",   # y40  black scallops
    "K211122WwWK..........",   # y41  yellow edges broken into scallops
    ".K21122wwwwK.........",   # y42  black scallops
    ".K321223WwWPK........",   # y43  last scallops, wing tip (primaries) starts; belly darkens
    "..K322333wPPPKK......",   # y44  primaries over the tail base
    "...KK3333TPPPPTKK....",   # y45  belly, tail base under the wing tip
    ".....K333TTTTTTTTKKK.",   # y46  vent; tail (upper tone) runs back along the ground
    "..........KKKKttttttK",   # y47  tail underside tapering to its pointed tip
    "..............KKKKKKK",   # y48  tail's lower outline on the feet row
], 0, 0)
# Jump take-off / landing crouch (dove 6 & 11): the body sinks 1 px but the tail
# stays where it is when standing; rows 7..11 merge the lowered body with it.
BODY_CROUCH = ([
    "KYYY2hhK.............",   # y37  (same rows 0..6 as standing, 1 px lower)
    "K21112HK.............",   # y38
    "K21112hhK............",   # y39
    "K21112WWWK...........",   # y40
    "K21112wwwwK..........",   # y41
    "K211122WwWK..........",   # y42
    ".K21122wwwwK.........",   # y43
    ".K321223WwWPKKK......",   # y44  wing tip; the unmoved tail's upper outline
    "..K322333wPPPPTKK....",   # y45  primaries lie lower over the tail
    "...KK3333TPPPPTTTKKK.",   # y46  belly; tail upper tone
    ".....K333TTTTTttttttK",   # y47  vent sinks onto the tail base; tail underside to the tip
    ".........KKKKKKKKKKKK",   # y48  lower outline on the feet row
], 0, 0)

# ---- eat, lean pose (dove frames 29 & 34): head + body as ONE piece in frame
# coordinates (x 17.., y 31..), positioned through the body cel at (25,38).  The
# upright head is lowered 3 px and moved 5 px forward in front of the breast;
# the body tips forward, so the barred back runs flatter and the tail lifts.
LEAN = ([
    #  x: 1112222222222333333333344444
    #     7890123456789012345678901234
    "...KKKK.....................",   # y31  crown (the upright head, unchanged)
    "..KYYYHKK...................",   # y32
    ".KYYYHhhhK..................",   # y33
    ".KYYEYHHHK..................",   # y34  eye
    ".KCYYYhhhK..................",   # y35  cere
    "KBBYYYyHHKK.................",   # y36  beak; the nape runs into the back
    "KbKyYVvhhhhKK...............",   # y37  hook tip, cheek patch; nape bar
    ".KySYSyH2HHHHKK.............",   # y38  throat spots; green side of the neck; mantle ground
    ".KY11122hhhhhhhKK...........",   # y39  breast; mantle bar
    ".K211122wWWwwWWwwKKK........",   # y40  wing: yellow edges in short dashes
    "..K211122wwwwwwwwwPKKK......",   # y41  black scallops, primaries begin
    "..K3211223wWWwwWwPPPPTKKK...",   # y42  scallop dashes, primaries, tail top
    "...K3222333wwwPPPPPTTTTTTKK.",   # y43  belly; primaries over the tail
    "....K322333333TTTTttttttttK.",   # y44  vent, tail to its point
    ".....KK3333333KKKKKKKKKKKK..",   # y45  belly / tail underside outline
    ".......KKK3333KKKK..........",   # y46  belly over the legs (as the dove)
], 17 - 25, 31 - 38)

# ---- eat, crouched pose (dove frames 30..33): body (cel at x22, y38) ...
# The body lies flat: a rounded back with the barred mantle on top, a
# black-dominant scallop band along the wing, dark primaries, green neck side,
# breast and belly below, the tail held out level.  Its left edge has no outline:
# it joins the head on the ground, whose bob (y42 / y41) only shifts that seam.
BODY_FLAT = ([
    #  x: 2222222233333333334444444
    #     2345678901234567890123456
    "......KKKK...............",   # y38  top of the back
    "....KKhhhhKK.............",   # y39  mantle bar
    "..KKHHwWWwWWKK...........",   # y40  mantle ground, first scallop edges
    "KK2hwwwwwwwwwwKK.........",   # y41  neck top outline, green neck side, black scallops
    "2222wWWwwWWwwPPPKKKK.....",   # y42  green neck, scallop edge dashes, primaries, tail top outline
    "11222wwwwwwPPPPPTTTTKKK..",   # y43  breast, last black row, primaries, tail
    "1112222233PPPPTTTTTttttK.",   # y44  breast and flank, primaries over the tail, tail tip
    "11222233333KKKKKKKKKKKK..",   # y45  belly, tail underside outline
    "12223333KKKKKKKK.........",   # y46  belly over the legs (as the dove)
    "KKKKKK...................",   # y47  lower outline under the breast
], 0, 0)
# ... and its head on the ground (cel at x14, y42 / y41 while pecking): the
# upright face with the beak pressed down to the ground row (the hook tip then
# touches the feet row); cheek patch and throat spots move up beside the beak.
# The right column has no outline: it runs into the body's neck.
HEAD_GROUND = ([
    #  x: 111111122
    #     345678901
    "...KKKK..",   # y40  crown
    "..KYYYHKK",   # y41  forehead, outline steps down to the neck
    ".KYYYHhhh",   # y42  bar over the back of the head
    ".KYYEYHHH",   # y43  eye in plain yellow
    ".KCYYYhhh",   # y44  cere, bar
    "KBByYVvHH",   # y45  upper mandible, shaded cheek, cheek patch
    "KbBySYSy2",   # y46  hook (dark front edge), throat spots, green throat edge
    "KbKKKKKKK",   # y47  hook tip down to the ground; chin outline
    ".K.......",   # y48  under the hook tip (feet row)
], 13 - 14, 40 - 42)

# ---- flight (dove frames 37 & 38; head, body and wing move together):
# head (cel at x15, y26 / y25): the upright face; its lower back rows open
# into the body (no outline across the neck).
HEAD_FLY = ([
    "...KKKK...",   # y25  crown (frame 37)
    "..KYYYHKK.",   # y26
    ".KYYYHhhhK",   # y27
    ".KYYEYHHHK",   # y28  eye
    ".KCYYYhhhK",   # y29  cere
    "KBBYYYyHh.",   # y30  beak; nape bar runs on into the back
    "KbKyYVvhH.",   # y31  hook tip, cheek patch
    ".KySYSyHh.",   # y32  throat spots; the breast continues below
], -1, -1)
# ... body (cel at x18, y29 / y28): a slim, level body under the face, the
# barred mantle and green rump along the back, the long pointed tail behind.
BODY_FLY = ([
    #  x: 1111122222222223333333333444444
    #     5678901234567890123456789012345
    "........K......................",   # y30  nape outline behind the head
    "........hKKKKKKKKKKKKKKKKKKKKK.",   # y31  back and tail upper outline
    "........hhHhHhH22222TTTTTTTTTKK",   # y32  mantle bars, green rump, tail
    "K21111222222222223333TTTTTTTTTK",   # y33  breast under the throat, flank, tail to its tip
    ".K2111222222222233333TttttKKKK.",   # y34  belly, vent, tail underside
    "..KK1112222222233333ttKKKK.....",   # y35
    "....KK1222222333KKKKKK.........",   # y36
    "......KKK2223333K..............",   # y37  belly
    ".........KKKKKKK...............",   # y38
], 15 - 18, 1)
# ... near wing, raised (dove frame 37): barred coverts on the inner half
# (yellow / black rows across the wing), dark primaries with a green outer
# edge toward the tip; the root sits on the back.
WING_UP = ([
    "...........K..",   # y15  wing tip
    "..........KK..",
    "..........KPK.",
    ".........K3PK.",
    ".........K3PK.",   # y19  primaries, green outer edge
    "........K33PK.",
    ".......K3PPPK.",
    ".......KWPPPPK",   # y22  coverts begin: yellow edge
    "......KwwPPPPK",   #      black
    ".....KWWWPPPPK",
    ".....KwwwwPPK.",
    "....KWWWWPPPK.",
    "...KwwwwwPPPK.",
    "...KWWWWWPPPK.",
    "..KwwwwwwPPPK.",
    "KKWWWWWWPPPK..",   # y30  leading edge meets the back of the head
    "...hhhhhPPPK..",   # y31  root on the back (mantle bar)
    "....HhhhPP....",   # y32
    "..............",
    "..............",
], 0, 0)
# ... lowered (dove frame 38): the shoulder above the back, barred coverts
# along the upper (inner) half, primaries with a green leading edge to the tip.
WING_DOWN = ([
    "..KKKKK.......",   # y29  shoulder top (above the back)
    "......KKKK....",   # y30
    "....hhhhPPK...",   # y31  shoulder: mantle bars, flight-feather bases
    "...HhhhPPPPK..",   # y32
    "KKWWWWWWPPPK..",   # y33  leading edge: yellow covert edges
    "..KwwwwwwPPPK.",   #      black
    "...KWWWWWPPPK.",
    "...KwwwwwPPPK.",
    "....KWWWWPPPK.",
    ".....KwwwPPPK.",   # y38
    ".....KWWPPPPPK",
    "......KwPPPPPK",   # y40  last coverts
    ".......K3PPPPK",   # y41  primaries, green leading edge
    ".......K3PPPK.",
    "........K3PPK.",
    ".........K3PK.",
    ".........K3PK.",
    "..........KPK.",
    "..........KK..",
    "...........K..",   # y48  wing tip
], 0, 0)

# Hand fixes after composition, frame-local (x, y) -> palette key, per dove frame.
FIXES = {
    6: {(30, 39): 'h'},     # take-off crouch: the throat row lies on the body's third row; keep one nape outline
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
