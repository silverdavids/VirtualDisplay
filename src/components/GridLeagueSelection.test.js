import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import Grid, {getLeagueName} from './Grid';
import {getDisplay, getDisplayQueue, getLeagues} from '../services/virtualApi';
import connectSocket from '../socketio.service';
import {validateVirtualTicket, placeVirtualTicket} from '../services/ticketApi';
import {providerMarkets} from '../testFixtures/providerMarkets';

jest.mock('../services/ticketApi', () => ({
  BETTING_CLOSED_MESSAGE: 'Betting closed', validateVirtualTicket: jest.fn(), placeVirtualTicket: jest.fn(),
}));

beforeEach(() => { localStorage.clear(); jest.clearAllMocks(); });

test('a live update keeps the week visible, clears selections, locks odds and updates scores and minute', async()=>{
  const socket=setupFeed();
  getDisplayQueue.mockImplementation(async (_, id) => ({currentBoard:testBoard(id),nextBoards:[]}));
  render(<Grid />);
  await screen.findByText('21-HOME');
  fireEvent.click(document.querySelector('.odd-button'));
  expect(screen.getByRole('button',{name:'Print ticket'})).toBeEnabled();
  const live={...testBoard('21'),state:'LIVE',minute:36,bettingAllowed:false,
    observedAtUtc:new Date(Date.now()+1000).toISOString(),
    events:testBoard('21').events.map(e=>({...e,homeScore:1,awayScore:0}))};
  await act(async()=>socket.onAny.mock.calls.at(-1)[0]('virtual-display-updated',live));
  expect(screen.getByLabelText('Score 21-HOME vs 21-AWAY')).toHaveTextContent('1–0');
  expect(screen.getByText(/LIVE 36/)).toBeInTheDocument();
  expect(document.querySelector('.odd-button')).toBeDisabled();
  expect(screen.getByRole('button',{name:'Print ticket'})).toBeDisabled();
  fireEvent.click(document.querySelector('.odd-button'));
  expect(screen.getByText('Please pick up a bet to start')).toBeInTheDocument();
  await act(async()=>socket.onAny.mock.calls.at(-1)[0]('virtual-display-updated',{
    ...live,minute:38,observedAtUtc:new Date(Date.now()+2000).toISOString(),events:live.events.map(e=>({...e,awayScore:1}))}));
  expect(screen.getByLabelText('Score 21-HOME vs 21-AWAY')).toHaveTextContent('1–1');
  expect(screen.getByText(/LIVE 38/)).toBeInTheDocument();
  expect(document.querySelector('.league-panel')).toHaveTextContent('WEEK 12');
});

jest.mock('../services/virtualApi', () => ({
  DEFAULT_PROVIDER: 'VirtualHorizon', DEFAULT_LEAGUE_ID: '21',
  getDisplay: jest.fn(), getLeagues: jest.fn(), getDisplayQueue: jest.fn(),
}));
jest.mock('../socketio.service', () => ({
  __esModule: true, default: jest.fn(),
  VIRTUAL_DISPLAY_UPDATED_EVENT: 'virtual-display-updated',
  VIRTUAL_EVENTS_QUEUE_UPDATED_EVENT: 'virtual-events-queue-updated',
}));

test('competition labels use provider identity even when season numbers coincide', () => {
  expect(getLeagueName({leagueId: '21', leagueNumber: '9999'})).toBe('Champions');
  expect(getLeagueName({leagueId: '78', leagueNumber: '9999'})).toBe('EPL');
});

test('both tabs stay available, selection shows only that league, and off-screen sockets do not replace it', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const socket = {connected: true, on: jest.fn(), off: jest.fn(), onAny: jest.fn(), offAny: jest.fn(), io: {on: jest.fn(), off: jest.fn()}};
  connectSocket.mockReturnValue(socket);
  const payload = leagueId => ({
    provider: 'VirtualHorizon', leagueId, leagueNumber: '9999', providerEventId: 'shared-board',
    lastUpdatedAt: new Date().toISOString(), nextRefreshAt: new Date(Date.now() + 60000).toISOString(),
    events: [{providerEventId: 'shared-board', providerMatchId: 'shared-match', leagueId,
      homeTeam: `${leagueId}-HOME`, awayTeam: `${leagueId}-AWAY`,
      startTime: new Date(Date.now() + 60000).toISOString(), markets: {main: {1: 2, X: 3, 2: 4}}}],
  });
  getLeagues.mockResolvedValue([{provider: 'VirtualHorizon', leagueId: '21'}, {provider: 'VirtualHorizon', leagueId: '78'}]);
  getDisplay.mockImplementation(async (_, leagueId) => payload(String(leagueId)));
  getDisplayQueue.mockResolvedValue({currentBoard: null, nextBoards: []});
  const {unmount} = render(<Grid />);
  try {
    await waitFor(() => expect(screen.getAllByText('21-HOME').length).toBeGreaterThan(0));
    const epl = screen.getByRole('button', {name: 'EPL'});
    const champions = screen.getByRole('button', {name: 'Champions'});
    expect(champions).toHaveClass('active');
    expect(getDisplay).toHaveBeenCalledWith('VirtualHorizon', '21', expect.any(Object));
    expect(getDisplayQueue).toHaveBeenCalledWith('VirtualHorizon', '21', expect.any(Object));
    await act(async () => socket.onAny.mock.calls.at(-1)[0]('virtual-display-updated', payload('78')));
    expect(champions).toHaveClass('active');
    expect(screen.queryByText('78-HOME')).not.toBeInTheDocument();
    await waitFor(() => expect(epl).toBeEnabled());
    fireEvent.click(epl);
    await waitFor(() => expect(screen.getAllByText('78-HOME').length).toBeGreaterThan(0));
    expect(epl).toHaveClass('active');
    expect(getDisplay).toHaveBeenLastCalledWith('VirtualHorizon', '78', expect.any(Object));
    expect(getDisplayQueue).toHaveBeenLastCalledWith('VirtualHorizon', '78', expect.any(Object));
    expect(screen.queryByText('21-HOME')).not.toBeInTheDocument();
    await act(async () => socket.onAny.mock.calls.at(-1)[0]('virtual-display-updated', payload('21')));
    expect(epl).toHaveClass('active');
    expect(screen.queryByText('21-HOME')).not.toBeInTheDocument();
    await waitFor(() => expect(champions).toBeEnabled());
    fireEvent.click(champions);
    await waitFor(() => expect(screen.getAllByText('21-HOME').length).toBeGreaterThan(0));
    expect(screen.queryByText('78-HOME')).not.toBeInTheDocument();
    expect(getDisplay).toHaveBeenLastCalledWith('VirtualHorizon', '21', expect.any(Object));
  } finally { unmount(); log.mockRestore(); }
});

const testBoard = id => ({
  provider: 'VirtualHorizon', leagueId: id, leagueNumber: id === '21' ? '1001' : '2002',
  leagueName: id === '21' ? 'Champions League' : 'Premier League',
  providerEventId: `event-${id}`, weekNumber: id === '21' ? 12 : 23,
  lastUpdatedAt: new Date().toISOString(), nextRefreshAt: new Date(Date.now() + 60000).toISOString(),
  events: [{providerMatchId: 'shared-match', homeTeam: `${id}-HOME`, awayTeam: `${id}-AWAY`,
    markets: [{code: '1X2', selections: [{name: 'HOME', odd: 2}, {name: 'DRAW', odd: 3}, {name: 'AWAY', odd: 4}]}]}],
});
const setupFeed = () => {
  const socket = {connected: true, on: jest.fn(), off: jest.fn(), onAny: jest.fn(), offAny: jest.fn(), io: {on: jest.fn(), off: jest.fn()}};
  connectSocket.mockReturnValue(socket);
  getDisplay.mockImplementation(async (_, id) => testBoard(id));
  getDisplayQueue.mockImplementation(async (_, id) => ({
    currentBoard: testBoard(id), nextBoards: [{...testBoard(id), providerEventId: `next-${id}`, weekNumber: 24}],
  }));
  return socket;
};

test('renders league metadata without queue debug text and clears the betslip with notification on switch', async () => {
  setupFeed();
  const onOpenResults = jest.fn();
  render(<Grid onOpenResults={onOpenResults} />);
  await screen.findByText('21-HOME');
  expect(screen.getByText('LEAGUE 1001')).toBeInTheDocument();
  expect(document.querySelector('.league-panel')).toHaveTextContent('WEEK 12');
  expect(screen.queryByLabelText('League schedule')).not.toBeInTheDocument();
  expect(screen.queryByText(/next-21|Event event-21/)).not.toBeInTheDocument();
  expect(document.querySelector('.odd-button')).toHaveTextContent('2.00');
  expect(document.querySelector('.odd-button')).toBeEnabled();
  fireEvent.click(document.querySelector('.odd-button'));
  expect(document.querySelector('.receipt-list')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Print ticket'})).toBeEnabled();
  fireEvent.click(screen.getByRole('button', {name: 'EPL'}));
  await screen.findByText('78-HOME');
  expect(screen.getByText('LEAGUE 2002')).toBeInTheDocument();
  expect(document.querySelector('.league-panel')).toHaveTextContent('WEEK 23');
  expect(screen.queryByLabelText('League schedule')).not.toBeInTheDocument();
  expect(screen.queryByText(/next-78|Event event-78/)).not.toBeInTheDocument();
  expect(screen.getByText('Bet slip cleared when switching leagues.')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Print ticket'})).toBeDisabled();
  expect(screen.getByText('Please pick up a bet to start')).toBeInTheDocument();
  expect(placeVirtualTicket).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Open results'}));
  expect(onOpenResults).toHaveBeenCalledWith('78');
});

test('selector remains usable while a league is loading or unavailable', async () => {
  setupFeed();
  let reject;
  getDisplay.mockImplementation((_, id) => id === '78'
    ? new Promise((_, fail) => { reject = fail; }) : Promise.resolve(testBoard(id)));
  getDisplayQueue.mockResolvedValue({currentBoard: null, nextBoards: []});
  render(<Grid />);
  await screen.findByText('21-HOME');
  fireEvent.click(screen.getByRole('button', {name: 'EPL'}));
  expect(screen.getByText('Loading virtual events...')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Champions'})).toBeEnabled();
  await act(async () => reject(new Error('Unavailable')));
  expect(screen.getByText('League temporarily unavailable')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Champions'}));
  expect(screen.getByText('21-HOME')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText('League temporarily unavailable')).not.toBeInTheDocument());
});

test('rollover during ticket validation prevents placement against the new visible event', async () => {
  const socket = setupFeed();
  let resolve;
  validateVirtualTicket.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<Grid />);
  await screen.findByText('21-HOME');
  fireEvent.click(document.querySelector('.odd-button'));
  fireEvent.click(screen.getByRole('button', {name: 'Print ticket'}));
  expect(screen.getByRole('button', {name: 'EPL'})).toBeDisabled();
  act(() => socket.onAny.mock.calls.at(-1)[0]('virtual-display-updated', {
    ...testBoard('21'), providerEventId: 'rolled-event',
  }));
  await act(async () => resolve({isValid: true}));
  expect(placeVirtualTicket).not.toHaveBeenCalled();
  expect(screen.getByRole('button', {name: 'EPL'})).toBeEnabled();
});

const upcomingBoard = (id, event, weekNumber) => ({...testBoard(id), providerEventId: event, weekNumber,
  nextRefreshAt: new Date(Date.now() + 180000).toISOString(),
  events: [{providerMatchId: 'shared-match', homeTeam: `${id}-${event}`, awayTeam: 'AWAY',
    markets: {main: {1: 5, X: 6, 2: 7}}}],
});

test('five tabs preserve provider wraparound, manual selection and independent league rollover', async () => {
  const socket = setupFeed();
  const weeks = id => (id === '21' ? [38, 1, 2, 3, 4, 5, 6] : [20, 21, 22, 23, 24, 25])
    .map(week => ({...upcomingBoard(id, `week-${week}`, week), state: 'UPCOMING'}));
  getDisplay.mockImplementation(async (_, id) => weeks(id)[0]);
  getDisplayQueue.mockImplementation(async (_, id) => ({currentBoard: weeks(id)[0], nextBoards: weeks(id).slice(1)}));
  render(<Grid />);
  await screen.findByText('21-week-38');
  const labels = () => within(screen.getByRole('navigation', {name: 'Weeks'})).getAllByRole('button').map(item => item.textContent);
  expect(labels()).toEqual(['WEEK 38', 'WEEK 1', 'WEEK 2', 'WEEK 3', 'WEEK 4']);
  fireEvent.click(screen.getByRole('button', {name: 'WEEK 2'}));
  await act(async () => socket.onAny.mock.calls.at(-1)[0]('virtual-display-updated', {...weeks('21')[0], state: 'LIVE'}));
  expect(labels()).toEqual(['WEEK 1', 'WEEK 2', 'WEEK 3', 'WEEK 4', 'WEEK 5']);
  expect(screen.getByRole('button', {name: 'WEEK 2'})).toHaveClass('active');
  fireEvent.click(screen.getByRole('button', {name: 'EPL'}));
  await screen.findByText('78-week-20');
  expect(labels()).toEqual(['WEEK 20', 'WEEK 21', 'WEEK 22', 'WEEK 23', 'WEEK 24']);
  await act(async () => socket.onAny.mock.calls.at(-1)[0]('virtual-events-queue-updated', {
    currentBoard: {...weeks('21')[0], state: 'LIVE'},
    nextBoards: weeks('21').slice(1).map(item => item.weekNumber === 2 ? {...item, state:'CLOSED'} : item),
  }));
  expect(labels()).toEqual(['WEEK 20', 'WEEK 21', 'WEEK 22', 'WEEK 23', 'WEEK 24']);
  fireEvent.click(screen.getByRole('button', {name: 'Champions'}));
  await screen.findByText('21-week-1');
  expect(labels()).toEqual(['WEEK 1', 'WEEK 3', 'WEEK 4', 'WEEK 5', 'WEEK 6']);
  expect(screen.getByRole('button', {name: 'WEEK 1'})).toHaveClass('active');
});

const allMarkets = {
  MAIN: {'1': {odd: 2}}, 'OVER / UNDER': {'OV 1.5': {odd: 1.8}},
  'HOME OV/UN': {'OV 0.5': {odd: 1.7}}, 'AWAY OV/UN': {'UN 0.5': {odd: 1.6}},
  '1X2 OV/UN 1.5': {'1+OV1.5': {odd: 3}}, '1X2 OV/UN 2.5': {'1+OV2.5': {odd: 4}},
};

test('raw REST queue replacement and raw socket updates keep all markets usable in both leagues and future weeks', async () => {
  const socket = setupFeed();
  const raw = (id, event = `event-${id}`, weekNumber = 12, odd = 2) => ({...testBoard(id),
    providerEventId:event, weekNumber,
    events:testBoard(id).events.map(match => ({...match, markets:providerMarkets(odd)})),
  });
  // /display returns expanded objects; /display/queue replaces them with raw groups.
  getDisplay.mockImplementation(async (_, id) => ({...testBoard(id),
    events:testBoard(id).events.map(match => ({...match, markets:allMarkets})),
  }));
  getDisplayQueue.mockImplementation(async (_, id) => ({currentBoard:raw(id),
    nextBoards:[raw(id, `future-${id}`, 26, 3)]}));
  render(<Grid />);
  await screen.findByText('21-HOME');
  const checkMarkets = expectedOdd => {
    Object.keys(allMarkets).forEach(name => {
      const button = screen.getByRole('button', {name, exact:true});
      expect(button).toBeEnabled();
      fireEvent.click(button);
      expect(document.querySelector('.odd-button')).toBeEnabled();
      expect(document.querySelector('.odd-button')).toHaveTextContent(expectedOdd);
    });
  };
  checkMarkets('2.00');
  fireEvent.click(screen.getByRole('button', {name:'WEEK 26'}));
  checkMarkets('3.00');
  fireEvent.click(screen.getByRole('button', {name:'EPL'}));
  await screen.findByText('78-HOME');
  checkMarkets('2.00');
  await act(async () => socket.onAny.mock.calls.at(-1)[0]('virtual-events-queue-updated', {
    currentBoard:raw('78', 'event-78', 12, 4), nextBoards:[raw('78', 'future-78', 26, 5)],
  }));
  checkMarkets('4.00');
  fireEvent.click(screen.getByRole('button', {name:'WEEK 26'}));
  checkMarkets('5.00');
  fireEvent.click(screen.getByRole('button', {name:'Champions'}));
  await screen.findByText('21-HOME');
  expect(screen.getByRole('button', {name:'WEEK 26'})).toHaveClass('active');
  checkMarkets('3.00');
});

test('all six markets use selected week odds across REST, socket updates and league switches', async () => {
  const socket = setupFeed();
  const full = id => ({...testBoard(id), events: testBoard(id).events.map(event => ({...event, markets: allMarkets}))});
  getDisplay.mockImplementation(async (_, id) => id === '21' ? full(id) : testBoard(id));
  getDisplayQueue.mockImplementation(async (_, id) => ({currentBoard: id === '21' ? full(id) : testBoard(id),
    nextBoards: [{...testBoard(id), providerEventId: `limited-${id}`, weekNumber: 30}]}));
  render(<Grid />);
  await screen.findByText('21-HOME');
  const assertAll = () => Object.keys(allMarkets).forEach(name => expect(screen.getByRole('button', {name, exact:true})).toBeEnabled());
  assertAll();
  fireEvent.click(document.querySelector('.odd-button'));
  fireEvent.click(screen.getByRole('button', {name: 'HOME OV/UN'}));
  expect(document.querySelector('.receipt-list')).not.toBeInTheDocument();
  expect(document.querySelector('.odd-button')).toHaveTextContent('1.70');
  fireEvent.click(screen.getByRole('button', {name: 'WEEK 30'}));
  expect(screen.getByRole('button', {name: 'HOME OV/UN'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {name: 'WEEK 12'}));
  assertAll();
  fireEvent.click(screen.getByRole('button', {name: 'EPL'}));
  await screen.findByText('78-HOME');
  expect(screen.getByRole('button', {name: 'HOME OV/UN'})).toBeDisabled();
  await act(async () => socket.onAny.mock.calls.at(-1)[0]('virtual-display-updated', full('78')));
  assertAll();
  fireEvent.click(screen.getByRole('button', {name: 'Champions'}));
  await screen.findByText('21-HOME');
  assertAll();
});

test('closing the selected week promotes week 26 and immediately replaces fixtures, odds, countdown and picks', async () => {
  const socket = setupFeed();
  const initial = {...testBoard('21'), weekNumber: 5, state: 'UPCOMING'};
  const next = {...upcomingBoard('21', 'next', 26), state: 'UPCOMING'};
  getDisplay.mockResolvedValue(initial);
  getDisplayQueue.mockResolvedValue({currentBoard: initial, nextBoards: [next]});
  render(<Grid />);
  await screen.findByText('21-HOME');
  const time = document.querySelector('.timer-time').textContent;
  fireEvent.click(document.querySelector('.odd-button'));
  await act(async () => socket.onAny.mock.calls.at(-1)[0]('virtual-display-updated', {
    ...initial, state: 'LIVE', bettingAllowed: false,
    lastUpdatedAt: new Date(Date.now() + 1000).toISOString(),
  }));
  expect(screen.getByRole('button', {name: 'WEEK 26'})).toHaveClass('active');
  expect(screen.queryByRole('button', {name: 'WEEK 5'})).not.toBeInTheDocument();
  expect(screen.getByText('21-next')).toBeInTheDocument();
  expect(document.querySelector('.odd-button')).toHaveTextContent('5.00');
  expect(document.querySelector('.timer-time').textContent).not.toBe(time);
  expect(document.querySelector('.receipt-list')).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Print ticket'})).toBeDisabled();
});

test('upcoming with 16 seconds left and no optional betting flag enables odds; kickoff changes the message', async () => {
  const socket = setupFeed();
  const upcoming = {...testBoard('21'),state:'UPCOMING',scheduledStartAtUtc:new Date(Date.now()+16000).toISOString()};
  getDisplay.mockResolvedValue(upcoming);
  getDisplayQueue.mockResolvedValue({currentBoard:upcoming,nextBoards:[]});
  render(<Grid />);
  await screen.findByText('21-HOME');
  expect(document.querySelector('.odd-button')).toBeEnabled();
  expect(screen.queryByText('Waiting for the next virtual event')).not.toBeInTheDocument();
  expect(document.querySelector('.betting-closed-message')).not.toBeInTheDocument();
  await act(async () => socket.onAny.mock.calls.at(-1)[0]('virtual-display-updated', {
    ...upcoming,state:'LIVE',startedAtUtc:new Date().toISOString(),BettingOpen:false,
    lastUpdatedAt:new Date(Date.now()+1000).toISOString(),
  }));
  expect(document.querySelector('.odd-button')).toBeDisabled();
  expect(screen.getByText('Betting closed – games in progress')).toBeInTheDocument();
});

test('week buttons display API order and distinct events with duplicate labels; cached clicks update the board and clear picks only on change', async () => {
  setupFeed();
  getDisplayQueue.mockImplementation(async (_, id) => ({currentBoard: testBoard(id), nextBoards: [
    upcomingBoard(id, 'first', 24), upcomingBoard(id, 'second', 24),
  ]}));
  render(<Grid />);
  const nav = screen.getByRole('navigation', {name: 'Weeks'});
  await screen.findByText('21-HOME');
  expect(within(nav).getAllByRole('button').map(button => button.textContent.trim())).toEqual(['WEEK 12', 'WEEK 24', 'WEEK 24']);
  expect(within(nav).getByRole('button', {name: 'WEEK 12'})).toHaveAttribute('aria-pressed', 'true');
  const time = document.querySelector('.timer-time').textContent;
  fireEvent.click(document.querySelector('.odd-button'));
  fireEvent.click(within(nav).getByRole('button', {name: 'WEEK 12'}));
  expect(document.querySelector('.receipt-list')).toBeInTheDocument();
  expect(screen.queryByText('Bet slip cleared when switching weeks.')).not.toBeInTheDocument();
  const requests = getDisplay.mock.calls.length;
  fireEvent.click(within(nav).getAllByRole('button', {name: 'WEEK 24'})[0]);
  expect(screen.getByText('21-first')).toBeInTheDocument();
  expect(document.querySelector('.odd-button')).toHaveTextContent('5.00');
  expect(document.querySelector('.league-panel')).toHaveTextContent('WEEK 24');
  expect(document.querySelector('.timer-time').textContent).not.toBe(time);
  expect(screen.getByText('Bet slip cleared when switching weeks.')).toBeInTheDocument();
  expect(document.querySelector('.receipt-list')).not.toBeInTheDocument();
  expect(getDisplay).toHaveBeenCalledTimes(requests);
  expect(getDisplayQueue).toHaveBeenCalledTimes(requests);
  fireEvent.click(within(nav).getAllByRole('button', {name: 'WEEK 24'})[1]);
  expect(screen.getByText('21-second')).toBeInTheDocument();
  expect(within(nav).getAllByRole('button', {name: 'WEEK 24'})[1]).toHaveClass('active');
  expect(screen.getByRole('button', {name: 'Champions'})).toHaveClass('active');
  expect(document.querySelector('.odds-area .week-tabs')).toBeNull();
});

test('league switches restore the selected week and socket removal promotes without overwriting another league', async () => {
  const socket = setupFeed();
  const queues = id => ({currentBoard: testBoard(id), nextBoards: [upcomingBoard(id, 'first', 24), upcomingBoard(id, 'second', 25)]});
  getDisplayQueue.mockImplementation(async (_, id) => queues(id));
  render(<Grid />);
  await screen.findByText('21-HOME');
  fireEvent.click(screen.getByRole('button', {name: 'WEEK 24'}));
  fireEvent.click(screen.getByRole('button', {name: 'EPL'}));
  await screen.findByText('78-HOME');
  fireEvent.click(screen.getByRole('button', {name: 'WEEK 25'}));
  fireEvent.click(screen.getByRole('button', {name: 'Champions'}));
  await screen.findByText('21-first');
  await act(async () => socket.onAny.mock.calls.at(-1)[0]('virtual-events-queue-updated', queues('21')));
  expect(screen.getByText('21-first')).toBeInTheDocument();
  await act(async () => socket.onAny.mock.calls.at(-1)[0]('virtual-events-queue-updated', {
    currentBoard: upcomingBoard('78', 'first', 24), nextBoards: [upcomingBoard('78', 'second', 25)],
  }));
  expect(screen.getByText('21-first')).toBeInTheDocument();
  fireEvent.click(document.querySelector('.odd-button'));
  await act(async () => socket.onAny.mock.calls.at(-1)[0]('resultsUpdated', {
    provider: 'VirtualHorizon', leagueId: 21, providerEventId: 'first', status: 'COMPLETED',
  }));
  expect(screen.getByRole('button', {name: 'WEEK 12'})).toHaveClass('active');
  expect(screen.queryByRole('button', {name: 'WEEK 24'})).not.toBeInTheDocument();
  expect(document.querySelector('.odd-button')).toBeEnabled();
  expect(document.querySelector('.receipt-list')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'EPL'}));
  await screen.findByText('78-second');
  expect(screen.getByRole('button', {name: 'WEEK 25'})).toHaveClass('active');
});

