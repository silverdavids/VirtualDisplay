import {VIRTUAL_API_BASE} from './apiConfig';
import {getDisplayAuthHeaders, handleTerminalUnauthorized} from './displayAuthApi';

export const VIRTUAL_API_BASE_URL = VIRTUAL_API_BASE;
export const DEFAULT_PROVIDER = 'VirtualHorizon';
export const DEFAULT_LEAGUE_ID = '21';

const request = async (path, options = {}) => {
  const response = await fetch(`${VIRTUAL_API_BASE_URL}${path}`, {
    cache: 'no-store',
    ...options,
    headers: {
      ...await getDisplayAuthHeaders(),
      ...options.headers,
    },
  });

  if (response.status === 401 || response.status === 403) {
    handleTerminalUnauthorized();
    throw new Error('Terminal session expired. Please log in again.');
  }

  if (!response.ok) {
    throw new Error(`Virtual-Api request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

const getLeagueArray = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.leagues)) return payload.leagues;
  return [];
};

const normalizeLeague = (league) => ({
  ...league,
  id: league.id ?? league.leagueId,
  name: league.leagueName,
  provider: league.provider,
});

export const getLeagues = async () => {
  const payload = await request('/api/virtual/leagues');
  return getLeagueArray(payload).map(normalizeLeague);
};

export const getDisplay = (provider, leagueId) => {
  const resolvedProvider = !provider || String(provider).toLowerCase() === 'all'
    ? DEFAULT_PROVIDER
    : provider;
  const resolvedLeagueId = !leagueId || String(leagueId).toLowerCase() === 'all'
    ? DEFAULT_LEAGUE_ID
    : leagueId;
  const searchParams = new URLSearchParams({
    provider: resolvedProvider,
    leagueId: String(resolvedLeagueId),
    _: String(Date.now()),
  });
  console.log(`REST virtual display ${VIRTUAL_API_BASE_URL}/api/virtual/display?${searchParams.toString()}`);
  return request(`/api/virtual/display?${searchParams.toString()}`);
};
