import {lookupTicket, payoutTicket, TicketPayoutApiError} from './ticketPayoutApi';
import {handleTerminalUnauthorized} from '../services/displayAuthApi';

jest.mock('../services/displayAuthApi', () => ({
  getDisplayAuthHeaders: jest.fn(async () => ({Authorization: 'Bearer test-token'})),
  handleTerminalUnauthorized: jest.fn(),
}));

beforeEach(() => {
  global.fetch = jest.fn();
  jest.clearAllMocks();
});

test('lookup normalizes ticket number and uses the implemented lookup endpoint', async () => {
  fetch.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ticketNumber: 'VT-ABC'}),
  });
  await lookupTicket('  vt-abc  ');
  expect(fetch).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/tickets\/payout\/lookup$/),
    expect.objectContaining({body: JSON.stringify({ticketNumber: 'VT-ABC'})}),
  );
});

test('payout posts the confirmation reference', async () => {
  fetch.mockResolvedValue({ok: true, status: 200, text: async () => '{}'});
  await payoutTicket(' vt-abc ', 'DISPLAY-REF');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    ticketNumber: 'VT-ABC',
    confirmationReference: 'DISPLAY-REF',
  });
});

test('throws a structured API error and handles unauthorized responses', async () => {
  fetch.mockResolvedValue({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({code: 'Unauthorized', message: 'Expired'}),
  });
  await expect(lookupTicket('VT-ABC')).rejects.toEqual(expect.objectContaining({
    status: 401,
    code: 'Unauthorized',
    message: 'Expired',
    body: {code: 'Unauthorized', message: 'Expired'},
  }));
  expect(handleTerminalUnauthorized).toHaveBeenCalledTimes(1);
});

test('network failures use status zero', async () => {
  fetch.mockRejectedValue(new TypeError('offline'));
  await expect(lookupTicket('VT-ABC')).rejects.toBeInstanceOf(TicketPayoutApiError);
  await expect(lookupTicket('VT-ABC')).rejects.toEqual(expect.objectContaining({status: 0, code: 'NetworkError'}));
});
