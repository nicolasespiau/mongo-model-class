'use strict';

const Redis = require('ioredis');

function createClient(opts) {
  const cacheClient = new Redis(opts);

  cacheClient.deleteWildcard = async (wildcard) => {
    let total = 0;
    const keys = await cacheClient.keys(wildcard);

    await Promise.all(keys.map((key) => {
      total += cacheClient.del(key);
    }));

    return [keys.length, total];
  };

  return cacheClient
}

module.exports = createClient;
