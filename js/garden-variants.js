// Rare colour variants of the garden birds: exactly three REAL colour forms per
// species (mutations / morphs such as Lutino or leucism, a clearly different
// plumage stage, or — where the species is only known to genus level — a close
// relative of that genus). They can only hatch from eggs.
//
// Each variant is drawn by an exact palette swap over all of the species'
// sprite sheets: every pixel whose colour is a key of `map` gets the value,
// every other colour stays as it is. A variant may instead name its own
// hand-drawn `sheet` (same frame tags as the species' sheet; single-file birds
// only), used as-is.
//
//   id      stored in the save (`birds[].variant`, `variantsSeen["<species>:<id>"]`)
//   name    German, shown on the hatch banner, the bird card and the Vogelbuch
//   tone    'pale' | 'dark' | 'color' — used to convert old saves (see LEGACY_TONE)
//   accent  the variant's signature colour (swatch frame, card chip)
//   fact    German, shown on the bird card of a bird in this variant
//   weight  relative draw weight when a variant is rolled (default 1)

export const SPECIES_VARIANTS = {
  pigeon: [   // Stadttaube
    // https://omia.org/OMIA001252/8932/ · https://omia.org/OMIA000357/8932/
    { id: 'white', name: 'Weiß', tone: 'pale', accent: '#f4f5f7',
      fact: 'Rezessiv Weiß: Durch eine Mutation im Gen EDNRB2 fehlen Federn und Iris die Pigmentzellen – das Auge wirkt deshalb dunkel.',
      map: { '#d3d8e4': '#ffffff', '#c3c9d7': '#f3f4f7', '#b9bccc': '#e7e8ee', '#9e9cb0': '#d2d3dc',
        '#646271': '#c6c7d1', '#44434c': '#aeafbb', '#67626f': '#eceef2', '#25242d': '#d4d5dd',
        '#302f37': '#dcb8a8', '#c66942': '#2e1f1c', '#eea667': '#4d342d', '#21765f': '#e2e4ea',
        '#369680': '#eff0f4', '#88397b': '#e6e7ed', '#732466': '#d6d8e0', '#794c75': '#dcdee5' } },
    // https://phys.org/news/2014-03-urban-birds-darker-feathers-metal.html · https://hal.inrae.fr/hal-02637453
    { id: 'black', name: 'Schwarz', tone: 'dark', accent: '#3a3944',
      fact: 'Der dominante Spread-Faktor verteilt schwarzes Eumelanin über das ganze Gefieder – die Flügelbinden verschwinden.',
      map: { '#d3d8e4': '#5c5b68', '#c3c9d7': '#4e4d5a', '#b9bccc': '#45444f', '#9e9cb0': '#383742',
        '#646271': '#2e2d36', '#44434c': '#25242b', '#67626f': '#42414c', '#25242d': '#1d1c22', '#302f37': '#1f1e24' } },
    // https://phys.org/news/2014-02-birds-major-genes-feather-hue.html · https://pigeoncote.com/genetics/slide2.html
    { id: 'ashred', name: 'Rotfahl', tone: 'color', accent: '#b0493c',
      fact: 'Rotfahl: Eine dominante, geschlechtsgebundene Mutation im Gen TYRP1 lässt statt schwarzem vor allem rötliches Phäomelanin entstehen.',
      map: { '#d3d8e4': '#ebe4e2', '#c3c9d7': '#ddd2d0', '#b9bccc': '#cfc3c0', '#9e9cb0': '#b3a5a2',
        '#646271': '#a63f33', '#44434c': '#8c4e47', '#67626f': '#bf9e99', '#25242d': '#8f6c69',
        '#302f37': '#d8bba9', '#21765f': '#9a4a66', '#369680': '#bc6f8b', '#88397b': '#a8476b',
        '#732466': '#86334f', '#794c75': '#95566f' } },
  ],
  sparrow: [   // Haussperling
    // https://zbc.uz.zgora.pl/repozytorium/Content/74566/download · https://nabu-naturgucker.de/wp-content/uploads/2023/03/Nng-kongress18-Zedler-Farbabweichungen_Voegel.pdf
    { id: 'leucistic', name: 'Weiß', tone: 'pale', accent: '#f4efe8',
      fact: 'Leuzismus: Die Pigmentzellen erreichen im Embryo die Haut nicht, das Gefieder bleibt weiß. Die Augen sind normal dunkel.',
      map: { '#312d2c': '#c4bab3', '#6b4d39': '#d9d0c8', '#846555': '#e2dad3', '#a08070': '#ece6e0',
        '#a09795': '#e6e0dc', '#c7b7b3': '#f4f0ed', '#dfd4d3': '#ffffff', '#996666': '#ead2a8',
        '#714040': '#c4a274', '#b38e48': '#e6d49a' } },
    // https://zbc.uz.zgora.pl/repozytorium/Content/74566/download · https://nautil.us/red_eyed-magpies-white_speckled-ravens-other-birds-of-unusual-feathers-235549
    { id: 'cinnamon', name: 'Zimt', tone: 'color', accent: '#c49a6c',
      fact: 'Häufigste erbliche Farbmutation des Spatzen: Eumelanin wird nicht vollständig oxidiert, Schwarz wirkt braun („Zimt“).',
      map: { '#312d2c': '#86644a', '#6b4d39': '#a47a56', '#846555': '#b08a68', '#a08070': '#c6a27e',
        '#a09795': '#cbb7a2', '#c7b7b3': '#e2d4c4', '#dfd4d3': '#f2ebe0', '#996666': '#b88a84',
        '#714040': '#8e5c56', '#b38e48': '#c9a865' } },
    // https://zbc.uz.zgora.pl/repozytorium/Content/74566/download · https://nautil.us/red_eyed-magpies-white_speckled-ravens-other-birds-of-unusual-feathers-235549
    { id: 'melanistic', name: 'Melanistisch', tone: 'dark', accent: '#352725',
      fact: 'Melanismus: zu viel Melanin. Bei manchen Spatzen dehnt sich der schwarze Kehllatz über die ganze Unterseite aus.',
      map: { '#a09795': '#2c2726', '#c7b7b3': '#423c3a', '#6b4d39': '#653c24', '#a08070': '#98663f',
        '#312d2c': '#221a17' } },
  ],
  crow: [   // Krähe
    // https://nabu-naturgucker.de/wp-content/uploads/2023/03/Nng-kongress18-Zedler-Farbabweichungen_Voegel.pdf · https://www.wildlifeinsight.com/5109/leucistic-uk-birds-carrion-crow/
    { id: 'leucistic', name: 'Weiß', tone: 'pale', accent: '#f4f4f4',
      fact: 'Leuzismus: Die Pigmentzellen erreichen im Embryo die Haut nicht – Gefieder weiß, die Augen aber dunkel (ein Albino hätte rote).',
      map: { '#121626': '#b7aeab', '#151a2d': '#d3a59b', '#1d2439': '#d4d2d4', '#2b3752': '#e6e5e6',
        '#47536e': '#f3f2f2', '#5c6987': '#ffffff' } },
    // https://seabirdgroup.org.uk/seabird-24-33 · https://zbc.uz.zgora.pl/repozytorium/Content/74566/download
    { id: 'brown', name: 'Braun', tone: 'color', accent: '#7a5638',
      fact: 'Braun-Mutation: Eumelanin wird nicht vollständig oxidiert, aus Schwarz wird Schokobraun, das in der Sonne stark ausbleicht.',
      map: { '#121626': '#3a2a20', '#151a2d': '#4c382c', '#1d2439': '#56402e', '#2b3752': '#74563c',
        '#47536e': '#937154', '#5c6987': '#b08e6e' } },
    // https://zbc.uz.zgora.pl/repozytorium/Content/74566/download · https://nautil.us/red_eyed-magpies-white_speckled-ravens-other-birds-of-unusual-feathers-235549
    { id: 'pastel', name: 'Pastell', tone: 'color', accent: '#8b8f98',
      fact: 'Verdünnung: Die Federn enthalten weniger Melaninkörnchen – wie bei einem grob gerasterten Druck wirkt Schwarz dann silbergrau.',
      map: { '#121626': '#383b42', '#151a2d': '#474a52', '#1d2439': '#53575f', '#2b3752': '#6e727b',
        '#47536e': '#8b8f98', '#5c6987': '#a9adb5' } },
  ],
  dove: [   // Türkentaube
    // https://www.bto.org/our-science/projects/gbw/gardens-wildlife/garden-birds/behaviour/plumage/leucism · https://sitkanature.org/photojournal/2015/04/16
    { id: 'leucistic', name: 'Weiß', tone: 'pale', accent: '#f6f4f1',
      fact: 'Leuzismus: Den Federfollikeln fehlen Pigmentzellen, sogar der Nackenring bleibt weiß. Die Augen behalten ihre normale rote Farbe.',
      map: { '#e9d5c6': '#ffffff', '#d5c0a9': '#f4f2ee', '#beaa90': '#e6e2dc', '#ac987c': '#d6d1c9',
        '#5a524b': '#cbc5bd', '#413932': '#b8b1a8', '#555151': '#b5a49c', '#47516e': '#e4e0da',
        '#656f8c': '#ebe8e3', '#7f8baf': '#f2f0ec' } },
    // https://agris.fao.org/search/en/records/65df053f0f3e94b9e5d421cd · https://bioone.org/journals/bulletin-of-the-british-ornithologists-club/volume-142/issue-2/bboc.v142i2.2022.a3/The-colourful-journey-of-the-Eurasian-Collared-Dove-Streptopelia-decaocto/10.25226/bboc.v142i2.2022.a3.full
    { id: 'cream', name: 'Cremefarben', tone: 'color', accent: '#e9c890',
      fact: 'Cremefarbene Türkentauben gehen wohl oft auf Kreuzungen mit der eng verwandten, domestizierten Lachtaube zurück.',
      map: { '#e9d5c6': '#fdf3df', '#d5c0a9': '#f4e2bf', '#beaa90': '#e7cfa5', '#ac987c': '#d4b68a',
        '#5a524b': '#bf9f78', '#413932': '#a6855f' } },
    // https://biostor.org/reference/262241 · https://feederwatch.org/unusual-birds/dark-colored-eurasian-collared-dove/
    { id: 'melanistic', name: 'Melanistisch', tone: 'dark', accent: '#4a4644',
      fact: 'Melanismus ist bei Türkentauben extrem selten: 2001 wurde in Marokko ein fast völlig schwarzes Tier beobachtet.',
      map: { '#e9d5c6': '#787472', '#d5c0a9': '#625e5c', '#beaa90': '#55514f', '#ac987c': '#474341',
        '#5a524b': '#2d2a29', '#413932': '#232020', '#555151': '#252322', '#47516e': '#1d1b1c',
        '#656f8c': '#262425', '#7f8baf': '#302d2e' } },
  ],
  peacock: [   // Pfau
    // https://www.omia.org/OMIA000375/9049 · https://en.wikipedia.org/wiki/Indian_peafowl
    { id: 'white', name: 'Weiß', tone: 'pale', accent: '#f4f3ee',
      fact: 'Weiße Pfauen sind leuzistisch, keine Albinos: Ein defektes EDNRB2-Gen stört die Wanderung der Pigmentzellen, die Augen bleiben dunkel.',
      map: { '#5b85b4': '#ffffff', '#325b9a': '#e7eaef', '#183877': '#bfc6d2', '#9aadd9': '#ffffff',
        '#bda06b': '#fdfcf7', '#ad8553': '#efede6', '#9b6a45': '#dedbd2', '#584130': '#c9c5bc',
        '#372d26': '#aaa69f', '#8dbe4c': '#ffffff', '#78a63a': '#f2f2ed', '#5b9a33': '#e3e3dd',
        '#5f852d': '#d8d8d1', '#51802a': '#cdcdc6', '#496822': '#b5b5ae', '#e9c455': '#fffdf2',
        '#708ab2': '#e9e9ee', '#485c85': '#cfd1d9', '#eb78a2': '#eda3b6' } },
    // https://bioone.org/journals/bulletin-of-the-british-ornithologists-club/volume-143/issue-1/bboc.v143i1.2023.a7/The-taxonomic-history-of-Black-shouldered-Peafowl-with-Darwins-help/10.25226/bboc.v143i1.2023.a7.full · https://en.wikipedia.org/wiki/Indian_peafowl
    { id: 'blackwing', name: 'Schwarzflügel', tone: 'dark', accent: '#1f3440',
      fact: 'Rezessive Mutation: Schultern und Flügel glänzend schwarz statt gebändert. Darwin erkannte sie als Varietät, nicht als eigene Art.',
      map: { '#bda06b': '#3d6a73', '#ad8553': '#2a4a57', '#9b6a45': '#1d323f', '#584130': '#131d26',
        '#372d26': '#0c1117' } },
    // https://browfarm.co.uk/peafowl/peafowl-varieties/indian-blue-pied-peacock/ · https://www.omia.org/OMIA000375/9049
    { id: 'pied', name: 'Schecke', tone: 'color', accent: '#4f7fc0',
      fact: 'Gescheckte Pfauen sind teilweise leuzistisch: In manche Federfollikel wandern keine Pigmentzellen ein – jedes Muster ist anders.',
      map: { '#bda06b': '#ffffff', '#ad8553': '#f0efea', '#9b6a45': '#dcd9d2', '#584130': '#c7c3bb',
        '#372d26': '#a39f98', '#78a63a': '#f8f8f4' } },
  ],
  cockatiel: [   // Nymphensittich
    // https://en.wikipedia.org/wiki/Lutino_cockatiel · https://en.wikipedia.org/wiki/Cockatiel_colour_genetics
    { id: 'lutino', name: 'Lutino', tone: 'pale', accent: '#fff2a6',
      fact: 'Dem Lutino fehlt das dunkle Eumelanin, die gelben Psittacofulvine bleiben: gelbes Gefieder, orange Wangen, rote Augen.',
      sheet: 'assets/birds/cockatiel/Cockatiel-Lutino.json' },
    // https://en.wikipedia.org/wiki/White-faced_cockatiel · https://en.wikipedia.org/wiki/Cockatiel_colour_genetics
    { id: 'whiteface', name: 'Weißkopf', tone: 'color', accent: '#f4f4f2',
      fact: 'Beim Weißkopf fehlen die gelben und orangen Psittacofulvine – übrig bleiben Grau und Weiß, ganz ohne Wangenfleck.',
      map: { '#f2d03b': '#f5f4f0', '#d4a92a': '#cbc9c6', '#e7782d': '#e9e8e4', '#f1efe8': '#f8f8f8',
        '#cfccc4': '#d3d3d5' } },
    // https://en.wikipedia.org/wiki/Cockatiel_colour_genetics
    { id: 'cinnamon', name: 'Zimt', tone: 'color', accent: '#a58b73',
      fact: 'Bei Zimt bleibt das Eumelanin im braunen Stadium stehen, statt schwarz zu werden – das Grau wirkt warm braun.',
      map: { '#000000': '#2a1d14', '#434146': '#5b4535', '#5a585d': '#725a47', '#6f6d73': '#8a705a',
        '#8a888e': '#a58b73', '#aeacb0': '#c6ae96', '#f1efe8': '#f4ede0', '#cfccc4': '#d6cab8' } },
  ],
  flamingo: [   // Flamingo
    // https://en.wikipedia.org/wiki/Greater_flamingo · https://birdsoftheworld.org/bow/species/grefla3/cur/identification
    { id: 'juvenile', name: 'Jungvogel', tone: 'pale', accent: '#ada093',
      fact: 'Junge Flamingos tragen ein graubraunes Jugendkleid. Das volle Rosa zeigen die meisten erst mit etwa vier Jahren.',
      map: { '#f0a2a2': '#d6cdc2', '#e28074': '#ada093', '#c85050': '#786a61', '#962340': '#5a4e48',
        '#ded2c3': '#b4b8bc', '#ebe6db': '#d2d4d6' } },
    // https://en.wikipedia.org/wiki/American_flamingo · https://www.smithsonianmag.com/science-nature/for-some-species-you-really-are-what-you-eat-40747423/
    { id: 'cuba', name: 'Kubaflamingo', tone: 'color', accent: '#f45e42',
      fact: 'Der Kubaflamingo gilt als farbkräftigster Flamingo: Carotinoide aus der Nahrung baut er zu rotem Canthaxanthin um.',
      map: { '#f0a2a2': '#ff8f6c', '#e28074': '#f45e42', '#c85050': '#c8343a', '#962340': '#8a2036',
        '#ded2c3': '#ecbcb2', '#ebe6db': '#f8dcd4' } },
    // https://biodiversitycyprus.blogspot.com/2015/07/rare-black-flamingo-phoenicopterus.html · https://www.nationalgeographic.com/animals/article/150417-black-flamingo-cyprus-birds-genetics-animals-science
    { id: 'melanistic', name: 'Schwarz', tone: 'dark', accent: '#463a38',
      fact: 'Melanismus: Zu viel Melanin färbt das Gefieder schwarz. Berühmt ist „Melani“, ein schwarzer Rosaflamingo, seit 2015 auf Zypern.',
      map: { '#f0a2a2': '#625450', '#e28074': '#463a38', '#c85050': '#94465a', '#962340': '#6a2e3e' } },
  ],
  kiwi: [   // Kiwi
    // https://en.wikipedia.org/wiki/Manukura_(kiwi · https://phys.org/news/2011-07-rare-white-bird-nz-kiwis.html
    { id: 'leucistic', name: 'Weiß', tone: 'pale', accent: '#f6f3ec',
      fact: 'Manukura, 2011 in Pūkaha geschlüpft, war ein weißer Kiwi: leuzistisch, kein Albino – seine Augen blieben dunkel.',
      map: { '#2a2322': '#3a312d', '#6a5133': '#cfc8bb', '#8f7343': '#e3ded3', '#a39056': '#f6f3ec',
        '#b19b56': '#e8d6bf', '#79643f': '#c9a596' } },
    // https://nzbirdsonline.org.nz/species/great-spotted-kiwi · https://de.wikipedia.org/wiki/Haastkiwi
    { id: 'haast', name: 'Haastkiwi', tone: 'color', accent: '#887e76',
      fact: 'Der Haastkiwi (Großer Fleckenkiwi) ist graubraun und hell quergebändert. Er lebt im Nordwesten der Südinsel Neuseelands.',
      map: { '#6a5133': '#615953', '#8f7343': '#887e76', '#a39056': '#c4bcb0', '#b19b56': '#d9cfb6',
        '#79643f': '#4a423d' } },
    // https://nzbirdsonline.org.nz/species/southern-brown-kiwi · https://de.wikipedia.org/wiki/Streifenkiwi
    { id: 'tokoeka', name: 'Tokoeka', tone: 'dark', accent: '#8e522d',
      fact: 'Der Tokoeka (Südstreifenkiwi) ist bei Haast rotbraun, in Fiordland und auf Stewart Island braun bis dunkelbraun.',
      map: { '#6a5133': '#45281a', '#8f7343': '#6b3c22', '#a39056': '#8e522d', '#b19b56': '#e0d3ae',
        '#79643f': '#c2a487' } },
  ],
  shoebill: [   // Schuhschnabel
    // https://en.wikipedia.org/wiki/Shoebill · https://de.wikipedia.org/wiki/Schuhschnabel
    { id: 'juvenile', name: 'Jungvogel', tone: 'dark', accent: '#7a6a5c',
      fact: 'Junge Schuhschnäbel sind dunkler grau mit bräunlichem Anflug, ihr Schnabel ist noch rosa.',
      map: { '#9cb6d0': '#948a80', '#7e95bb': '#776c62', '#607da9': '#5e544b', '#44567e': '#463e37',
        '#31436c': '#37302b', '#e7ccbe': '#e2c4b6', '#d49e90': '#c99486' } },
    // https://animaldiversity.org/accounts/Balaeniceps_rex/ · https://www.oiseaux-birds.com/card-shoebill.html
    { id: 'adult', name: 'Schiefergrau', tone: 'color', accent: '#8a9bb0',
      fact: 'Altvögel sind schiefer- bis blaugrau; der bis zu 24 cm lange Schnabel ist oft gelblich bis hornfarben mit dunklen Flecken.',
      map: { '#9cb6d0': '#a7b2bf', '#7e95bb': '#8592a3', '#607da9': '#677488', '#44567e': '#464e5b',
        '#31436c': '#353b45', '#e7ccbe': '#e5d49a', '#d49e90': '#a89872' } },
    // https://en.wikipedia.org/wiki/Shoebill · https://animaldiversity.org/accounts/Balaeniceps_rex/
    { id: 'chick', name: 'Dunenküken', tone: 'pale', accent: '#d9dee2',
      fact: 'Frisch geschlüpfte Schuhschnäbel tragen ein seidiges, silbergraues Dunenkleid; ihr Schnabel ist anfangs noch grau.',
      map: { '#9cb6d0': '#d9dee2', '#7e95bb': '#bdc4ca', '#607da9': '#a0a9b1', '#44567e': '#60676e',
        '#31436c': '#4d5258', '#e7ccbe': '#b3b8be', '#d49e90': '#8a9097' } },
  ],
  toucan: [   // Tukan
    // https://de.wikipedia.org/wiki/Fischertukan · https://en.wikipedia.org/wiki/Keel-billed_toucan
    { id: 'keelbilled', name: 'Fischertukan', tone: 'color', accent: '#8fc23a',
      fact: 'Der Fischertukan, Nationalvogel von Belize: grüner Schnabel mit orangem Fleck und roter Spitze – daher auch „Regenbogentukan“.',
      map: { '#e6b634': '#e8c838', '#d78c13': '#8fc23a', '#d4641d': '#ee8a1e', '#48413f': '#7d3048',
        '#e9e3d6': '#f8e44c', '#ded2c3': '#f0cc2c', '#c8b6a9': '#cfa024' } },
    // https://de.wikipedia.org/wiki/Wei%C3%9Fbrusttukan · https://en.wikipedia.org/wiki/White-throated_toucan
    { id: 'whitethroated', name: 'Weißbrusttukan', tone: 'color', accent: '#8a3328',
      fact: 'Der Weißbrusttukan lebt im Amazonasbecken. Bei der Nominatform ist der Schnabel rotbraun mit gelbem First, bei Männchen länger.',
      map: { '#e6b634': '#c4cc4a', '#d78c13': '#8a3328', '#d4641d': '#5e2230', '#e9e3d6': '#f6f3ec',
        '#ded2c3': '#e6e0d6', '#c8b6a9': '#c6bdb3' } },
    // https://de.wikipedia.org/wiki/Dottertukan · https://datazone.birdlife.org/species/factsheet/ariel-toucan-ramphastos-ariel
    { id: 'ariel', name: 'Arieltukan', tone: 'dark', accent: '#f2a224',
      fact: 'Der Arieltukan aus Brasilien hat eine goldorange Kehle und einen schwarzen Schnabel mit gelber Basis.',
      map: { '#e6b634': '#5a5255', '#d78c13': '#423a3d', '#d4641d': '#eab032', '#48413f': '#625a5d',
        '#e9e3d6': '#fcc440', '#ded2c3': '#f2a224', '#c8b6a9': '#c8781c' } },
  ],
  macaw: [   // Blauer Ara
    // https://en.wikipedia.org/wiki/Hyacinth_macaw · https://de.wikipedia.org/wiki/Anodorhynchus
    { id: 'hyacinth', name: 'Hyazinthara', tone: 'color', accent: '#3d4fb8',
      fact: 'Der größte flugfähige Papagei. Sein Blau ist Strukturfarbe: Keratin streut blaues Licht, Melanin darunter schluckt den Rest.',
      map: { '#314879': '#3646a8', '#223467': '#262e82', '#486a94': '#5871cc', '#1a1c5b': '#1b1a5e',
        '#d0b10b': '#f7d51e', '#bc7105': '#e2a40e' } },
    // https://de.wikipedia.org/wiki/Anodorhynchus · https://www.parrots.org/encyclopedia/lears-macaw
    { id: 'lear', name: 'Lear-Ara', tone: 'color', accent: '#2f6d90',
      fact: 'Benannt nach dem Maler Edward Lear. Wildvögel fand Helmut Sick erst 1978 in Bahia, wo sie in Sandsteinklippen brüten.',
      map: { '#314879': '#2a5c84', '#223467': '#1d4166', '#486a94': '#4b8aa8', '#1a1c5b': '#142d50',
        '#d0b10b': '#f1dc7e', '#bc7105': '#e39a2e' } },
    // https://en.wikipedia.org/wiki/Glaucous_macaw · https://de.wikipedia.org/wiki/Anodorhynchus
    { id: 'glaucous', name: 'Meerblauer Ara', tone: 'pale', accent: '#93c1c3',
      fact: 'Blass türkisblau mit grauem Kopf. In freier Wildbahn zuletzt sicher im 19. Jahrhundert belegt, gilt er als wahrscheinlich ausgestorben.',
      map: { '#314879': '#6a9ba6', '#223467': '#4c7887', '#486a94': '#97c3c4', '#1a1c5b': '#36596a',
        '#d0b10b': '#ecc72a', '#bc7105': '#cc9512' } },
  ],
};

// Before 2026-11 every species could hatch in the same five fantasy colours.
// Saves that still hold one are converted on load to the species' variant of
// the matching tone (see resolveVariantId).
export const LEGACY_TONE = { white: 'pale', night: 'dark', gold: 'color', rose: 'color', mint: 'color' };

export function variantsOf(species) { return SPECIES_VARIANTS[species] || []; }
export function variantFor(species, id) { return id ? variantsOf(species).find(v => v.id === id) : undefined; }
export function variantCount() { return Object.values(SPECIES_VARIANTS).reduce((n, vs) => n + vs.length, 0); }

// The current variant id for a stored one: itself when the species has it, the
// converted old fantasy colour for a legacy id, and anything else unchanged
// (never throw data away). A legacy id goes to the species' first variant of
// the same tone; when there is none, to its LAST 'color' variant (the first one
// already takes gold/rose/mint), so old finds spread over as many variants as
// possible. Deterministic, so a stale old-build tab's writes convert the same way.
export function resolveVariantId(species, id) {
  const vs = variantsOf(species);
  if (!id || !vs.length || vs.some(v => v.id === id)) return id;
  const tone = LEGACY_TONE[id];
  if (!tone) return id;
  const colors = vs.filter(v => v.tone === 'color');
  return (vs.find(v => v.tone === tone) || colors[colors.length - 1] || vs[0]).id;
}
