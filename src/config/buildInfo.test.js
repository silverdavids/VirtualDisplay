import {shortBuildSha} from './buildInfo';

test('shows the conventional seven-character short build SHA', () => {
  expect(shortBuildSha('ce6e27b1234567890')).toBe('ce6e27b');
});

test('preserves unknown local build metadata', () => {
  expect(shortBuildSha('unknown')).toBe('unknown');
});
