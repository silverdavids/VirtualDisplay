import {useEffect,useMemo,useState} from 'react';
import useTVFeed from './useTVFeed';
import {TV_LEAGUES,marketRows,oddFor,standardColumns,supportedViews} from './tvData';
import './ShopTV.css';

const TITLES = {standard:'Match odds','correct-score':'Correct Score',totals:'Over / Under',
  'home-totals':'Home goals','away-totals':'Away goals','result-1.5':'Result + goals 1.5','result-2.5':'Result + goals 2.5',
  results:'Live & results',standings:'League standings'};
const CODES = {totals:'OU','home-totals':'HOME_OU','away-totals':'AWAY_OU','result-1.5':'1X2_OU_1.5','result-2.5':'1X2_OU_2.5','correct-score':'CS'};
const timer = seconds => seconds == null ? '--:--' : `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
const fullScreen = () => {try {document.documentElement.requestFullscreen?.().catch(()=>{});} catch { /* Embedded viewers may control fullscreen themselves. */ }};

export function TVSelector({navigate}) {
  const [seconds,setSeconds] = useState(25);
  const [rotate,setRotate] = useState(true);
  return <main className="tv-selector">
    <div className="tv-selector-brand"><img src="/vplay-logo.png" alt="VPlay"/><span>SHOP TV / WEBVIEWER</span></div>
    <h1>Choose your channel</h1><p>Live virtual football. A dedicated, read-only shop display.</p>
    <div className="tv-channel-grid">{Object.entries(TV_LEAGUES).flatMap(([id,name]) => ['standard','correct-score'].map(view =>
      <a key={`${id}-${view}`} href={`/tv/${id}/${view}?rotate=${rotate ? 1 : 0}&seconds=${seconds}`}
        onClick={event=>{event.preventDefault();fullScreen();navigate(event.currentTarget.getAttribute('href'));}}>
        <span className={`tv-channel-mark league-${id}`}>{id === '21' ? 'CH' : 'PL'}</span>
        <span><small>{name}</small><strong>{view === 'standard' ? 'Standard odds' : 'Correct Score'}</strong></span><span aria-hidden="true">↗</span>
      </a>))}</div>
    <div className="tv-selector-settings"><label><input type="checkbox" checked={rotate} onChange={event=>setRotate(event.target.checked)}/> Rotate supported views</label>
      <label>Seconds per view <select value={seconds} onChange={event=>setSeconds(Number(event.target.value))}>{[15,25,40,60,90,120].map(value=><option key={value}>{value}</option>)}</select></label></div>
    <p className="tv-selector-note">Only provider-supplied odds, scores and tables are shown. Channel controls never place bets.</p>
  </main>;
}

function Badge({name,url}) {
  const [failed,setFailed] = useState(false);
  useEffect(()=>setFailed(false),[url]);
  return url && !failed ? <img className="tv-team-logo" src={url} alt={`${name} logo`} onError={()=>setFailed(true)}/> :
    <span className="tv-team-badge" aria-hidden="true">{String(name || '?').slice(0,3)}</span>;
}
function Fixture({row,index}) {
  return <th scope="row"><div className="tv-fixture"><span className="tv-match-number">{String(index+1).padStart(2,'0')}</span>
    <div><span><Badge name={row.home} url={row.homeLogo ?? row.homeTeamLogo}/>{row.home}</span>
      <span><Badge name={row.away} url={row.awayLogo ?? row.awayTeamLogo}/>{row.away}</span></div>
    {(row.homeForm || row.awayForm) && <small className="tv-form">{[row.homeForm,row.awayForm].map(form=>Array.isArray(form) ? form.join(' ') : form).join(' / ')}</small>}
  </div></th>;
}
function OddsTable({board,view}) {
  const rows = marketRows(board);
  const code = CODES[view];
  const labels = [...new Set(rows.flatMap(row => row.marketsNormalized.filter(market=>market.code === code)
    .flatMap(market=>market.selections.map(selection=>selection.label))))];
  const scoreGroup = label => {const [home,away] = label.split('-').map(Number);return home > away ? 0 : home === away ? 1 : 2;};
  if (view === 'correct-score') labels.sort((a,b)=>scoreGroup(a)-scoreGroup(b) || Number(a.split('-')[0])-Number(b.split('-')[0]) || Number(a.split('-')[1])-Number(b.split('-')[1]));
  const columns = view === 'standard' ? standardColumns : labels.map(label=>[code,label,label.replace(/^(OV|UN)/,'$1 ')]);
  return <table className={`tv-odds-table ${view === 'correct-score' ? 'tv-correct-score' : ''}`} aria-label={TITLES[view]}>
    <thead>{view === 'standard' && <tr className="tv-groups"><th rowSpan="2">FIXTURES</th><th colSpan="3">WINNER</th><th colSpan="3">DOUBLE CHANCE</th><th colSpan="2">GOAL / NO GOAL</th><th colSpan="2">TOTAL GOALS</th></tr>}
      {view === 'correct-score' && <tr className="tv-groups"><th rowSpan="2">FIXTURES</th>{['HOME WINS','DRAWS','AWAY WINS'].map((group,index)=> {
        const count = labels.filter(label=>scoreGroup(label) === index).length;
        return count ? <th key={group} colSpan={count}>{group}</th> : null;
      })}</tr>}
      <tr>{!['standard','correct-score'].includes(view) && <th>FIXTURES</th>}{columns.map(([market,label,title])=><th key={`${market}:${label}`} scope="col">{title}</th>)}</tr></thead>
    <tbody>{rows.map((row,index)=><tr key={row.providerMatchId ?? index}><Fixture row={row} index={index}/>{columns.map(([market,label])=>
      <td key={`${market}:${label}`} className={oddFor(row,market,label) == null ? 'tv-missing-odd' : ''}>{view === 'correct-score' && oddFor(row,market,label) >= 100
        ? String(oddFor(row,market,label)) : oddFor(row,market,label)?.toFixed(2) ?? '—'}</td>)}</tr>)}</tbody>
  </table>;
}
function Standings({rows}) {
  return <aside className="tv-standings"><h2>EPL standings</h2><table aria-label="EPL standings"><thead><tr>{['#','Team','P','GD','Pts'].map(label=><th key={label}>{label}</th>)}</tr></thead>
    <tbody>{rows.map((row,index)=><tr key={row.teamName || row.team}><td>{row.position ?? index+1}</td><th>{row.teamName || row.team}</th><td>{row.played ?? '—'}</td><td>{row.goalDifference ?? '—'}</td><td>{row.points}</td></tr>)}</tbody></table></aside>;
}
function Scoreboard({board,live}) {
  return <table className="tv-scoreboard" aria-label={live ? 'Live scores' : 'Completed results'}><thead><tr><th>HOME</th><th>{live ? 'LIVE' : 'FULL TIME'}</th><th>AWAY</th><th>PROGRESS</th></tr></thead>
    <tbody>{(board?.matches ?? board?.events ?? []).slice(0,10).map((match,index)=><tr key={match.providerMatchId ?? index}>
      <th>{match.home ?? match.homeTeam}</th><td>{match.homeScore ?? '—'} : {match.awayScore ?? '—'}</td><th>{match.away ?? match.awayTeam}</th>
      <td>{live ? (match.minute ?? board.minute) != null ? `${match.minute ?? board.minute}′` : 'In progress' : 'FT'}</td></tr>)}</tbody></table>;
}
function Ticker({result,live}) {
  const board = live || result;
  return <footer className="tv-ticker" aria-label="Results ticker"><strong>{live ? 'LIVE SCORES' : 'LATEST RESULTS'}{board && <small>WEEK {board.weekNumber ?? '—'}</small>}</strong>
    <div className="tv-ticker-window">{board ? <div className="tv-ticker-track">{(board.matches ?? board.events ?? []).map((match,index)=><span key={match.providerMatchId ?? index}>
      {match.home ?? match.homeTeam} <b>{match.homeScore ?? '—'} : {match.awayScore ?? '—'}</b> {match.away ?? match.awayTeam}</span>)}</div> : <span>Waiting for verified results</span>}</div></footer>;
}
export function TVChannel({leagueId,initialView,search,navigate}) {
  const feed = useTVFeed(leagueId);
  const [view,setView] = useState(initialView);
  const params = new URLSearchParams(search);
  const rotate = params.get('rotate') !== '0';
  const seconds = Math.max(15,Math.min(120,Number(params.get('seconds')) || 25));
  const views = supportedViews({...feed,standings:leagueId === '78' ? feed.standings : []});
  const viewKey = views.join(',');
  const stableViews = useMemo(()=>viewKey ? viewKey.split(',') : [],[viewKey]);
  useEffect(()=>setView(initialView),[initialView,leagueId]);
  useEffect(()=>{
    if (!rotate || stableViews.length === 0) return;
    const interval = setInterval(()=>setView(current=>stableViews[(stableViews.indexOf(current)+1)%stableViews.length]),seconds*1000);
    return ()=>clearInterval(interval);
  },[stableViews,rotate,seconds,leagueId]);
  const available = views.includes(view);
  const shownBoard = view === 'results' ? (feed.live || feed.result) : feed.board;
  return <main className={`tv-channel tv-league-${leagueId}`} data-testid="tv-channel">
    <header className="tv-header"><div className="tv-identity"><Badge name={TV_LEAGUES[leagueId]} url={feed.leagueLogo}/><div><small>VIRTUAL HORIZON / SHOP TV</small><h1>{TV_LEAGUES[leagueId]}</h1></div></div>
      <div className="tv-heading"><span>{TITLES[view]}</span><strong>WEEK {shownBoard?.weekNumber ?? '—'}</strong></div>
      <div className="tv-countdown"><small>NEXT KICK-OFF</small><strong>{timer(feed.countdown)}</strong></div>
      <div className="tv-actions"><button onClick={fullScreen} aria-label="Enter fullscreen">⛶</button><button onClick={()=>navigate('/tv')}>Channels</button></div></header>
    <div className="tv-status"><span><i className={feed.connected ? 'connected' : ''}/>{feed.connected ? 'Connected' : 'REST fallback / reconnecting'}</span>
      <span>{rotate ? `${seconds}s per view` : 'Fixed channel'} · {views.length} supported views</span><span>READ-ONLY DISPLAY</span></div>
    <section className="tv-content">
      {!available ? <div className="tv-unavailable"><h2>{feed.board ? `${TITLES[view]} unavailable` : 'Waiting for the next virtual event'}</h2><p>{feed.board ? 'The provider has not supplied usable data for this view.' : 'Fixtures appear automatically when a fresh upcoming week is available.'}</p></div>
        : view === 'results' ? <Scoreboard board={shownBoard} live={Boolean(feed.live)}/>
        : view === 'standings' ? <Standings rows={feed.standings}/>
        : <><OddsTable board={feed.board} view={view}/>{view === 'standard' && leagueId === '78' && feed.standings.length > 0 && <Standings rows={feed.standings}/>}</>}
    </section>
    <div className="tv-view-strip">{views.map(item=><span key={item} className={item === view ? 'active' : ''}>{TITLES[item]}</span>)}<small>— Unavailable or suspended</small></div>
    <Ticker result={feed.result} live={feed.live}/>
  </main>;
}

export default function ShopTV({path,search,navigate}) {
  const match = path.match(/^\/tv\/(21|78)\/(standard|correct-score)\/?$/);
  return match ? <TVChannel key={`${match[1]}-${match[2]}`} leagueId={match[1]} initialView={match[2]} search={search} navigate={navigate}/> : <TVSelector navigate={navigate}/>;
}
