import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  FaChevronDown,
  FaClock,
  FaCoins,
  FaChevronRight,
  FaMoneyBillWave,
  FaMoon,
  FaPrint,
  FaReceipt,
  FaSearch,
  FaSignOutAlt,
  FaSun,
  FaTrash,
  FaTrophy,
} from 'react-icons/fa';
import {
  BETTING_CLOSED_MESSAGE,
  placeVirtualTicket,
  validateVirtualTicket,
} from '../services/ticketApi';
import {DEFAULT_LEAGUE_ID, DEFAULT_PROVIDER, getDisplay, getLeagues} from '../services/virtualApi';
import {getVirtualTicketDetails} from '../services/virtualTicketsApi';
import {BUILD_SHA, shortBuildSha} from '../config/buildInfo';
import {normalizeVirtualReceipt, printVirtualReceipt} from '../utils/printVirtualReceipt';
import {parseVirtualShortcut, resolveVirtualShortcut} from '../keyboard/virtualShortcutParser';
import {useVirtualKeyboardShortcuts} from '../keyboard/useVirtualKeyboardShortcuts';
import TicketCancelModal from './TicketCancelModal';
import TicketPayoutModal from './TicketPayoutModal';
import {reconcileCountdownDeadline} from './countdownDeadline';
import {buildVirtualTicketPayload} from '../tickets/buildVirtualTicketPayload';
import connectSocket, {
  VIRTUAL_DISPLAY_UPDATED_EVENT,
  VIRTUAL_EVENTS_QUEUE_UPDATED_EVENT,
} from '../socketio.service';

const PROVIDER = DEFAULT_PROVIDER;
const DEFAULT_STAKE = 1000;
const LIVE_AFTER_MS = 10000;
const STALE_AFTER_MS = 20000;
const STALE_CHECK_INTERVAL_MS = 1000;
const REST_FALLBACK_INTERVAL_MS = 4000;

const normalizeProviderToken = (provider) =>
  String(provider || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const MARKET_TITLES = {
  '1X2': 'MAIN',
  DC: 'DOUBLE CHANCE',
  OU: 'OVER / UNDER',
  HOME_OU: 'HOME OV/UN',
  AWAY_OU: 'AWAY OV/UN',
  '1X2_OU_1.5': '1X2 OV/UN 1.5',
  '1X2_OU_2.5': '1X2 OV/UN 2.5',
  BTS: 'GG / NG',
};
const DISPLAY_MARKETS = [
  {code: 'MAIN', title: 'MAIN'},
  {code: 'OU', title: 'OVER / UNDER'},
  {code: 'HOME_OU', title: 'HOME OV/UN'},
  {code: 'AWAY_OU', title: 'AWAY OV/UN'},
  {code: '1X2_OU_1.5', title: '1X2 OV/UN 1.5'},
  {code: '1X2_OU_2.5', title: '1X2 OV/UN 2.5'},
];
const MARKET_SELECTION_ORDER = {
  '1X2': ['1', 'X', '2'],
  DC: ['1X', '12', 'X2'],
  BTS: ['GG', 'NG'],
};

const getArrayFromPayload = (payload, keys) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  if (payload.data && payload.data !== payload) {
    return getArrayFromPayload(payload.data, keys);
  }

  return [];
};

const normalizeLeague = (league) => ({
  ...league,
  id: league.id ?? league.leagueId ?? league.leagueID ?? league.code,
  name: league.name ?? league.leagueName ?? league.title ?? league.shortName ?? `League ${league.id ?? ''}`,
});

export const normalizeToken = (value) =>
  String(value ?? '').toUpperCase().replace(/[^A-Z0-9.]/g, '');

const getSelectionName = (selection) =>
  selection?.name ?? selection?.selectionName ?? selection?.label ?? selection?.selectionCode ??
  selection?.code ?? selection?.n ?? selection?.key ?? selection?.outcome ?? selection?.s ?? '';

const getSelectionOdd = (selection) =>
  selection?.odd ?? selection?.odds ?? selection?.price ?? selection?.value ?? selection?.v ??
  selection?.Odd ?? selection?.Value;

const getRawMarketCode = (market) =>
  market?.code ?? market?.marketCode ?? market?.market_code ?? market?.n ?? market?.name ?? market?.key ?? '';

const getMarketLine = (market, code = '') => {
  const directLine = market?.line ?? market?.Line ?? market?.goalLine ?? market?.GoalLine ??
    market?.handicap ?? market?.Handicap ?? market?.h;
  if (directLine !== undefined && directLine !== null && directLine !== '') return Number(directLine);
  const encodedLine = String(code).match(/(?:OU|OVER.?UNDER)[_\s-]?(\d+(?:\.\d+)?)$/i)?.[1];
  return encodedLine === undefined ? null : Number(encodedLine);
};

const getSelectionLine = (selection, marketCode, marketLine) => {
  const directLine = selection?.line ?? selection?.Line ?? selection?.goalLine ??
    selection?.GoalLine ?? selection?.handicap ?? selection?.Handicap;
  if (directLine !== undefined && directLine !== null && directLine !== '') return Number(directLine);
  if (marketLine !== null) return marketLine;
  if (!['OU', 'HOME_OU', 'AWAY_OU'].includes(marketCode) && !marketCode.startsWith('1X2_OU_')) {
    return null;
  }

  const encodedLine = String(getSelectionName(selection)).match(/\d+(?:\.\d+)?/)?.[0];
  return encodedLine === undefined ? null : Number(encodedLine);
};

export const getCanonicalMarketCode = (market) => {
  const rawCode = getRawMarketCode(market);
  const token = normalizeToken(rawCode);
  const line = getMarketLine(market, rawCode);

  if (['1X2', 'MATCHRESULT', 'MAIN', 'FULLTIMERESULT'].includes(token)) return '1X2';
  if (['DC', 'DOUBLECHANCE'].includes(token)) return 'DC';
  if (['BTS', 'BTTS', 'GGNG', 'GOALGOAL', 'BOTHTEAMSTOSCORE'].includes(token)) return 'BTS';
  if (['OU', 'OVERUNDER', 'TOTALGOALS'].includes(token)) return 'OU';
  if (['HOMEOU', 'HOMEOVERUNDER', 'HOMETOTAL', 'TEAM1OU', '1OU'].includes(token)) return 'HOME_OU';
  if (['AWAYOU', 'AWAYOVERUNDER', 'AWAYTOTAL', 'TEAM2OU', '2OU'].includes(token)) return 'AWAY_OU';
  if (['RESULTOVERUNDER15', 'RESULTOU15', '1X2OU15'].includes(token)) return '1X2_OU_1.5';
  if (['RESULTOVERUNDER25', 'RESULTOU25', '1X2OU25'].includes(token)) return '1X2_OU_2.5';
  if (token.includes('1X2') && (token.includes('OU') || token.includes('OVERUNDER'))) {
    return line === 1.5 ? '1X2_OU_1.5' : line === 2.5 ? '1X2_OU_2.5' : `1X2_OU_${line ?? token}`;
  }

  return token || 'UNKNOWN';
};

const getMarketSelections = (market) => {
  if (Array.isArray(market?.selections)) return market.selections;
  if (Array.isArray(market?.selection)) return market.selection;
  if (Array.isArray(market?.outcomes)) return market.outcomes;
  if (Array.isArray(market?.options)) return market.options;
  if (Array.isArray(market?.o)) return market.o;
  return [];
};

const selectionAliases = {
  HOME: '1', DRAW: 'X', AWAY: '2',
  HOMEDRAW: '1X', HOMEAWAY: '12', DRAWAWAY: 'X2',
  YES: 'GG', NO: 'NG', O: 'OV', U: 'UN', OVER: 'OV', UNDER: 'UN',
};

const getCanonicalSelectionLabel = (selection, marketCode, line, index) => {
  const rawName = getSelectionName(selection);
  let token = normalizeToken(rawName);
  token = selectionAliases[token] ?? token;
  token = token.replace(/^OVER/, 'OV').replace(/^UNDER/, 'UN');

  const fixedOrder = MARKET_SELECTION_ORDER[marketCode];
  if (!token && fixedOrder) token = fixedOrder[index] ?? '';
  if (
    ['OU', 'HOME_OU', 'AWAY_OU'].includes(marketCode) &&
    Number.isFinite(line) &&
    (!token || /^\d+$/.test(token))
  ) {
    token = index === 0 ? 'UN' : 'OV';
  }
  if ((token === 'OV' || token === 'UN') && Number.isFinite(line)) token = `${token}${line}`;
  if (marketCode.startsWith('1X2_OU_') && token && !token.includes('+')) {
    const result = token.match(/^(1|X|2)/)?.[1];
    const total = token.match(/(OV|UN)/)?.[1];
    if (result && total) token = `${result}+${total}${line ?? ''}`;
  }

  return token || String(rawName || index + 1).toUpperCase();
};

const MARKET_METADATA_KEYS = new Set([
  'CODE', 'MARKETCODE', 'MARKET_CODE', 'NAME', 'MARKETNAME', 'KEY',
  'LINE', 'GOALLINE', 'HANDICAP', 'H', 'TITLE',
]);

const objectSelections = (market) => Object.entries(market ?? {})
  .filter(([key, odd]) => (
    !MARKET_METADATA_KEYS.has(String(key).toUpperCase()) &&
    odd !== undefined &&
    odd !== null &&
    odd !== '' &&
    typeof odd !== 'object'
  ))
  .map(([name, odd]) => ({name, odd}));

const normalizeMarket = (market) => {
  const code = getCanonicalMarketCode(market);
  const line = getMarketLine(market, getRawMarketCode(market));
  const rawSelections = getMarketSelections(market);
  const selections = (rawSelections.length > 0 ? rawSelections : objectSelections(market))
    .map((selection, index) => {
      return {
        key: `${code}:${getCanonicalSelectionLabel(selection, code, line, index)}`,
        label: getCanonicalSelectionLabel(selection, code, line, index),
        odd: getSelectionOdd(selection),
        marketCode: code,
        marketName: getRawMarketCode(market) || MARKET_TITLES[code] || code,
        line: getSelectionLine(selection, code, line),
        matchOddId: selection?.matchOddId ?? selection?.MatchOddId ?? selection?.oddId ??
          selection?.OddId ?? selection?.id ?? selection?.Id ?? null,
      };
    })
    .filter(({odd}) => odd !== undefined && odd !== null && odd !== '');

  return {code, line, name: getRawMarketCode(market) || MARKET_TITLES[code] || code, selections};
};

const objectMarketEntries = (markets) => {
  const aliases = {
    main: '1X2', matchResult: '1X2', result: '1X2', doubleChance: 'DC',
    dc: 'DC', bts: 'BTS', goalGoal: 'BTS', overUnder: 'OU', ou: 'OU',
    homeOverUnder: 'HOME_OU', homeOu: 'HOME_OU', awayOverUnder: 'AWAY_OU', awayOu: 'AWAY_OU',
    resultOverUnder15: '1X2_OU_1.5', resultOverUnder25: '1X2_OU_2.5',
  };
  return Object.entries(markets ?? {}).map(([key, value]) => (
    Array.isArray(value)
      ? {code: aliases[key] ?? key, selections: value}
      : {...(value && typeof value === 'object' ? value : {}), code: aliases[key] ?? key}
  ));
};

const getFlattenedMarketEntries = (event) => [
  {code: '1X2', selections: [
    {name: '1', odd: event['1'] ?? event.homeOdd},
    {name: 'X', odd: event.X ?? event.x ?? event.drawOdd},
    {name: '2', odd: event['2'] ?? event.awayOdd},
  ]},
  {code: 'DC', selections: [
    {name: '1X', odd: event['1X'] ?? event.homeDraw},
    {name: '12', odd: event['12'] ?? event.homeAway},
    {name: 'X2', odd: event.X2 ?? event.x2 ?? event.drawAway},
  ]},
  {code: 'BTS', selections: [
    {name: 'GG', odd: event.GG ?? event.gg},
    {name: 'NG', odd: event.NG ?? event.ng},
  ]},
  {code: 'OU', line: 2.5, selections: [
    {name: 'OV', odd: event['OV 2.5'] ?? event.OV25 ?? event.over25 ?? event.over},
    {name: 'UN', odd: event['UN 2.5'] ?? event.UN25 ?? event.under25 ?? event.under},
  ]},
];

export const normalizeBlocked = (value) =>
  ['0', 'FALSE', 'NO', ''].includes(String(value ?? 0).trim().toUpperCase()) ? 0 : 1;

export const normalizeEventMarkets = (event) => {
  const source = event.markets
    ? (Array.isArray(event.markets) ? event.markets : objectMarketEntries(event.markets))
    : Array.isArray(event.odds) && event.odds.length > 0
      ? event.odds.map((market) => ({...market, selections: market.selections ?? market.o}))
      : getFlattenedMarketEntries(event);

  return source.map(normalizeMarket).filter(({selections}) => selections.length > 0);
};

const normalizeEvent = (event) => ({
  ...event,
  id: event.id ?? event.eventId ?? event.betServiceMatchNo ?? `${event.homeTeam}-${event.awayTeam}`,
  home: event.home ?? event.homeTeam ?? event.homeName ?? event.homeTeamName ?? '',
  away: event.away ?? event.awayTeam ?? event.awayName ?? event.awayTeamName ?? '',
  marketPages: normalizeEventMarkets(event),
  odds: Array.isArray(event.odds) ? event.odds : [],
  blocked: normalizeBlocked(event.blocked),
});

const getEventIdentity = (event, index) => {
  const home = normalizeToken(event.home);
  const away = normalizeToken(event.away);
  if (home && away) return `teams:${home}:${away}`;

  const matchId =
    event.matchId ??
    event.MatchId ??
    event.betServiceMatchNo ??
    event.BetServiceMatchNo ??
    event.id ??
    event.eventId;

  return matchId !== undefined && matchId !== null && matchId !== ''
    ? `id:${String(matchId)}`
    : `index:${index}`;
};

export const getUniqueDisplayEvents = (sourceEvents, limit = 10) => {
  const seen = new Set();
  const uniqueEvents = [];

  (Array.isArray(sourceEvents) ? sourceEvents : []).forEach((event, index) => {
    const normalizedEvent = normalizeEvent(event);
    const identity = getEventIdentity(normalizedEvent, index);
    if (seen.has(identity) || uniqueEvents.length >= limit) return;

    seen.add(identity);
    uniqueEvents.push({...normalizedEvent, displayKey: identity});
  });

  return uniqueEvents;
};

const formatOdd = (odd) => {
  if (odd === undefined || odd === null || odd === '') return '-';
  const value = Number(odd);
  return Number.isFinite(value) ? value.toFixed(2) : odd;
};

const selectionSortValue = (code, label) => {
  const fixedIndex = MARKET_SELECTION_ORDER[code]?.indexOf(label);
  if (fixedIndex !== undefined && fixedIndex >= 0) return fixedIndex;
  const numericParts = [...label.matchAll(/\d+(?:\.\d+)?/g)];
  const line = Number(numericParts.at(-1)?.[0] ?? 0);
  const totalType = label.includes('UN') ? 1 : 0;
  const result = label.match(/^(1|X|2)/)?.[1];
  const resultIndex = ['1', 'X', '2'].indexOf(result);
  if (code.startsWith('1X2_OU_')) return Math.max(0, resultIndex) * 10 + totalType;
  if (['OU', 'HOME_OU', 'AWAY_OU'].includes(code)) return line * 10 + totalType;
  return 1000;
};

const isAdditionalOverUnderSelection = ({label, line}) => {
  const goalLine = line ?? getLineFromOption(label);
  return /^(OV|UN)\d+(?:\.\d+)?$/.test(label) &&
    Number.isFinite(goalLine) &&
    goalLine >= 1.5 &&
    goalLine !== 2.5 &&
    Math.abs(goalLine % 1) === 0.5;
};

export const buildMarketTabs = (events) => {
  const markets = events.flatMap(({marketPages = []}) => marketPages);
  const getSelections = (codes, predicate = () => true) => {
    const selections = new Map();
    codes.forEach((code) => {
      markets
        .filter((market) => market.code === code)
        .flatMap(({selections: marketSelections}) => marketSelections)
        .filter(predicate)
        .sort((a, b) => selectionSortValue(code, a.label) - selectionSortValue(code, b.label))
        .forEach((selection) => {
          if (!selections.has(selection.key)) selections.set(selection.key, selection);
        });
    });
    return [...selections.values()];
  };
  const fixedSelections = (code, labels) => {
    const available = new Map(getSelections([code]).map((selection) => [selection.label, selection]));
    const line = code.startsWith('1X2_OU_') ? Number(code.split('_').at(-1)) : NaN;
    return labels.map((label) => available.get(label) ?? {
      key: `${code}:${label}`,
      label,
      marketCode: code,
      marketName: MARKET_TITLES[code] || code,
      line: Number.isFinite(line) ? line : getLineFromOption(label),
    });
  };

  return DISPLAY_MARKETS.map((tab) => {
    let selections;
    let availableCount;
    if (tab.code === 'MAIN') {
      const mainAvailable = [
        ...getSelections(['1X2']),
        ...getSelections(['DC']),
        ...getSelections(['BTS']),
        ...getSelections(['OU'], ({label, line}) => (line ?? getLineFromOption(label)) === 2.5),
      ];
      selections = [
        ...fixedSelections('1X2', ['1', 'X', '2']),
        ...fixedSelections('DC', ['1X', '12', 'X2']),
        ...fixedSelections('BTS', ['GG', 'NG']),
        ...fixedSelections('OU', ['OV2.5', 'UN2.5']),
      ];
      availableCount = mainAvailable.length;
    } else if (tab.code === '1X2_OU_1.5' || tab.code === '1X2_OU_2.5') {
      const line = tab.code.endsWith('1.5') ? '1.5' : '2.5';
      const labels = ['1', 'X', '2'].flatMap((result) => [`${result}+OV${line}`, `${result}+UN${line}`]);
      const available = getSelections([tab.code]);
      selections = fixedSelections(tab.code, labels);
      availableCount = available.length;
    } else if (tab.code === 'OU') {
      selections = getSelections(['OU'], isAdditionalOverUnderSelection);
      availableCount = selections.length;
    } else {
      selections = getSelections([tab.code]);
      availableCount = selections.length;
    }
    return {...tab, disabled: availableCount === 0, selections};
  });
};

const getVisualMarketLabel = (tabCode, label) => {
  if (tabCode.startsWith('1X2_OU_')) return label.replace(/\d+(?:\.\d+)?$/, '').replace('+', ' ');
  return label.replace(/^(OV|UN)(\d)/, '$1 $2');
};

const getDisplaySelections = (match, tab) => {
  if (!tab) return [];
  const selections = match.marketPages.flatMap(({selections: marketSelections}) => marketSelections);
  const byKey = new Map(selections.map((selection) => [selection.key, selection]));

  return tab.selections.map((metadata) => {
    const selection = byKey.get(metadata.key);
    return {...metadata, ...selection, odd: match.blocked !== 0 ? '-' : formatOdd(selection?.odd)};
  });
};

const getLeagueName = (league) => league?.name ?? 'Virtual League';

const getLeagueCode = (league, meta) => {
  const leagueNumber = meta?.leagueNumber || meta?.leagueId || league?.leagueNumber || league?.id;
  return leagueNumber ? `LEAGUE ${leagueNumber}` : 'LEAGUE';
};

const getWeekCode = (meta) => `WEEK ${meta?.weekNumber || 1}`;

const getLeagueProvider = (league) => league?.provider ?? PROVIDER;

const isAllValue = (value) => String(value ?? '').toLowerCase() === 'all';

const getLeagueRequestId = (league) => {
  const leagueId = league?.leagueId ?? league?.id ?? league?.leagueNumber;
  return !leagueId || isAllValue(leagueId) ? DEFAULT_LEAGUE_ID : leagueId;
};

const getLeagueRequestProvider = (league) => {
  const provider = getLeagueProvider(league);
  return !provider || isAllValue(provider) ? PROVIDER : provider;
};

const getDefaultLeague = (leagues) => (
  leagues.find((league) => (
    normalizeProviderToken(getLeagueRequestProvider(league)) === normalizeProviderToken(PROVIDER) &&
    String(getLeagueRequestId(league)) === String(DEFAULT_LEAGUE_ID)
  )) ?? leagues.find((league) => !isAllValue(league.provider) && !isAllValue(league.id)) ?? leagues[0] ?? null
);

const formatClockTime = (date) =>
  date
    ? new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(date)
    : '--:--:--';

const formatCountdown = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getPayloadUpdatedAt = (payload) => {
  if (!payload || typeof payload !== 'object') return null;

  if (Array.isArray(payload)) {
    return payload.reduce((latest, item) => {
      const itemUpdatedAt = getPayloadUpdatedAt(item);
      const itemDate = toDate(itemUpdatedAt);
      const latestDate = toDate(latest);

      if (!itemDate) return latest;
      if (!latestDate || itemDate.getTime() > latestDate.getTime()) return itemUpdatedAt;
      return latest;
    }, null);
  }

  const updatedAt =
    payload.updatedAt ??
    payload.UpdatedAt ??
    payload.lastUpdatedAt ??
    payload.LastUpdatedAt ??
    payload.updated_at ??
    payload.last_updated_at;

  if (toDate(updatedAt)) return updatedAt;

  return (
    getPayloadUpdatedAt(payload.currentBoard) ??
    getPayloadUpdatedAt(payload.display) ??
    getPayloadUpdatedAt(payload.data) ??
    getPayloadUpdatedAt(payload.events)
  );
};

const getPayloadFirstEvent = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload)) return payload.find((item) => item && typeof item === 'object') ?? null;
  if (Array.isArray(payload.events)) return getPayloadFirstEvent(payload.events);

  return (
    getPayloadFirstEvent(payload.currentBoard) ??
    getPayloadFirstEvent(payload.display) ??
    getPayloadFirstEvent(payload.data)
  );
};

const getPayloadStartTime = (payload) => {
  if (!payload || typeof payload !== 'object') return null;

  const firstEvent = getPayloadFirstEvent(payload);
  const startTime =
    payload.startTime ??
    payload.StartTime ??
    payload.startAt ??
    payload.startsAt ??
    payload.start_at ??
    firstEvent?.startTime ??
    firstEvent?.StartTime ??
    firstEvent?.startAt ??
    firstEvent?.startsAt ??
    firstEvent?.start_at;

  if (toDate(startTime)) return startTime;

  return (
    getPayloadStartTime(payload.currentBoard) ??
    getPayloadStartTime(payload.display) ??
    getPayloadStartTime(payload.data)
  );
};

const getPayloadCountdownTarget = (payload) => {
  if (!payload || typeof payload !== 'object') return null;

  const target =
    payload.nextRefreshAt ??
    payload.nextAt ??
    payload.NextAt ??
    payload.nextStartAt ??
    payload.nextStartTime ??
    payload.endAt ??
    payload.endsAt ??
    payload.endTime;

  if (toDate(target)) return target;

  const remainingSeconds = Number(payload.remainingSeconds);
  if (Number.isFinite(remainingSeconds) && remainingSeconds >= 0) {
    return new Date(Date.now() + remainingSeconds * 1000).toISOString();
  }

  return (
    getPayloadCountdownTarget(payload.currentBoard) ??
    getPayloadCountdownTarget(payload.display) ??
    getPayloadCountdownTarget(payload.data)
  );
};

const getSecondsRemaining = (target) => {
  const targetDate = toDate(target);
  if (!targetDate) return null;
  return Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / 1000));
};

const getLineFromOption = (option) => {
  const match = String(option ?? '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

const splitLeagueTitle = (name) => {
  const words = String(name).trim().split(/\s+/);
  if (words.length < 2) return [name, ''];

  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')];
};

const getCrestColor = (text) => {
  const colors = ['#f2a51b', '#243e83', '#bb1725', '#7fd0f1', '#39a845', '#0c61ad', '#d22630', '#7fc8ee'];
  const total = String(text).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return colors[total % colors.length];
};

const styles = `
  .betting-board {
    --pre-odds-width: 448px;
    --odds-gap: 10px;
    --odds-cell: minmax(70px, 1fr);
    --receipt-panel-width: 320px;
    min-height: 100vh;
    max-width: 100%;
    box-sizing: border-box;
    background: #202020;
    color: #fff;
    font-family: "Arial Narrow", Impact, "Segoe UI Condensed", Arial, sans-serif;
    overflow: hidden;
    position: relative;
  }

  .socket-debug-badge {
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 50;
    min-width: 230px;
    padding: 8px 10px;
    background: rgba(0, 0, 0, 0.84);
    border: 1px solid #d80000;
    color: #fff;
    font-family: Consolas, "Courier New", monospace;
    font-size: 11px;
    line-height: 1.35;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
  }

  .socket-debug-badge strong {
    color: #f2d21b;
  }

  .terminal-topbar {
    height: 72px;
    display: flex;
    align-items: stretch;
    background: #232323;
    border-bottom: 2px solid #d80000;
  }

  .header-brand {
    flex: 0 0 112px;
    min-width: 0;
    min-height: 0;
    height: 100%;
    display: grid;
    place-items: center;
    padding: 3px 8px;
    box-sizing: border-box;
    border-right: 1px solid #292929;
    background: #050505;
    overflow: hidden;
  }

  .header-brand img {
    display: block;
    width: auto;
    max-width: 100%;
    height: auto;
    max-height: 52px;
    object-fit: contain;
  }

  .competition-tabs {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
  }

  .competition-tab {
    width: 76px;
    display: grid;
    place-items: center;
    gap: 2px;
    padding: 8px 6px;
    background: transparent;
    border: 0;
    border-right: 1px solid #111;
    border-left: 1px solid #333;
    color: #fff;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    line-height: 1;
  }

  .competition-tab.active {
    background: #d90000;
  }

  .competition-tab svg {
    font-size: 27px;
    filter: drop-shadow(2px 2px 0 #1f3f7b);
  }

  .topbar-chevron {
    align-self: center;
    margin-left: 14px;
    font-size: 22px;
  }

  .header-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding: 0 8px;
    border-left: 1px solid #333;
    color: #ddd;
    font-size: 14px;
    white-space: nowrap;
  }

  .header-metric {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
  }

  .header-metric svg {
    color: #e00000;
  }

  .header-action-button {
    min-width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 2px;
    box-sizing: border-box;
    padding: 3px 8px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: #fff;
    cursor: pointer;
    font: inherit;
  }

  .header-action-button:hover {
    border-color: #555;
    background: #292929;
  }

  .header-action-button:focus-visible {
    outline: 2px solid #f3b000;
    outline-offset: 1px;
  }

  .header-action-button svg {
    font-size: 20px;
  }

  .header-action-label {
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
    text-transform: uppercase;
  }

  .header-terminal-identity {
    min-width: 96px;
    max-width: 150px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 10px;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .header-terminal-identity strong {
    color: #fff;
    font-size: 14px;
  }

  .header-terminal-identity small {
    margin-top: 3px;
    color: #aaa;
    font-size: 10px;
  }

  .header-logout {
    border-left-color: #333;
    color: #ddd;
  }

  .terminal-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--receipt-panel-width);
    align-items: stretch;
    min-width: 0;
  }

  .odds-area {
    min-width: 0;
  }

  .jackpot-row {
    height: 102px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .week-ribbon {
    position: absolute;
    left: 0;
    top: 0;
    width: 72px;
    height: 46px;
    display: grid;
    place-items: center;
    background: #df0000;
    color: #fff;
    font-size: 19px;
    font-weight: 900;
  }

  .jackpot {
    display: flex;
    align-items: center;
    background: #f3a300;
    color: #fff;
    height: 59px;
    box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.18);
    text-shadow: 3px 3px 0 #555;
  }

  .jackpot.secondary {
    background: #c57900;
  }

  .jackpot-label {
    padding: 0 8px 0 14px;
    font-size: 20px;
    font-weight: 900;
    line-height: 0.92;
  }

  .jackpot-amount {
    padding-right: 10px;
    font-size: 40px;
    font-weight: 900;
    letter-spacing: 0;
  }

  .market-layout {
    display: grid;
    grid-template-columns: var(--pre-odds-width) minmax(0, 1fr);
    align-items: stretch;
  }

  .league-panel {
    height: 128px;
    display: grid;
    grid-template-columns: 244px 204px;
    background:
      linear-gradient(120deg, rgba(255,255,255,0.08), rgba(0,0,0,0.65)),
      repeating-linear-gradient(28deg, #2b2b2b 0 3px, #202020 3px 7px);
    overflow: hidden;
  }

  .league-brand {
    position: relative;
    display: grid;
    align-content: center;
    justify-items: center;
    padding: 10px 8px;
    text-align: center;
  }

  .league-brand:before {
    content: "";
    position: absolute;
    inset: 24px 18px auto;
    height: 70px;
    border: 2px solid rgba(255, 255, 255, 0.12);
    transform: skewY(-7deg);
  }

  .lion-mark {
    width: 58px;
    height: 58px;
    display: grid;
    place-items: center;
    margin-bottom: 5px;
    background: #fff;
    color: #1d3f92;
    clip-path: polygon(50% 0, 92% 16%, 98% 62%, 50% 100%, 2% 62%, 8% 16%);
    font-size: 36px;
    font-weight: 900;
  }

  .league-title {
    font-size: 22px;
    line-height: 0.86;
    font-weight: 900;
    text-shadow: 2px 2px 0 #777;
  }

  .league-code {
    margin-top: 8px;
    font-family: Arial, sans-serif;
    font-size: 10px;
    font-weight: 700;
  }

  .timer-dial {
    width: 100px;
    height: 100px;
    align-self: center;
    justify-self: start;
    display: grid;
    place-items: center;
    text-align: center;
    border: 5px solid #d70000;
    border-radius: 50%;
    background: #252525;
    box-shadow: inset 0 0 0 1px #fff, 0 0 0 1px #1b1b1b;
    color: #fff;
    overflow: hidden;
  }

  .timer-dial > div {
    width: 100%;
    min-width: 0;
    padding: 0 6px;
  }

  .timer-column {
    display: grid;
    align-content: center;
    justify-items: start;
    gap: 5px;
    padding: 0 16px 0 0;
  }

  .live-status {
    color: #fff;
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 9px;
    font-weight: 800;
    line-height: 1.2;
    text-align: center;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .live-status-dot {
    color: #d90000;
  }

  .timer-time {
    position: relative;
    margin: 10px 0;
    background: transparent;
    border: 0;
    color: #fff;
    font-family: gbdigits, monospace;
    font-size: 17px;
    font-variant-numeric: tabular-nums;
    font-weight: 400;
    letter-spacing: 1px;
    line-height: 1;
    max-width: 100%;
    overflow: hidden;
    text-align: center;
    white-space: nowrap;
  }

  .timer-sub {
    margin-top: 5px;
    color: #f00000;
    font-family: gbdigits, monospace;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    font-weight: 400;
    letter-spacing: 1px;
    line-height: 1;
    max-width: 100%;
    overflow: hidden;
    text-align: center;
    white-space: nowrap;
  }

  .markets {
    min-width: 0;
    align-self: end;
    display: grid;
    align-content: end;
  }

  .market-tabs {
    display: grid;
    grid-template-columns: repeat(var(--market-tab-count, 1), minmax(0, 1fr));
    gap: var(--odds-gap);
    width: 100%;
    margin-top: 0;
    border-top: 1px solid #000;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
  }

  .market-tab {
    min-width: 0;
    height: 40px;
    display: grid;
    place-items: center;
    background: #232323;
    border-right: 0;
    border-bottom: 3px solid #d80000;
    color: #fff;
    font-size: 17px;
    font-weight: 800;
    padding: 0 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .market-tab.active {
    background: #d90000;
  }

  .market-tab:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  .market-labels {
    display: grid;
    grid-template-columns: repeat(var(--market-selection-count, 1), minmax(0, 1fr));
    gap: var(--odds-gap);
    padding: 4px 10px 8px 0;
  }

  .market-label {
    min-width: 70px;
    height: 34px;
    display: grid;
    place-items: center;
    background: #d90000;
    color: #fff;
    font-size: 22px;
    font-weight: 900;
  }

  .match-list {
    display: grid;
  }

  .match-state {
    min-height: 246px;
    display: grid;
    place-items: center;
    background: #d7d7d7;
    border-bottom: 3px solid #202020;
    color: #222;
    font-size: 30px;
    font-weight: 900;
    text-align: center;
  }

  .match-state.error {
    color: #d90000;
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 17px;
    padding: 24px;
  }

  .offline-state {
    min-height: 410px;
    display: grid;
    place-items: center;
    background: #d7d7d7;
    border-bottom: 3px solid #202020;
  }

  .offline-card {
    width: min(520px, calc(100% - 48px));
    padding: 34px 28px;
    background: #242424;
    border: 3px solid #d90000;
    color: #fff;
    text-align: center;
    box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.24);
  }

  .offline-card em {
    display: flex;
    flex-direction: column;
    margin-bottom: 14px;
    color: #ffcb00;
    font-style: normal;
    font-size: 17px;
    font-weight: 900;
  }

  .offline-card strong {
    display: block;
    font-size: 34px;
    font-weight: 900;
    line-height: 1;
  }

  .offline-card span {
    display: block;
    margin-top: 14px;
    color: #d9d9d9;
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 18px;
    font-weight: 700;
  }

  .match-row {
    height: 90px;
    display: grid;
    grid-template-columns: 32px 86px 76px 30px 86px 86px 52px minmax(0, 1fr);
    align-items: center;
    background: #efefef;
    border-bottom: 3px solid #202020;
    color: #222;
    overflow: hidden;
  }

  .match-row:nth-child(odd) {
    background: #d7d7d7;
  }

  .match-number {
    font-family: Arial, sans-serif;
    font-size: 23px;
    font-weight: 900;
    text-align: center;
  }

  .team-code {
    font-size: 25px;
    font-weight: 900;
    line-height: 1;
    white-space: nowrap;
  }

  .versus {
    color: #d50000;
    font-family: Arial, sans-serif;
    font-size: 16px;
    font-weight: 900;
    text-align: center;
  }

  .row-arrow {
    color: #d90000;
    font-size: 42px;
    justify-self: center;
  }

  .row-details-button {
    display: grid;
    place-items: center;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .more-markets-backdrop {
    position: fixed;
    inset: 0;
    z-index: 32;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, .68);
  }

  .more-markets-dialog {
    width: min(680px, calc(100vw - 32px));
    max-height: min(720px, calc(100vh - 32px));
    overflow-y: auto;
    border: 2px solid #d90000;
    background: #181818;
    color: #fff;
    font-family: "Segoe UI", Arial, sans-serif;
  }

  .more-markets-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: #d90000;
  }

  .more-markets-close {
    border: 0;
    background: transparent;
    color: #fff;
    font-size: 24px;
    cursor: pointer;
  }

  .more-market-section { padding: 12px 16px; border-bottom: 1px solid #353535; }
  .more-market-section h3 { margin: 0 0 8px; }
  .more-market-selections { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 7px; }
  .more-market-selection { display: flex; justify-content: space-between; gap: 8px; padding: 8px; background: #292929; }

  .crest {
    width: 56px;
    height: 56px;
    display: grid;
    place-items: center;
    justify-self: center;
    border: 4px solid #ececec;
    border-radius: 50%;
    background: var(--crest-color);
    box-shadow: 0 0 0 2px #333, inset 0 0 0 5px rgba(255, 255, 255, 0.32);
    color: #fff;
    font-family: Arial, sans-serif;
    font-size: 12px;
    font-weight: 900;
  }

  .odds-grid {
    display: grid;
    grid-template-columns: repeat(var(--market-selection-count, 1), minmax(0, 1fr));
    gap: var(--odds-gap);
    align-items: center;
    min-width: 0;
    padding-right: 10px;
  }

  .odd-button {
    min-width: 70px;
    width: 100%;
    height: 42px;
    display: grid;
    place-items: center;
    background: #242424;
    border: 2px solid #6b6b77;
    border-radius: 2px;
    color: #fff;
    cursor: pointer;
    font-family: "Arial Narrow", Impact, "Segoe UI Condensed", Arial, sans-serif;
    font-size: 28px;
    font-weight: 900;
    line-height: 1;
    padding: 0;
    text-shadow: 2px 2px 0 #2e73bb;
  }

  .odd-button.selected {
    background: #d90000;
    border-color: #ffcb00;
    box-shadow: inset 0 0 0 2px #fff;
    text-shadow: 2px 2px 0 #4d0000;
  }

  .odd-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
  }

  .odd-button:disabled:hover {
    background: #242424;
    border-color: #6b6b77;
  }

  .bet-slip {
    position: relative;
    min-width: 0;
    min-height: calc(100vh - 72px);
    width: var(--receipt-panel-width);
    max-width: 100%;
    box-sizing: border-box;
    background: #202020;
    border-left: 3px solid #d80000;
  }

  .fastbet-input {
    height: 45px;
    display: grid;
    grid-template-columns: 1fr 240px;
    align-items: center;
    border: 2px solid #d80000;
    border-top: none;
    background: #f7f7f7;
  }

  .input-caret {
    height: 36px;
    border-left: 1px solid #111;
    margin-left: 6px;
  }

  .fastbet-label {
    color: #6c6c6c;
    font-size: 25px;
    font-weight: 900;
    text-align: center;
  }

  .bet-slip.disabled {
    opacity: 0.72;
  }

  .bet-slip.disabled .fastbet-input,
  .bet-slip.disabled .receipt,
  .bet-slip.disabled .empty-slip {
    filter: grayscale(0.35);
  }

  .bet-slip.disabled button,
  .bet-slip.disabled input {
    pointer-events: none;
  }

  .empty-slip {
    height: 520px;
    display: grid;
    place-items: center;
    color: #777;
    text-align: center;
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 29px;
  }

  .empty-slip-icon {
    position: relative;
    width: 82px;
    height: 58px;
    margin: 0 auto 22px;
  }

  .empty-slip-icon:before,
  .empty-slip-icon:after {
    content: "";
    position: absolute;
    left: 0;
    width: 46px;
    height: 8px;
    background: #747474;
    box-shadow: 0 17px 0 #747474, 0 34px 0 #747474;
  }

  .empty-slip-icon:after {
    left: 54px;
    top: 17px;
    width: 40px;
    height: 8px;
    box-shadow: none;
    transform: rotate(90deg);
  }

  .empty-slip-icon span {
    position: absolute;
    right: 7px;
    top: 0;
    width: 8px;
    height: 58px;
    background: #747474;
  }

  .receipt {
    min-width: 0;
    color: #f4f4f4;
    font-family: "Segoe UI", Arial, sans-serif;
  }

  .receipt-header {
    height: 54px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    background: #d90000;
    color: #fff;
    font-size: 22px;
    font-weight: 900;
    letter-spacing: 0;
  }

  .receipt-list {
    max-height: 420px;
    overflow-y: auto;
    border-bottom: 2px solid #d90000;
  }

  .receipt-item {
    display: grid;
    grid-template-columns: 1fr 34px;
    gap: 8px;
    padding: 12px 10px;
    border-bottom: 1px solid #333;
    background: #292929;
  }

  .receipt-match {
    color: #fff;
    font-size: 15px;
    font-weight: 800;
  }

  .receipt-market {
    margin-top: 5px;
    color: #bdbdbd;
    font-size: 13px;
  }

  .receipt-odd {
    margin-top: 6px;
    display: inline-grid;
    grid-template-columns: auto auto;
    gap: 8px;
    align-items: center;
    color: #ffcb00;
    font-size: 18px;
    font-weight: 900;
  }

  .remove-pick {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    align-self: start;
    background: #161616;
    border: 1px solid #4c4c4c;
    color: #fff;
    cursor: pointer;
  }

  .receipt-summary {
    min-width: 0;
    padding: 12px;
    background: #1c1c1c;
  }

  .stake-label {
    display: block;
    margin-bottom: 6px;
    color: #cfcfcf;
    font-size: 13px;
    font-weight: 700;
  }

  .stake-input {
    width: 100%;
    height: 42px;
    padding: 0 10px;
    background: #f8f8f8;
    border: 2px solid #d90000;
    color: #222;
    font-size: 22px;
    font-weight: 900;
    text-align: right;
  }

  .receipt-total-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 10px;
    color: #d0d0d0;
    font-size: 15px;
  }

  .receipt-total-row strong {
    color: #fff;
    font-size: 20px;
  }

  .receipt-win {
    margin-top: 12px;
    padding: 10px;
    background: #f3a300;
    color: #fff;
    text-align: center;
    text-shadow: 2px 2px 0 #6b4b00;
  }

  .receipt-win span {
    display: block;
    font-size: 13px;
    font-weight: 900;
  }

  .receipt-win strong {
    display: block;
    font-size: 29px;
    font-weight: 900;
  }

  .receipt-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  .receipt-actions button {
    flex: 1 1 0;
    min-width: 0;
  }

  .ticket-status {
    margin-top: 10px;
    color: #fff;
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 12px;
    font-weight: 800;
    line-height: 1.25;
  }

  .ticket-status.success {
    color: #65d26e;
  }

  .ticket-status.error {
    color: #ffcb00;
  }

  .betting-closed-message {
    margin: 12px;
    padding: 12px;
    border: 1px solid #ffcb00;
    background: #3b3100;
    color: #ffdf55;
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 14px;
    font-weight: 800;
    line-height: 1.35;
    text-align: center;
  }

  .receipt-action:disabled,
  .stake-input:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .ticket-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.68);
  }

  .ticket-modal {
    width: min(430px, calc(100vw - 32px));
    background: #1f1f1f;
    border: 3px solid #65d26e;
    color: #fff;
    font-family: "Segoe UI", Arial, sans-serif;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
  }

  .ticket-modal-header {
    padding: 16px 18px;
    background: #65d26e;
    color: #08210c;
    font-size: 22px;
    font-weight: 900;
  }

  .ticket-modal-body {
    padding: 18px;
  }

  .ticket-modal-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 0;
    border-bottom: 1px solid #383838;
    font-size: 15px;
  }

  .ticket-modal-row span {
    color: #cfcfcf;
  }

  .ticket-modal-row strong {
    text-align: right;
  }

  .ticket-modal-error {
    margin-top: 12px;
    color: #ffcb00;
    font-size: 13px;
    font-weight: 800;
  }

  .ticket-modal-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 0 18px 18px;
  }

  .ticket-modal-action {
    height: 42px;
    border: 0;
    cursor: pointer;
    color: #fff;
    font-size: 14px;
    font-weight: 900;
  }

  .ticket-modal-action.print {
    background: #d90000;
  }

  .ticket-modal-action.close {
    background: #555;
  }

  .ticket-print-failure {
    position: fixed;
    right: 18px;
    bottom: 82px;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 430px;
    padding: 12px 14px;
    border: 1px solid #ffcb00;
    background: #202020;
    color: #fff;
    box-shadow: 0 4px 18px rgba(0,0,0,.45);
    font-size: 13px;
    font-weight: 700;
  }

  .ticket-print-failure button {
    border: 0;
    padding: 8px 12px;
    background: #d90000;
    color: #fff;
    cursor: pointer;
    font-weight: 900;
  }

  .receipt-action {
    flex: 1 1 0;
    min-width: 0;
    height: 42px;
    border: 0;
    color: #fff;
    cursor: pointer;
    font-size: 15px;
    font-weight: 900;
  }

  .receipt-action.clear {
    background: #555;
  }

  .receipt-action.place {
    background: #d90000;
  }

  @media (max-width: 1200px) {
    .terminal-topbar {
      grid-template-columns: 392px 1fr 260px;
    }

    .terminal-body {
      grid-template-columns: 1fr;
    }

    .bet-slip {
      display: none;
    }
  }

  /* Compact full-screen display layout: header + board summary + ten fixtures + footer. */
  .betting-board {
    --pre-odds-width: clamp(280px, 25vw, 390px);
    --odds-gap: clamp(4px, .55vw, 10px);
    --odds-cell: minmax(0, 1fr);
    height: 100vh;
    min-height: 620px;
    display: grid;
    grid-template-rows: 62px minmax(0, 1fr) 42px;
    background: radial-gradient(circle at 58% 25%, #242424 0, #151515 48%, #090909 100%);
  }

  .socket-debug-badge,
  .jackpot-row {
    display: none;
  }

  .terminal-topbar {
    height: 62px;
    background: linear-gradient(180deg, #0b0b0b, #111);
    border-bottom: 1px solid #d40000;
  }

  .competition-tabs { justify-content: center; }
  .competition-tab { width: clamp(76px, 9vw, 118px); padding: 4px 8px; border: 0; border-bottom: 3px solid transparent; color: #ddd; }
  .competition-tab.active { color: #fff; background: transparent; border-bottom-color: #e00000; }
  .competition-tab svg { font-size: 22px; filter: none; color: #f00000; }
  .topbar-chevron { margin-right: auto; }
  .header-actions { height: 100%; }

  .terminal-body {
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--receipt-panel-width);
  }
  .odds-area { height: 100%; display: grid; grid-template-rows: 145px minmax(0, 1fr); padding: 8px 14px 10px; box-sizing: border-box; }
  .market-layout { grid-template-columns: var(--pre-odds-width) minmax(0, 1fr); gap: 20px; min-height: 0; }
  .league-panel { height: 145px; grid-template-columns: minmax(190px, 1fr) 155px; border: 1px solid #252525; background: repeating-linear-gradient(30deg, #1c1c1c 0 3px, #171717 3px 7px); }
  .league-brand { grid-template-columns: 58px 1fr; column-gap: 8px; padding: 8px 12px; }
  .league-brand:before { display: none; }
  .lion-mark { grid-row: 1 / span 2; width: 48px; height: 52px; margin: 0; font-size: 27px; }
  .league-title { font-size: 17px; line-height: 1.05; text-shadow: none; }
  .league-code { margin: 3px 0 0; font-size: 11px; }
  .timer-column { justify-items: center; padding: 0 8px; }
  .timer-dial { width: 82px; height: 82px; border-width: 3px; background: #191919; }
  .timer-time { margin: 6px 0; font-size: 18px; }
  .live-status { font-size: 8px; }

  .markets { height: 145px; align-content: end; }
  .market-tabs { gap: 4px; border: 0; }
  .market-tab { height: 36px; border: 1px solid #303030; border-bottom: 2px solid #b70000; background: linear-gradient(#292929, #1c1c1c); font-size: clamp(11px, 1.1vw, 16px); }
  .market-tab.active { background: linear-gradient(#dc0808, #a90000); }
  .market-labels { gap: 4px; padding: 6px 0 0; }
  .market-label { min-width: 0; height: 35px; border: 1px solid #ef1e1e; background: linear-gradient(#d60a0a, #a90000); font-size: clamp(14px, 1.4vw, 20px); }

  .match-list { min-height: 0; grid-template-rows: repeat(10, minmax(0, 1fr)); gap: 1px; background: #080808; }
  .match-row,
  .match-row:nth-child(odd) {
    height: auto;
    min-height: 0;
    grid-template-columns: 38px 54px minmax(54px, 74px) 30px 54px minmax(54px, 74px) 34px minmax(0, 1fr);
    border: 0;
    background: linear-gradient(100deg, #292929, #1c1c1c);
    color: #f3f3f3;
  }
  .match-row:nth-child(even) { background: linear-gradient(100deg, #242424, #181818); }
  .match-number { font-size: clamp(15px, 1.3vw, 20px); font-weight: 500; }
  .team-code { font-size: clamp(15px, 1.45vw, 21px); }
  .crest { width: clamp(30px, 3vw, 42px); height: clamp(30px, 3vw, 42px); border-width: 2px; box-shadow: 0 0 0 1px #111, inset 0 0 0 3px rgba(255,255,255,.25); font-size: 10px; }
  .row-arrow { font-size: 24px; }
  .odds-grid { gap: var(--odds-gap); padding-right: 8px; }
  .odd-button { min-width: 0; height: clamp(31px, 4.2vh, 43px); border: 1px solid #4b4b4b; background: linear-gradient(#141414, #070707); font-size: clamp(16px, 1.7vw, 24px); text-shadow: none; }

  .bet-slip {
    display: block;
    min-height: 0;
    height: 100%;
    width: var(--receipt-panel-width);
    overflow: hidden;
    border-left: 2px solid #b90000;
    background: #1b1b1b;
  }
  .fastbet-input { height: 38px; grid-template-columns: 1fr 78%; border-width: 1px; }
  .fastbet-label { font-size: 19px; }
  .empty-slip { height: calc(100vh - 140px); font-size: 19px; }
  .receipt {
    position: static;
    height: auto;
    flex: 1 1 auto;
    min-height: 0;
    display: block;
    overflow: hidden;
  }
  .receipt-header { height: 40px; box-sizing: border-box; font-size: 17px; }
  .receipt-list {
    position: absolute;
    top: 78px;
    right: 0;
    bottom: 202px;
    left: 0;
    max-height: none;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #777 #1b1b1b;
  }
  .receipt-list::-webkit-scrollbar { width: 8px; }
  .receipt-list::-webkit-scrollbar-track { background: #1b1b1b; }
  .receipt-list::-webkit-scrollbar-thumb { background: #777; border-radius: 5px; }
  .receipt-item {
    min-height: 43px;
    box-sizing: border-box;
    grid-template-columns: minmax(0, 1fr) 27px;
    gap: 5px;
    padding: 5px 6px;
  }
  .receipt-match { overflow: hidden; font-size: 12px; line-height: 1.1; text-overflow: ellipsis; white-space: nowrap; }
  .receipt-market { margin-top: 2px; overflow: hidden; font-size: 10px; line-height: 1.1; text-overflow: ellipsis; white-space: nowrap; }
  .receipt-odd { margin-top: 2px; gap: 5px; font-size: 12px; }
  .remove-pick { width: 26px; height: 26px; }
  .receipt-summary {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 2;
    box-sizing: border-box;
    padding: 7px 8px 8px;
    border-top: 2px solid #c80000;
    background: #141414;
    box-shadow: 0 -8px 18px rgba(0, 0, 0, .42);
  }
  .stake-label { margin-bottom: 3px; font-size: 11px; }
  .stake-input { height: 33px; box-sizing: border-box; font-size: 17px; }
  .receipt-total-row { margin-top: 4px; font-size: 12px; }
  .receipt-total-row strong { font-size: 15px; }
  .receipt-win { margin-top: 6px; padding: 5px; }
  .receipt-win span { font-size: 10px; }
  .receipt-win strong { font-size: 19px; }
  .receipt-actions { position: static; display: flex; gap: 5px; margin-top: 6px; }
  .receipt-actions button { flex: 1 1 0; min-width: 0; }
  .receipt-action { height: 42px; font-size: 21px; }
  .receipt-action svg { display: block; margin: auto; }

  .virtual-display-footer { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) var(--receipt-panel-width); align-items: stretch; box-sizing: border-box; padding: 0 0 env(safe-area-inset-bottom, 0px); border-top: 1px solid #2b2b2b; color: #aaa; background: #090909; font: 13px "Segoe UI", Arial, sans-serif; }
  .footer-meta { min-width: 0; display: flex; align-items: center; justify-content: flex-end; padding: 0 18px; overflow: hidden; }
  .footer-meta > span { display: none; }
  .footer-meta > span:last-child { display: inline; white-space: nowrap; }
  .secure-dot { color: #25b818; }
  .display-action-dock { width: 100%; min-width: 0; display: flex; }
  .display-action-dock button { flex: 1 1 0; min-width: 0; }
  .dock-action { flex: 1 1 0; min-width: 0; display: grid; grid-template-rows: 1fr auto; place-items: center; gap: 2px; padding-inline: 4px; border: 0; border-left: 2px solid rgba(0,0,0,.35); color: #fff; font: 900 14px "Arial Narrow", Impact, sans-serif; cursor: pointer; }
  .dock-action { gap: 0; font-size: 11px; line-height: 1; }
  .dock-action svg { font-size: 20px; }
  .dock-action.clear { background: linear-gradient(#e30a0a,#b30000); }
  .dock-action.search { background: linear-gradient(#1699c8,#0878a5); }
  .dock-action.payout { background: linear-gradient(#12b7ba,#098b91); }
  .dock-action.print { background: linear-gradient(#656565,#414141); }
  .dock-action.print.has-selections { background: linear-gradient(#32d414,#159800); }
  .dock-action:disabled { opacity: .42; cursor: not-allowed; }

  .keyboard-shortcut-overlay {
    position: fixed;
    right: calc(var(--receipt-panel-width) + 16px);
    bottom: 86px;
    z-index: 25;
    min-width: 150px;
    max-width: min(420px, calc(100vw - 32px));
    padding: 8px 12px;
    border: 1px solid #e31a1a;
    border-radius: 4px;
    background: rgba(8, 8, 8, .94);
    color: #fff;
    font: 800 15px "Segoe UI", Arial, sans-serif;
    box-shadow: 0 5px 18px rgba(0,0,0,.45);
  }
  .keyboard-shortcut-overlay strong { color: #ff3030; }
  .keyboard-shortcut-feedback { display: block; margin-top: 3px; color: #ffca32; font-size: 12px; }
  .keyboard-shortcut-feedback.success { color: #65d26e; }
  .odd-button.keyboard-highlight {
    border-color: #fff;
    background: linear-gradient(#ff2a2a,#b30000);
    box-shadow: 0 0 0 2px #ffdf55, 0 0 16px #ff3030;
  }

  .table-theme-light .match-list { background: #a9a9a9; }
  .table-theme-light .match-row,
  .table-theme-light .match-row:nth-child(odd) { background: linear-gradient(#fff,#e8e8e8); color: #222; border-bottom: 1px solid #aaa; }
  .table-theme-light .match-row:nth-child(even) { background: linear-gradient(#ededed,#d7d7d7); }
  .table-theme-light .odd-button { border-color: #333; background: linear-gradient(#3a3a3a,#121212); color: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.35); }
  .table-theme-light .odd-button.selected { background: linear-gradient(#f21b1b,#ac0000); }

  @media (max-width: 1050px) {
    .betting-board { --pre-odds-width: 255px; }
    .header-brand { flex-basis: 70px; padding-inline: 4px; }
    .header-metric-label,
    .header-action-label,
    .header-terminal-identity small { display: none; }
    .header-terminal-identity { min-width: 78px; max-width: 105px; padding-inline: 5px; }
    .odds-area { padding-inline: 6px; }
    .market-layout { gap: 8px; }
    .terminal-body { grid-template-columns: minmax(0, 1fr) var(--receipt-panel-width); }
    .match-row, .match-row:nth-child(odd) { grid-template-columns: 24px 34px minmax(36px, 1fr) 18px 34px minmax(36px, 1fr) 20px minmax(0, 1fr); }
    .team-code { font-size: 14px; }
    .footer-meta { padding: 0 8px; }
    .crest { width: 29px; height: 29px; }
    .odd-button { font-size: 15px; }
  }

  @media (max-height: 820px) {
    .betting-board {
      min-height: 0;
      grid-template-rows: 58px minmax(0, 1fr) 40px;
    }
    .terminal-topbar { height: 58px; }
    .header-brand img { max-height: 50px; }
    .odds-area {
      grid-template-rows: 124px minmax(0, 1fr);
      padding-top: 5px;
      padding-bottom: 5px;
    }
    .league-panel {
      height: 124px;
      grid-template-columns: minmax(180px, 1fr) 142px;
    }
    .markets { height: 124px; }
    .market-tab { height: 31px; }
    .market-labels { padding-top: 4px; }
    .market-label { height: 31px; }
    .timer-dial { width: 70px; height: 70px; }
    .match-list { overflow: hidden; }
    .match-row,
    .match-row:nth-child(odd) { height: auto; min-height: 0; }
    .crest { width: clamp(28px, 3.5vh, 36px); height: clamp(28px, 3.5vh, 36px); }
    .odd-button { height: clamp(28px, 4.2vh, 35px); font-size: clamp(15px, 2.4vh, 21px); }
    .empty-slip { height: calc(100vh - 126px); }
    .footer-meta { padding-inline: 12px; font-size: 12px; }
    .dock-action { gap: 0; padding: 3px 8px; font-size: 12px; line-height: 1; }
    .dock-action svg { font-size: 19px; }
  }

  @media (max-width: 900px) {
    .terminal-body { grid-template-columns: minmax(0, 1fr); }
    .bet-slip { display: none; }
    .footer-meta { display: none; }
    .virtual-display-footer { grid-template-columns: 1fr; }
    .display-action-dock { width: 100%; min-width: 0; }
  }
`;

const Crest = ({code, color}) => (
  <span className="crest" style={{'--crest-color': color}}>
    {code.slice(0, 2)}
  </span>
);

const formatMoney = (value) => `${Math.round(value).toLocaleString()} USh`;

const EMPTY_DISPLAY = {
  provider: null,
  leagueId: null,
  leagueNumber: null,
  weekNumber: null,
  providerEventId: null,
  firstMatch: null,
  leagueName: null,
  activeProviderEventId: null,
  activeWeekNumber: null,
  activeNextRefreshAt: null,
  activeEndAt: null,
  activeStartAt: null,
  lastUpdatedAt: null,
  currentBoard: null,
  isStale: true,
  events: [],
};

export const TerminalHeaderActions = ({
  currentTime,
  onLogout,
  onOpenResults,
  onOpenTickets,
  tableTheme,
  terminal,
  toggleTableTheme,
}) => (
  <div className="header-actions" aria-label="Terminal controls">
    <span className="header-metric" aria-label={`Current time ${formatClockTime(new Date(currentTime))}`}>
      <FaClock aria-hidden="true" />
      <span>{formatClockTime(new Date(currentTime))}</span>
    </span>
    <span className="header-metric" aria-label="Balance 0 USH">
      <FaCoins aria-hidden="true" />
      <span>0 USH</span>
    </span>
    <button
      aria-label={`Switch to ${tableTheme === 'dark' ? 'light' : 'dark'} theme`}
      className="header-action-button"
      onClick={toggleTableTheme}
      title={`Switch to ${tableTheme === 'dark' ? 'light' : 'dark'} theme`}
      type="button"
    >
      {tableTheme === 'dark' ? <FaSun aria-hidden="true" /> : <FaMoon aria-hidden="true" />}
      <span className="header-action-label">Theme</span>
    </button>
    <button
      aria-label="Open results"
      className="header-action-button"
      onClick={onOpenResults}
      title="Results"
      type="button"
    >
      <FaTrophy aria-hidden="true" />
      <span className="header-action-label">Results</span>
    </button>
    <button
      aria-label="Open tickets"
      className="header-action-button"
      onClick={onOpenTickets}
      title="Tickets"
      type="button"
    >
      <FaReceipt aria-hidden="true" />
      <span className="header-action-label">Tickets</span>
    </button>
    <span className="header-terminal-identity" aria-label="Authenticated terminal">
      <strong>{terminal?.code || 'Terminal'}</strong>
      <small>{terminal?.name || 'Display terminal'}</small>
    </span>
    <button
      aria-label="Logout"
      className="header-action-button header-logout"
      onClick={onLogout}
      title="Logout"
      type="button"
    >
      <FaSignOutAlt aria-hidden="true" />
      <span className="header-action-label">Logout</span>
    </button>
  </div>
);

const Grid = ({onLogout, onOpenResults, onOpenTickets, terminal}) => {
  const [leagues, setLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [display, setDisplay] = useState(EMPTY_DISPLAY);
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [loadingDisplay, setLoadingDisplay] = useState(false);
  const [error, setError] = useState('');
  const [slip, setSlip] = useState([]);
  const [activeMarketCode, setActiveMarketCode] = useState('MAIN');
  const [stake, setStake] = useState(DEFAULT_STAKE);
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketStatus, setTicketStatus] = useState(null);
  const [placedTicket, setPlacedTicket] = useState(null);
  const [printError, setPrintError] = useState('');
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [cancelTicketOpen, setCancelTicketOpen] = useState(false);
  const [cancelTicketNumber, setCancelTicketNumber] = useState('');
  const [moreMarketsMatch, setMoreMarketsMatch] = useState(null);
  const [tableTheme, setTableTheme] = useState(() => localStorage.getItem('virtualDisplayTableTheme') || 'dark');
  const [displayCountdown, setDisplayCountdown] = useState('--:--');
  const [countdownSeconds, setCountdownSeconds] = useState(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [socketDebug, setSocketDebug] = useState({
    connected: false,
    lastEvent: '',
    providerEventId: '',
    eventCount: 0,
  });
  const displayRequestSequenceRef = useRef(0);
  const initialRestLoggedRef = useRef(false);
  const firstSocketLoggedRef = useRef(false);
  const autoPrintedTicketKeysRef = useRef(new Set());
  const selectedLeagueId = selectedLeague ? getLeagueRequestId(selectedLeague) : DEFAULT_LEAGUE_ID;
  const selectedLeagueProvider = selectedLeague ? getLeagueRequestProvider(selectedLeague) : PROVIDER;
  const selectedLeagueNumber = selectedLeague?.leagueNumber;

  const toggleTableTheme = () => {
    setTableTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem('virtualDisplayTableTheme', next);
      return next;
    });
  };

  useEffect(() => {
    setActiveMarketCode('MAIN');
  }, [selectedLeague?.id, selectedLeague?.provider]);

  const getDisplayPayloadFromSocketPayload = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') return payload;

    const currentBoard = payload.currentBoard && typeof payload.currentBoard === 'object'
      ? payload.currentBoard
      : null;
    const data = payload.data && typeof payload.data === 'object'
      ? payload.data
      : null;
    const display = payload.display && typeof payload.display === 'object'
      ? payload.display
      : null;

    if (currentBoard && Array.isArray(currentBoard.events)) {
      return {
        ...payload,
        ...currentBoard,
        provider: currentBoard.provider ?? payload.provider,
        leagueId: currentBoard.leagueId ?? payload.leagueId,
        leagueNumber: currentBoard.leagueNumber ?? payload.leagueNumber,
        weekNumber: currentBoard.weekNumber ?? payload.weekNumber,
        providerEventId: currentBoard.providerEventId ?? payload.providerEventId,
        firstMatch: currentBoard.firstMatch ?? payload.firstMatch,
        leagueName: currentBoard.leagueName ?? payload.leagueName,
        lastUpdatedAt: currentBoard.lastUpdatedAt ?? payload.lastUpdatedAt,
        isStale: currentBoard.isStale ?? payload.isStale,
        events: Array.isArray(currentBoard.events) ? currentBoard.events : payload.events,
        currentBoard,
      };
    }

    if (data && Array.isArray(data.events)) {
      return {
        ...payload,
        ...data,
        provider: data.provider ?? payload.provider,
        leagueId: data.leagueId ?? payload.leagueId,
        leagueNumber: data.leagueNumber ?? payload.leagueNumber,
        weekNumber: data.weekNumber ?? payload.weekNumber,
        providerEventId: data.providerEventId ?? payload.providerEventId,
        firstMatch: data.firstMatch ?? payload.firstMatch,
        leagueName: data.leagueName ?? payload.leagueName,
        lastUpdatedAt: data.lastUpdatedAt ?? payload.lastUpdatedAt,
        isStale: data.isStale ?? payload.isStale,
        events: data.events,
      };
    }

    if (display && Array.isArray(display.events)) {
      return {
        ...payload,
        ...display,
        provider: display.provider ?? payload.provider,
        leagueId: display.leagueId ?? payload.leagueId,
        leagueNumber: display.leagueNumber ?? payload.leagueNumber,
        weekNumber: display.weekNumber ?? payload.weekNumber,
        providerEventId: display.providerEventId ?? payload.providerEventId,
        firstMatch: display.firstMatch ?? payload.firstMatch,
        leagueName: display.leagueName ?? payload.leagueName,
        lastUpdatedAt: display.lastUpdatedAt ?? payload.lastUpdatedAt,
        isStale: display.isStale ?? payload.isStale,
        events: display.events,
      };
    }

    return payload;
  }, []);

  const getBoardTimingPayload = useCallback((payload, displayPayload) => {
    if (!payload || typeof payload !== 'object') return displayPayload ?? {};

    const currentBoard = payload.currentBoard && typeof payload.currentBoard === 'object'
      ? payload.currentBoard
      : null;
    const data = payload.data && typeof payload.data === 'object'
      ? payload.data
      : null;
    const dataCurrentBoard = data?.currentBoard && typeof data.currentBoard === 'object'
      ? data.currentBoard
      : null;
    const displayBoard = payload.display && typeof payload.display === 'object'
      ? payload.display
      : null;
    const displayCurrentBoard = displayBoard?.currentBoard && typeof displayBoard.currentBoard === 'object'
      ? displayBoard.currentBoard
      : null;

    return {
      ...payload,
      ...(displayPayload ?? {}),
      ...(data ?? {}),
      ...(displayBoard ?? {}),
      ...(dataCurrentBoard ?? {}),
      ...(displayCurrentBoard ?? {}),
      ...(currentBoard ?? {}),
    };
  }, []);

  const normalizeDisplayPayload = useCallback((payload) => {
    const displayPayload = getDisplayPayloadFromSocketPayload(payload);
    const timingPayload = getBoardTimingPayload(payload, displayPayload);
    const sourceEvents = Array.isArray(displayPayload?.events) ? displayPayload.events : [];
    const firstEvent = sourceEvents.find((event) => event && typeof event === 'object') ?? null;
    const providerEventId =
      displayPayload?.providerEventId ??
      timingPayload?.providerEventId ??
      firstEvent?.providerEventId ??
      firstEvent?.eventId ??
      firstEvent?.EventId;
    const countdownTarget = getPayloadCountdownTarget(timingPayload) ?? getPayloadCountdownTarget(displayPayload);
    const startTime = getPayloadStartTime(timingPayload) ?? getPayloadStartTime(displayPayload);
    const updatedAt =
      getPayloadUpdatedAt(timingPayload) ??
      getPayloadUpdatedAt(displayPayload) ??
      null;

    return {
      provider: displayPayload?.provider,
      leagueId: displayPayload?.leagueId,
      leagueNumber: displayPayload?.leagueNumber,
      weekNumber: displayPayload?.weekNumber,
      providerEventId,
      firstMatch: displayPayload?.firstMatch,
      leagueName: displayPayload?.leagueName,
      activeProviderEventId: providerEventId,
      activeWeekNumber: timingPayload?.weekNumber ?? displayPayload?.weekNumber,
      activeNextRefreshAt: countdownTarget,
      activeEndAt: timingPayload?.endAt ?? timingPayload?.endsAt ?? displayPayload?.endAt ?? displayPayload?.endsAt ?? null,
      activeStartAt: startTime,
      lastUpdatedAt: updatedAt,
      currentBoard: displayPayload?.currentBoard ?? null,
      isStale: displayPayload?.isStale ?? false,
      events: sourceEvents.map(normalizeEvent),
    };
  }, [getBoardTimingPayload, getDisplayPayloadFromSocketPayload]);

  const getUsableEventsFromPayload = useCallback((payload) => {
    const displayPayload = getDisplayPayloadFromSocketPayload(payload);
    return Array.isArray(displayPayload?.events) ? displayPayload.events : [];
  }, [getDisplayPayloadFromSocketPayload]);

  const getSocketPayloadProviderEventId = useCallback((payload) => {
    const displayPayload = getDisplayPayloadFromSocketPayload(payload);
    const events = Array.isArray(displayPayload?.events) ? displayPayload.events : [];
    const firstEvent = events.find((event) => event && typeof event === 'object') ?? null;
    return displayPayload?.providerEventId ?? firstEvent?.providerEventId ?? firstEvent?.eventId ?? '';
  }, [getDisplayPayloadFromSocketPayload]);

  const getDisplayFeedSummary = useCallback((payload) => {
    const displayPayload = getDisplayPayloadFromSocketPayload(payload);
    const timingPayload = getBoardTimingPayload(payload, displayPayload);
    const events = Array.isArray(displayPayload?.events) ? displayPayload.events : [];
    const firstEvent = events.find((event) => event && typeof event === 'object') ?? null;

    return {
      providerEventId: displayPayload?.providerEventId ?? timingPayload?.providerEventId ?? firstEvent?.providerEventId ?? firstEvent?.eventId ?? '',
      isStale: displayPayload?.isStale ?? timingPayload?.isStale,
      eventCount: events.length,
      lastUpdatedAt: getPayloadUpdatedAt(timingPayload) ?? getPayloadUpdatedAt(displayPayload) ?? '',
      startTime: getPayloadStartTime(timingPayload) ?? getPayloadStartTime(displayPayload) ?? '',
      countdownTarget: getPayloadCountdownTarget(timingPayload) ?? getPayloadCountdownTarget(displayPayload) ?? '',
    };
  }, [getBoardTimingPayload, getDisplayPayloadFromSocketPayload]);

  const logDisplayFeedUpdate = useCallback((source, stage, summary, extra = {}) => {
    console.log('[virtual-display-feed]', {
      source,
      stage,
      providerEventId: summary?.providerEventId ?? '',
      isStale: summary?.isStale,
      eventCount: summary?.eventCount ?? 0,
      lastUpdatedAt: summary?.lastUpdatedAt ?? '',
      startTime: summary?.startTime ?? '',
      countdownTarget: summary?.countdownTarget ?? '',
      ...extra,
    });
  }, []);

  const applyDisplayPayload = useCallback((payload, source) => {
    const nextDisplay = normalizeDisplayPayload(payload);
    const nextEvents = nextDisplay.events;
    const incomingSummary = getDisplayFeedSummary(payload);
    const payloadProvider = normalizeProviderToken(nextDisplay.provider);
    const selectedProvider = normalizeProviderToken(selectedLeagueProvider);
    const payloadLeagueIds = [nextDisplay.leagueId, nextDisplay.leagueNumber]
      .filter((value) => value !== undefined && value !== null && value !== '')
      .map(String);
    const selectedLeagueIds = [
      selectedLeagueId,
      selectedLeagueNumber,
    ]
      .filter((value) => value !== undefined && value !== null && value !== '')
      .map(String);
    const providerMismatch = payloadProvider && selectedProvider && payloadProvider !== selectedProvider;
    const leagueMismatch = payloadLeagueIds.length > 0 &&
      !payloadLeagueIds.some((payloadId) => selectedLeagueIds.includes(payloadId));

    if (providerMismatch || leagueMismatch) {
      logDisplayFeedUpdate(source, 'ignored-wrong-feed', incomingSummary, {
        selectedLeagueId,
        selectedLeagueProvider,
      });
      return [];
    }
    const firstOdds = normalizeEventMarkets(nextEvents[0] ?? {})
      .find(({code}) => code === '1X2')
      ?.selections.map(({odd}) => formatOdd(odd)) ?? [];
    const timerTarget = nextDisplay.activeNextRefreshAt || nextDisplay.activeEndAt;
    const timerSeconds = getSecondsRemaining(timerTarget);
    const payloadRemainingSeconds = Number(
      payload?.remainingSeconds ??
      payload?.currentBoard?.remainingSeconds ??
      payload?.display?.remainingSeconds ??
      payload?.data?.remainingSeconds
    );
    const timingLog = {
      providerEventId: nextDisplay.activeProviderEventId ?? nextDisplay.providerEventId ?? '',
      remainingSeconds: Number.isFinite(payloadRemainingSeconds)
        ? payloadRemainingSeconds
        : timerSeconds,
      deadline: timerTarget ?? null,
      now: Date.now(),
    };
    if (source === 'rest-initial' && !initialRestLoggedRef.current) {
      initialRestLoggedRef.current = true;
      console.log('INITIAL REST:', timingLog);
    }
    if (source === 'socket' && !firstSocketLoggedRef.current) {
      firstSocketLoggedRef.current = true;
      console.log('FIRST SOCKET:', timingLog);
    }
    const firstRow = nextEvents[0]
      ? `${nextEvents[0].homeTeam ?? nextEvents[0].home ?? ''} vs ${nextEvents[0].awayTeam ?? nextEvents[0].away ?? ''}`
      : '';
    logDisplayFeedUpdate(source, 'received', incomingSummary, {
      normalizedEventCount: nextEvents.length,
    });
    setSocketDebug((currentDebug) => {
      if (nextEvents.length > 0) {
        return {
          ...currentDebug,
          lastEvent: source,
          providerEventId: incomingSummary.providerEventId || currentDebug.providerEventId,
          eventCount: nextEvents.length,
        };
      }

      return currentDebug.eventCount > 0
        ? currentDebug
        : {
            ...currentDebug,
            lastEvent: source || currentDebug.lastEvent,
            providerEventId: incomingSummary.providerEventId || currentDebug.providerEventId,
            eventCount: incomingSummary.eventCount || currentDebug.eventCount,
          };
    });
    console.log(
      `GRID TIMER SET providerEventId=${nextDisplay.activeProviderEventId ?? nextDisplay.providerEventId ?? ''} ` +
      `target=${timerTarget ?? ''} seconds=${timerSeconds ?? ''}`
    );
    console.log(
      `GRID ODDS CHECK firstMatch=${firstRow} main1=${firstOdds[0] ?? '-'} ` +
      `x=${firstOdds[1] ?? '-'} two=${firstOdds[2] ?? '-'}`
    );

    setDisplay((currentDisplay) => {
      const cachedEvents = Array.isArray(currentDisplay.events) ? currentDisplay.events : [];
      const hasIncomingEvents = nextEvents.length > 0;
      const hasCachedEvents = cachedEvents.length > 0;
      const incomingHasOdds = nextEvents.some(({marketPages = []}) =>
        marketPages.some(({selections = []}) => selections.length > 0));
      const cachedHasOdds = cachedEvents.some(({marketPages = []}) =>
        marketPages.some(({selections = []}) => selections.length > 0));
      const incomingUpdatedAt = toDate(nextDisplay.lastUpdatedAt);
      const currentUpdatedAt = toDate(currentDisplay.lastUpdatedAt);
      const isOlderPayload = !!incomingUpdatedAt && !!currentUpdatedAt &&
        incomingUpdatedAt.getTime() < currentUpdatedAt.getTime();
      const isExplicitlyStale = nextDisplay.isStale === true;
      const shouldClear = isExplicitlyStale && !hasIncomingEvents && !hasCachedEvents;
      const shouldPreserveCachedEvents = !hasIncomingEvents && hasCachedEvents && !shouldClear;
      const currentSummary = {
        providerEventId: currentDisplay.providerEventId ?? currentDisplay.activeProviderEventId ?? '',
        isStale: currentDisplay.isStale,
        eventCount: cachedEvents.length,
        lastUpdatedAt: currentDisplay.lastUpdatedAt ?? '',
      };

      logDisplayFeedUpdate(source, 'before-set', currentSummary);

      if (isOlderPayload) {
        logDisplayFeedUpdate(source, 'ignored-older-payload', incomingSummary);
        return currentDisplay;
      }

      const deadlineDecision = reconcileCountdownDeadline({
        currentProviderEventId: currentDisplay.activeProviderEventId ?? currentDisplay.providerEventId,
        currentDeadline: currentDisplay.activeNextRefreshAt ?? currentDisplay.activeEndAt,
        incomingProviderEventId: nextDisplay.activeProviderEventId ?? nextDisplay.providerEventId,
        incomingDeadline: nextDisplay.activeNextRefreshAt ?? nextDisplay.activeEndAt,
      });
      console.log('COUNTDOWN RESET:', {
        oldDeadline: currentDisplay.activeNextRefreshAt ?? currentDisplay.activeEndAt ?? null,
        newDeadline: deadlineDecision.deadline,
        reason: deadlineDecision.reason,
        reset: deadlineDecision.reset,
      });
      const reconciledNextDisplay = {
        ...nextDisplay,
        activeNextRefreshAt: deadlineDecision.deadline,
      };

      if (hasIncomingEvents && !incomingHasOdds && cachedHasOdds) {
        logDisplayFeedUpdate(source, 'preserve-cache-after-oddsless-payload', incomingSummary);
        return {
          ...currentDisplay,
          activeNextRefreshAt: deadlineDecision.deadline,
          activeEndAt: reconciledNextDisplay.activeEndAt ?? currentDisplay.activeEndAt,
          lastUpdatedAt: reconciledNextDisplay.lastUpdatedAt ?? currentDisplay.lastUpdatedAt,
        };
      }

      if (hasIncomingEvents || shouldClear) {
        const appliedDisplay = {
          ...reconciledNextDisplay,
          activeStartAt: reconciledNextDisplay.activeStartAt ?? currentDisplay.activeStartAt,
          isStale: hasIncomingEvents ? false : reconciledNextDisplay.isStale,
        };

        logDisplayFeedUpdate(source, 'applied', {
          providerEventId: appliedDisplay.providerEventId ?? appliedDisplay.activeProviderEventId ?? '',
          isStale: appliedDisplay.isStale,
          eventCount: appliedDisplay.events.length,
          lastUpdatedAt: appliedDisplay.lastUpdatedAt ?? '',
        }, {
          action: hasIncomingEvents ? 'replace-with-events' : 'clear-explicit-stale-empty',
        });

        return appliedDisplay;
      }

      if (shouldPreserveCachedEvents) {
        const preservedDisplay = {
          ...currentDisplay,
          provider: nextDisplay.provider ?? currentDisplay.provider,
          leagueId: nextDisplay.leagueId ?? currentDisplay.leagueId,
          leagueNumber: nextDisplay.leagueNumber ?? currentDisplay.leagueNumber,
          weekNumber: nextDisplay.weekNumber ?? currentDisplay.weekNumber,
          providerEventId: nextDisplay.providerEventId ?? currentDisplay.providerEventId,
          firstMatch: nextDisplay.firstMatch ?? currentDisplay.firstMatch,
          leagueName: nextDisplay.leagueName ?? currentDisplay.leagueName,
          activeProviderEventId: nextDisplay.activeProviderEventId ?? currentDisplay.activeProviderEventId,
          activeWeekNumber: nextDisplay.activeWeekNumber ?? currentDisplay.activeWeekNumber,
          activeNextRefreshAt: deadlineDecision.deadline,
          activeEndAt: reconciledNextDisplay.activeEndAt ?? currentDisplay.activeEndAt,
          activeStartAt: nextDisplay.activeStartAt ?? currentDisplay.activeStartAt,
          lastUpdatedAt: nextDisplay.lastUpdatedAt ?? currentDisplay.lastUpdatedAt,
          isStale: false,
        };

        logDisplayFeedUpdate(source, 'applied', {
          providerEventId: preservedDisplay.providerEventId ?? preservedDisplay.activeProviderEventId ?? '',
          isStale: preservedDisplay.isStale,
          eventCount: preservedDisplay.events.length,
          lastUpdatedAt: preservedDisplay.lastUpdatedAt ?? '',
        }, {
          action: isExplicitlyStale ? 'preserve-cached-events-despite-stale-empty' : 'preserve-cached-events-empty-payload',
        });

        return preservedDisplay;
      }

      logDisplayFeedUpdate(source, 'applied', {
        providerEventId: currentDisplay.providerEventId ?? currentDisplay.activeProviderEventId ?? '',
        isStale: currentDisplay.isStale,
        eventCount: cachedEvents.length,
        lastUpdatedAt: currentDisplay.lastUpdatedAt ?? '',
      }, {
        action: 'ignore-empty-no-cache',
      });

      return currentDisplay;
    });

    console.log(
      `GRID SET EVENTS providerEventId=${nextDisplay.providerEventId ?? ''} ` +
      `eventCount=${nextDisplay.events.length}`
    );
    console.log(
      `[display-state-set] providerEventId=${nextDisplay.providerEventId ?? ''} ` +
      `week=${nextDisplay.weekNumber ?? ''} firstMatch=${nextDisplay.firstMatch ?? ''} firstRow=${firstRow}`
    );

    return nextEvents;
  }, [
    getDisplayFeedSummary,
    logDisplayFeedUpdate,
    normalizeDisplayPayload,
    selectedLeagueId,
    selectedLeagueNumber,
    selectedLeagueProvider,
  ]);

  const upsertLeagueFromDisplayPayload = useCallback((payload) => {
    const displayPayload = getDisplayPayloadFromSocketPayload(payload);
    if (!displayPayload?.provider && !displayPayload?.leagueId && !displayPayload?.leagueNumber) return;

    const displayLeague = normalizeLeague({
      provider: displayPayload.provider || PROVIDER,
      leagueId: displayPayload.leagueId || displayPayload.leagueNumber,
      leagueNumber: displayPayload.leagueNumber,
      weekNumber: displayPayload.weekNumber,
      providerEventId: displayPayload.providerEventId,
      firstMatch: displayPayload.firstMatch,
      leagueName: displayPayload.leagueName,
    });

    setLeagues((currentLeagues) => {
      const existingIndex = currentLeagues.findIndex((league) => {
        const currentIds = [league.id, league.leagueId, league.leagueNumber].filter((value) => value !== undefined && value !== null);
        const incomingIds = [displayLeague.id, displayLeague.leagueId, displayLeague.leagueNumber].filter((value) => value !== undefined && value !== null);

        return normalizeProviderToken(league.provider) === normalizeProviderToken(displayLeague.provider) &&
          incomingIds.some((incomingId) => currentIds.some((currentId) => String(incomingId) === String(currentId)));
      });

      if (existingIndex === -1) return [...currentLeagues, displayLeague];

      return currentLeagues.map((league, index) => (
        index === existingIndex ? {...league, ...displayLeague} : league
      ));
    });

    setSelectedLeague((currentLeague) => {
      if (
        currentLeague &&
        String(currentLeague.id) === String(displayLeague.id) &&
        String(currentLeague.leagueNumber ?? '') === String(displayLeague.leagueNumber ?? '') &&
        String(currentLeague.weekNumber ?? '') === String(displayLeague.weekNumber ?? '') &&
        String(currentLeague.providerEventId ?? '') === String(displayLeague.providerEventId ?? '') &&
        String(currentLeague.firstMatch ?? '') === String(displayLeague.firstMatch ?? '')
      ) {
        return currentLeague;
      }

      return displayLeague;
    });
  }, [getDisplayPayloadFromSocketPayload]);

  useEffect(() => {
    let cancelled = false;

    const loadLeagues = async () => {
      setLoadingLeagues(true);
      setError('');

      try {
        const payload = await getLeagues();
        if (cancelled) return;

        const nextLeagues = getArrayFromPayload(payload, ['leagues', 'items', 'results'])
          .map(normalizeLeague)
          .filter(({id}) => id !== undefined && id !== null);

        setLeagues(nextLeagues);
        setSelectedLeague(getDefaultLeague(nextLeagues));
      } catch (err) {
        if (cancelled) return;

        const message = err instanceof TypeError
          ? `Virtual-Api request failed: ${err.message}. If the browser console shows a CORS policy error, the API must allow http://localhost:3000.`
          : err.message;
        console.error('Virtual-Api leagues error:', err);
        setError(message);
        setLeagues([]);
        setSelectedLeague(null);
      } finally {
        if (!cancelled) setLoadingLeagues(false);
      }
    };

    loadLeagues();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedLeagueId || !selectedLeagueProvider) {
      logDisplayFeedUpdate('rest-initial', 'clear-no-selected-league', {
        providerEventId: '',
        isStale: true,
        eventCount: 0,
        lastUpdatedAt: '',
      });
      setDisplay(EMPTY_DISPLAY);
      return;
    }

    let cancelled = false;

    const loadDisplay = async () => {
      const requestSequence = ++displayRequestSequenceRef.current;
      setLoadingDisplay(true);
      setError('');
      setSlip([]);

      try {
        const payload = await getDisplay(selectedLeagueProvider, selectedLeagueId);
        if (cancelled || requestSequence !== displayRequestSequenceRef.current) return;

        const nextEvents = applyDisplayPayload(payload, 'rest-initial');
        console.log(`Loaded ${nextEvents.length} events for league ${selectedLeagueId}`);
        console.log('REST FIRST EVENT RAW =', JSON.stringify(payload?.events?.[0], null, 2));
        console.log('REST FIRST EVENT SHAPE', {
          hasMarketsArray: Array.isArray(payload?.events?.[0]?.markets),
          hasSelectionsArray: Array.isArray(payload?.events?.[0]?.markets?.[0]?.selections),
          marketCount: Array.isArray(payload?.events?.[0]?.markets) ? payload.events[0].markets.length : 0,
        });
        console.log('First event display markets:', normalizeEvent(nextEvents[0] ?? {})?.markets ?? {});
      } catch (err) {
        if (cancelled) return;

        const message = err instanceof TypeError
          ? `Virtual-Api request failed: ${err.message}. If the browser console shows a CORS policy error, the API must allow http://localhost:3000.`
          : err.message;
        console.error('Virtual-Api display error:', err);
        setError(message);
        setDisplay((currentDisplay) => {
          const cachedEvents = Array.isArray(currentDisplay.events) ? currentDisplay.events : [];

          if (cachedEvents.length > 0) {
            logDisplayFeedUpdate('rest-initial', 'preserve-cache-after-error', {
              providerEventId: currentDisplay.providerEventId ?? currentDisplay.activeProviderEventId ?? '',
              isStale: currentDisplay.isStale,
              eventCount: cachedEvents.length,
              lastUpdatedAt: currentDisplay.lastUpdatedAt ?? '',
            });
            return currentDisplay;
          }

          logDisplayFeedUpdate('rest-initial', 'clear-after-error-no-cache', {
            providerEventId: '',
            isStale: true,
            eventCount: 0,
            lastUpdatedAt: '',
          });
          return EMPTY_DISPLAY;
        });
      } finally {
        if (!cancelled) setLoadingDisplay(false);
      }
    };

    loadDisplay();

    return () => {
      cancelled = true;
    };
  }, [applyDisplayPayload, logDisplayFeedUpdate, selectedLeagueId, selectedLeagueProvider]);

  useEffect(() => {
    const socket = connectSocket();
    const markSocketConnected = () => {
      setSocketDebug((currentDebug) => ({
        ...currentDebug,
        connected: true,
      }));
    };
    const markSocketDisconnected = () => {
      setSocketDebug((currentDebug) => ({
        ...currentDebug,
        connected: false,
      }));
    };
    const hydrateCurrentDisplay = async () => {
      if (!selectedLeagueId || !selectedLeagueProvider) return;
      const requestSequence = ++displayRequestSequenceRef.current;

      try {
        const payload = await getDisplay(selectedLeagueProvider, selectedLeagueId);
        if (requestSequence !== displayRequestSequenceRef.current) return;
        const nextEvents = applyDisplayPayload(payload, 'rest-reconnect');
        if (nextEvents.length > 0) upsertLeagueFromDisplayPayload(payload);
        setError('');
      } catch (err) {
        console.error('Virtual-Api reconnect display hydrate error:', err);
      }
    };

    const onAnySocketEvent = (eventName, payload) => {
      if (![VIRTUAL_DISPLAY_UPDATED_EVENT, VIRTUAL_EVENTS_QUEUE_UPDATED_EVENT].includes(eventName)) return;
      if (!payload) return;

      const usableEvents = getUsableEventsFromPayload(payload);
      const payloadSummary = getDisplayFeedSummary(payload);
      console.log('SOCKET ANY', eventName, {
        providerEventId: payloadSummary.providerEventId,
        isStale: payloadSummary.isStale,
        eventCount: payloadSummary.eventCount,
        lastUpdatedAt: payloadSummary.lastUpdatedAt,
        keys: Object.keys(payload || {})
      });
      setSocketDebug((currentDebug) => {
        if (usableEvents.length === 0 && currentDebug.eventCount > 0) {
          return {
            ...currentDebug,
            connected: socket.connected,
            lastEvent: eventName || currentDebug.lastEvent,
            providerEventId: payloadSummary.providerEventId || currentDebug.providerEventId,
          };
        }

        return {
          connected: socket.connected,
          lastEvent: eventName,
          providerEventId: getSocketPayloadProviderEventId(payload) || payloadSummary.providerEventId || currentDebug.providerEventId,
          eventCount: usableEvents.length || currentDebug.eventCount,
        };
      });

      if (eventName === VIRTUAL_DISPLAY_UPDATED_EVENT) {
        console.log('SOCKET FULL PAYLOAD virtual-display-updated', payload);
      }

      if (usableEvents.length === 0) {
        const displayPayload = getDisplayPayloadFromSocketPayload(payload);
        const timingPayload = getBoardTimingPayload(payload, displayPayload);
        const timerTarget = getPayloadCountdownTarget(timingPayload) ?? getPayloadCountdownTarget(displayPayload);
        const startTime = getPayloadStartTime(timingPayload) ?? getPayloadStartTime(displayPayload);
        const incomingProviderEventId = timingPayload?.providerEventId ?? displayPayload?.providerEventId;

        if (timerTarget || incomingProviderEventId) {
          setDisplay((currentDisplay) => {
            const incomingUpdatedAt = toDate(getPayloadUpdatedAt(timingPayload));
            const currentUpdatedAt = toDate(currentDisplay.lastUpdatedAt);
            if (incomingUpdatedAt && currentUpdatedAt &&
              incomingUpdatedAt.getTime() < currentUpdatedAt.getTime()) {
              return currentDisplay;
            }

            const deadlineDecision = reconcileCountdownDeadline({
              currentProviderEventId: currentDisplay.activeProviderEventId ?? currentDisplay.providerEventId,
              currentDeadline: currentDisplay.activeNextRefreshAt ?? currentDisplay.activeEndAt,
              incomingProviderEventId,
              incomingDeadline: timerTarget,
            });
            console.log('COUNTDOWN RESET:', {
              oldDeadline: currentDisplay.activeNextRefreshAt ?? currentDisplay.activeEndAt ?? null,
              newDeadline: deadlineDecision.deadline,
              reason: deadlineDecision.reason,
              reset: deadlineDecision.reset,
            });

            return {
              ...currentDisplay,
              activeProviderEventId: incomingProviderEventId ?? currentDisplay.activeProviderEventId,
              activeWeekNumber: timingPayload?.weekNumber ?? currentDisplay.activeWeekNumber,
              activeNextRefreshAt: deadlineDecision.deadline,
              activeEndAt: timerTarget
                ? timingPayload?.endAt ?? timingPayload?.endsAt ?? displayPayload?.endAt ?? null
                : currentDisplay.activeEndAt,
              activeStartAt: startTime ?? currentDisplay.activeStartAt,
              lastUpdatedAt: getPayloadUpdatedAt(timingPayload) ?? currentDisplay.lastUpdatedAt,
            };
          });
          logDisplayFeedUpdate('socket', 'applied-timing-only', payloadSummary);
        }

        return;
      }

      console.log('SOCKET FIRST EVENT RAW =', JSON.stringify(usableEvents[0], null, 2));
      console.log('SOCKET FIRST EVENT SHAPE', {
        hasMarketsArray: Array.isArray(usableEvents[0]?.markets),
        hasSelectionsArray: Array.isArray(usableEvents[0]?.markets?.[0]?.selections),
        marketCount: Array.isArray(usableEvents[0]?.markets) ? usableEvents[0].markets.length : 0,
      });

      const nextEvents = applyDisplayPayload(payload, 'socket');
      const displayPayload = getDisplayPayloadFromSocketPayload(payload);
      if (nextEvents.length === 0) return;

      if (eventName === VIRTUAL_DISPLAY_UPDATED_EVENT) {
        console.log(
          `SOCKET EVENT virtual-display-updated providerEventId=${displayPayload?.providerEventId ?? ''} ` +
          `eventCount=${nextEvents.length}`
        );
      }

      if (eventName === VIRTUAL_EVENTS_QUEUE_UPDATED_EVENT) {
        const current = displayPayload?.providerEventId
          ?? displayPayload?.firstMatch
          ?? payload.current
          ?? '';
        console.log(
          `SOCKET EVENT virtual-events-queue-updated current=${current} eventCount=${nextEvents.length}`
        );
      }

      upsertLeagueFromDisplayPayload(payload);
      setError('');
      setLoadingDisplay(false);
    };

    socket.on('connect', markSocketConnected);
    socket.on('disconnect', markSocketDisconnected);
    socket.on('connect_error', markSocketDisconnected);
    socket.io.on('reconnect', hydrateCurrentDisplay);
    socket.onAny(onAnySocketEvent);
    if (socket.connected) {
      markSocketConnected();
    }

    return () => {
      socket.off('connect', markSocketConnected);
      socket.off('disconnect', markSocketDisconnected);
      socket.off('connect_error', markSocketDisconnected);
      socket.io.off('reconnect', hydrateCurrentDisplay);
      socket.offAny(onAnySocketEvent);
    };
  }, [
    getDisplayPayloadFromSocketPayload,
    getBoardTimingPayload,
    getDisplayFeedSummary,
    getSocketPayloadProviderEventId,
    getUsableEventsFromPayload,
    applyDisplayPayload,
    logDisplayFeedUpdate,
    selectedLeagueId,
    selectedLeagueProvider,
    upsertLeagueFromDisplayPayload,
  ]);

  useEffect(() => {
    const target = display.activeNextRefreshAt || display.activeEndAt;
    const targetDate = toDate(target);
    const providerEventId = display.activeProviderEventId ?? display.providerEventId ?? '';

    console.log(
      `TIMER SOURCE providerEventId=${providerEventId} ` +
      `target=${target ?? ''}`
    );

    if (!targetDate) {
      setDisplayCountdown('--:--');
      setCountdownSeconds(null);
      console.log('[virtual-display-timer]', {
        providerEventId,
        countdownTarget: '',
        now: new Date().toISOString(),
        secondsRemaining: null,
      });
      return undefined;
    }

    const tick = () => {
      const seconds = Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / 1000));
      const mmss = formatCountdown(seconds);
      console.log('[virtual-display-timer]', {
        providerEventId,
        countdownTarget: target,
        now: new Date().toISOString(),
        secondsRemaining: seconds,
      });
      setDisplayCountdown(mmss);
      setCountdownSeconds(seconds);
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    display.activeEndAt,
    display.activeNextRefreshAt,
    display.activeProviderEventId,
    display.providerEventId,
  ]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (!display.lastUpdatedAt) return;

      const lastUpdatedAt = toDate(display.lastUpdatedAt);
      if (!lastUpdatedAt) return;

      if (Date.now() - lastUpdatedAt.getTime() >= STALE_AFTER_MS) {
        setDisplay((currentDisplay) => {
          const cachedEvents = Array.isArray(currentDisplay.events) ? currentDisplay.events : [];

          if (cachedEvents.length > 0) {
            logDisplayFeedUpdate('local-stale-check', 'preserve-visible-cached-events', {
              providerEventId: currentDisplay.providerEventId ?? currentDisplay.activeProviderEventId ?? '',
              isStale: currentDisplay.isStale,
              eventCount: cachedEvents.length,
              lastUpdatedAt: currentDisplay.lastUpdatedAt ?? '',
            });
            return currentDisplay;
          }

          logDisplayFeedUpdate('local-stale-check', 'mark-stale-no-cache', {
            providerEventId: currentDisplay.providerEventId ?? currentDisplay.activeProviderEventId ?? '',
            isStale: true,
            eventCount: 0,
            lastUpdatedAt: currentDisplay.lastUpdatedAt ?? '',
          });

          return {
            ...currentDisplay,
            isStale: true,
          };
        });
      }
    }, STALE_CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [display.lastUpdatedAt, logDisplayFeedUpdate]);

  useEffect(() => {
    if (!selectedLeagueId || !selectedLeagueProvider) return undefined;

    let cancelled = false;
    let requestInFlight = false;
    const hydrateDisplayFromRest = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      const requestSequence = ++displayRequestSequenceRef.current;
      try {
        const payload = await getDisplay(selectedLeagueProvider, selectedLeagueId);
        if (cancelled || requestSequence !== displayRequestSequenceRef.current) return;

        const nextEvents = applyDisplayPayload(payload, 'rest-fallback');
        if (nextEvents.length > 0) upsertLeagueFromDisplayPayload(payload);
        setError('');
      } catch (err) {
        if (!cancelled) console.error('Virtual-Api fallback display hydrate error:', err);
      } finally {
        requestInFlight = false;
      }
    };

    const intervalId = window.setInterval(hydrateDisplayFromRest, REST_FALLBACK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    applyDisplayPayload,
    selectedLeagueId,
    selectedLeagueProvider,
    upsertLeagueFromDisplayPayload,
  ]);

  const totalOdds = useMemo(
    () => slip.reduce((total, pick) => total * Number(pick.odd), 1),
    [slip]
  );
  const possibleWin = slip.length > 0 ? stake * totalOdds : 0;
  const displayMeta = {
    ...display,
    lastUpdateTime: toDate(display.lastUpdatedAt),
    eventCount: display.events.length,
  };
  const timerTargetDate = toDate(display.activeNextRefreshAt || display.activeEndAt);
  const countdownTargetLabel = timerTargetDate ? formatClockTime(timerTargetDate) : '--:--';
  const [leagueTitleTop, leagueTitleBottom] = splitLeagueTitle(display.leagueName || getLeagueName(selectedLeague));
  const isLoading = loadingLeagues || loadingDisplay;
  const events = useMemo(
    () => getUniqueDisplayEvents(display.events, 10),
    [display.events]
  );
  const marketTabs = useMemo(() => buildMarketTabs(events), [events]);
  const activeMarket = marketTabs.find(({code}) => code === activeMarketCode) ?? marketTabs[0] ?? null;

  useEffect(() => {
    if (marketTabs.length === 0 || marketTabs.some(({code}) => code === activeMarketCode)) return;
    setActiveMarketCode(marketTabs[0].code);
  }, [activeMarketCode, marketTabs]);
  const updateAgeMs = displayMeta.lastUpdateTime
    ? currentTime - displayMeta.lastUpdateTime.getTime()
    : null;
  const hasDisplayEvents = events.length > 0;
  const hasLiveUpdate = updateAgeMs !== null && updateAgeMs >= 0 && updateAgeMs < LIVE_AFTER_MS;
  const hasCountdownRolledOver = !!timerTargetDate && timerTargetDate.getTime() <= currentTime;
  const isStale = !hasDisplayEvents && (!!display.isStale || updateAgeMs === null || updateAgeMs >= STALE_AFTER_MS);
  const isSyncing = !isStale && !hasLiveUpdate && hasCountdownRolledOver;
  const isOffline = isStale || !hasDisplayEvents;
  const eventCount = events.length;
  const isBettingClosed = (
    countdownSeconds !== null && countdownSeconds <= 0
  ) || display.isStale === true || eventCount === 0;
  const isBettingClosedRef = useRef(isBettingClosed);
  const stakeInputRef = useRef(null);
  isBettingClosedRef.current = isBettingClosed;
  const liveStatusLabel = isStale ? 'STALE' : isSyncing ? 'SYNCING' : 'LIVE';

  useEffect(() => {
    if (!isBettingClosed) return;

    setSlip([]);
    setTicketStatus(null);
  }, [isBettingClosed]);

  const addToSlip = (match, matchIndex, selection) => {
    const {odd} = selection;
    if (isBettingClosed || odd === '-') return;

    const matchId = match.matchId ?? match.betServiceMatchNo ?? match.BetServiceMatchNo ?? match.id;
    const providerMatchId =
      match.providerMatchId ??
      match.providerEventMatchId ??
      match.externalMatchId ??
      match.betServiceMatchNo ??
      match.shortCode ??
      match.id ??
      '';

    const pick = {
      id: `${match.home}-${match.away}`,
      match: `${match.home} vs ${match.away}`,
      providerMatchId,
      matchId,
      matchOddId: selection.matchOddId ?? match.matchOddId ?? match.MatchOddId ?? null,
      homeTeam: match.homeTeam ?? match.home ?? '',
      awayTeam: match.awayTeam ?? match.away ?? '',
      market: selection.marketCode,
      option: selection.label,
      line: selection.line ?? null,
      odd,
      selectionKey: selection.key,
      shortCode: match.shortCode ?? '',
      number: matchIndex + 1,
    };

    setSlip((currentSlip) => {
      const otherPicks = currentSlip.filter((item) => item.id !== pick.id);
      return [...otherPicks, pick];
    });
    setTicketStatus(null);
  };

  const removeFromSlip = (id) => {
    setSlip((currentSlip) => currentSlip.filter((item) => item.id !== id));
    setTicketStatus(null);
  };

  const selectedPickFor = (match, selectionKey) =>
    slip.some((pick) => pick.id === `${match.home}-${match.away}` && pick.selectionKey === selectionKey);

  const buildTicketPayload = () => buildVirtualTicketPayload({display, slip, stake});

  const resetPlacedTicketSlip = () => {
    setSlip([]);
    setStake(DEFAULT_STAKE);
  };

  const printPlacedTicketReceipt = async (ticket = placedTicket, {manual = false} = {}) => {
    if (!ticket) return false;
    const key = String(ticket.placed?.receiptId ?? ticket.placed?.serial ?? '');
    if (!manual && (!key || autoPrintedTicketKeysRef.current.has(key))) return false;

    try {
      const details = await getVirtualTicketDetails(ticket.placed.receiptId);
      const printPayload = normalizeVirtualReceipt({...ticket, details, terminal});
      if (process.env.NODE_ENV === 'development') console.log('print payload', printPayload);
      const printed = printVirtualReceipt(printPayload);
      if (!printed) throw new Error('Receipt printer could not be opened.');
      if (!manual) autoPrintedTicketKeysRef.current.add(key);
      setPlacedTicket(null);
      setPrintError('');
      setTicketStatus({type: 'success', message: `Ticket ${printPayload.ticketNumber} placed / printing...`});
      return true;
    } catch (error) {
      console.error('Virtual ticket print error:', error);
      setPlacedTicket(ticket);
      setPrintError('Ticket was placed, but printing failed. Reprint will not place the bet again.');
      setTicketStatus({type: 'error', message: 'Ticket placed; receipt printing failed.'});
      return false;
    }
  };

  const submitTicket = async () => {
    if (isBettingClosedRef.current) {
      setTicketStatus({type: 'error', message: BETTING_CLOSED_MESSAGE});
      return;
    }

    const payload = buildTicketPayload();
    const submittedSlip = slip.map((selection) => ({...selection}));
    const submittedStake = Number(stake);
    const submittedTotalOdds = totalOdds;
    const submittedPossibleWin = possibleWin;
    setTicketSubmitting(true);
    setTicketStatus(null);
    setPlacedTicket(null);
    setPrintError('');

    try {
      const validation = await validateVirtualTicket(payload, {
        isBettingClosed: isBettingClosedRef.current,
      });

      if (!validation.isValid) {
        console.log(validation);
        setTicketStatus({type: 'error', message: 'Ticket validation failed'});
        return;
      }

      if (isBettingClosedRef.current) {
        setTicketStatus({type: 'error', message: BETTING_CLOSED_MESSAGE});
        return;
      }

      const placed = await placeVirtualTicket(payload, {
        isBettingClosed: isBettingClosedRef.current,
      });

      if (!placed.isPlaced && !placed.receiptId) {
        console.log(placed);
        setTicketStatus({type: 'error', message: 'Ticket placement failed'});
        return;
      }

      const receiptId = placed.receiptId ?? '';
      const ticketForPrinting = {
        placed,
        shopDisplayName: placed.shopDisplayName,
        selections: submittedSlip,
        stake: submittedStake,
        totalOdds: submittedTotalOdds,
        possibleWin: submittedPossibleWin,
        shopCode: payload.shopCode,
      };
      // Placement is complete at this point. Clear immediately so a print error can never
      // leave the submitted slip available for an accidental second placement.
      resetPlacedTicketSlip();
      setTicketStatus({type: 'success', message: `Ticket ${receiptId} placed / preparing receipt...`});
      await printPlacedTicketReceipt(ticketForPrinting);
    } catch (err) {
      console.error('Virtual ticket submit error:', err);
      setTicketStatus({
        type: 'error',
        message: err.message === BETTING_CLOSED_MESSAGE ? BETTING_CLOSED_MESSAGE : 'Ticket placement failed',
      });
    } finally {
      setTicketSubmitting(false);
    }
  };

  const clearBetSlip = () => {
    if (ticketSubmitting) return {ok: false, message: 'Ticket submission is in progress'};
    if (slip.length === 0) return {ok: false, message: 'Bet slip is already empty'};
    setSlip([]);
    setStake(DEFAULT_STAKE);
    setTicketStatus(null);
    return {ok: true, message: 'Bet slip cleared'};
  };

  const executeKeyboardShortcut = (value) => {
    const parsed = parseVirtualShortcut(value);
    const resolved = resolveVirtualShortcut(parsed, events, {bettingClosed: isBettingClosed});
    if (!resolved.ok) return resolved;

    addToSlip(resolved.event, parsed.matchIndex, resolved.selection);
    return {
      ok: true,
      message: `${resolved.event.home} vs ${resolved.event.away}: ${resolved.selection.label} added`,
      highlightKey: `${resolved.event.displayKey}-${resolved.selection.key}`,
    };
  };

  const switchMarketTab = (direction) => {
    const availableTabs = marketTabs.filter(({disabled}) => !disabled);
    if (availableTabs.length < 2) return;
    const currentIndex = availableTabs.findIndex(({code}) => code === activeMarket?.code);
    const nextIndex = (Math.max(0, currentIndex) + direction + availableTabs.length) % availableTabs.length;
    setActiveMarketCode(availableTabs[nextIndex].code);
  };

  const keyboard = useVirtualKeyboardShortcuts({
    disabled: payoutOpen || cancelTicketOpen || Boolean(moreMarketsMatch) || Boolean(placedTicket),
    onClearSlip: clearBetSlip,
    onExecute: executeKeyboardShortcut,
    onFocusStake: () => {
      if (!stakeInputRef.current) return {ok: false, message: 'Add a selection before entering a stake'};
      if (isBettingClosed) return {ok: false, message: BETTING_CLOSED_MESSAGE};
      stakeInputRef.current.focus();
      stakeInputRef.current.select();
      return {ok: true, message: 'Stake input focused'};
    },
    onOpenPayout: () => {
      if (ticketSubmitting) return {ok: false, message: 'Ticket submission is in progress'};
      setPayoutOpen(true);
      return {ok: true, message: 'Payout opened'};
    },
    onOpenResults,
    onOpenSearch: () => {
      if (ticketSubmitting) return {ok: false, message: 'Ticket submission is in progress'};
      setPayoutOpen(true);
      return {ok: true, message: 'Ticket search opened'};
    },
    onPrint: () => {
      if (isBettingClosed) return {ok: false, message: BETTING_CLOSED_MESSAGE};
      if (ticketSubmitting) return {ok: false, message: 'Ticket submission is in progress'};
      if (slip.length === 0) return {ok: false, message: 'Add a selection before printing'};
      if (Number(stake) <= 0) return {ok: false, message: 'Enter a valid stake before printing'};
      submitTicket();
      return {ok: true, message: 'Ticket submission started'};
    },
    onSwitchMarket: switchMarketTab,
  });

  return (
    <main className={`betting-board table-theme-${tableTheme}`}>
      <style>{styles}</style>
      <div className="socket-debug-badge">
        <div>Socket: <strong>{socketDebug.connected ? 'connected' : 'disconnected'}</strong></div>
        <div>Last socket event: <strong>{socketDebug.lastEvent || '-'}</strong></div>
        <div>Last providerEventId: <strong>{socketDebug.providerEventId || '-'}</strong></div>
        <div>Event count: <strong>{socketDebug.eventCount}</strong></div>
      </div>

      <section className="terminal-topbar">
        <div className="header-brand">
          <img alt="VPLAY" src={`${process.env.PUBLIC_URL}/vplay-logo.png`} />
        </div>
        <nav className="competition-tabs" aria-label="Competitions">
          {leagues.map((league) => (
            <button
              className={`competition-tab${selectedLeague?.id === league.id ? ' active' : ''}`}
              disabled={loadingDisplay}
              key={league.id}
              onClick={() => setSelectedLeague(league)}
              type="button"
            >
              <FaTrophy />
              <span>{getLeagueName(league)}</span>
            </button>
          ))}
          <FaChevronDown className="topbar-chevron" />
        </nav>

        <TerminalHeaderActions
          currentTime={currentTime}
          onLogout={onLogout}
          onOpenResults={onOpenResults}
          onOpenTickets={onOpenTickets}
          tableTheme={tableTheme}
          terminal={terminal}
          toggleTableTheme={toggleTableTheme}
        />
      </section>

      <section className="terminal-body">
        <div className="odds-area">
          <div className="jackpot-row">
            <div className="week-ribbon">{isOffline ? 'OFFLINE' : getWeekCode(displayMeta)}</div>
            <div className="jackpot">
              <span className="jackpot-label">GOLD<br />JACKPOT</span>
              <span className="jackpot-amount">9,400 USh</span>
            </div>
            <div className="jackpot secondary">
              <span className="jackpot-label">BRONZE<br />JACKPOT</span>
              <span className="jackpot-amount">5,007 USh</span>
            </div>
          </div>

          <div className="market-layout">
            <aside className="league-panel">
              <div className="league-brand">
                <div className="lion-mark">L</div>
                <div className="league-title">
                  {isOffline ? (
                    <>Waiting for<br />feed...</>
                  ) : (
                    <>{leagueTitleTop}<br />{leagueTitleBottom}</>
                  )}
                </div>
                <div className="league-code">{getLeagueCode(selectedLeague, displayMeta)}</div>
              </div>
              <div className="timer-column">
                {!isOffline && (
                  <div className="timer-dial">
                    <div>
                      <div className="timer-time">{displayCountdown}</div>
                      <div className="timer-sub">{countdownTargetLabel}</div>
                    </div>
                  </div>
                )}
                <div
                  className="live-status"
                  title={displayMeta.lastBatchId ? `Batch: ${displayMeta.lastBatchId}` : undefined}
                >
                  <span className="live-status-dot">{liveStatusLabel}</span> • Updated {formatClockTime(displayMeta.lastUpdateTime)} • Events: {displayMeta.eventCount}
                </div>
              </div>
            </aside>

            {!isOffline && (
            <div
              className="markets"
              style={{
                '--market-tab-count': marketTabs.length || 1,
                '--market-selection-count': activeMarket?.selections.length || 1,
              }}
            >
              <div className="market-tabs">
                {marketTabs.map((market) => (
                  <button
                    aria-pressed={market.code === activeMarket?.code}
                    className={`market-tab${market.code === activeMarket?.code ? ' active' : ''}`}
                    disabled={market.disabled}
                    key={market.code}
                    onClick={() => setActiveMarketCode(market.code)}
                    title={market.title}
                    type="button"
                  >
                    {market.title}
                  </button>
                ))}
              </div>

              <div className="market-labels">
                {activeMarket?.selections.map(({key, label}) => (
                  <span className="market-label" key={key}>{getVisualMarketLabel(activeMarket.code, label)}</span>
                ))}
              </div>
            </div>
            )}
          </div>

          <div className="match-list" key={display.providerEventId ?? 'no-provider-event'}>
            {isLoading && <div className="match-state">Loading virtual events...</div>}
            {!isLoading && error && <div className="match-state error">{error}</div>}
            {!isLoading && !error && !isOffline && leagues.length === 0 && (
              <div className="match-state">No leagues available</div>
            )}
            {!isLoading && !error && isOffline && (
              <div className="offline-state">
                <div className="offline-card">
                  <em>OFFLINE MODE ACTIVE</em>
                  <strong>Virtual feed offline</strong>
                  <span>Waiting for live data from provider.</span>
                </div>
              </div>
            )}
            {!isLoading && !error && !isOffline && leagues.length > 0 && events.length === 0 && (
              <div className="match-state">No virtual events loaded</div>
            )}
            {!isLoading && !error && !isOffline && events.map((match, index) => {
              const displaySelections = getDisplaySelections(match, activeMarket);

              return (
                <div className="match-row" key={match.displayKey}>
                  <span className="match-number">{index + 1}</span>
                  <Crest code={match.home} color={getCrestColor(match.home)} />
                  <span className="team-code">{match.home}</span>
                  <span className="versus">vs</span>
                  <span className="team-code">{match.away}</span>
                  <Crest code={match.away} color={getCrestColor(match.away)} />
                  <button
                    aria-label={`More markets for ${match.home} vs ${match.away}`}
                    className="row-details-button"
                    onClick={() => setMoreMarketsMatch(match)}
                    type="button"
                  >
                    <FaChevronRight className="row-arrow" />
                  </button>
                  <div
                    className="odds-grid"
                    style={{'--market-selection-count': activeMarket?.selections.length || 1}}
                  >
                    {displaySelections.map((selection) => (
                      <button
                        className={`odd-button${selectedPickFor(match, selection.key) ? ' selected' : ''}${keyboard.highlightKey === `${match.displayKey}-${selection.key}` ? ' keyboard-highlight' : ''}`}
                        disabled={isBettingClosed || selection.odd === '-'}
                        key={`${match.displayKey}-${selection.key}`}
                        onClick={() => addToSlip(match, index, selection)}
                        type="button"
                      >
                        {selection.odd}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
              </div>
        </div>

        <aside className={`bet-slip${isBettingClosed ? ' disabled' : ''}`}>
          <div className="fastbet-input">
            <span className="input-caret" />
            <span className="fastbet-label">FASTBET</span>
          </div>
          {isBettingClosed && (
            <div className="betting-closed-message" role="status">
              {BETTING_CLOSED_MESSAGE}
            </div>
          )}
          {ticketStatus && (
            <div className={`ticket-status ${ticketStatus.type}`}>
              {ticketStatus.message}
            </div>
          )}
          {slip.length === 0 ? (
            <div className="empty-slip">
              <div>
                <div className="empty-slip-icon">
                  <span />
                </div>
                <div>Please pick up a bet to start</div>
              </div>
            </div>
          ) : (
            <div className="receipt">
              <div className="receipt-header">
                <FaReceipt />
                <span>BET RECEIPT</span>
              </div>
              <div className="receipt-list">
                {slip.map((pick) => (
                  <div className="receipt-item" key={pick.id}>
                    <div>
                      <div className="receipt-match">{pick.number}. {pick.match}</div>
                      <div className="receipt-market">Pick: {pick.option} ({pick.market})</div>
                      <div className="receipt-odd">
                        <span>Odd</span>
                        <strong>{pick.odd}</strong>
                      </div>
                    </div>
                    <button
                      className="remove-pick"
                      onClick={() => removeFromSlip(pick.id)}
                      title="Remove pick"
                      type="button"
                    >
                      <FaTrash />
                    </button>
                  </div>
                ))}
              </div>
              <div className="receipt-summary">
                <label className="stake-label" htmlFor="stake">Stake</label>
                <input
                  className="stake-input"
                  disabled={isBettingClosed}
                  id="stake"
                  min="0"
                  onChange={(event) => setStake(Number(event.target.value))}
                  ref={stakeInputRef}
                  type="number"
                  value={stake}
                />
                <div className="receipt-total-row">
                  <span>Total Odds</span>
                  <strong>{totalOdds.toFixed(2)}</strong>
                </div>
                <div className="receipt-total-row">
                  <span>Picks</span>
                  <strong>{slip.length}</strong>
                </div>
                <div className="receipt-win">
                  <span>POSSIBLE WIN</span>
                  <strong>{formatMoney(possibleWin)}</strong>
                </div>
              </div>
            </div>
          )}
        </aside>
      </section>
      <footer className="virtual-display-footer">
        <div className="footer-meta">
          <span>© Virtual Horizon</span>
          <span>Virtual Display V{process.env.REACT_APP_DISPLAY_VERSION || '1.0.0'}</span>
          <span title={`Full build SHA: ${BUILD_SHA}`}>Build {shortBuildSha()}</span>
          <span><span className="secure-dot">●</span> Secure connection &nbsp; {formatClockTime(new Date(currentTime))}</span>
        </div>
        <div className="display-action-dock" aria-label="Display actions">
          <button
            aria-label="Clear bet slip"
            className="dock-action clear"
            disabled={ticketSubmitting || slip.length === 0}
            onClick={clearBetSlip}
            title="Clear bet slip"
            type="button"
          >
            <FaTrash aria-hidden="true" /><span>CLEAR</span>
          </button>
          <button className="dock-action search" disabled={ticketSubmitting} onClick={() => setPayoutOpen(true)} type="button">
            <FaSearch /><span>SEARCH</span>
          </button>
          <button className="dock-action payout" disabled={ticketSubmitting} onClick={() => setPayoutOpen(true)} type="button">
            <FaMoneyBillWave /><span>PAYOUT</span>
          </button>
          <button
            aria-label={ticketSubmitting ? 'Placing bet' : 'Print ticket'}
            className={`dock-action print${slip.length > 0 ? ' has-selections' : ''}`}
            disabled={isBettingClosed || ticketSubmitting || slip.length === 0 || Number(stake) <= 0}
            onClick={submitTicket}
            title={ticketSubmitting ? 'Placing bet' : 'Print ticket'}
            type="button"
          >
            {ticketSubmitting ? <span className="receipt-action-loading">…</span> : <FaPrint aria-hidden="true" />}
            <span>PRINT</span>
          </button>
        </div>
      </footer>
      {(keyboard.shortcut || keyboard.feedback) && (
        <div className="keyboard-shortcut-overlay" role="status" aria-live="polite">
          Shortcut: <strong>{keyboard.shortcut || '—'}</strong>
          {keyboard.feedback && (
            <span className={`keyboard-shortcut-feedback ${keyboard.feedback.type}`}>
              {keyboard.feedback.message}
            </span>
          )}
        </div>
      )}
      {moreMarketsMatch && (
        <div className="more-markets-backdrop" role="dialog" aria-modal="true" aria-labelledby="more-markets-title">
          <section className="more-markets-dialog">
            <header className="more-markets-header">
              <strong id="more-markets-title">{moreMarketsMatch.home} vs {moreMarketsMatch.away}</strong>
              <button
                aria-label="Close more markets"
                className="more-markets-close"
                onClick={() => setMoreMarketsMatch(null)}
                type="button"
              >
                ×
              </button>
            </header>
            {moreMarketsMatch.marketPages
              .filter(({code}) => !['1X2', 'DC', 'BTS', 'OU', 'HOME_OU', 'AWAY_OU', '1X2_OU_1.5', '1X2_OU_2.5'].includes(code))
              .map((market) => (
                <div className="more-market-section" key={`${market.code}-${market.line ?? ''}`}>
                  <h3>{market.name}</h3>
                  <div className="more-market-selections">
                    {market.selections.map((selection) => (
                      <span className="more-market-selection" key={selection.key}>
                        <span>{selection.label}</span>
                        <strong>{formatOdd(selection.odd)}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </section>
        </div>
      )}
      <TicketCancelModal
        initialTicketNumber={cancelTicketNumber}
        open={cancelTicketOpen}
        onClose={() => setCancelTicketOpen(false)}
      />
      <TicketPayoutModal
        open={payoutOpen}
        onCancelTicket={(ticketNumber) => {
          setPayoutOpen(false);
          setCancelTicketNumber(ticketNumber);
          setCancelTicketOpen(true);
        }}
        onClose={() => setPayoutOpen(false)}
      />

      {placedTicket && printError && (
        <div className="ticket-print-failure" role="alert">
          <span>{printError}</span>
          <button onClick={() => printPlacedTicketReceipt(placedTicket, {manual: true})} type="button">REPRINT</button>
        </div>
      )}
    </main>
  );
};

export default Grid;
