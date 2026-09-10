'use strict';
const mDnsSd = require('../lib/dns-sd.js');

mDnsSd.discover({
	name: '_googlecast._tcp.local',
	wait: 5,
	quick: true,
	filter: (device) => {
		return (device['modelName'] === 'Google Home' && /仕事部屋/.test(device['familyName']));
	}
}).then((device_list) =>{
	console.log(JSON.stringify(device_list, null, '  '));
}).catch((error) => {
	console.error(error);
});