// Raw queue contract from Virtual-Api/providerQueueImportService and
// virtual-scraper/mapFeedMarket, before /display expands provider groups.
export const providerMarkets = (odd = 2) => [
  {code: '1X2', name: 'WINNER', selections: [{name:'1', odd}, {name:'X', odd}, {name:'2', odd}]},
  {code: 'DC', name: 'DOUBLE_CHANCE', selections: [{name:'1X', odd}]},
  {code: 'BTS', name: 'GOAL_NO_GOAL', selections: [{name:'GG', odd}]},
  {code: 'OU', name: 'OVER_UNDER', selections: [
    {name:'OV 2.5', odd}, {name:'UNDER_2.5', odd}, {name:'OVER_1.5', odd}, {name:'UNDER_1.5', odd},
  ]},
  {code: 'TEAM_GOALS_HOME_AWAY', selections: ['HOME','AWAY'].flatMap(side =>
    ['0.5','1.5'].flatMap(line => ['OVER','UNDER'].map(direction => ({
      name:`${direction}_${line}_${side}`, odd, matchOddId:`team-${side}-${line}-${direction}`,
    }))))},
  {code: 'OVER_UNDER_1X2', selections: ['1.5','2.5'].flatMap(line =>
    ['HOME','DRAW','AWAY'].flatMap(side => ['OVER','UNDER'].map(direction => ({
      name:`${direction}_${line}_${side}`, odd, matchOddId:`result-${side}-${line}-${direction}`,
    }))))},
];
