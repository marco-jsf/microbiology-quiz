// Chapter registry. Add a new chapter by dropping its JSON in /data and
// listing the filename here — no other code changes needed.
export const CHAPTER_FILES = [
  'bacteriology-general.json',
  'bacteriology-specific.json',
  'virology.json',
  // 'mycology.json',      // phase 3
  // 'parasitology.json',  // phase 3
];

export async function loadChapters() {
  const chapters = [];
  for (const file of CHAPTER_FILES) {
    const res = await fetch('data/' + file);
    if (!res.ok) throw new Error('Failed to load data/' + file + ' (' + res.status + ')');
    const ch = await res.json();
    chapters.push(ch);
  }
  return chapters;
}
