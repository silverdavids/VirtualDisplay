import {parseVirtualShortcut, resolveVirtualShortcut} from './virtualShortcutParser';

const eventWith = (marketPages, blocked = 0) => ({marketPages, blocked});
const market = (code, label, odd = 2) => ({code, selections: [{key: `${code}:${label}`, label, odd}]});

describe('parseVirtualShortcut', () => {
  test.each([
    ['1/1', {matchIndex: 0, marketType: '1X2', selectionCode: '1', line: null, teamSide: null}],
    ['4/12', {matchIndex: 3, marketType: 'DC', selectionCode: '12', line: null, teamSide: null}],
    ['6/++', {matchIndex: 5, marketType: 'BTS', selectionCode: 'GG', line: null, teamSide: null}],
    ['8/2.5+', {matchIndex: 7, marketType: 'OU', selectionCode: 'OV2.5', line: 2.5, teamSide: null}],
    ['3/H1.5-', {matchIndex: 2, marketType: 'HOME_OU', selectionCode: 'UN1.5', line: 1.5, teamSide: 'home'}],
    ['3/A2.5+', {matchIndex: 2, marketType: 'AWAY_OU', selectionCode: 'OV2.5', line: 2.5, teamSide: 'away'}],
    ['5/1/2.5+', {matchIndex: 4, marketType: '1X2_OU_2.5', selectionCode: '1+OV2.5', line: 2.5, teamSide: null}],
    ['0/0', {matchIndex: 9, marketType: '1X2', selectionCode: 'X', line: null, teamSide: null}],
  ])('parses %s', (input, expected) => {
    expect(parseVirtualShortcut(input)).toEqual(expected);
  });

  test.each(['', '10/1', '1', '1/', '1/3', '1/01', '1/H+', '1/2.5', '1/1/2.5'])(
    'rejects malformed shortcut %s',
    input => expect(parseVirtualShortcut(input)).toBeNull()
  );

  it('does not confuse row numbers with multi-character selection codes', () => {
    expect(parseVirtualShortcut('1/10')).toMatchObject({matchIndex: 0, marketType: 'DC', selectionCode: '1X'});
    expect(parseVirtualShortcut('0/12')).toMatchObject({matchIndex: 9, marketType: 'DC', selectionCode: '12'});
  });
});

describe('resolveVirtualShortcut', () => {
  it('returns an actual enabled selection', () => {
    const parsed = parseVirtualShortcut('1/2.5+');
    const result = resolveVirtualShortcut(parsed, [eventWith([market('OU', 'OV2.5', 1.8)])]);
    expect(result).toMatchObject({ok: true, selection: {label: 'OV2.5', odd: '1.80'}});
  });

  it('rejects missing markets', () => {
    expect(resolveVirtualShortcut(parseVirtualShortcut('1/2.5+'), [eventWith([])]))
      .toEqual({ok: false, reason: 'Requested market is unavailable'});
  });

  it('rejects suspended events and odds', () => {
    expect(resolveVirtualShortcut(parseVirtualShortcut('1/1'), [eventWith([market('1X2', '1')], 1)]).reason)
      .toBe('This match is suspended');
    expect(resolveVirtualShortcut(parseVirtualShortcut('1/1'), [eventWith([market('1X2', '1', '-')])]).reason)
      .toBe('Requested selection is suspended');
  });
});
