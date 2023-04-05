/* ------------------------------------------------------------------
* node-dns-sd - dns-sd.js
*
* Copyright (c) 2018 - 2023, Futomi Hatano, All rights reserved.
* Released under the MIT license
* ---------------------------------------------------------------- */
'use strict';
const mDgram = require('dgram');
const mOs = require('os');
const mDnsSdParser = require('./dns-sd-parser.js');
const mDnsSdComposer = require('./dns-sd-composer.js');

class DnsSd {
    /* ------------------------------------------------------------------
    * Constructor: DnsSd()
    * ---------------------------------------------------------------- */
    constructor() {
        // Public
        this.ondata = () => { };

        // Private
        this._MULTICAST_ADDR = '224.0.0.251';
        this._UDP_PORT = 5353;
        this._DISCOVERY_WAIT_DEFAULT = 3; // sec

        this._netif_address_list = []; // List of network interface IP address

        this._udp = null;
        this._discovered_devices = {};
        this._is_discovering = false;
        this._is_monitoring = false;
        this._is_listening = false;
        this._onreceive = () => { };
    }

    /* ------------------------------------------------------------------
    * Method: discover(params)
    * - params   | Object    | Required |
    *   - name   | String or | Required | Servcie name.(e.g., "_googlecast._tcp.local")
    *            | Array     |          |
    *   - type   | String    | Optional | Query Type (e.g., "PTR"). The default value is "*".
    *   - key    | String    | Optional | "address" (default) or "fqdn".
    *            |           |          | - "address": IP address based discovery
    *            |           |          | - "fqdn": FQDN (service) based discovery
    *   - wait   | Integer   | Optional | Duration of monitoring. The default value is 3 (sec).
    *   - quick  | Boolean   | Optional | If `true`, this method returns immediately after
    *            |           |          | a device was found ignoring the value of the `wait`.
    *            |           |          | The default value is `false`.
    *   - filter | String or | Optional | If specified as a string, this method discovers only
    *            | Function  |          | devices which the string is found in the `fqdn`,
    *            |           |          | `address`, `modelName` or `familyName`.
    *            |           |          | If specified as a function, this method discovers 
    *            |           |          | only devices for which the function returns `true`. 
    * ---------------------------------------------------------------- */
    async discover(params) {
        if (this._is_discovering === true) {
            throw (new Error('The discovery process is running.'));
        }

        // Check the parameters
        const res = this._checkDiscoveryParameters(params);
        if (res['error']) {
            throw (res['error']);
        }

        // Update the list of network interface IP address
        this._netif_address_list = this._getNetifAddressList();

        const device_list = [];
        try {
            await this._startListening();
            await this._startDiscovery(res['params']);
            for (const device of Object.values(this._discovered_devices)) {
                device_list.push(device);
            }
            await this._stopDiscovery();
            return device_list;
        } catch (error) {
            await this._stopDiscovery();
            throw (error);
        }
    }

    _createDeviceObject(packet) {
        const o = {};

        const trecs = {};
        ['answers', 'authorities', 'additionals'].forEach((k) => {
            packet[k].forEach((r) => {
                const type = r['type'];
                if (!trecs[type]) {
                    trecs[type] = [];
                }
                trecs[type].push(r);
            });
        });

        o['address'] = null;
        if (trecs['A']) {
            o['address'] = trecs['A'][0]['rdata'];
        }
        if (!o['address']) {
            o['address'] = packet['address'];
        }

        o['fqdn'] = null;
        if (trecs['PTR']) {
            let rec = trecs['PTR'][0];
            o['fqdn'] = rec['rdata'];
        }

        o['modelName'] = null;
        o['familyName'] = null;
        if (trecs['TXT'] && trecs['TXT'][0] && trecs['TXT'][0]['rdata']) {
            const r = trecs['TXT'][0];
            const d = r['rdata'] || {};
            const name = r['name'] || '';
            if (/Apple TV/.test(name)) {
                o['modelName'] = 'Apple TV';
                if (trecs['TXT']) {
                    for (let i = 0; i < trecs['TXT'].length; i++) {
                        const r = trecs['TXT'][i];
                        if ((/_device-info/).test(r['name']) && r['rdata'] && r['rdata']['model']) {
                            o['modelName'] = 'Apple TV ' + r['rdata']['model'];
                            break;
                        }
                    }
                }
            } else if (/_googlecast/.test(name)) {
                o['modelName'] = d['md'] || null;
                o['familyName'] = d['fn'] || null;
            } else if (/Philips hue/.test(name)) {
                o['modelName'] = 'Philips hue';
                if (d['md']) {
                    o['modelName'] += ' ' + d['md'];
                }
            } else if (/Canon/.test(name)) {
                o['modelName'] = d['ty'] || null;
            }
        }
        if (!o['modelName']) {
            if (trecs['A'] && trecs['A'][0]) {
                const r = trecs['A'][0];
                const name = r['name'];
                if (/Apple\-TV/.test(name)) {
                    o['modelName'] = 'Apple TV';
                } else if (/iPad/.test(name)) {
                    o['modelName'] = 'iPad';
                }
            }
        }

        if (!o['modelName']) {
            if (o['fqdn']) {
                const hostname = (o['fqdn'].split('.')).shift();
                if (hostname && / /.test(hostname)) {
                    o['modelName'] = hostname;
                }
            }
        }

        o['service'] = null;
        if (trecs['SRV']) {
            const rec = trecs['SRV'][0];
            let name_parts = rec['name'].split('.');
            name_parts.reverse();
            o['service'] = {
                port: rec['rdata']['port'],
                protocol: name_parts[1].replace(/^_/, ''),
                type: name_parts[2].replace(/^_/, '')
            };
        }

        o['packet'] = packet;
        return o;
    }

    _checkDiscoveryParameters(params) {
        const p = {};
        if (params) {
            if (typeof (params) !== 'object') {
                return { error: new Error('The argument `params` is invalid.') };
            }
        } else {
            return { error: new Error('The argument `params` is required.') };
        }

        if ('name' in params) {
            const v = params['name'];
            if (typeof (v) === 'string') {
                if (v === '') {
                    return { error: new Error('The `name` must be an non-empty string.') };
                }
                p['name'] = [v];
            } else if (Array.isArray(v)) {
                if (v.length === 0) {
                    return { error: new Error('The `name` must be a non-empty array.') };
                } else if (v.length > 255) {
                    return { error: new Error('The `name` can include up to 255 elements.') };
                }
                let err = null;
                const list = [];
                for (let i = 0; i < v.length; i++) {
                    if (typeof (v[i]) === 'string' && v[i] !== '') {
                        list.push(v[i]);
                    } else {
                        err = new Error('The `name` must be an Array object including non-empty strings.');
                        break;
                    }
                }
                if (err) {
                    return { error: err };
                }
                p['name'] = list;
            } else {
                return { error: new Error('The `name` must be a string or an Array object.') };
            }
        } else {
            return { error: new Error('The `name` is required.') };
        }

        if ('type' in params) {
            const v = params['type'];
            if (typeof (v) !== 'string' || !(/^[a-zA-Z0-9]{1,10}$/.test(v) || v === '*')) {
                return { error: new Error('The `type` is invalid.') };
            }
            p['type'] = v.toUpperCase();
        }

        if ('key' in params) {
            const v = params['key'];
            if (typeof (v) !== 'string' || !/^(address|fqdn)$/.test(v)) {
                return { error: new Error('The `key` is invalid.') };
            }
            p['key'] = v;
        }

        if ('wait' in params) {
            const v = params['wait'];
            if (typeof (v) !== 'number' || v <= 0 || v % 1 !== 0) {
                return { error: new Error('The `wait` is invalid.') };
            }
            p['wait'] = v;
        }

        if ('quick' in params) {
            const v = params['quick'];
            if (typeof (v) !== 'boolean') {
                return { error: new Error('The `quick` must be a boolean.') };
            }
            p['quick'] = v;
        } else {
            p['quick'] = false;
        }

        if (`filter` in params) {
            const v = params['filter'];
            if (typeof (v) !== 'string' && typeof (v) !== 'function') {
                return { error: new Error('The `filter` must be a string.') };
            }
            if (v) {
                p['filter'] = v;
            }
        }

        return { params: p };
    }

    _startDiscovery(params) {
        return new Promise((resolve, reject) => {
            this._discovered_devices = {};
            this._is_discovering = true;
            const wait = (params && params['wait']) ? params['wait'] : this._DISCOVERY_WAIT_DEFAULT;

            // Create a request packet
            let buf = mDnsSdComposer.compose({
                name: params['name'],
                type: params['type']
            });

            // Timer
            let wait_timer = null;

            const clearTimer = () => {
                if (wait_timer) {
                    clearTimeout(wait_timer);
                    wait_timer = null;
                }
                this._onreceive = () => { };
            };

            wait_timer = setTimeout(() => {
                clearTimer();
                resolve();
            }, wait * 1000);

            const quick = params['quick'];
            const key = params['key'] || 'address';

            this._onreceive = (addr, packet) => {
                if (!this._isTargettedDevice(packet, params['name'])) {
                    return;
                }
                const device = this._createDeviceObject(packet);
                if (!this._evaluateDeviceFilter(device, params['filter'])) {
                    return;
                }
                if (key === 'fqdn') {
                    const fqdn = device['fqdn'];
                    this._discovered_devices[fqdn] = device;
                } else {
                    this._discovered_devices[addr] = device;
                }
                if (quick) {
                    clearTimer();
                    resolve();
                }
            };

            // Send a packet
            this._sendQueryPacket(buf);
        });
    }

    async _sendQueryPacket(buf) {
        for (const netif_address of this._netif_address_list) {
            for (let i = 0; i < 3; i++) {
                this._udp.setMulticastInterface(netif_address);
                await this._wait(100);
                await this._udpSend(buf, this._UDP_PORT, this._MULTICAST_ADDR);
                if (this._is_discovering === true) {
                    break;
                }
                await this._wait(100);
            }

            if (this._is_discovering === true) {
                break;
            }
        }
    }

    _udpSend(buf, port, addr) {
        return new Promise((resolve, reject) => {
            this._udp.send(buf, 0, buf.length, port, addr, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    _wait(msec) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, msec);
        });
    }

    _isTargettedDevice(packet, name_list) {
        let hit = false;
        for (const ans of packet['answers']) {
            let name = ans['name'];
            if (name && name_list.indexOf(name) >= 0) {
                hit = true;
            }
        }
        return hit;
    }

    _evaluateDeviceFilter(device, filter) {
        if (filter) {
            let filter_type = typeof (filter);
            if (filter_type === 'string') {
                return this._evaluateDeviceFilterString(device, filter);
            } else if (filter_type === 'function') {
                return this._evaluateDeviceFilterFunction(device, filter);
            } else {
                return false;
            }
        } else {
            return true;
        }
    }

    _evaluateDeviceFilterString(device, filter) {
        if (device['fqdn'] && device['fqdn'].indexOf(filter) >= 0) {
            return true;
        }
        if (device['address'] && device['address'].indexOf(filter) >= 0) {
            return true;
        }
        if (device['modelName'] && device['modelName'].indexOf(filter) >= 0) {
            return true;
        }
        if (device['familyName'] && device['familyName'].indexOf(filter) >= 0) {
            return true;
        }
        return false;
    }

    _evaluateDeviceFilterFunction(device, filter) {
        let res = false;
        try {
            res = filter(device);
        } catch (e) { }
        res = res ? true : false;
        return res;
    }

    async _stopDiscovery() {
        this._discovered_devices = {};
        this._is_discovering = false;
        try {
            await this._stopListening();
        } catch (error) {
            // Do nothing
        }
    }

    _addMembership() {
        for (const netif_address of this._netif_address_list) {
            try {
                this._udp.addMembership(this._MULTICAST_ADDR, netif_address);
            } catch (e) {
                console.log(`Catching error on address already in use: ${JSON.stringify(e)}`);
            }
        }
    }

    _dropMembership() {
        for (const netif_address of this._netif_address_list) {
            try {
                this._udp.dropMembership(this._MULTICAST_ADDR, netif_address);
            } catch (e) {
                console.log(`Catching error on dropMembership: ${JSON.stringify(e)}`);
            }
        }
    }

    _getNetifAddressList() {
        const list = [];
        const netifs = mOs.networkInterfaces();
        for (const iflist of Object.values(netifs)) {
            for (const info of iflist) {
                // Exclude a loopback address
                if (info.internal) {
                    continue;
                }
                // Exclude a non-IPv4 address
                if (info.family !== 'IPv4') {
                    continue;
                }
                // Exclude a link-local address
                if (/^169\.254\./.test(info.address)) {
                    continue;
                }

                list.push(info.address);
            }
        }
        return list;
    }

    /* ------------------------------------------------------------------
    * Method: startMonitoring()
    * ---------------------------------------------------------------- */
    async startMonitoring() {
        if (this._is_monitoring === true) {
            return;
        }

        // Update the list of network interface IP address
        this._netif_address_list = this._getNetifAddressList();

        try {
            await this._startListening();
            this._is_monitoring = true;
        } catch (error) {
            this._is_monitoring = false;
            await this._stopListening();
            throw (error);
        }
    }

    /* ------------------------------------------------------------------
    * Method: stopMonitoring()
    * ---------------------------------------------------------------- */
    async stopMonitoring() {
        this._is_monitoring = false;

        // Update the list of network interface IP address
        this._netif_address_list = this._getNetifAddressList();

        try {
            await this._stopListening();
        } catch (error) {
            // Do nothing
        }
    }

    _startListening() {
        return new Promise((resolve, reject) => {
            if (this._is_listening === true) {
                resolve();
                return;
            }

            // Set up a UDP tranceiver
            this._udp = mDgram.createSocket({
                type: 'udp4',
                reuseAddr: true
            });

            this._udp.once('error', (error) => {
                this._is_listening = false;
                reject(error);
                return;
            });

            this._udp.once('listening', () => {
                //this._udp.setMulticastLoopback(false);
                this._addMembership();
                this._is_listening = true;
                setTimeout(() => {
                    resolve();
                }, 100);
            });

            this._udp.on('message', (buf, rinfo) => {
                this._receivePacket(buf, rinfo);
            });

            this._udp.bind({ port: this._UDP_PORT }, () => {
                this._udp.removeAllListeners('error');
            });
        });
    }

    _stopListening() {
        return new Promise((resolve, reject) => {
            this._dropMembership();
            if (this._is_discovering || this._is_monitoring) {
                resolve();
            } else {
                const cleanObj = () => {
                    if (this._udp) {
                        this._udp.unref();
                        this._udp = null;
                    }
                    this._is_listening = false;
                    resolve();
                };
                if (this._udp) {
                    this._udp.removeAllListeners('message');
                    this._udp.removeAllListeners('error');
                    this._udp.removeAllListeners('listening');
                    this._udp.close(() => {
                        cleanObj();
                    });
                } else {
                    cleanObj();
                }
            }
        });
    }

    _receivePacket(buf, rinfo) {
        const p = mDnsSdParser.parse(buf);
        if (!p) {
            return;
        }
        p['address'] = rinfo.address;
        if (this._is_discovering) {
            if (this._isAnswerPacket(p, rinfo.address)) {
                this._onreceive(rinfo.address, p);
            }
        }
        if (this._is_monitoring) {
            if (typeof (this.ondata) === 'function') {
                this.ondata(p);
            }
        }
    }

    _isAnswerPacket(p, address) {
        if (this._netif_address_list.indexOf(address) >= 0) {
            return false;
        }
        if (!(p['header']['qr'] === 1 && p['header']['op'] === 0)) {
            return false;
        }
        return true;
    }
}

module.exports = new DnsSd();
