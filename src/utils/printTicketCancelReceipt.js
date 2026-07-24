const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export const printTicketCancelReceipt = ({
  cancellation,
  ticket,
  shop,
  terminal,
  reason = 'CustomerRequested',
}) => {
  const currency = cancellation.currency || ticket.currency || 'UGX';
  const stake = new Intl.NumberFormat('en-UG', {
    maximumFractionDigits: currency === 'UGX' ? 0 : 2,
  }).format(Number(cancellation.stake ?? ticket.stake ?? 0));
  const cancelledAt = cancellation.cancelledAt || cancellation.canceledAt;
  const reference = cancellation.cancelReference || cancellation.cancellationReference || cancellation.reference;
  const rows = [
    ['Shop', shop || '-'],
    ['Terminal', terminal || '-'],
    ['Ticket', cancellation.ticketNumber || ticket.ticketNumber],
    ['Stake', `${currency} ${stake}`],
    ['Cancelled At', new Date(cancelledAt).toLocaleString()],
    ['Cancel Reference', reference],
    ['Reason', cancellation.reason || reason],
  ];
  const receipt = document.createElement('section');
  receipt.className = 'payout-print-receipt';
  receipt.setAttribute('aria-hidden', 'true');
  receipt.innerHTML = `<h1>TICKET CANCELLATION</h1>
    ${rows.map(([label, value]) => `<div class="row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`).join('')}`;
  document.body.appendChild(receipt);
  const removeReceipt = () => receipt.remove();
  window.addEventListener('afterprint', removeReceipt, {once: true});
  window.print();
  window.setTimeout(removeReceipt, 1000);
  return true;
};
