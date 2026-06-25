import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Movie {
  id: string;
  title: string;
  slug: string;
  releaseYear: number;
  thumbnail: string;
  rating: number;
}

const NavbarSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        fetchResults();
      } else {
        setResults([]);
        setIsOpen(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Shortcut logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchResults = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=6`);
      const data: { movies?: Array<{ id: number; title: string; poster_path: string | null; release_date: string; vote_average: number }> } = await res.json();
      const mapped = (data.movies || []).map(m => ({
        id: String(m.id),
        title: m.title,
        slug: m.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        releaseYear: m.release_date ? new Date(m.release_date).getFullYear() : 0,
        thumbnail: m.poster_path ? `https://image.tmdb.org/t/p/w200${m.poster_path}` : '',
        rating: m.vote_average,
      }));
      setResults(mapped);
      setIsOpen(mapped.length > 0);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > -1 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0) {
        e.preventDefault();
        window.location.href = `/movie/${results[selectedIndex].slug}`;
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-[280px] focus-within:max-w-[360px] transition-all duration-300">
      <form
        action="/search"
        method="GET"
        className={`flex items-center gap-2 h-10 rounded-pill border border-hairline bg-canvas-soft px-3 text-mute transition-all focus-within:border-link focus-within:bg-canvas focus-within:ring-2 focus-within:ring-link/20 ${isOpen ? 'border-link bg-canvas ring-2 ring-link/20' : ''}`}
        onSubmit={(e) => {
          if (!query.trim()) e.preventDefault();
        }}
      >
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-mute transition-colors hover:bg-canvas-soft-2 hover:text-ink focus:outline-none"
          onClick={() => inputRef.current?.focus()}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
        
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.trim() && results.length > 0 && setIsOpen(true)}
          placeholder="Search suggestions..."
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-mute focus:outline-none"
        />

        {query && (
          <button
            type="submit"
            className="flex h-8 shrink-0 items-center justify-center rounded-pill bg-link px-3 text-xs font-semibold text-white transition-colors hover:bg-link-hover"
          >
            Search
          </button>
        )}
      </form>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-full left-0 right-0 mt-2 overflow-hidden rounded-premium border border-hairline bg-canvas shadow-premium z-50 glass-2026"
          >
            <div className="p-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-link border-t-transparent"></div>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {results.map((movie, index) => (
                    <a
                      key={movie.id}
                      href={`/movie/${movie.slug}`}
                      className={`flex items-center gap-3 rounded-lg p-2 transition-colors ${
                        selectedIndex === index ? 'bg-canvas-soft-2 ring-1 ring-link/20' : 'hover:bg-canvas-soft'
                      }`}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="h-12 w-8 shrink-0 overflow-hidden rounded bg-canvas-soft-2">
                        {movie.thumbnail ? (
                          <img
                            src={movie.thumbnail}
                            alt={movie.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-mute">No img</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-ink">{movie.title}</div>
                        <div className="text-xs text-mute">{movie.releaseYear}</div>
                      </div>
                      {movie.rating > 0 && (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-accent">
                          <svg className="h-3 w-3 fill-current" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          {movie.rating.toFixed(1)}
                        </div>
                      )}
                    </a>
                  ))}
                  
                  <div className="mt-1 border-t border-hairline pt-1">
                    <a
                      href={`/search?q=${encodeURIComponent(query)}`}
                      className="flex items-center justify-center py-2 text-xs font-semibold text-link hover:underline"
                    >
                      View all results for "{query}"
                    </a>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NavbarSearch;
