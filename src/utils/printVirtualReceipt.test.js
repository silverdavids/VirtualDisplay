import {createCode128Svg, formatKampalaDateTime, normalizeVirtualReceipt, printVirtualReceipt} from './printVirtualReceipt';

describe('virtual thermal receipt', () => {
  test('uses authoritative detail values and payout ticket number for the barcode', () => {
    const receipt = normalizeVirtualReceipt({
      details: {
        ticket: {
          receiptId: 'receipt-guid',
          ticketNumber: '212697007925',
          receiptDate: '2026-08-06T11:23:00',
          bookedAtUtc: '2026-08-09T11:20:00.000Z',
          stake: 2000,
          minWin: 5180,
          possibleWin: 5180,
          currency: 'USh',
          shopDisplayName: 'stale-details-shop',
        },
        bets: [{providerMatchId: '254418534010', homeTeam: 'BOU', awayTeam: 'SHU', market: 'WIN', option: 'SHU', betOdd: 2.59}],
      },
      placed: {shopDisplayName: 'ntantamuki-vcash'},
      shopCode: 'fallback-shop',
    });

    expect(receipt.ticketNumber).toBe('212697007925');
    expect(receipt.barcodeValue).toBe('212697007925');
    expect(receipt.shopDisplayName).toBe('ntantamuki-vcash');
    expect(receipt.bookedAtUtc).toBe('2026-08-09T11:20:00.000Z');
    expect(receipt.stake).toBe(2000);
    expect(receipt.selections).toHaveLength(1);
    expect(createCode128Svg(receipt.barcodeValue)).toContain('<svg');
  });

  test('formats canonical UTC booking time in Kampala independently of display timezone', () => {
    expect(formatKampalaDateTime('2026-08-09T11:20:00.000Z')).toBe('09.08.26 14:20');
  });

  test('initial print and reprint retain the persisted booking time', () => {
    const bookedAtUtc = '2026-08-09T11:20:00.000Z';
    const initial = normalizeVirtualReceipt({placed: {receiptId: 266, ticketNumber: '061811049732', bookedAtUtc}});
    const reprint = normalizeVirtualReceipt({details: {receipt: {receiptId: 266, ticketNumber: '061811049732', bookedAtUtc}}});

    expect(formatKampalaDateTime(initial.bookedAtUtc)).toBe('09.08.26 14:20');
    expect(formatKampalaDateTime(reprint.bookedAtUtc)).toBe('09.08.26 14:20');
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
      shopDisplayName: 'T01', ticketNumber: 'TICKET-1', barcodeValue: 'TICKET-1', bookedAtUtc: '2026-08-06T11:23:00Z',
      stake: 4000, minWin: 5000, maxWin: 12000, currency: 'USh',
      selections: Array.from({length: 4}, (_, index) => ({eventId: index + 1, home: `Long home ${index}`, away: `Long away ${index}`, market: 'Match result', option: 'Home win', odd: 2})),
    });
    jest.runOnlyPendingTimers();

    expect(printed).toBe(true);
    expect(documentWrite.mock.calls[0][0].match(/class="selection"/g)).toHaveLength(4);
    expect(documentWrite.mock.calls[0][0]).toContain('font:700 12px/1.2 Arial,sans-serif');
    expect(documentWrite.mock.calls[0][0]).toContain('border-top:.5mm solid #000');
    expect(print).toHaveBeenCalledTimes(1);
    appendChild.mockRestore();
    jest.useRealTimers();
  });
});
