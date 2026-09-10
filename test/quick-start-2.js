'use strict';
const mDnsSd = require('../lib/dns-sd.js');

mDnsSd.ondata = (packet) => {
	console.log(JSON.stringify(packet, null, '  '));
};

mDnsSd.startMonitoring().then(() => {
	console.log('Started.');
}).catch((error) => {
	console.error(error);
});