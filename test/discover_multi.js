'use strict';
const mDnsSd = require('../lib/dns-sd.js');

console.log('Discovering `_printer._tcp.local`...');
mDnsSd.discover({
	name: '_printer._tcp.local',
	wait: 5
}).then((device_list) => {
	console.log(' - ' + device_list.length + ' devices were found.');
	console.log('Discovering `_googlecast._tcp.local` quickly ...');
	return mDnsSd.discover({
		name: '_googlecast._tcp.local',
		quick: true,
		wait: 5
	});
}).then((device_list) => {
	console.log(' - ' + device_list.length + ' devices were found.');
	console.log('Discovering `_airplay._tcp.local` ...');
	return mDnsSd.discover({
		name: '_airplay._tcp.local',
		wait: 5
	});
}).then((device_list) => {
	console.log(' - ' + device_list.length + ' devices were found.');
	console.log('Discovering `_hap._tcp.local` quickly ...');
	return mDnsSd.discover({
		name: '_hap._tcp.local',
		quick: true,
		wait: 5
	});
}).then((device_list) => {
	console.log(' - ' + device_list.length + ' devices were found.');
}).catch((error) => {
	console.error(error);
});
