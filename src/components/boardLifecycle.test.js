import {boardState,bettingClosed,boardNow,closedBoardMessage} from './boardLifecycle';
import {mergeBoard} from '../hooks/useLeagueFeed';
test('UTC kickoff is an inclusive boundary and cached odds cannot reopen live or finished boards',()=>{
  const board={state:'UPCOMING',scheduledStartAtUtc:'2026-09-12T10:00:00Z'};
  expect(bettingClosed(board,Date.parse('2026-09-12T09:59:59.999Z'))).toBe(false);
  expect(bettingClosed(board,Date.parse(board.scheduledStartAtUtc))).toBe(true);
  for(const state of ['LIVE','FINISHED']) expect(bettingClosed({...board,state},0)).toBe(true);
  expect(boardState({...board,state:'FINISHED'})).toBe('FINISHED');
});

test('positive upcoming countdown tolerates omitted optional permission fields but honors explicit closure', () => {
  const now = Date.parse('2026-09-13T10:00:00Z');
  const board = {state:'UPCOMING',scheduledStartAtUtc:new Date(now+16000).toISOString(),events:[{}]};
  expect(bettingClosed(board,now)).toBe(false);
  for (const patch of [{BettingOpen:false},{bettingOpen:false},{bettingAllowed:false},
    {available:false},{suspended:true},{isStale:true},{state:'LIVE'},{state:'FINISHED'}]) {
    expect(bettingClosed({...board,...patch},now)).toBe(true);
  }
  expect(bettingClosed({...board,BettingOpen:true},now+16000)).toBe(true);
  expect(bettingClosed({},now)).toBe(true);
  expect(closedBoardMessage(board,now+16000)).toBe('Betting closed – games in progress');
  expect(closedBoardMessage(null,now)).toBe('Waiting for the next virtual event');
  expect(closedBoardMessage({...board,available:false},now)).toBe('Waiting for the next virtual event');
  expect(closedBoardMessage({...board,bettingAllowed:false},now)).toBe('Betting temporarily unavailable');
});

test('uses measured server clock offset for both countdown and kickoff boundary', () => {
  const now = Date.parse('2026-09-13T10:00:17Z');
  const board = {state:'UPCOMING',scheduledStartAtUtc:'2026-09-13T10:00:33Z',serverClockOffsetMs:-17000};
  expect((Date.parse(board.scheduledStartAtUtc)-boardNow(board,now))/1000).toBe(33);
  expect(bettingClosed(board,now+16000)).toBe(false);
  expect(bettingClosed(board,now+33000)).toBe(true);
});
test('newer score changes are independent and stale or regressive board updates are ignored',()=>{
  const live={providerEventId:'event',leagueId:21,state:'LIVE',observedAtUtc:'2026-09-12T10:00:01Z',
    events:[{providerMatchId:'a',homeScore:1,awayScore:0},{providerMatchId:'b',homeScore:0,awayScore:0}]};
  expect(mergeBoard(live,{...live,observedAtUtc:'2026-09-12T10:00:00Z',events:[]})).toBe(live);
  expect(mergeBoard(live,{...live,state:'UPCOMING',observedAtUtc:'2026-09-12T10:00:02Z'})).toBe(live);
  const next=mergeBoard(live,{...live,minute:38,observedAtUtc:'2026-09-12T10:00:02Z',events:[live.events[0],{...live.events[1],awayScore:1}]});
  expect(next.events[0].homeScore).toBe(1);expect(next.events[1].awayScore).toBe(1);expect(next.minute).toBe(38);
});
