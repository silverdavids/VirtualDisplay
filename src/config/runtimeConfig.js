const runtimeConfig = window.__ENV__ || {};

export const VIRTUAL_TICKETS_API =
  runtimeConfig.VIRTUAL_TICKETS_API ??
  process.env.REACT_APP_VIRTUAL_TICKETS_API ??
  '';

export const VIRTUAL_API_BASE_URL =
  runtimeConfig.VIRTUAL_API_BASE_URL ??
  process.env.REACT_APP_VIRTUAL_API_BASE_URL ??
  '';

export const buildApiUrl = (baseUrl, path) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}${normalizedPath}` : normalizedPath;
};
