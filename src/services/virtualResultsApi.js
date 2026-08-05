import {getDisplayAuthHeaders, handleTerminalUnauthorized} from './displayAuthApi';
import {buildApiUrl, VIRTUAL_API_BASE_URL} from '../config/runtimeConfig';

export const LATEST_RESULTS_PATH = '/api/virtual/results/latest';

export const getLatestResults = async () => {
  const response = await fetch(buildApiUrl(VIRTUAL_API_BASE_URL, LATEST_RESULTS_PATH), {
    cache: 'no-store',
    headers: await getDisplayAuthHeaders(),
  });

  if (response.status === 401 || response.status === 403) {
    handleTerminalUnauthorized();
    throw new Error('Terminal session expired. Please log in again.');
  }
  if (!response.ok) {
    throw new Error(`Latest results request failed (${response.status}).`);
  }

  const payload = await response.json();
  return payload?.latestResult ?? payload?.result ?? payload?.data ?? payload ?? null;
};
