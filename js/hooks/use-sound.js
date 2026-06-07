// A lightweight stand-in for the `use-sound` library's API, adapted for this
// vanilla (non-React) project. Returns a `[play]` tuple, just like the hook,
// so callers can write:  const [play] = useSound(src);
//
// `src` is any audio source string (URL or data-URI). Each play() clones the
// element so the chime can retrigger before a previous play has finished.
export function useSound(src, { volume = 1 } = {}) {
  let base = null;
  const play = () => {
    try {
      if (!base) { base = new Audio(src); base.volume = volume; base.preload = 'auto'; }
      const a = base.cloneNode();
      a.volume = volume;
      a.play().catch(() => {}); // ignore autoplay rejections (no user gesture yet)
    } catch (e) { /* audio unsupported — fail silently */ }
  };
  return [play];
}
