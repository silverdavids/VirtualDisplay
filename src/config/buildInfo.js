export const BUILD_SHA = process.env.REACT_APP_BUILD_SHA || 'unknown';

export const shortBuildSha = (sha = BUILD_SHA) =>
  sha === 'unknown' ? sha : String(sha).slice(0, 7);
