import { motion } from 'framer-motion';
import type { Movie } from '../data/movies';

interface Props {
  movie: Movie;
  rank?: number;
}

export default function MovieCard({ movie, rank }: Props) {
  const ottPlatforms = movie.ottPlatforms || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      whileHover={{ y: -5 }}
      className="group relative flex flex-col glass rounded-vercel-md border border-hairline overflow-hidden transition-all duration-300 movie-card"
    >
      <a href={`/movie/${movie.slug}`} className="absolute inset-0 z-10" aria-label={`View details for ${movie.title}`}></a>
      
      {rank && (
        <div className="absolute top-2 left-2 z-20 flex h-8 w-8 items-center justify-center rounded-vercel-sm bg-ink/80 text-sm font-bold text-canvas backdrop-blur-sm pointer-events-none">
          {rank}
        </div>
      )}
      
      <div className="aspect-[2/3] overflow-hidden bg-canvas-soft-2 pointer-events-none">
        <img 
          src={movie.thumbnail} 
          alt={movie.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
      </div>
      
      <div className="p-4 flex flex-col flex-1 relative z-20 pointer-events-none">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-mute">
            {movie.region} • {movie.releaseYear}
          </span>
          <div className="flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-warning"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            <span className="text-xs font-semibold text-ink">{movie.rating}</span>
          </div>
        </div>
        
        <h3 className="text-base font-semibold text-ink line-clamp-1 group-hover:text-link transition-colors">
          {movie.title}
        </h3>
        
        <div className="mt-2 flex flex-wrap gap-1 pointer-events-auto">
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
        
        <div className="mt-4 flex flex-wrap gap-2 pt-4 border-t border-hairline pointer-events-auto">
          {ottPlatforms.slice(0, 3).map(platform => (
            <a 
              key={platform.name}
              href={`/ott/${platform.name.toLowerCase().replace('+', 'plus').replace(' ', '-')}`}
              className="inline-flex items-center rounded-vercel-pill bg-canvas-soft px-2 py-0.5 text-[10px] font-medium text-body border border-hairline hover:border-hairline-strong hover:bg-canvas-soft-2 transition-all"
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
