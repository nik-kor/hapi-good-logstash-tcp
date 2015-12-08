/// <reference path="../typings/tsd.d.ts" />

import * as os from 'os';
import * as _ from 'lodash';

var Squeeze = require('good-squeeze').Squeeze;
var Stringify = require('json-stringify-safe');

import { Logstash } from './logstash';

// Declare internals

var internals = {
    defaults: {
        threshold: 20,
    },
    host: os.hostname()
};

export interface LogRecord {
    level: string;
    msg: string;
    meta: any;
    timestamp: string;
}

export interface GoodLogstashTcpSettings {
    disabled?: boolean,
    meta?: any,
    processor?: (payload: any) => LogRecord[],
    maxConnectRetries?: number,
    timeoutConnectRetries?: number,
    tlsOptions?: {
        host: string,
        port?: number,
        ca: string[],
        key: string[],
        cert: string[]
    }
}

export default class GoodLogstashTcp {
    _streams: {
        squeeze: any;
    }

    _eventQueue: any[] = [];
    _settings: GoodLogstashTcpSettings;
    _logstash: Logstash;

    constructor(events, settings_: GoodLogstashTcpSettings) {
        settings_ = settings_ || {};

        if (!settings_.tlsOptions || !settings_.tlsOptions.host) {
            throw new Error('config.tlsOptions.host must be present')
        }

        this._settings = _.merge({}, internals.defaults, settings_) as GoodLogstashTcpSettings;

        if (!this._settings.disabled) {
            this._streams = {
                squeeze: Squeeze(events)
            };

            this._logstash = new Logstash({
                maxConnectRetries: this._settings.maxConnectRetries,
                timeoutConnectRetries: this._settings.timeoutConnectRetries,
                host: this._settings.tlsOptions.host,
                port: this._settings.tlsOptions.port
            });
        }
    }

    defaultProcessor(payload, collector = [], internal = false, level: string = ""): LogRecord[] {
        let msg: string;
        let meta: any;
        let timestamp: string = payload.timestamp;
        let internalLogs = [];

        if (internal) {
            msg = `Request event: ${payload.request}`;
            meta = {
                requestId: payload.request,
                tags: payload.tags,
                data: payload.data
            }
        } else if (payload.event == 'log') {
            if (typeof payload.data === 'string') {
                msg = payload.data;
            } else if (_.isObject(payload.data)) {
                if (payload.data.message || payload.data.msg) {
                    msg = payload.data.message || payload.data.msg;
                    meta = _.merge({ tags: payload.tags }, payload.data.meta);
                }
            }

            level = payload.tags[0] || 'DEBUG';
        } else if (payload.event == 'response') {
            msg = `${payload.method.toUpperCase()} ${payload.path} ${payload.statusCode} ${payload.responseTime}ms`;
            meta = {
                requestId: payload.id,
                method: payload.method,
                path: payload.path,
                query: payload.query,
                responseTime: payload.responseTime,
                statusCode: payload.statusCode,
                source: payload.source,
                detail: "\n" + Stringify(payload.log, null, 2)
            }
        }

        collector.push({ level, msg, meta, timestamp });
        internalLogs.forEach((payload) => this.defaultProcessor(payload, collector, true, level));
        return collector;
    }

    init(stream, emitter, callback) {
        if (this._settings.disabled) {
            callback();
            return;
        }

        var self = this;

        this._streams.squeeze.on('data', (payload) => {
            let messages = (this._settings.processor || this.defaultProcessor)(payload);
            messages.forEach((message) => {
                let { level, msg, meta, timestamp } = message;
                this.log(level, msg, meta, timestamp);
            })
        });

        this._streams.squeeze.on('end', function () { });

        stream.pipe(this._streams.squeeze);
        callback();
    }

    log(level: string, msg: string, meta: string, timestamp: string) {
        if (this._settings.disabled) {
            return;
        }

        let finalMeta = _.merge({}, this._settings.meta, meta);
        this._logstash.log(level, msg, finalMeta, timestamp, () => {});
    }
}
