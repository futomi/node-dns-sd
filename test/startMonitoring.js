'use strict';
const mDnsSd = require('../lib/dns-sd.js');

mDnsSd.ondata = (d) => {
	console.log('---------------------------------------');
	console.log(JSON.stringify(d, null, '  '));
};

mDnsSd.startMonitoring().then(() => {
	return wait(10000);
}).then(() => {
	return mDnsSd.stopMonitoring();
}).then(() => {
	console.log('Done');
}).catch((error) => {
	console.error(error);
});

function wait(msec) {
	let promise = new Promise((resolve, reject) => {
		setTimeout(() => {
			resolve();
		}, msec);
	});
	return promise;
}