import {MARKET_1X2, MARKET_1X2_H1, MARKET_NEXTGOAL, MARKET_OU, MARKET_OU_H1} from "../markets";

export const getAwayGoal = (scores) => {
  if (!scores) return '';
  return scores['GOAL'] ? scores['GOAL'][1] : '';
};

export const getHomeGoal = (scores) => {
  if (!scores) return '';
  return scores['GOAL'] ? scores['GOAL'][0] : '';
};
export const getHalfTimeAwayGoal = (scores) => {
  if (!scores) return '';
  return scores['H1'] ? scores['H1'][1] : '';
};

export const getHalfTimeHomeGoal = (scores) => {
  if (!scores) return '';
  return scores['H1'] ? scores['H1'][0] : '';
};
export const getHomeRedCards = (scores) => {
  if (!scores) return '';
  return scores['RED_CARD'] ? scores['RED_CARD'][0] : '';
};
export const getAwayRedCards = (scores) => {
  if (!scores) return '';
  return scores['RED_CARD'] ? scores['RED_CARD'][1] : '';
};
export const getHomeYellowCards = (scores) => {
  if (!scores) return '';
  return scores['RED_CARD'] ? scores['RED_CARD'][0] : '';
};
export const getAwayYellowCards = (scores) => {
  if (!scores) return '';
  return scores['RED_CARD'] ? scores['RED_CARD'][1] : '';
};


export const getGames = function* (gamesHash) {
  const keys = Object.keys(gamesHash);
  for (const key of keys) {
    yield gamesHash[key];
  }
};

const getIdsSortedByDate = function(gamesHash){
  return Object.keys(gamesHash)
    .map((key) => {
      const { betServiceMatchNo, startTime} = gamesHash[key];
      return {
        id: betServiceMatchNo,
        time: getTime(startTime)
      }
    })
    .sort((a, b) => b.time - a.time)
    .map(({ id }) => id);
}

export const getGamesForPage = function*(gamesHash, page = 1, size = 10) {

  const ids = getIdsSortedByDate(gamesHash);
  const start = --page * size;
  const end = start + size;
  const pageIds = ids.slice(start, end);
  console.log( pageIds );
  for (const id of pageIds)
    yield gamesHash[id];
};

/**
 * Formats time
 * @param {String} timeFragment
 * @returns formatted time
 */
export const getTime = (() => {
  const memo = {};

  return (timeFragment) => {
    if (timeFragment.indexOf('-') > -1)
      return 0;

    const key = timeFragment.substring(0, 5);
    if (key in memo) return memo[key];

    const [hours, minutes] = key.split(':').map(x => Number(x));

    memo[key] = hours * 60 + minutes;
    return memo[key];
  }
})();

// functions to extract odds
export const getFullTimeOddsMatchResult = (odds) => {
  const oddsGroup = odds ? odds.filter(({n}) => n === MARKET_1X2) : [];

  return oddsGroup.length === 0
    ? []
    : oddsGroup[0]['o'].map((x) => ({...x, Odd: x.v}));
};

export const getHalfTimeOddsMatchResult = (odds) => {
  const oddsGroup = odds
    ? odds.filter(({n}) => n === MARKET_1X2_H1)
    : [];

  return oddsGroup.length === 0
    ? []
    : oddsGroup[0]['o'].map((x) => ({...x, Odd: x.v}));
};

const sortFunction = (a, b) => (a.h > b.h ? 1 : -1);

export const getFullTimeOddsUnderOver = (odds) => {
  const oddsGroup = odds
    ? odds.filter(({n, h}) => n === MARKET_OU && h > 1.2).sort(sortFunction)
    : [];

  const line = oddsGroup.length === 0 ? 0 : oddsGroup[0]['h'];
  const wireOdds =
    oddsGroup.length === 0
      ? []
      : oddsGroup[0]['o'].map((x) => ({...x, Odd: x.v})).reverse();

  return {line, wireOdds};
};

export const getHalfTimeOddsUnderOver = (odds) => {
  const oddsGroup = odds
    ? odds.filter(({n}) => n === MARKET_OU_H1).sort(sortFunction)
    : [];

  const line = oddsGroup.length === 0 ? 0 : oddsGroup[0]['h'];
  const wireOdds =
    oddsGroup.length === 0
      ? []
      : oddsGroup[0]['o'].map((x) => ({...x, Odd: x.v})).reverse();

  return {line, wireOdds};
};

export const getGoalGoalOdds = (odds,market) => {
  const oddsBTSGroup = odds ? odds.filter(({n}) => n === market) : [];

  return oddsBTSGroup.length === 0
    ? []
    : oddsBTSGroup[0]['o'].map((x) => ({...x, Odd: x.v}));
}

export const getNextGoalOdds = (odds, totalGoals) => {
  const nextGOAL = MARKET_NEXTGOAL(totalGoals + 1);

  const oddsNextGoalGroup = odds ? odds.filter(({n}) => n === nextGOAL) : [];
  return oddsNextGoalGroup.length === 0
    ? []
    : oddsNextGoalGroup[0]['o'].map((x) => ({...x, Odd: x.v}));
};
export const getNextGoalOptionOdd = (option, odds) => {
var selectedOddIndex= odds.findIndex(({n}) => n === option)
return odds[selectedOddIndex];
}
