import {createCode128Svg, normalizeVirtualReceipt, printVirtualReceipt} from './printVirtualReceipt';

describe('virtual thermal receipt', () => {
  test('uses authoritative detail values and payout ticket number for the barcode', () => {
    const receipt = normalizeVirtualReceipt({
      details: {
        ticket: {
          receiptId: 'receipt-guid',
          ticketNumber: '212697007925',
          receiptDate: '2026-08-06T11:23:00',
          stake: 2000,
          minWin: 5180,
          possibleWin: 5180,
          currency: 'USh',
        },
        bets: [{providerMatchId: '254418534010', homeTeam: 'BOU', awayTeam: 'SHU', market: 'WIN', option: 'SHU', betOdd: 2.59}],
      },
      shopCode: 'fallback-shop',
    });

    expect(receipt.ticketNumber).toBe('212697007925');
    expect(receipt.barcodeValue).toBe('212697007925');
    expect(receipt.stake).toBe(2000);
    expect(receipt.selections).toHaveLength(1);
    expect(createCode128Svg(receipt.barcodeValue)).toContain('<svg');
  });

  test('renders all selections and dispatches one browser print', () => {
    const print = jest.fn();
    const addEventListener = jest.fn();
    const documentOpen = jest.fn();
    const documentWrite = jest.fn();
    const documentClose = jest.fn();
    const focus = jest.fn();
    const appendChild = jest.spyOn(document.body, 'appendChild').mockImplementation((frame) => {
      Object.defineProperty(frame, 'contentWindow', {value: {
        document: {open: documentOpen, write: documentWrite, close: documentClose},
        addEventListener,
        focus,
        print,
      }});
      return frame;
    });
    jest.useFakeTimers();

    const printed = printVirtualReceipt({
      shop: 'T01', ticketNumber: 'TICKET-1', barcodeValue: 'TICKET-1', bookedAt: '2026-08-06T11:23:00',
      stake: 4000, minWin: 5000, maxWin: 12000, currency: 'USh',
      selections: Array.from({length: 4}, (_, index) => ({eventId: index + 1, home: `Long home ${index}`, away: `Long away ${index}`, market: 'Match result', option: 'Home win', odd: 2})),
    });
    jest.runOnlyPendingTimers();

    expect(printed).toBe(true);
    expect(documentWrite.mock.calls[0][0].match(/class="selection"/g)).toHaveLength(4);
    expect(print).toHaveBeenCalledTimes(1);
    appendChild.mockRestore();
    jest.useRealTimers();
  });
});
