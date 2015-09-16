/// <reference path="../typings/tsd.d.ts" />
import { Logstash } from './logstash';
export interface LogRecord {
    level: string;
    msg: string;
    meta: any;
    timestamp: string;
}
export interface GoodLogstashTcpSettings {
    disabled?: boolean;
    meta?: any;
    processor?: (payload: any) => LogRecord[];
    tlsOptions?: {
        host: string;
        port?: number;
        ca: string[];
        key: string[];
        cert: string[];
    };
}
export default class GoodLogstashTcp {
    _streams: {
        squeeze: any;
    };
    _eventQueue: any[];
    _settings: GoodLogstashTcpSettings;
    _logstash: Logstash;
    constructor(events: any, settings_: GoodLogstashTcpSettings);
    defaultProcessor(payload: any, collector?: any[], internal?: boolean, level?: string): LogRecord[];
    init(stream: any, emitter: any, callback: any): void;
    log(level: string, msg: string, meta: string, timestamp: string): void;
}
