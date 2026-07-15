import { motion } from 'framer-motion';
import type { Movie, MoodTag } from '../data/movies';
import { MOOD_EMOJI } from '../data/movies';

interface Props {
  movie: Movie;
  rank?: number;
}

const PLACEHOLDER_SVG = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect fill="%23334155" width="300" height="450"/><text x="150" y="210" font-family="sans-serif" font-size="18" font-weight="bold" fill="%23F5C518" text-anchor="middle">No Image</text></svg>`);

export default function MovieCard({ movie, rank }: Props) {
  const ottPlatforms = movie.ottPlatforms || [];
  const firstMood = movie.moodTags?.[0];
  const moodEmoji = firstMood ? MOOD_EMOJI[firstMood as MoodTag] || '' : '';
  const ws = movie.watchScore;
  const wsPct = ws ? Math.min(ws, 100) : 0;

  return (
    <motion.div
      suppressHydrationWarning
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '100px' }}
      whileHover={{ y: -5 }}
      className="group relative flex flex-col glass-2026 rounded-premium border border-hairline overflow-hidden transition-all duration-300 movie-card"
    >
      <a href={`/movie/${movie.slug}`} className="absolute inset-0 z-10" aria-label={`View details for ${movie.title}`}></a>
      
      {rank && (
        <div className="absolute top-2 left-2 z-20 flex h-8 w-8 items-center justify-center rounded-premium bg-ink/80 text-sm font-bold text-canvas backdrop-blur-sm pointer-events-none">
          {rank}
        </div>
      )}
      
      <div suppressHydrationWarning className="aspect-[2/3] relative overflow-hidden bg-canvas-soft-2">
        <img 
          src={movie.thumbnail || PLACEHOLDER_SVG}
          alt={movie.title}
          width="300"
          height="450"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_SVG; }}
        />
        {ws && (
          <div className="absolute top-3 right-3 z-30 flex flex-col items-center">
            <svg className="w-12 h-12 -rotate-90 drop-shadow-lg" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/20" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray={`${wsPct} ${100 - wsPct}`} strokeDashoffset="0" strokeLinecap="round" className={`${ws >= 85 ? 'text-emerald-400' : ws >= 70 ? 'text-sky-400' : ws >= 55 ? 'text-amber-400' : 'text-gray-400'}`} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-white drop-shadow-md">{ws}</span>
          </div>
        )}
      </div>
      
      <div suppressHydrationWarning className="p-4 flex flex-col flex-1 relative z-20 pointer-events-none">
          <div suppressHydrationWarning className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-mute">
            {movie.region} • {movie.releaseYear}
          </span>
          <div className="flex items-center gap-1">
            {firstMood && moodEmoji && (
              <span className="text-[10px] font-bold text-mute bg-canvas-soft-2 rounded-pill px-2 py-0.5 border border-hairline">
                {moodEmoji} {firstMood}
              </span>
            )}
          </div>
        </div>
        
        <h3 className="text-base font-semibold text-ink line-clamp-1 group-hover:text-link transition-colors">
          {movie.title}
        </h3>
        
        <div className="mt-2 flex items-center gap-2">
          {movie.imdbUrl && (
            <a href={movie.imdbUrl} target="_blank" rel="noopener noreferrer" className="z-30 inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-all">
              IMDB
            </a>
          )}
          {movie.rtUrl && (
            <a href={movie.rtUrl} target="_blank" rel="noopener noreferrer" className="z-30 inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all">
              RT
            </a>
          )}
        </div>
        
          <div suppressHydrationWarning className="mt-2 flex flex-wrap gap-1 pointer-events-auto">
          {movie.genres.map(genre => (
            <a 
              key={genre}
              href={`/genre/${genre.toLowerCase()}`}
              className="text-[10px] text-mute hover:text-link transition-colors"
            >
              #{genre}
            </a>
          ))}
        </div>
        
        <p className="mt-2 text-xs text-body line-clamp-2 leading-relaxed flex-1">
          {movie.description}
        </p>
        
          <div suppressHydrationWarning className="mt-4 flex flex-wrap gap-2 pt-4 border-t border-hairline pointer-events-auto">
          {ottPlatforms.slice(0, 3).map(platform => (
            <a 
              key={platform.name}
              href={`/ott/${platform.name.toLowerCase().replace('+', 'plus').replace(' ', '-')}`}
              className="inline-flex items-center rounded-pill bg-canvas-soft px-2 py-0.5 text-[10px] font-medium text-body border border-hairline hover:border-hairline-strong hover:bg-canvas-soft-2 transition-all"
            >
              {platform.name}
            </a>
          ))}
          {ottPlatforms.length > 3 && (
            <span className="text-[10px] text-mute flex items-center">+{ottPlatforms.length - 3} more</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
