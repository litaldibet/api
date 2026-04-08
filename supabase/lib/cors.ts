const ALLOWED_ORIGIN_HOSTS = new Set([
  "admin.litaldibet.com.br",
  "www.litaldibet.com.br"
])

function resolveAllowedOrigin(origin: string | null): string | null {
  if (!origin) {
    return null
  }

  try {
    const parsed = new URL(origin)
    const hostname = parsed.hostname.toLowerCase()

    if (parsed.protocol === "https:" && ALLOWED_ORIGIN_HOSTS.has(hostname)) {
      return `${parsed.protocol}//${parsed.host}`
    }
  } catch {
    return null
  }

  return null
}

export function isOriginAllowed(origin: string | null): boolean {
  return resolveAllowedOrigin(origin) !== null
}

export function getCorsHeaders(origin: string | null): HeadersInit {
  const allowedOrigin = resolveAllowedOrigin(origin)

  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Vary": "Origin"
  }
}

export function getJsonHeaders(origin: string | null): HeadersInit {
  return {
    ...getCorsHeaders(origin),
    "Content-Type": "application/json"
  }
}
