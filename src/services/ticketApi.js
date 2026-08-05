import {getDisplayAuthHeaders, handleTerminalUnauthorized} from './displayAuthApi';
import {buildApiUrl, VIRTUAL_TICKETS_API} from '../config/runtimeConfig';

export const BETTING_CLOSED_MESSAGE = 'Betting closed. Waiting for the next virtual event.';

const postTicket = async (path, payload, {isBettingClosed = false} = {}) => {
  if (isBettingClosed) {
    throw new Error(BETTING_CLOSED_MESSAGE);
  }

  const authHeaders = await getDisplayAuthHeaders();
  const res = await fetch(buildApiUrl(VIRTUAL_TICKETS_API, path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 401 || res.status === 403) {
    handleTerminalUnauthorized();
    throw new Error('Terminal session expired. Please log in again.');
  }

  const responsePayload = await res.json();
  if (!res.ok) {
    throw new Error(responsePayload?.message || `Ticket request failed: ${res.status} ${res.statusText}`);
  }

  return responsePayload;
};

export const validateVirtualTicket = (payload, options) =>
  postTicket('/api/tickets/validate', payload, options);

export const placeVirtualTicket = (payload, options) =>
  postTicket('/api/tickets/place', payload, options);
