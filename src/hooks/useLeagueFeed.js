import {useCallback, useEffect, useRef, useState} from 'react';
import {DEFAULT_PROVIDER, getDisplay, getDisplayQueue} from '../services/virtualApi';
import connectSocket, {VIRTUAL_DISPLAY_UPDATED_EVENT, VIRTUAL_EVENTS_QUEUE_UPDATED_EVENT} from '../socketio.service';
import {reconcileCountdownDeadline} from '../components/countdownDeadline';
import {withServerClock} from '../services/serverClock';
import {bettingClosed, boardState} from '../components/boardLifecycle';

export const LEAGUES = [
  {id: '21', leagueId: '21', name: 'Champions', provider: DEFAULT_PROVIDER},
  {id: '78', leagueId: '78', name: 'EPL', provider: DEFAULT_PROVIDER},
];
export const LEAGUE_STORAGE_KEY = 'virtualDisplayLeagueId';
export const readSelectedLeague = () => {
  try {
    const stored = localStorage.getItem(LEAGUE_STORAGE_KEY);
    return LEAGUES.some(({id}) => id === stored) ? stored : '21';
  } catch { return '21'; }
};
const token = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const boardOf = payload => payload?.currentBoard ?? payload?.display ?? payload?.data ?? payload;
const deadline = board => board?.nextRefreshAt ?? board?.boardEndAt ?? board?.endAt;
const stamp = payload => Math.max(...[payload?.lastRotationAt, payload?.lastUpdatedAt, payload?.updatedAt,
  payload?.observedAtUtc,
  payload?.currentBoard?.lastUpdatedAt, payload?.currentBoard?.updatedAt]
  .map(value => Date.parse(value) || 0));
export const weekKey = board => `${board.leagueId}:${board.providerEventId}`;
const emptyEntry = () => ({board: null, currentBoard: null, boards: [], selectedWeekKey: null,
  manualWeek: false, expired: {}, queue: null, loading: true, error: ''});

const validBoard = (board, id) => board && board.providerEventId != null &&
  String(board.providerEventId) !== '' && String(board.leagueId) === id &&
  (!board.provider || token(board.provider) === token(DEFAULT_PROVIDER));

// Current first, then provider queue order. Labels are deliberately not identities.
const collectBoards = (entry, id) => {
  const boards = new Map();
  [entry.currentBoard, ...(entry.queue?.nextBoards || []), ...(entry.queue?.retainedBoards || []),
    ...(entry.allBoards || entry.boards).filter(board=>['LIVE', 'CLOSED', 'FINISHED'].includes(board.state))].forEach(board => {
    if (!validBoard(board, id) || entry.expired[weekKey(board)]) return;
    const key = weekKey(board);
    if (!boards.has(key)) boards.set(key, board);
  });
  return [...boards.values()];
};
const reconcileSelection = (entry, id, explicitSelection = false) => {
  const allBoards = collectBoards(entry, id);
  const eligible = board => board?.events?.length > 0 && !bettingClosed(board);
  const upcoming = allBoards.filter(board => boardState(board) === 'UPCOMING');
  const boards = upcoming.slice(Math.max(0, upcoming.findIndex(eligible))).slice(0, 5);
  const selected = boards.find(board => weekKey(board) === entry.selectedWeekKey);
  const preserve = selected && (explicitSelection || (entry.manualWeek && eligible(selected)));
  // Never promote a closed/unavailable fallback. With no upcoming event, the
  // existing selection may remain visible with betting disabled.
  const board = (preserve && selected) || boards.find(eligible) || selected ||
    allBoards.find(board => weekKey(board) === entry.selectedWeekKey) || null;
  return {...entry, allBoards, boards, board, selectedWeekKey: board ? weekKey(board) : null,
    manualWeek: Boolean(preserve), loading: false,
    error: board?.events?.length ? '' : 'League temporarily unavailable'};
};

const completedResult = board => {
  if (board?.state === 'LIVE' || board?.state === 'UPCOMING') return false;
  if (board?.state === 'FINISHED') return true;
  const complete = status => ['COMPLETED', 'DISPLAY_RESULTS', 'RESULTS', 'FT'].includes(String(status || '').toUpperCase());
  return complete(board?.status) || (board?.matches?.length > 0 && board.matches.every(match =>
    complete(match.status) || (!match.status && match.homeScore != null && match.awayScore != null)));
};

// A timing-only message may extend the same event, but must never attach old odds
// to a new event identity. Every merge is confined to one numeric league key.
export const mergeBoard = (current, incoming) => {
  if (!current) return incoming;
  if (stamp(incoming) < stamp(current)) return current;
  if (String(current.providerEventId) !== String(incoming.providerEventId)) return incoming;
  const rank = {UPCOMING:0,LIVE:1,CLOSED:1,FINISHED:2};
  if ((rank[current.state] || 0) > (rank[incoming.state] || 0)) return current;
  const decision = reconcileCountdownDeadline({
    currentProviderEventId: current.providerEventId, currentDeadline: deadline(current),
    incomingProviderEventId: incoming.providerEventId, incomingDeadline: deadline(incoming),
  });
  return {...current, ...incoming,
    events: incoming.events?.length ? incoming.events : current.events,
    nextRefreshAt: decision.deadline};
};

export default function useLeagueFeed() {
  const [leagueId, setLeagueId] = useState(readSelectedLeague);
  const [byLeague, setByLeague] = useState({});
  const [connected, setConnected] = useState(false);
  const revisions = useRef({});
  const sequences = useRef({});
  const active = useRef(leagueId);
  active.current = leagueId;

  const apply = useCallback((id, payload, isQueue = false) => {
    const board = boardOf(payload);
    const payloadId = board?.leagueId ?? payload?.leagueId;
    if (payloadId != null && String(payloadId) !== id) return;
    if (board?.provider && token(board.provider) !== token(DEFAULT_PROVIDER)) return;
      if (isQueue && (payload?.nextBoards || []).some(next => !validBoard(next, id))) return;
    setByLeague(cache => {
      const entry = cache[id] || emptyEntry();
      if (isQueue && stamp(payload) < stamp(entry.queue)) return cache;
      if (stamp(payload) < Math.max(stamp(entry.currentBoard), stamp(entry.queue))) return cache;
      const incoming = validBoard(board, id) ? {
        ...board, lastUpdatedAt: payload.lastRotationAt || board.lastUpdatedAt || payload.lastUpdatedAt,
      } : null;
      // Merge only the same event's cached odds, never the previously selected week.
      const cachedBoards = entry.allBoards || entry.boards;
      const cached = incoming && cachedBoards.find(item => weekKey(item) === weekKey(incoming));
      const currentBoard = incoming && !entry.expired[weekKey(incoming)]
        ? mergeBoard(entry.currentBoard, mergeBoard(cached, incoming)) : entry.currentBoard;
      const queue = isQueue ? {...payload, nextBoards: (payload.nextBoards || []).map(next =>
        mergeBoard(cachedBoards.find(item => weekKey(item) === weekKey(next)), next)),
        retainedBoards: (payload.retainedBoards || []).filter(next=>validBoard(next,id)).map(next=>
          mergeBoard(cachedBoards.find(item=>weekKey(item)===weekKey(next)),next))} : entry.queue;
      return {...cache, [id]: reconcileSelection({...entry, currentBoard, queue}, id)};
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    const id = leagueId;
    const controllers = new Set();
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      const sequence = sequences.current[id] = (sequences.current[id] || 0) + 1;
      const revision = revisions.current[id] || 0;
      const controller = new AbortController();
      controllers.add(controller);
      const valid = () => !disposed && active.current === id && sequences.current[id] === sequence;
      const requests = await Promise.allSettled([
        getDisplay(DEFAULT_PROVIDER, id, {signal: controller.signal}),
        getDisplayQueue(DEFAULT_PROVIDER, id, {signal: controller.signal}),
      ]);
      if (valid()) {
        // A socket delivered after this request began is more authoritative.
        if ((revisions.current[id] || 0) === revision) {
          requests.forEach((result, index) => {
            if (result.status === 'fulfilled') apply(id, result.value, index === 1);
          });
        }
        setByLeague(cache => ({...cache, [id]: {
          ...(cache[id] || emptyEntry()), loading: false,
          error: (!cache[id]?.board?.events?.length ||
            (requests.every(result => result.status === 'rejected') && (revisions.current[id] || 0) === revision))
            ? 'League temporarily unavailable' : (cache[id]?.error || ''),
        }}));
      }
      controllers.delete(controller);
      inFlight = false;
    };
    refresh();
    const interval = window.setInterval(refresh, 4000);
    const socket = connectSocket();
    socket.on('connect', refresh);
    socket.io.on('reconnect', refresh);
    return () => {
      disposed = true;
      controllers.forEach(controller => controller.abort());
      window.clearInterval(interval);
      socket.off('connect', refresh);
      socket.io.off('reconnect', refresh);
    };
  }, [leagueId, apply]);

  useEffect(() => {
    const socket = connectSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onEvent = (event, payload) => {
      payload = withServerClock(payload);
      const isResult = event === 'resultsUpdated';
      if (![VIRTUAL_DISPLAY_UPDATED_EVENT, VIRTUAL_EVENTS_QUEUE_UPDATED_EVENT].includes(event) && !isResult) return;
      const board = isResult ? payload?.latestResult ?? payload?.result ?? payload?.data ?? payload : boardOf(payload);
      const id = String(board?.leagueId ?? (isResult ? board?.providerLeagueId : payload?.leagueId) ?? '');
      if (!LEAGUES.some(league => league.id === id)) return;
      if (token(board?.provider ?? payload?.provider) !== token(DEFAULT_PROVIDER)) return;
      if (isResult && (board?.providerEventId == null || !completedResult(board))) return;
      revisions.current[id] = (revisions.current[id] || 0) + 1;
      if (isResult) {
        setByLeague(cache => {
          const entry = cache[id] || emptyEntry();
          const key = weekKey({...board, leagueId: id});
            const finish = previous => previous && weekKey(previous)===key ? mergeBoard(previous, {
             ...board, state:'FINISHED', bettingAllowed:false, leagueId:id,
              observedAtUtc: board.observedAtUtc || board.updatedAt || board.lastUpdatedAt || previous.observedAtUtc || previous.lastUpdatedAt,
              events: (previous.events || []).map(event=>({...event,...board.matches?.find(m=>String(m.providerMatchId)===String(event.providerMatchId || event.matchId))})),
          }) : previous;
          return {...cache, [id]: reconcileSelection({...entry, currentBoard:finish(entry.currentBoard),
            allBoards:(entry.allBoards || entry.boards).map(finish), boards:entry.boards.map(finish),
            queue:entry.queue && {...entry.queue,nextBoards:(entry.queue.nextBoards || []).map(finish),
              retainedBoards:(entry.queue.retainedBoards || []).map(finish)}}, id)};
        });
        return;
      }
      apply(id, payload, event === VIRTUAL_EVENTS_QUEUE_UPDATED_EVENT);
    };
    setConnected(Boolean(socket.connected));
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    socket.onAny(onEvent);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
      socket.offAny(onEvent);
    };
  }, [apply]);

  const selectLeague = id => {
    if (!LEAGUES.some(league => league.id === String(id))) return;
    active.current = String(id);
    try { localStorage.setItem(LEAGUE_STORAGE_KEY, String(id)); } catch { /* Storage may be disabled. */ }
    setLeagueId(String(id));
  };
  const selectWeek = key => {
    const entry = byLeague[leagueId];
    if (entry?.selectedWeekKey === key || !entry?.boards.some(board => weekKey(board) === key)) return;
    // A refresh begun before this click cannot withdraw the newly selected cached week.
    revisions.current[leagueId] = (revisions.current[leagueId] || 0) + 1;
    setByLeague(cache => ({...cache, [leagueId]: reconcileSelection({
      ...cache[leagueId], selectedWeekKey: key, manualWeek: true,
    }, leagueId, true)}));
  };
  return {leagueId, selectLeague, selectWeek, byLeague, connected, ...(byLeague[leagueId] || emptyEntry())};
}
