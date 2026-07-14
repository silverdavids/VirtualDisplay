import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {FaArrowLeft, FaEye, FaReceipt, FaTimes} from 'react-icons/fa';
import {getVirtualTicketDetails, getVirtualTickets} from '../services/virtualTicketsApi';

const AUTO_REFRESH_MS = 15000;
const FILTER_TODAY = 'today';
const FILTER_YESTERDAY = 'yesterday';
const FILTER_ALL = 'all';
const DATE_FILTERS = [
  {key: FILTER_TODAY, label: 'Today'},
  {key: FILTER_YESTERDAY, label: 'Yesterday'},
  {key: FILTER_ALL, label: 'All'},
];

const styles = `
  .tickets-page {
    min-height: 100vh;
    background: #101418;
    color: #f4f7f9;
    font-family: Arial, sans-serif;
    padding: 14px;
  }

  .tickets-shell {
    max-width: 1320px;
    margin: 0 auto;
  }

  .tickets-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    margin-bottom: 9px;
  }

  .tickets-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tickets-title h1 {
    margin: 0;
    font-size: 21px;
    line-height: 1.1;
  }

  .tickets-title span {
    color: #aeb9c2;
    font-size: 10px;
  }

  .tickets-back,
  .ticket-detail-close,
  .ticket-detail-action,
  .ticket-view-button {
    border: 0;
    cursor: pointer;
    font-weight: 800;
  }

  .tickets-back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #242c34;
    color: #f4f7f9;
    padding: 7px 10px;
    border-radius: 6px;
    font-size: 13px;
  }

  .tickets-panel {
    background: #171d23;
    border: 1px solid #2b3640;
    border-radius: 8px;
    overflow: hidden;
  }

  .tickets-filter-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px;
    background: #141a20;
    border-bottom: 1px solid #2b3640;
  }

  .tickets-filter-tabs {
    display: inline-flex;
    gap: 6px;
  }

  .tickets-filter-tab {
    border: 1px solid #313c46;
    border-radius: 6px;
    background: #202832;
    color: #dbe3e8;
    cursor: pointer;
    font-size: 12px;
    font-weight: 800;
    padding: 6px 10px;
  }

  .tickets-filter-tab.active {
    background: #e51f2a;
    border-color: #e51f2a;
    color: #fff;
  }

  .tickets-search {
    min-width: 220px;
    width: 280px;
    max-width: 36vw;
    background: #0f1419;
    border: 1px solid #313c46;
    border-radius: 6px;
    color: #f4f7f9;
    font-size: 13px;
    outline: none;
    padding: 7px 10px;
  }

  .tickets-search::placeholder {
    color: #798690;
  }

  .tickets-table-wrap {
    overflow-x: hidden;
  }

  .tickets-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .tickets-table th,
  .tickets-table td {
    padding: 8px 7px;
    text-align: left;
    border-bottom: 1px solid #2b3640;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tickets-table th {
    color: #aeb9c2;
    background: #202832;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .tickets-table td {
    font-size: 13px;
  }

  .tickets-table th:nth-child(1),
  .tickets-table td:nth-child(1) {
    width: 7%;
  }

  .tickets-table th:nth-child(2),
  .tickets-table td:nth-child(2) {
    width: 8%;
  }

  .tickets-table th:nth-child(3),
  .tickets-table td:nth-child(3),
  .tickets-table th:nth-child(4),
  .tickets-table td:nth-child(4),
  .tickets-table th:nth-child(5),
  .tickets-table td:nth-child(5),
  .tickets-table th:nth-child(10),
  .tickets-table td:nth-child(10) {
    text-align: right;
    width: 9%;
  }

  .tickets-table th:nth-child(6),
  .tickets-table td:nth-child(6) {
    width: 10%;
  }

  .tickets-table th:nth-child(7),
  .tickets-table td:nth-child(7),
  .tickets-table th:nth-child(8),
  .tickets-table td:nth-child(8),
  .tickets-table th:nth-child(9),
  .tickets-table td:nth-child(9) {
    text-align: center;
    width: 5%;
  }

  .tickets-table th:nth-child(11),
  .tickets-table td:nth-child(11) {
    text-align: right;
    width: 11%;
  }

  .ticket-receipt {
    font-family: monospace;
    font-weight: 800;
  }

  .ticket-date {
    display: inline-flex;
    flex-direction: column;
    gap: 1px;
    line-height: 1.05;
  }

  .ticket-date-time {
    color: #aeb9c2;
    font-size: 12px;
  }

  .ticket-status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 58px;
    justify-content: center;
    border-radius: 999px;
    padding: 3px 7px;
    font-size: 11px;
    font-weight: 800;
  }

  .ticket-status.pending {
    background: #413813;
    color: #ffd766;
  }

  .ticket-status.lost {
    background: #421f24;
    color: #ff9aa6;
  }

  .ticket-status.won {
    background: #183c2c;
    color: #72e0a9;
  }

  .ticket-view-button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #e51f2a;
    color: #fff;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 12px;
  }

  .tickets-state {
    padding: 34px 18px;
    text-align: center;
    color: #c8d0d6;
  }

  .tickets-state.error {
    color: #ff9aa6;
  }

  .ticket-detail-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    z-index: 1000;
  }

  .ticket-detail-modal {
    width: min(1120px, 100%);
    max-height: calc(100vh - 40px);
    overflow: auto;
    background: #171d23;
    border: 1px solid #34414c;
    border-radius: 8px;
  }

  .ticket-detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 18px;
    border-bottom: 1px solid #2b3640;
  }

  .ticket-detail-header h2 {
    margin: 0;
    font-size: 22px;
  }

  .ticket-detail-close {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: #242c34;
    color: #fff;
  }

  .ticket-detail-body {
    padding: 18px;
  }

  .ticket-summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 10px;
    margin-bottom: 18px;
  }

  .ticket-summary-item {
    background: #202832;
    border: 1px solid #2b3640;
    border-radius: 6px;
    padding: 12px;
  }

  .ticket-summary-label {
    display: block;
    color: #aeb9c2;
    font-size: 12px;
    margin-bottom: 6px;
    text-transform: uppercase;
  }

  .ticket-summary-value {
    font-weight: 800;
  }

  .ticket-selections {
    display: grid;
    gap: 10px;
  }

  .ticket-selection {
    background: #202832;
    border: 1px solid #2b3640;
    border-radius: 6px;
    padding: 14px;
  }

  .ticket-selection-main {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    margin-bottom: 10px;
  }

  .ticket-selection-teams {
    font-size: 17px;
    font-weight: 900;
  }

  .ticket-selection-league {
    color: #aeb9c2;
    margin-top: 4px;
    font-size: 13px;
  }

  .ticket-selection-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px 14px;
    color: #dbe3e8;
    font-size: 14px;
  }

  .ticket-selection-grid span {
    color: #aeb9c2;
    display: block;
    font-size: 12px;
    margin-bottom: 3px;
  }

  @media (max-width: 700px) {
    .tickets-page {
      padding: 10px;
    }

    .tickets-header,
    .tickets-filter-row,
    .ticket-selection-main {
      align-items: stretch;
      flex-direction: column;
    }

    .tickets-filter-tabs,
    .tickets-search {
      width: 100%;
      max-width: none;
    }

    .tickets-filter-tab {
      flex: 1;
    }

    .tickets-table-wrap {
      overflow-x: auto;
    }

    .tickets-table {
      min-width: 980px;
    }
  }
`;

const getValue = (source, keys, fallback = '-') => {
  if (!source || typeof source !== 'object') return fallback;

  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }

  return fallback;
};

const getArray = (payload, keys) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  if (payload.data && payload.data !== payload) return getArray(payload.data, keys);

  return [];
};

const getObject = (payload, keys) => {
  if (!payload || typeof payload !== 'object') return {};

  for (const key of keys) {
    if (payload[key] && typeof payload[key] === 'object' && !Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  return payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data
    : payload;
};

const formatMoney = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';

  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0,
  }).format(number);
};

const formatCompactMoney = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';

  return number.toLocaleString('en-UG', {
    maximumFractionDigits: 0,
  });
};

const formatNumber = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';

  return number.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString();
};

const formatCompactDateParts = (value) => {
  if (!value) return {date: '-', time: ''};
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return {date: String(value), time: ''};

  return {
    date: date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    }),
    time: date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  };
};

const formatQueryDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getTicketFilterParams = (filter) => {
  if (filter === FILTER_ALL) return {};

  const date = new Date();
  if (filter === FILTER_YESTERDAY) {
    date.setDate(date.getDate() - 1);
  }

  const queryDate = formatQueryDate(date);
  return {from: queryDate, to: queryDate};
};

const getEmptyMessage = (filter) => {
  if (filter === FILTER_TODAY) return 'No virtual tickets found for today.';
  if (filter === FILTER_YESTERDAY) return 'No virtual tickets found for yesterday.';
  return 'No virtual tickets found.';
};

const receiptStatusLabel = (status) => {
  const normalized = Number(status);
  if (normalized === 2) return 'Lost';
  if (normalized === 3) return 'Won';
  return 'Pending';
};

const gameBetStatusLabel = (status) => {
  const normalized = Number(status);
  if (normalized === 1) return 'Lost';
  if (normalized === 2) return 'Won';
  return 'Pending';
};

const statusClassName = (label) => `ticket-status ${String(label).toLowerCase()}`;

const normalizeTicket = (ticket) => ({
  raw: ticket,
  receiptId: getValue(ticket, ['receiptId', 'ReceiptId', 'id', 'Id']),
  receiptDate: getValue(ticket, ['receiptDate', 'ReceiptDate', 'createdAt', 'CreatedAt']),
  stake: getValue(ticket, ['stake', 'Stake']),
  totalOdds: getValue(ticket, ['totalOdds', 'TotalOdds']),
  possibleWin: getValue(ticket, ['possibleWin', 'PossibleWin']),
  receiptStatus: getValue(ticket, ['receiptStatus', 'ReceiptStatus'], 0),
  setSize: getValue(ticket, ['setSize', 'SetSize']),
  submitedSize: getValue(ticket, ['submitedSize', 'SubmitedSize', 'submittedSize', 'SubmittedSize']),
  wonSize: getValue(ticket, ['wonSize', 'WonSize']),
  amountPaid: getValue(ticket, ['amountPaid', 'AmountPaid'], null),
});

const normalizeSelection = (selection) => ({
  homeTeam: getValue(selection, ['homeTeam', 'HomeTeam', 'home', 'Home']),
  awayTeam: getValue(selection, ['awayTeam', 'AwayTeam', 'away', 'Away']),
  league: getValue(selection, ['league', 'League', 'leagueName', 'LeagueName']),
  startTime: getValue(selection, ['startTime', 'StartTime']),
  market: getValue(selection, ['market', 'Market']),
  option: getValue(selection, ['option', 'Option']),
  line: getValue(selection, ['line', 'Line']),
  betOdd: getValue(selection, ['betOdd', 'BetOdd', 'odd', 'Odd']),
  gameBetStatus: getValue(selection, ['gameBetStatus', 'GameBetStatus'], 0),
  homeScore: getValue(selection, ['homeScore', 'HomeScore']),
  awayScore: getValue(selection, ['awayScore', 'AwayScore']),
  matchStatus: getValue(selection, ['matchStatus', 'MatchStatus']),
});

const statusIcon = (label) => {
  if (label === 'Won') return '🟢';
  if (label === 'Lost') return '🔴';
  return '🟡';
};

const TicketStatus = ({label}) => (
  <span className={statusClassName(label)}>
    <span aria-hidden="true">{statusIcon(label)}</span>
    {label}
  </span>
);

const CompactDate = ({value}) => {
  const parts = formatCompactDateParts(value);

  return (
    <span className="ticket-date" title={formatDateTime(value)}>
      <span>{parts.date}</span>
      {parts.time && <span className="ticket-date-time">{parts.time}</span>}
    </span>
  );
};

const MoneyValue = ({value}) => (
  <span title={formatMoney(value)}>{formatCompactMoney(value)}</span>
);

const TicketsPage = ({onBackToDisplay}) => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFilter, setSelectedFilter] = useState(FILTER_TODAY);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReceiptId, setSelectedReceiptId] = useState('');
  const [detailPayload, setDetailPayload] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const loadTickets = useCallback(async (filter, options = {}) => {
    const {showLoading = true} = options;
    if (showLoading) setLoading(true);
    setError('');

    try {
      const payload = await getVirtualTickets(getTicketFilterParams(filter));
      setTickets(getArray(payload, ['tickets', 'Tickets', 'items', 'Items', 'data', 'Data']));
    } catch (err) {
      setError(err.message || 'Failed to load virtual tickets.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets(selectedFilter);
  }, [loadTickets, selectedFilter]);

  useEffect(() => {
    const refreshId = window.setInterval(() => {
      loadTickets(selectedFilter, {showLoading: false});
    }, AUTO_REFRESH_MS);

    return () => {
      window.clearInterval(refreshId);
    };
  }, [loadTickets, selectedFilter]);

  useEffect(() => {
    if (!selectedReceiptId) return undefined;

    let isMounted = true;

    const loadDetails = async () => {
      setDetailLoading(true);
      setDetailError('');
      setDetailPayload(null);

      try {
        const payload = await getVirtualTicketDetails(selectedReceiptId);
        if (isMounted) setDetailPayload(payload);
      } catch (err) {
        if (isMounted) setDetailError(err.message || 'Failed to load ticket details.');
      } finally {
        if (isMounted) setDetailLoading(false);
      }
    };

    loadDetails();

    return () => {
      isMounted = false;
    };
  }, [selectedReceiptId]);

  const normalizedTickets = useMemo(() => tickets.map(normalizeTicket), [tickets]);
  const visibleTickets = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return normalizedTickets;

    return normalizedTickets.filter((ticket) => [
      ticket.receiptId,
      ticket.receiptDate,
      ticket.stake,
      ticket.totalOdds,
      ticket.possibleWin,
      receiptStatusLabel(ticket.receiptStatus),
      ticket.setSize,
      ticket.submitedSize,
      ticket.wonSize,
      ticket.amountPaid,
    ].some((value) => String(value ?? '').toLowerCase().includes(query)));
  }, [normalizedTickets, searchTerm]);
  const detailRoot = useMemo(() => getObject(detailPayload, ['ticket', 'Ticket', 'receipt', 'Receipt']), [detailPayload]);
  const detailTicket = useMemo(() => normalizeTicket(detailRoot), [detailRoot]);
  const detailSelections = useMemo(() => {
    const selectionKeys = ['bets', 'Bets', 'selections', 'Selections', 'ticketBets', 'TicketBets'];
    const rootSelections = getArray(detailPayload, selectionKeys);
    const nestedSelections = getArray(detailRoot, selectionKeys);

    return (rootSelections.length > 0 ? rootSelections : nestedSelections).map(normalizeSelection);
  }, [detailPayload, detailRoot]);

  const closeDetails = () => {
    setSelectedReceiptId('');
    setDetailPayload(null);
    setDetailError('');
  };

  const emptyMessage = searchTerm.trim()
    ? 'No matching virtual tickets found.'
    : getEmptyMessage(selectedFilter);

  return (
    <main className="tickets-page">
      <style>{styles}</style>
      <div className="tickets-shell">
        <header className="tickets-header">
          <div className="tickets-title">
            <FaReceipt />
            <div>
              <h1>Virtual Tickets</h1>
            </div>
          </div>
          <button className="tickets-back" onClick={onBackToDisplay} type="button">
            <FaArrowLeft />
            <span>Display</span>
          </button>
        </header>

        <section className="tickets-panel">
          <div className="tickets-filter-row">
            <div className="tickets-filter-tabs" aria-label="Ticket date filters">
              {DATE_FILTERS.map((filter) => (
                <button
                  className={`tickets-filter-tab${selectedFilter === filter.key ? ' active' : ''}`}
                  key={filter.key}
                  onClick={() => setSelectedFilter(filter.key)}
                  type="button"
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <input
              className="tickets-search"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search..."
              type="search"
              value={searchTerm}
            />
          </div>
          {loading && <div className="tickets-state">Loading virtual tickets...</div>}
          {!loading && error && <div className="tickets-state error">{error}</div>}
          {!loading && !error && visibleTickets.length === 0 && (
            <div className="tickets-state">{emptyMessage}</div>
          )}
          {!loading && !error && visibleTickets.length > 0 && (
            <div className="tickets-table-wrap">
              <table className="tickets-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>DATE</th>
                    <th>STAKE</th>
                    <th>ODDS</th>
                    <th>WIN</th>
                    <th>STATUS</th>
                    <th>SIZE</th>
                    <th>DONE</th>
                    <th>WON</th>
                    <th>PAID</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTickets.map((ticket) => {
                    const statusLabel = receiptStatusLabel(ticket.receiptStatus);

                    return (
                      <tr key={ticket.receiptId}>
                        <td className="ticket-receipt">{ticket.receiptId}</td>
                        <td><CompactDate value={ticket.receiptDate} /></td>
                        <td><MoneyValue value={ticket.stake} /></td>
                        <td>{formatNumber(ticket.totalOdds)}</td>
                        <td><MoneyValue value={ticket.possibleWin} /></td>
                        <td><TicketStatus label={statusLabel} /></td>
                        <td>{ticket.setSize}</td>
                        <td>{ticket.submitedSize}</td>
                        <td>{ticket.wonSize}</td>
                        <td>{ticket.amountPaid === null ? '-' : <MoneyValue value={ticket.amountPaid} />}</td>
                        <td>
                          <button
                            className="ticket-view-button"
                            onClick={() => setSelectedReceiptId(ticket.receiptId)}
                            type="button"
                          >
                            <FaEye />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {selectedReceiptId && (
        <div className="ticket-detail-backdrop" role="dialog" aria-modal="true" aria-labelledby="ticket-detail-title">
          <section className="ticket-detail-modal">
            <header className="ticket-detail-header">
              <div>
                <h2 id="ticket-detail-title">Ticket {selectedReceiptId}</h2>
              </div>
              <button className="ticket-detail-close" onClick={closeDetails} title="Close details" type="button">
                <FaTimes />
              </button>
            </header>

            <div className="ticket-detail-body">
              {detailLoading && <div className="tickets-state">Loading ticket details...</div>}
              {!detailLoading && detailError && <div className="tickets-state error">{detailError}</div>}
              {!detailLoading && !detailError && detailPayload && (
                <>
                  <div className="ticket-summary-grid">
                    <div className="ticket-summary-item">
                      <span className="ticket-summary-label">ReceiptId</span>
                      <span className="ticket-summary-value">{detailTicket.receiptId}</span>
                    </div>
                    <div className="ticket-summary-item">
                      <span className="ticket-summary-label">ReceiptDate</span>
                      <span className="ticket-summary-value">{formatDateTime(detailTicket.receiptDate)}</span>
                    </div>
                    <div className="ticket-summary-item">
                      <span className="ticket-summary-label">Stake</span>
                      <span className="ticket-summary-value">{formatMoney(detailTicket.stake)}</span>
                    </div>
                    <div className="ticket-summary-item">
                      <span className="ticket-summary-label">TotalOdds</span>
                      <span className="ticket-summary-value">{formatNumber(detailTicket.totalOdds)}</span>
                    </div>
                    <div className="ticket-summary-item">
                      <span className="ticket-summary-label">PossibleWin</span>
                      <span className="ticket-summary-value">{formatMoney(detailTicket.possibleWin)}</span>
                    </div>
                    <div className="ticket-summary-item">
                      <span className="ticket-summary-label">ReceiptStatus</span>
                      <TicketStatus label={receiptStatusLabel(detailTicket.receiptStatus)} />
                    </div>
                  </div>

                  {detailSelections.length === 0 ? (
                    <div className="tickets-state">No bet selections found.</div>
                  ) : (
                    <div className="ticket-selections">
                      {detailSelections.map((selection, index) => {
                        const statusLabel = gameBetStatusLabel(selection.gameBetStatus);

                        return (
                          <article className="ticket-selection" key={`${selection.homeTeam}-${selection.awayTeam}-${index}`}>
                            <div className="ticket-selection-main">
                              <div>
                                <div className="ticket-selection-teams">{selection.homeTeam} vs {selection.awayTeam}</div>
                                <div className="ticket-selection-league">{selection.league}</div>
                              </div>
                              <TicketStatus label={statusLabel} />
                            </div>
                            <div className="ticket-selection-grid">
                              <div><span>StartTime</span>{formatDateTime(selection.startTime)}</div>
                              <div><span>Market</span>{selection.market}</div>
                              <div><span>Option</span>{selection.option}</div>
                              <div><span>Line</span>{selection.line}</div>
                              <div><span>BetOdd</span>{formatNumber(selection.betOdd)}</div>
                              <div><span>HomeScore / AwayScore</span>{selection.homeScore} / {selection.awayScore}</div>
                              <div><span>MatchStatus</span>{selection.matchStatus}</div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

export default TicketsPage;
