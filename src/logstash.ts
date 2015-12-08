/// <reference path="../typings/tsd.d.ts" />

import * as net from 'net';
import * as util from 'util';
import * as events from 'events';
import * as os from 'os';
import * as tls from 'tls';
import * as fs from 'fs';
import * as _ from 'lodash';

var Stringify = require('json-stringify-safe');

var ECONNREFUSED_REGEXP = /ECONNREFUSED/;

export interface LogstashOptions {
    name?: string;
    hostname?: string;
    port?: number;
    host?: string;
    nodeName?: string;
    pid?: number;
    maxConnectRetries?: number;
    timeoutConnectRetries?: number;
    retries?: number;
    logstash?: boolean;
    sslEnable?: boolean;
    sslKey?: string;
    sslCert?: string;
    ca?: string;
    sslPassphrase?: string;
    rejectUnauthorized?: boolean;
    stripColors?: boolean;
    label?: string;
}

export class Logstash implements LogstashOptions {
    // From options
    name: string;
    hostname: string;
    port: number;
    host: string;
    nodeName: string;
    pid: number;
    maxConnectRetries: number;
    timeoutConnectRetries: number;
    retries: number;
    logstash: boolean;
    sslEnable: boolean;
    sslKey: string;
    sslCert: string;
    ca: string;
    sslPassphrase: string;
    rejectUnauthorized: boolean;
    stripColors: boolean;
    label: string;

    metaDefaults: any;
    logQueue: any[] = [];
    connected: boolean = false;
    socket: any;

    connecting: boolean;
    terminating: boolean;
    silent: boolean;

    // From event emitter
    emit: (event: string, val?: any) => void;

    constructor(options: LogstashOptions) {
        options = options || {};

        this.name = 'logstash';
        this.hostname = options.hostname || os.hostname();
        this.host = options.host || '127.0.0.1';
        this.port = options.port || 28777;

        this.nodeName = options.nodeName || process.title;
        this.pid = options.pid || process.pid;

        this.maxConnectRetries = ('number' === typeof options.maxConnectRetries)
            ? options.maxConnectRetries
            : 4;

        this.timeoutConnectRetries = ('number' === typeof options.timeoutConnectRetries)
            ? options.timeoutConnectRetries
            : 100;

        this.retries = -1;

        this.logstash = options.logstash || true;

        // SSL Settings
        this.sslEnable = options.sslEnable || false;
        this.sslKey = options.sslKey || '';
        this.sslCert = options.sslCert || '';
        this.ca = options.ca || '';
        this.sslPassphrase = options.sslPassphrase || '';
        this.rejectUnauthorized = options.rejectUnauthorized === true;

        // Connection state
        this.connected = false;
        this.socket = null;

        // Miscellaneous options
        this.stripColors = options.stripColors || false;
        this.label = options.label || this.nodeName;

        this.connect();
    }

    log(level, msg, meta, timestamp, callback) {
        var self = this;

        if (self.silent) {
            return callback(null, true);
        }

        if (self.stripColors) {
            msg = msg.stripColors;

            // Let's get rid of colors on our meta properties too.
            if (typeof meta === 'object') {
                for (var property in meta) {
                    meta[property] = meta[property].stripColors;
                }
            }
        }

        var logEntry = log({
            level: level,
            timestamp: timestamp,
            message: msg,
            nodeName: this.nodeName,
            meta: meta,
            logstash: true,
            label: this.label
        });

        if (!self.connected) {
            self.logQueue.push({
                message: logEntry,
                callback: function() {
                    self.emit('logged');
                    callback(null, true);
                }
            });
        } else {
            self.sendLog(logEntry, function() {
                self.emit('logged');
                callback(null, true);
            });
        }
    }

    connect() {
        var tryReconnect = true;
        var options = {};
        var self = this;

        this.retries++;
        this.connecting = true;
        this.terminating = false;

        if (this.sslEnable) {
            options = {
                key: this.sslKey ? fs.readFileSync(this.sslKey) : null,
                cert: this.sslCert ? fs.readFileSync(this.sslCert) : null,
                passphrase: this.sslPassphrase ? this.sslPassphrase : null,
                rejectUnauthorized: this.rejectUnauthorized === true,
                ca: this.ca ? (function(caList) {
                    var caFilesList = [];

                    caList.forEach(function(filePath) {
                        caFilesList.push(fs.readFileSync(filePath));
                    });

                    return caFilesList;
                } (this.ca)) : null
            };
            this.socket = tls.connect(this.port, this.host, options, function() {
                self.socket.setEncoding('UTF-8');
                self.announce();
                self.connecting = false;
            });
        } else {
            this.socket = new net.Socket();
        }

        this.socket.on('error', function(err) {
            self.connecting = false;
            self.connected = false;

            if (typeof (self.socket) !== 'undefined' && self.socket != null) {
                self.socket.destroy();
            }

            self.socket = null;

            if (!ECONNREFUSED_REGEXP.test(err.message)) {
                tryReconnect = false;
                self.emit('error', err);
            }
        });

        this.socket.on('timeout', function() {
            if (self.socket.readyState !== 'open') {
                self.socket.destroy();
            }
        });

        this.socket.on('connect', function() {
            self.retries = 0;
        });

        this.socket.on('close', function(hadError) {
            self.connected = false;

            if (self.maxConnectRetries < 0 || self.retries < self.maxConnectRetries) {
                if (!self.connecting) {
                    console.log('Logstash connection retry');
                    setTimeout(function() {
                        self.connect();
                    }, self.timeoutConnectRetries);
                }
            } else {
                self.logQueue = [];
                self.silent = true;
                self.emit('error', new Error('Max retries reached, transport in silent mode, OFFLINE'));
            }
        });

        if (!this.sslEnable) {
            this.socket.connect(self.port, self.host, function() {
                self.announce();
                self.connecting = false;
            });
        }

    }

    close() {
        var self = this;
        self.terminating = true;
        if (self.connected && self.socket) {
            self.connected = false;
            self.socket.end();
            self.socket.destroy();
            self.socket = null;
        }
    }

    announce() {
        var self = this;
        self.connected = true;
        self.flush();
        if (self.terminating) {
            self.close();
        }
    }

    flush() {
        var self = this;

        for (var i = 0; i < self.logQueue.length; i++) {
            self.sendLog(self.logQueue[i].message, self.logQueue[i].callback);
            self.emit('logged');
        }
        self.logQueue.length = 0;
    }

    sendLog(message, callback) {
        var self = this;
        callback = callback || function() { };

        self.socket.write(message + '\n');
        callback();
    }
}

function getTimestamp() {
    return new Date().toISOString();
}

export interface LogOptions {
    timestamp: string,
    message: string,
    meta: any;
    level: string;
    nodeName: string,
    logstash: boolean,
    label: string,
    stringify?: (output: any) => string
}

function log(options: LogOptions) {
    var timestampFn: any = typeof options.timestamp === 'function'
        ? options.timestamp
        : getTimestamp;

    var timestamp = options.timestamp ? timestampFn() : null;

    var meta = options.meta;
    var output;

    if (typeof meta !== 'object' && meta != null) {
        meta = { meta: meta };
    }

    output = _.cloneDeep(meta) || {};
    output.level = options.level;
    output.message = output.message || '';

    if (options.label) { output.label = options.label; }
    if (options.message) { output.message = options.message; }
    if (timestamp) { output.timestamp = timestamp; }

    if (options.logstash === true) {
        // use logstash format
        var logstashOutput = _.cloneDeep(output);
        if (output.timestamp !== undefined) {
            logstashOutput['@timestamp'] = output.timestamp;
            delete output.timestamp;
        }
    }

    if (typeof options.stringify === 'function') {
        return options.stringify(output);
    }

    return Stringify(output, function(key, value) {
        return value instanceof Buffer
            ? value.toString('base64')
            : value;
    });
};

_.extend(Logstash.prototype, events.EventEmitter.prototype);
