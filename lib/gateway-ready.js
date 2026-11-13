'use strict';

/**
 * Resolve when Discord has accepted the Gateway READY packet for any shard,
 * or when discord.js has finished hydrating the full client cache.
 * Waiting only for clientReady can leave a valid Gateway connection idle while
 * a large guild cache is still loading.
 */
module.exports = function waitForGatewayReady(client, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    if (client.isReady?.()) return resolve('clientReady');

    let timer;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      client.removeListener('clientReady', onClientReady);
      client.removeListener('shardReady', onShardReady);
    };
    const finish = (source) => {
      cleanup();
      resolve(source);
    };
    const onClientReady = () => finish('clientReady');
    const onShardReady = () => finish('shardReady');

    client.once('clientReady', onClientReady);
    client.once('shardReady', onShardReady);
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Discord Gateway did not emit shardReady/clientReady within ${timeoutMs / 1000}s.`));
    }, timeoutMs);
  });
};
