import {VIRTUAL_TICKETS_API_BASE} from '../services/apiConfig';

export const TERMINAL_SESSION_KEY = 'virtualDisplayTerminalSession';
export const TERMINAL_AUTH_CHANGED_EVENT = 'virtual-display-terminal-auth-changed';

const DISPLAY_AUTH_URL = `${VIRTUAL_TICKETS_API_BASE}/api/auth/display`;
const version = process.env.REACT_APP_DISPLAY_VERSION || '1.0.0';

const readValue = (source, keys) => {
  if (!source || typeof source !== 'object') return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

const nestedValue = (source, keys) =>
  readValue(source, keys) ?? readValue(source?.data, keys) ?? readValue(source?.session, keys);

const notifyAuthChanged = () => window.dispatchEvent(new Event(TERMINAL_AUTH_CHANGED_EVENT));

const normalizeSession = (payload) => {
  const accessToken = nestedValue(payload, ['accessToken', 'access_token', 'token', 'jwt']);
  if (!accessToken) throw new Error('Terminal authentication response did not include an access token.');

  const expiresAt = nestedValue(payload, ['expiresAt', 'expires_at', 'expiration', 'validUntil']);
  const expiresIn = nestedValue(payload, ['expiresIn', 'expires_in']);
  let expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : null;
  if ((!expiresAtMs || Number.isNaN(expiresAtMs)) && Number.isFinite(Number(expiresIn))) {
    expiresAtMs = Date.now() + Number(expiresIn) * 1000;
  }

  const terminal = payload?.terminal ?? payload?.data?.terminal ?? payload?.session?.terminal ?? {};
  return {
    accessToken: String(accessToken),
    expiresAt: Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString() : null,
    terminal: {
      id: readValue(terminal, ['terminalId', 'id']) ?? null,
      code: String(readValue(terminal, ['terminalCode', 'code']) ?? ''),
      name: String(readValue(terminal, ['terminalName', 'name']) ?? ''),
      branchId: readValue(terminal, ['branchId']) ?? null,
      type: readValue(terminal, ['terminalType', 'type']) ?? null,
    },
  };
};

const parseResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok) throw new Error(`Terminal authentication failed (${response.status}).`);
    throw new Error('Terminal authentication returned an invalid response.');
  }
};

export const getTerminalSession = () => {
  try {
    const rawSession = localStorage.getItem(TERMINAL_SESSION_KEY);
    if (!rawSession) return null;
    const session = JSON.parse(rawSession);
    if (!session?.accessToken) return null;
    return session;
  } catch {
    localStorage.removeItem(TERMINAL_SESSION_KEY);
    return null;
  }
};

export const getTerminalToken = () => getTerminalSession()?.accessToken ?? '';

export const isTerminalAuthenticated = () => {
  const session = getTerminalSession();
  if (!session?.accessToken) return false;
  if (!session.expiresAt) return true;
  const expiresAtMs = new Date(session.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    localStorage.removeItem(TERMINAL_SESSION_KEY);
    return false;
  }
  return true;
};

export const loginTerminal = async (terminalCode, terminalSecret) => {
  const code = String(terminalCode ?? '').trim();
  if (!code || !terminalSecret) throw new Error('Terminal code and activation key are required.');

  const response = await fetch(DISPLAY_AUTH_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({terminalCode: code, secret: terminalSecret, version}),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    const message = nestedValue(payload, ['message', 'error', 'title']);
    throw new Error(message || `Terminal authentication failed (${response.status}).`);
  }

  const session = normalizeSession(payload);
  localStorage.setItem(TERMINAL_SESSION_KEY, JSON.stringify(session));
  notifyAuthChanged();
  return session;
};

export const logoutTerminal = () => {
  localStorage.removeItem(TERMINAL_SESSION_KEY);
  notifyAuthChanged();
};

export const getTerminalAuthHeaders = () => {
  const token = isTerminalAuthenticated() ? getTerminalToken() : '';
  return token ? {Authorization: `Bearer ${token}`} : {};
};

export const handleTerminalUnauthorized = () => {
  logoutTerminal();
  if (window.location.pathname !== '/login') {
    const from = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/login?from=${encodeURIComponent(from)}`);
  }
};

export const terminalAuthEndpoint = DISPLAY_AUTH_URL;
