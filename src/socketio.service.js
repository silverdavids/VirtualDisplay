import {io} from 'socket.io-client';
import {virtualGamesStorage} from './rxjs-stores';
import {VIRTUAL_API_BASE} from './services/apiConfig';

const SOCKET_URL = VIRTUAL_API_BASE;
const SOCKET_PATH = '/socket.io';

export const VIRTUAL_DISPLAY_UPDATED_EVENT = 'virtual-display-updated';
export const VIRTUAL_EVENTS_QUEUE_UPDATED_EVENT = 'virtual-events-queue-updated';

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getPayloadUpdatedAt = (payload) => {
  if (!payload || typeof payload !== 'object') return '';

  if (Array.isArray(payload)) {
    return payload.reduce((latest, item) => {
      const itemUpdatedAt = getPayloadUpdatedAt(item);
      const itemDate = toDate(itemUpdatedAt);
      const latestDate = toDate(latest);

      if (!itemDate) return latest;
      if (!latestDate || itemDate.getTime() > latestDate.getTime()) return itemUpdatedAt;
      return latest;
    }, '');
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
    getPayloadUpdatedAt(payload.currentBoard) ||
    getPayloadUpdatedAt(payload.display) ||
    getPayloadUpdatedAt(payload.data) ||
    getPayloadUpdatedAt(payload.events)
  );
};

const getEventSummary = (payload) => {
  if (!payload || typeof payload !== 'object') return String(payload ?? '');

  const currentBoard = payload.currentBoard && typeof payload.currentBoard === 'object'
    ? payload.currentBoard
    : null;
  const events = Array.isArray(currentBoard?.events)
    ? currentBoard.events
    : Array.isArray(payload.events)
      ? payload.events
      : [];
  const nextBoards = Array.isArray(payload.nextBoards)
    ? payload.nextBoards.length
    : Array.isArray(payload.next)
      ? payload.next.length
      : Array.isArray(payload.queue)
        ? payload.queue.length
        : 0;

  return `providerEventId=${currentBoard?.providerEventId ?? payload.providerEventId ?? ''} ` +
    `isStale=${currentBoard?.isStale ?? payload.isStale ?? ''} ` +
    `weekNumber=${currentBoard?.weekNumber ?? payload.weekNumber ?? ''} ` +
    `firstMatch=${currentBoard?.firstMatch ?? payload.firstMatch ?? ''} ` +
    `eventCount=${events.length} nextCount=${nextBoards} ` +
    `lastUpdatedAt=${getPayloadUpdatedAt(payload)}`;
};

/**
 * a game is received on a channel
 * @param game
 */
const addGameReceivedEvent = (game) => {
  if (!game) return;
  try {
    virtualGamesStorage.addOrUpdate(game[0]);
  } catch (err) {
    console.log(err);
  }
};

const connect = (() => {
  let socket;
  /**
   * returns a setup function,
   * closes over the socket
   */
  return () => {
    if (socket) return socket;
    //initialize if not already initialized
   //socket = io('wss://socket.smbet.info');
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      path: SOCKET_PATH,
    });

    console.log(
      `SOCKET connecting url=${SOCKET_URL} path=${SOCKET_PATH} namespace=${socket.nsp} ` +
      `events=${VIRTUAL_DISPLAY_UPDATED_EVENT},${VIRTUAL_EVENTS_QUEUE_UPDATED_EVENT}`
    );

    socket.on('connect', () => {
      console.log(
        `SOCKET connected url=${SOCKET_URL} id=${socket.id} path=${SOCKET_PATH} namespace=${socket.nsp} ` +
        `transport=${socket.io.engine?.transport?.name ?? ''}`
      );
    });
    socket.on('disconnect', (reason) => {
      console.log(`SOCKET disconnected reason=${reason}`);
    });
    socket.on('connect_error', (error) => {
      console.error(`SOCKET connect_error message=${error?.message ?? error}`);
    });
    socket.io.on('reconnect_attempt', (attempt) => {
      console.log(`SOCKET reconnect_attempt attempt=${attempt}`);
    });
    socket.io.on('reconnect', (attempt) => {
      console.log(`SOCKET reconnected attempt=${attempt} id=${socket.id}`);
    });
    socket.onAny((eventName, payload) => {
      const currentBoard = payload?.currentBoard && typeof payload.currentBoard === 'object'
        ? payload.currentBoard
        : null;
      const events = Array.isArray(currentBoard?.events)
        ? currentBoard.events
        : Array.isArray(payload?.events)
          ? payload.events
          : [];
      console.log('SOCKET ANY', eventName, {
        providerEventId: currentBoard?.providerEventId || payload?.providerEventId,
        isStale: currentBoard?.isStale ?? payload?.isStale,
        eventCount: events.length,
        lastUpdatedAt: getPayloadUpdatedAt(payload),
        keys: Object.keys(payload || {})
      });
      console.log(`SOCKET EVENT ${eventName} ${getEventSummary(payload)}`);
    });
   // socket.on('live-feeds-event', addGameReceivedEvent); // receive live feeds updates
    socket.on('virtual-games', addGameReceivedEvent); // receive all live games when connected
    return socket;
  };
})();

export default connect;
