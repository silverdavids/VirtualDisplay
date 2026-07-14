import {getDisplayAuthHeaders, handleTerminalUnauthorized} from './displayAuthApi';
import {VIRTUAL_TICKETS_API_BASE} from './apiConfig';

export const BETTING_CLOSED_MESSAGE = 'Betting closed. Waiting for the next virtual event.';

const postTicket = async (path, payload, {isBettingClosed = false} = {}) => {
  if (isBettingClosed) {
    throw new Error(BETTING_CLOSED_MESSAGE);
  }

  if (!VIRTUAL_TICKETS_API_BASE) {
    throw new Error('VirtualTickets.Api base URL is not configured.');
  }

  const authHeaders = await getDisplayAuthHeaders();
  const res = await fetch(`${VIRTUAL_TICKETS_API_BASE}${path}`, {
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
