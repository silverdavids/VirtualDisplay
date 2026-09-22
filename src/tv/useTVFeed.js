import {useEffect,useState} from 'react';
import connectSocket from '../socketio.service';
import {buildApiUrl,VIRTUAL_API_BASE_URL} from '../config/runtimeConfig';
import {getTerminalAuthHeaders} from '../auth/terminalAuth';
import {applyTVPayload,emptyFeed,visibleFeed} from './tvData';

export const requestTVFeed = async (id,kind,signal) => {
  const path = kind === 'queue' ? `/api/virtual/display/queue?provider=VirtualHorizon&leagueId=${id}` : `/api/virtual/results/latest?leagueId=${id}`;
  const response = await fetch(buildApiUrl(VIRTUAL_API_BASE_URL,path), {cache:'no-store',signal,headers:getTerminalAuthHeaders()});
  if (!response.ok) throw new Error(`TV feed unavailable (${response.status})`);
  return response.json();
};

export default function useTVFeed(id) {
  const [cache,setCache] = useState({});
  const [connected,setConnected] = useState(false);
  const [now,setNow] = useState(Date.now);
  useEffect(() => {
    let disposed = false;
    const revisions = {queue:0,results:0};
    const pending = new Set();
    const activeKinds = new Set();
    const apply = (kind,payload) => {
      if (!disposed) setCache(previous => ({...previous,[id]:applyTVPayload(previous[id] || emptyFeed(),id,kind,payload)}));
    };
    const refresh = () => ['queue','results'].forEach(async kind => {
      if (activeKinds.has(kind)) return;
      activeKinds.add(kind);
      const revision = revisions[kind];
      const controller = new AbortController();
      pending.add(controller);
      const timeout = setTimeout(()=>controller.abort(),10000);
      try {
        const payload = await requestTVFeed(id,kind,controller.signal);
        if (revision === revisions[kind]) apply(kind,payload);
      } catch { /* Polling retries; freshness limits clear disconnected content. */ }
      finally {clearTimeout(timeout);pending.delete(controller);activeKinds.delete(kind);}
    });
    const socket = connectSocket();
    const onConnect = () => {setConnected(true);refresh();};
    const onDisconnect = () => setConnected(false);
    const onAny = (event,payload) => {
      const kind = {'virtual-events-queue-updated':'queue','virtual-display-updated':'display',resultsUpdated:'results'}[event];
      if (!kind) return;
      const board = payload?.currentBoard ?? payload?.latestResult ?? payload?.result ?? payload?.data ?? payload;
      if (String(board?.leagueId ?? board?.providerLeagueId ?? payload?.leagueId) !== id) return;
      revisions[kind === 'display' ? 'queue' : kind]++;
      apply(kind,payload);
    };
    socket.on('connect',onConnect);socket.on('disconnect',onDisconnect);socket.on('connect_error',onDisconnect);
    socket.io.on('reconnect',onConnect);socket.onAny(onAny);
    setConnected(Boolean(socket.connected));refresh();
    const poll = setInterval(refresh,4000);
    const clock = setInterval(()=>setNow(Date.now()),1000);
    return () => {
      disposed = true;pending.forEach(controller=>controller.abort());clearInterval(poll);clearInterval(clock);
      socket.off('connect',onConnect);socket.off('disconnect',onDisconnect);socket.off('connect_error',onDisconnect);
      socket.io.off('reconnect',onConnect);socket.offAny(onAny);
    };
  },[id]);
  return {...visibleFeed(cache[id] || emptyFeed(),now),connected,now};
}
