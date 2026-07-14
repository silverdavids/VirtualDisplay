import {getDisplayAuthHeaders, handleTerminalUnauthorized} from './displayAuthApi';
import {VIRTUAL_TICKETS_API_BASE} from './apiConfig';

export const VIRTUAL_TICKETS_API_BASE_URL = `${VIRTUAL_TICKETS_API_BASE}/api/virtual-tickets`;

const AUTH_ERROR_MESSAGE = 'Ticket API authentication failed. Check display API key configuration.';

const getHeaders = async () => {
  return getDisplayAuthHeaders();
};

const request = async (path = '', params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();
  const response = await fetch(`${VIRTUAL_TICKETS_API_BASE_URL}${path}${query ? `?${query}` : ''}`, {
    cache: 'no-store',
    headers: await getHeaders(),
  });

  if (response.status === 401 || response.status === 403) {
    handleTerminalUnauthorized();
    throw new Error(AUTH_ERROR_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(`Virtual tickets request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

export const getVirtualTickets = (params) => request('', params);

export const getVirtualTicketDetails = (receiptId) =>
  request(`/${encodeURIComponent(receiptId)}`);
