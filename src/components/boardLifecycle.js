export const boardNow = (board, now = Date.now()) => now + (Number.isFinite(board?.serverClockOffsetMs) ? board.serverClockOffsetMs : 0);
export const boardDeadline = board => Date.parse(board?.scheduledStartAtUtc ?? board?.startAt ?? board?.boardStartAt ?? board?.activeStartAt ?? board?.nextRefreshAt ?? board?.activeNextRefreshAt ?? board?.endAt ?? board?.activeEndAt);
export const boardState = (board, now = Date.now()) => {
  if (board?.state === 'FINISHED') return 'FINISHED';
  if (board?.state === 'CLOSED') return 'CLOSED';
  const start = boardDeadline(board);
  return board?.state === 'LIVE' || board?.startedAtUtc || (Number.isFinite(start) && boardNow(board, now) >= start) ? 'LIVE' : 'UPCOMING';
};
export const bettingClosed = (board, now = Date.now()) => !board || boardState(board, now) !== 'UPCOMING' ||
  !Number.isFinite(boardDeadline(board)) || boardDeadline(board) <= boardNow(board, now) ||
  (board.BettingOpen ?? board.bettingOpen ?? board.bettingAllowed) === false ||
  board.available === false || board.suspended === true || board.isStale === true;

export const closedBoardMessage = (board, now = Date.now()) => {
  if (!board?.events?.length || board.available === false) return 'Waiting for the next virtual event';
  if (boardState(board, now) === 'LIVE') return 'Betting closed – games in progress';
  if (boardState(board, now) === 'FINISHED') {
    return 'Waiting for the next virtual event';
  }
  return 'Betting temporarily unavailable';
};
