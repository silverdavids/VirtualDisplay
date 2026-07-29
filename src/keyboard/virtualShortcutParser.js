const LINE_PATTERN = '(\\d+(?:\\.\\d+)?)';

const validMatchIndex = (value) => {
  if (!/^[0-9]$/.test(value)) return null;
  return value === '0' ? 9 : Number(value) - 1;
};

const resultCode = (value) => ({'0': 'X', '1': '1', '2': '2'}[value] ?? null);

export const parseVirtualShortcut = (shortcut) => {
  const input = String(shortcut ?? '').trim().toUpperCase();
  const separator = input.indexOf('/');
  if (separator !== 1) return null;

  const matchIndex = validMatchIndex(input[0]);
  const selection = input.slice(separator + 1);
  if (matchIndex === null || !selection) return null;

  const fixedSelections = {
    '1': {marketType: '1X2', selectionCode: '1'},
    '0': {marketType: '1X2', selectionCode: 'X'},
    '2': {marketType: '1X2', selectionCode: '2'},
    '10': {marketType: 'DC', selectionCode: '1X'},
    '12': {marketType: 'DC', selectionCode: '12'},
    '02': {marketType: 'DC', selectionCode: 'X2'},
    '++': {marketType: 'BTS', selectionCode: 'GG'},
    '+-': {marketType: 'BTS', selectionCode: 'NG'},
  };
  if (fixedSelections[selection]) {
    return {matchIndex, ...fixedSelections[selection], line: null, teamSide: null};
  }

  let match = selection.match(new RegExp(`^${LINE_PATTERN}([+-])$`));
  if (match) {
    const line = Number(match[1]);
    return {
      matchIndex,
      marketType: 'OU',
      selectionCode: `${match[2] === '+' ? 'OV' : 'UN'}${line}`,
      line,
      teamSide: null,
    };
  }

  match = selection.match(new RegExp(`^([HA])${LINE_PATTERN}([+-])$`));
  if (match) {
    const line = Number(match[2]);
    const teamSide = match[1] === 'H' ? 'home' : 'away';
    return {
      matchIndex,
      marketType: teamSide === 'home' ? 'HOME_OU' : 'AWAY_OU',
      selectionCode: `${match[3] === '+' ? 'OV' : 'UN'}${line}`,
      line,
      teamSide,
    };
  }

  match = selection.match(new RegExp(`^([012])/${LINE_PATTERN}([+-])$`));
  if (match) {
    const result = resultCode(match[1]);
    const line = Number(match[2]);
    const total = match[3] === '+' ? 'OV' : 'UN';
    return {
      matchIndex,
      marketType: `1X2_OU_${line}`,
      selectionCode: `${result}+${total}${line}`,
      line,
      teamSide: null,
    };
  }

  return null;
};

export const resolveVirtualShortcut = (parsed, events, {bettingClosed = false} = {}) => {
  if (!parsed) return {ok: false, reason: 'Invalid shortcut format'};

  const event = events?.[parsed.matchIndex];
  if (!event) return {ok: false, reason: `Match ${parsed.matchIndex === 9 ? 10 : parsed.matchIndex + 1} is unavailable`};
  if (bettingClosed || event.blocked !== 0) {
    return {ok: false, reason: 'This match is suspended'};
  }

  const market = event.marketPages?.find(({code}) => code === parsed.marketType);
  if (!market) return {ok: false, reason: 'Requested market is unavailable'};

  const selection = market.selections?.find(({label}) => label === parsed.selectionCode);
  if (!selection) return {ok: false, reason: 'Requested selection is unavailable'};

  const odd = Number(selection.odd);
  if (selection.odd === '-' || selection.odd === '' || selection.odd == null || !Number.isFinite(odd) || odd <= 0) {
    return {ok: false, reason: 'Requested selection is suspended'};
  }

  return {ok: true, event, selection: {...selection, odd: odd.toFixed(2)}};
};
