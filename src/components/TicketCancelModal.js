import {useCallback, useEffect, useRef, useState} from 'react';
import {FaCheckCircle, FaTimes} from 'react-icons/fa';
import {cancelTicket, lookupTicket, normalizeTicketNumber} from '../api/ticketCancelApi';
import {getTerminalSession} from '../auth/terminalAuth';
import {printTicketCancelReceipt} from '../utils/printTicketCancelReceipt';
import OnScreenKeyboard from './auth/OnScreenKeyboard';
import {formatMoney} from './TicketPayoutModal';
import './TicketPayoutModal.css';

const REASON = 'CustomerRequested';
const cancelledAt = (value) => value?.cancelledAt || value?.canceledAt;
const cancelReference = (value) =>
  value?.cancelReference || value?.cancellationReference || value?.reference;

const TicketCancelModal = ({open, onClose, initialTicketNumber = ''}) => {
  const [workflow, setWorkflow] = useState('entry');
  const [ticketNumber, setTicketNumber] = useState('');
  const [ticket, setTicket] = useState(null);
  const [cancellation, setCancellation] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const mountedRef = useRef(true);
  const requestRef = useRef(false);

  const reset = useCallback(() => {
    requestRef.current = false;
    setWorkflow('entry');
    setTicketNumber('');
    setTicket(null);
    setCancellation(null);
    setError('');
  }, []);

  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => {
    if (open) {
      mountedRef.current = true;
      reset();
      setTicketNumber(normalizeTicketNumber(initialTicketNumber));
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [initialTicketNumber, open, reset]);

  const close = useCallback(() => {
    if (workflow === 'submitting') return;
    reset();
    onClose();
  }, [onClose, reset, workflow]);

  const runLookup = useCallback(async (number = ticketNumber) => {
    const normalized = normalizeTicketNumber(number);
    if (!normalized) {
      setError('A ticket number is required.');
      return;
    }
    if (requestRef.current) return;
    requestRef.current = true;
    setTicketNumber(normalized);
    setError('');
    setWorkflow('lookup');
    try {
      const result = await lookupTicket(normalized);
      if (!mountedRef.current) return;
      setTicket(result);
      setWorkflow('details');
    } catch (apiError) {
      if (!mountedRef.current) return;
      setError(apiError.message);
      setWorkflow('error');
    } finally {
      requestRef.current = false;
    }
  }, [ticketNumber]);

  const submit = async () => {
    if (requestRef.current || !ticket?.canCancel) return;
    requestRef.current = true;
    setError('');
    setWorkflow('submitting');
    try {
      const result = await cancelTicket({
        ticketNumber: ticket.ticketNumber,
        confirmationReference: '',
        reason: REASON,
      });
      if (!mountedRef.current) return;
      setCancellation(result);
      setWorkflow('success');
    } catch (apiError) {
      if (!mountedRef.current) return;
      setError(apiError.message);
      setWorkflow('error');
    } finally {
      requestRef.current = false;
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && workflow !== 'submitting') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, open, workflow]);

  const keyboardKey = (key) => {
    if (key === 'ENTER') runLookup();
    else if (key === 'BACKSPACE') setTicketNumber(value => value.slice(0, -1));
    else if (key === 'CLEAR') setTicketNumber('');
    else if (key === 'SPACE') setTicketNumber(value => `${value} `);
    else setTicketNumber(value => `${value}${key}`);
    inputRef.current?.focus();
  };

  if (!open) return null;
  const busy = workflow === 'lookup' || workflow === 'submitting';
  const resultTicket = cancellation?.ticketNumber || ticket?.ticketNumber;
  const resultStake = cancellation?.stake ?? ticket?.stake;
  return (
    <div className="payout-backdrop" role="dialog" aria-modal="true" aria-labelledby="cancel-ticket-title">
      <section className="payout-modal">
        <header className="payout-header">
          <h2 id="cancel-ticket-title">CANCEL TICKET</h2>
          <button aria-label="Close cancel ticket" disabled={workflow === 'submitting'} onClick={close} type="button"><FaTimes /></button>
        </header>
        <div className="payout-body">
          {(workflow === 'entry' || workflow === 'lookup') && <>
            <label className="payout-label" htmlFor="cancel-ticket-number">Ticket Number</label>
            <input
              autoComplete="off"
              autoFocus
              disabled={busy}
              id="cancel-ticket-number"
              onChange={event => setTicketNumber(event.target.value.toUpperCase())}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); runLookup(); } }}
              ref={inputRef}
              spellCheck="false"
              value={ticketNumber}
            />
            {error && <div className="payout-error" role="alert">{error}</div>}
            <OnScreenKeyboard disabled={busy} onKey={keyboardKey} />
            <div className="payout-actions">
              <button className="primary" disabled={busy} onClick={() => runLookup()} type="button">{busy ? 'LOOKING UP…' : 'LOOKUP'}</button>
              <button disabled={busy} onClick={close} type="button">CANCEL</button>
            </div>
          </>}

          {(workflow === 'details' || workflow === 'confirm') && ticket && <>
            <div className={`payout-status ${ticket.canCancel ? 'payable' : 'blocked'}`}>
              {ticket.status || 'Unknown'}
            </div>
            <div className="payout-details">
              <div className="payout-detail"><span>Ticket</span><strong>{ticket.ticketNumber}</strong></div>
              <div className="payout-detail"><span>Status</span><strong>{ticket.status}</strong></div>
              <div className="payout-detail"><span>Stake</span><strong>{formatMoney(ticket.stake, ticket.currency)}</strong></div>
              <div className="payout-detail"><span>Possible Win</span><strong>{formatMoney(ticket.possibleWin, ticket.currency)}</strong></div>
              <div className="payout-detail"><span>Can Cancel</span><strong>{ticket.canCancel ? 'YES' : 'NO'}</strong></div>
            </div>
            {!ticket.canCancel && <div className="payout-error">Cannot cancel: {ticket.cannotCancelReason || 'This ticket is not eligible for cancellation.'}</div>}
            {workflow === 'confirm' && <div className="payout-confirm">
              <div>Are you sure you want to cancel this ticket?</div>
              <p>Ticket: {ticket.ticketNumber}</p>
              <p>Stake: {formatMoney(ticket.stake, ticket.currency)}</p>
              <div>This action cannot be undone.</div>
            </div>}
            <div className="payout-actions">
              {workflow === 'details' && <button className="primary" disabled={!ticket.canCancel} onClick={() => setWorkflow('confirm')} type="button">CONFIRM</button>}
              {workflow === 'confirm' && <button className="primary" onClick={submit} type="button">CONFIRM CANCELLATION</button>}
              {workflow === 'confirm' && <button onClick={() => setWorkflow('details')} type="button">CANCEL</button>}
              {workflow === 'details' && <button onClick={reset} type="button">NEW SEARCH</button>}
              {workflow === 'details' && <button onClick={close} type="button">CLOSE</button>}
            </div>
          </>}

          {workflow === 'submitting' && <div className="payout-processing" role="status">Cancelling ticket…</div>}

          {workflow === 'success' && cancellation && <>
            <div className="payout-success"><h3><FaCheckCircle /> TICKET CANCELLED</h3></div>
            <div className="payout-details">
              <div className="payout-detail"><span>Ticket</span><strong>{resultTicket}</strong></div>
              <div className="payout-detail"><span>Reference</span><strong>{cancelReference(cancellation)}</strong></div>
              <div className="payout-detail"><span>Cancelled</span><strong>{new Date(cancelledAt(cancellation)).toLocaleString('en-GB', {timeZone: 'UTC', timeZoneName: 'short'})}</strong></div>
            </div>
            <div className="payout-actions">
              <button className="primary" onClick={() => {
                const session = getTerminalSession();
                const printed = printTicketCancelReceipt({
                  cancellation: {...cancellation, stake: resultStake},
                  ticket,
                  shop: cancellation.shop || cancellation.branch || session?.terminal?.branchId,
                  terminal: session?.terminal?.code,
                  reason: REASON,
                });
                if (printed) close();
              }} type="button">PRINT RECEIPT</button>
              <button onClick={close} type="button">DONE</button>
            </div>
          </>}

          {workflow === 'error' && <>
            <div className="payout-message"><h3>Cancellation failed</h3><p role="alert">{error}</p><strong>{ticketNumber}</strong></div>
            <div className="payout-actions">
              <button className="primary" onClick={reset} type="button">TRY AGAIN</button>
              <button onClick={close} type="button">CLOSE</button>
            </div>
          </>}
        </div>
      </section>
    </div>
  );
};

export default TicketCancelModal;
