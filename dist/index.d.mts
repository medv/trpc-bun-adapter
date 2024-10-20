import { AnyRouter, inferRouterContext } from '@trpc/server';
import { FetchCreateContextFnOptions, FetchHandlerRequestOptions } from '@trpc/server/adapters/fetch';
import * as bun from 'bun';
import { Server, ServerWebSocket, WebSocketHandler, ServeOptions } from 'bun';
import { CreateContextCallback } from '@trpc/server/src/@trpc/server';
import { BaseHandlerOptions } from '@trpc/server/src/@trpc/server/http';
import { NodeHTTPCreateContextFnOptions } from '@trpc/server/src/adapters/node-http';
import { MaybePromise } from '@trpc/server/src/unstable-core-do-not-import';

type CreateBunContextOptions = FetchCreateContextFnOptions;
type BunHttpHandlerOptions<TRouter extends AnyRouter> = Omit<FetchHandlerRequestOptions<TRouter>, "req"> & {
    endpoint?: string;
    createContext?: (opts: CreateBunContextOptions) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;
};
declare function createBunHttpHandler<TRouter extends AnyRouter>(opts: BunHttpHandlerOptions<TRouter> & {
    emitWsUpgrades?: boolean;
}): (request: Request, server: Server) => Response | Promise<Response> | undefined;

type CreateBunWSSContextFnOptions<TRouter extends AnyRouter> = NodeHTTPCreateContextFnOptions<Request, ServerWebSocket<BunWSClientCtx<TRouter>>>;
type BunWSAdapterOptions<TRouter extends AnyRouter> = BaseHandlerOptions<TRouter, Request> & CreateContextCallback<inferRouterContext<TRouter>, (opts: CreateBunWSSContextFnOptions<TRouter>) => MaybePromise<inferRouterContext<TRouter>>>;
type BunWSClientCtx<TRouter extends AnyRouter> = {
    req: Request;
    abortController: AbortController;
    ctx?: Promise<inferRouterContext<TRouter>>;
    abortControllers: Map<string | number, AbortController>;
};
declare function createBunWSHandler<TRouter extends AnyRouter>(opts: BunWSAdapterOptions<TRouter>): WebSocketHandler<BunWSClientCtx<TRouter>>;

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;
declare function createBunServeHandler<TRouter extends AnyRouter>(opts: BunHttpHandlerOptions<TRouter> & BunWSAdapterOptions<TRouter>, serveOptions?: Optional<ServeOptions, "fetch">): {
    fetch(req: Request, server: Server): Promise<Response | undefined>;
    websocket: bun.WebSocketHandler<BunWSClientCtx<TRouter>>;
    error?: (this: Server, request: bun.ErrorLike) => Response | Promise<Response> | undefined | Promise<undefined>;
    id?: string | null;
    port?: string | number;
    reusePort?: boolean;
    hostname?: string;
    unix?: never;
    idleTimeout?: number;
    maxRequestBodySize?: number;
    development?: boolean;
    static?: Record<`/${string}`, Response>;
};

export { type BunHttpHandlerOptions, type BunWSAdapterOptions, type BunWSClientCtx, type CreateBunContextOptions, type CreateBunWSSContextFnOptions, createBunHttpHandler, createBunServeHandler, createBunWSHandler };
