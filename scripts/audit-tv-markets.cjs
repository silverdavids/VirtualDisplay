const fs=require('node:fs');
const capture=require('../src/tv/fixtures/real-feed.json');
const expected={
  '1X2':['1','X','2'],DC:['1X','12','X2'],BTS:['GG','NG'],OU:['OVER_2.5','UNDER_2.5'],
  TEAM_GOALS_HOME_AWAY:['HOME','AWAY'].flatMap(side=>['0.5','1.5','2.5','3.5'].flatMap(line=>['OVER','UNDER'].map(total=>`${total}_${line}_${side}`))),
  OVER_UNDER_1X2:['HOME','DRAW','AWAY'].flatMap(side=>['1.5','2.5'].flatMap(line=>['OVER','UNDER'].map(total=>`${total}_${line}_${side}`))),
};
const report={capturedAt:capture.capturedAt,source:capture.source,leagues:{}};
for(const id of ['21','78']){
  const queue=capture.rest[`${id}-queue`].payload;
  const board=[queue.currentBoard,...queue.nextBoards].find(item=>item.state==='UPCOMING'&&item.BettingOpen===true);
  report.leagues[id]={providerEventId:board.providerEventId,weekNumber:board.weekNumber,
    marketIds:[...new Set(board.events.flatMap(event=>event.markets.map(market=>market.code)))],
    missingOutcomes:board.events.flatMap(event=>Object.entries(expected).flatMap(([code,names])=>{
      const selections=event.markets.find(market=>market.code===code)?.selections || [];
      return names.filter(name=>!selections.some(selection=>(selection.name===name||selection.providerName===name)&&Number(selection.odd)>0))
        .map(name=>({providerMatchId:event.providerMatchId,fixture:`${event.homeTeam} vs ${event.awayTeam}`,marketId:code,outcome:name}));
    }))};
}
fs.writeFileSync('docs/tv-market-gaps.json',JSON.stringify(report,null,2));
console.log(Object.entries(report.leagues).map(([id,data])=>({id,week:data.weekNumber,missingOutcomes:data.missingOutcomes.length})));
