const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'FreeMovieSuggestion/1.0 (enrichment bot)';

type WikipediaResult = {
  rtTomatometer?: number;
  rtAudienceScore?: number;
  rtCertification?: string;
};

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Wikipedia API error: ${response.status}`);
  return response.json();
}

export async function searchMoviePage(title: string, year?: number): Promise<string | null> {
  const query = year ? `${title} ${year} film` : `${title} film`;
  const url = `${WIKIPEDIA_API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&formatversion=2&srlimit=3`;
  
  try {
    const data = await fetchJson(url);
    const pages = data?.query?.search;
    if (!pages?.length) return null;
    return pages[0].title;
  } catch {
    return null;
  }
}

export async function parseInfobox(pageTitle: string): Promise<Record<string, string>> {
  const url = `${WIKIPEDIA_API}?action=parse&page=${encodeURIComponent(pageTitle)}&prop=text&section=0&format=json&formatversion=2`;
  
  try {
    const data = await fetchJson(url);
    const html: string = data?.parse?.text || '';
    if (!html) return {};

    const infobox: Record<string, string> = {};
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

    for (const row of rows) {
      const headerMatch = row.match(/<th[^>]*class="infobox-label"[^>]*>([\s\S]*?)<\/th>/i);
      const dataMatch = row.match(/<td[^>]*class="infobox-data"[^>]*>([\s\S]*?)<\/td>/i);
      
      if (headerMatch && dataMatch) {
        const label = headerMatch[1].replace(/<[^>]*>/g, '').trim();
        const value = dataMatch[1].replace(/<[^>]*>/g, '').trim();
        infobox[label] = value;
      }
    }
    return infobox;
  } catch {
    return {};
  }
}

export async function extractMovieRatings(title: string, year?: number): Promise<WikipediaResult> {
  try {
    const pageTitle = await searchMoviePage(title, year);
    if (!pageTitle) return {};

    const infobox = await parseInfobox(pageTitle);

    const rtLabel = Object.keys(infobox).find(k =>
      k.toLowerCase().includes('rotten tomatoes')
    );
    const rtValue = rtLabel ? infobox[rtLabel] : '';

    if (!rtValue) return {};

    const tomatometerMatch = rtValue.match(/(\d{1,3})%/);
    const audienceMatch = rtValue.match(/(\d{1,3})%\s*[/|]\s*(\d{1,3})%/);
    const certificationMatch = rtValue.match(/(Certified Fresh|Fresh|Rotten)/i);

    const result: WikipediaResult = {};

    if (tomatometerMatch) {
      result.rtTomatometer = parseInt(tomatometerMatch[1], 10);
    }

    if (audienceMatch) {
      result.rtAudienceScore = parseInt(audienceMatch[2], 10);
    } else if (tomatometerMatch && rtValue.includes('%')) {
      const scores = rtValue.match(/(\d{1,3})%/g);
      if (scores && scores.length >= 2) {
        result.rtTomatometer = parseInt(scores[0].replace('%', ''), 10);
        result.rtAudienceScore = parseInt(scores[1].replace('%', ''), 10);
      }
    }

    if (certificationMatch) {
      const cert = certificationMatch[1].toLowerCase();
      if (cert === 'certified fresh') result.rtCertification = 'Certified Fresh';
      else if (cert === 'fresh') result.rtCertification = 'Fresh';
      else if (cert === 'rotten') result.rtCertification = 'Rotten';
    }

    return result;
  } catch {
    return {};
  }
}
