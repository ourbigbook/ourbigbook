export function addAuthHeader(token, headers = {}) {
  headers.Authorization = `Token ${encodeURIComponent(token)}`
  console.error(headers);
  return headers
}
