export function addAuthHeader(token, headers = {}) {
  headers.Authorization = `Token ${encodeURIComponent(token)}`
  return headers
}
