/** A count with its noun in English: "1 route", "2 routes", "0 services". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
