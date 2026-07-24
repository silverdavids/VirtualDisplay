const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export const printPayoutReceipt = ({
  payout,
  confirmationReference,
  terminalCode,
  companyName = 'Virtual Display',
}) => {
  const amount = new Intl.NumberFormat('en-UG', {
    maximumFractionDigits: payout.currency === 'UGX' ? 0 : 2,
  }).format(Number(payout.paidAmount || 0));
  const rows = [
    ['Terminal', terminalCode],
    ['Ticket', payout.ticketNumber],
    ['Amount', `${payout.currency} ${amount}`],
    ['Payout reference', payout.payoutReference],
    ['Confirmation', confirmationReference],
    ['Paid at', new Date(payout.paidAt).toLocaleString()],
  ];
  const receipt = document.createElement('section');
  receipt.className = 'payout-print-receipt';
  receipt.setAttribute('aria-hidden', 'true');
  receipt.innerHTML = `<h1>${escapeHtml(companyName)}</h1><div class="paid">PAID</div>
    ${rows.map(([label, value]) => `<div class="row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`).join('')}`;
  document.body.appendChild(receipt);
  const removeReceipt = () => receipt.remove();
  window.addEventListener('afterprint', removeReceipt, {once: true});
  window.print();
  window.setTimeout(removeReceipt, 1000);
  return true;
};
