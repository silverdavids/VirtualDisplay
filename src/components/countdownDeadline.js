export const COUNTDOWN_DEADLINE_TOLERANCE_MS = 1000;

const timestamp = (value) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

export const reconcileCountdownDeadline = ({
  currentProviderEventId,
  currentDeadline,
  incomingProviderEventId,
  incomingDeadline,
  toleranceMs = COUNTDOWN_DEADLINE_TOLERANCE_MS,
}) => {
  const currentMs = timestamp(currentDeadline);
  const incomingMs = timestamp(incomingDeadline);
  const sameBoard = String(currentProviderEventId ?? '') !== '' &&
    String(currentProviderEventId) === String(incomingProviderEventId ?? '');

  if (incomingMs === null) {
    return {
      deadline: currentDeadline ?? null,
      reset: false,
      reason: 'missing-incoming-deadline',
    };
  }

  if (sameBoard && currentMs !== null && Math.abs(incomingMs - currentMs) <= toleranceMs) {
    return {
      deadline: currentDeadline,
      reset: false,
      reason: 'same-board-within-tolerance',
    };
  }

  return {
    deadline: incomingDeadline,
    reset: currentMs !== incomingMs,
    reason: sameBoard ? 'same-board-authoritative-change' : 'provider-event-changed',
  };
};
