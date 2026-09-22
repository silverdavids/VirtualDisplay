import {getDisplay, getDisplayQueue} from './virtualApi';
import {getLatestResults} from './virtualResultsApi';
import {getDisplayAuthHeaders} from './displayAuthApi';

jest.mock('./displayAuthApi', () => ({
  getDisplayAuthHeaders: jest.fn(async () => ({Authorization: 'Bearer test'})),
  handleTerminalUnauthorized: jest.fn(),
}));
beforeEach(() => {
  getDisplayAuthHeaders.mockResolvedValue({Authorization: 'Bearer test'});
  global.fetch = jest.fn(async () => ({ok: true, status: 200, json: async () => ({})}));
});
afterEach(() => { delete global.fetch; });

test.each(['21', '78'])('uses the exact per-league API contract for league %s', async id => {
  const controller = new AbortController();
  await getDisplay('VirtualHorizon', id, {signal: controller.signal});
  await getDisplayQueue('VirtualHorizon', id, {signal: controller.signal});
  await getLatestResults(id);
  const urls = fetch.mock.calls.map(([url]) => new URL(url, 'http://localhost'));
  expect(urls.map(url => url.pathname)).toEqual([
    '/api/virtual/display', '/api/virtual/display/queue', '/api/virtual/results/latest',
  ]);
  urls.forEach(url => expect(url.searchParams.get('leagueId')).toBe(id));
  urls.slice(0, 2).forEach(url => expect(url.searchParams.get('provider')).toBe('VirtualHorizon'));
  expect(fetch.mock.calls[0][1].signal).toBe(controller.signal);
  expect(fetch.mock.calls[1][1].signal).toBe(controller.signal);
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test');
});
