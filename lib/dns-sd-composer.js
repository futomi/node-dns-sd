/* ------------------------------------------------------------------
* node-dns-sd - dns-sd-composer.js
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2018-01-03
* ---------------------------------------------------------------- */
'use strict';

/* ------------------------------------------------------------------
* Constructor: DnsSdComposer()
* ---------------------------------------------------------------- */
const DnsSdComposer = function() {
	this._CLASSES = require('./dns-sd-classes.json');
	this._TYPES = require('./dns-sd-types.json');
};

/* ------------------------------------------------------------------
* Method: compose(params)
* - params:
*   - name    | Array  | Requred  | Servcie name.(e.g., ["_googlecast._tcp.local"])
* ---------------------------------------------------------------- */
DnsSdComposer.prototype.compose = function(params) {
	let name_list = params['name'];

	let hbuf = Buffer.from([ // Header
		0x00, 0x00, // Transaction ID
		0x00, 0x00, // Flags
		0x00, name_list.length, // Questions
		0x00, 0x00, // Answer PRs
		0x00, 0x00, // Authority PRs
		0x00, 0x00 // Additional PRs
	]);

	let qbuf_list = [];
	name_list.forEach((name) => {
		(name.split('.')).forEach((part) => {
			let part_buf = Buffer.from(part, 'utf8');
			qbuf_list.push(Buffer.from([part_buf.length]));
			qbuf_list.push(part_buf);
		});
		qbuf_list.push(Buffer.from([0x00])); // Null-terminated string for the domain name

		let type_buf = Buffer.alloc(2);
		type_buf.writeUInt16BE(0xff, 0);
		qbuf_list.push(type_buf);

		let class_buf = Buffer.alloc(2);
		class_buf.writeUInt16BE(this._CLASSES['IN'], 0);
		qbuf_list.push(class_buf);
	});
	let qbuf = Buffer.concat(qbuf_list);

	let buf = Buffer.concat([hbuf, qbuf]);
	return buf;
};

module.exports = new DnsSdComposer();

