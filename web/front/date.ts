const zeroPad = (num, places) => String(num).padStart(places, '0')

export function formatDate(dateString) {
  const date = new Date(dateString)
  return `${date.getFullYear()}-${zeroPad(date.getMonth(), 2)}-${zeroPad(date.getDate(), 2)}`
}
