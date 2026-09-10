'use strict';
const mDnsSd = require('../lib/dns-sd.js');

mDnsSd.discover({
	name: '_googlecast._tcp.local',
	//name: '_androidtvremote._tcp.local',
	//name: '_homekit._tcp.local',
	//name: 'Apple-TV.local',
	//name: '_airplay._tcp.local',
	//name: '_http._tcp.local',
	//name: 'raspberrypi.local',
	//name: '_hap._tcp.local',
	//name: '_ipp._tcp.local',
	//name: '_printer._tcp.local',
	wait: 5,
	//quick: true,
	filter: '仕事'
}).then((device_list) =>{
	console.log(JSON.stringify(device_list, null, '  '));
}).catch((error) => {
	console.error(error);
});