'use strict';
const mDnsSd = require('../lib/dns-sd.js');

mDnsSd.discover({
	//name: '_services._dns-sd._udp.local',
	name: '_googlecast._tcp.local',
	//name: '_androidtvremote._tcp.local',
	//name: '_homekit._tcp.local',
	//name: 'Apple-TV.local',
	//name: '_airplay._tcp.local',
	//name: '_http._tcp.local',
	//name: 'Canon MF720C Series._http._tcp.local',
	//name: 'BRAVIA-4K-GB-d9e2e43926ff4f7fed3bf248db44acbe._googlecast._tcp.local',
	//name: 'raspberrypi.local',
	//name: '_hap._tcp.local',
	//name: '_ipp._tcp.local',
	//name: '_printer._tcp.local',
	//name: '_remo._tcp.local',

	//type: 'PTR',
	//key: 'fqdn',
	key: 'address',
	wait: 5
}).then((device_list) =>{
	console.log(JSON.stringify(device_list, null, '  '));
	console.log('----------------------------------');
	let map = {};
	device_list.forEach((d) => {
		let addr = d['address'];
		if(!(addr in map)) {
			map[addr] = 0;
		}
		map[addr] ++;
	});
	console.log(JSON.stringify(map, null, '  '));
}).catch((error) => {
	console.error(error);
});