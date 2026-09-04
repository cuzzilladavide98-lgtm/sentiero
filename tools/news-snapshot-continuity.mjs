import { dedupeNews } from '../sync-worker/src/index.js';

export const CONTINUITY_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const CONTINUITY_MAX_PUBLISHED_AGE_MS = 48 * 60 * 60 * 1000;

function snapshotItemToFeedItem(item) {
  return {
    title: item.title,
    url: item.url,
    summary: item.summary,
    published: item.published,
    source: item.source,
    sourceCode: item.sourceId,
    sourceMeta: item.sourceMeta,
    provenance: item.provenance,
    places: item.places,
    topics: item.topics,
    media: item.media
  };
}

function validAge(value, now, maximum) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) && timestamp <= now + 60 * 60 * 1000 && now - timestamp <= maximum;
}

function itemUrl(item) {
  return String(item && (item.provenance?.canonicalUrl || item.url) || '').replace(/[?#].*$/, '');
}

export function retainCurrentDaySnapshotItems(fetchedItems, previousSnapshot, dayKey, maximum = 160, now = Date.now()) {
  const currentItems = Array.isArray(fetchedItems) ? fetchedItems : [];
  if (!currentItems.length) return [];
  const protectedEvidenceIds = new Set(previousSnapshot && previousSnapshot.dayKey === dayKey && Array.isArray(previousSnapshot.edition?.articles)
    ? previousSnapshot.edition.articles.filter(article => Number(article.importance) >= 52).flatMap(article => article.sourceIds || []).map(String)
    : []);
  const previousItems = previousSnapshot && previousSnapshot.dayKey === dayKey && Array.isArray(previousSnapshot.items)
    ? previousSnapshot.items.filter(item =>
      protectedEvidenceIds.has(String(item.id)) &&
      validAge(item.provenance?.retrievedAt, now, CONTINUITY_MAX_AGE_MS) &&
      validAge(item.provenance?.publishedAt || item.published, now, CONTINUITY_MAX_PUBLISHED_AGE_MS)
    ).map(snapshotItemToFeedItem)
    : [];
  const currentUrls = new Set(currentItems.map(itemUrl).filter(Boolean));
  const protectedUrls = new Set(previousItems.map(itemUrl).filter(Boolean));
  const carriedFrom = previousSnapshot && previousSnapshot.generatedAt || '';
  const merged = dedupeNews([...currentItems, ...previousItems], Number.MAX_SAFE_INTEGER);
  const protectedItems = merged.filter(item => protectedUrls.has(itemUrl(item)));
  const selectedUrls = new Set([...protectedItems, ...merged.filter(item => !protectedUrls.has(itemUrl(item)))].slice(0, maximum).map(itemUrl));
  return merged.filter(item => selectedUrls.has(itemUrl(item))).map(item => ({
    ...item,
    continuity: currentUrls.has(itemUrl(item))
      ? { status: 'CURRENT' }
      : { status: 'CARRIED', carriedFrom }
  }));
}
