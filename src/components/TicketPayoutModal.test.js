import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import TicketPayoutModal, {createConfirmationReference, formatMoney} from './TicketPayoutModal';
import {lookupTicket, payoutTicket} from '../api/ticketPayoutApi';

jest.mock('../api/ticketPayoutApi', () => ({
  lookupTicket: jest.fn(),
  payoutTicket: jest.fn(),
  normalizeTicketNumber: value => String(value || '').trim().toUpperCase(),
}));
jest.mock('../auth/terminalAuth', () => ({
  getTerminalSession: () => ({terminal: {code: 'DISPLAY-001'}}),
}));
jest.mock('../utils/printPayoutReceipt', () => ({printPayoutReceipt: jest.fn(() => true)}));

const payable = {
  receiptId: 83,
  ticketNumber: 'VT-ABC',
  placedAt: '2026-07-24T10:00:00Z',
  stake: 1000,
  totalOdds: 2.09,
  possibleWin: 2090,
  payableAmount: 1090,
  currency: 'UGX',
  status: 'Won',
  canPayout: true,
};
const renderModal = (props = {}) => {
  const onClose = jest.fn();
  render(<TicketPayoutModal open onClose={onClose} {...props} />);
  return {onClose};
};

beforeEach(() => jest.clearAllMocks());

test('opens focused and closes', () => {
  const {onClose} = renderModal();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByLabelText('Enter ticket number')).toHaveFocus();
  fireEvent.click(screen.getByRole('button', {name: 'CANCEL'}));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('hands the looked-up ticket to cancellation from the existing Cancel button', async () => {
  const onCancelTicket = jest.fn();
  lookupTicket.mockResolvedValue({...payable, status: 'Pending', canPayout: false, canCancel: true});
  renderModal({onCancelTicket});
  fireEvent.change(screen.getByLabelText('Enter ticket number'), {target: {value: 'VT-ABC'}});
  fireEvent.click(screen.getByRole('button', {name: 'APPLY / SEARCH'}));
  await screen.findByText('UGX 1,000');
  fireEvent.click(screen.getByRole('button', {name: 'CANCEL'}));
  expect(onCancelTicket).toHaveBeenCalledWith('VT-ABC');
});

test('validates a blank ticket', () => {
  renderModal();
  fireEvent.click(screen.getByRole('button', {name: 'APPLY / SEARCH'}));
  expect(screen.getByRole('alert')).toHaveTextContent('required');
  expect(lookupTicket).not.toHaveBeenCalled();
});

test('looks up a payable ticket, confirms, and completes payout', async () => {
  lookupTicket.mockResolvedValue(payable);
  payoutTicket.mockResolvedValue({
    ticketNumber: 'VT-ABC', paidAmount: 1090, currency: 'UGX',
    paidAt: '2026-07-24T10:24:23Z', payoutReference: 'VPO-1', status: 'Paid',
  });
  renderModal();
  fireEvent.change(screen.getByLabelText('Enter ticket number'), {target: {value: ' vt-abc '}});
  fireEvent.click(screen.getByRole('button', {name: 'APPLY / SEARCH'}));
  expect(await screen.findByText('UGX 1,090')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'PAYOUT TICKET'}));
  expect(screen.getByText(/Pay UGX 1,090 for ticket VT-ABC/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'CONFIRM PAYOUT'}));
  expect(await screen.findByText('PAYOUT SUCCESSFUL')).toBeInTheDocument();
  expect(payoutTicket).toHaveBeenCalledWith('VT-ABC', expect.stringMatching(/^DISPLAY-001-/));
});

test('shows AlreadyPaid without another attempt', async () => {
  lookupTicket.mockRejectedValue({status: 409, code: 'AlreadyPaid', message: 'This ticket has already been paid.', body: {ticketNumber: 'VT-ABC'}});
  renderModal();
  fireEvent.change(screen.getByLabelText('Enter ticket number'), {target: {value: 'VT-ABC'}});
  fireEvent.click(screen.getByRole('button', {name: 'APPLY / SEARCH'}));
  expect(await screen.findByText('Ticket already paid')).toBeInTheDocument();
  expect(screen.queryByRole('button', {name: /confirm payout/i})).not.toBeInTheDocument();
});

test('does not enable payout for a non-payable ticket', async () => {
  lookupTicket.mockResolvedValue({...payable, status: 'Pending', canPayout: false, cannotPayoutReason: 'Pending'});
  renderModal();
  fireEvent.change(screen.getByLabelText('Enter ticket number'), {target: {value: 'VT-ABC'}});
  fireEvent.click(screen.getByRole('button', {name: 'APPLY / SEARCH'}));
  expect(await screen.findByRole('button', {name: 'PAYOUT TICKET'})).toBeDisabled();
});

test('prevents duplicate lookup clicks', async () => {
  let resolve;
  lookupTicket.mockReturnValue(new Promise(done => { resolve = done; }));
  renderModal();
  fireEvent.change(screen.getByLabelText('Enter ticket number'), {target: {value: 'VT-ABC'}});
  const button = screen.getByRole('button', {name: 'APPLY / SEARCH'});
  fireEvent.click(button);
  fireEvent.click(button);
  expect(lookupTicket).toHaveBeenCalledTimes(1);
  await act(async () => resolve(payable));
  expect(screen.getByRole('button', {name: 'PAYOUT TICKET'})).toBeEnabled();
});

test('ambiguous failure checks status without blindly resubmitting', async () => {
  lookupTicket.mockResolvedValue(payable);
  payoutTicket.mockRejectedValue({status: 0, code: 'NetworkError', message: 'offline'});
  renderModal();
  fireEvent.change(screen.getByLabelText('Enter ticket number'), {target: {value: 'VT-ABC'}});
  fireEvent.click(screen.getByRole('button', {name: 'APPLY / SEARCH'}));
  fireEvent.click(await screen.findByRole('button', {name: 'PAYOUT TICKET'}));
  fireEvent.click(screen.getByRole('button', {name: 'CONFIRM PAYOUT'}));
  expect(await screen.findByText('Payout status unknown')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'CHECK STATUS'}));
  await waitFor(() => expect(lookupTicket).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('button', {name: 'PAYOUT TICKET'})).toBeEnabled();
  expect(payoutTicket).toHaveBeenCalledTimes(1);
});

test('formats UGX with no decimal places', () => {
  expect(formatMoney(1090, 'UGX')).toBe('UGX 1,090');
});

test('keeps one confirmation reference during an attempt', async () => {
  lookupTicket.mockResolvedValue(payable);
  renderModal();
  fireEvent.change(screen.getByLabelText('Enter ticket number'), {target: {value: 'VT-ABC'}});
  fireEvent.click(screen.getByRole('button', {name: 'APPLY / SEARCH'}));
  fireEvent.click(await screen.findByRole('button', {name: 'PAYOUT TICKET'}));
  fireEvent.click(screen.getByRole('button', {name: 'BACK'}));
  fireEvent.click(screen.getByRole('button', {name: 'PAYOUT TICKET'}));
  payoutTicket.mockResolvedValue({...payable, paidAmount: 1090, paidAt: payable.placedAt, payoutReference: 'P', status: 'Paid'});
  fireEvent.click(screen.getByRole('button', {name: 'CONFIRM PAYOUT'}));
  await screen.findByText('PAYOUT SUCCESSFUL');
  expect(payoutTicket.mock.calls[0][1]).toMatch(/^DISPLAY-001-/);
});

test('confirmation references are collision-resistant in shape', () => {
  expect(createConfirmationReference('DISPLAY-001')).toMatch(/^DISPLAY-001-\d{17}-[A-Z0-9]+$/);
});
