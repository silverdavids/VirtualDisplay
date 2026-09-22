import {act,renderHook} from '@testing-library/react';
import useTVFeed from './useTVFeed';
import capture from './fixtures/real-feed.json';
import connectSocket from '../socketio.service';
jest.mock('../socketio.service',()=>({__esModule:true,default:jest.fn()}));
let socket;
const now=Date.parse(capture.rest['21-queue'].receivedAt);
const flush=()=>act(async()=>{await Promise.resolve();});
beforeEach(()=>{
  jest.useFakeTimers();jest.setSystemTime(now);
  socket={connected:true,on:jest.fn(),off:jest.fn(),onAny:jest.fn(),offAny:jest.fn(),io:{on:jest.fn(),off:jest.fn()}};
  connectSocket.mockReturnValue(socket);
  global.fetch=jest.fn(async url=>{
    const id=new URL(url,'http://localhost').searchParams.get('leagueId');
    return {ok:true,json:async()=>capture.rest[`${id}-${url.includes('/queue')?'queue':'results'}`].payload};
  });
});
afterEach(()=>{jest.useRealTimers();delete global.fetch;});

test('REST works offline, reconnect refreshes, league switching cannot expose another league cache',async()=>{
  socket.connected=false;
  const {result,rerender}=renderHook(({id})=>useTVFeed(id),{initialProps:{id:'21'}});
  await flush();expect(result.current.board.leagueId).toBe('21');expect(result.current.connected).toBe(false);
  rerender({id:'78'});expect(result.current.board).toBeNull();await flush();expect(result.current.board.leagueId).toBe('78');
  const before=fetch.mock.calls.length;
  await act(async()=>socket.io.on.mock.calls.at(-1)[1]());
  expect(fetch.mock.calls.length).toBe(before+2);
  expect(result.current.connected).toBe(true);
});

test('late REST responses cannot replace socket state and expired content clears after failures',async()=>{
  let resolve;
  fetch.mockImplementation(url=>url.includes('/queue') ? new Promise(done=>{resolve=done;}) :
    Promise.resolve({ok:true,json:async()=>capture.rest['21-results'].payload}));
  const {result}=renderHook(()=>useTVFeed('21'));
  const event=capture.sockets.find(item=>item.leagueId==='21'&&item.event==='virtual-events-queue-updated');
  act(()=>socket.onAny.mock.calls.at(-1)[0](event.event,event.payload));
  const board=result.current.board;
  await act(async()=>resolve({ok:true,json:async()=>capture.rest['21-queue'].payload}));
  expect(result.current.board).toBe(board);
  fetch.mockRejectedValue(new Error('offline'));
  await act(async()=>jest.advanceTimersByTime(46000));
  expect(result.current.board).toBeNull();
});

test('initial API failure retries on the next REST poll',async()=>{
  const implementation=fetch.getMockImplementation();fetch.mockRejectedValue(new Error('offline'));
  const {result}=renderHook(()=>useTVFeed('78'));await flush();expect(result.current.board).toBeNull();
  fetch.mockImplementation(implementation);await act(async()=>jest.advanceTimersByTime(4000));
  expect(result.current.board.leagueId).toBe('78');
});
