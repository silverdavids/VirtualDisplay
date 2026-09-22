import {normalizeEventMarkets} from '../components/Grid';
import {bettingClosed, boardState, boardDeadline, boardNow} from '../components/boardLifecycle';
import {withServerClock} from '../services/serverClock';

export const TV_LEAGUES = {'21':'Champions', '78':'EPL'};
export const FEED_TTL = 45000;
export const RESULTS_TTL = 15 * 60000;
export const unwrap = payload => payload?.latestResult ?? payload?.result ?? payload?.data ?? payload;
const token = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g,'');
export const identityMatches = (board, id) => String(board?.leagueId ?? board?.providerLeagueId) === id &&
  token(board?.provider) === 'virtualhorizon';
export const timestamp = payload => Math.max(0, ...['lastUpdatedAt','lastRotationAt','observedAtUtc',
  'sourceUpdatedAtUtc','updatedAt','completedAtUtc','capturedAt','lastSeenAtUtc','receivedAt','receivedByApiAt'].map(key => Date.parse(payload?.[key]) || 0));
const key = board => String(board?.providerEventId);
export const emptyFeed = () => ({boards:[], result:null, queueStamp:0, displayStamp:0, resultStamp:0,
  receivedAt:0, resultReceivedAt:0, serverStamp:0, standings:[], leagueLogo:null});
const merge = (previous, incoming) => {
  if (!previous) return incoming;
  if (timestamp(incoming) < timestamp(previous)) return previous;
  const rank = {UPCOMING:0,LIVE:1,CLOSED:1,FINISHED:2};
  if ((rank[incoming.state] || 0) < (rank[previous.state] || 0)) return previous;
  return {...previous,...incoming,events:incoming.events?.map(event => ({
    ...previous.events?.find(old => String(old.providerMatchId) === String(event.providerMatchId)),...event,
  })) ?? previous.events};
};
export const applyTVPayload = (entry, id, kind, raw, now = Date.now()) => {
  const payload = withServerClock(raw,now);
  if (kind === 'results') {
    const result = unwrap(payload);
    if (!identityMatches(result,id) || !Array.isArray(result.matches) ||
      !result.matches.some(match => match.homeScore != null && match.awayScore != null) ||
      timestamp(result) < entry.resultStamp) return entry;
    const previous = key(entry.result) === key(result) ? entry.result : entry.boards.find(board => key(board) === key(result));
    return {...entry,result:{...previous,...result},resultStamp:timestamp(result),resultReceivedAt:now,
      boards:entry.boards.map(board => key(board) === key(result) ? {...board,state:'FINISHED',bettingAllowed:false} : board)};
  }
  const current = kind === 'queue' ? payload.currentBoard : (payload.currentBoard ?? payload.display ?? payload);
  const rawBoards = kind === 'queue' ? [current,...(payload.nextBoards || []),...(payload.retainedBoards || [])] : [current];
  if (!rawBoards.some(board => identityMatches(board,id)) && !(kind === 'queue' && current === null && !payload.nextBoards?.length)) return entry;
  const updated = Math.max(timestamp(payload),timestamp(current));
  const serverStamp = Date.parse(current?.serverTimeUtc ?? payload.serverTimeUtc) || 0;
  if (updated < Math.max(entry.queueStamp,entry.displayStamp)) return entry;
  const incoming = rawBoards.filter(board => identityMatches(board,id) && board.providerEventId != null)
    .map(board => ({...board,lastUpdatedAt:board.lastUpdatedAt || payload.lastUpdatedAt}));
  const boards = kind === 'queue' ? incoming : entry.boards.map(board => incoming.find(next => key(next) === key(board)) || board);
  if (kind === 'display' && incoming[0] && !boards.some(board => key(board) === key(incoming[0]))) boards.unshift(incoming[0]);
  const seen = new Set();
  return {...entry,boards:boards.filter(board => {if(seen.has(key(board))) return false;seen.add(key(board));return true;})
    .map(board => merge(entry.boards.find(old => key(old) === key(board)),board)),
    [kind === 'queue' ? 'queueStamp' : 'displayStamp']:updated,
    receivedAt:updated > Math.max(entry.queueStamp,entry.displayStamp) || serverStamp > entry.serverStamp || !entry.receivedAt ? now : entry.receivedAt,
    serverStamp:Math.max(serverStamp,entry.serverStamp),
    standings:payload.standings ?? current?.standings ?? [], leagueLogo:payload.leagueLogo ?? current?.leagueLogo ?? null};
};

export const standardColumns = [
  ['1X2','1','1'],['1X2','X','X'],['1X2','2','2'],['DC','1X','1X'],['DC','12','12'],['DC','X2','X2'],
  ['BTS','GG','GG'],['BTS','NG','NG'],['OU','OV2.5','OV 2.5'],['OU','UN2.5','UN 2.5'],
];
export const marketRows = board => (board?.events || []).slice(0,10).map(event => ({...event,
  home:event.homeTeam ?? event.home,away:event.awayTeam ?? event.away,
  marketsNormalized:normalizeEventMarkets(event),
}));
export const oddFor = (event,code,label) => {
  if (event.blocked === true || event.blocked === 1 || event.blocked === '1' || event.suspended === true) return null;
  const selection = event.marketsNormalized?.find(market => market.code === code)?.selections.find(item => item.label === label);
  return Number(selection?.odd) > 0 && Number.isFinite(Number(selection?.odd)) ? Number(selection.odd) : null;
};
export const validStandings = rows => Array.isArray(rows) ? rows.filter(row =>
  (row.teamName || row.team) && Number.isFinite(Number(row.points)) && row.points != null) : [];
export const visibleFeed = (entry, now = Date.now()) => {
  const fresh = entry.receivedAt > 0 && now - entry.receivedAt < FEED_TTL;
  const boards = fresh ? entry.boards.filter(board => !board.isStale && board.available !== false &&
    (!timestamp(board) || boardNow(board,now) - timestamp(board) < FEED_TTL)) : [];
  const board = boards.find(board => !bettingClosed(board,now) && marketRows(board).some(row =>
    row.marketsNormalized.some(market => market.selections.some(selection => oddFor(row,market.code,selection.label))))) || null;
  const live = boards.find(board => boardState(board,now) === 'LIVE' && board.events?.some(event =>
    event.homeScore != null && event.awayScore != null)) || null;
  const result = now - entry.resultReceivedAt < RESULTS_TTL && now - entry.resultStamp < RESULTS_TTL ? entry.result : null;
  return {board,live,result,standings:fresh ? validStandings(entry.standings) : [],leagueLogo:entry.leagueLogo,
    countdown:board ? Math.max(0,Math.ceil((boardDeadline(board)-boardNow(board,now))/1000)) : null};
};
export const supportedViews = feed => {
  const rows = marketRows(feed.board);
  const views = [];
  if (rows.some(row => standardColumns.some(([code,label]) => oddFor(row,code,label)))) views.push('standard');
  for (const [code,view] of [['OU','totals'],['HOME_OU','home-totals'],['AWAY_OU','away-totals'],
    ['1X2_OU_1.5','result-1.5'],['1X2_OU_2.5','result-2.5'],['CS','correct-score']]) {
    if (rows.some(row => row.marketsNormalized.some(market => market.code === code && market.selections.some(s => oddFor(row,code,s.label))))) views.push(view);
  }
  if (feed.live || feed.result) views.push('results');
  if (feed.standings.length) views.push('standings');
  return views;
};
