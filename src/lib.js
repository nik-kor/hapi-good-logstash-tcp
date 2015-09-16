/// <reference path="../typings/tsd.d.ts" />
var os = require('os');
var _ = require('lodash');
var Squeeze = require('good-squeeze').Squeeze;
var Stringify = require('json-stringify-safe');
var logstash_1 = require('./logstash');
var internals = {
    defaults: {
        threshold: 20,
    },
    host: os.hostname()
};
var GoodLogstashTcp = (function () {
    function GoodLogstashTcp(events, settings_) {
        this._eventQueue = [];
        settings_ = settings_ || {};
        if (!settings_.tlsOptions || !settings_.tlsOptions.host) {
            throw new Error('config.tlsOptions.host must be present');
        }
        this._settings = _.merge({}, internals.defaults, settings_);
        if (!this._settings.disabled) {
            this._streams = {
                squeeze: Squeeze(events)
            };
            this._logstash = new logstash_1.Logstash({
                host: this._settings.tlsOptions.host,
                port: this._settings.tlsOptions.port
            });
        }
    }
    GoodLogstashTcp.prototype.defaultProcessor = function (payload, collector, internal, level) {
        var _this = this;
        if (collector === void 0) { collector = []; }
        if (internal === void 0) { internal = false; }
        if (level === void 0) { level = ""; }
        var msg;
        var meta;
        var timestamp = payload.timestamp;
        var internalLogs = [];
        if (internal) {
            msg = "Request event: " + payload.request;
            meta = {
                requestId: payload.request,
                tags: payload.tags,
                data: payload.data
            };
        }
        else if (payload.event == 'log') {
            if (typeof payload.data === 'string') {
                msg = payload.data;
            }
            else if (_.isObject(payload.data)) {
                if (payload.data.message || payload.data.msg) {
                    msg = payload.data.message || payload.data.msg;
                    meta = _.merge({ tags: payload.tags }, payload.data.meta);
                }
            }
            level = payload.tags[0] || 'DEBUG';
        }
        else if (payload.event == 'response') {
            msg = payload.method.toUpperCase() + " " + payload.path + " " + payload.statusCode + " " + payload.responseTime + "ms";
            meta = {
                requestId: payload.id,
                method: payload.method,
                path: payload.path,
                query: payload.query,
                responseTime: payload.responseTime,
                statusCode: payload.statusCode,
                source: payload.source,
                detail: "\n" + Stringify(payload.log, null, 2)
            };
        }
        collector.push({ level: level, msg: msg, meta: meta, timestamp: timestamp });
        internalLogs.forEach(function (payload) { return _this.defaultProcessor(payload, collector, true, level); });
        return collector;
    };
    GoodLogstashTcp.prototype.init = function (stream, emitter, callback) {
        var _this = this;
        if (this._settings.disabled) {
            callback();
            return;
        }
        var self = this;
        this._streams.squeeze.on('data', function (payload) {
            var messages = (_this._settings.processor || _this.defaultProcessor)(payload);
            messages.forEach(function (message) {
                var level = message.level, msg = message.msg, meta = message.meta, timestamp = message.timestamp;
                _this.log(level, msg, meta, timestamp);
            });
        });
        this._streams.squeeze.on('end', function () { });
        stream.pipe(this._streams.squeeze);
        callback();
    };
    GoodLogstashTcp.prototype.log = function (level, msg, meta, timestamp) {
        if (this._settings.disabled) {
            return;
        }
        var finalMeta = _.merge({}, this._settings.meta, meta);
        this._logstash.log(level, msg, finalMeta, timestamp, function () { });
    };
    return GoodLogstashTcp;
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = GoodLogstashTcp;
