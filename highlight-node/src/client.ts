import {
    getSdk,
    Sdk,
    PushBackendPayloadMutationVariables,
    InputMaybe,
    BackendErrorObjectInput,
} from './graph/generated/operations';
import ErrorStackParser from 'error-stack-parser';
import { GraphQLClient } from 'graphql-request';
import { NodeOptions } from './types';
import { ErrorContext } from './errorContext';

// Represents a stack frame with added lines of source code
// before, after, and for the line of the current error
export interface StackFrameWithSource extends Pick<
    StackFrame, 
    | 'args' 
    | 'evalOrigin'
    | 'isConstructor' 
    | 'isEval' 
    | 'isNative' 
    | 'isToplevel' 
    | 'columnNumber' 
    | 'lineNumber' 
    | 'fileName' 
    | 'functionName' 
    | 'source'> {
    lineContent?: string;
    linesBefore?: string;
    linesAfter?: string;
}

export class Highlight {
    readonly FLUSH_TIMEOUT = 10;
    _graphqlSdk: Sdk;
    _backendUrl: string;
    _intervalFunction: ReturnType<typeof setInterval>;
    errors: Array<InputMaybe<BackendErrorObjectInput>> = [];
    _errorContext: ErrorContext | undefined;

    constructor(options: NodeOptions) {
        this._backendUrl = options.backendUrl || 'https://pub.highlight.run';
        const client = new GraphQLClient(this._backendUrl, {
            headers: {},
        });
        this._graphqlSdk = getSdk(client);
        this._intervalFunction = setInterval(
            () => this.flush(),
            this.FLUSH_TIMEOUT * 1000
        );
        if (!options.disableErrorSourceContext) {
            this._errorContext = new ErrorContext({
                sourceContextCacheSizeMB: options.errorSourceContextCacheSizeMB
            });
        }
    }

    consumeCustomError(
        error: Error,
        secureSessionId: string,
        requestId: string
    ) {
        let res: StackFrameWithSource[] = [];
        try {
            res = ErrorStackParser.parse(error);
            res = res.map((frame) => {
                try {
                    if (frame.fileName !== undefined && frame.lineNumber !== undefined) {
                        const context = this._errorContext?.getStackFrameContext(frame.fileName, frame.lineNumber);
                        return { ...frame, ...context };
                    }
                } catch {}

                // If the frame doesn't have filename or line number defined, or 
                // an error was thrown while getting the stack frame context, return
                // the original frame.
                return frame;
            })
        } catch {}
        this.errors.push({
            event: error.message
                ? `${error.name}: ${error.message}`
                : `${error.name}`,
            request_id: requestId,
            session_secure_id: secureSessionId,
            source: '',
            stackTrace: JSON.stringify(res),
            timestamp: new Date().toISOString(),
            type: 'BACKEND',
            url: '',
        });
    }

    flush() {
        if (this.errors.length === 0) {
            return;
        }
        const variables: PushBackendPayloadMutationVariables = {
            errors: this.errors,
        };
        this.errors = [];
        this._graphqlSdk
            .PushBackendPayload(variables)
            .then(() => {})
            .catch((e) => {
                console.log('highlight-node error: ', e);
            });
    }
}
