const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatNumber = (value, options = {}) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString(undefined, options) : '0';
};

const formatReceiptDateTime = (date = new Date()) => {
  const datePart = date.toLocaleDateString('en-GB');
  const timePart = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return `${datePart}, ${timePart}`;
};

export const printVirtualReceipt = ({
  placed,
  selections,
  stake,
  totalOdds,
  possibleWin,
  shopCode,
}) => {
  const printWindow = window.open('', 'virtual-ticket-receipt', 'width=360,height=640');

  if (!printWindow) return false;

  const placedBets = Array.isArray(placed.bets) ? placed.bets : [];
  const selectionRows = selections.map((selection, index) => {
    const placedBet = placedBets[index] ?? {};
    const betRef = placedBet.id ?? placedBet.betId ?? placedBet.ticketBetId ?? placedBet.selectionId;

    return `
      <div class="selection">
        <div class="selection-number">${index + 1}</div>
        <div class="selection-main">
          <div class="match">${escapeHtml(selection.homeTeam)} vs ${escapeHtml(selection.awayTeam)}</div>
          <div class="pick">${escapeHtml(selection.market)} - ${escapeHtml(selection.option)}</div>
        </div>
        <div class="selection-meta">
          <div><span>ODD</span> <strong>${escapeHtml(Number(selection.odd).toFixed(2))}</strong></div>
          ${betRef ? `<div>BetRef: ${escapeHtml(betRef)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Virtual Ticket ${escapeHtml(placed.receiptId)}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          html,
          body {
            margin: 0;
            padding: 0;
            width: 80mm;
            height: auto;
          }
          body {
            color: #111;
            font-family: monospace;
            font-size: 14px;
            font-weight: 700;
            line-height: 1.25;
          }
          .receipt {
            width: 72mm;
            padding: 3mm;
            display: block;
          }
          h1 {
            margin: 0 0 7mm;
            text-align: center;
            font-size: 29px;
            line-height: 1;
            letter-spacing: 0;
          }
          .separator {
            border-top: 1px dashed #111;
            height: 0;
            margin: 3mm 0;
          }
          .line {
            display: flex;
            justify-content: space-between;
            gap: 4mm;
            padding: 1.5mm 0;
          }
          .line span {
            white-space: nowrap;
          }
          .line strong {
            text-align: right;
          }
          .line .long-value {
            font-size: 10px;
            overflow-wrap: anywhere;
          }
          .section-title {
            margin: 0 0 3mm;
            padding-bottom: 2mm;
            border-bottom: 1px solid #111;
            text-align: center;
            font-size: 20px;
            font-weight: 700;
          }
          .selection {
            display: grid;
            grid-template-columns: 9mm 1fr auto;
            column-gap: 3mm;
            align-items: start;
            padding: 3mm 0;
            border-bottom: 1px dashed #111;
          }
          .selections {
            border-bottom: 1px solid #111;
          }
          .selections .selection:last-child {
            border-bottom: 0;
          }
          .selection-number {
            width: 8mm;
            height: 8mm;
            border-radius: 1mm;
            background: #000;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
          }
          .match {
            font-size: 18px;
            line-height: 1.1;
          }
          .pick {
            margin-top: 3mm;
            font-size: 14px;
          }
          .selection-meta {
            text-align: right;
            font-size: 14px;
            line-height: 1.8;
            white-space: nowrap;
          }
          .selection-meta span {
            margin-right: 2mm;
          }
          .totals {
            margin-top: 0;
            font-size: 18px;
            font-weight: 700;
          }
          .totals .line {
            border-bottom: 1px dashed #111;
            padding: 3mm 0;
          }
          .footer {
            margin-top: 4mm;
            margin-bottom: 8mm;
            text-align: center;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.45;
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <h1>VIRTUAL TICKET</h1>
          <div class="separator"></div>
          <div class="line"><span>Receipt ID</span><strong>${escapeHtml(placed.receiptId)}</strong></div>
          <div class="line"><span>Serial</span><strong class="long-value">${escapeHtml(placed.serial)}</strong></div>
          <div class="line"><span>Date / Time</span><strong>${escapeHtml(formatReceiptDateTime())}</strong></div>
          <div class="line"><span>Shop Code</span><strong>${escapeHtml(shopCode)}</strong></div>
          <div class="line"><span>Set No</span><strong>${escapeHtml(placed.activeSetNo)}</strong></div>
          <div class="separator"></div>
          <div class="section-title">SELECTIONS</div>
          <div class="selections">
            ${selectionRows}
          </div>
          <div class="totals">
            <div class="line"><span>Stake</span><strong>${formatNumber(stake)}</strong></div>
            <div class="line"><span>Total Odds</span><strong>${Number(totalOdds).toFixed(2)}</strong></div>
            <div class="line"><span>Possible Win</span><strong>${formatNumber(possibleWin, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}</strong></div>
          </div>
          <div class="footer">
            <div>Keep this ticket for payout.</div>
            <div>All bets are subject to our terms and conditions.</div>
          </div>
        </div>
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  printWindow.onafterprint = () => printWindow.close();
  printWindow.print();

  return true;
};
