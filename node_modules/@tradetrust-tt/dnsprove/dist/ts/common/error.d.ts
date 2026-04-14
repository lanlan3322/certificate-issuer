export declare enum DnsproveStatusCode {
    IDNS_QUERY_ERROR_GENERAL = 0
}
export declare class CodedError extends Error {
    code: number;
    codeString: string;
    constructor(message: string, code: DnsproveStatusCode, codeString: string);
}
