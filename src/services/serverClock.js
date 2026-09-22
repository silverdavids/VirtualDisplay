// Use server UTC plus elapsed client time, never a hard-coded provider offset.
export const withServerClock = (payload, receivedAt = Date.now(), sentAt = receivedAt) => {
  if (!payload || typeof payload !== 'object') return payload;
  const serverTime = Date.parse(payload.serverTimeUtc);
  const offset = Number.isFinite(serverTime) ? serverTime - (sentAt + receivedAt) / 2 : null;
  const apply = board => {
    if (!board) return board;
    const ownTime = Date.parse(board.serverTimeUtc);
    const boardOffset = Number.isFinite(ownTime) ? ownTime - (sentAt + receivedAt) / 2 : offset;
    return boardOffset === null ? board : {...board, serverClockOffsetMs: boardOffset};
  };
  return {...apply(payload),
    ...(payload.currentBoard ? {currentBoard: apply(payload.currentBoard)} : {}),
    ...Object.fromEntries(['nextBoards', 'retainedBoards'].filter(key => Array.isArray(payload[key]))
      .map(key => [key, payload[key].map(apply)])),
  };
};
