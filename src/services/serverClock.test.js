import {withServerClock} from './serverClock';

test('applies a UTC clock measurement to current and queued boards using request midpoint', () => {
  const server = Date.parse('2026-09-13T10:00:00Z');
  const result = withServerClock({serverTimeUtc:new Date(server).toISOString(),
    currentBoard:{providerEventId:'current'},nextBoards:[{providerEventId:'next'}]},server+17100,server+16900);
  expect(result.currentBoard.serverClockOffsetMs).toBe(-17000);
  expect(result.nextBoards[0].serverClockOffsetMs).toBe(-17000);
  expect(withServerClock({providerEventId:'legacy'})).toEqual({providerEventId:'legacy'});
});
