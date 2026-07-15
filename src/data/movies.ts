export type MoodTag = 'Intense' | 'Feel-Good' | 'Mind-Bender' | 'Emotional' | 'Easy Watch' | 'Edge of Seat' | 'Epic' | 'Award-Worthy' | 'Dark & Gritty' | 'Lighthearted';

export const MOOD_TAGS: MoodTag[] = [
  'Intense',
  'Feel-Good',
  'Mind-Bender',
  'Emotional',
  'Easy Watch',
  'Edge of Seat',
  'Epic',
  'Award-Worthy',
  'Dark & Gritty',
  'Lighthearted',
];

export const MOOD_EMOJI: Record<MoodTag, string> = {
  'Intense': '🔥',
  'Feel-Good': '☀️',
  'Mind-Bender': '🤯',
  'Emotional': '💔',
  'Easy Watch': '🍿',
  'Edge of Seat': '⚡',
  'Epic': '🏆',
  'Award-Worthy': '🌟',
  'Dark & Gritty': '🌑',
  'Lighthearted': '🦋',
};

export const MOOD_DESCRIPTION: Record<MoodTag, string> = {
  'Intense': 'High-energy, gripping, and pulse-pounding',
  'Feel-Good': 'Uplifting, warm, and leaves you smiling',
  'Mind-Bender': 'Complex plots that make you think',
  'Emotional': 'Deep feels, tears, and heartfelt moments',
  'Easy Watch': 'Relaxed, fun, and effortless viewing',
  'Edge of Seat': 'Suspenseful, thrilling, and unpredictable',
  'Epic': 'Grand scale, sweeping stories, and spectacle',
  'Award-Worthy': 'Critically acclaimed with standout craft',
  'Dark & Gritty': 'Raw, intense, and morally complex',
  'Lighthearted': 'Playful, cheerful, and carefree',
};

export interface Movie {
  id: string;
  title: string;
  slug: string;
  thumbnail: string;
  rating: number;
  description: string;
  releaseYear: number;
  region: MovieRegion;
  genres: string[];
  ottPlatforms: OTTPlatform[];
  isTop10?: boolean;
  rank?: number;
  imdbId?: string;
  imdbUrl?: string;
  rtUrl?: string;
  rtTomatometer?: number;
  rtAudienceScore?: number;
  rtCertification?: string;
  watchScore?: number;
  moodTags?: MoodTag[];
}

export interface OTTPlatform {
  name: string;
  logo: string;
  url: string;
}

export const GENRES = [
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Music',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Thriller',
  'War',
  'Western',
];

export const REGIONS = [
  'Bollywood',
  'Hollywood',
  'Tollywood',
  'Kollywood',
  'Mollywood',
  'Sandalwood',
  'Bengali',
  'Marathi',
  'Punjabi',
  'Gujarati',
] as const;

export type MovieRegion = (typeof REGIONS)[number];

export const OTT_PLATFORMS: OTTPlatform[] = [
  { name: 'Netflix', logo: '/icons/netflix.svg', url: 'https://netflix.com' },
  { name: 'Prime Video', logo: '/icons/prime.svg', url: 'https://primevideo.com' },
  { name: 'Disney+', logo: '/icons/disney.svg', url: 'https://disneyplus.com' },
  { name: 'Hotstar', logo: '/icons/hotstar.svg', url: 'https://hotstar.com' },
  { name: 'JioCinema', logo: '/icons/jio.svg', url: 'https://jiocinema.com' },
  { name: 'Zee5', logo: '/icons/zee5.svg', url: 'https://zee5.com' },
];

export const movies: Movie[] = [
  {
    id: '1',
    title: 'Interstellar',
    slug: 'interstellar',
    thumbnail: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6vCU67oYvOXgx.jpg',
    rating: 8.7,
    description: 'The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.',
    releaseYear: 2014,
    region: 'Hollywood',
    genres: ['Sci-Fi', 'Drama'],
    ottPlatforms: [OTT_PLATFORMS[0], OTT_PLATFORMS[1]],
    isTop10: true,
    rank: 1,
    imdbId: 'tt0816692',
    imdbUrl: 'https://www.imdb.com/title/tt0816692',
    rtUrl: 'https://www.rottentomatoes.com/search?search=Interstellar',
    watchScore: 92,
    moodTags: ['Mind-Bender', 'Emotional', 'Epic']
  },
  {
    id: '2',
    title: 'Dangal',
    slug: 'dangal',
    thumbnail: 'https://image.tmdb.org/t/p/w500/jLiA1WW3kL1K9lYfYmVj57RD74N.jpg',
    rating: 8.3,
    description: 'Former wrestler Mahavir Singh Phogat and his two wrestler daughters struggle towards glory at the Commonwealth Games in the face of societal oppression.',
    releaseYear: 2016,
    region: 'Bollywood',
    genres: ['Drama', 'Action'],
    ottPlatforms: [OTT_PLATFORMS[3], OTT_PLATFORMS[0]],
    isTop10: true,
    rank: 2,
    imdbId: 'tt5074352',
    imdbUrl: 'https://www.imdb.com/title/tt5074352',
    rtUrl: 'https://www.rottentomatoes.com/search?search=Dangal',
    watchScore: 88,
    moodTags: ['Emotional', 'Award-Worthy', 'Intense']
  },
  {
    id: '3',
    title: 'RRR',
    slug: 'rrr',
    thumbnail: 'https://image.tmdb.org/t/p/w500/nEufeBUIUobIwi99J9o9YenIeoC.jpg',
    rating: 7.8,
    description: 'A fictitious story about two legendary revolutionaries and their journey away from home before they started fighting for their country in 1920s.',
    releaseYear: 2022,
    region: 'Tollywood',
    genres: ['Action', 'Drama'],
    ottPlatforms: [OTT_PLATFORMS[0], OTT_PLATFORMS[4]],
    isTop10: true,
    rank: 3,
    imdbId: 'tt8178634',
    imdbUrl: 'https://www.imdb.com/title/tt8178634',
    rtUrl: 'https://www.rottentomatoes.com/search?search=RRR',
    watchScore: 84,
    moodTags: ['Epic', 'Intense', 'Emotional']
  },
  {
    id: '4',
    title: 'The Dark Knight',
    slug: 'the-dark-knight',
    thumbnail: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDr9p1vJJbrN9RPLiun.jpg',
    rating: 9.0,
    description: 'When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.',
    releaseYear: 2008,
    region: 'Hollywood',
    genres: ['Action', 'Crime', 'Drama'],
    ottPlatforms: [OTT_PLATFORMS[0], OTT_PLATFORMS[2]],
    isTop10: true,
    rank: 4,
    imdbId: 'tt0468569',
    imdbUrl: 'https://www.imdb.com/title/tt0468569',
    rtUrl: 'https://www.rottentomatoes.com/search?search=The+Dark+Knight',
    watchScore: 95,
    moodTags: ['Dark & Gritty', 'Intense', 'Award-Worthy']
  },
  {
    id: '5',
    title: 'Pushpa: The Rise',
    slug: 'pushpa-the-rise',
    thumbnail: 'https://image.tmdb.org/t/p/w500/oaRk2HgOirEeNuDCwwScmq7rKvS.jpg',
    rating: 7.6,
    description: 'Violence erupts between red sandal smugglers and the police in the Seshachalam forests of South India.',
    releaseYear: 2021,
    region: 'Tollywood',
    genres: ['Action', 'Thriller'],
    ottPlatforms: [OTT_PLATFORMS[1]],
    isTop10: true,
    rank: 5,
    imdbId: 'tt9389998',
    imdbUrl: 'https://www.imdb.com/title/tt9389998',
    rtUrl: 'https://www.rottentomatoes.com/search?search=Pushpa+The+Rise',
    watchScore: 80,
    moodTags: ['Intense', 'Edge of Seat', 'Dark & Gritty']
  },
  {
    id: '6',
    title: 'Lagaan',
    slug: 'lagaan',
    thumbnail: 'https://image.tmdb.org/t/p/w500/yNX9lFRAFeNLNRIXdqZK9gYrYKa.jpg',
    rating: 8.1,
    description: 'In 1890s India, an arrogant British officer challenges the people of Champaner to a game of cricket in an attempt to avoid paying the taxes they owe.',
    releaseYear: 2001,
    region: 'Bollywood',
    genres: ['Drama', 'Comedy'],
    ottPlatforms: [OTT_PLATFORMS[0]],
    isTop10: true,
    rank: 6,
    imdbId: 'tt0169102',
    imdbUrl: 'https://www.imdb.com/title/tt0169102',
    rtUrl: 'https://www.rottentomatoes.com/search?search=Lagaan',
    watchScore: 78,
    moodTags: ['Feel-Good', 'Emotional', 'Epic']
  },
  {
    id: '7',
    title: 'Bahubali: The Beginning',
    slug: 'bahubali-the-beginning',
    thumbnail: 'https://image.tmdb.org/t/p/w500/9BAjt8nSSms62uOVYn1t3C3dVto.jpg',
    rating: 8.0,
    description: 'In ancient India, an adventurous and daring man becomes involved in a decades-old feud between two warring people.',
    releaseYear: 2015,
    region: 'Tollywood',
    genres: ['Action', 'Drama'],
    ottPlatforms: [OTT_PLATFORMS[3], OTT_PLATFORMS[0]],
    isTop10: true,
    rank: 7,
    imdbId: 'tt2631186',
    imdbUrl: 'https://www.imdb.com/title/tt2631186',
    rtUrl: 'https://www.rottentomatoes.com/search?search=Bahubali+The+Beginning',
    watchScore: 85,
    moodTags: ['Epic', 'Intense', 'Feel-Good']
  },
  {
    id: '8',
    title: '3 Idiots',
    slug: '3-idiots',
    thumbnail: 'https://image.tmdb.org/t/p/w500/66A9MqXOyVFCssoloscw79z8Tew.jpg',
    rating: 8.4,
    description: 'Two friends are searching for their long lost companion. They revisit their college days and recall the memories of their friend who inspired them to think differently, even as the rest of the world called them "idiots".',
    releaseYear: 2009,
    region: 'Bollywood',
    genres: ['Comedy', 'Drama'],
    ottPlatforms: [OTT_PLATFORMS[0], OTT_PLATFORMS[1]],
    isTop10: true,
    rank: 8,
    imdbId: 'tt1187043',
    imdbUrl: 'https://www.imdb.com/title/tt1187043',
    rtUrl: 'https://www.rottentomatoes.com/search?search=3+Idiots',
    watchScore: 84,
    moodTags: ['Feel-Good', 'Emotional', 'Easy Watch']
  },
  {
    id: '9',
    title: 'Spider-Man: Across the Spider-Verse',
    slug: 'spider-man-across-the-spider-verse',
    thumbnail: 'https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg',
    rating: 8.6,
    description: 'Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People charged with protecting its very existence.',
    releaseYear: 2023,
    region: 'Hollywood',
    genres: ['Animation', 'Action', 'Sci-Fi'],
    ottPlatforms: [OTT_PLATFORMS[0]],
    isTop10: true,
    rank: 9,
    imdbId: 'tt9362722',
    imdbUrl: 'https://www.imdb.com/title/tt9362722',
    rtUrl: 'https://www.rottentomatoes.com/search?search=Spider-Man+Across+the+Spider-Verse',
    watchScore: 91,
    moodTags: ['Mind-Bender', 'Epic', 'Lighthearted']
  },
  {
    id: '10',
    title: 'K.G.F: Chapter 1',
    slug: 'kgf-chapter-1',
    thumbnail: 'https://image.tmdb.org/t/p/w500/ltHlJwvxKv7d0ooCiKSAvfwV9tX.jpg',
    rating: 8.2,
    description: 'Rocky, a young man, seeks power and wealth in order to fulfill a promise to his dying mother. His quest takes him to Mumbai, where he becomes involved with the notorious gold mafia.',
    releaseYear: 2018,
    region: 'Tollywood',
    genres: ['Action', 'Drama'],
    ottPlatforms: [OTT_PLATFORMS[1]],
    isTop10: true,
    rank: 10,
    imdbId: 'tt7838252',
    imdbUrl: 'https://www.imdb.com/title/tt7838252',
    rtUrl: 'https://www.rottentomatoes.com/search?search=KGF+Chapter+1',
    watchScore: 82,
    moodTags: ['Intense', 'Dark & Gritty', 'Epic']
  },
  {
    id: '11',
    title: 'Dilwale Dulhania Le Jayenge',
    slug: 'dilwale-dulhania-le-jayenge',
    thumbnail: 'https://image.tmdb.org/t/p/w500/u3pM9bHh2Z6v1e36H8j2V6sWkZq.jpg',
    rating: 8.0,
    description: 'A young man and a young woman fall in love while on a vacation in Europe, but they must overcome traditional obstacles.',
    releaseYear: 1995,
    region: 'Bollywood',
    genres: ['Romance', 'Drama'],
    ottPlatforms: [OTT_PLATFORMS[0], OTT_PLATFORMS[3]],
    isTop10: false,
    imdbId: 'tt0112870',
    imdbUrl: 'https://www.imdb.com/title/tt0112870',
    rtUrl: 'https://www.rottentomatoes.com/search?search=Dilwale+Dulhania+Le+Jayenge',
    watchScore: 72,
    moodTags: ['Emotional', 'Feel-Good', 'Lighthearted']
  },
  {
    id: '12',
    title: 'Magadheera',
    slug: 'magadheera',
    thumbnail: 'https://image.tmdb.org/t/p/w500/u3pM9bHh2Z6v1e36H8j2V6sWkZq.jpg',
    rating: 7.7,
    description: 'A man is reincarnated after being killed by a jealous rival, and he seeks to reunite with his lover and fulfill his destiny.',
    releaseYear: 2009,
    region: 'Tollywood',
    genres: ['Action', 'Romance'],
    ottPlatforms: [OTT_PLATFORMS[1]],
    isTop10: false,
    imdbId: 'tt1320259',
    imdbUrl: 'https://www.imdb.com/title/tt1320259',
    rtUrl: 'https://www.rottentomatoes.com/search?search=Magadheera',
    watchScore: 74,
    moodTags: ['Epic', 'Emotional', 'Intense']
  }
];
