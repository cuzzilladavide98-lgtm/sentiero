/* Registro pubblico chiuso. Gli URL di recupero e i domini degli articoli sono
   dichiarati qui: la route non accetta mai destinazioni fornite dal client.
   Sentiero conserva soltanto titolo, breve estratto, metadati e link. */
const source = record => {
  const value = { retrieval: 'rss', freshnessMinutes: 120, tier: 'B', reliability: 'edited source', terms: 'headline-excerpt-link', maxItems: 7, imageRights: 'Diritti riservati alla fonte', ...record };
  value.linkDomains = Object.freeze([...(record.linkDomains || [record.domain])]);
  value.imageDomains = Object.freeze([...(record.imageDomains || [record.domain])]);
  return Object.freeze(value);
};

const TGR_REGIONS = Object.freeze([
  ['abruzzo', 'Abruzzo', 42.35, 13.40], ['basilicata', 'Basilicata', 40.64, 15.80], ['calabria', 'Calabria', 38.91, 16.59],
  ['campania', 'Campania', 40.85, 14.27], ['emiliaromagna', 'Emilia-Romagna', 44.49, 11.34], ['fvg', 'Friuli-Venezia Giulia', 45.65, 13.77],
  ['lazio', 'Lazio', 41.90, 12.50], ['liguria', 'Liguria', 44.41, 8.93], ['lombardia', 'Lombardia', 45.46, 9.19],
  ['marche', 'Marche', 43.62, 13.52], ['molise', 'Molise', 41.56, 14.66], ['piemonte', 'Piemonte', 45.07, 7.69],
  ['puglia', 'Puglia', 41.13, 16.87], ['sardegna', 'Sardegna', 39.22, 9.12], ['sicilia', 'Sicilia', 38.12, 13.36],
  ['toscana', 'Toscana', 43.77, 11.26], ['trento', 'Trentino-Alto Adige', 46.07, 11.12], ['umbria', 'Umbria', 43.11, 12.39],
  ['vda', "Valle d'Aosta", 45.74, 7.32], ['veneto', 'Veneto', 45.44, 12.33]
]);

const TGR_SOURCES = TGR_REGIONS.map(([slug, region, latitude, longitude]) => source({
  sourceId: 'tgr-' + slug, name: 'TGR ' + region, domain: 'rainews.it', type: 'newsroom', perspective: 'independent', ownership: 'public-service',
  country: 'IT', coverage: 'regional', area: 'local', language: 'it', role: 'regional public-service newsroom', reliability: 'edited regional newsroom',
  terms: 'headline-excerpt-image-link', freshnessMinutes: 30, maxItems: 4, region, regionSlug: slug, latitude, longitude,
  imageRights: '© Rai · diritti riservati', url: `https://www.rainews.it/tgr/${slug}/rss/tutti`
}));

export const NEWS_SOURCES = Object.freeze([
  // Italia: dati e atti primari
  source({ sourceId: 'istat', name: 'Istat', domain: 'istat.it', linkDomains: ['istat.it'], type: 'primary', perspective: 'primary', ownership: 'public', country: 'IT', coverage: 'italy', area: 'statistics', language: 'it', tier: 'A', role: 'official statistics', reliability: 'primary institution', terms: 'official-feed-link', freshnessMinutes: 180, maxItems: 8, url: 'https://www.istat.it/documenti/comunicato-stampa/feed' }),
  source({ sourceId: 'governo-it', name: 'Presidenza del Consiglio', domain: 'governo.it', type: 'primary', perspective: 'primary', ownership: 'public', country: 'IT', coverage: 'italy', area: 'institutions', language: 'it', tier: 'A', role: 'national executive', reliability: 'primary institution', terms: 'official-feed-link', freshnessMinutes: 120, maxItems: 7, url: 'https://www.governo.it/it/rss.xml' }),

  // Europa e politica monetaria: fonti primarie
  source({ sourceId: 'ecb', name: 'Banca centrale europea', domain: 'ecb.europa.eu', type: 'primary', perspective: 'primary', ownership: 'public', country: 'EU', coverage: 'europe', area: 'economy', language: 'en', tier: 'A', role: 'central bank', reliability: 'primary institution', terms: 'official-feed-link', freshnessMinutes: 180, maxItems: 8, url: 'https://www.ecb.europa.eu/rss/press.html' }),
  source({ sourceId: 'europarl', name: 'Parlamento europeo', domain: 'europarl.europa.eu', type: 'primary', perspective: 'primary', ownership: 'public', country: 'EU', coverage: 'europe', area: 'institutions', language: 'it', tier: 'A', role: 'legislative institution', reliability: 'primary institution', terms: 'official-feed-link', freshnessMinutes: 180, maxItems: 8, url: 'https://www.europarl.europa.eu/rss/doc/press-releases/it.xml' }),
  source({ sourceId: 'eu-commission', name: 'Commissione europea', domain: 'ec.europa.eu', linkDomains: ['ec.europa.eu', 'commission.europa.eu'], type: 'primary', perspective: 'primary', ownership: 'public', country: 'EU', coverage: 'europe', area: 'institutions', language: 'en', tier: 'A', role: 'executive institution', reliability: 'primary institution', terms: 'official-feed-link', freshnessMinutes: 90, maxItems: 9, url: 'https://ec.europa.eu/commission/presscorner/api/rss?language=en' }),

  // Organizzazioni internazionali, salute, scienza e clima: fonti primarie
  source({ sourceId: 'who', name: 'Organizzazione mondiale della sanità', domain: 'who.int', type: 'primary', perspective: 'primary', ownership: 'multilateral', country: 'UN', coverage: 'world', area: 'health', language: 'en', tier: 'A', role: 'public-health authority', reliability: 'primary institution', terms: 'official-feed-link', freshnessMinutes: 120, maxItems: 8, url: 'https://www.who.int/rss-feeds/news-english.xml' }),
  source({ sourceId: 'fed', name: 'Federal Reserve', domain: 'federalreserve.gov', type: 'primary', perspective: 'primary', ownership: 'public', country: 'US', coverage: 'world', area: 'economy', language: 'en', tier: 'A', role: 'central bank', reliability: 'primary institution', terms: 'official-feed-link', freshnessMinutes: 180, maxItems: 7, url: 'https://www.federalreserve.gov/feeds/press_all.xml' }),
  source({ sourceId: 'nasa', name: 'NASA', domain: 'nasa.gov', type: 'primary', perspective: 'primary', ownership: 'public', country: 'US', coverage: 'world', area: 'science', language: 'en', tier: 'A', role: 'space agency', reliability: 'primary institution', terms: 'official-feed-link', freshnessMinutes: 240, maxItems: 6, url: 'https://www.nasa.gov/news-release/feed/' }),
  source({ sourceId: 'esa', name: 'Agenzia spaziale europea', domain: 'esa.int', type: 'primary', perspective: 'primary', ownership: 'public', country: 'EU', coverage: 'world', area: 'science', language: 'en', tier: 'A', role: 'space agency', reliability: 'primary institution', terms: 'official-feed-link', freshnessMinutes: 240, maxItems: 6, url: 'https://www.esa.int/rssfeed/Our_Activities' }),
  source({ sourceId: 'noaa', name: 'NOAA', domain: 'noaa.gov', type: 'primary', perspective: 'primary', ownership: 'public', country: 'US', coverage: 'world', area: 'climate', language: 'en', tier: 'A', role: 'climate and ocean agency', reliability: 'primary institution', terms: 'official-feed-link', freshnessMinutes: 180, maxItems: 7, url: 'https://www.noaa.gov/rss.xml' }),

  // Redazioni istituzionali o di servizio pubblico
  source({ sourceId: 'un', name: 'ONU News', domain: 'news.un.org', type: 'institutional-news', perspective: 'primary', ownership: 'multilateral', country: 'UN', coverage: 'world', area: 'world', language: 'en', tier: 'A', role: 'multilateral newsroom', reliability: 'institutional newsroom', terms: 'official-feed-link', freshnessMinutes: 60, maxItems: 8, url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' }),
  source({ sourceId: 'rai', name: 'RaiNews', domain: 'rainews.it', type: 'newsroom', perspective: 'independent', ownership: 'public-service', country: 'IT', coverage: 'world', area: 'general', language: 'it', role: 'public-service newsroom', reliability: 'edited newsroom', terms: 'headline-excerpt-link', freshnessMinutes: 30, maxItems: 8, url: 'https://www.rainews.it/rss/tutti' }),
  source({ sourceId: 'bbc', name: 'BBC News', domain: 'bbc.com', linkDomains: ['bbc.com', 'bbc.co.uk'], type: 'newsroom', perspective: 'independent', ownership: 'public-service', country: 'GB', coverage: 'world', area: 'world', language: 'en', role: 'public-service newsroom', reliability: 'edited newsroom', freshnessMinutes: 30, maxItems: 8, url: 'https://feeds.bbci.co.uk/news/world/rss.xml' }),
  source({ sourceId: 'npr', name: 'NPR', domain: 'npr.org', type: 'newsroom', perspective: 'independent', ownership: 'nonprofit', country: 'US', coverage: 'world', area: 'world', language: 'en', role: 'nonprofit newsroom', reliability: 'edited newsroom', freshnessMinutes: 60, maxItems: 7, url: 'https://feeds.npr.org/1004/rss.xml' }),
  source({ sourceId: 'dw', name: 'Deutsche Welle', domain: 'dw.com', type: 'newsroom', perspective: 'independent', ownership: 'public-service', country: 'DE', coverage: 'world', area: 'world', language: 'en', role: 'international public-service newsroom', reliability: 'edited newsroom', freshnessMinutes: 45, maxItems: 7, url: 'https://rss.dw.com/rdf/rss-en-all' }),
  source({ sourceId: 'france24', name: 'France 24', domain: 'france24.com', type: 'newsroom', perspective: 'independent', ownership: 'public-service', country: 'FR', coverage: 'world', area: 'world', language: 'en', role: 'international newsroom', reliability: 'edited newsroom', freshnessMinutes: 45, maxItems: 7, url: 'https://www.france24.com/en/rss' }),

  // Redazioni indipendenti, non-profit e commerciali con feed pubblico
  source({ sourceId: 'guardian', name: 'The Guardian', domain: 'theguardian.com', type: 'newsroom', perspective: 'independent', ownership: 'trust', country: 'GB', coverage: 'world', area: 'world', language: 'en', role: 'independent newsroom', reliability: 'edited newsroom', freshnessMinutes: 30, maxItems: 7, url: 'https://www.theguardian.com/world/rss' }),
  source({ sourceId: 'aljazeera', name: 'Al Jazeera', domain: 'aljazeera.com', type: 'newsroom', perspective: 'independent', ownership: 'state-funded', country: 'QA', coverage: 'world', area: 'world', language: 'en', role: 'international newsroom', reliability: 'edited newsroom', freshnessMinutes: 30, maxItems: 7, url: 'https://www.aljazeera.com/xml/rss/all.xml' }),
  source({ sourceId: 'propublica', name: 'ProPublica', domain: 'propublica.org', type: 'newsroom', perspective: 'independent', ownership: 'nonprofit', country: 'US', coverage: 'world', area: 'investigations', language: 'en', role: 'investigative nonprofit newsroom', reliability: 'edited newsroom', freshnessMinutes: 180, maxItems: 6, url: 'https://www.propublica.org/feeds/propublica/main' }),
  source({ sourceId: 'conversation', name: 'The Conversation', domain: 'theconversation.com', type: 'analysis', perspective: 'independent', ownership: 'nonprofit', country: 'INT', coverage: 'world', area: 'science', language: 'en', role: 'academic independent newsroom', reliability: 'expert-authored edited analysis', terms: 'cc-headline-excerpt-link', freshnessMinutes: 120, maxItems: 6, url: 'https://theconversation.com/global/articles.atom' }),
  source({ sourceId: 'lemonde', name: 'Le Monde', domain: 'lemonde.fr', type: 'newsroom', perspective: 'independent', ownership: 'commercial', country: 'FR', coverage: 'world', area: 'world', language: 'fr', role: 'independent newsroom', reliability: 'edited newsroom', freshnessMinutes: 45, maxItems: 6, url: 'https://www.lemonde.fr/international/rss_full.xml' }),
  source({ sourceId: 'elpais', name: 'El País', domain: 'elpais.com', type: 'newsroom', perspective: 'independent', ownership: 'commercial', country: 'ES', coverage: 'world', area: 'general', language: 'es', role: 'independent newsroom', reliability: 'edited newsroom', freshnessMinutes: 45, maxItems: 6, url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada' }),
  source({ sourceId: 'valigiablu', name: 'Valigia Blu', domain: 'valigiablu.it', type: 'analysis', perspective: 'independent', ownership: 'independent', country: 'IT', coverage: 'world', area: 'analysis', language: 'it', role: 'independent explanatory newsroom', reliability: 'edited analysis', freshnessMinutes: 360, maxItems: 5, url: 'https://www.valigiablu.it/feed/' }),
  source({ sourceId: 'sky-tg24', name: 'Sky TG24', domain: 'tg24.sky.it', type: 'newsroom', perspective: 'independent', ownership: 'commercial', country: 'IT', coverage: 'world', area: 'general', language: 'it', role: 'commercial newsroom', reliability: 'edited newsroom', freshnessMinutes: 30, maxItems: 7, url: 'https://tg24.sky.it/rss/tg24.xml' }),
  source({ sourceId: 'agi', name: 'AGI', domain: 'agi.it', type: 'news-agency', perspective: 'independent', ownership: 'commercial', country: 'IT', coverage: 'world', area: 'general', language: 'it', role: 'news agency', reliability: 'edited wire service', freshnessMinutes: 30, maxItems: 7, url: 'https://www.agi.it/rss' }),
  source({ sourceId: 'internazionale', name: 'Internazionale', domain: 'internazionale.it', type: 'newsroom', perspective: 'independent', ownership: 'independent', country: 'IT', coverage: 'world', area: 'world', language: 'it', role: 'international independent newsroom', reliability: 'edited newsroom', freshnessMinutes: 90, maxItems: 6, url: 'https://www.internazionale.it/sitemaps/rss.xml' }),
  ...TGR_SOURCES
]);
