import capture from './fixtures/real-feed.json';
import {applyTVPayload,emptyFeed,visibleFeed,marketRows,oddFor,standardColumns,supportedViews,FEED_TTL,RESULTS_TTL} from './tvData';
const copy = value => JSON.parse(JSON.stringify(value));
const now = Date.parse(capture.rest['21-queue'].receivedAt);
const initial = id => applyTVPayload(emptyFeed(),id,'queue',capture.rest[`${id}-queue`].payload,now);

test.each(['21','78'])('captured %s queue has ten fixtures and all required odds views', id => {
  const feed = visibleFeed(initial(id),now);
  const rows = marketRows(feed.board);
  expect(rows).toHaveLength(10);
  const missing=rows.flatMap(row=>standardColumns.filter(([code,label])=>!oddFor(row,code,label))
    .map(([code,label])=>`${row.home}-${row.away}:${code}:${label}`));
  expect(missing).toEqual(id==='21' ? ['RMA-ZEN:DC:1X'] : []);
  expect(rows.every(row=>row.marketsNormalized.find(m=>m.code==='CS').selections.length === 28)).toBe(true);
  expect(supportedViews(feed)).toEqual(expect.arrayContaining(['standard','totals','home-totals','away-totals','result-1.5','result-2.5','correct-score']));
  expect(feed.board.weekNumber).toBe(id === '21' ? '24' : '11');
  expect(feed.standings).toEqual([]);
});

test('provider order survives wraparound and closure instead of sorting numbers', () => {
  const q = copy(capture.rest['21-queue'].payload);
  [q.currentBoard,...q.nextBoards].forEach((board,index)=>{board.weekNumber=[38,1,2,3,4,5,6][index];board.state='UPCOMING';board.startedAtUtc=null;board.BettingOpen=true;board.bettingAllowed=true;board.startAt='2026-09-18T14:10:00Z';});
  let state = applyTVPayload(emptyFeed(),'21','queue',q,now);
  expect(visibleFeed(state,now).board.weekNumber).toBe(38);
  q.currentBoard.state='CLOSED';q.currentBoard.BettingOpen=false;
  q.lastUpdatedAt=new Date(now+1000).toISOString();
  state=applyTVPayload(state,'21','queue',q,now+1000);
  expect(visibleFeed(state,now+1000).board.weekNumber).toBe(1);
});

test('captured league-qualified sockets cannot alter another league or regress a newer snapshot', () => {
  const state=initial('21');
  const epl=capture.sockets.find(item=>item.leagueId==='78' && item.event==='virtual-events-queue-updated');
  expect(applyTVPayload(state,'21','queue',epl.payload,now)).toBe(state);
  const latest=capture.sockets.filter(item=>item.leagueId==='21' && item.event==='virtual-events-queue-updated').at(-1);
  const updated=applyTVPayload(state,'21','queue',latest.payload,Date.parse(latest.receivedAt));
  expect(applyTVPayload(updated,'21','queue',capture.rest['21-queue'].payload,now+1000)).toBe(updated);
});

test('upcoming boards without usable odds do not block the next provider-ordered week', () => {
  const state=initial('21');
  const first=visibleFeed(state,now).board;
  const unpriced={...state,boards:state.boards.map(board=>board===first ? {...board,
    events:board.events.map(event=>({...event,markets:[]}))} : board)};
  const next=visibleFeed(unpriced,now).board;
  expect(next).not.toBeNull();
  expect(next.providerEventId).not.toBe(first.providerEventId);
  expect(state.boards.indexOf(next)).toBeGreaterThan(state.boards.indexOf(first));
});

test('the clock advances to the next week at kickoff without waiting for a socket', () => {
  const state=initial('21');
  const upcoming=visibleFeed(state,now).board;
  const boards=state.boards.map(board=>({...board,serverClockOffsetMs:0,
    scheduledStartAtUtc:new Date(now+(board===upcoming ? 1000 : 20000)).toISOString()}));
  const before=visibleFeed({...state,boards},now);
  const after=visibleFeed({...state,boards},now+1000);
  expect(before.board.providerEventId).toBe(upcoming.providerEventId);
  expect(after.board).not.toBeNull();
  expect(after.board.providerEventId).not.toBe(upcoming.providerEventId);
});

test('disconnection and repeated old responses cannot keep fixtures alive indefinitely', () => {
  const state=initial('21');
  expect(visibleFeed(state,now+FEED_TTL+1).board).toBeNull();
  const replay=applyTVPayload(state,'21','queue',capture.rest['21-queue'].payload,now+FEED_TTL+1);
  expect(visibleFeed(replay,now+FEED_TTL+1).board).toBeNull();
});

test.each(['21','78'])('captured %s results expire, are isolated, and reject older completions', id => {
  const state=applyTVPayload(initial(id),id,'results',capture.rest[`${id}-results`].payload,now);
  expect(visibleFeed(state,now).result.matches).toHaveLength(10);
  expect(visibleFeed(state,now+RESULTS_TTL+1).result).toBeNull();
  expect(applyTVPayload(state,id,'results',capture.rest[`${id==='21'?'78':'21'}-results`].payload,now)).toBe(state);
});

test('captured result socket shape updates the ticker despite lacking completedAtUtc', () => {
  const event=capture.sockets.find(item=>item.event==='resultsUpdated');
  const state=applyTVPayload(initial('78'),'78','results',event.payload,Date.parse(event.receivedAt));
  expect(visibleFeed(state,Date.parse(event.receivedAt)).result.matches).toHaveLength(10);
});

test('synthetic live deltas over captured fixtures update scores monotonically without leaking leagues', () => {
  const original=initial('21');
  const board={...original.boards[0],state:'LIVE',minute:24,observedAtUtc:new Date(now+1000).toISOString(),
    events:original.boards[0].events.map(event=>({...event,homeScore:1,awayScore:0}))};
  const first=applyTVPayload(original,'21','display',board,now+1000);
  const second=applyTVPayload(first,'21','display',{...board,minute:40,observedAtUtc:new Date(now+2000).toISOString(),
    events:board.events.map(event=>({...event,awayScore:1}))},now+2000);
  expect(visibleFeed(second,now+2000).live.events[0].awayScore).toBe(1);
  expect(visibleFeed(second,now+2000).live.minute).toBe(40);
  expect(applyTVPayload(second,'21','display',board,now+3000)).toBe(second);
});

test('missing markets and optional metadata never become supported views', () => {
  const q=copy(capture.rest['78-queue'].payload);
  [q.currentBoard,...q.nextBoards].forEach(board=>board.events.forEach(event=>event.markets=[]));
  const feed=visibleFeed(applyTVPayload(emptyFeed(),'78','queue',q,now),now);
  expect(supportedViews(feed)).toEqual([]);
});
