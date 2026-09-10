'use strict';
const mDnsSd = require('../lib/dns-sd.js');

mDnsSd.discover({
  name: '_googlecast._tcp.local'
}).then((device_list) =>{
  console.log(JSON.stringify(device_list, null, '  '));
}).catch((error) => {
  console.error(error);
});