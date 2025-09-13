const MICRO_MOUNT = "/ldr-icons";

function isMounted(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith(MICRO_MOUNT);
}

/** Prefissa i link interni con il mount quando serve */
export function withBase(p: string) {
  const clean = p.startsWith("/") ? p : `/${p}`;
  if (typeof window !== "undefined" && isMounted()) {
    return `${MICRO_MOUNT}${clean}`;
  }
  return clean; // standalone (child) o SSR: link relativo alla root
}

/** Costruisce il path API corretto (relativo) */
export function withApiPath(p: string) {
  const clean = p.startsWith("/api") ? p : `/api${p.startsWith("/") ? p : `/${p}`}`;
  if (typeof window !== "undefined" && isMounted()) {
    return `${MICRO_MOUNT}${clean}`; // es. /ldr-icons/api/...
  }
  return clean; // es. /api/...
}

/** Alias per asset/static - QUESTO È PER LE IMMAGINI! */
export function withAssetPath(p: string) {
  return withBase(p);
}

/** Helper: restituisce l'URL asset corretto preservando gli assoluti */
export function resolveAssetUrl(src?: string | null) {
  if (!src) return src as any;
  const s = String(src);
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:")) {
    return s;
  }
  return withAssetPath(s);
}


