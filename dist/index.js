"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  createBunHttpHandler: () => createBunHttpHandler,
  createBunServeHandler: () => createBunServeHandler,
  createBunWSHandler: () => createBunWSHandler
});
module.exports = __toCommonJS(src_exports);

// src/createBunHttpHandler.ts
var import_fetch = require("@trpc/server/adapters/fetch");
function createBunHttpHandler(opts) {
  return (request, server) => {
    const url = new URL(request.url);
    if (opts.endpoint && !url.pathname.startsWith(opts.endpoint)) {
      return;
    }
    if (opts.emitWsUpgrades && server.upgrade(request, { data: { req: request } })) {
      return new Response(null, { status: 101 });
    }
    return (0, import_fetch.fetchRequestHandler)({
      createContext: () => ({}),
      ...opts,
      req: request,
      endpoint: opts.endpoint ?? ""
    });
  };
}

// src/createBunWSHandler.ts
var import_server = require("@trpc/server");
var import_http = require("@trpc/server/http");
var import_observable = require("@trpc/server/observable");
var import_rpc = require("@trpc/server/rpc");
var import_http2 = require("@trpc/server/src/@trpc/server/http");
function createBunWSHandler(opts) {
  const { router, createContext } = opts;
  const respond = (client, untransformedJSON) => {
    client.send(
      JSON.stringify(
        (0, import_server.transformTRPCResponse)(
          opts.router._def._config,
          untransformedJSON
        )
      )
    );
  };
  async function createClientCtx(client, connectionParams) {
    const ctxPromise = createContext?.({
      req: client.data.req,
      res: client,
      info: {
        connectionParams,
        calls: [],
        isBatchCall: false,
        accept: null,
        type: "unknown",
        signal: client.data.abortController.signal
      }
    });
    try {
      return await ctxPromise;
    } catch (cause) {
      const error = (0, import_server.getTRPCErrorFromUnknown)(cause);
      opts.onError?.({
        error,
        path: void 0,
        type: "unknown",
        ctx: void 0,
        req: client.data.req,
        input: void 0
      });
      respond(client, {
        id: null,
        error: (0, import_server.getErrorShape)({
          config: router._def._config,
          error,
          type: "unknown",
          path: void 0,
          input: void 0,
          ctx: void 0
        })
      });
    }
  }
  async function handleRequest(client, msg) {
    if (!msg.id) {
      throw new import_server.TRPCError({
        code: "BAD_REQUEST",
        message: "`id` is required"
      });
    }
    if (msg.method === "subscription.stop") {
      client.data.abortControllers.get(msg.id)?.abort();
      client.data.abortControllers.delete(msg.id);
      return;
    }
    const { id, method, jsonrpc } = msg;
    const type = method;
    const { path, lastEventId } = msg.params;
    const req = client.data.req;
    const clientAbortControllers = client.data.abortControllers;
    let { input } = msg.params;
    const ctx = await client.data.ctx;
    try {
      if (lastEventId !== void 0) {
        if (isObject(input)) {
          input = {
            ...input,
            lastEventId
          };
        } else {
          input ??= {
            lastEventId
          };
        }
      }
      if (clientAbortControllers.has(id)) {
        throw new import_server.TRPCError({
          message: `Duplicate id ${id}`,
          code: "BAD_REQUEST"
        });
      }
      const abortController = new AbortController();
      const result = await (0, import_server.callProcedure)({
        procedures: router._def.procedures,
        path,
        getRawInput: () => Promise.resolve(input),
        ctx,
        type,
        signal: abortController.signal
      });
      const isIterableResult = isAsyncIterable(result) || (0, import_observable.isObservable)(result);
      if (type !== "subscription") {
        if (isIterableResult) {
          throw new import_server.TRPCError({
            code: "UNSUPPORTED_MEDIA_TYPE",
            message: `Cannot return an async iterable or observable from a ${type} procedure with WebSockets`
          });
        }
        respond(client, {
          id,
          jsonrpc,
          result: {
            type: "data",
            data: result
          }
        });
        return;
      }
      if (!isIterableResult) {
        throw new import_server.TRPCError({
          message: `Subscription ${path} did not return an observable or a AsyncGenerator`,
          code: "INTERNAL_SERVER_ERROR"
        });
      }
      if (client.readyState !== WebSocket.OPEN) {
        return;
      }
      const iterable = (0, import_observable.isObservable)(result) ? (0, import_observable.observableToAsyncIterable)(result) : result;
      const iterator = iterable[Symbol.asyncIterator]();
      const abortPromise = new Promise((resolve) => {
        abortController.signal.onabort = () => resolve("abort");
      });
      clientAbortControllers.set(id, abortController);
      run(async () => {
        while (true) {
          const next = await Promise.race([
            iterator.next().catch(import_server.getTRPCErrorFromUnknown),
            abortPromise
          ]);
          if (next === "abort") {
            await iterator.return?.();
            break;
          }
          if (next instanceof Error) {
            const error = (0, import_server.getTRPCErrorFromUnknown)(next);
            opts.onError?.({
              error,
              path,
              type,
              ctx,
              req,
              input
            });
            respond(client, {
              id,
              jsonrpc,
              error: (0, import_server.getErrorShape)({
                config: router._def._config,
                error,
                type,
                path,
                input,
                ctx
              })
            });
            break;
          }
          if (next.done) {
            break;
          }
          const result2 = {
            type: "data",
            data: next.value
          };
          if ((0, import_server.isTrackedEnvelope)(next.value)) {
            const [id2, data] = next.value;
            result2.id = id2;
            result2.data = {
              id: id2,
              data
            };
          }
          respond(client, {
            id,
            jsonrpc,
            result: result2
          });
        }
        await iterator.return?.();
        respond(client, {
          id,
          jsonrpc,
          result: {
            type: "stopped"
          }
        });
      }).catch((cause) => {
        const error = (0, import_server.getTRPCErrorFromUnknown)(cause);
        opts.onError?.({ error, path, type, ctx, req, input });
        respond(client, {
          id,
          jsonrpc,
          error: (0, import_server.getErrorShape)({
            config: router._def._config,
            error,
            type,
            path,
            input,
            ctx
          })
        });
        abortController.abort();
      }).finally(() => {
        clientAbortControllers.delete(id);
      });
      respond(client, {
        id,
        jsonrpc,
        result: {
          type: "started"
        }
      });
    } catch (cause) {
      const error = (0, import_server.getTRPCErrorFromUnknown)(cause);
      opts.onError?.({ error, path, type, ctx, req, input });
      respond(client, {
        id,
        jsonrpc,
        error: (0, import_server.getErrorShape)({
          config: router._def._config,
          error,
          type,
          path,
          input,
          ctx
        })
      });
    }
  }
  return {
    open(client) {
      client.data.abortController = new AbortController();
      client.data.abortControllers = /* @__PURE__ */ new Map();
      const connectionParams = (0, import_http2.toURL)(client.data.req.url ?? "").searchParams.get(
        "connectionParams"
      ) === "1";
      if (!connectionParams) {
        client.data.ctx = createClientCtx(client, null);
      }
    },
    async close(client) {
      client.data.abortController.abort();
      await Promise.all(
        Array.from(
          client.data.abortControllers.values(),
          (ctrl) => ctrl.abort()
        )
      );
    },
    async message(client, message) {
      const msgStr = message.toString();
      if (msgStr === "PONG") {
        return;
      }
      if (msgStr === "PING") {
        client.send("PONG");
        return;
      }
      try {
        const msgJSON = JSON.parse(msgStr);
        const msgs = Array.isArray(msgJSON) ? msgJSON : [msgJSON];
        if (!client.data.ctx) {
          const msg = msgs.shift();
          client.data.ctx = createClientCtx(
            client,
            (0, import_http.parseConnectionParamsFromUnknown)(msg.data)
          );
        }
        const promises = [];
        for (const raw of msgs) {
          const msg = (0, import_rpc.parseTRPCMessage)(
            raw,
            router._def._config.transformer
          );
          promises.push(handleRequest(client, msg));
        }
        await Promise.all(promises);
      } catch (cause) {
        const error = new import_server.TRPCError({
          code: "PARSE_ERROR",
          cause
        });
        respond(client, {
          id: null,
          error: (0, import_server.getErrorShape)({
            config: router._def._config,
            error,
            type: "unknown",
            path: void 0,
            input: void 0,
            ctx: void 0
          })
        });
      }
    }
  };
}
function isAsyncIterable(value) {
  return isObject(value) && Symbol.asyncIterator in value;
}
function run(fn) {
  return fn();
}
function isObject(value) {
  return !!value && !Array.isArray(value) && typeof value === "object";
}

// src/createBunServeHandler.ts
function createBunServeHandler(opts, serveOptions) {
  const trpcHandler = createBunHttpHandler({
    ...opts,
    emitWsUpgrades: true
  });
  return {
    ...serveOptions,
    async fetch(req, server) {
      const trpcResponse = trpcHandler(req, server);
      if (trpcResponse) {
        return trpcResponse;
      }
      return serveOptions?.fetch?.call(server, req, server);
    },
    websocket: createBunWSHandler(opts)
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createBunHttpHandler,
  createBunServeHandler,
  createBunWSHandler
});
//# sourceMappingURL=index.js.map