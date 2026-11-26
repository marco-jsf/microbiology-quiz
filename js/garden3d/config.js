// Shared constants of the 2.5D garden demo (world units: 1 ≈ one size-1 bird).

export const TEX = 20;                    // ground texels per world unit
export const SUB = 5;                     // terrain cells per world unit (cell = 4 texels)
export const X0 = -17, X1 = 17;           // painted / built ground area
export const Z0 = -13.5, Z1 = 11.5;

export const LAWN = 0;
export const TERRACE = 1.25;
export const SHELF = -0.3;                // shallow pond shelf (waders stand here)
export const DEEP = -0.62;
export const WATER = -0.14;
export const LOW = -5;                    // the land below the garden plateau

export const PITCH = 42 * Math.PI / 180;  // camera looks down this much
export const FOV = 28;
// Sprites stand upright; stretching them by 1/cos(pitch) makes them look on
// screen exactly as drawn (the camera sees them at an angle).
export const VSTRETCH = 1 / Math.cos(PITCH);

// Scale of the hand-drawn garden objects (same relation as the 2D garden:
// a size-1 bird is 64 px tall, decor is drawn 3 px per sprite pixel).
export const DECOR_TEXEL = 3 / 64;
export const BIRD_UNIT = 1;               // height of a size-1 bird
