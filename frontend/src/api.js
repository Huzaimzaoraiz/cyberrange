const API = "/api";

function getHeaders() {
  return { "Content-Type": "application/json" };
}

async function request(endpoint, options = {}) {
  const res = await fetch(`${API}${endpoint}`, {
    ...options,
    credentials: "include",
    headers: { ...getHeaders(), ...options.headers },
  });

  if (res.headers.get("content-type")?.includes("text/plain")) {
    if (!res.ok) throw { status: res.status, message: "request failed" };
    return res;
  }

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : {};
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export const api = {
  get: (url) => request(url),
  post: (url, body) =>
    request(url, { method: "POST", body: JSON.stringify(body) }),
  put: (url, body) =>
    request(url, { method: "PUT", body: JSON.stringify(body) }),
  del: (url) => request(url, { method: "DELETE" }),
};
