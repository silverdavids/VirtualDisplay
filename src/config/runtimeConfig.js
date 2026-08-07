const runtimeConfig = window.__ENV__ || {};

const firstNonEmpty = (...values) =>
  values.find(
    value => typeof value === 'string' && value.trim().length > 0
  )?.trim() || '';

export const VIRTUAL_TICKETS_API = firstNonEmpty(
  runtimeConfig.VIRTUAL_TICKETS_API,
  process.env.REACT_APP_VIRTUAL_TICKETS_API
);

export const VIRTUAL_API_BASE_URL = firstNonEmpty(
  runtimeConfig.VIRTUAL_API_BASE_URL,
  process.env.REACT_APP_VIRTUAL_API_BASE_URL
);

export const buildApiUrl = (baseUrl, path) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!baseUrl) {
    return normalizedPath;
  }

  return `${baseUrl.replace(/\/+$/, '')}${normalizedPath}`;
};