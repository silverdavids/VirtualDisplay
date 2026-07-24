import {printTicketCancelReceipt} from './printTicketCancelReceipt';

test('renders the cancellation receipt fields', () => {
  window.print = jest.fn();
  jest.spyOn(window, 'setTimeout').mockImplementation(() => 1);
  printTicketCancelReceipt({
    cancellation: {
      ticketNumber: 'VT-ABC',
      cancelReference: 'VTC-123',
      cancelledAt: '2026-07-24T13:55:00Z',
    },
    ticket: {stake: 1500, currency: 'UGX'},
    shop: 'Kampala Shop',
    terminal: 'DISPLAY-001',
    reason: 'CustomerRequested',
  });
  const receipt = document.querySelector('.payout-print-receipt');
  expect(receipt).toHaveTextContent('TICKET CANCELLATION');
  expect(receipt).toHaveTextContent('Kampala Shop');
  expect(receipt).toHaveTextContent('DISPLAY-001');
  expect(receipt).toHaveTextContent('VT-ABC');
  expect(receipt).toHaveTextContent('UGX 1,500');
  expect(receipt).toHaveTextContent('VTC-123');
  expect(receipt).toHaveTextContent('CustomerRequested');
  expect(window.print).toHaveBeenCalled();
  window.setTimeout.mockRestore();
  receipt.remove();
});
