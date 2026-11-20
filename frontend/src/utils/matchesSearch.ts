export function matchesSearch(query: string, ...values: Array<string | undefined>): boolean {
  const search = query.trim().toLowerCase();
  if (search === '') return true;
  return values.some((value) => (value ?? '').toLowerCase().includes(search));
}
