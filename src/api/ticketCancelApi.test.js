import {cancelTicket, lookupTicket, TicketCancelApiError} from './ticketCancelApi';

jest.mock('../services/displayAuthApi', () => ({
  getDisplayAuthHeaders: jest.fn(async () => ({Authorization: 'Bearer test'})),
  handleTerminalUnauthorized: jest.fn(),
}));

const response = (body, ok = true, status = 200) => ({
  ok,
  status,
  text: async () => JSON.stringify(body),
});

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

test('looks up cancellation eligibility using the payout lookup endpoint', async () => {
  fetch.mockResolvedValue(response({ticketNumber: 'VT-ABC', canCancel: true}));
  await expect(lookupTicket(' vt-abc ')).resolves.toMatchObject({canCancel: true});
  expect(fetch).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/tickets\/payout\/lookup$/),
    expect.objectContaining({body: JSON.stringify({ticketNumber: 'VT-ABC'})}),
  );
});

test('posts cancellation fields', async () => {
  fetch.mockResolvedValue(response({cancelReference: 'VTC-1'}));
  await cancelTicket({
    ticketNumber: ' vt-abc ',
    confirmationReference: '',
    reason: 'CustomerRequested',
  });
  expect(fetch).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/tickets\/cancel$/),
    expect.objectContaining({body: JSON.stringify({
      ticketNumber: 'VT-ABC',
      confirmationReference: '',
      reason: 'CustomerRequested',
    })}),
  );
});

test('preserves the backend cancellation message', async () => {
  fetch.mockResolvedValue(response({
    code: 'EventStarted',
    message: 'The first event has already started.',
  }, false, 409));
  await expect(cancelTicket({ticketNumber: 'VT-ABC'})).rejects.toEqual(
    expect.objectContaining({
      message: 'The first event has already started.',
      code: 'EventStarted',
    }),
  );
  await expect(Promise.reject(new TicketCancelApiError({message: 'x'}))).rejects.toBeInstanceOf(TicketCancelApiError);
});
