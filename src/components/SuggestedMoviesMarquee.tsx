import SimpleMarquee from "./SimpleMarquee"
import type { Movie } from "../data/movies"

const PLACEHOLDER_SVG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"><rect fill="%23334155" width="200" height="300"/><text x="100" y="145" font-family="sans-serif" font-size="14" font-weight="bold" fill="%23F5C518" text-anchor="middle">No Image</text></svg>',
  )

interface Props {
  movies: Movie[]
  region?: string
}

export default function SuggestedMoviesMarquee({ movies, region }: Props) {
  if (!movies.length) return null

  return (
    <section aria-label={`Suggested ${region || ''} movies`} className="mt-20 mb-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-8">
        <div className="flex items-center gap-4">
          <span className="h-8 w-1.5 bg-accent rounded-full shrink-0"></span>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              {region ? `More ${region} Suggestions` : "You Might Also Like"}
            </h2>
            <p className="text-mute text-sm mt-0.5">Handpicked picks from the same region</p>
          </div>
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <SimpleMarquee
          baseVelocity={4}
          direction="left"
          slowdownOnHover
          slowDownFactor={0.1}
          slowDownSpringConfig={{ damping: 60, stiffness: 300 }}
          repeat={3}
        >
          {movies.map((movie) => (
            <a
              key={movie.id}
              href={`/movie/${movie.slug}`}
              className="group relative mx-2 sm:mx-3 block w-[140px] sm:w-[160px] md:w-[180px] shrink-0 rounded-premium overflow-hidden border border-hairline bg-canvas-soft-2 shadow-premium transition-shadow duration-300 hover:shadow-premium-dark"
              aria-label={`View ${movie.title}`}
            >
              <div className="aspect-[2/3] overflow-hidden">
                <img
                  src={movie.thumbnail || PLACEHOLDER_SVG}
                  alt={movie.title}
                  width="180"
                  height="270"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_SVG
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                  <p className="text-sm font-bold text-white truncate drop-shadow-md">
                    {movie.title}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="text-accent shrink-0"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    <span className="text-xs font-bold text-white">{movie.rating}</span>
                  </div>
                </div>
              </div>
            </a>
          ))}
        </SimpleMarquee>
      </div>
    </section>
  )
}
