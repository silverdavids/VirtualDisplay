import {act, render, screen, waitFor} from '@testing-library/react';
import ResultsDisplay, {formatResultTimer, RESULTS_UPDATED_EVENT} from './ResultsDisplay';
import connectSocket from '../socketio.service';
import {getLatestResults} from '../services/virtualResultsApi';

jest.mock('../services/virtualResultsApi', () => ({getLatestResults: jest.fn()}));
jest.mock('../socketio.service', () => jest.fn());

const handlers = {};
const socket = {
  connected: true,
  on: jest.fn((event, handler) => { handlers[event] = handler; }),
  off: jest.fn(),
};

const board = {
  provider: 'VirtualHorizon',
  providerEventId: 'result-group-1',
  leagueId: '21',
  leagueName: 'Champs League',
  weekNumber: 26,
  receivedByApiAt: '2026-07-24T18:15:00.000Z',
  matches: [
    {providerMatchId: '1', home: 'PSG', away: 'BAR', homeScore: 2, awayScore: 1, status: 'COMPLETED'},
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(handlers).forEach((key) => delete handlers[key]);
  socket.on.mockImplementation((event, handler) => { handlers[event] = handler; });
  connectSocket.mockReturnValue(socket);
});

test('shows the waiting state when no result has been stored', async () => {
  getLatestResults.mockResolvedValue(null);
  render(<ResultsDisplay onBackToBetting={jest.fn()} />);
  expect(screen.getByText('WAITING FOR RESULTS')).toBeInTheDocument();
  expect(await screen.findByText('The latest result will appear automatically.')).toBeInTheDocument();
});

test('hydrates from REST, replaces from resultsUpdated, and removes listeners', async () => {
  getLatestResults.mockResolvedValue(board);
  const {unmount} = render(<ResultsDisplay onBackToBetting={jest.fn()} />);
  expect(await screen.findByText('PSG')).toBeInTheDocument();
  expect(screen.getByLabelText(/Result timer \d+:\d{2}/)).toBeInTheDocument();
  expect(document.querySelector('.result-score')).toHaveTextContent('2 – 1');

  act(() => handlers[RESULTS_UPDATED_EVENT]({
    ...board,
    matches: [{providerMatchId: '2', home: 'CHE', away: 'MUN', homeScore: 3, awayScore: 2}],
  }));
  expect(screen.getByText('CHE')).toBeInTheDocument();
  expect(screen.queryByText('PSG')).not.toBeInTheDocument();

  unmount();
  await waitFor(() => expect(socket.off).toHaveBeenCalledWith(
    RESULTS_UPDATED_EVENT,
    expect.any(Function)
  ));
});

test('ignores result boards for another provider or league', async () => {
  getLatestResults.mockResolvedValue(null);
  render(<ResultsDisplay onBackToBetting={jest.fn()} />);
  await waitFor(() => expect(getLatestResults).toHaveBeenCalled());
  act(() => handlers[RESULTS_UPDATED_EVENT]({...board, leagueId: '99'}));
  expect(screen.getByText('WAITING FOR RESULTS')).toBeInTheDocument();
});

test('counts seconds for one result group and resets for the next provider event', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-07-26T12:00:00.000Z'));
  getLatestResults.mockResolvedValue({
    ...board,
    receivedByApiAt: '2026-07-26T12:00:00.000Z',
  });

  render(<ResultsDisplay onBackToBetting={jest.fn()} />);
  await act(async () => Promise.resolve());
  expect(screen.getByText('00:00')).toBeInTheDocument();

  act(() => jest.advanceTimersByTime(2000));
  expect(screen.getByText('00:02')).toBeInTheDocument();

  act(() => handlers[RESULTS_UPDATED_EVENT]({
    ...board,
    providerEventId: 'next-result-group',
    receivedByApiAt: '2026-07-26T12:00:02.000Z',
  }));
  expect(screen.getByText('00:00')).toBeInTheDocument();
  jest.useRealTimers();
});

test('formats the result counter as minutes and seconds', () => {
  expect(formatResultTimer(0)).toBe('00:00');
  expect(formatResultTimer(95)).toBe('01:35');
  expect(formatResultTimer(600)).toBe('10:00');
});
