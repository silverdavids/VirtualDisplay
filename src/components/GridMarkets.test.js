import {buildMarketTabs, getCanonicalMarketCode, normalizeBlocked, normalizeEventMarkets} from './Grid';

const eventWith = (markets) => ({marketPages: normalizeEventMarkets({markets})});

test('normalizes blocked flags consistently across REST and socket types', () => {
  expect([0, '0', false, 'false', 'no', null, undefined].map(normalizeBlocked)).toEqual([
    0, 0, 0, 0, 0, 0, 0,
  ]);
  expect([1, '1', true, 'true', 'yes'].map(normalizeBlocked)).toEqual([1, 1, 1, 1, 1]);
});

test('maps provider market codes to canonical market pages', () => {
  expect(getCanonicalMarketCode({code: '1x2'})).toBe('1X2');
  expect(getCanonicalMarketCode({code: 'double_chance'})).toBe('DC');
  expect(getCanonicalMarketCode({code: 'home_over_under'})).toBe('HOME_OU');
  expect(getCanonicalMarketCode({code: 'away_ou'})).toBe('AWAY_OU');
  expect(getCanonicalMarketCode({code: '1x2_ou', line: 1.5})).toBe('1X2_OU_1.5');
  expect(getCanonicalMarketCode({code: 'BTTS'})).toBe('BTS');
});

test('builds the MAIN tab from 1X2, double chance, BTS, and over/under', () => {
  const event = eventWith([
    {code: '1X2', selections: [{name: '1', odd: 2}, {name: 'X', odd: 3}, {name: '2', odd: 4}]},
    {code: 'DC', selections: [{name: '1X', odd: 1.2}, {name: '12', odd: 1.3}, {name: 'X2', odd: 1.4}]},
    {code: 'OU', line: 1.5, selections: [{name: 'Over', odd: 1.5}, {name: 'Under', odd: 2.5}]},
    {code: 'BTS', selections: [{name: 'Yes', odd: 1.7}, {name: 'No', odd: 2.1}]},
  ]);

  const tabs = buildMarketTabs([event]);

  expect(tabs.map(({code}) => code)).toEqual([
    'MAIN', 'OU', 'HOME_OU', 'AWAY_OU', '1X2_OU_1.5', '1X2_OU_2.5',
  ]);
  expect(tabs[0].selections.map(({label}) => label)).toEqual([
    '1', 'X', '2', '1X', '12', 'X2', 'GG', 'NG', 'OV2.5', 'UN2.5',
  ]);
  expect(tabs[1].selections.map(({label}) => label)).toEqual(['OV1.5', 'UN1.5']);
});

test('uses only the 2.5 over/under line in MAIN', () => {
  const event = eventWith([
    {
      code: '1X2',
      selections: [
        {name: '1', odd: 2},
        {name: 'X', odd: 3},
        {name: '2', odd: 4},
      ],
    },
    {
      code: 'DC',
      selections: [
        {name: '1X', odd: 1.2},
        {name: '12', odd: 1.3},
        {name: 'X2', odd: 1.4},
      ],
    },
    {code: 'OU', line: 2.5, selections: [{name: 'Over', odd: 1.8}, {name: 'Under', odd: 2}]},
    {code: 'OU', line: 1.5, selections: [{name: 'Over', odd: 1.2}, {name: 'Under', odd: 3.5}]},
  ]);

  const tabs = buildMarketTabs([event]);
  expect(tabs[0].selections.slice(-2).map(({label}) => label)).toEqual(['OV2.5', 'UN2.5']);
  expect(tabs[1].selections.map(({label}) => label)).toEqual(['OV1.5', 'UN1.5']);
});

test('can build MAIN from BTS when it is the only available MAIN market', () => {
  const tabs = buildMarketTabs([
    eventWith([{code: 'BTS', selections: [{name: 'Yes', odd: 2}, {name: 'No', odd: 3}]}]),
  ]);

  expect(tabs[0].selections.map(({label}) => label)).toEqual([
    '1', 'X', '2', '1X', '12', 'X2', 'GG', 'NG', 'OV2.5', 'UN2.5',
  ]);
  expect(tabs[0].disabled).toBe(false);
  expect(tabs.slice(1).every(({disabled}) => disabled)).toBe(true);
});

test('does not render object-market metadata as selection columns', () => {
  const event = eventWith({
    main: {'1': 2.1, X: 3.2, '2': 4.3},
    doubleChance: {'1X': 1.2, '12': 1.3, X2: 1.4},
    bts: {GG: 1.7, NG: 2.2},
    overUnder: {line: 2.5, 'OV 2.5': 1.8, 'UN 2.5': 2.1},
  });

  const tabs = buildMarketTabs([event]);

  expect(tabs[0].selections.map(({label}) => label)).toEqual([
    '1', 'X', '2', '1X', '12', 'X2', 'GG', 'NG', 'OV2.5', 'UN2.5',
  ]);
  expect(tabs[0].selections).not.toEqual(expect.arrayContaining([
    expect.objectContaining({label: 'CODE'}),
  ]));
});

test('maps expanded object markets to separate tabs with stable column counts', () => {
  const event = eventWith({
    main: {'1': 2, X: 3, '2': 4},
    doubleChance: {'1X': 1.2, '12': 1.3, X2: 1.4},
    bts: {GG: 1.8, NG: 2},
    overUnder: {'OV 1.5': 1.2, 'UN 1.5': 4, 'OV 2.5': 1.8, 'UN 2.5': 2.1},
    homeOverUnder: {'OV 0.5': 1.1, 'UN 0.5': 5, 'OV 1.5': 2, 'UN 1.5': 1.7},
    awayOverUnder: {'OV 0.5': 1.2, 'UN 0.5': 4, 'OV 1.5': 2.1, 'UN 1.5': 1.6},
    resultOverUnder15: {
      '1+OV1.5': 2, '1+UN1.5': 3, 'X+OV1.5': 4,
      'X+UN1.5': 5, '2+OV1.5': 6, '2+UN1.5': 7,
    },
    resultOverUnder25: {
      '1+OV2.5': 2, '1+UN2.5': 3, 'X+OV2.5': 4,
      'X+UN2.5': 5, '2+OV2.5': 6, '2+UN2.5': 7,
    },
  });

  const tabs = buildMarketTabs([event]);

  expect(tabs.map(({selections}) => selections.length)).toEqual([10, 2, 4, 4, 6, 6]);
  expect(tabs.every(({disabled}) => !disabled)).toBe(true);
  expect(tabs[4].selections.map(({label}) => label)).toEqual([
    '1+OV1.5', '1+UN1.5', 'X+OV1.5', 'X+UN1.5', '2+OV1.5', '2+UN1.5',
  ]);
});

test('excludes 2.5 and numerically orders all other OVER / UNDER lines', () => {
  const tabs = buildMarketTabs([
    eventWith({
      overUnder: {
        'UN 4.5': 5,
        'OV 2.5': 2,
        'OV 1.5': 1.4,
        'UN 1.5': 2.7,
        'UN 2.5': 1.5,
        'OV 4.5': 1.1,
        'UN 3.5': 3,
        'OV 3.5': 1.3,
      },
    }),
  ]);

  expect(tabs[0].selections.slice(-2).map(({label}) => label)).toEqual(['OV2.5', 'UN2.5']);
  expect(tabs[1].selections.map(({label}) => label)).toEqual([
    'OV1.5', 'UN1.5', 'OV3.5', 'UN3.5', 'OV4.5', 'UN4.5',
  ]);
});

test('disables OVER / UNDER when 2.5 is the only available line', () => {
  const tabs = buildMarketTabs([
    eventWith({overUnder: {'OV 2.5': 2, 'UN 2.5': 1.5}}),
  ]);

  expect(tabs[1]).toMatchObject({code: 'OU', disabled: true, selections: []});
});

test('rejects numeric outcome identifiers and invalid whole-number total lines', () => {
  const tabs = buildMarketTabs([
    eventWith({
      overUnder: {
        0: 8.5,
        1: 3.5,
        2: 2.8,
        3: 3.1,
        4: 4.2,
        'OV 1.5': 1.35,
        'UN 1.5': 3.07,
        'OV 3.5': 2.89,
        'UN 3.5': 3.09,
        'OV 4.5': 4.25,
        'UN 4.5': 1.1,
      },
    }),
  ]);

  expect(tabs[1].selections.map(({label}) => label)).toEqual([
    'OV1.5', 'UN1.5', 'OV3.5', 'UN3.5', 'OV4.5', 'UN4.5',
  ]);
});

test('converts unnamed legacy OU outcomes using the market goal line', () => {
  const tabs = buildMarketTabs([
    eventWith([
      {code: 'OU', line: 1.5, selections: [{name: '0', odd: 3.07}, {name: '1', odd: 1.35}]},
      {code: 'OU', line: 3.5, selections: [{name: '2', odd: 3.09}, {name: '3', odd: 2.89}]},
      {code: 'OU', line: 4.5, selections: [{name: '4', odd: 1.1}, {name: '5', odd: 4.25}]},
    ]),
  ]);

  expect(tabs[1].selections.map(({label, odd}) => [label, odd])).toEqual([
    ['OV1.5', 1.35], ['UN1.5', 3.07],
    ['OV3.5', 2.89], ['UN3.5', 3.09],
    ['OV4.5', 4.25], ['UN4.5', 1.1],
  ]);
});

test('deduplicates flat and line-based representations into one pair per goal line', () => {
  const flatEvent = eventWith({
    overUnder: {
      'OV 1.5': 1.37, 'UN 1.5': 2.94,
      'OV 3.5': 3.5, 'UN 3.5': 1.28,
      'OV 4.5': 5.62, 'UN 4.5': 1.12,
    },
  });
  const lineBasedEvent = eventWith([
    {code: 'OU', line: 1.5, selections: [{name: 'Under', odd: 3.1}, {name: 'Over', odd: 1.34}]},
    {code: 'OU', line: 3.5, selections: [{name: 'Under', odd: 1.37}, {name: 'Over', odd: 2.97}]},
    {code: 'OU', line: 4.5, selections: [{name: 'Under', odd: 1.16}, {name: 'Over', odd: 4.78}]},
  ]);

  const overUnderTab = buildMarketTabs([flatEvent, lineBasedEvent])[1];

  expect(overUnderTab.selections).toHaveLength(6);
  expect(overUnderTab.selections.map(({key, label}) => [key, label])).toEqual([
    ['OU:OV1.5', 'OV1.5'],
    ['OU:UN1.5', 'UN1.5'],
    ['OU:OV3.5', 'OV3.5'],
    ['OU:UN3.5', 'UN3.5'],
    ['OU:OV4.5', 'OV4.5'],
    ['OU:UN4.5', 'UN4.5'],
  ]);
});
