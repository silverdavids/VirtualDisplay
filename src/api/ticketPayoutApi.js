import {getDisplayAuthHeaders, handleTerminalUnauthorized} from '../services/displayAuthApi';
import {VIRTUAL_TICKETS_API_BASE} from '../services/apiConfig';

export class TicketPayoutApiError extends Error {
  constructor({status = 0, code = 'NetworkError', message, body = null, cause}) {
    super(message || 'Ticket payout request failed.');
    this.name = 'TicketPayoutApiError';
    this.status = status;
    this.code = code;
    this.body = body;
    if (cause) this.cause = cause;
  }
}

export const normalizeTicketNumber = (ticketNumber) =>
  String(ticketNumber ?? '').trim().toUpperCase();

const parseBody = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {message: text};
  }
};

const post = async (path, payload) => {
  let response;
  try {
    response = await fetch(`${VIRTUAL_TICKETS_API_BASE}${path}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...await getDisplayAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    throw new TicketPayoutApiError({
      message: 'Unable to reach the ticket payout service.',
      cause,
    });
  }

  const body = await parseBody(response);
  if (response.status === 401 || response.status === 403) {
    handleTerminalUnauthorized();
  }
  if (!response.ok) {
    throw new TicketPayoutApiError({
      status: response.status,
      code: body?.code || `HTTP_${response.status}`,
      message: body?.message || body?.title || `Ticket payout request failed (${response.status}).`,
      body,
    });
  }
  return body;
};

export const lookupTicket = (ticketNumber) =>
  post('/api/tickets/payout/lookup', {ticketNumber: normalizeTicketNumber(ticketNumber)});

export const payoutTicket = (ticketNumber, confirmationReference) =>
  post('/api/tickets/payout', {
    ticketNumber: normalizeTicketNumber(ticketNumber),
    confirmationReference,
  });
