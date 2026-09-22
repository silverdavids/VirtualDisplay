const fs = require('node:fs');
const path = require('node:path');
const {io} = require('socket.io-client');
const base = process.env.TV_CAPTURE_API || 'http://45.77.54.107:10006';
const directory = path.resolve('src/tv/fixtures');
fs.mkdirSync(directory, {recursive:true});
const capture = process.env.TV_CAPTURE_APPEND && fs.existsSync(path.join(directory,'real-feed.json'))
  ? JSON.parse(fs.readFileSync(path.join(directory,'real-feed.json'),'utf8'))
  : {source:base, capturedAt:new Date().toISOString(), rest:{}, sockets:[]};
const socket = io(base, {transports:['websocket','polling']});
socket.onAny((event, payload) => {
  if (!['virtual-events-queue-updated','virtual-display-updated','resultsUpdated'].includes(event)) return;
  const data = payload?.currentBoard || payload?.latestResult || payload?.result || payload;
  const id = String(data?.leagueId || data?.providerLeagueId || payload?.leagueId || '');
  if (['21','78'].includes(id)) capture.sockets.push({event,leagueId:id,receivedAt:new Date().toISOString(),payload});
});
socket.on('connect_error', e => console.log('Socket:', e.message));
(async () => {
  await Promise.all(['21','78'].flatMap(id => ['queue','results'].map(async kind => {
    const endpoint = kind === 'queue' ? `/api/virtual/display/queue?provider=VirtualHorizon&leagueId=${id}` : `/api/virtual/results/latest?leagueId=${id}`;
    const response = await fetch(base + endpoint, {signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(`${endpoint}: ${response.status}`);
    const payload = await response.json();
    if (!capture.rest[`${id}-${kind}`]) capture.rest[`${id}-${kind}`] = {endpoint,receivedAt:new Date().toISOString(),payload};
  })));
  await new Promise(resolve => setTimeout(resolve, Number(process.env.TV_CAPTURE_SECONDS || 50) * 1000));
  socket.disconnect();
  fs.writeFileSync(path.join(directory,'real-feed.json'), JSON.stringify(capture,null,2));
  console.log(JSON.stringify({capturedAt:capture.capturedAt,rest:Object.keys(capture.rest),sockets:capture.sockets.reduce((out,item)=>{const key=`${item.leagueId}:${item.event}`;out[key]=(out[key]||0)+1;return out;},{})}));
})().catch(e=>{socket.disconnect();console.error(e.message);process.exitCode=1;});
