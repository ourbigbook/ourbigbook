type Headers = {
  Authorization?: string;
  "Content-Type"?: string;
};

export function addAuthHeader(token, headers: Headers = {}) {
  headers.Authorization = `Token ${encodeURIComponent(token)}`
  return headers
}
