'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function fixture() {
    const filename = process.env.DNS_SD_SOURCE || path.resolve(__dirname, '../lib/dns-sd.js');
    delete require.cache[require.resolve(filename)];
    const dns = require(filename);
    const listening = deferred();
    const discovery = deferred();
    const cleanup = deferred();
    let starts = 0;
    dns._startListening = () => { starts++; return listening.promise; };
    dns._startDiscovery = () => { dns._is_discovering = true; return discovery.promise; };
    dns._stopDiscovery = () => { dns._is_discovering = false; return cleanup.promise; };
    return { dns, listening, discovery, cleanup, starts: () => starts };
}

const params = { name: '_http._tcp.local' };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('rejects a second discovery while the first socket is still binding', async () => {
    const f = fixture();
    const first = f.dns.discover(params);
    const second = f.dns.discover(params);
    const results = Promise.allSettled([first, second]);
    const starts = f.starts();
    f.listening.resolve();
    f.discovery.resolve();
    f.cleanup.resolve();
    const [a, b] = await results;
    assert.equal(starts, 1, 'only one caller may start the UDP listener');
    assert.equal(a.status, 'fulfilled');
    assert.equal(b.status, 'rejected');
    assert.match(b.reason.message, /discovery process is running/);
});

test('keeps ownership until asynchronous socket cleanup finishes', async () => {
    const f = fixture();
    const first = f.dns.discover(params);
    f.listening.resolve();
    f.discovery.resolve();
    await tick();
    assert.equal(f.dns._is_discovering, false, 'cleanup has started');
    const second = f.dns.discover(params);
    const results = Promise.allSettled([first, second]);
    const starts = f.starts();
    f.cleanup.resolve();
    const [a, b] = await results;
    assert.equal(starts, 1);
    assert.equal(a.status, 'fulfilled');
    assert.equal(b.status, 'rejected');
    assert.match(b.reason.message, /discovery process is running/);
});

test('permits sequential discovery after successful cleanup', async () => {
    const f = fixture();
    f.listening.resolve();
    f.discovery.resolve();
    f.cleanup.resolve();
    assert.deepEqual(await f.dns.discover(params), []);
    assert.deepEqual(await f.dns.discover(params), []);
    assert.equal(f.starts(), 2);
});

test('releases ownership after a bind error and preserves that error', async () => {
    const f = fixture();
    const error = Object.assign(new Error('bind failed'), { code: 'EADDRINUSE' });
    const result = assert.rejects(f.dns.discover(params), err => err === error);
    f.listening.reject(error);
    f.cleanup.resolve();
    await result;
    f.dns._startListening = () => Promise.resolve();
    f.discovery.resolve();
    assert.deepEqual(await f.dns.discover(params), []);
});

test('invalid parameters do not reserve discovery', async () => {
    const f = fixture();
    await assert.rejects(f.dns.discover({ name: 123 }));
    assert.equal(f.starts(), 0);
    f.listening.resolve();
    f.discovery.resolve();
    f.cleanup.resolve();
    assert.deepEqual(await f.dns.discover(params), []);
});

test('rejecting an overlapping caller does not release the active caller', async () => {
    const f = fixture();
    const first = f.dns.discover(params);
    const second = f.dns.discover(params);
    const results = Promise.allSettled([first, second]);
    await tick();
    const third = f.dns.discover(params);
    const thirdResult = Promise.allSettled([third]);
    const starts = f.starts();
    f.listening.resolve();
    f.discovery.resolve();
    f.cleanup.resolve();
    const [, b] = await results;
    const [c] = await thirdResult;
    assert.equal(starts, 1);
    assert.equal(b.status, 'rejected');
    assert.equal(c.status, 'rejected');
});
