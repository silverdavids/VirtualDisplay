import {
  COUNTDOWN_DEADLINE_TOLERANCE_MS,
  reconcileCountdownDeadline,
} from './countdownDeadline';

const base = {
  currentProviderEventId: 'board-1',
  currentDeadline: '2026-07-29T20:00:00.000Z',
  incomingProviderEventId: 'board-1',
};

test('preserves the same board deadline within the startup tolerance', () => {
  expect(reconcileCountdownDeadline({
    ...base,
    incomingDeadline: '2026-07-29T20:00:00.900Z',
  })).toEqual({
    deadline: base.currentDeadline,
    reset: false,
    reason: 'same-board-within-tolerance',
  });
});

test('accepts an authoritative same-board change beyond the tolerance', () => {
  const incomingDeadline = '2026-07-29T20:00:01.001Z';
  expect(reconcileCountdownDeadline({
    ...base,
    incomingDeadline,
  })).toEqual({
    deadline: incomingDeadline,
    reset: true,
    reason: 'same-board-authoritative-change',
  });
});

test('always accepts the deadline for a new provider event', () => {
  const incomingDeadline = '2026-07-29T20:05:00.000Z';
  expect(reconcileCountdownDeadline({
    ...base,
    incomingProviderEventId: 'board-2',
    incomingDeadline,
    toleranceMs: COUNTDOWN_DEADLINE_TOLERANCE_MS,
  })).toEqual({
    deadline: incomingDeadline,
    reset: true,
    reason: 'provider-event-changed',
  });
});

test('does not erase an authoritative deadline when timing is absent', () => {
  expect(reconcileCountdownDeadline({
    ...base,
    incomingDeadline: null,
  })).toEqual({
    deadline: base.currentDeadline,
    reset: false,
    reason: 'missing-incoming-deadline',
  });
});
