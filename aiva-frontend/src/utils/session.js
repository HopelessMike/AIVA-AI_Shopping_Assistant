// src/utils/session.js - shared session helpers

const STORAGE_KEY = 'aiva_session_id';
const GLOBAL_KEY = '__AIVA_SESSION_ID__';
export const SESSION_HEADER = 'X-Session-Id';

const generateSessionId = () => {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export function getSessionId() {
  if (typeof window === 'undefined') return null;

  if (window[GLOBAL_KEY]) return window[GLOBAL_KEY];

  let stored = null;
  try {
    stored = window.localStorage?.getItem(STORAGE_KEY) || null;
  } catch (err) {
    stored = null;
  }

  if (!stored) {
    stored = generateSessionId();
    try {
      window.localStorage?.setItem(STORAGE_KEY, stored);
    } catch (err) {
      // Ignore storage errors (e.g. Safari private mode)
    }
  }

  window[GLOBAL_KEY] = stored;
  return stored;
}

export function withSessionHeaders(init = {}) {
  const sessionId = getSessionId();
  if (!sessionId) return { ...init };

  const headers = { ...(init.headers || {}) };
  if (!headers[SESSION_HEADER]) {
    headers[SESSION_HEADER] = sessionId;
  }

  return { ...init, headers };
}
