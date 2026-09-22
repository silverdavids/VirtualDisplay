import {act, renderHook} from '@testing-library/react';
import useLeagueFeed, {LEAGUE_STORAGE_KEY, mergeBoard, weekKey} from './useLeagueFeed';
import {getDisplay, getDisplayQueue} from '../services/virtualApi';
import connectSocket from '../socketio.service';

jest.mock('../services/virtualApi', () => ({
  DEFAULT_PROVIDER: 'VirtualHorizon', getDisplay: jest.fn(), getDisplayQueue: jest.fn(),
}));
jest.mock('../socketio.service', () => ({
  __esModule: true, default: jest.fn(),
  VIRTUAL_DISPLAY_UPDATED_EVENT: 'virtual-display-updated',
  VIRTUAL_EVENTS_QUEUE_UPDATED_EVENT: 'virtual-events-queue-updated',
}));

const board = (leagueId, event = 'current', seconds = 60) => ({
  provider: 'VirtualHorizon', leagueId, providerEventId: event, leagueNumber: '9999',
  weekNumber: 1, lastUpdatedAt: new Date().toISOString(),
  nextRefreshAt: new Date(Date.now() + seconds * 1000).toISOString(),
  events: [{providerMatchId: 'shared-match', homeTeam: `${leagueId}-${event}`, markets: []}],
});
const queue = (id, event = 'current') => ({
  currentBoard: board(id, event), nextBoards: [board(id, `${event}-next`, 120)],
  lastUpdatedAt: new Date().toISOString(), lastRotationAt: null,
});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
let socket;
const flush = () => act(async () => { await Promise.resolve(); });
const emit = (name, payload) => act(() => socket.onAny.mock.calls.at(-1)[0](name, payload));

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-10T12:00:00Z'));
  jest.clearAllMocks();
  localStorage.clear();
  socket = {connected: true, on: jest.fn(), off: jest.fn(), onAny: jest.fn(), offAny: jest.fn(),
    io: {on: jest.fn(), off: jest.fn()}};
  connectSocket.mockReturnValue(socket);
  getDisplay.mockImplementation(async (_, id) => board(id));
  getDisplayQueue.mockImplementation(async (_, id) => queue(id));
});
afterEach(() => jest.useRealTimers());

test.each(['21', '78'])('rolls %s from week 5 to first usable upcoming week in provider order via REST and sockets', async id => {
  localStorage.setItem(LEAGUE_STORAGE_KEY, id);
  const initial = {...board(id, 'five'), state: 'UPCOMING', weekNumber: 5};
  getDisplay.mockResolvedValue(initial);
  getDisplayQueue.mockResolvedValue({currentBoard: initial, nextBoards: []});
  const {result} = renderHook(useLeagueFeed);
  await flush();
  const closed = {...initial, state: 'CLOSED', bettingAllowed: false};
  const next = {...board(id, 'twenty-six', 180), state: 'UPCOMING', weekNumber: 26};
  const payload = {currentBoard: closed, nextBoards: [
    {...board(id, 'finished'), state: 'FINISHED'},
    {...board(id, 'stale'), isStale: true},
    {...board(id, 'unavailable'), available: false},
    {...board(id, 'expired', -1)}, next, {...board(id, 'one'), weekNumber: 1},
  ]};
  getDisplay.mockResolvedValue(closed);
  getDisplayQueue.mockResolvedValue(payload);
  await act(async () => jest.advanceTimersByTime(4000));
  expect(result.current.selectedWeekKey).toBe(`${id}:twenty-six`);
  expect(result.current.board.events).toEqual(next.events);
  expect(result.current.board.nextRefreshAt).toBe(next.nextRefreshAt);
  expect(result.current.boards[0]).toEqual(next);
  emit('virtual-events-queue-updated', {...payload, nextBoards: payload.nextBoards.map(item =>
    item === next ? {...next, state: 'LIVE', bettingAllowed: false} : item)});
  expect(result.current.selectedWeekKey).toBe(`${id}:one`);
});

test('does not automatically select a closed board when no upcoming board exists', async () => {
  const closed = {...board('21'), state: 'CLOSED'};
  getDisplay.mockResolvedValue(closed);
  getDisplayQueue.mockResolvedValue({currentBoard: closed, nextBoards: []});
  const {result} = renderHook(useLeagueFeed);
  await flush();
  expect(result.current.board).toBeNull();
  expect(result.current.boards).toHaveLength(0);
  act(() => result.current.selectWeek('21:current'));
  expect(result.current.board).toBeNull();
});

test('defaults to Champions, loads both endpoints, and retains independent boards and queues', async () => {
  const {result} = renderHook(useLeagueFeed);
  expect(result.current.leagueId).toBe('21');
  expect(result.current.loading).toBe(true);
  await flush();
  expect(getDisplay).toHaveBeenCalledWith('VirtualHorizon', '21', expect.any(Object));
  expect(getDisplayQueue).toHaveBeenCalledWith('VirtualHorizon', '21', expect.any(Object));
  act(() => result.current.selectLeague('78'));
  await flush();
  expect(result.current.board.leagueId).toBe('78');
  expect(result.current.byLeague['21'].queue.currentBoard.leagueId).toBe('21');
  expect(result.current.byLeague['78'].queue.currentBoard.leagueId).toBe('78');
  act(() => result.current.selectLeague('21'));
  expect(result.current.board.leagueId).toBe('21');
  await flush();
  expect(getDisplay).toHaveBeenLastCalledWith('VirtualHorizon', '21', expect.any(Object));
});

test('inactive socket rollover updates only its cache, including queue and countdown', async () => {
  const {result} = renderHook(useLeagueFeed);
  await flush();
  act(() => result.current.selectLeague('78'));
  await flush();
  const epl = result.current.board;
  act(() => jest.advanceTimersByTime(1000));
  emit('virtual-events-queue-updated', queue('21', 'rolled'));
  expect(result.current.board).toBe(epl);
  expect(result.current.byLeague['21'].board.providerEventId).toBe('rolled');
  const pending = deferred();
  getDisplay.mockReturnValue(pending.promise);
  act(() => result.current.selectLeague('21'));
  expect(result.current.board.providerEventId).toBe('rolled');
  expect(result.current.queue.nextBoards[0].providerEventId).toBe('rolled-next');
  expect(result.current.board.nextRefreshAt).not.toBe(epl.nextRefreshAt);
  emit('virtual-display-updated', board('78', 'epl-rolled'));
  expect(result.current.board.providerEventId).toBe('rolled');
  expect(result.current.byLeague['78'].board.providerEventId).toBe('epl-rolled');
});

test('late HTTP responses and errors cannot replace the active league after rapid switching', async () => {
  const late = deferred();
  getDisplay.mockImplementation((_, id) => id === '21' ? late.promise : Promise.resolve(board(id)));
  const {result} = renderHook(useLeagueFeed);
  act(() => result.current.selectLeague('78'));
  await flush();
  await act(async () => late.resolve(board('21', 'late')));
  expect(result.current.board.leagueId).toBe('78');
  expect(result.current.error).toBe('');
  expect(getDisplay.mock.calls[0][2].signal.aborted).toBe(true);
});

test('an HTTP request started before a socket rollover cannot roll the board back', async () => {
  const pending = deferred();
  getDisplay.mockReturnValue(pending.promise);
  const {result} = renderHook(useLeagueFeed);
  emit('virtual-display-updated', board('21', 'new'));
  await act(async () => pending.resolve(board('21', 'old')));
  expect(result.current.board.providerEventId).toBe('new');
});

test('refresh and reconnect restore valid stored league and invalid storage defaults to Champions', async () => {
  localStorage.setItem(LEAGUE_STORAGE_KEY, '78');
  const {result, unmount} = renderHook(useLeagueFeed);
  await flush();
  expect(result.current.board.leagueId).toBe('78');
  await act(async () => socket.io.on.mock.calls.find(([name]) => name === 'reconnect')[1]());
  expect(getDisplay).toHaveBeenLastCalledWith('VirtualHorizon', '78', expect.any(Object));
  unmount();
  localStorage.setItem(LEAGUE_STORAGE_KEY, '9999');
  const next = renderHook(useLeagueFeed);
  await flush();
  expect(next.result.current.leagueId).toBe('21');
});

test('one league can fail while the other works, and the four-second retry recovers it', async () => {
  getDisplay.mockImplementation((_, id) => id === '78' ? Promise.reject(new Error('Unavailable')) : Promise.resolve(board(id)));
  getDisplayQueue.mockImplementation((_, id) => id === '78' ? Promise.reject(new Error('Unavailable')) : Promise.resolve(queue(id)));
  const {result} = renderHook(useLeagueFeed);
  await flush();
  act(() => result.current.selectLeague('78'));
  await flush();
  expect(result.current.error).toBe('League temporarily unavailable');
  expect(result.current.byLeague['21'].board.leagueId).toBe('21');
  getDisplay.mockImplementation(async (_, id) => board(id));
  getDisplayQueue.mockImplementation(async (_, id) => queue(id));
  await act(async () => jest.advanceTimersByTime(4000));
  expect(result.current.error).toBe('');
  expect(result.current.board.leagueId).toBe('78');
  act(() => result.current.selectLeague('21'));
  await flush();
  expect(result.current.board.leagueId).toBe('21');
});

test('rejects mismatched numeric identity even when provider league numbers coincide', async () => {
  getDisplay.mockResolvedValue(board('78'));
  getDisplayQueue.mockResolvedValue(queue('78'));
  const {result} = renderHook(useLeagueFeed);
  await flush();
  expect(result.current.board).toBeNull();
  emit('virtual-display-updated', {...board('21'), provider: 'Other'});
  expect(result.current.board).toBeNull();
});

test('timing-only rollover cannot submit cached odds with the next event identity', () => {
  const current = board('21');
  expect(mergeBoard(current, {...board('21', 'next'), events: []}).events).toEqual([]);
  expect(mergeBoard(current, {...current, events: []}).events).toEqual(current.events);
});

test('combines current and queue in provider order, deduplicating event identities but not week labels', async () => {
  const current = {...board('21'), weekNumber: 38};
  const first = {...board('21', 'first', 120), weekNumber: 1};
  const second = {...board('21', 'second', 180), weekNumber: 2};
  const duplicateLabel = {...board('21', 'another-first', 240), weekNumber: 1};
  getDisplay.mockResolvedValue(current);
  getDisplayQueue.mockResolvedValue({currentBoard: current, nextBoards: [current, first, second, first, duplicateLabel]});
  const {result} = renderHook(useLeagueFeed);
  await flush();
  expect(result.current.boards.map(item => item.weekNumber)).toEqual([38, 1, 2, 1]);
  expect(result.current.boards.map(weekKey)).toEqual(['21:current', '21:first', '21:second', '21:another-first']);
  expect(result.current.selectedWeekKey).toBe('21:current');
});

test('cached week selection changes fixtures and timing without a request and restores independently per league', async () => {
  const {result} = renderHook(useLeagueFeed);
  await flush();
  const calls = getDisplay.mock.calls.length;
  act(() => result.current.selectWeek('21:current-next'));
  expect(result.current.board.events[0].homeTeam).toBe('21-current-next');
  expect(result.current.board.nextRefreshAt).toBe(board('21', 'current-next', 120).nextRefreshAt);
  expect(getDisplay).toHaveBeenCalledTimes(calls);
  expect(getDisplayQueue).toHaveBeenCalledTimes(calls);
  act(() => result.current.selectLeague('78'));
  await flush();
  expect(result.current.selectedWeekKey).toBe('78:current');
  act(() => result.current.selectWeek('78:current-next'));
  act(() => result.current.selectLeague('21'));
  await flush();
  expect(result.current.selectedWeekKey).toBe('21:current-next');
  act(() => result.current.selectLeague('78'));
  await flush();
  expect(result.current.selectedWeekKey).toBe('78:current-next');
});

test('display and queue sockets preserve a manually selected valid week, then remove withdrawn events', async () => {
  const {result} = renderHook(useLeagueFeed);
  await flush();
  act(() => result.current.selectWeek('21:current-next'));
  emit('virtual-display-updated', board('21', 'new-current'));
  expect(result.current.selectedWeekKey).toBe('21:current-next');
  emit('virtual-events-queue-updated', {currentBoard: board('21', 'new-current'),
    nextBoards: [board('21', 'current-next', 120), board('21', 'added', 180)]});
  expect(result.current.boards.map(weekKey)).toEqual(['21:new-current', '21:current-next', '21:added']);
  expect(result.current.selectedWeekKey).toBe('21:current-next');
  emit('virtual-events-queue-updated', {currentBoard: board('78'), nextBoards: [board('78', 'epl-added')]});
  expect(result.current.byLeague['78'].boards.map(weekKey)).toEqual(['78:current', '78:epl-added']);
  expect(result.current.selectedWeekKey).toBe('21:current-next');
  emit('virtual-events-queue-updated', {currentBoard: board('21', 'new-current'), nextBoards: [board('21', 'added')]});
  expect(result.current.boards.map(weekKey)).toEqual(['21:new-current', '21:added']);
  expect(result.current.selectedWeekKey).toBe('21:new-current');
});

test('a response begun before week selection cannot withdraw or overwrite the selected cached event', async () => {
  const {result} = renderHook(useLeagueFeed);
  await flush();
  const pending = deferred();
  getDisplayQueue.mockReturnValue(pending.promise);
  await act(async () => jest.advanceTimersByTime(4000));
  act(() => result.current.selectWeek('21:current-next'));
  await act(async () => pending.resolve({currentBoard: board('21'), nextBoards: []}));
  expect(result.current.selectedWeekKey).toBe('21:current-next');
  expect(result.current.boards).toHaveLength(2);
});

test('completed results retain the identified league/event as finished without reopening it', async () => {
  const {result} = renderHook(useLeagueFeed);
  await flush();
  const completion = id => ({provider: 'VirtualHorizon', leagueId: id, providerEventId: 'current',
    matches: [{status: 'COMPLETED', homeScore: 2, awayScore: 1}]});
  emit('resultsUpdated', {...completion('78'), leagueNumber: '9999'});
  expect(result.current.selectedWeekKey).toBe('21:current');
  emit('resultsUpdated', {...completion('21'), matches: [{status: 'LIVE'}]});
  expect(result.current.selectedWeekKey).toBe('21:current');
  emit('resultsUpdated', {latestResult: completion('21')});
  expect(result.current.boards.map(weekKey)).toEqual(['21:current-next']);
  expect(result.current.selectedWeekKey).toBe('21:current-next');
  expect(result.current.allBoards.find(item => item.providerEventId === 'current').state).toBe('FINISHED');
  expect(result.current.allBoards.find(item => item.providerEventId === 'current').bettingAllowed).toBe(false);
  await act(async () => jest.advanceTimersByTime(4000));
  expect(result.current.selectedWeekKey).toBe('21:current-next');
  expect(result.current.allBoards.find(item => item.providerEventId === 'current').state).toBe('FINISHED');
  emit('virtual-events-queue-updated', {currentBoard: board('21', 'current-next'), nextBoards: [board('21', 'third')]});
  expect(result.current.boards.map(weekKey)).toEqual(['21:current-next', '21:third']);
  expect(result.current.selectedWeekKey).toBe('21:current-next');
});

test('results for the current event preserve a manually selected later week and stale queues are ignored', async () => {
  const {result} = renderHook(useLeagueFeed);
  await flush();
  act(() => result.current.selectWeek('21:current-next'));
  emit('resultsUpdated', {provider: 'VirtualHorizon', providerLeagueId: 21, providerEventId: 'current', status: 'COMPLETED'});
  expect(result.current.selectedWeekKey).toBe('21:current-next');
  emit('virtual-events-queue-updated', {currentBoard: board('21', 'current-next'), nextBoards: [board('21', 'third')],
    lastUpdatedAt: new Date(Date.now() + 1000).toISOString()});
  emit('virtual-events-queue-updated', {...queue('21'), nextBoards: []});
  expect(result.current.boards.map(weekKey)).toEqual(['21:current-next', '21:third']);
});

