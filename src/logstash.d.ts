/// <reference path="../typings/tsd.d.ts" />
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
export declare class Logstash implements LogstashOptions {
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
    logQueue: any[];
    connected: boolean;
    socket: any;
    connecting: boolean;
    terminating: boolean;
    silent: boolean;
    emit: (event: string, val?: any) => void;
    constructor(options: LogstashOptions);
    log(level: any, msg: any, meta: any, timestamp: any, callback: any): any;
    connect(): void;
    close(): void;
    announce(): void;
    flush(): void;
    sendLog(message: any, callback: any): void;
}
export interface LogOptions {
    timestamp: string;
    message: string;
    meta: any;
    level: string;
    nodeName: string;
    logstash: boolean;
    label: string;
    stringify?: (output: any) => string;
}
