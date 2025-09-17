/**
 * scripts/derive-related.mjs
 * Genera .env.local per Vite:
 * - In Vercel: usa VERCEL_RELATED_PROJECTS o BACKEND_BASE_URL
 * - In locale: usa BACKEND_BASE_URL se presente, altrimenti http://localhost:8000
 */
import { writeFileSync, existsSync } from 'node:fs';

function pickUrlForEnv(p, isProd) {
  const prod = p.productionUrl || p.urls?.production || p.production?.url || p.domains?.production || p.hosts?.production;
  const prev = p.previewUrl || p.urls?.preview || p.preview?.url || p.domains?.preview || p.hosts?.preview;
  return isProd ? (prod || prev) : (prev || prod);
}
function normalizeBase(u) {
  if (!u) return null;
  let s = String(u).trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, '');
}
function log(m){ console.log(`[derive-related] ${m}`); }

try {
  const isVercel = !!process.env.VERCEL;
  const isProd = (process.env.VERCEL_ENV || '').toLowerCase() === 'production';
  const backendProjectId = process.env.BACKEND_PROJECT_ID || '';
  let backendBase = null;

  if (isVercel && process.env.VERCEL_RELATED_PROJECTS) {
    let parsed = JSON.parse(process.env.VERCEL_RELATED_PROJECTS);
    const list = Array.isArray(parsed?.projects) ? parsed.projects : (Array.isArray(parsed) ? parsed : []);
    let candidate = (backendProjectId && list.find(p => p.id === backendProjectId)) || list.find(p => /backend/i.test(p?.name || ''));
    const chosen = candidate && pickUrlForEnv(candidate, isProd);
    backendBase = normalizeBase(chosen);
    log(`Related Projects host: ${backendBase || '(none)'}`);
  }

  if (!backendBase && process.env.BACKEND_BASE_URL) {
    backendBase = normalizeBase(process.env.BACKEND_BASE_URL);
    log(`Fallback BACKEND_BASE_URL: ${backendBase}`);
  }

  if (!backendBase && !isVercel) {
    backendBase = 'http://localhost:8000';
    log(`Locale senza env → uso default: ${backendBase}`);
  }

  if (!backendBase) throw new Error('Host backend non determinabile');

  const wsBase = backendBase.startsWith('https')
    ? backendBase.replace(/^https/i, 'wss')
    : backendBase.replace(/^http/i, 'ws');

  const out =
    `VITE_BACKEND_URL=${backendBase}\n` +
    `VITE_API_BASE_URL=${backendBase}/api\n` +
    `VITE_ASSETS_BASE_URL=${backendBase}/static/images\n` +
    `VITE_WS_URL=${wsBase}\n` +
    `VITE_VERCEL_MODE=true\n`;

  writeFileSync('.env.local', out, 'utf8');
  log('Creato .env.local');
} catch (e) {
  console.error('[derive-related] ERRORE:', e?.message || e);
  process.exit(1);
}
