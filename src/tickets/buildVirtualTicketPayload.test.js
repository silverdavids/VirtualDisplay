import {buildVirtualTicketPayload} from './buildVirtualTicketPayload';

const display = {provider: 'VirtualHorizon', providerEventId: 769363541};
const selection = (overrides = {}) => ({
  providerMatchId: '2551210593',
  matchId: 2551210593,
  matchOddId: null,
  homeTeam: 'BEN',
  awayTeam: 'CEL',
  market: '1X2',
  option: '1',
  line: null,
  odd: 3.16,
  shortCode: '',
  ...overrides,
});
const payloadFor = (pick) => buildVirtualTicketPayload({display, slip: [pick], stake: 1000, now: 1});

test.each([
  ['1X2 / option 1', selection()],
  ['1X2 / option X', selection({option: 'X'})],
  ['BTS', selection({market: 'BTS', option: 'GG'})],
  ['DC', selection({market: 'DC', option: '1X'})],
])('%s keeps a missing source line null', (_name, pick) => {
  const payload = payloadFor(pick);

  expect(payload).toMatchObject({providerEventId: '769363541'});
  expect(payload.selections[0]).toMatchObject({
    providerMatchId: '2551210593',
    line: null,
    odd: 3.16,
  });
});

test('retains a genuine source line unchanged', () => {
  expect(payloadFor(selection({market: 'OU', option: 'OV2.5', line: 2.5})).selections[0].line).toBe(2.5);
});

test('preserves MatchOddId when supplied', () => {
  expect(payloadFor(selection({matchOddId: 17451454})).selections[0].matchOddId).toBe(17451454);
});

test('keeps a missing MatchOddId null', () => {
  expect(payloadFor(selection()).selections[0].matchOddId).toBeNull();
});
