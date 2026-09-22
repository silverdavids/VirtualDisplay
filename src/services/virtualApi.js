import {buildApiUrl, VIRTUAL_API_BASE_URL} from '../config/runtimeConfig';
import {getDisplayAuthHeaders, handleTerminalUnauthorized} from './displayAuthApi';
import {withServerClock} from './serverClock';

export const DEFAULT_PROVIDER = 'VirtualHorizon';
export const DEFAULT_LEAGUE_ID = '21';

const request = async (path, options = {}) => {
  const sentAt = Date.now();
  const response = await fetch(buildApiUrl(VIRTUAL_API_BASE_URL, path), {
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

  const payload = await response.json();
  return Array.isArray(payload) ? payload : withServerClock(payload, Date.now(), sentAt);
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

export const getDisplay = (provider, leagueId, options = {}) => {
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
  console.log(`REST virtual display ${buildApiUrl(VIRTUAL_API_BASE_URL, `/api/virtual/display?${searchParams.toString()}`)}`);
  return request(`/api/virtual/display?${searchParams.toString()}`, options);
};

export const getDisplayQueue = (provider, leagueId, options = {}) => {
  const params = new URLSearchParams({provider, leagueId: String(leagueId)});
  return request(`/api/virtual/display/queue?${params}`, options);
};
