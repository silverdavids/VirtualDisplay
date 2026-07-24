import {useCallback, useEffect, useRef, useState} from 'react';
import {FaTimes} from 'react-icons/fa';
import {lookupTicket, normalizeTicketNumber, payoutTicket} from '../api/ticketPayoutApi';
import {getTerminalSession} from '../auth/terminalAuth';
import {printPayoutReceipt} from '../utils/printPayoutReceipt';
import OnScreenKeyboard from './auth/OnScreenKeyboard';
import './TicketPayoutModal.css';

export const formatMoney = (amount, currency = 'UGX') => {
  const digits = currency === 'UGX' ? 0 : 2;
  return `${currency} ${new Intl.NumberFormat('en-UG', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(amount || 0))}`;
};

export const createConfirmationReference = (terminalCode = 'DISPLAY') => {
  const terminal = String(terminalCode || 'DISPLAY').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'DISPLAY';
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = window.crypto?.getRandomValues
    ? Array.from(window.crypto.getRandomValues(new Uint8Array(6)), byte => byte.toString(16).padStart(2, '0')).join('')
    : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return `${terminal}-${timestamp}-${random.toUpperCase()}`;
};

const fields = [
  ['Ticket number', 'ticketNumber'],
  ['Ticket status', 'status'],
  ['Stake', 'stake', true],
  ['Total odds', 'totalOdds'],
  ['Potential win', 'possibleWin', true],
  ['Payable amount', 'payableAmount', true],
  ['Ticket date', 'placedAt', false, true],
  ['Paid time', 'paidAt', false, true],
  ['Payout reference', 'payoutReference'],
];

const statusClass = (status) => {
  const value = String(status || '').toLowerCase();
  if (value.includes('won') || value.includes('payable')) return 'payable';
  if (value.includes('pending')) return 'pending';
  if (value.includes('paid')) return 'paid';
  if (['lost', 'cancelled', 'blocked'].some(item => value.includes(item))) return 'blocked';
  return '';
};

const TicketPayoutModal = ({open, onClose, onCancelTicket}) => {
  const [workflow, setWorkflow] = useState('entry');
  const [ticketNumber, setTicketNumber] = useState('');
  const [ticket, setTicket] = useState(null);
  const [payout, setPayout] = useState(null);
  const [error, setError] = useState(null);
  const [confirmationReference, setConfirmationReference] = useState('');
  const [printError, setPrintError] = useState('');
  const inputRef = useRef(null);
  const mountedRef = useRef(true);
  const requestRef = useRef(false);

  const reset = useCallback(() => {
    requestRef.current = false;
    setWorkflow('entry');
    setTicketNumber('');
    setTicket(null);
    setPayout(null);
    setError(null);
    setConfirmationReference('');
    setPrintError('');
  }, []);

  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => {
    if (open) {
      mountedRef.current = true;
      reset();
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, reset]);

  const close = useCallback(() => {
    if (workflow === 'payoutSubmitting') return;
    reset();
    onClose();
  }, [onClose, reset, workflow]);

  const runLookup = useCallback(async (number = ticketNumber) => {
    const normalized = normalizeTicketNumber(number);
    if (!normalized) {
      setError({heading: 'Enter ticket number', message: 'A ticket number is required.'});
      return;
    }
    if (requestRef.current) return;
    requestRef.current = true;
    setTicketNumber(normalized);
    setError(null);
    setWorkflow('lookupLoading');
    try {
      const result = await lookupTicket(normalized);
      if (!mountedRef.current) return;
      setTicket(result);
      setWorkflow('details');
    } catch (apiError) {
      if (!mountedRef.current) return;
      const notFound = apiError.status === 404 || apiError.code === 'NotFound';
      const alreadyPaid = apiError.code === 'AlreadyPaid';
      setError({
        heading: alreadyPaid ? 'Ticket already paid' : notFound ? 'Ticket not found' : 'Ticket lookup failed',
        message: apiError.message,
        apiError,
      });
      setWorkflow('error');
    } finally {
      requestRef.current = false;
    }
  }, [ticketNumber]);

  const beginConfirmation = () => {
    if (!ticket?.canPayout) return;
    if (!confirmationReference) {
      setConfirmationReference(createConfirmationReference(getTerminalSession()?.terminal?.code));
    }
    setWorkflow('confirm');
  };

  const submitPayout = async () => {
    if (requestRef.current || !ticket?.canPayout) return;
    requestRef.current = true;
    setError(null);
    setWorkflow('payoutSubmitting');
    try {
      const result = await payoutTicket(ticket.ticketNumber, confirmationReference);
      if (!mountedRef.current) return;
      setPayout(result);
      setWorkflow('success');
    } catch (apiError) {
      if (!mountedRef.current) return;
      if (apiError.status === 0 || apiError.status >= 500) {
        setError({
          heading: 'Payout status unknown',
          message: 'Payout could not be confirmed. Check the ticket again before retrying.',
          apiError,
        });
        setWorkflow('ambiguousStatus');
      } else {
        const alreadyPaid = apiError.code === 'AlreadyPaid';
        setError({
          heading: alreadyPaid ? 'Ticket already paid' : 'Payout failed',
          message: apiError.message,
          apiError,
        });
        setWorkflow('error');
      }
    } finally {
      requestRef.current = false;
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && workflow !== 'payoutSubmitting') close();
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
  const busy = workflow === 'lookupLoading' || workflow === 'payoutSubmitting';
  const errorBody = error?.apiError?.body || {};
  return (
    <div className="payout-backdrop" role="dialog" aria-modal="true" aria-labelledby="payout-title">
      <section className="payout-modal">
        <header className="payout-header">
          <h2 id="payout-title">PAYOUT TICKET</h2>
          <button aria-label="Close payout ticket" disabled={workflow === 'payoutSubmitting'} onClick={close} type="button"><FaTimes /></button>
        </header>
        <div className="payout-body">
          {(workflow === 'entry' || workflow === 'lookupLoading') && <>
            <label className="payout-label" htmlFor="payout-ticket-number">Enter ticket number</label>
            <input
              autoComplete="off"
              autoFocus
              disabled={busy}
              id="payout-ticket-number"
              onChange={event => setTicketNumber(event.target.value.toUpperCase())}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); runLookup(); } }}
              ref={inputRef}
              spellCheck="false"
              value={ticketNumber}
            />
            {error && <div className="payout-error" role="alert">{error.message}</div>}
            <OnScreenKeyboard disabled={busy} onKey={keyboardKey} />
            <div className="payout-actions">
              <button className="primary" disabled={busy} onClick={() => runLookup()} type="button">{busy ? 'SEARCHING…' : 'APPLY / SEARCH'}</button>
              <button disabled={busy} onClick={close} type="button">CANCEL</button>
            </div>
          </>}

          {(workflow === 'details' || workflow === 'confirm') && ticket && <>
            <div className={`payout-status ${statusClass(ticket.status)}`}>{ticket.status || (ticket.canPayout ? 'Payable' : 'Not payable')}</div>
            <div className="payout-details">
              {fields.map(([label, key, money, date]) => ticket[key] !== undefined && ticket[key] !== null && ticket[key] !== '' && (
                <div className="payout-detail" key={key}><span>{label}</span><strong>
                  {money ? formatMoney(ticket[key], ticket.currency) : date ? new Date(ticket[key]).toLocaleString() : String(ticket[key])}
                </strong></div>
              ))}
            </div>
            {!ticket.canPayout && <div className="payout-error">{ticket.cannotPayoutReason || 'This ticket is not eligible for payout.'}</div>}
            {workflow === 'confirm' && <div className="payout-confirm">
              Pay {formatMoney(ticket.payableAmount, ticket.currency)} for ticket {ticket.ticketNumber}?
            </div>}
            <div className="payout-actions">
              {workflow === 'details' && <button className="primary" disabled={!ticket.canPayout} onClick={beginConfirmation} type="button">PAYOUT TICKET</button>}
              {workflow === 'confirm' && <button className="primary" onClick={submitPayout} type="button">CONFIRM PAYOUT</button>}
              {workflow === 'confirm' && <button onClick={() => setWorkflow('details')} type="button">BACK</button>}
              {workflow === 'details' && <button onClick={reset} type="button">NEW SEARCH</button>}
              {workflow === 'details'
                ? <button onClick={() => onCancelTicket ? onCancelTicket(ticket.ticketNumber) : close()} type="button">CANCEL</button>
                : <button onClick={close} type="button">CANCEL</button>}
            </div>
          </>}

          {workflow === 'payoutSubmitting' && <div className="payout-processing" role="status">Processing payout…</div>}

          {workflow === 'success' && payout && <>
            <div className="payout-success"><h3>PAYOUT SUCCESSFUL</h3><div className="payout-paid-amount">{formatMoney(payout.paidAmount, payout.currency)}</div></div>
            <div className="payout-details">
              <div className="payout-detail"><span>Ticket number</span><strong>{payout.ticketNumber}</strong></div>
              <div className="payout-detail"><span>Payout reference</span><strong>{payout.payoutReference}</strong></div>
              <div className="payout-detail"><span>Paid time</span><strong>{new Date(payout.paidAt).toLocaleString()}</strong></div>
              <div className="payout-detail"><span>Status</span><strong>{payout.status}</strong></div>
            </div>
            {printError && <div className="payout-error">{printError}</div>}
            <div className="payout-actions">
              <button className="primary" onClick={() => {
                const session = getTerminalSession();
                const printed = printPayoutReceipt({payout, confirmationReference, terminalCode: session?.terminal?.code});
                setPrintError(printed ? '' : 'Allow popups to print the payout receipt.');
              }} type="button">PRINT RECEIPT</button>
              <button onClick={close} type="button">DONE</button>
            </div>
          </>}

          {(workflow === 'error' || workflow === 'ambiguousStatus') && <>
            <div className="payout-message">
              <h3>{error?.heading}</h3><p>{error?.message}</p>
              <strong>{errorBody.ticketNumber || ticketNumber}</strong>
              {errorBody.payoutReference && <p>Payout reference: {errorBody.payoutReference}</p>}
              {errorBody.paidAt && <p>Paid: {new Date(errorBody.paidAt).toLocaleString()}</p>}
            </div>
            <div className="payout-actions">
              {workflow === 'ambiguousStatus'
                ? <button className="primary" onClick={() => runLookup(ticketNumber)} type="button">CHECK STATUS</button>
                : error?.apiError?.code !== 'AlreadyPaid' && <button className="primary" onClick={reset} type="button">TRY AGAIN</button>}
              {error?.apiError?.status === 409 && error?.apiError?.code !== 'AlreadyPaid' && <button onClick={() => runLookup(ticketNumber)} type="button">REFRESH TICKET</button>}
              <button onClick={close} type="button">CANCEL</button>
            </div>
          </>}
        </div>
      </section>
    </div>
  );
};

export default TicketPayoutModal;
