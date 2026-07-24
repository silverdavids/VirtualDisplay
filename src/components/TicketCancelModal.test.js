import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import TicketCancelModal from './TicketCancelModal';
import {cancelTicket, lookupTicket} from '../api/ticketCancelApi';
import {printTicketCancelReceipt} from '../utils/printTicketCancelReceipt';

jest.mock('../api/ticketCancelApi', () => ({
  lookupTicket: jest.fn(),
  cancelTicket: jest.fn(),
  normalizeTicketNumber: value => String(value || '').trim().toUpperCase(),
}));
jest.mock('../auth/terminalAuth', () => ({
  getTerminalSession: () => ({terminal: {code: 'DISPLAY-001', branchId: 'SHOP-1'}}),
}));
jest.mock('../utils/printTicketCancelReceipt', () => ({
  printTicketCancelReceipt: jest.fn(() => true),
}));

const eligible = {
  ticketNumber: 'VT-ABC',
  status: 'Pending',
  stake: 1500,
  possibleWin: 11505,
  currency: 'UGX',
  canCancel: true,
};

const openAndLookup = async (ticket = eligible) => {
  lookupTicket.mockResolvedValue(ticket);
  const onClose = jest.fn();
  render(<TicketCancelModal open onClose={onClose} />);
  fireEvent.change(screen.getByLabelText('Ticket Number'), {target: {value: ' vt-abc '}});
  fireEvent.keyDown(screen.getByLabelText('Ticket Number'), {key: 'Enter'});
  await screen.findByText('UGX 11,505');
  return onClose;
};

beforeEach(() => {
  jest.clearAllMocks();
  printTicketCancelReceipt.mockReturnValue(true);
});

test('successful lookup displays an eligible ticket and cancellation fields', async () => {
  await openAndLookup();
  expect(lookupTicket).toHaveBeenCalledWith('VT-ABC');
  expect(screen.getByText('YES')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'CONFIRM'})).toBeEnabled();
});

test('prefills a ticket handed off by the payout lookup', () => {
  render(<TicketCancelModal initialTicketNumber="vt-from-payout" open onClose={jest.fn()} />);
  expect(screen.getByLabelText('Ticket Number')).toHaveValue('VT-FROM-PAYOUT');
});

test('canCancel=false displays the reason and disables confirm', async () => {
  await openAndLookup({...eligible, canCancel: false, cannotCancelReason: 'EventStarted'});
  expect(screen.getByText('Cannot cancel: EventStarted')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'CONFIRM'})).toBeDisabled();
});

test('successfully cancels once and shows the backend reference', async () => {
  cancelTicket.mockResolvedValue({
    ticketNumber: 'VT-ABC',
    cancelReference: 'VTC-12345678',
    cancelledAt: '2026-07-24T13:55:00Z',
    reason: 'CustomerRequested',
  });
  await openAndLookup();
  fireEvent.click(screen.getByRole('button', {name: 'CONFIRM'}));
  expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();
  const confirmButton = screen.getByRole('button', {name: 'CONFIRM CANCELLATION'});
  fireEvent.click(confirmButton);
  fireEvent.click(confirmButton);
  expect(await screen.findByText(/TICKET CANCELLED/)).toBeInTheDocument();
  expect(screen.getByText('VTC-12345678')).toBeInTheDocument();
  expect(cancelTicket).toHaveBeenCalledTimes(1);
  expect(cancelTicket).toHaveBeenCalledWith({
    ticketNumber: 'VT-ABC',
    confirmationReference: '',
    reason: 'CustomerRequested',
  });
});

test.each([
  ['AlreadyCancelled', 'This ticket has already been cancelled.'],
  ['EventStarted', 'The first event has already started.'],
  ['WrongBranch', 'This ticket cannot be cancelled by this branch.'],
])('displays the exact %s backend message', async (code, message) => {
  cancelTicket.mockRejectedValue({status: 409, code, message});
  await openAndLookup();
  fireEvent.click(screen.getByRole('button', {name: 'CONFIRM'}));
  fireEvent.click(screen.getByRole('button', {name: 'CONFIRM CANCELLATION'}));
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
});

test('prints the cancellation receipt and closes', async () => {
  cancelTicket.mockResolvedValue({
    ticketNumber: 'VT-ABC',
    cancelReference: 'VTC-1',
    cancelledAt: '2026-07-24T13:55:00Z',
  });
  const onClose = await openAndLookup();
  fireEvent.click(screen.getByRole('button', {name: 'CONFIRM'}));
  fireEvent.click(screen.getByRole('button', {name: 'CONFIRM CANCELLATION'}));
  fireEvent.click(await screen.findByRole('button', {name: 'PRINT RECEIPT'}));
  expect(printTicketCancelReceipt).toHaveBeenCalledWith(expect.objectContaining({
    reason: 'CustomerRequested',
    terminal: 'DISPLAY-001',
  }));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});
