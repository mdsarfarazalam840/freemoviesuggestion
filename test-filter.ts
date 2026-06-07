import { getMoviesPage } from './src/services/movieService';
import { OTT_PLATFORMS } from './src/data/movies';

async function test() {
  for (const ott of OTT_PLATFORMS) {
    const result = await getMoviesPage({ ott: ott.name, limit: 10 });
    console.log(`OTT: ${ott.name}, Count: ${result.count}, Movies: ${result.movies.length}`);
    if (result.movies.length > 0) {
      console.log(`Example movie OTTs:`, JSON.stringify(result.movies[0].ottPlatforms));
    }
  }
}

test().catch(console.error);
