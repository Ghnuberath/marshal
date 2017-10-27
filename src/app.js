'use strict';

const mockery = require('mockery');
mockery.registerMock('redis', require('redis-mock'));
mockery.enable({
  useCleanCache: true,
  warnOnReplace: false,
  warnOnUnregistered: false
});

const Ravel = require('ravel');

const app = new Ravel();
app.log.setLevel(app.log.TRACE);

app.registerParameter('docker connection config', true);
app.registerParameter('refresh interval', true, process.env.REFRESH_INTERVAL || 60000);
app.registerParameter('stack name', true, process.env.STACK_NAME);

app.modules('./modules');

(async () => {
  await app.init();
  await app.listen();
})();
