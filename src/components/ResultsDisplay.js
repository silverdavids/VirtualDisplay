import {useEffect, useRef, useState} from 'react';
import {FaArrowLeft, FaCircle} from 'react-icons/fa';
import {DEFAULT_LEAGUE_ID, DEFAULT_PROVIDER} from '../services/virtualApi';
import {getLatestResults} from '../services/virtualResultsApi';
import connectSocket from '../socketio.service';
import './ResultsDisplay.css';

export const RESULTS_UPDATED_EVENT = 'resultsUpdated';

const token = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const acceptedLeague = (board) =>
  [board?.leagueId, board?.leagueNumber, board?.providerLeagueId]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .some((value) => String(value) === String(DEFAULT_LEAGUE_ID));

export const isValidResultsBoard = (payload) => {
  const board = payload?.latestResult ?? payload?.result ?? payload?.data ?? payload;
  return Boolean(
    board &&
    typeof board === 'object' &&
    token(board.provider) === token(DEFAULT_PROVIDER) &&
    acceptedLeague(board) &&
    Array.isArray(board.matches)
  );
};

const unwrapBoard = (payload) => payload?.latestResult ?? payload?.result ?? payload?.data ?? payload;

const displayStatus = (status) => {
  const normalized = String(status ?? '').toUpperCase();
  return ['DISPLAY_RESULTS', 'COMPLETED', 'RESULTS'].includes(normalized)
    ? 'FT'
    : normalized || 'FT';
};

const updatedAt = (board) =>
  board?.receivedByApiAt ?? board?.receivedAt ?? board?.updatedAt ?? board?.capturedAt;

const elapsedSecondsSince = (value) => {
  const received = value ? new Date(value).getTime() : Date.now();
  if (!Number.isFinite(received)) return 0;
  return Math.max(0, Math.floor((Date.now() - received) / 1000));
};

export const formatResultTimer = (totalSeconds) => {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatUpdatedAt = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Just now';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const ResultsDisplay = ({onBackToBetting}) => {
  const [board, setBoard] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING');
  const [loadError, setLoadError] = useState('');
  const [resultSeconds, setResultSeconds] = useState(0);
  const activeResultId = useRef('');
  const resultStartedAt = useRef(Date.now());

  useEffect(() => {
    let mounted = true;
    const applyBoard = (payload) => {
      if (mounted && isValidResultsBoard(payload)) {
        const nextBoard = unwrapBoard(payload);
        const nextResultId = String(
          nextBoard.providerEventId ?? updatedAt(nextBoard) ?? 'current-result'
        );
        const isNewResult = nextResultId !== activeResultId.current;

        if (isNewResult) {
          activeResultId.current = nextResultId;
          const apiReceivedAt = updatedAt(nextBoard);
          const parsedReceivedAt = apiReceivedAt ? new Date(apiReceivedAt).getTime() : Date.now();
          resultStartedAt.current = Number.isFinite(parsedReceivedAt) ? parsedReceivedAt : Date.now();
          setResultSeconds(elapsedSecondsSince(resultStartedAt.current));
        }

        setBoard(nextBoard);
        setLoadError('');
      }
    };

    getLatestResults()
      .then(applyBoard)
      .catch((error) => {
        if (mounted) setLoadError(error.message);
      });

    const socket = connectSocket();
    const connected = () => setConnectionStatus('CONNECTED');
    const disconnected = () => setConnectionStatus('DISCONNECTED');
    socket.on('connect', connected);
    socket.on('disconnect', disconnected);
    socket.on('connect_error', disconnected);
    socket.on(RESULTS_UPDATED_EVENT, applyBoard);
    setConnectionStatus(socket.connected ? 'CONNECTED' : 'CONNECTING');

    return () => {
      mounted = false;
      socket.off('connect', connected);
      socket.off('disconnect', disconnected);
      socket.off('connect_error', disconnected);
      socket.off(RESULTS_UPDATED_EVENT, applyBoard);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (activeResultId.current) {
        setResultSeconds(elapsedSecondsSince(resultStartedAt.current));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="results-page">
      <header className="results-header">
        <button className="results-back" onClick={onBackToBetting} type="button">
          <FaArrowLeft aria-hidden="true" /> BETTING
        </button>
        <img alt="VPlay" className="results-logo" src="/vplay-logo.png" />
        <div className={`results-connection ${connectionStatus.toLowerCase()}`}>
          <FaCircle aria-hidden="true" /> {connectionStatus}
        </div>
      </header>

      <section className="results-board" aria-live="polite">
        <h1>VPLAY RESULTS</h1>
        {!board ? (
          <div className="results-waiting">
            <strong>WAITING FOR RESULTS</strong>
            <span>The latest result will appear automatically.</span>
            {loadError && <small role="status">{loadError}</small>}
          </div>
        ) : (
          <>
            <div className="results-title">
              <div>
                <span
                  aria-label={`Result timer ${formatResultTimer(resultSeconds)}`}
                  className="results-set-counter"
                >
                  {formatResultTimer(resultSeconds)}
                </span>
                <h2>{board.leagueName || 'Champs League'}</h2>
              </div>
              <div className="results-round">
                <strong>
                  {board.leagueNumber && String(board.leagueNumber) !== String(board.leagueId)
                    ? `League ${board.leagueNumber}`
                    : `League ${board.leagueId ?? '—'}`}
                </strong>
                <p>Week {board.weekNumber ?? board.week ?? '—'}</p>
              </div>
            </div>
            <ol className="results-matches">
              {board.matches.map((match, index) => (
                <li key={match.providerMatchId ?? index}>
                  <span className="result-number">{match.index ?? index + 1}</span>
                  <strong className="result-home">{match.home ?? match.homeTeam}</strong>
                  <span className="result-score">
                    {match.homeScore} <i>–</i> {match.awayScore}
                  </span>
                  <strong className="result-away">{match.away ?? match.awayTeam}</strong>
                  <span className="result-status">{displayStatus(match.status)}</span>
                </li>
              ))}
            </ol>
            <footer className="results-updated">Updated: {formatUpdatedAt(updatedAt(board))}</footer>
          </>
        )}
      </section>
    </main>
  );
};

export default ResultsDisplay;
