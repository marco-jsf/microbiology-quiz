// Garden art: hand-authored pixel sprites and small procedural effects for the
// garden scene and the shop. Pure drawing helpers — no DOM access at module
// level (canvases are created lazily), so Node tooling can import SPRITE_DATA.
//
// Sprites are authored at 1× as a palette (one char → '#rrggbb' or
// '#rrggbbaa') plus rows of chars ('.' = transparent), rendered once into a
// cached offscreen canvas and drawn scaled by an integer factor with image
// smoothing off. Style follows the painted background: muted, slightly
// desaturated colours, light from the top-left, soft darker edges on the
// shadow side (never pure black). `ground` = how many of the bottom rows sit
// BELOW the ground line (contact shadows, the front half of the pond).

import { variantById } from './garden-data.js';

export const DECOR_PX = 3;   // scene scale of garden objects
export const EGG_PX = 3;     // scene scale of nest + eggs
const FX_PX = 2;             // butterflies, petals, marker — small and delicate

// ---- Sprite data ----------------------------------------------------------
// name → { pal: {char: colour}, ground: rows below the ground line, frames: [rows[]] }.
// Every row of a sprite has the same length; one char = one pixel.
// Sprites: flowers mushrooms stones birdbath(3 frames) lantern feeder
// pond(4 frames) nest nestFront egg_<tier>(crack 0..3) butterfly_<colour>
// (open / wings up) petal(3 rotations) marker feather(2).
// <sprites>
export const SPRITE_DATA = {
  flowers: {
    pal: { o: '#2b4430', d: '#45633a', g: '#5f8344', G: '#83a458', P: '#f4cbd5', p: '#de98ae', q: '#b06c88', W: '#f8f6e8', w: '#e1e2d0', v: '#b4b9a6', Y: '#f6e39c', y: '#e0c05c', u: '#b38f3b', c: '#d9a441', b: '#b2c4e4', B: '#7d93c3', z: '#14241a59' },
    ground: 1,
    frames: [
      [
        '.......PPp................',
        '......Ppcpq...............',
        '.......pqq.......PPp......',
        '.WWw....g.......Ppcpq.....',
        'Wwcwv...g...Y..y.pqq......',
        '.wvv.G..g...YYyu..g...WWw.',
        '..g...g.g.G..yu.G.g..Wwcwv',
        '..g.....dgb..g...gg.G.wvv.',
        'b.g.G...db.B.g.b..dg...g..',
        '.GdgG.g.d..Ggg.GBgd.GG.g.b',
        'GgdgGgdgdg.ggddgGgdGgdgdg.',
        'dodgodgogdodgodgogdodgogd.',
        '.zzzzzzzzzzzzzzzzzzzzzzzz.',
      ],
    ],
  },
  mushrooms: {
    pal: { R: '#da7f69', r: '#b8524a', k: '#8b3a37', K: '#5c2a2b', w: '#f2ebda', U: '#d9cdb2', u: '#ab9d82', S: '#f0e8d5', s: '#cfc2a6', t: '#9f9278', g: '#5f8344', G: '#83a458', z: '#14241a59' },
    ground: 1,
    frames: [
      [
        '...RRrr.........',
        '.RRwRrrrk.......',
        'RRrrrrwrk.......',
        'Rwrrrrrkk..RRr..',
        '.kkkkkkK..Rwrrk.',
        '...UUu....kkkkK.',
        '...SSs.....UUu..',
        '...SSstRrk.Sst.g',
        'gGSSSsttsgGSstgG',
        'zzzzzzzzzzzzzzzz',
      ],
    ],
  },
  stones: {
    pal: { H: '#c2c6b5', L: '#a3a898', m: '#858b7d', d: '#676d62', D: '#4c5249', o: '#363d36', M: '#93ad57', n: '#6f8a45', N: '#556e3a', z: '#14241a59' },
    ground: 1,
    frames: [
      [
        '....MMMMnn............',
        '..MMMMnnLLmm..........',
        '.MMnHHLLLLmmd.........',
        'nnHHLLLLLmmmdd........',
        'NHLLLLLLmmmmddoMMnn...',
        'LLLLLLLmmmmddMMnHLLm..',
        'LLLLLmmmmmddnHHLLLmmd.',
        'mLLmmmmmmdddHLLLLmmddo',
        'mmmmmmmdddddmLmmmmdddo',
        'ddddddddddDDddddddDDoo',
        'zzzzzzzzzzzzzzzzzzzzzz',
      ],
    ],
  },
  birdbath: {
    pal: { H: '#c9cdbd', L: '#abb09f', l: '#8f9585', m: '#757b6d', d: '#5b6157', D: '#434941', w: '#86aebd', W: '#a9c9d3', v: '#6a93a3', x: '#e4f0ee', M: '#8ca351', n: '#6f8a45', z: '#14241a59' },
    ground: 1,
    frames: [
      [
        '...HHHHHHHHHHHHHHHL...',
        '..HLWxxWWWWWWWWWWWlm..',
        '.HLvwwwwwwwwxwwwwwvmd.',
        'HLLLLLLLLLLLLLLLLLlmmd',
        'LlllllllllllllllllmmdD',
        '.llllllllllllllmmmmdD.',
        '..dmmmmmmmmmmmmmmmdD..',
        '.....DddmmmmmmddD.....',
        '........HLlmdD........',
        '........LLlmdD........',
        '........LLlmdD........',
        '........LLlmdD........',
        '........LLlmdD........',
        '.......MLLlmdD........',
        '.......LLLlmmdD.......',
        '......HLLllmmdD.......',
        '.....MLLlllmmmdD......',
        '....nddddddddddDD.....',
        '...zzzzzzzzzzzzzzzz...',
      ],
      [
        '...HHHHHHHHHHHHHHHL...',
        '..HLWWWWxxWWWWWWWWlm..',
        '.HLvwwwwwwwwwwwxwwvmd.',
        'HLLLLLLLLLLLLLLLLLlmmd',
        'LlllllllllllllllllmmdD',
        '.llllllllllllllmmmmdD.',
        '..dmmmmmmmmmmmmmmmdD..',
        '.....DddmmmmmmddD.....',
        '........HLlmdD........',
        '........LLlmdD........',
        '........LLlmdD........',
        '........LLlmdD........',
        '........LLlmdD........',
        '.......MLLlmdD........',
        '.......LLLlmmdD.......',
        '......HLLllmmdD.......',
        '.....MLLlllmmmdD......',
        '....nddddddddddDD.....',
        '...zzzzzzzzzzzzzzzz...',
      ],
      [
        '...HHHHHHHHHHHHHHHL...',
        '..HLWWWWWWWxxWWWWWlm..',
        '.HLvwwwxwwwwwwwwwwvmd.',
        'HLLLLLLLLLLLLLLLLLlmmd',
        'LlllllllllllllllllmmdD',
        '.llllllllllllllmmmmdD.',
        '..dmmmmmmmmmmmmmmmdD..',
        '.....DddmmmmmmddD.....',
        '........HLlmdD........',
        '........LLlmdD........',
        '........LLlmdD........',
        '........LLlmdD........',
        '........LLlmdD........',
        '.......MLLlmdD........',
        '.......LLLlmmdD.......',
        '......HLLllmmdD.......',
        '.....MLLlllmmmdD......',
        '....nddddddddddDD.....',
        '...zzzzzzzzzzzzzzzz...',
      ],
    ],
  },
  lantern: {
    pal: { h: '#77817a', m: '#4f5852', d: '#353c37', o: '#232925', W: '#fff6cf', Y: '#ffdf8a', y: '#f0b558', r: '#c9853e', z: '#14241a59' },
    ground: 1,
    frames: [
      [
        '....h....',
        '...hmd...',
        '..hmmmd..',
        '.hmmmmdd.',
        'ommmmmddo',
        '.oWYdYyo.',
        '.oWYdYyo.',
        '.oYYdyyo.',
        '.oYydyro.',
        '.ommmmdo.',
        '..ommdo..',
        '...hmd...',
        '...hmd...',
        '...hmd...',
        '...hmd...',
        '...hmd...',
        '...hmd...',
        '...hmd...',
        '...hmd...',
        '...hmd...',
        '...hmd...',
        '...hmd...',
        '..hmmdo..',
        '.hmmmddo.',
        '.ommmmdo.',
        '.zzzzzzz.',
      ],
    ],
  },
  feeder: {
    pal: { A: '#c88a69', a: '#a5634c', b: '#7f473a', B: '#57302a', L: '#c0a172', l: '#9e8053', m: '#795e3b', M: '#523e29', I: '#2f241b', e: '#e6d29a', E: '#bb9a5d', f: '#88693f', g: '#5f8344', G: '#83a458', d: '#45633a', z: '#14241a59' },
    ground: 1,
    frames: [
      [
        '.........AA.........',
        '........AAab........',
        '.......AAaaab.......',
        '......AAbbbbbb......',
        '.....AAaaaaaabb.....',
        '....AAaaaaaaaabb....',
        '...AbbbbbbbbbbbbB...',
        '..AAaaaaaaaaaaaabB..',
        '.AAaaaaaaaaaaaaaabB.',
        'BBBBBBBBBBBBBBBBBBBB',
        '...LlIIIIIIIIIIlmM..',
        '...LlIIIIIIIIIIlmM..',
        '...LlIIIIIIIIIIlmM..',
        '...LlIeEIIIIfEIlmM..',
        '...LleEEfEeEEEflmM..',
        '.LLLLLLLLLLLLLllllmM',
        '.mmmmmmmmmmmmmmmmmmM',
        '...MM..LLlmM...MM...',
        '.....MMLLlmMMM......',
        '.......LLlmM........',
        '.......LLlmM........',
        '.......LLlmM........',
        '.......LLlmM........',
        '.......LLlmM........',
        '.......LLlmM........',
        '.......LLlmM........',
        '.......LLlmM........',
        '.......LLlmM........',
        '.......LLlmM........',
        '.......LLlmM........',
        '.......LLlmM........',
        '......GLLlmMg.......',
        '.....gGLLlmMgG......',
        '....GggdddddgGg.....',
        '.....zzzzzzzzzz.....',
      ],
    ],
  },
  pond: {
    pal: { x: '#e2eeea', W: '#b2cfd3', w: '#8db3c0', v: '#6e98a8', V: '#5a8292', u: '#4a7080', H: '#b9bdae', L: '#9ea394', m: '#82887a', d: '#666c60', D: '#4b5148', o: '#2f4834', O: '#3c5a3e', M: '#8aa556', n: '#6c8746', P: '#7fa35a', p: '#5f8442', k: '#f2c3d0', K: '#d68aa3', G: '#83a458', g: '#5f8344' },
    ground: 6,
    frames: [
      [
        '.................MooooooooooooooMMnoooooo.................',
        '..........ooooooDDWWOOWOOWWOOWOODDDOWOOWWooooMMo..........',
        '.G...oooDDOWWOOWOWxxxWWWWWWWWWWWWWWWWWWWWOOWODDWooooo...G.',
        'gG.GowOOwOwwwwwwwwwwwwwwwwwwwwwwwwwwwwkwwwwwwxxwOOwOOoG.Gg',
        'gggGwwwwwwwwwwwwwwwwwwwwwwwwwWWWWwwwwkKkwwwwwwwwwwwwwwGggg',
        'owwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwPPpppwwwwwwwwwwwwwwwwo',
        'DvvvvMMnvvvvvvvvvvvvvwwwvvvvvvvvvvvvvvvvvvPPpvvvvvvHLLvvvD',
        '.DDvLLmmdvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvppvvvvvLLmmdDD.',
        '...DDDDDVVHLLVVVVVVVVVVVVVVVVVVVVvvVVVVVVVVVVVHLLVVDDDD...',
        '.....DDDDLLmmdVMMMnVVVVVVVVVVVVVVVVVVVVVHLLLVLLmmdDDD.....',
        '..........DDDDLLLmmduuHLLuuuHLLLuuuMMnuLLLmmdDDD..........',
        '.................DDDDDDDDDDDDDDDDDDDDDDDD.................',
      ],
      [
        '.................MooooooooooooooMMnoooooo.................',
        '..........ooooooDDWWOOWOOWWOOWOODDDOWOOWWooooMMo..........',
        '.G...oooDDOWWOOWOWWWWxxxWWWWWWWWWWWWWWWWWOOWODDWooooo...G.',
        'gG.GowOOwOwwwwwwwwwwwwwwwwwwwwwwwwwwwwkwwwwwwwwxOOwOOoG.Gg',
        'gggGwwwwwwwwwwwwwwwwwwwwwwWWWWwwwwwwwkKkwwwwwwwwwwwwwwGggg',
        'owwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwPPpppwwwwwwwwwwwwwwwwo',
        'DvvvvMMnvvvvvvvvvvvvvvvvwwwvvvvvvvvvvvvvvvPPpvvvvvvHLLvvvD',
        '.DDvLLmmdvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvppvvvvvLLmmdDD.',
        '...DDDDDVVHLLVVVVVVVVVVVVVVVVVvvVVVVVVVVVVVVVVHLLVVDDDD...',
        '.....DDDDLLmmdVMMMnVVVVVVVVVVVVVVVVVVVVVHLLLVLLmmdDDD.....',
        '..........DDDDLLLmmduuHLLuuuHLLLuuuMMnuLLLmmdDDD..........',
        '.................DDDDDDDDDDDDDDDDDDDDDDDD.................',
      ],
      [
        '.................MooooooooooooooMMnoooooo.................',
        '..........ooooooDDWWOOWOOWWOOWOODDDOWOOWWooooMMo..........',
        '.G...oooDDOWWOOWOWWWWWWWxxxWWWWWWWWWWWWWWOOWODDWooooo...G.',
        'gG.GowOOwOwwwwwwwwwwwwwwwwwwwwwwwwwwwwkwwwwwwxxwOOwOOoG.Gg',
        'gggGwwwwwwwwwwwwwwwwwwwWWWWwwwwwwwwwwkKkwwwwwwwwwwwwwwGggg',
        'owwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwPPpppwwwwwwwwwwwwwwwwo',
        'DvvvvMMnvvvvvvvvvvvvvvvvvvvwwwvvvvvvvvvvvvPPpvvvvvvHLLvvvD',
        '.DDvLLmmdvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvppvvvvvLLmmdDD.',
        '...DDDDDVVHLLVVVVVVVVVVVVVVvvVVVVVVVVVVVVVVVVVHLLVVDDDD...',
        '.....DDDDLLmmdVMMMnVVVVVVVVVVVVVVVVVVVVVHLLLVLLmmdDDD.....',
        '..........DDDDLLLmmduuHLLuuuHLLLuuuMMnuLLLmmdDDD..........',
        '.................DDDDDDDDDDDDDDDDDDDDDDDD.................',
      ],
      [
        '.................MooooooooooooooMMnoooooo.................',
        '..........ooooooDDWWOOWOOWWOOWOODDDOWOOWWooooMMo..........',
        '.G...oooDDOWWOOWOWWWWxxxWWWWWWWWWWWWWWWWWOOWODDWooooo...G.',
        'gG.GowOOwOwwwwwwwwwwwwwwwwwwwwwwwwwwwwkwwwwxxwwwOOwOOoG.Gg',
        'gggGwwwwwwwwwwwwwwwwwwwwwwWWWWwwwwwwwkKkwwwwwwwwwwwwwwGggg',
        'owwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwPPpppwwwwwwwwwwwwwwwwo',
        'DvvvvMMnvvvvvvvvvvvvvvvvwwwvvvvvvvvvvvvvvvPPpvvvvvvHLLvvvD',
        '.DDvLLmmdvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvppvvvvvLLmmdDD.',
        '...DDDDDVVHLLVVVVVVVVVVVVVVVVVvvVVVVVVVVVVVVVVHLLVVDDDD...',
        '.....DDDDLLmmdVMMMnVVVVVVVVVVVVVVVVVVVVVHLLLVLLmmdDDD.....',
        '..........DDDDLLLmmduuHLLuuuHLLLuuuMMnuLLLmmdDDD..........',
        '.................DDDDDDDDDDDDDDDDDDDDDDDD.................',
      ],
    ],
  },
  nest: {
    pal: { T: '#cdab74', t: '#a6834e', n: '#85643c', N: '#62482b', D: '#45311e', i: '#2f2318', z: '#14241a59' },
    ground: 1,
    frames: [
      [
        '.....t.T..NTT..nTT..ttt...n....',
        '..tTTNTTNDDDDDDDDDDDDDNTDNttN..',
        'tTTTNDiiiiiiiiiiiiiiiiiiiDDtttN',
        'TTTNnTTTNTTTNnTTTNTTTNnTTTNtttD',
        'tttNtttttNntttttNtttttNntttnnDn',
        '.ttttDttttDnttttDttttDnttttDnn.',
        '...DNNNDNNNNDNNNDNNNNDNNNDNN...',
        '......NNNNDNNNNNDNNNNNNDN......',
        '....zzzzzzzzzzzzzzzzzzzzzzz....',
      ],
    ],
  },
  nestFront: {
    pal: { T: '#cdab74', t: '#a6834e', n: '#85643c', N: '#62482b', D: '#45311e', z: '#14241a59' },
    ground: 1,
    frames: [
      [
        '...............................',
        '...............................',
        '...............................',
        'TTTNnTTTNTTTNnTTTNTTTNnTTTNtttD',
        'tttNtttttNntttttNtttttNntttnnDn',
        '.ttttDttttDnttttDttttDnttttDnn.',
        '...DNNNDNNNNDNNNDNNNNDNNNDNN...',
        '......NNNNDNNNNNDNNNNNNDN......',
        '....zzzzzzzzzzzzzzzzzzzzzzz....',
      ],
    ],
  },
  egg_normal: {
    pal: { H: '#fbf6e6', a: '#ece1c5', b: '#cdbd98', c: '#a08d6c', s: '#b89a72', S: '#97784f', k: '#4a3a29', h: '#241b13' },
    ground: 0,
    frames: [
      [
        '..HHa..',
        '.aHHsb.',
        '.sHaab.',
        'aaaaabb',
        'aaaaabb',
        'asaabSc',
        'baabSbc',
        '.bSbcc.',
        '..ccc..',
      ],
      [
        '..HHa..',
        '.aHHsb.',
        '.sHaab.',
        'aaaaakk',
        'aaaakkb',
        'asaabSc',
        'baabSbc',
        '.bSbcc.',
        '..ccc..',
      ],
      [
        '..HHa..',
        '.aHHsb.',
        '.sHaab.',
        'aakkakk',
        'aaakkkb',
        'asaabSc',
        'baabSbc',
        '.bSbcc.',
        '..ccc..',
      ],
      [
        '..HHa..',
        '.aHhhb.',
        '.sHkab.',
        'akkkakk',
        'kkakkkb',
        'asaabSc',
        'baabSbc',
        '.bSbcc.',
        '..ccc..',
      ],
    ],
  },
  egg_rare: {
    pal: { H: '#f0f8fa', a: '#cde2ea', b: '#a5c3d2', c: '#7998ac', s: '#7aa0bb', S: '#5e86a3', k: '#2c465c', h: '#16212b' },
    ground: 0,
    frames: [
      [
        '..HHa..',
        '.aHHsb.',
        '.sHaab.',
        'aaaaabb',
        'aaaaabb',
        'aasabSc',
        'baabbbc',
        '.bbScc.',
        '..ccc..',
      ],
      [
        '..HHa..',
        '.aHHsb.',
        '.sHaab.',
        'aaaaakk',
        'aaaakkb',
        'aasabSc',
        'baabbbc',
        '.bbScc.',
        '..ccc..',
      ],
      [
        '..HHa..',
        '.aHHsb.',
        '.sHaab.',
        'aakkakk',
        'aaakkkb',
        'aasabSc',
        'baabbbc',
        '.bbScc.',
        '..ccc..',
      ],
      [
        '..HHa..',
        '.aHhhb.',
        '.sHkab.',
        'akkkakk',
        'kkakkkb',
        'aasabSc',
        'baabbbc',
        '.bbScc.',
        '..ccc..',
      ],
    ],
  },
  egg_epic: {
    pal: { H: '#f1e6fa', a: '#cfb9e6', b: '#a88dcc', c: '#7d63a6', s: '#ecc860', S: '#cfa13a', k: '#45325f', h: '#1a1229' },
    ground: 0,
    frames: [
      [
        '..HHa..',
        '.aHHsb.',
        '.sHaab.',
        'aaaaabb',
        'aaaaabb',
        'aasaSbc',
        'baabbSc',
        '.bbScc.',
        '..ccc..',
      ],
      [
        '..HHa..',
        '.aHHsb.',
        '.sHaab.',
        'aaaaakk',
        'aaaakkb',
        'aasaSbc',
        'baabbSc',
        '.bbScc.',
        '..ccc..',
      ],
      [
        '..HHa..',
        '.aHHsb.',
        '.sHaab.',
        'aakkakk',
        'aaakkkb',
        'aasaSbc',
        'baabbSc',
        '.bbScc.',
        '..ccc..',
      ],
      [
        '..HHa..',
        '.aHhhb.',
        '.sHkab.',
        'akkkakk',
        'kkakkkb',
        'aasaSbc',
        'baabbSc',
        '.bbScc.',
        '..ccc..',
      ],
    ],
  },
  butterfly_yellow: {
    pal: { A: '#f6eba8', a: '#e3cf73', b: '#c4ac55', k: '#4b4231' },
    ground: 0,
    frames: [
      [
        'AA...AA',
        'AaAkAaa',
        '.Aakaa.',
        '.bbkbb.',
        '..b.b..',
      ],
      [
        '..A.A..',
        '.AAkAa.',
        '..aka..',
        '..bkb..',
        '.......',
      ],
    ],
  },
  butterfly_white: {
    pal: { A: '#f7f6ee', a: '#dfe1d3', b: '#b9beae', k: '#3c403a' },
    ground: 0,
    frames: [
      [
        'AA...AA',
        'AaAkAaa',
        '.Aakaa.',
        '.bbkbb.',
        '..b.b..',
      ],
      [
        '..A.A..',
        '.AAkAa.',
        '..aka..',
        '..bkb..',
        '.......',
      ],
    ],
  },
  butterfly_blue: {
    pal: { A: '#c3d4ee', a: '#93abd8', b: '#7088bb', k: '#2e3448' },
    ground: 0,
    frames: [
      [
        'AA...AA',
        'AaAkAaa',
        '.Aakaa.',
        '.bbkbb.',
        '..b.b..',
      ],
      [
        '..A.A..',
        '.AAkAa.',
        '..aka..',
        '..bkb..',
        '.......',
      ],
    ],
  },
  petal: {
    pal: { P: '#f8d3dc', p: '#eaa6ba', q: '#c98299' },
    ground: 0,
    frames: [
      [
        'PPp',
        '.pq',
        '...',
      ],
      [
        'P..',
        'pp.',
        '.q.',
      ],
      [
        '.P.',
        '.p.',
        '.q.',
      ],
    ],
  },
  marker: {
    pal: { W: '#fbfbf4', w: '#d5dad6', k: '#1d2722' },
    ground: 0,
    frames: [
      [
        '..kkkkk..',
        '..kWWwk..',
        '..kWWwk..',
        'kkkWWwkkk',
        'kWWWWWWwk',
        '.kWWWWwk.',
        '..kWWwk..',
        '...kwk...',
        '....k....',
      ],
    ],
  },
  feather: {
    pal: { W: '#f3f1e8', w: '#cfcbbd' },
    ground: 0,
    frames: [
      [
        'WWw',
        '.ww',
      ],
      [
        'Ww.',
        '.Ww',
      ],
    ],
  },
};
// </sprites>

// Sprite-local anchor points (1×, from the sprite's top-left).
const FLOWER_HEADS = [[2, 3], [8, 0], [13, 4], [18, 2], [23, 5]];  // top-centre of each bloom
const LANTERN_LAMP = [4.5, 7];                                      // centre of the glass

const OBJECTS = new Set(['flowers', 'mushrooms', 'birdbath', 'pond', 'lantern', 'feeder', 'stones']);
// Animated objects: seconds per frame + frame sequence (slow, subtle).
const ANIM = {
  birdbath: { dur: 0.7, seq: [0, 1, 2] },
  pond: { dur: 0.55, seq: [0, 1, 2, 3] },
};
const TIERS = ['normal', 'rare', 'epic'];
const EGG_GLOW = { normal: '#fff0c4', rare: '#d2efff', epic: '#ead6ff' };
const SHELL = {
  normal: ['#f6efdc', '#ece1c5', '#cdbd98'],
  rare: ['#e6f2f6', '#cde2ea', '#a5c3d2'],
  epic: ['#e6d8f4', '#cfb9e6', '#a88dcc'],
};

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ------------------------------------------------------------------ canvas + colour helpers */

function makeCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}

// '#rgb' | '#rrggbb' | '#rrggbbaa' → [r, g, b, a] (0..255)
export function parseHex(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

// Current device-pixel scale of a context (the caller applies devicePixelRatio
// via setTransform), so icons can snap to whole device pixels.
function ctxScale(ctx) {
  try { const m = ctx.getTransform(); return Math.abs(m.a) || 1; } catch (e) { return 1; }
}

/* ------------------------------------------------------------------ sprite cache */

const spriteCache = new Map();

function spriteDims(name) {
  const s = SPRITE_DATA[name];
  if (!s) return null;
  const rows = s.frames[0];
  return { w: rows[0].length, h: rows.length, ground: s.ground || 0, frames: s.frames.length };
}

// 1× canvas for one sprite frame (built once, then cached).
function spriteCanvas(name, fi = 0) {
  const spr = SPRITE_DATA[name];
  if (!spr) return null;
  fi = ((fi % spr.frames.length) + spr.frames.length) % spr.frames.length;
  const key = name + ':' + fi;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const rows = spr.frames[fi];
  const w = rows[0].length, h = rows.length;
  const c = makeCanvas(w, h);
  if (c) {
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const pal = {};
    for (const k in spr.pal) pal[k] = parseHex(spr.pal[k]);
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < w; x++) {
        const col = pal[row[x]];
        if (!col) continue;
        const i = (y * w + x) * 4;
        img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = col[3];
      }
    }
    g.putImageData(img, 0, 0);
  }
  spriteCache.set(key, c);
  return c;
}

// Draw a sprite frame with its top-left at (x, y), each sprite pixel px×px.
function blit(ctx, name, fi, x, y, px) {
  const c = spriteCanvas(name, fi);
  if (!c) return;
  const was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, Math.round(x), Math.round(y), c.width * px, c.height * px);
  ctx.imageSmoothingEnabled = was;
}

// Soft radial glow (white→transparent alpha falloff, tinted), cached per colour.
const glowCache = new Map();
function glowCanvas(color) {
  if (glowCache.has(color)) return glowCache.get(color);
  const S = 64;
  const c = makeCanvas(S, S);
  if (c) {
    const g = c.getContext('2d');
    const [r, gg, b] = parseHex(color);
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, `rgba(${r},${gg},${b},1)`);
    grad.addColorStop(0.25, `rgba(${r},${gg},${b},0.62)`);
    grad.addColorStop(0.55, `rgba(${r},${gg},${b},0.2)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  }
  glowCache.set(color, c);
  return c;
}

// Additive-ish soft light centred at (x, y) with radius r (rx, ry for ellipses).
function drawGlow(ctx, color, x, y, rx, ry, alpha) {
  if (alpha <= 0.002) return;
  const c = glowCanvas(color);
  if (!c) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, x - rx, y - ry, rx * 2, ry * 2);
  ctx.restore();
}

/* ------------------------------------------------------------------ decor objects */

function decorFrame(id, t) {
  const a = ANIM[id];
  if (!a) return 0;
  const i = Math.floor((t || 0) / a.dur) % a.seq.length;
  return a.seq[(i + a.seq.length) % a.seq.length];
}

function lanternFlicker(t) {
  // Several slow sines → a gentle, never-jumpy breathing of the flame.
  return 0.84 + 0.08 * Math.sin(t * 2.1) + 0.05 * Math.sin(t * 5.3 + 1.3) + 0.03 * Math.sin(t * 9.7 + 0.4);
}

function drawLanternLight(ctx, lampX, lampY, baseY, px, t, strength = 1) {
  const f = lanternFlicker(t) * strength;
  drawGlow(ctx, '#ffd88f', lampX, lampY, 12 * px, 12 * px, 0.34 * f);
  drawGlow(ctx, '#fff1c8', lampX, lampY, 4 * px, 4 * px, 0.32 * f);
  if (baseY != null) drawGlow(ctx, '#ffd88f', lampX, baseY, 10 * px, 2.5 * px, 0.16 * f);
}

/** Visible size (CSS px, at DECOR_PX) of a garden object above the ground line. */
export function decorSize(id) {
  const d = OBJECTS.has(id) && spriteDims(id);
  if (!d) return { w: 0, h: 0 };
  return { w: d.w * DECOR_PX, h: (d.h - d.ground) * DECOR_PX };
}

/** Draw garden object `id` bottom-centred on (cx, groundY); t = seconds. */
export function drawDecor(ctx, id, cx, groundY, t = 0) {
  const d = OBJECTS.has(id) && spriteDims(id);
  if (!d) return;
  const px = DECOR_PX;
  const x = Math.round(cx - (d.w * px) / 2);
  const y = Math.round(groundY - (d.h - d.ground) * px);
  blit(ctx, id, decorFrame(id, t), x, y, px);
  if (id === 'lantern') {
    drawLanternLight(ctx, x + LANTERN_LAMP[0] * px, y + LANTERN_LAMP[1] * px, groundY, px, t);
  }
}

/** Head-top points of the flower bed (CSS px) — butterflies settle here. */
export function flowerSpots(cx, groundY) {
  const d = spriteDims('flowers');
  if (!d) return [];
  const px = DECOR_PX;
  const x0 = Math.round(cx - (d.w * px) / 2);
  const y0 = Math.round(groundY - (d.h - d.ground) * px);
  return FLOWER_HEADS.map(([hx, hy]) => ({ x: x0 + (hx + 0.5) * px, y: y0 + hy * px }));
}

/* ------------------------------------------------------------------ shop icons */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Little backdrop "card" for effect icons.
function iconBackdrop(ctx, w, h, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.save();
  roundRect(ctx, 1, 1, w - 2, h - 2, Math.min(7, w / 6));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

// Largest scale ≤ maxPx that fits a (sw×sh)-pixel sprite in (w×h) with padding,
// snapped to whole DEVICE pixels so the art stays crisp on any DPR.
function fitScale(ctx, sw, sh, w, h, pad, maxPx = 99) {
  const k = ctxScale(ctx);
  const dev = Math.max(1, Math.floor(Math.min(((w - 2 * pad) * k) / sw, ((h - 2 * pad) * k) / sh)));
  return Math.min(dev / k, maxPx);
}

/** Shop preview for any DECOR id (objects + the 4 effects), centred in w×h. */
export function drawDecorIcon(ctx, id, w, h) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (OBJECTS.has(id)) {
    const d = spriteDims(id);
    if (d) {
      // sprite + a little grass patch (3 px wider each side, 2 rows below the ground line)
      const below = Math.max(d.ground, 2);
      const s = fitScale(ctx, d.w + 6, d.h - d.ground + below, w, h, 3, 4);
      const x = Math.round((w - d.w * s) / 2);
      const gy = Math.round((h - (d.h - d.ground + below) * s) / 2 + (d.h - d.ground) * s);
      iconGround(ctx, w / 2, gy, (d.w / 2 + 3) * s, s);
      blit(ctx, id, 0, x, gy - (d.h - d.ground) * s, s);
      if (id === 'lantern') {
        const top = gy - (d.h - d.ground) * s;
        drawLanternLight(ctx, x + LANTERN_LAMP[0] * s, top + LANTERN_LAMP[1] * s, gy, s, 0.6, 0.9);
      }
    }
  } else if (id === 'butterflies') {
    iconBackdrop(ctx, w, h, '#58795e', '#3a5a45');
    iconGrass(ctx, w, h);
    const s = fitScale(ctx, 20, 16, w, h, 6, 3);
    blit(ctx, 'butterfly_yellow', 0, w / 2 - 9 * s, h / 2 - 6 * s, s);
    blit(ctx, 'butterfly_blue', 0, w / 2 + 2 * s, h / 2 - 1 * s, s);
  } else if (id === 'petals') {
    iconBackdrop(ctx, w, h, '#9fc0cb', '#8fb3c4');
    const s = fitScale(ctx, 16, 14, w, h, 6, 3);
    const pts = [[-6, -5, 0], [1, -6, 2], [-2, -1, 1], [4, 0, 0], [-7, 3, 2], [1, 4, 1]];
    for (const [dx, dy, f] of pts) blit(ctx, 'petal', f, w / 2 + dx * s, h / 2 + dy * s, s);
  } else if (id === 'fireflies') {
    iconBackdrop(ctx, w, h, '#2a4334', '#1c2d22');
    const u = Math.max(1, Math.round(Math.min(w, h) / 30));
    const pts = [[0.3, 0.38, 1], [0.62, 0.3, 0.7], [0.48, 0.62, 0.9], [0.76, 0.66, 0.6], [0.2, 0.7, 0.55]];
    for (const [fx, fy, a] of pts) drawFirefly(ctx, w * fx, h * fy, a, u);
  } else if (id === 'sunbeams') {
    iconBackdrop(ctx, w, h, '#a7c6cf', '#8fb3c4');
    ctx.save();
    roundRect(ctx, 1, 1, w - 2, h - 2, Math.min(7, w / 6));
    ctx.clip();
    const beams = [[-0.1, 0.16, 0.55], [0.22, 0.12, 0.45], [0.48, 0.18, 0.5]];
    for (const [fx, fw, a] of beams) drawBeam(ctx, w * fx, w * fw, -2, h + 2, 0.7, a, '#fff6dc');
    drawGlow(ctx, '#fff4cf', 3, 3, w * 0.35, w * 0.35, 0.7);
    ctx.restore();
  }
  ctx.restore();
}

// Flat pixel grass patch centred on (cx, gy) for object icons: a lit top edge,
// the turf, and a darker underside, with stepped (rounded) ends.
function iconGround(ctx, cx, gy, half, s) {
  const rows = [[-1, 2, '#3f604a'], [0, 0, '#2e4a3a'], [1, 2, '#243b2d']];
  ctx.save();
  for (const [dy, inset, col] of rows) {
    const hw = Math.round(half - inset * s);
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(cx - hw), Math.round(gy + dy * s), hw * 2, Math.ceil(s));
  }
  ctx.restore();
}

function iconGrass(ctx, w, h) {
  ctx.save();
  ctx.fillStyle = '#2e4a3a';
  const u = Math.max(1, Math.round(Math.min(w, h) / 32));
  ctx.fillRect(2, h - 2 - 3 * u, w - 4, 3 * u);
  ctx.fillStyle = '#4b6e54';
  for (let x = 4; x < w - 4; x += 3 * u) ctx.fillRect(x, h - 2 - (4 + ((x * 7) % 3)) * u, u, (2 + ((x * 7) % 3)) * u);
  ctx.restore();
}

/* ------------------------------------------------------------------ nest + eggs */

/** Nest size in CSS px (above ground). */
export function nestSize() {
  const d = spriteDims('nest');
  return d ? { w: d.w * EGG_PX, h: (d.h - d.ground) * EGG_PX } : { w: 0, h: 0 };
}

function nestOrigin(cx, groundY) {
  const d = spriteDims('nest');
  return { d, x: Math.round(cx - (d.w * EGG_PX) / 2), y: Math.round(groundY - (d.h - d.ground) * EGG_PX) };
}

/** Back of the nest (rim + hollow); draw before the eggs. */
export function drawNest(ctx, cx, groundY) {
  if (!SPRITE_DATA.nest) return;
  const o = nestOrigin(cx, groundY);
  blit(ctx, 'nest', 0, o.x, o.y, EGG_PX);
}

/** Front lip of the nest; draw after the eggs so it hides their bottoms. */
export function drawNestFront(ctx, cx, groundY) {
  if (!SPRITE_DATA.nestFront) return;
  const o = nestOrigin(cx, groundY);
  blit(ctx, 'nestFront', 0, o.x, o.y, EGG_PX);
}

/** Bottom-centre positions for n (1..3) eggs sitting in the nest. */
export function nestEggSlots(cx, groundY, n) {
  n = clamp(Math.round(n) || 0, 0, 3);
  if (!n || !SPRITE_DATA.nest) return [];
  const o = nestOrigin(cx, groundY);
  const ew = spriteDims('egg_normal')?.w || 7;
  // Columns (in nest pixels) of each egg's left edge, and how deep it sits
  // (rows above ground of its bottom) — the middle egg sits a little further back.
  const layouts = {
    1: [[12, 4]],
    2: [[7, 3], [17, 3]],
    3: [[2, 3], [12, 4], [22, 3]],
  };
  return layouts[n].map(([col, depth]) => ({
    x: o.x + (col + ew / 2) * EGG_PX,
    y: groundY - depth * EGG_PX,
  }));
}

/** Egg size in CSS px. */
export function eggSize() {
  const d = spriteDims('egg_normal');
  return d ? { w: d.w * EGG_PX, h: d.h * EGG_PX } : { w: 0, h: 0 };
}

/** Egg bottom-centred at (x, y). wobble = radians around the bottom; crack 0..3; glow 0..1. */
export function drawEgg(ctx, tier, x, y, { wobble = 0, crack = 0, glow = 0 } = {}) {
  if (!TIERS.includes(tier)) tier = 'normal';
  const name = 'egg_' + tier;
  const d = spriteDims(name);
  if (!d) return;
  const w = d.w * EGG_PX, h = d.h * EGG_PX;
  if (glow > 0) drawGlow(ctx, EGG_GLOW[tier], x, y - h * 0.5, h * 0.95, h * 0.95, 0.55 * clamp(glow, 0, 1));
  const fi = clamp(Math.round(crack) || 0, 0, d.frames - 1);
  const left = Math.round(x - w / 2), top = Math.round(y - h);
  if (!wobble) { blit(ctx, name, fi, left, top, EGG_PX); return; }
  // Rotate about the bottom-centre, keeping the unrotated pixel grid identical
  // to the still egg (no 1-px jump when a wobble starts or ends).
  ctx.save();
  ctx.translate(x, top + h);
  ctx.rotate(wobble);
  ctx.translate(-x, -(top + h));
  blit(ctx, name, fi, left, top, EGG_PX);
  ctx.restore();
}

/** Shop preview of an egg, centred in w×h. */
export function drawEggIcon(ctx, tier, w, h) {
  if (!TIERS.includes(tier)) tier = 'normal';
  const d = spriteDims('egg_' + tier);
  if (!d) return;
  ctx.save();
  const s = fitScale(ctx, d.w, d.h, w, h, 3);
  const x = (w - d.w * s) / 2, y = (h - d.h * s) / 2;
  blit(ctx, 'egg_' + tier, 0, x, y, s);
  ctx.restore();
}

/* ------------------------------------------------------------------ rare colour variants */

/**
 * Pure pixel gradient map (exported for tests). `data` = RGBA bytes (mutated in
 * place), `stops` = [[r,g,b], …] dark → light. Luminance of every non-transparent
 * pixel is contrast-stretched (2nd..98th percentile → 0..1) and mapped onto the
 * evenly spaced stops by linear interpolation; alpha is preserved.
 */
export function gradientMapPixels(data, stops) {
  const n = stops.length;
  if (!n) return data;
  const hist = new Uint32Array(256);
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    hist[luma(data[i], data[i + 1], data[i + 2])]++;
    count++;
  }
  if (!count) return data;
  const lo = percentile(hist, count, 0.02), hi = percentile(hist, count, 0.98);
  const span = hi - lo;
  // 256-entry lookup: luminance → mapped colour
  const lut = new Uint8ClampedArray(256 * 3);
  for (let L = 0; L < 256; L++) {
    const t = span > 0 ? clamp((L - lo) / span, 0, 1) : 0.5;
    const p = t * (n - 1), i = Math.min(n - 2, Math.floor(p)), f = n > 1 ? p - i : 0;
    const a = stops[Math.max(0, i)], b = stops[Math.min(n - 1, i + 1)];
    lut[L * 3] = a[0] + (b[0] - a[0]) * f;
    lut[L * 3 + 1] = a[1] + (b[1] - a[1]) * f;
    lut[L * 3 + 2] = a[2] + (b[2] - a[2]) * f;
  }
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const L = luma(data[i], data[i + 1], data[i + 2]) * 3;
    data[i] = lut[L]; data[i + 1] = lut[L + 1]; data[i + 2] = lut[L + 2];
  }
  return data;
}
function luma(r, g, b) { return Math.round(0.299 * r + 0.587 * g + 0.114 * b); }
// q-quantile of the luminance histogram, interpolated between neighbouring ranks.
function percentile(hist, count, q) {
  const rank = q * (count - 1), k = Math.floor(rank), f = rank - k;
  const at = r => { let acc = 0; for (let L = 0; L < 256; L++) { acc += hist[L]; if (acc > r) return L; } return 255; };
  const v0 = at(k);
  return f > 0 && k + 1 < count ? v0 + (at(k + 1) - v0) * f : v0;
}

const recolorCache = new WeakMap();

/**
 * Canvas the size of `img` with every opaque pixel gradient-mapped onto the
 * variant's colour stops. Cached per (img, variant). Returns `img` unchanged
 * for an unknown variant, an unloaded image or a tainted canvas.
 */
export function recolor(img, variantId) {
  const v = variantId && variantById(variantId);
  if (!img || !v) return img;
  let m = recolorCache.get(img);
  if (!m) { m = new Map(); recolorCache.set(img, m); }
  if (m.has(variantId)) return m.get(variantId);
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) return img;                       // not loaded yet — don't cache
  const c = makeCanvas(w, h);
  if (!c) return img;
  let out = img;
  try {
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const id = g.getImageData(0, 0, w, h);
    gradientMapPixels(id.data, v.stops.map(parseHex));
    g.putImageData(id, 0, 0);
    out = c;
  } catch (e) { out = img; }                        // tainted / unsupported
  m.set(variantId, out);
  return out;
}

/* ------------------------------------------------------------------ small sprites: sparkle, marker */

/** 4-point pixel twinkle centred at (x, y); phase 0..1 grows, peaks, then fades. */
export function drawSparkle(ctx, x, y, size, phase) {
  const p = clamp(phase, 0, 1);
  const u = Math.max(1, Math.floor(size / 7));            // pixel unit
  const grow = Math.sin(p * Math.PI);                     // 0 → 1 → 0
  const arm = Math.round(grow * 3);                       // arm length in units (0..3)
  const alpha = p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45;
  if (alpha <= 0) return;
  const cx = Math.round(x - u / 2), cy = Math.round(y - u / 2);
  ctx.save();
  const base = ctx.globalAlpha * alpha;                  // respect the caller's alpha
  ctx.fillStyle = '#fff3b8';
  for (let i = 1; i <= arm; i++) {
    ctx.globalAlpha = base * (i === arm && arm > 1 ? 0.55 : 1);
    ctx.fillRect(cx + i * u, cy, u, u); ctx.fillRect(cx - i * u, cy, u, u);
    ctx.fillRect(cx, cy + i * u, u, u); ctx.fillRect(cx, cy - i * u, u, u);
  }
  if (grow > 0.75) {                                     // faint diagonal glints at the peak
    ctx.globalAlpha = base * 0.45;
    ctx.fillRect(cx + u, cy + u, u, u); ctx.fillRect(cx - u, cy - u, u, u);
    ctx.fillRect(cx + u, cy - u, u, u); ctx.fillRect(cx - u, cy + u, u, u);
  }
  ctx.globalAlpha = base;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx, cy, u, u);
  ctx.restore();
}

/** Small bobbing pixel down-arrow; its tip touches (x, y). */
export function drawSelectMarker(ctx, x, y, t = 0) {
  const d = spriteDims('marker');
  if (!d) return;
  const bob = Math.round((0.5 - 0.5 * Math.cos(t * 3.2)) * 3);   // 0..3 px, gentle
  blit(ctx, 'marker', 0, x - (d.w * FX_PX) / 2, y - d.h * FX_PX - bob, FX_PX);
}

/* ------------------------------------------------------------------ ambient effects */

function drawFirefly(ctx, x, y, a, u = 1) {
  drawGlow(ctx, '#e4f49a', x, y, 9 * u, 9 * u, 0.55 * a);
  ctx.save();
  ctx.globalAlpha = clamp(0.25 + 0.75 * a, 0, 1);
  ctx.fillStyle = '#f6fbc4';
  ctx.fillRect(Math.round(x - u), Math.round(y - u), 2 * u, 2 * u);
  ctx.restore();
}

// One diagonal light beam: top edge at y0 from x0 to x0+w, slanting right by
// `slope` px per px of height, fading out towards the bottom.
function drawBeam(ctx, x0, w, y0, y1, slope, alpha, color) {
  if (alpha <= 0.002) return;
  const [r, g, b] = parseHex(color);
  const dy = y1 - y0, dx = dy * slope;
  const grad = ctx.createLinearGradient(0, y0, 0, y1);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.55, `rgba(${r},${g},${b},0.45)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0 + w, y0);
  ctx.lineTo(x0 + w + dx, y1);
  ctx.lineTo(x0 + dx, y1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function envGround(env) { return env.groundY != null ? env.groundY : env.H - 30; }

/* --- butterflies: 3, meandering slowly through the lower 2/3, sometimes resting on a flower */
function makeButterflies() {
  const kinds = ['yellow', 'white', 'blue'];
  const bs = kinds.map((k, i) => ({
    sprite: 'butterfly_' + k,
    u: 0.12 + i * 0.33 + rnd(0, 0.15),      // x as a fraction of W (survives resizes)
    alt: rnd(50, 150), altT: rnd(50, 150),  // px above the ground line (+ where it's drifting to)
    dir: Math.random() < 0.5 ? -1 : 1, vx: 0,
    speed: rnd(14, 19),
    seed: rnd(0, 100),
    state: 'fly', timer: rnd(6, 18), turnT: rnd(6, 16), altTimer: rnd(1, 4),
    spot: -1, seekT: 0, bobK: 1,
    flapT: 0, frame: 0,
  }));
  let time = 0;
  const band = env => ({ lo: 14, hi: Math.max(34, envGround(env) - env.H / 3 - 8) });
  return {
    update(dt, env) {
      if (!env || !env.W) return;
      dt = Math.min(dt, 0.1);
      time += dt;
      const spots = env.flowerSpots || [];
      const gy = envGround(env);
      const { lo, hi } = band(env);
      for (const b of bs) {
        let x = b.u * env.W;
        if (b.state === 'rest') {
          const s = spots[b.spot];
          if (s) {
            b.u = s.x / env.W; b.alt = gy - s.y;
            b.timer -= dt;
            b.flapT += dt;
            if (b.flapT > 0.9) { b.flapT = 0; b.frame ^= 1; }   // wings slowly open / close
            if (b.timer > 0) continue;
          }
          // take off, up and away from the flower bed
          b.state = 'fly'; b.spot = -1; b.timer = rnd(35, 60);
          b.dir = x < env.W / 2 ? 1 : -1; b.vx = 0; b.turnT = rnd(22, 40);
          b.altT = rnd((lo + hi) / 2, hi); b.altTimer = rnd(3, 6);
          continue;
        }
        const s = b.state === 'seek' ? spots[b.spot] : null;
        if (b.state === 'seek' && (!s || (b.seekT += dt) > 15)) { b.state = 'fly'; b.spot = -1; b.timer = rnd(8, 16); }
        if (b.state === 'seek') {
          // straight, easing approach to the flower head
          const dx = s.x - x, dy = (gy - s.y) - b.alt, dist = Math.hypot(dx, dy);
          if (dist < 2.5) { b.state = 'rest'; b.timer = rnd(3.5, 7); b.flapT = 0; b.frame = 0; b.bobK = 0; continue; }
          const sp = Math.max(5, Math.min(b.speed, dist * 1.1));
          x += (dx / dist) * sp * dt;
          b.alt += (dy / dist) * sp * dt;
          b.vx = (dx / dist) * sp;
          b.bobK = Math.min(1, dist / 30);
        } else {
          // cruise: drift sideways (easing into the occasional turn), wander in height
          b.turnT -= dt;
          if (b.turnT <= 0) { b.dir = -b.dir; b.turnT = rnd(9, 22); }
          if (x < 30) b.dir = 1; else if (x > env.W - 30) b.dir = -1;
          b.altTimer -= dt;
          if (b.altTimer <= 0) { b.altT = rnd(lo + 8, hi - 4); b.altTimer = rnd(2.5, 6); }
          const want = b.dir * b.speed * (0.6 + 0.4 * Math.sin(time * 0.9 + b.seed));
          b.vx += (want - b.vx) * Math.min(1, dt * 1.2);
          x += b.vx * dt;
          b.alt += (b.altT - b.alt) * Math.min(1, dt * 0.6);
          b.bobK = Math.min(1, b.bobK + dt);
        }
        x = clamp(x, 6, env.W - 6);
        b.alt = clamp(b.alt, b.state === 'seek' ? 0 : lo, hi);
        b.u = x / env.W;
        // wings: steady flutter with an occasional glide
        b.flapT += dt;
        if (Math.sin(time * 0.6 + b.seed) > 0.75) b.frame = 0;
        else if (b.flapT > 0.15) { b.flapT = 0; b.frame ^= 1; }
        if (b.state === 'fly') {
          b.timer -= dt;
          if (b.timer <= 0) {
            // only flowers nearby — butterflies drift past and visit, they don't commute
            const taken = new Set(bs.map(o => o.spot));
            const free = spots.map((_, i) => i).filter(i => !taken.has(i) && Math.abs(spots[i].x - x) < 260);
            if (free.length && Math.random() < 0.6) { b.state = 'seek'; b.seekT = 0; b.spot = free[(Math.random() * free.length) | 0]; }
            else b.timer = rnd(8, 16);
          }
        }
      }
    },
    draw(ctx, env) {
      if (!env || !env.W) return;
      const gy = envGround(env);
      for (const b of bs) {
        const d = spriteDims(b.sprite);
        if (!d) continue;
        // irregular flutter bob (not while resting), body lifts a px on the down-stroke
        const bob = b.bobK * (4 * Math.sin(time * 2.3 + b.seed) + 2.5 * Math.sin(time * 3.7 + b.seed * 1.7));
        const lift = b.state !== 'rest' && b.frame === 1 ? FX_PX : 0;
        const x = b.u * env.W, y = gy - b.alt - bob;
        blit(ctx, b.sprite, b.frame, x - (d.w * FX_PX) / 2, y - d.h * FX_PX - lift, FX_PX);
      }
    },
  };
}

/* --- petals: ~12 pink petals drifting down and to the right, swaying, respawning at the top */
function makePetals() {
  const N = 12;
  const ps = [];
  const spawn = (p, env, initial) => {
    p.u = initial ? rnd(-0.05, 1) : rnd(-0.15, 0.85);
    p.y = initial ? rnd(-40, (env ? envGround(env) : 260)) : rnd(-50, -8);
    p.vy = rnd(9, 15);
    p.vx = rnd(7, 13);
    p.sway = rnd(5, 11);
    p.freq = rnd(0.5, 0.9);
    p.ph = rnd(0, TAU);
    p.spin = rnd(0.45, 0.8);
    p.ft = rnd(0, 1);
    p.frame = (Math.random() * 3) | 0;
    p.land = null;
    p.fade = 1;
  };
  for (let i = 0; i < N; i++) { const p = {}; spawn(p, null, true); ps.push(p); }
  let time = 0;
  return {
    update(dt, env) {
      if (!env || !env.W) return;
      dt = Math.min(dt, 0.1);
      time += dt;
      const gy = envGround(env);
      for (const p of ps) {
        if (p.land == null) p.land = rnd(gy - 2, Math.max(gy, env.H - 6));
        if (p.y >= p.land) {                                    // resting in the grass: fade, then respawn
          p.fade -= dt / 1.6;
          if (p.fade <= 0) spawn(p, env, false);
          continue;
        }
        const x = p.u * env.W + (p.vx + Math.cos(time * p.freq * TAU / 2 + p.ph) * p.sway) * dt;
        p.y += (p.vy + Math.sin(time * p.freq * TAU / 2 + p.ph) * 3) * dt;
        p.u = x / env.W;
        if (p.u > 1.05) spawn(p, env, false);
        p.ft += dt;
        if (p.ft > p.spin) { p.ft = 0; p.frame = (p.frame + 1) % 3; }
      }
    },
    draw(ctx, env) {
      if (!env || !env.W) return;
      ctx.save();
      for (const p of ps) {
        if (p.y < -10) continue;
        ctx.globalAlpha = clamp(p.fade, 0, 1) * 0.92;
        blit(ctx, 'petal', p.frame, p.u * env.W - 3, p.y - 3, FX_PX);
      }
      ctx.restore();
    },
  };
}

/* --- fireflies: ~10 slow glowing dots in the lower half, each pulsing on its own rhythm */
function makeFireflies() {
  const N = 10;
  const fs = Array.from({ length: N }, () => ({
    u: rnd(0.03, 0.97),
    v: rnd(0, 1),                 // 0 = top of the band (mid-height), 1 = a little below the ground line
    head: rnd(0, TAU),
    speed: rnd(4, 8),
    per: rnd(3, 6),
    ph: rnd(0, 1),
    seed: rnd(0, 100),
  }));
  let time = 0;
  const band = env => { const top = env.H * 0.5, bot = Math.min(env.H - 4, envGround(env) + 14); return { top, span: Math.max(10, bot - top) }; };
  return {
    update(dt, env) {
      if (!env || !env.W) return;
      dt = Math.min(dt, 0.1);
      time += dt;
      const { span } = band(env);
      for (const f of fs) {
        f.head += Math.sin(time * 0.5 + f.seed) * 0.9 * dt;
        let x = f.u * env.W + Math.cos(f.head) * f.speed * dt;
        f.v += (Math.sin(f.head) * f.speed * 0.5 * dt) / span;
        if (x < 4 || x > env.W - 4) { f.head = Math.PI - f.head; x = clamp(x, 4, env.W - 4); }
        if (f.v < 0 || f.v > 1) { f.head = -f.head; f.v = clamp(f.v, 0, 1); }
        f.u = x / env.W;
      }
    },
    draw(ctx, env) {
      if (!env || !env.W) return;
      const { top, span } = band(env);
      for (const f of fs) {
        const k = 0.5 - 0.5 * Math.cos(TAU * (time / f.per + f.ph));
        drawFirefly(ctx, f.u * env.W, top + f.v * span, k * k, 1);
      }
    },
  };
}

/* --- sunbeams: 3–4 wide, faint, warm diagonal beams from the top-left, slowly breathing */
function makeSunbeams() {
  const beams = [
    { f: -0.06, w: 70, a: 0.10, per: 11, ph: 0.0 },
    { f: 0.13, w: 38, a: 0.08, per: 14, ph: 1.7 },
    { f: 0.27, w: 92, a: 0.07, per: 17, ph: 3.1 },
    { f: 0.47, w: 46, a: 0.06, per: 13, ph: 4.4 },
  ];
  let time = rnd(0, 30);
  return {
    update(dt) { time += Math.min(dt, 0.1); },
    draw(ctx, env) {
      if (!env || !env.W) return;
      const bottom = envGround(env) + 26;
      const scale = clamp(env.W / 900, 0.6, 1.6);           // wider canvases get wider beams
      for (const b of beams) {
        const breath = 0.6 + 0.4 * Math.sin(TAU * time / b.per + b.ph);
        const x0 = b.f * env.W, w = b.w * scale;
        drawBeam(ctx, x0 - 12 * scale, w + 24 * scale, -6, bottom, 0.62, b.a * breath * 0.45, '#fff2cf');  // soft halo
        drawBeam(ctx, x0, w, -6, bottom, 0.62, b.a * breath, '#fff2cf');
      }
    },
  };
}

/** Ambient effect layer: { update(dt, env), draw(ctx, env) } (null for an unknown id). */
export function createEffect(id) {
  switch (id) {
    case 'butterflies': return makeButterflies();
    case 'petals': return makePetals();
    case 'fireflies': return makeFireflies();
    case 'sunbeams': return makeSunbeams();
    default: return null;
  }
}

/* ------------------------------------------------------------------ hatch burst */

/**
 * Hatch puff at (x, y) (≈ the egg's centre): shell flecks + a few feathers
 * flying out and settling ~a dozen px lower, soft dust puffs, and gold/white
 * twinkles when `rare`. `tier` tints the shell flecks. Lasts ~1.2 s.
 */
export function createBurst(x, y, { rare = false, tier = 'normal' } = {}) {
  const shell = SHELL[tier] || SHELL.normal;
  const parts = [];
  for (let i = 0; i < 10; i++) {
    const big = Math.random() < 0.35;
    parts.push({
      kind: 'shell', x: x + rnd(-4, 4), y: y + rnd(-6, 2),
      vx: rnd(-75, 75), vy: rnd(-150, -60), g: 420,
      w: big ? 2 * EGG_PX : EGG_PX, h: EGG_PX,
      color: shell[(Math.random() * shell.length) | 0],
      floor: y + rnd(8, 16), rest: false,
    });
  }
  for (let i = 0; i < 4; i++) {
    parts.push({
      kind: 'feather', x: x + rnd(-6, 6), y: y + rnd(-8, 0),
      vx: rnd(-40, 40), vy: rnd(-70, -35), g: 90, maxFall: 22,
      ph: rnd(0, TAU), frame: i & 1, ft: 0, floor: y + rnd(6, 14), rest: false,
    });
  }
  const puffs = Array.from({ length: 6 }, (_, i) => ({ a: (i / 6) * TAU + rnd(-0.3, 0.3), d: rnd(8, 13), r: rnd(3.5, 6) }));
  const twinkles = rare
    ? Array.from({ length: 7 }, () => ({ x: x + rnd(-26, 26), y: y + rnd(-34, 6), t0: rnd(0, 0.55), size: rnd(9, 15) }))
    : [];
  const DUR = 1.25;
  let age = 0;
  return {
    update(dt) {
      dt = Math.min(dt, 0.1);
      age += dt;
      for (const p of parts) {
        if (p.rest) continue;
        p.vy += p.g * dt;
        if (p.maxFall) {                                  // feathers: drag + sway
          p.vy = Math.min(p.vy, p.maxFall);
          p.vx *= 1 - Math.min(1, dt * 1.8);
          p.x += Math.cos(age * 5 + p.ph) * 14 * dt;
          p.ft += dt;
          if (p.ft > 0.28) { p.ft = 0; p.frame ^= 1; }
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.vy > 0 && p.y >= p.floor) { p.y = p.floor; p.rest = true; }
      }
      return age < DUR;
    },
    draw(ctx) {
      const fade = age < DUR - 0.4 ? 1 : clamp((DUR - age) / 0.4, 0, 1);
      if (fade <= 0) return;
      ctx.save();
      // pixel "poof": bright little clouds drifting outwards and shrinking away (first ~0.5 s)
      const pk = clamp(age / 0.5, 0, 1);
      if (pk < 1) {
        const out = 1 - (1 - pk) * (1 - pk);               // ease-out travel
        for (const p of puffs) {
          const r = Math.round(p.r * (1 - pk) + 0.4);
          if (r < 1) continue;
          const px = Math.round(x + Math.cos(p.a) * p.d * (0.35 + out));
          const py = Math.round(y - 2 + Math.sin(p.a) * p.d * 0.55 * (0.35 + out) - out * 4);
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = '#fbf8ee';
          ctx.fillRect(px - r, py - r + 1, r * 2, r * 2 - 2);
          ctx.fillRect(px - r + 1, py - r, r * 2 - 2, r * 2);
          if (r > 2) { ctx.fillStyle = '#ddd8c6'; ctx.fillRect(px - r + 1, py + r - 1, r * 2 - 2, 1); }   // soft underside
        }
      }
      for (const p of parts) {
        ctx.globalAlpha = fade;
        if (p.kind === 'shell') {
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(p.x - p.w / 2), Math.round(p.y - p.h / 2), p.w, p.h);
        } else {
          blit(ctx, 'feather', p.frame, p.x - FX_PX * 1.5, p.y - FX_PX, FX_PX);
        }
      }
      ctx.restore();
      for (const s of twinkles) {
        const ph = (age - s.t0) / 0.7;
        if (ph > 0 && ph < 1) drawSparkle(ctx, s.x, s.y, s.size, ph);
      }
    },
  };
}
