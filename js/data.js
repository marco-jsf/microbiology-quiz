// Chapter registry (one JSON per lecture, see data/schema.md).
// Add a chapter by dropping its JSON in /data and listing the filename here.
export const CHAPTER_FILES = [
  'vl01-neuroglia.json',
  'vl02-neurone.json',
  'vl03-energetik.json',
  'vl04-stammzellen.json',
  'vl05-entwicklung.json',
  'vl07-neurotransmitter.json',
  'vl08-gaba.json',
  'vl09-glutamat.json',
  'vl10-dopamin.json',
  'vl11-neuromodulatoren.json',
  'x-weitere-themen.json',
];

export async function loadChapters() {
  const results = await Promise.all(CHAPTER_FILES.map(async file => {
    const res = await fetch('data/' + file, { cache: 'no-cache' });
    if (!res.ok) { console.warn('Kapitel fehlt: data/' + file + ' (' + res.status + ')'); return null; }
    return res.json();
  }));
  const chapters = results.filter(Boolean);
  if (!chapters.length) throw new Error('Keine Kapitel gefunden (data/*.json).');
  return chapters;
}
