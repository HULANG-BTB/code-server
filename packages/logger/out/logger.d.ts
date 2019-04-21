/**
 * Log level.
 */
export declare enum Level {
    Trace = 0,
    Debug = 1,
    Info = 2,
    Warning = 3,
    Error = 4
}
/**
 * A field to log.
 */
export declare class Field<T> {
    readonly identifier: string;
    readonly value: T;
    constructor(identifier: string, value: T);
    /**
     * Convert field to JSON.
     */
    toJSON(): object;
}
/**
 * Represents the time something takes.
 */
export declare class Time {
    readonly expected: number;
    readonly ms: number;
    constructor(expected: number, ms: number);
}
export declare type FieldArray = Array<Field<any> | undefined>;
export declare type LogCallback = () => [string, ...FieldArray];
/**
 * Creates a time field
 */
export declare const time: (expected: number) => Time;
export declare const field: <T>(name: string, value: T) => Field<T>;
export declare type Extender = (msg: {
    message: string;
    level: Level;
    type: "trace" | "info" | "warn" | "debug" | "error";
    fields?: FieldArray;
    section?: string;
}) => void;
/**
 * This formats & builds text for logging.
 * It should only be used to build one log item at a time since it stores the
 * currently built items and appends to that.
 */
export declare abstract class Formatter {
    protected format: string;
    protected args: string[];
    /**
     * Add a tag.
     */
    abstract tag(name: string, color: string): void;
    /**
     * Add string or arbitrary variable.
     */
    abstract push(arg: string, color?: string, weight?: string): void;
    abstract push(arg: any): void;
    abstract fields(fields: Array<Field<any>>): void;
    /**
     * Flush out the built arguments.
     */
    flush(): any[];
    /**
     * Get the format string for the value type.
     */
    protected getType(arg: any): string;
}
/**
 * Browser formatter.
 */
export declare class BrowserFormatter extends Formatter {
    tag(name: string, color: string): void;
    push(arg: any, color?: string, weight?: string): void;
    fields(fields: Array<Field<any>>): void;
}
/**
 * Server (Node) formatter.
 */
export declare class ServerFormatter extends Formatter {
    tag(name: string, color: string): void;
    push(arg: any, color?: string, weight?: string): void;
    fields(fields: Array<Field<any>>): void;
    /**
     * Convert fully-formed hex to rgb.
     */
    private hexToRgb;
}
/**
 * Class for logging.
 */
export declare class Logger {
    private _formatter;
    private readonly name?;
    private readonly defaultFields?;
    private readonly extenders;
    level: Level;
    private readonly nameColor?;
    private muted;
    constructor(_formatter: Formatter, name?: string | undefined, defaultFields?: (Field<any> | undefined)[] | undefined, extenders?: Extender[]);
    formatter: Formatter;
    /**
     * Supresses all output
     */
    mute(): void;
    extend(extender: Extender): void;
    /**
     * Outputs information.
     */
    info(fn: LogCallback): void;
    info(message: string, ...fields: FieldArray): void;
    /**
     * Outputs a warning.
     */
    warn(fn: LogCallback): void;
    warn(message: string, ...fields: FieldArray): void;
    /**
     * Outputs a trace message.
     */
    trace(fn: LogCallback): void;
    trace(message: string, ...fields: FieldArray): void;
    /**
     * Outputs a debug message.
     */
    debug(fn: LogCallback): void;
    debug(message: string, ...fields: FieldArray): void;
    /**
     * Outputs an error.
     */
    error(fn: LogCallback): void;
    error(message: string, ...fields: FieldArray): void;
    /**
     * Returns a sub-logger with a name.
     * Each name is deterministically generated a color.
     */
    named(name: string, ...fields: FieldArray): Logger;
    /**
     * Outputs a message.
     */
    private handle;
    /**
     * Hashes a string.
     */
    private djb2;
    /**
     * Convert rgb to hex.
     */
    private rgbToHex;
    /**
     * Generates a deterministic color from a string using hashing.
     */
    private hashStringToColor;
}
export declare const logger: Logger;
