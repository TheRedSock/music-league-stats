export const DETAIL_PAGE_SIZE = 25;

export function detailPage<T>(rows: T[], search: string, requestedPage: number) {
  const query = search.trim().toLowerCase().slice(0, 160);
  const filtered = query ? rows.filter(row => JSON.stringify(row).toLowerCase().includes(query)) : rows;
  const pageCount = Math.max(1, Math.ceil(filtered.length / DETAIL_PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  return { rows: filtered.slice((page-1)*DETAIL_PAGE_SIZE,page*DETAIL_PAGE_SIZE), total: filtered.length, page, pageCount };
}

export type FactDetail = { open: boolean; href: string; closeHref: string; previousHref: string; nextHref: string; page: number; pageCount: number; total: number; search: string };
