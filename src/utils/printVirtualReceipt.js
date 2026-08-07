const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const valueOf = (object, names, fallback = '') => {
  for (const name of names) {
    if (object?.[name] !== undefined && object?.[name] !== null && object?.[name] !== '') return object[name];
  }
  return fallback;
};

const arrayOf = (object, names) => {
  for (const name of names) if (Array.isArray(object?.[name])) return object[name];
  return [];
};

const formatMoney = (value, currency = 'USh') => {
  if (value === null || value === undefined || value === '') return '-';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return `${new Intl.NumberFormat('en-UG', {maximumFractionDigits: 2}).format(amount)} ${currency}`;
};

const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return value ? String(value) : '-';
  const part = (number) => String(number).padStart(2, '0');
  return `${part(date.getDate())}.${part(date.getMonth() + 1)}.${part(date.getFullYear() % 100)} ${part(date.getHours())}:${part(date.getMinutes())}`;
};

const formatEventTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

// Code 128 bar/space widths (symbols 0-106). We use set B, which covers terminal ticket IDs.
const CODE128 = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212',
  '112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131',
  '311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321',
  '112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121',
  '313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114',
  '122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212',
  '124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113',
  '114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112',
];

export const createCode128Svg = (rawValue) => {
  const value = String(rawValue ?? '');
  if (!value || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126)) return '';
  const symbols = [104, ...[...value].map((char) => char.charCodeAt(0) - 32)];
  const checksum = (104 + symbols.slice(1).reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103;
  const patterns = [...symbols, checksum, 106].map((symbol) => CODE128[symbol]);
  let x = 10;
  const bars = [];
  patterns.forEach((pattern) => {
    [...pattern].forEach((width, index) => {
      const units = Number(width);
      if (index % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${units}" height="42"/>`);
      x += units;
    });
  });
  return `<svg class="barcode" viewBox="0 0 ${x + 10} 42" role="img" aria-label="Ticket barcode ${escapeHtml(value)}" xmlns="http://www.w3.org/2000/svg">${bars.join('')}</svg>`;
};

export const normalizeVirtualReceipt = ({details, placed, selections = [], stake, possibleWin, shopCode, terminal}) => {
  const root = valueOf(details, ['ticket', 'Ticket', 'receipt', 'Receipt'], details || placed || {});
  const backendSelections = arrayOf(details, ['bets', 'Bets', 'selections', 'Selections', 'ticketBets', 'TicketBets']);
  const nestedSelections = arrayOf(root, ['bets', 'Bets', 'selections', 'Selections', 'ticketBets', 'TicketBets']);
  const receiptSelections = backendSelections.length ? backendSelections : nestedSelections.length ? nestedSelections : selections;
  const currency = valueOf(root, ['currency', 'Currency', 'currencyCode', 'CurrencyCode'], 'USh');
  const receiptId = valueOf(root, ['receiptId', 'ReceiptId'], valueOf(placed, ['receiptId', 'ReceiptId']));
  const ticketNumber = valueOf(root, ['ticketNumber', 'TicketNumber', 'serialCode', 'SerialCode', 'serial', 'Serial'],
    valueOf(placed, ['ticketNumber', 'TicketNumber', 'serialCode', 'SerialCode', 'serial', 'Serial'], receiptId));

  return {
    shop: valueOf(root, ['shopCode', 'ShopCode', 'terminalCode', 'TerminalCode'], terminal?.code || shopCode || '-'),
    ticketNumber: ticketNumber || receiptId || '-',
    barcodeValue: ticketNumber || receiptId || '',
    bookedAt: valueOf(root, ['receiptDate', 'ReceiptDate', 'bookTime', 'BookTime', 'placedAt', 'PlacedAt', 'createdAt', 'CreatedAt'],
      valueOf(placed, ['receiptDate', 'ReceiptDate', 'placedAt', 'PlacedAt', 'createdAt', 'CreatedAt'])),
    stake: valueOf(root, ['stake', 'Stake', 'totalStake', 'TotalStake'], stake),
    minWin: valueOf(root, ['minWin', 'MinWin', 'minimumWin', 'MinimumWin'], null),
    maxWin: valueOf(root, ['maxWin', 'MaxWin', 'maximumWin', 'MaximumWin', 'possibleWin', 'PossibleWin'], possibleWin),
    currency,
    selections: receiptSelections.map((selection) => ({
      eventId: valueOf(selection, ['eventNumber', 'EventNumber', 'providerMatchId', 'ProviderMatchId', 'matchId', 'MatchId', 'shortCode', 'ShortCode'], '-'),
      home: valueOf(selection, ['homeTeam', 'HomeTeam', 'home', 'Home'], '-'),
      away: valueOf(selection, ['awayTeam', 'AwayTeam', 'away', 'Away'], '-'),
      time: valueOf(selection, ['eventTime', 'EventTime', 'startTime', 'StartTime', 'minute', 'Minute']),
      market: valueOf(selection, ['market', 'Market', 'marketName', 'MarketName'], '-'),
      option: valueOf(selection, ['option', 'Option', 'selection', 'Selection', 'selectionName', 'SelectionName'], '-'),
      odd: valueOf(selection, ['betOdd', 'BetOdd', 'odd', 'Odd'], '-'),
    })),
  };
};

export const printVirtualReceipt = (input) => {
  const receipt = input?.ticketNumber ? input : normalizeVirtualReceipt(input || {});
  if (!receipt.barcodeValue) return false;
  const rows = receipt.selections.map((selection) => `
    <section class="selection">
      <div class="event-line"><span>${escapeHtml(selection.eventId)} - ${escapeHtml(selection.home)} - ${escapeHtml(selection.away)}</span></div>
      <div class="pick-line"><span>${escapeHtml(formatEventTime(selection.time))}</span><span>${escapeHtml(selection.market)}: ${escapeHtml(selection.option)}</span><strong>${escapeHtml(selection.odd)}</strong></div>
    </section>`).join('');
  const frame = document.createElement('iframe');
  frame.setAttribute('title', 'Virtual ticket receipt');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0';
  document.body.appendChild(frame);
  const printWindow = frame.contentWindow;
  if (!printWindow) { frame.remove(); return false; }
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><title>Ticket ${escapeHtml(receipt.ticketNumber)}</title><style>
    @page{size:80mm auto;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;width:80mm;background:#fff;color:#000}
    body{font:12px/1.18 "Courier New",monospace}.receipt{width:72mm;margin:0;padding:2mm 1.5mm}.rule{border-top:.25mm solid #000;margin:1.5mm 0}
    .row,.event-line,.pick-line{display:flex;justify-content:space-between;gap:2mm}.row span:first-child{white-space:nowrap}.row strong{text-align:right;overflow-wrap:anywhere}
    .selection{padding:1.2mm 0;break-inside:avoid;page-break-inside:avoid}.event-line span{min-width:0;overflow-wrap:anywhere}.pick-line{padding-left:5mm;margin-top:.7mm;align-items:flex-start}
    .pick-line span:nth-child(2){flex:1;min-width:0;overflow-wrap:anywhere}.pick-line strong{white-space:nowrap;text-align:right}.barcode{display:block;width:100%;height:20mm;margin:2mm auto 0;shape-rendering:crispEdges}
    .barcode-text{text-align:center;font-size:10px;overflow-wrap:anywhere;margin-top:.5mm}@media print{html,body{width:80mm}.receipt{width:72mm}}
  </style></head><body><main class="receipt">
    <div class="row"><span>Shop</span><strong>${escapeHtml(receipt.shop)}</strong></div>
    <div class="row"><span>Ticket</span><strong>${escapeHtml(receipt.ticketNumber)}</strong></div>
    <div class="row"><span>Book time</span><strong>${escapeHtml(formatDate(receipt.bookedAt))}</strong></div>
    <div class="rule"></div>${rows}<div class="rule"></div>
    <div class="row"><span>Total stake</span><strong>${escapeHtml(formatMoney(receipt.stake, receipt.currency))}</strong></div>
    <div class="row"><span>Min/Max win</span><strong>${escapeHtml(formatMoney(receipt.minWin, receipt.currency))} / ${escapeHtml(formatMoney(receipt.maxWin, receipt.currency))}</strong></div>
    <div class="rule"></div>${createCode128Svg(receipt.barcodeValue)}<div class="barcode-text">${escapeHtml(receipt.barcodeValue)}</div>
  </main></body></html>`);
  printWindow.document.close();
  const cleanup = () => window.setTimeout(() => frame.remove(), 500);
  printWindow.addEventListener('afterprint', cleanup, {once: true});
  window.setTimeout(() => { printWindow.focus(); printWindow.print(); window.setTimeout(cleanup, 30000); }, 0);
  return true;
};
