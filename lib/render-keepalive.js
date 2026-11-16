'use strict';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Keep a Render Free web service from idling by making a low-frequency
 * inbound request to its own public health endpoint. This is enabled only
 * when Render provides RENDER_EXTERNAL_URL; local development is unchanged.
 */
function startRenderKeepAlive({
  baseUrl = process.env.RENDER_EXTERNAL_URL,
  fetchImpl = globalThis.fetch,
  intervalMs = DEFAULT_INTERVAL_MS,
  logger = console,
  schedule = setInterval,
  cancel = clearInterval,
} = {}) {
  if (!baseUrl || typeof fetchImpl !== 'function') return () => {};

  let healthUrl;
  try {
    healthUrl = new URL('/health', baseUrl).toString();
    if (new URL(healthUrl).protocol !== 'https:') return () => {};
  } catch {
    logger.warn?.('[render] Keep-alive disabled because RENDER_EXTERNAL_URL is invalid.');
    return () => {};
  }

  let stopped = false;
  let inFlight = false;
  const ping = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const response = await fetchImpl(healthUrl, {
        method: 'GET',
        headers: { 'user-agent': 'Uranium-Render-KeepAlive/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!response?.ok) throw new Error('health endpoint returned HTTP ' + (response?.status ?? 'unknown'));
    } catch (error) {
      logger.warn?.('[render] Keep-alive health request failed:', error?.message || error);
    } finally {
      inFlight = false;
    }
  };

  const timer = schedule(() => { void ping(); }, intervalMs);
  timer?.unref?.();
  void ping();
  logger.info?.('[render] Free-plan health keep-alive enabled; interval ' + Math.round(intervalMs / 60000) + ' minutes.');

  return () => {
    stopped = true;
    cancel(timer);
  };
}

module.exports = { startRenderKeepAlive, DEFAULT_INTERVAL_MS };
