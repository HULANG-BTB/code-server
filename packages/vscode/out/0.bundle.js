exports.ids = [0];
exports.modules = {

/***/ "./lib/vscode/node_modules/async-limiter/index.js":
/*!********************************************************!*\
  !*** ./lib/vscode/node_modules/async-limiter/index.js ***!
  \********************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


function Queue(options) {
  if (!(this instanceof Queue)) {
    return new Queue(options);
  }

  options = options || {};
  this.concurrency = options.concurrency || Infinity;
  this.pending = 0;
  this.jobs = [];
  this.cbs = [];
  this._done = done.bind(this);
}

var arrayAddMethods = [
  'push',
  'unshift',
  'splice'
];

arrayAddMethods.forEach(function(method) {
  Queue.prototype[method] = function() {
    var methodResult = Array.prototype[method].apply(this.jobs, arguments);
    this._run();
    return methodResult;
  };
});

Object.defineProperty(Queue.prototype, 'length', {
  get: function() {
    return this.pending + this.jobs.length;
  }
});

Queue.prototype._run = function() {
  if (this.pending === this.concurrency) {
    return;
  }
  if (this.jobs.length) {
    var job = this.jobs.shift();
    this.pending++;
    job(this._done);
    this._run();
  }

  if (this.pending === 0) {
    while (this.cbs.length !== 0) {
      var cb = this.cbs.pop();
      process.nextTick(cb);
    }
  }
};

Queue.prototype.onDone = function(cb) {
  if (typeof cb === 'function') {
    this.cbs.push(cb);
    this._run();
  }
};

function done() {
  this.pending--;
  this._run();
}

module.exports = Queue;


/***/ }),

/***/ "./lib/vscode/node_modules/chrome-remote-interface/index.js":
/*!******************************************************************!*\
  !*** ./lib/vscode/node_modules/chrome-remote-interface/index.js ***!
  \******************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const EventEmitter = __webpack_require__(/*! events */ "events");

const devtools = __webpack_require__(/*! ./lib/devtools.js */ "./lib/vscode/node_modules/chrome-remote-interface/lib/devtools.js");
const Chrome = __webpack_require__(/*! ./lib/chrome.js */ "./lib/vscode/node_modules/chrome-remote-interface/lib/chrome.js");

function CDP(options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = undefined;
    }
    const notifier = new EventEmitter();
    if (typeof callback === 'function') {
        // allow to register the error callback later
        process.nextTick(() => {
            new Chrome(options, notifier);
        });
        return notifier.once('connect', callback);
    } else {
        return new Promise((fulfill, reject) => {
            notifier.once('connect', fulfill);
            notifier.once('error', reject);
            new Chrome(options, notifier);
        });
    }
}

module.exports = CDP;
module.exports.Protocol = devtools.Protocol;
module.exports.List = devtools.List;
module.exports.New = devtools.New;
module.exports.Activate = devtools.Activate;
module.exports.Close = devtools.Close;
module.exports.Version = devtools.Version;


/***/ }),

/***/ "./lib/vscode/node_modules/chrome-remote-interface/lib/api.js":
/*!********************************************************************!*\
  !*** ./lib/vscode/node_modules/chrome-remote-interface/lib/api.js ***!
  \********************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


function arrayToObject(parameters) {
    const keyValue = {};
    parameters.forEach((parameter) =>{
        const name = parameter.name;
        delete parameter.name;
        keyValue[name] = parameter;
    });
    return keyValue;
}

function decorate(to, category, object) {
    to.category = category;
    Object.keys(object).forEach((field) => {
        // skip the 'name' field as it is part of the function prototype
        if (field === 'name') {
            return;
        }
        // commands and events have parameters whereas types have properties
        if (category === 'type' && field === 'properties' ||
            field === 'parameters') {
            to[field] = arrayToObject(object[field]);
        } else {
            to[field] = object[field];
        }
    });
}

function addCommand(chrome, domainName, command) {
    const handler = (params, callback) => {
        return chrome.send(`${domainName}.${command.name}`, params, callback);
    };
    decorate(handler, 'command', command);
    chrome[domainName][command.name] = handler;
}

function addEvent(chrome, domainName, event) {
    const eventName = `${domainName}.${event.name}`;
    const handler = (handler) => {
        if (typeof handler === 'function') {
            chrome.on(eventName, handler);
            return undefined;
        } else {
            return new Promise((fulfill, reject) => {
                chrome.once(eventName, fulfill);
            });
        }
    };
    decorate(handler, 'event', event);
    chrome[domainName][event.name] = handler;
}

function addType(chrome, domainName, type) {
    const help = {};
    decorate(help, 'type', type);
    chrome[domainName][type.id] = help;
}

function prepare(object, protocol) {
    // assign the protocol and generate the shorthands
    object.protocol = protocol;
    protocol.domains.forEach((domain) => {
        const domainName = domain.domain;
        object[domainName] = {};
        // add commands
        (domain.commands || []).forEach((command) => {
            addCommand(object, domainName, command);
        });
        // add events
        (domain.events || []).forEach((event) => {
            addEvent(object, domainName, event);
        });
        // add types
        (domain.types || []).forEach((type) => {
            addType(object, domainName, type);
        });
    });
}

module.exports.prepare = prepare;


/***/ }),

/***/ "./lib/vscode/node_modules/chrome-remote-interface/lib/chrome.js":
/*!***********************************************************************!*\
  !*** ./lib/vscode/node_modules/chrome-remote-interface/lib/chrome.js ***!
  \***********************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const EventEmitter = __webpack_require__(/*! events */ "events");
const util = __webpack_require__(/*! util */ "util");
const parseUrl = __webpack_require__(/*! url */ "url").parse;

const WebSocket = __webpack_require__(/*! ws */ "./lib/vscode/node_modules/ws/index.js");

const api = __webpack_require__(/*! ./api.js */ "./lib/vscode/node_modules/chrome-remote-interface/lib/api.js");
const defaults = __webpack_require__(/*! ./defaults.js */ "./lib/vscode/node_modules/chrome-remote-interface/lib/defaults.js");
const devtools = __webpack_require__(/*! ./devtools.js */ "./lib/vscode/node_modules/chrome-remote-interface/lib/devtools.js");

class ProtocolError extends Error {
    constructor(request, response) {
        let {message} = response;
        if (response.data) {
            message += ` (${response.data})`;
        }
        super(message);
        // attach the original response as well
        this.request = request;
        this.response = response;
    }
}

class Chrome extends EventEmitter {
    constructor(options, notifier) {
        super();
        // options
        const defaultTarget = (targets) => {
            // prefer type = 'page' inspectabe targets as they represents
            // browser tabs (fall back to the first instectable target
            // otherwise)
            let backup;
            let target = targets.find((target) => {
                if (target.webSocketDebuggerUrl) {
                    backup = backup || target;
                    return target.type === 'page';
                } else {
                    return false;
                }
            });
            target = target || backup;
            if (target) {
                return target;
            } else {
                throw new Error('No inspectable targets');
            }
        };
        options = options || {};
        this.host = options.host || defaults.HOST;
        this.port = options.port || defaults.PORT;
        this.secure = !!(options.secure);
        this.protocol = options.protocol;
        this.local = !!(options.local);
        this.target = options.target || defaultTarget;
        // locals
        this._notifier = notifier;
        this._callbacks = {};
        this._nextCommandId = 1;
        // properties
        this.webSocketUrl = undefined;
        // operations
        this._start();
    }

    // avoid misinterpreting protocol's members as custom util.inspect functions
    inspect(depth, options) {
        options.customInspect = false;
        return util.inspect(this, options);
    }

    send(method, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = undefined;
        }
        // return a promise when a callback is not provided
        if (typeof callback === 'function') {
            this._enqueueCommand(method, params, callback);
            return undefined;
        } else {
            return new Promise((fulfill, reject) => {
                this._enqueueCommand(method, params, (error, response) => {
                    if (error) {
                        const request = {method, params};
                        reject(error instanceof Error
                               ? error // low-level WebSocket error
                               : new ProtocolError(request, response));
                    } else {
                        fulfill(response);
                    }
                });
            });
        }
    }

    close(callback) {
        const closeWebSocket = (callback) => {
            // don't notify on user-initiated shutdown ('disconnect' event)
            this._ws.removeAllListeners('close');
            this._ws.close();
            this._ws.once('close', () => {
                this._ws.removeAllListeners();
                callback();
            });
        };
        if (typeof callback === 'function') {
            closeWebSocket(callback);
            return undefined;
        } else {
            return new Promise((fulfill, reject) => {
                closeWebSocket(fulfill);
            });
        }
    }

    // initiate the connection process
    async _start() {
        const options = {
            host: this.host,
            port: this.port,
            secure: this.secure
        };
        try {
            // fetch the WebSocket debugger URL
            const url = await this._fetchDebuggerURL(options);
            this.webSocketUrl = url;
            // update the connection parameters using the debugging URL
            const urlObject = parseUrl(url);
            options.host = urlObject.hostname;
            options.port = urlObject.port || options.port;
            // fetch the protocol and prepare the API
            const protocol = await this._fetchProtocol(options);
            api.prepare(this, protocol);
            // finally connect to the WebSocket
            await this._connectToWebSocket();
            // since the handler is executed synchronously, the emit() must be
            // performed in the next tick so that uncaught errors in the client code
            // are not intercepted by the Promise mechanism and therefore reported
            // via the 'error' event
            process.nextTick(() => {
                this._notifier.emit('connect', this);
            });
        } catch (err) {
            this._notifier.emit('error', err);
        }
    }

    // fetch the WebSocket URL according to 'target'
    async _fetchDebuggerURL(options) {
        const userTarget = this.target;
        switch (typeof userTarget) {
        case 'string':
            {
                let idOrUrl = userTarget;
                // use default host and port if omitted (and a relative URL is specified)
                if (idOrUrl.startsWith('/')) {
                    idOrUrl = `ws://${this.host}:${this.port}${idOrUrl}`;
                }
                // a WebSocket URL is specified by the user (e.g., node-inspector)
                if (idOrUrl.match(/^wss?:/i)) {
                    return idOrUrl; // done!
                }
                // a target id is specified by the user
                else {
                    const targets = await devtools.List(options);
                    const object = targets.find((target) => target.id === idOrUrl);
                    return object.webSocketDebuggerUrl;
                }
            }
        case 'object':
            {
                const object = userTarget;
                return object.webSocketDebuggerUrl;
            }
        case 'function':
            {
                const func = userTarget;
                const targets = await devtools.List(options);
                const result = func(targets);
                const object = typeof result === 'number' ? targets[result] : result;
                return object.webSocketDebuggerUrl;
            }
        default:
            throw new Error(`Invalid target argument "${this.target}"`);
        }
    }

    // fetch the protocol according to 'protocol' and 'local'
    async _fetchProtocol(options) {
        // if a protocol has been provided then use it
        if (this.protocol) {
            return this.protocol;
        }
        // otherwise user either the local or the remote version
        else {
            options.local = this.local;
            return await devtools.Protocol(options);
        }
    }

    // establish the WebSocket connection and start processing user commands
    _connectToWebSocket() {
        return new Promise((fulfill, reject) => {
            // create the WebSocket
            try {
                if (this.secure) {
                    this.webSocketUrl = this.webSocketUrl.replace(/^ws:/i, 'wss:');
                }
                this._ws = new WebSocket(this.webSocketUrl);
            } catch (err) {
                // handles bad URLs
                reject(err);
                return;
            }
            // set up event handlers
            this._ws.on('open', () => {
                fulfill();
            });
            this._ws.on('message', (data) => {
                const message = JSON.parse(data);
                this._handleMessage(message);
            });
            this._ws.on('close', (code) => {
                this.emit('disconnect');
            });
            this._ws.on('error', (err) => {
                reject(err);
            });
        });
    }

    // handle the messages read from the WebSocket
    _handleMessage(message) {
        // command response
        if (message.id) {
            const callback = this._callbacks[message.id];
            if (!callback) {
                return;
            }
            // interpret the lack of both 'error' and 'result' as success
            // (this may happen with node-inspector)
            if (message.error) {
                callback(true, message.error);
            } else {
                callback(false, message.result || {});
            }
            // unregister command response callback
            delete this._callbacks[message.id];
            // notify when there are no more pending commands
            if (Object.keys(this._callbacks).length === 0) {
                this.emit('ready');
            }
        }
        // event
        else if (message.method) {
            this.emit('event', message);
            this.emit(message.method, message.params);
        }
    }

    // send a command to the remote endpoint and register a callback for the reply
    _enqueueCommand(method, params, callback) {
        const id = this._nextCommandId++;
        const message = {
            id, method,
            params: params || {}
        };
        this._ws.send(JSON.stringify(message), (err) => {
            if (err) {
                // handle low-level WebSocket errors
                if (typeof callback === 'function') {
                    callback(err);
                }
            } else {
                this._callbacks[id] = callback;
            }
        });
    }
}

module.exports = Chrome;


/***/ }),

/***/ "./lib/vscode/node_modules/chrome-remote-interface/lib/defaults.js":
/*!*************************************************************************!*\
  !*** ./lib/vscode/node_modules/chrome-remote-interface/lib/defaults.js ***!
  \*************************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports.HOST = 'localhost';
module.exports.PORT = 9222;


/***/ }),

/***/ "./lib/vscode/node_modules/chrome-remote-interface/lib/devtools.js":
/*!*************************************************************************!*\
  !*** ./lib/vscode/node_modules/chrome-remote-interface/lib/devtools.js ***!
  \*************************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const http = __webpack_require__(/*! http */ "http");
const https = __webpack_require__(/*! https */ "https");

const defaults = __webpack_require__(/*! ./defaults.js */ "./lib/vscode/node_modules/chrome-remote-interface/lib/defaults.js");
const externalRequest = __webpack_require__(/*! ./external-request.js */ "./lib/vscode/node_modules/chrome-remote-interface/lib/external-request.js");

// options.path must be specified; callback(err, data)
function devToolsInterface(options, callback) {
    options.host = options.host || defaults.HOST;
    options.port = options.port || defaults.PORT;
    options.secure = !!(options.secure);
    externalRequest(options.secure ? https : http, options, callback);
}

// wrapper that allows to return a promise if the callback is omitted, it works
// for DevTools methods
function promisesWrapper(func) {
    return (options, callback) => {
        // options is an optional argument
        if (typeof options === 'function') {
            callback = options;
            options = undefined;
        }
        options = options || {};
        // just call the function otherwise wrap a promise around its execution
        if (typeof callback === 'function') {
            func(options, callback);
            return undefined;
        } else {
            return new Promise((fulfill, reject) => {
                func(options, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        fulfill(result);
                    }
                });
            });
        }
    };
}

function Protocol(options, callback) {
    // if the local protocol is requested
    if (options.local) {
        const localDescriptor = __webpack_require__(/*! ./protocol.json */ "./lib/vscode/node_modules/chrome-remote-interface/lib/protocol.json");
        callback(null, localDescriptor);
        return;
    }
    // try to fecth the protocol remotely
    options.path = '/json/protocol';
    devToolsInterface(options, (err, descriptor) => {
        if (err) {
            callback(err);
        } else {
            callback(null, JSON.parse(descriptor));
        }
    });
}

function List(options, callback) {
    options.path = '/json/list';
    devToolsInterface(options, (err, tabs) => {
        if (err) {
            callback(err);
        } else {
            callback(null, JSON.parse(tabs));
        }
    });
}

function New(options, callback) {
    options.path = '/json/new';
    if (Object.prototype.hasOwnProperty.call(options, 'url')) {
        options.path += `?${options.url}`;
    }
    devToolsInterface(options, (err, tab) => {
        if (err) {
            callback(err);
        } else {
            callback(null, JSON.parse(tab));
        }
    });
}

function Activate(options, callback) {
    options.path = '/json/activate/' + options.id;
    devToolsInterface(options, (err) => {
        if (err) {
            callback(err);
        } else {
            callback(null);
        }
    });
}

function Close(options, callback) {
    options.path = '/json/close/' + options.id;
    devToolsInterface(options, (err) => {
        if (err) {
            callback(err);
        } else {
            callback(null);
        }
    });
}

function Version(options, callback) {
    options.path = '/json/version';
    devToolsInterface(options, (err, versionInfo) => {
        if (err) {
            callback(err);
        } else {
            callback(null, JSON.parse(versionInfo));
        }
    });
}

module.exports.Protocol = promisesWrapper(Protocol);
module.exports.List = promisesWrapper(List);
module.exports.New = promisesWrapper(New);
module.exports.Activate = promisesWrapper(Activate);
module.exports.Close = promisesWrapper(Close);
module.exports.Version = promisesWrapper(Version);


/***/ }),

/***/ "./lib/vscode/node_modules/chrome-remote-interface/lib/external-request.js":
/*!*********************************************************************************!*\
  !*** ./lib/vscode/node_modules/chrome-remote-interface/lib/external-request.js ***!
  \*********************************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const dns = __webpack_require__(/*! dns */ "dns");

const REQUEST_TIMEOUT = 10000;

// callback(err, data)
function externalRequest(transport, options, callback) {
    // perform the DNS lookup manually so that the HTTP host header generated by
    // http.get will contain the IP address, this is needed because since Chrome
    // 66 the host header cannot contain an host name different than localhost
    // (see https://github.com/cyrus-and/chrome-remote-interface/issues/340)
    dns.lookup(options.host, (err, address) => {
        if (err) {
            callback(err);
            return;
        }
        const resolved = Object.assign({}, options);
        resolved.host = address;
        const request = transport.get(resolved, (response) => {
            let data = '';
            response.on('data', (chunk) => {
                data += chunk;
            });
            response.on('end', () => {
                if (response.statusCode === 200) {
                    callback(null, data);
                } else {
                    callback(new Error(data));
                }
            });
        });
        request.setTimeout(REQUEST_TIMEOUT, () => {
            request.abort();
        });
        request.on('error', callback);
    });
}

module.exports = externalRequest;


/***/ }),

/***/ "./lib/vscode/node_modules/chrome-remote-interface/lib/protocol.json":
/*!***************************************************************************!*\
  !*** ./lib/vscode/node_modules/chrome-remote-interface/lib/protocol.json ***!
  \***************************************************************************/
/*! exports provided: version, domains, default */
/***/ (function(module) {

module.exports = {"version":{"major":"1","minor":"3"},"domains":[{"domain":"Accessibility","experimental":true,"dependencies":["DOM"],"types":[{"id":"AXNodeId","description":"Unique accessibility node identifier.","type":"string"},{"id":"AXValueType","description":"Enum of possible property types.","type":"string","enum":["boolean","tristate","booleanOrUndefined","idref","idrefList","integer","node","nodeList","number","string","computedString","token","tokenList","domRelation","role","internalRole","valueUndefined"]},{"id":"AXValueSourceType","description":"Enum of possible property sources.","type":"string","enum":["attribute","implicit","style","contents","placeholder","relatedElement"]},{"id":"AXValueNativeSourceType","description":"Enum of possible native property sources (as a subtype of a particular AXValueSourceType).","type":"string","enum":["figcaption","label","labelfor","labelwrapped","legend","tablecaption","title","other"]},{"id":"AXValueSource","description":"A single source for a computed AX property.","type":"object","properties":[{"name":"type","description":"What type of source this is.","$ref":"AXValueSourceType"},{"name":"value","description":"The value of this property source.","optional":true,"$ref":"AXValue"},{"name":"attribute","description":"The name of the relevant attribute, if any.","optional":true,"type":"string"},{"name":"attributeValue","description":"The value of the relevant attribute, if any.","optional":true,"$ref":"AXValue"},{"name":"superseded","description":"Whether this source is superseded by a higher priority source.","optional":true,"type":"boolean"},{"name":"nativeSource","description":"The native markup source for this value, e.g. a <label> element.","optional":true,"$ref":"AXValueNativeSourceType"},{"name":"nativeSourceValue","description":"The value, such as a node or node list, of the native source.","optional":true,"$ref":"AXValue"},{"name":"invalid","description":"Whether the value for this property is invalid.","optional":true,"type":"boolean"},{"name":"invalidReason","description":"Reason for the value being invalid, if it is.","optional":true,"type":"string"}]},{"id":"AXRelatedNode","type":"object","properties":[{"name":"backendDOMNodeId","description":"The BackendNodeId of the related DOM node.","$ref":"DOM.BackendNodeId"},{"name":"idref","description":"The IDRef value provided, if any.","optional":true,"type":"string"},{"name":"text","description":"The text alternative of this node in the current context.","optional":true,"type":"string"}]},{"id":"AXProperty","type":"object","properties":[{"name":"name","description":"The name of this property.","$ref":"AXPropertyName"},{"name":"value","description":"The value of this property.","$ref":"AXValue"}]},{"id":"AXValue","description":"A single computed AX property.","type":"object","properties":[{"name":"type","description":"The type of this value.","$ref":"AXValueType"},{"name":"value","description":"The computed value of this property.","optional":true,"type":"any"},{"name":"relatedNodes","description":"One or more related nodes, if applicable.","optional":true,"type":"array","items":{"$ref":"AXRelatedNode"}},{"name":"sources","description":"The sources which contributed to the computation of this property.","optional":true,"type":"array","items":{"$ref":"AXValueSource"}}]},{"id":"AXPropertyName","description":"Values of AXProperty name: from 'busy' to 'roledescription' - states which apply to every AX\nnode, from 'live' to 'root' - attributes which apply to nodes in live regions, from\n'autocomplete' to 'valuetext' - attributes which apply to widgets, from 'checked' to 'selected'\n- states which apply to widgets, from 'activedescendant' to 'owns' - relationships between\nelements other than parent/child/sibling.","type":"string","enum":["busy","disabled","hidden","hiddenRoot","invalid","keyshortcuts","roledescription","live","atomic","relevant","root","autocomplete","hasPopup","level","multiselectable","orientation","multiline","readonly","required","valuemin","valuemax","valuetext","checked","expanded","modal","pressed","selected","activedescendant","controls","describedby","details","errormessage","flowto","labelledby","owns"]},{"id":"AXNode","description":"A node in the accessibility tree.","type":"object","properties":[{"name":"nodeId","description":"Unique identifier for this node.","$ref":"AXNodeId"},{"name":"ignored","description":"Whether this node is ignored for accessibility","type":"boolean"},{"name":"ignoredReasons","description":"Collection of reasons why this node is hidden.","optional":true,"type":"array","items":{"$ref":"AXProperty"}},{"name":"role","description":"This `Node`'s role, whether explicit or implicit.","optional":true,"$ref":"AXValue"},{"name":"name","description":"The accessible name for this `Node`.","optional":true,"$ref":"AXValue"},{"name":"description","description":"The accessible description for this `Node`.","optional":true,"$ref":"AXValue"},{"name":"value","description":"The value for this `Node`.","optional":true,"$ref":"AXValue"},{"name":"properties","description":"All other properties","optional":true,"type":"array","items":{"$ref":"AXProperty"}},{"name":"childIds","description":"IDs for each of this node's child nodes.","optional":true,"type":"array","items":{"$ref":"AXNodeId"}},{"name":"backendDOMNodeId","description":"The backend ID for the associated DOM node, if any.","optional":true,"$ref":"DOM.BackendNodeId"}]}],"commands":[{"name":"getPartialAXTree","description":"Fetches the accessibility node and partial accessibility tree for this DOM node, if it exists.","experimental":true,"parameters":[{"name":"nodeId","description":"Identifier of the node to get the partial accessibility tree for.","optional":true,"$ref":"DOM.NodeId"},{"name":"backendNodeId","description":"Identifier of the backend node to get the partial accessibility tree for.","optional":true,"$ref":"DOM.BackendNodeId"},{"name":"objectId","description":"JavaScript object id of the node wrapper to get the partial accessibility tree for.","optional":true,"$ref":"Runtime.RemoteObjectId"},{"name":"fetchRelatives","description":"Whether to fetch this nodes ancestors, siblings and children. Defaults to true.","optional":true,"type":"boolean"}],"returns":[{"name":"nodes","description":"The `Accessibility.AXNode` for this DOM node, if it exists, plus its ancestors, siblings and\nchildren, if requested.","type":"array","items":{"$ref":"AXNode"}}]}]},{"domain":"Animation","experimental":true,"dependencies":["Runtime","DOM"],"types":[{"id":"Animation","description":"Animation instance.","type":"object","properties":[{"name":"id","description":"`Animation`'s id.","type":"string"},{"name":"name","description":"`Animation`'s name.","type":"string"},{"name":"pausedState","description":"`Animation`'s internal paused state.","type":"boolean"},{"name":"playState","description":"`Animation`'s play state.","type":"string"},{"name":"playbackRate","description":"`Animation`'s playback rate.","type":"number"},{"name":"startTime","description":"`Animation`'s start time.","type":"number"},{"name":"currentTime","description":"`Animation`'s current time.","type":"number"},{"name":"type","description":"Animation type of `Animation`.","type":"string","enum":["CSSTransition","CSSAnimation","WebAnimation"]},{"name":"source","description":"`Animation`'s source animation node.","optional":true,"$ref":"AnimationEffect"},{"name":"cssId","description":"A unique ID for `Animation` representing the sources that triggered this CSS\nanimation/transition.","optional":true,"type":"string"}]},{"id":"AnimationEffect","description":"AnimationEffect instance","type":"object","properties":[{"name":"delay","description":"`AnimationEffect`'s delay.","type":"number"},{"name":"endDelay","description":"`AnimationEffect`'s end delay.","type":"number"},{"name":"iterationStart","description":"`AnimationEffect`'s iteration start.","type":"number"},{"name":"iterations","description":"`AnimationEffect`'s iterations.","type":"number"},{"name":"duration","description":"`AnimationEffect`'s iteration duration.","type":"number"},{"name":"direction","description":"`AnimationEffect`'s playback direction.","type":"string"},{"name":"fill","description":"`AnimationEffect`'s fill mode.","type":"string"},{"name":"backendNodeId","description":"`AnimationEffect`'s target node.","optional":true,"$ref":"DOM.BackendNodeId"},{"name":"keyframesRule","description":"`AnimationEffect`'s keyframes.","optional":true,"$ref":"KeyframesRule"},{"name":"easing","description":"`AnimationEffect`'s timing function.","type":"string"}]},{"id":"KeyframesRule","description":"Keyframes Rule","type":"object","properties":[{"name":"name","description":"CSS keyframed animation's name.","optional":true,"type":"string"},{"name":"keyframes","description":"List of animation keyframes.","type":"array","items":{"$ref":"KeyframeStyle"}}]},{"id":"KeyframeStyle","description":"Keyframe Style","type":"object","properties":[{"name":"offset","description":"Keyframe's time offset.","type":"string"},{"name":"easing","description":"`AnimationEffect`'s timing function.","type":"string"}]}],"commands":[{"name":"disable","description":"Disables animation domain notifications."},{"name":"enable","description":"Enables animation domain notifications."},{"name":"getCurrentTime","description":"Returns the current time of the an animation.","parameters":[{"name":"id","description":"Id of animation.","type":"string"}],"returns":[{"name":"currentTime","description":"Current time of the page.","type":"number"}]},{"name":"getPlaybackRate","description":"Gets the playback rate of the document timeline.","returns":[{"name":"playbackRate","description":"Playback rate for animations on page.","type":"number"}]},{"name":"releaseAnimations","description":"Releases a set of animations to no longer be manipulated.","parameters":[{"name":"animations","description":"List of animation ids to seek.","type":"array","items":{"type":"string"}}]},{"name":"resolveAnimation","description":"Gets the remote object of the Animation.","parameters":[{"name":"animationId","description":"Animation id.","type":"string"}],"returns":[{"name":"remoteObject","description":"Corresponding remote object.","$ref":"Runtime.RemoteObject"}]},{"name":"seekAnimations","description":"Seek a set of animations to a particular time within each animation.","parameters":[{"name":"animations","description":"List of animation ids to seek.","type":"array","items":{"type":"string"}},{"name":"currentTime","description":"Set the current time of each animation.","type":"number"}]},{"name":"setPaused","description":"Sets the paused state of a set of animations.","parameters":[{"name":"animations","description":"Animations to set the pause state of.","type":"array","items":{"type":"string"}},{"name":"paused","description":"Paused state to set to.","type":"boolean"}]},{"name":"setPlaybackRate","description":"Sets the playback rate of the document timeline.","parameters":[{"name":"playbackRate","description":"Playback rate for animations on page","type":"number"}]},{"name":"setTiming","description":"Sets the timing of an animation node.","parameters":[{"name":"animationId","description":"Animation id.","type":"string"},{"name":"duration","description":"Duration of the animation.","type":"number"},{"name":"delay","description":"Delay of the animation.","type":"number"}]}],"events":[{"name":"animationCanceled","description":"Event for when an animation has been cancelled.","parameters":[{"name":"id","description":"Id of the animation that was cancelled.","type":"string"}]},{"name":"animationCreated","description":"Event for each animation that has been created.","parameters":[{"name":"id","description":"Id of the animation that was created.","type":"string"}]},{"name":"animationStarted","description":"Event for animation that has been started.","parameters":[{"name":"animation","description":"Animation that was started.","$ref":"Animation"}]}]},{"domain":"ApplicationCache","experimental":true,"types":[{"id":"ApplicationCacheResource","description":"Detailed application cache resource information.","type":"object","properties":[{"name":"url","description":"Resource url.","type":"string"},{"name":"size","description":"Resource size.","type":"integer"},{"name":"type","description":"Resource type.","type":"string"}]},{"id":"ApplicationCache","description":"Detailed application cache information.","type":"object","properties":[{"name":"manifestURL","description":"Manifest URL.","type":"string"},{"name":"size","description":"Application cache size.","type":"number"},{"name":"creationTime","description":"Application cache creation time.","type":"number"},{"name":"updateTime","description":"Application cache update time.","type":"number"},{"name":"resources","description":"Application cache resources.","type":"array","items":{"$ref":"ApplicationCacheResource"}}]},{"id":"FrameWithManifest","description":"Frame identifier - manifest URL pair.","type":"object","properties":[{"name":"frameId","description":"Frame identifier.","$ref":"Page.FrameId"},{"name":"manifestURL","description":"Manifest URL.","type":"string"},{"name":"status","description":"Application cache status.","type":"integer"}]}],"commands":[{"name":"enable","description":"Enables application cache domain notifications."},{"name":"getApplicationCacheForFrame","description":"Returns relevant application cache data for the document in given frame.","parameters":[{"name":"frameId","description":"Identifier of the frame containing document whose application cache is retrieved.","$ref":"Page.FrameId"}],"returns":[{"name":"applicationCache","description":"Relevant application cache data for the document in given frame.","$ref":"ApplicationCache"}]},{"name":"getFramesWithManifests","description":"Returns array of frame identifiers with manifest urls for each frame containing a document\nassociated with some application cache.","returns":[{"name":"frameIds","description":"Array of frame identifiers with manifest urls for each frame containing a document\nassociated with some application cache.","type":"array","items":{"$ref":"FrameWithManifest"}}]},{"name":"getManifestForFrame","description":"Returns manifest URL for document in the given frame.","parameters":[{"name":"frameId","description":"Identifier of the frame containing document whose manifest is retrieved.","$ref":"Page.FrameId"}],"returns":[{"name":"manifestURL","description":"Manifest URL for document in the given frame.","type":"string"}]}],"events":[{"name":"applicationCacheStatusUpdated","parameters":[{"name":"frameId","description":"Identifier of the frame containing document whose application cache updated status.","$ref":"Page.FrameId"},{"name":"manifestURL","description":"Manifest URL.","type":"string"},{"name":"status","description":"Updated application cache status.","type":"integer"}]},{"name":"networkStateUpdated","parameters":[{"name":"isNowOnline","type":"boolean"}]}]},{"domain":"Audits","description":"Audits domain allows investigation of page violations and possible improvements.","experimental":true,"dependencies":["Network"],"commands":[{"name":"getEncodedResponse","description":"Returns the response body and size if it were re-encoded with the specified settings. Only\napplies to images.","parameters":[{"name":"requestId","description":"Identifier of the network request to get content for.","$ref":"Network.RequestId"},{"name":"encoding","description":"The encoding to use.","type":"string","enum":["webp","jpeg","png"]},{"name":"quality","description":"The quality of the encoding (0-1). (defaults to 1)","optional":true,"type":"number"},{"name":"sizeOnly","description":"Whether to only return the size information (defaults to false).","optional":true,"type":"boolean"}],"returns":[{"name":"body","description":"The encoded body as a base64 string. Omitted if sizeOnly is true.","optional":true,"type":"string"},{"name":"originalSize","description":"Size before re-encoding.","type":"integer"},{"name":"encodedSize","description":"Size after re-encoding.","type":"integer"}]}]},{"domain":"Browser","description":"The Browser domain defines methods and events for browser managing.","types":[{"id":"WindowID","experimental":true,"type":"integer"},{"id":"WindowState","description":"The state of the browser window.","experimental":true,"type":"string","enum":["normal","minimized","maximized","fullscreen"]},{"id":"Bounds","description":"Browser window bounds information","experimental":true,"type":"object","properties":[{"name":"left","description":"The offset from the left edge of the screen to the window in pixels.","optional":true,"type":"integer"},{"name":"top","description":"The offset from the top edge of the screen to the window in pixels.","optional":true,"type":"integer"},{"name":"width","description":"The window width in pixels.","optional":true,"type":"integer"},{"name":"height","description":"The window height in pixels.","optional":true,"type":"integer"},{"name":"windowState","description":"The window state. Default to normal.","optional":true,"$ref":"WindowState"}]},{"id":"Bucket","description":"Chrome histogram bucket.","experimental":true,"type":"object","properties":[{"name":"low","description":"Minimum value (inclusive).","type":"integer"},{"name":"high","description":"Maximum value (exclusive).","type":"integer"},{"name":"count","description":"Number of samples.","type":"integer"}]},{"id":"Histogram","description":"Chrome histogram.","experimental":true,"type":"object","properties":[{"name":"name","description":"Name.","type":"string"},{"name":"sum","description":"Sum of sample values.","type":"integer"},{"name":"count","description":"Total number of samples.","type":"integer"},{"name":"buckets","description":"Buckets.","type":"array","items":{"$ref":"Bucket"}}]}],"commands":[{"name":"close","description":"Close browser gracefully."},{"name":"getVersion","description":"Returns version information.","returns":[{"name":"protocolVersion","description":"Protocol version.","type":"string"},{"name":"product","description":"Product name.","type":"string"},{"name":"revision","description":"Product revision.","type":"string"},{"name":"userAgent","description":"User-Agent.","type":"string"},{"name":"jsVersion","description":"V8 version.","type":"string"}]},{"name":"getBrowserCommandLine","description":"Returns the command line switches for the browser process if, and only if\n--enable-automation is on the commandline.","experimental":true,"returns":[{"name":"arguments","description":"Commandline parameters","type":"array","items":{"type":"string"}}]},{"name":"getHistograms","description":"Get Chrome histograms.","experimental":true,"parameters":[{"name":"query","description":"Requested substring in name. Only histograms which have query as a\nsubstring in their name are extracted. An empty or absent query returns\nall histograms.","optional":true,"type":"string"},{"name":"delta","description":"If true, retrieve delta since last call.","optional":true,"type":"boolean"}],"returns":[{"name":"histograms","description":"Histograms.","type":"array","items":{"$ref":"Histogram"}}]},{"name":"getHistogram","description":"Get a Chrome histogram by name.","experimental":true,"parameters":[{"name":"name","description":"Requested histogram name.","type":"string"},{"name":"delta","description":"If true, retrieve delta since last call.","optional":true,"type":"boolean"}],"returns":[{"name":"histogram","description":"Histogram.","$ref":"Histogram"}]},{"name":"getWindowBounds","description":"Get position and size of the browser window.","experimental":true,"parameters":[{"name":"windowId","description":"Browser window id.","$ref":"WindowID"}],"returns":[{"name":"bounds","description":"Bounds information of the window. When window state is 'minimized', the restored window\nposition and size are returned.","$ref":"Bounds"}]},{"name":"getWindowForTarget","description":"Get the browser window that contains the devtools target.","experimental":true,"parameters":[{"name":"targetId","description":"Devtools agent host id.","$ref":"Target.TargetID"}],"returns":[{"name":"windowId","description":"Browser window id.","$ref":"WindowID"},{"name":"bounds","description":"Bounds information of the window. When window state is 'minimized', the restored window\nposition and size are returned.","$ref":"Bounds"}]},{"name":"setWindowBounds","description":"Set position and/or size of the browser window.","experimental":true,"parameters":[{"name":"windowId","description":"Browser window id.","$ref":"WindowID"},{"name":"bounds","description":"New window bounds. The 'minimized', 'maximized' and 'fullscreen' states cannot be combined\nwith 'left', 'top', 'width' or 'height'. Leaves unspecified fields unchanged.","$ref":"Bounds"}]}]},{"domain":"CSS","description":"This domain exposes CSS read/write operations. All CSS objects (stylesheets, rules, and styles)\nhave an associated `id` used in subsequent operations on the related object. Each object type has\na specific `id` structure, and those are not interchangeable between objects of different kinds.\nCSS objects can be loaded using the `get*ForNode()` calls (which accept a DOM node id). A client\ncan also keep track of stylesheets via the `styleSheetAdded`/`styleSheetRemoved` events and\nsubsequently load the required stylesheet contents using the `getStyleSheet[Text]()` methods.","experimental":true,"dependencies":["DOM"],"types":[{"id":"StyleSheetId","type":"string"},{"id":"StyleSheetOrigin","description":"Stylesheet type: \"injected\" for stylesheets injected via extension, \"user-agent\" for user-agent\nstylesheets, \"inspector\" for stylesheets created by the inspector (i.e. those holding the \"via\ninspector\" rules), \"regular\" for regular stylesheets.","type":"string","enum":["injected","user-agent","inspector","regular"]},{"id":"PseudoElementMatches","description":"CSS rule collection for a single pseudo style.","type":"object","properties":[{"name":"pseudoType","description":"Pseudo element type.","$ref":"DOM.PseudoType"},{"name":"matches","description":"Matches of CSS rules applicable to the pseudo style.","type":"array","items":{"$ref":"RuleMatch"}}]},{"id":"InheritedStyleEntry","description":"Inherited CSS rule collection from ancestor node.","type":"object","properties":[{"name":"inlineStyle","description":"The ancestor node's inline style, if any, in the style inheritance chain.","optional":true,"$ref":"CSSStyle"},{"name":"matchedCSSRules","description":"Matches of CSS rules matching the ancestor node in the style inheritance chain.","type":"array","items":{"$ref":"RuleMatch"}}]},{"id":"RuleMatch","description":"Match data for a CSS rule.","type":"object","properties":[{"name":"rule","description":"CSS rule in the match.","$ref":"CSSRule"},{"name":"matchingSelectors","description":"Matching selector indices in the rule's selectorList selectors (0-based).","type":"array","items":{"type":"integer"}}]},{"id":"Value","description":"Data for a simple selector (these are delimited by commas in a selector list).","type":"object","properties":[{"name":"text","description":"Value text.","type":"string"},{"name":"range","description":"Value range in the underlying resource (if available).","optional":true,"$ref":"SourceRange"}]},{"id":"SelectorList","description":"Selector list data.","type":"object","properties":[{"name":"selectors","description":"Selectors in the list.","type":"array","items":{"$ref":"Value"}},{"name":"text","description":"Rule selector text.","type":"string"}]},{"id":"CSSStyleSheetHeader","description":"CSS stylesheet metainformation.","type":"object","properties":[{"name":"styleSheetId","description":"The stylesheet identifier.","$ref":"StyleSheetId"},{"name":"frameId","description":"Owner frame identifier.","$ref":"Page.FrameId"},{"name":"sourceURL","description":"Stylesheet resource URL.","type":"string"},{"name":"sourceMapURL","description":"URL of source map associated with the stylesheet (if any).","optional":true,"type":"string"},{"name":"origin","description":"Stylesheet origin.","$ref":"StyleSheetOrigin"},{"name":"title","description":"Stylesheet title.","type":"string"},{"name":"ownerNode","description":"The backend id for the owner node of the stylesheet.","optional":true,"$ref":"DOM.BackendNodeId"},{"name":"disabled","description":"Denotes whether the stylesheet is disabled.","type":"boolean"},{"name":"hasSourceURL","description":"Whether the sourceURL field value comes from the sourceURL comment.","optional":true,"type":"boolean"},{"name":"isInline","description":"Whether this stylesheet is created for STYLE tag by parser. This flag is not set for\ndocument.written STYLE tags.","type":"boolean"},{"name":"startLine","description":"Line offset of the stylesheet within the resource (zero based).","type":"number"},{"name":"startColumn","description":"Column offset of the stylesheet within the resource (zero based).","type":"number"},{"name":"length","description":"Size of the content (in characters).","type":"number"}]},{"id":"CSSRule","description":"CSS rule representation.","type":"object","properties":[{"name":"styleSheetId","description":"The css style sheet identifier (absent for user agent stylesheet and user-specified\nstylesheet rules) this rule came from.","optional":true,"$ref":"StyleSheetId"},{"name":"selectorList","description":"Rule selector data.","$ref":"SelectorList"},{"name":"origin","description":"Parent stylesheet's origin.","$ref":"StyleSheetOrigin"},{"name":"style","description":"Associated style declaration.","$ref":"CSSStyle"},{"name":"media","description":"Media list array (for rules involving media queries). The array enumerates media queries\nstarting with the innermost one, going outwards.","optional":true,"type":"array","items":{"$ref":"CSSMedia"}}]},{"id":"RuleUsage","description":"CSS coverage information.","type":"object","properties":[{"name":"styleSheetId","description":"The css style sheet identifier (absent for user agent stylesheet and user-specified\nstylesheet rules) this rule came from.","$ref":"StyleSheetId"},{"name":"startOffset","description":"Offset of the start of the rule (including selector) from the beginning of the stylesheet.","type":"number"},{"name":"endOffset","description":"Offset of the end of the rule body from the beginning of the stylesheet.","type":"number"},{"name":"used","description":"Indicates whether the rule was actually used by some element in the page.","type":"boolean"}]},{"id":"SourceRange","description":"Text range within a resource. All numbers are zero-based.","type":"object","properties":[{"name":"startLine","description":"Start line of range.","type":"integer"},{"name":"startColumn","description":"Start column of range (inclusive).","type":"integer"},{"name":"endLine","description":"End line of range","type":"integer"},{"name":"endColumn","description":"End column of range (exclusive).","type":"integer"}]},{"id":"ShorthandEntry","type":"object","properties":[{"name":"name","description":"Shorthand name.","type":"string"},{"name":"value","description":"Shorthand value.","type":"string"},{"name":"important","description":"Whether the property has \"!important\" annotation (implies `false` if absent).","optional":true,"type":"boolean"}]},{"id":"CSSComputedStyleProperty","type":"object","properties":[{"name":"name","description":"Computed style property name.","type":"string"},{"name":"value","description":"Computed style property value.","type":"string"}]},{"id":"CSSStyle","description":"CSS style representation.","type":"object","properties":[{"name":"styleSheetId","description":"The css style sheet identifier (absent for user agent stylesheet and user-specified\nstylesheet rules) this rule came from.","optional":true,"$ref":"StyleSheetId"},{"name":"cssProperties","description":"CSS properties in the style.","type":"array","items":{"$ref":"CSSProperty"}},{"name":"shorthandEntries","description":"Computed values for all shorthands found in the style.","type":"array","items":{"$ref":"ShorthandEntry"}},{"name":"cssText","description":"Style declaration text (if available).","optional":true,"type":"string"},{"name":"range","description":"Style declaration range in the enclosing stylesheet (if available).","optional":true,"$ref":"SourceRange"}]},{"id":"CSSProperty","description":"CSS property declaration data.","type":"object","properties":[{"name":"name","description":"The property name.","type":"string"},{"name":"value","description":"The property value.","type":"string"},{"name":"important","description":"Whether the property has \"!important\" annotation (implies `false` if absent).","optional":true,"type":"boolean"},{"name":"implicit","description":"Whether the property is implicit (implies `false` if absent).","optional":true,"type":"boolean"},{"name":"text","description":"The full property text as specified in the style.","optional":true,"type":"string"},{"name":"parsedOk","description":"Whether the property is understood by the browser (implies `true` if absent).","optional":true,"type":"boolean"},{"name":"disabled","description":"Whether the property is disabled by the user (present for source-based properties only).","optional":true,"type":"boolean"},{"name":"range","description":"The entire property range in the enclosing style declaration (if available).","optional":true,"$ref":"SourceRange"}]},{"id":"CSSMedia","description":"CSS media rule descriptor.","type":"object","properties":[{"name":"text","description":"Media query text.","type":"string"},{"name":"source","description":"Source of the media query: \"mediaRule\" if specified by a @media rule, \"importRule\" if\nspecified by an @import rule, \"linkedSheet\" if specified by a \"media\" attribute in a linked\nstylesheet's LINK tag, \"inlineSheet\" if specified by a \"media\" attribute in an inline\nstylesheet's STYLE tag.","type":"string","enum":["mediaRule","importRule","linkedSheet","inlineSheet"]},{"name":"sourceURL","description":"URL of the document containing the media query description.","optional":true,"type":"string"},{"name":"range","description":"The associated rule (@media or @import) header range in the enclosing stylesheet (if\navailable).","optional":true,"$ref":"SourceRange"},{"name":"styleSheetId","description":"Identifier of the stylesheet containing this object (if exists).","optional":true,"$ref":"StyleSheetId"},{"name":"mediaList","description":"Array of media queries.","optional":true,"type":"array","items":{"$ref":"MediaQuery"}}]},{"id":"MediaQuery","description":"Media query descriptor.","type":"object","properties":[{"name":"expressions","description":"Array of media query expressions.","type":"array","items":{"$ref":"MediaQueryExpression"}},{"name":"active","description":"Whether the media query condition is satisfied.","type":"boolean"}]},{"id":"MediaQueryExpression","description":"Media query expression descriptor.","type":"object","properties":[{"name":"value","description":"Media query expression value.","type":"number"},{"name":"unit","description":"Media query expression units.","type":"string"},{"name":"feature","description":"Media query expression feature.","type":"string"},{"name":"valueRange","description":"The associated range of the value text in the enclosing stylesheet (if available).","optional":true,"$ref":"SourceRange"},{"name":"computedLength","description":"Computed length of media query expression (if applicable).","optional":true,"type":"number"}]},{"id":"PlatformFontUsage","description":"Information about amount of glyphs that were rendered with given font.","type":"object","properties":[{"name":"familyName","description":"Font's family name reported by platform.","type":"string"},{"name":"isCustomFont","description":"Indicates if the font was downloaded or resolved locally.","type":"boolean"},{"name":"glyphCount","description":"Amount of glyphs that were rendered with this font.","type":"number"}]},{"id":"FontFace","description":"Properties of a web font: https://www.w3.org/TR/2008/REC-CSS2-20080411/fonts.html#font-descriptions","type":"object","properties":[{"name":"fontFamily","description":"The font-family.","type":"string"},{"name":"fontStyle","description":"The font-style.","type":"string"},{"name":"fontVariant","description":"The font-variant.","type":"string"},{"name":"fontWeight","description":"The font-weight.","type":"string"},{"name":"fontStretch","description":"The font-stretch.","type":"string"},{"name":"unicodeRange","description":"The unicode-range.","type":"string"},{"name":"src","description":"The src.","type":"string"},{"name":"platformFontFamily","description":"The resolved platform font family","type":"string"}]},{"id":"CSSKeyframesRule","description":"CSS keyframes rule representation.","type":"object","properties":[{"name":"animationName","description":"Animation name.","$ref":"Value"},{"name":"keyframes","description":"List of keyframes.","type":"array","items":{"$ref":"CSSKeyframeRule"}}]},{"id":"CSSKeyframeRule","description":"CSS keyframe rule representation.","type":"object","properties":[{"name":"styleSheetId","description":"The css style sheet identifier (absent for user agent stylesheet and user-specified\nstylesheet rules) this rule came from.","optional":true,"$ref":"StyleSheetId"},{"name":"origin","description":"Parent stylesheet's origin.","$ref":"StyleSheetOrigin"},{"name":"keyText","description":"Associated key text.","$ref":"Value"},{"name":"style","description":"Associated style declaration.","$ref":"CSSStyle"}]},{"id":"StyleDeclarationEdit","description":"A descriptor of operation to mutate style declaration text.","type":"object","properties":[{"name":"styleSheetId","description":"The css style sheet identifier.","$ref":"StyleSheetId"},{"name":"range","description":"The range of the style text in the enclosing stylesheet.","$ref":"SourceRange"},{"name":"text","description":"New style text.","type":"string"}]}],"commands":[{"name":"addRule","description":"Inserts a new rule with the given `ruleText` in a stylesheet with given `styleSheetId`, at the\nposition specified by `location`.","parameters":[{"name":"styleSheetId","description":"The css style sheet identifier where a new rule should be inserted.","$ref":"StyleSheetId"},{"name":"ruleText","description":"The text of a new rule.","type":"string"},{"name":"location","description":"Text position of a new rule in the target style sheet.","$ref":"SourceRange"}],"returns":[{"name":"rule","description":"The newly created rule.","$ref":"CSSRule"}]},{"name":"collectClassNames","description":"Returns all class names from specified stylesheet.","parameters":[{"name":"styleSheetId","$ref":"StyleSheetId"}],"returns":[{"name":"classNames","description":"Class name list.","type":"array","items":{"type":"string"}}]},{"name":"createStyleSheet","description":"Creates a new special \"via-inspector\" stylesheet in the frame with given `frameId`.","parameters":[{"name":"frameId","description":"Identifier of the frame where \"via-inspector\" stylesheet should be created.","$ref":"Page.FrameId"}],"returns":[{"name":"styleSheetId","description":"Identifier of the created \"via-inspector\" stylesheet.","$ref":"StyleSheetId"}]},{"name":"disable","description":"Disables the CSS agent for the given page."},{"name":"enable","description":"Enables the CSS agent for the given page. Clients should not assume that the CSS agent has been\nenabled until the result of this command is received."},{"name":"forcePseudoState","description":"Ensures that the given node will have specified pseudo-classes whenever its style is computed by\nthe browser.","parameters":[{"name":"nodeId","description":"The element id for which to force the pseudo state.","$ref":"DOM.NodeId"},{"name":"forcedPseudoClasses","description":"Element pseudo classes to force when computing the element's style.","type":"array","items":{"type":"string"}}]},{"name":"getBackgroundColors","parameters":[{"name":"nodeId","description":"Id of the node to get background colors for.","$ref":"DOM.NodeId"}],"returns":[{"name":"backgroundColors","description":"The range of background colors behind this element, if it contains any visible text. If no\nvisible text is present, this will be undefined. In the case of a flat background color,\nthis will consist of simply that color. In the case of a gradient, this will consist of each\nof the color stops. For anything more complicated, this will be an empty array. Images will\nbe ignored (as if the image had failed to load).","optional":true,"type":"array","items":{"type":"string"}},{"name":"computedFontSize","description":"The computed font size for this node, as a CSS computed value string (e.g. '12px').","optional":true,"type":"string"},{"name":"computedFontWeight","description":"The computed font weight for this node, as a CSS computed value string (e.g. 'normal' or\n'100').","optional":true,"type":"string"},{"name":"computedBodyFontSize","description":"The computed font size for the document body, as a computed CSS value string (e.g. '16px').","optional":true,"type":"string"}]},{"name":"getComputedStyleForNode","description":"Returns the computed style for a DOM node identified by `nodeId`.","parameters":[{"name":"nodeId","$ref":"DOM.NodeId"}],"returns":[{"name":"computedStyle","description":"Computed style for the specified DOM node.","type":"array","items":{"$ref":"CSSComputedStyleProperty"}}]},{"name":"getInlineStylesForNode","description":"Returns the styles defined inline (explicitly in the \"style\" attribute and implicitly, using DOM\nattributes) for a DOM node identified by `nodeId`.","parameters":[{"name":"nodeId","$ref":"DOM.NodeId"}],"returns":[{"name":"inlineStyle","description":"Inline style for the specified DOM node.","optional":true,"$ref":"CSSStyle"},{"name":"attributesStyle","description":"Attribute-defined element style (e.g. resulting from \"width=20 height=100%\").","optional":true,"$ref":"CSSStyle"}]},{"name":"getMatchedStylesForNode","description":"Returns requested styles for a DOM node identified by `nodeId`.","parameters":[{"name":"nodeId","$ref":"DOM.NodeId"}],"returns":[{"name":"inlineStyle","description":"Inline style for the specified DOM node.","optional":true,"$ref":"CSSStyle"},{"name":"attributesStyle","description":"Attribute-defined element style (e.g. resulting from \"width=20 height=100%\").","optional":true,"$ref":"CSSStyle"},{"name":"matchedCSSRules","description":"CSS rules matching this node, from all applicable stylesheets.","optional":true,"type":"array","items":{"$ref":"RuleMatch"}},{"name":"pseudoElements","description":"Pseudo style matches for this node.","optional":true,"type":"array","items":{"$ref":"PseudoElementMatches"}},{"name":"inherited","description":"A chain of inherited styles (from the immediate node parent up to the DOM tree root).","optional":true,"type":"array","items":{"$ref":"InheritedStyleEntry"}},{"name":"cssKeyframesRules","description":"A list of CSS keyframed animations matching this node.","optional":true,"type":"array","items":{"$ref":"CSSKeyframesRule"}}]},{"name":"getMediaQueries","description":"Returns all media queries parsed by the rendering engine.","returns":[{"name":"medias","type":"array","items":{"$ref":"CSSMedia"}}]},{"name":"getPlatformFontsForNode","description":"Requests information about platform fonts which we used to render child TextNodes in the given\nnode.","parameters":[{"name":"nodeId","$ref":"DOM.NodeId"}],"returns":[{"name":"fonts","description":"Usage statistics for every employed platform font.","type":"array","items":{"$ref":"PlatformFontUsage"}}]},{"name":"getStyleSheetText","description":"Returns the current textual content for a stylesheet.","parameters":[{"name":"styleSheetId","$ref":"StyleSheetId"}],"returns":[{"name":"text","description":"The stylesheet text.","type":"string"}]},{"name":"setEffectivePropertyValueForNode","description":"Find a rule with the given active property for the given node and set the new value for this\nproperty","parameters":[{"name":"nodeId","description":"The element id for which to set property.","$ref":"DOM.NodeId"},{"name":"propertyName","type":"string"},{"name":"value","type":"string"}]},{"name":"setKeyframeKey","description":"Modifies the keyframe rule key text.","parameters":[{"name":"styleSheetId","$ref":"StyleSheetId"},{"name":"range","$ref":"SourceRange"},{"name":"keyText","type":"string"}],"returns":[{"name":"keyText","description":"The resulting key text after modification.","$ref":"Value"}]},{"name":"setMediaText","description":"Modifies the rule selector.","parameters":[{"name":"styleSheetId","$ref":"StyleSheetId"},{"name":"range","$ref":"SourceRange"},{"name":"text","type":"string"}],"returns":[{"name":"media","description":"The resulting CSS media rule after modification.","$ref":"CSSMedia"}]},{"name":"setRuleSelector","description":"Modifies the rule selector.","parameters":[{"name":"styleSheetId","$ref":"StyleSheetId"},{"name":"range","$ref":"SourceRange"},{"name":"selector","type":"string"}],"returns":[{"name":"selectorList","description":"The resulting selector list after modification.","$ref":"SelectorList"}]},{"name":"setStyleSheetText","description":"Sets the new stylesheet text.","parameters":[{"name":"styleSheetId","$ref":"StyleSheetId"},{"name":"text","type":"string"}],"returns":[{"name":"sourceMapURL","description":"URL of source map associated with script (if any).","optional":true,"type":"string"}]},{"name":"setStyleTexts","description":"Applies specified style edits one after another in the given order.","parameters":[{"name":"edits","type":"array","items":{"$ref":"StyleDeclarationEdit"}}],"returns":[{"name":"styles","description":"The resulting styles after modification.","type":"array","items":{"$ref":"CSSStyle"}}]},{"name":"startRuleUsageTracking","description":"Enables the selector recording."},{"name":"stopRuleUsageTracking","description":"Stop tracking rule usage and return the list of rules that were used since last call to\n`takeCoverageDelta` (or since start of coverage instrumentation)","returns":[{"name":"ruleUsage","type":"array","items":{"$ref":"RuleUsage"}}]},{"name":"takeCoverageDelta","description":"Obtain list of rules that became used since last call to this method (or since start of coverage\ninstrumentation)","returns":[{"name":"coverage","type":"array","items":{"$ref":"RuleUsage"}}]}],"events":[{"name":"fontsUpdated","description":"Fires whenever a web font is updated.  A non-empty font parameter indicates a successfully loaded\nweb font","parameters":[{"name":"font","description":"The web font that has loaded.","optional":true,"$ref":"FontFace"}]},{"name":"mediaQueryResultChanged","description":"Fires whenever a MediaQuery result changes (for example, after a browser window has been\nresized.) The current implementation considers only viewport-dependent media features."},{"name":"styleSheetAdded","description":"Fired whenever an active document stylesheet is added.","parameters":[{"name":"header","description":"Added stylesheet metainfo.","$ref":"CSSStyleSheetHeader"}]},{"name":"styleSheetChanged","description":"Fired whenever a stylesheet is changed as a result of the client operation.","parameters":[{"name":"styleSheetId","$ref":"StyleSheetId"}]},{"name":"styleSheetRemoved","description":"Fired whenever an active document stylesheet is removed.","parameters":[{"name":"styleSheetId","description":"Identifier of the removed stylesheet.","$ref":"StyleSheetId"}]}]},{"domain":"CacheStorage","experimental":true,"types":[{"id":"CacheId","description":"Unique identifier of the Cache object.","type":"string"},{"id":"DataEntry","description":"Data entry.","type":"object","properties":[{"name":"requestURL","description":"Request URL.","type":"string"},{"name":"requestMethod","description":"Request method.","type":"string"},{"name":"requestHeaders","description":"Request headers","type":"array","items":{"$ref":"Header"}},{"name":"responseTime","description":"Number of seconds since epoch.","type":"number"},{"name":"responseStatus","description":"HTTP response status code.","type":"integer"},{"name":"responseStatusText","description":"HTTP response status text.","type":"string"},{"name":"responseHeaders","description":"Response headers","type":"array","items":{"$ref":"Header"}}]},{"id":"Cache","description":"Cache identifier.","type":"object","properties":[{"name":"cacheId","description":"An opaque unique id of the cache.","$ref":"CacheId"},{"name":"securityOrigin","description":"Security origin of the cache.","type":"string"},{"name":"cacheName","description":"The name of the cache.","type":"string"}]},{"id":"Header","type":"object","properties":[{"name":"name","type":"string"},{"name":"value","type":"string"}]},{"id":"CachedResponse","description":"Cached response","type":"object","properties":[{"name":"body","description":"Entry content, base64-encoded.","type":"string"}]}],"commands":[{"name":"deleteCache","description":"Deletes a cache.","parameters":[{"name":"cacheId","description":"Id of cache for deletion.","$ref":"CacheId"}]},{"name":"deleteEntry","description":"Deletes a cache entry.","parameters":[{"name":"cacheId","description":"Id of cache where the entry will be deleted.","$ref":"CacheId"},{"name":"request","description":"URL spec of the request.","type":"string"}]},{"name":"requestCacheNames","description":"Requests cache names.","parameters":[{"name":"securityOrigin","description":"Security origin.","type":"string"}],"returns":[{"name":"caches","description":"Caches for the security origin.","type":"array","items":{"$ref":"Cache"}}]},{"name":"requestCachedResponse","description":"Fetches cache entry.","parameters":[{"name":"cacheId","description":"Id of cache that contains the enty.","$ref":"CacheId"},{"name":"requestURL","description":"URL spec of the request.","type":"string"}],"returns":[{"name":"response","description":"Response read from the cache.","$ref":"CachedResponse"}]},{"name":"requestEntries","description":"Requests data from cache.","parameters":[{"name":"cacheId","description":"ID of cache to get entries from.","$ref":"CacheId"},{"name":"skipCount","description":"Number of records to skip.","type":"integer"},{"name":"pageSize","description":"Number of records to fetch.","type":"integer"}],"returns":[{"name":"cacheDataEntries","description":"Array of object store data entries.","type":"array","items":{"$ref":"DataEntry"}},{"name":"hasMore","description":"If true, there are more entries to fetch in the given range.","type":"boolean"}]}]},{"domain":"DOM","description":"This domain exposes DOM read/write operations. Each DOM Node is represented with its mirror object\nthat has an `id`. This `id` can be used to get additional information on the Node, resolve it into\nthe JavaScript object wrapper, etc. It is important that client receives DOM events only for the\nnodes that are known to the client. Backend keeps track of the nodes that were sent to the client\nand never sends the same node twice. It is client's responsibility to collect information about\nthe nodes that were sent to the client.<p>Note that `iframe` owner elements will return\ncorresponding document elements as their child nodes.</p>","dependencies":["Runtime"],"types":[{"id":"NodeId","description":"Unique DOM node identifier.","type":"integer"},{"id":"BackendNodeId","description":"Unique DOM node identifier used to reference a node that may not have been pushed to the\nfront-end.","type":"integer"},{"id":"BackendNode","description":"Backend node with a friendly name.","type":"object","properties":[{"name":"nodeType","description":"`Node`'s nodeType.","type":"integer"},{"name":"nodeName","description":"`Node`'s nodeName.","type":"string"},{"name":"backendNodeId","$ref":"BackendNodeId"}]},{"id":"PseudoType","description":"Pseudo element type.","type":"string","enum":["first-line","first-letter","before","after","backdrop","selection","first-line-inherited","scrollbar","scrollbar-thumb","scrollbar-button","scrollbar-track","scrollbar-track-piece","scrollbar-corner","resizer","input-list-button"]},{"id":"ShadowRootType","description":"Shadow root type.","type":"string","enum":["user-agent","open","closed"]},{"id":"Node","description":"DOM interaction is implemented in terms of mirror objects that represent the actual DOM nodes.\nDOMNode is a base node mirror type.","type":"object","properties":[{"name":"nodeId","description":"Node identifier that is passed into the rest of the DOM messages as the `nodeId`. Backend\nwill only push node with given `id` once. It is aware of all requested nodes and will only\nfire DOM events for nodes known to the client.","$ref":"NodeId"},{"name":"parentId","description":"The id of the parent node if any.","optional":true,"$ref":"NodeId"},{"name":"backendNodeId","description":"The BackendNodeId for this node.","$ref":"BackendNodeId"},{"name":"nodeType","description":"`Node`'s nodeType.","type":"integer"},{"name":"nodeName","description":"`Node`'s nodeName.","type":"string"},{"name":"localName","description":"`Node`'s localName.","type":"string"},{"name":"nodeValue","description":"`Node`'s nodeValue.","type":"string"},{"name":"childNodeCount","description":"Child count for `Container` nodes.","optional":true,"type":"integer"},{"name":"children","description":"Child nodes of this node when requested with children.","optional":true,"type":"array","items":{"$ref":"Node"}},{"name":"attributes","description":"Attributes of the `Element` node in the form of flat array `[name1, value1, name2, value2]`.","optional":true,"type":"array","items":{"type":"string"}},{"name":"documentURL","description":"Document URL that `Document` or `FrameOwner` node points to.","optional":true,"type":"string"},{"name":"baseURL","description":"Base URL that `Document` or `FrameOwner` node uses for URL completion.","optional":true,"type":"string"},{"name":"publicId","description":"`DocumentType`'s publicId.","optional":true,"type":"string"},{"name":"systemId","description":"`DocumentType`'s systemId.","optional":true,"type":"string"},{"name":"internalSubset","description":"`DocumentType`'s internalSubset.","optional":true,"type":"string"},{"name":"xmlVersion","description":"`Document`'s XML version in case of XML documents.","optional":true,"type":"string"},{"name":"name","description":"`Attr`'s name.","optional":true,"type":"string"},{"name":"value","description":"`Attr`'s value.","optional":true,"type":"string"},{"name":"pseudoType","description":"Pseudo element type for this node.","optional":true,"$ref":"PseudoType"},{"name":"shadowRootType","description":"Shadow root type.","optional":true,"$ref":"ShadowRootType"},{"name":"frameId","description":"Frame ID for frame owner elements.","optional":true,"$ref":"Page.FrameId"},{"name":"contentDocument","description":"Content document for frame owner elements.","optional":true,"$ref":"Node"},{"name":"shadowRoots","description":"Shadow root list for given element host.","optional":true,"type":"array","items":{"$ref":"Node"}},{"name":"templateContent","description":"Content document fragment for template elements.","optional":true,"$ref":"Node"},{"name":"pseudoElements","description":"Pseudo elements associated with this node.","optional":true,"type":"array","items":{"$ref":"Node"}},{"name":"importedDocument","description":"Import document for the HTMLImport links.","optional":true,"$ref":"Node"},{"name":"distributedNodes","description":"Distributed nodes for given insertion point.","optional":true,"type":"array","items":{"$ref":"BackendNode"}},{"name":"isSVG","description":"Whether the node is SVG.","optional":true,"type":"boolean"}]},{"id":"RGBA","description":"A structure holding an RGBA color.","type":"object","properties":[{"name":"r","description":"The red component, in the [0-255] range.","type":"integer"},{"name":"g","description":"The green component, in the [0-255] range.","type":"integer"},{"name":"b","description":"The blue component, in the [0-255] range.","type":"integer"},{"name":"a","description":"The alpha component, in the [0-1] range (default: 1).","optional":true,"type":"number"}]},{"id":"Quad","description":"An array of quad vertices, x immediately followed by y for each point, points clock-wise.","type":"array","items":{"type":"number"}},{"id":"BoxModel","description":"Box model.","type":"object","properties":[{"name":"content","description":"Content box","$ref":"Quad"},{"name":"padding","description":"Padding box","$ref":"Quad"},{"name":"border","description":"Border box","$ref":"Quad"},{"name":"margin","description":"Margin box","$ref":"Quad"},{"name":"width","description":"Node width","type":"integer"},{"name":"height","description":"Node height","type":"integer"},{"name":"shapeOutside","description":"Shape outside coordinates","optional":true,"$ref":"ShapeOutsideInfo"}]},{"id":"ShapeOutsideInfo","description":"CSS Shape Outside details.","type":"object","properties":[{"name":"bounds","description":"Shape bounds","$ref":"Quad"},{"name":"shape","description":"Shape coordinate details","type":"array","items":{"type":"any"}},{"name":"marginShape","description":"Margin shape bounds","type":"array","items":{"type":"any"}}]},{"id":"Rect","description":"Rectangle.","type":"object","properties":[{"name":"x","description":"X coordinate","type":"number"},{"name":"y","description":"Y coordinate","type":"number"},{"name":"width","description":"Rectangle width","type":"number"},{"name":"height","description":"Rectangle height","type":"number"}]}],"commands":[{"name":"collectClassNamesFromSubtree","description":"Collects class names for the node with given id and all of it's child nodes.","experimental":true,"parameters":[{"name":"nodeId","description":"Id of the node to collect class names.","$ref":"NodeId"}],"returns":[{"name":"classNames","description":"Class name list.","type":"array","items":{"type":"string"}}]},{"name":"copyTo","description":"Creates a deep copy of the specified node and places it into the target container before the\ngiven anchor.","experimental":true,"parameters":[{"name":"nodeId","description":"Id of the node to copy.","$ref":"NodeId"},{"name":"targetNodeId","description":"Id of the element to drop the copy into.","$ref":"NodeId"},{"name":"insertBeforeNodeId","description":"Drop the copy before this node (if absent, the copy becomes the last child of\n`targetNodeId`).","optional":true,"$ref":"NodeId"}],"returns":[{"name":"nodeId","description":"Id of the node clone.","$ref":"NodeId"}]},{"name":"describeNode","description":"Describes node given its id, does not require domain to be enabled. Does not start tracking any\nobjects, can be used for automation.","parameters":[{"name":"nodeId","description":"Identifier of the node.","optional":true,"$ref":"NodeId"},{"name":"backendNodeId","description":"Identifier of the backend node.","optional":true,"$ref":"BackendNodeId"},{"name":"objectId","description":"JavaScript object id of the node wrapper.","optional":true,"$ref":"Runtime.RemoteObjectId"},{"name":"depth","description":"The maximum depth at which children should be retrieved, defaults to 1. Use -1 for the\nentire subtree or provide an integer larger than 0.","optional":true,"type":"integer"},{"name":"pierce","description":"Whether or not iframes and shadow roots should be traversed when returning the subtree\n(default is false).","optional":true,"type":"boolean"}],"returns":[{"name":"node","description":"Node description.","$ref":"Node"}]},{"name":"disable","description":"Disables DOM agent for the given page."},{"name":"discardSearchResults","description":"Discards search results from the session with the given id. `getSearchResults` should no longer\nbe called for that search.","experimental":true,"parameters":[{"name":"searchId","description":"Unique search session identifier.","type":"string"}]},{"name":"enable","description":"Enables DOM agent for the given page."},{"name":"focus","description":"Focuses the given element.","parameters":[{"name":"nodeId","description":"Identifier of the node.","optional":true,"$ref":"NodeId"},{"name":"backendNodeId","description":"Identifier of the backend node.","optional":true,"$ref":"BackendNodeId"},{"name":"objectId","description":"JavaScript object id of the node wrapper.","optional":true,"$ref":"Runtime.RemoteObjectId"}]},{"name":"getAttributes","description":"Returns attributes for the specified node.","parameters":[{"name":"nodeId","description":"Id of the node to retrieve attibutes for.","$ref":"NodeId"}],"returns":[{"name":"attributes","description":"An interleaved array of node attribute names and values.","type":"array","items":{"type":"string"}}]},{"name":"getBoxModel","description":"Returns boxes for the given node.","parameters":[{"name":"nodeId","description":"Identifier of the node.","optional":true,"$ref":"NodeId"},{"name":"backendNodeId","description":"Identifier of the backend node.","optional":true,"$ref":"BackendNodeId"},{"name":"objectId","description":"JavaScript object id of the node wrapper.","optional":true,"$ref":"Runtime.RemoteObjectId"}],"returns":[{"name":"model","description":"Box model for the node.","$ref":"BoxModel"}]},{"name":"getContentQuads","description":"Returns quads that describe node position on the page. This method\nmight return multiple quads for inline nodes.","experimental":true,"parameters":[{"name":"nodeId","description":"Identifier of the node.","optional":true,"$ref":"NodeId"},{"name":"backendNodeId","description":"Identifier of the backend node.","optional":true,"$ref":"BackendNodeId"},{"name":"objectId","description":"JavaScript object id of the node wrapper.","optional":true,"$ref":"Runtime.RemoteObjectId"}],"returns":[{"name":"quads","description":"Quads that describe node layout relative to viewport.","type":"array","items":{"$ref":"Quad"}}]},{"name":"getDocument","description":"Returns the root DOM node (and optionally the subtree) to the caller.","parameters":[{"name":"depth","description":"The maximum depth at which children should be retrieved, defaults to 1. Use -1 for the\nentire subtree or provide an integer larger than 0.","optional":true,"type":"integer"},{"name":"pierce","description":"Whether or not iframes and shadow roots should be traversed when returning the subtree\n(default is false).","optional":true,"type":"boolean"}],"returns":[{"name":"root","description":"Resulting node.","$ref":"Node"}]},{"name":"getFlattenedDocument","description":"Returns the root DOM node (and optionally the subtree) to the caller.","parameters":[{"name":"depth","description":"The maximum depth at which children should be retrieved, defaults to 1. Use -1 for the\nentire subtree or provide an integer larger than 0.","optional":true,"type":"integer"},{"name":"pierce","description":"Whether or not iframes and shadow roots should be traversed when returning the subtree\n(default is false).","optional":true,"type":"boolean"}],"returns":[{"name":"nodes","description":"Resulting node.","type":"array","items":{"$ref":"Node"}}]},{"name":"getNodeForLocation","description":"Returns node id at given location.","experimental":true,"parameters":[{"name":"x","description":"X coordinate.","type":"integer"},{"name":"y","description":"Y coordinate.","type":"integer"},{"name":"includeUserAgentShadowDOM","description":"False to skip to the nearest non-UA shadow root ancestor (default: false).","optional":true,"type":"boolean"}],"returns":[{"name":"nodeId","description":"Id of the node at given coordinates.","$ref":"NodeId"}]},{"name":"getOuterHTML","description":"Returns node's HTML markup.","parameters":[{"name":"nodeId","description":"Identifier of the node.","optional":true,"$ref":"NodeId"},{"name":"backendNodeId","description":"Identifier of the backend node.","optional":true,"$ref":"BackendNodeId"},{"name":"objectId","description":"JavaScript object id of the node wrapper.","optional":true,"$ref":"Runtime.RemoteObjectId"}],"returns":[{"name":"outerHTML","description":"Outer HTML markup.","type":"string"}]},{"name":"getRelayoutBoundary","description":"Returns the id of the nearest ancestor that is a relayout boundary.","experimental":true,"parameters":[{"name":"nodeId","description":"Id of the node.","$ref":"NodeId"}],"returns":[{"name":"nodeId","description":"Relayout boundary node id for the given node.","$ref":"NodeId"}]},{"name":"getSearchResults","description":"Returns search results from given `fromIndex` to given `toIndex` from the search with the given\nidentifier.","experimental":true,"parameters":[{"name":"searchId","description":"Unique search session identifier.","type":"string"},{"name":"fromIndex","description":"Start index of the search result to be returned.","type":"integer"},{"name":"toIndex","description":"End index of the search result to be returned.","type":"integer"}],"returns":[{"name":"nodeIds","description":"Ids of the search result nodes.","type":"array","items":{"$ref":"NodeId"}}]},{"name":"hideHighlight","description":"Hides any highlight.","redirect":"Overlay"},{"name":"highlightNode","description":"Highlights DOM node.","redirect":"Overlay"},{"name":"highlightRect","description":"Highlights given rectangle.","redirect":"Overlay"},{"name":"markUndoableState","description":"Marks last undoable state.","experimental":true},{"name":"moveTo","description":"Moves node into the new container, places it before the given anchor.","parameters":[{"name":"nodeId","description":"Id of the node to move.","$ref":"NodeId"},{"name":"targetNodeId","description":"Id of the element to drop the moved node into.","$ref":"NodeId"},{"name":"insertBeforeNodeId","description":"Drop node before this one (if absent, the moved node becomes the last child of\n`targetNodeId`).","optional":true,"$ref":"NodeId"}],"returns":[{"name":"nodeId","description":"New id of the moved node.","$ref":"NodeId"}]},{"name":"performSearch","description":"Searches for a given string in the DOM tree. Use `getSearchResults` to access search results or\n`cancelSearch` to end this search session.","experimental":true,"parameters":[{"name":"query","description":"Plain text or query selector or XPath search query.","type":"string"},{"name":"includeUserAgentShadowDOM","description":"True to search in user agent shadow DOM.","optional":true,"type":"boolean"}],"returns":[{"name":"searchId","description":"Unique search session identifier.","type":"string"},{"name":"resultCount","description":"Number of search results.","type":"integer"}]},{"name":"pushNodeByPathToFrontend","description":"Requests that the node is sent to the caller given its path. // FIXME, use XPath","experimental":true,"parameters":[{"name":"path","description":"Path to node in the proprietary format.","type":"string"}],"returns":[{"name":"nodeId","description":"Id of the node for given path.","$ref":"NodeId"}]},{"name":"pushNodesByBackendIdsToFrontend","description":"Requests that a batch of nodes is sent to the caller given their backend node ids.","experimental":true,"parameters":[{"name":"backendNodeIds","description":"The array of backend node ids.","type":"array","items":{"$ref":"BackendNodeId"}}],"returns":[{"name":"nodeIds","description":"The array of ids of pushed nodes that correspond to the backend ids specified in\nbackendNodeIds.","type":"array","items":{"$ref":"NodeId"}}]},{"name":"querySelector","description":"Executes `querySelector` on a given node.","parameters":[{"name":"nodeId","description":"Id of the node to query upon.","$ref":"NodeId"},{"name":"selector","description":"Selector string.","type":"string"}],"returns":[{"name":"nodeId","description":"Query selector result.","$ref":"NodeId"}]},{"name":"querySelectorAll","description":"Executes `querySelectorAll` on a given node.","parameters":[{"name":"nodeId","description":"Id of the node to query upon.","$ref":"NodeId"},{"name":"selector","description":"Selector string.","type":"string"}],"returns":[{"name":"nodeIds","description":"Query selector result.","type":"array","items":{"$ref":"NodeId"}}]},{"name":"redo","description":"Re-does the last undone action.","experimental":true},{"name":"removeAttribute","description":"Removes attribute with given name from an element with given id.","parameters":[{"name":"nodeId","description":"Id of the element to remove attribute from.","$ref":"NodeId"},{"name":"name","description":"Name of the attribute to remove.","type":"string"}]},{"name":"removeNode","description":"Removes node with given id.","parameters":[{"name":"nodeId","description":"Id of the node to remove.","$ref":"NodeId"}]},{"name":"requestChildNodes","description":"Requests that children of the node with given id are returned to the caller in form of\n`setChildNodes` events where not only immediate children are retrieved, but all children down to\nthe specified depth.","parameters":[{"name":"nodeId","description":"Id of the node to get children for.","$ref":"NodeId"},{"name":"depth","description":"The maximum depth at which children should be retrieved, defaults to 1. Use -1 for the\nentire subtree or provide an integer larger than 0.","optional":true,"type":"integer"},{"name":"pierce","description":"Whether or not iframes and shadow roots should be traversed when returning the sub-tree\n(default is false).","optional":true,"type":"boolean"}]},{"name":"requestNode","description":"Requests that the node is sent to the caller given the JavaScript node object reference. All\nnodes that form the path from the node to the root are also sent to the client as a series of\n`setChildNodes` notifications.","parameters":[{"name":"objectId","description":"JavaScript object id to convert into node.","$ref":"Runtime.RemoteObjectId"}],"returns":[{"name":"nodeId","description":"Node id for given object.","$ref":"NodeId"}]},{"name":"resolveNode","description":"Resolves the JavaScript node object for a given NodeId or BackendNodeId.","parameters":[{"name":"nodeId","description":"Id of the node to resolve.","optional":true,"$ref":"NodeId"},{"name":"backendNodeId","description":"Backend identifier of the node to resolve.","optional":true,"$ref":"DOM.BackendNodeId"},{"name":"objectGroup","description":"Symbolic group name that can be used to release multiple objects.","optional":true,"type":"string"}],"returns":[{"name":"object","description":"JavaScript object wrapper for given node.","$ref":"Runtime.RemoteObject"}]},{"name":"setAttributeValue","description":"Sets attribute for an element with given id.","parameters":[{"name":"nodeId","description":"Id of the element to set attribute for.","$ref":"NodeId"},{"name":"name","description":"Attribute name.","type":"string"},{"name":"value","description":"Attribute value.","type":"string"}]},{"name":"setAttributesAsText","description":"Sets attributes on element with given id. This method is useful when user edits some existing\nattribute value and types in several attribute name/value pairs.","parameters":[{"name":"nodeId","description":"Id of the element to set attributes for.","$ref":"NodeId"},{"name":"text","description":"Text with a number of attributes. Will parse this text using HTML parser.","type":"string"},{"name":"name","description":"Attribute name to replace with new attributes derived from text in case text parsed\nsuccessfully.","optional":true,"type":"string"}]},{"name":"setFileInputFiles","description":"Sets files for the given file input element.","parameters":[{"name":"files","description":"Array of file paths to set.","type":"array","items":{"type":"string"}},{"name":"nodeId","description":"Identifier of the node.","optional":true,"$ref":"NodeId"},{"name":"backendNodeId","description":"Identifier of the backend node.","optional":true,"$ref":"BackendNodeId"},{"name":"objectId","description":"JavaScript object id of the node wrapper.","optional":true,"$ref":"Runtime.RemoteObjectId"}]},{"name":"setInspectedNode","description":"Enables console to refer to the node with given id via $x (see Command Line API for more details\n$x functions).","experimental":true,"parameters":[{"name":"nodeId","description":"DOM node id to be accessible by means of $x command line API.","$ref":"NodeId"}]},{"name":"setNodeName","description":"Sets node name for a node with given id.","parameters":[{"name":"nodeId","description":"Id of the node to set name for.","$ref":"NodeId"},{"name":"name","description":"New node's name.","type":"string"}],"returns":[{"name":"nodeId","description":"New node's id.","$ref":"NodeId"}]},{"name":"setNodeValue","description":"Sets node value for a node with given id.","parameters":[{"name":"nodeId","description":"Id of the node to set value for.","$ref":"NodeId"},{"name":"value","description":"New node's value.","type":"string"}]},{"name":"setOuterHTML","description":"Sets node HTML markup, returns new node id.","parameters":[{"name":"nodeId","description":"Id of the node to set markup for.","$ref":"NodeId"},{"name":"outerHTML","description":"Outer HTML markup to set.","type":"string"}]},{"name":"undo","description":"Undoes the last performed action.","experimental":true},{"name":"getFrameOwner","description":"Returns iframe node that owns iframe with the given domain.","experimental":true,"parameters":[{"name":"frameId","$ref":"Page.FrameId"}],"returns":[{"name":"nodeId","$ref":"NodeId"}]}],"events":[{"name":"attributeModified","description":"Fired when `Element`'s attribute is modified.","parameters":[{"name":"nodeId","description":"Id of the node that has changed.","$ref":"NodeId"},{"name":"name","description":"Attribute name.","type":"string"},{"name":"value","description":"Attribute value.","type":"string"}]},{"name":"attributeRemoved","description":"Fired when `Element`'s attribute is removed.","parameters":[{"name":"nodeId","description":"Id of the node that has changed.","$ref":"NodeId"},{"name":"name","description":"A ttribute name.","type":"string"}]},{"name":"characterDataModified","description":"Mirrors `DOMCharacterDataModified` event.","parameters":[{"name":"nodeId","description":"Id of the node that has changed.","$ref":"NodeId"},{"name":"characterData","description":"New text value.","type":"string"}]},{"name":"childNodeCountUpdated","description":"Fired when `Container`'s child node count has changed.","parameters":[{"name":"nodeId","description":"Id of the node that has changed.","$ref":"NodeId"},{"name":"childNodeCount","description":"New node count.","type":"integer"}]},{"name":"childNodeInserted","description":"Mirrors `DOMNodeInserted` event.","parameters":[{"name":"parentNodeId","description":"Id of the node that has changed.","$ref":"NodeId"},{"name":"previousNodeId","description":"If of the previous siblint.","$ref":"NodeId"},{"name":"node","description":"Inserted node data.","$ref":"Node"}]},{"name":"childNodeRemoved","description":"Mirrors `DOMNodeRemoved` event.","parameters":[{"name":"parentNodeId","description":"Parent id.","$ref":"NodeId"},{"name":"nodeId","description":"Id of the node that has been removed.","$ref":"NodeId"}]},{"name":"distributedNodesUpdated","description":"Called when distrubution is changed.","experimental":true,"parameters":[{"name":"insertionPointId","description":"Insertion point where distrubuted nodes were updated.","$ref":"NodeId"},{"name":"distributedNodes","description":"Distributed nodes for given insertion point.","type":"array","items":{"$ref":"BackendNode"}}]},{"name":"documentUpdated","description":"Fired when `Document` has been totally updated. Node ids are no longer valid."},{"name":"inlineStyleInvalidated","description":"Fired when `Element`'s inline style is modified via a CSS property modification.","experimental":true,"parameters":[{"name":"nodeIds","description":"Ids of the nodes for which the inline styles have been invalidated.","type":"array","items":{"$ref":"NodeId"}}]},{"name":"pseudoElementAdded","description":"Called when a pseudo element is added to an element.","experimental":true,"parameters":[{"name":"parentId","description":"Pseudo element's parent element id.","$ref":"NodeId"},{"name":"pseudoElement","description":"The added pseudo element.","$ref":"Node"}]},{"name":"pseudoElementRemoved","description":"Called when a pseudo element is removed from an element.","experimental":true,"parameters":[{"name":"parentId","description":"Pseudo element's parent element id.","$ref":"NodeId"},{"name":"pseudoElementId","description":"The removed pseudo element id.","$ref":"NodeId"}]},{"name":"setChildNodes","description":"Fired when backend wants to provide client with the missing DOM structure. This happens upon\nmost of the calls requesting node ids.","parameters":[{"name":"parentId","description":"Parent node id to populate with children.","$ref":"NodeId"},{"name":"nodes","description":"Child nodes array.","type":"array","items":{"$ref":"Node"}}]},{"name":"shadowRootPopped","description":"Called when shadow root is popped from the element.","experimental":true,"parameters":[{"name":"hostId","description":"Host element id.","$ref":"NodeId"},{"name":"rootId","description":"Shadow root id.","$ref":"NodeId"}]},{"name":"shadowRootPushed","description":"Called when shadow root is pushed into the element.","experimental":true,"parameters":[{"name":"hostId","description":"Host element id.","$ref":"NodeId"},{"name":"root","description":"Shadow root.","$ref":"Node"}]}]},{"domain":"DOMDebugger","description":"DOM debugging allows setting breakpoints on particular DOM operations and events. JavaScript\nexecution will stop on these operations as if there was a regular breakpoint set.","dependencies":["DOM","Debugger"],"types":[{"id":"DOMBreakpointType","description":"DOM breakpoint type.","type":"string","enum":["subtree-modified","attribute-modified","node-removed"]},{"id":"EventListener","description":"Object event listener.","type":"object","properties":[{"name":"type","description":"`EventListener`'s type.","type":"string"},{"name":"useCapture","description":"`EventListener`'s useCapture.","type":"boolean"},{"name":"passive","description":"`EventListener`'s passive flag.","type":"boolean"},{"name":"once","description":"`EventListener`'s once flag.","type":"boolean"},{"name":"scriptId","description":"Script id of the handler code.","$ref":"Runtime.ScriptId"},{"name":"lineNumber","description":"Line number in the script (0-based).","type":"integer"},{"name":"columnNumber","description":"Column number in the script (0-based).","type":"integer"},{"name":"handler","description":"Event handler function value.","optional":true,"$ref":"Runtime.RemoteObject"},{"name":"originalHandler","description":"Event original handler function value.","optional":true,"$ref":"Runtime.RemoteObject"},{"name":"backendNodeId","description":"Node the listener is added to (if any).","optional":true,"$ref":"DOM.BackendNodeId"}]}],"commands":[{"name":"getEventListeners","description":"Returns event listeners of the given object.","parameters":[{"name":"objectId","description":"Identifier of the object to return listeners for.","$ref":"Runtime.RemoteObjectId"},{"name":"depth","description":"The maximum depth at which Node children should be retrieved, defaults to 1. Use -1 for the\nentire subtree or provide an integer larger than 0.","optional":true,"type":"integer"},{"name":"pierce","description":"Whether or not iframes and shadow roots should be traversed when returning the subtree\n(default is false). Reports listeners for all contexts if pierce is enabled.","optional":true,"type":"boolean"}],"returns":[{"name":"listeners","description":"Array of relevant listeners.","type":"array","items":{"$ref":"EventListener"}}]},{"name":"removeDOMBreakpoint","description":"Removes DOM breakpoint that was set using `setDOMBreakpoint`.","parameters":[{"name":"nodeId","description":"Identifier of the node to remove breakpoint from.","$ref":"DOM.NodeId"},{"name":"type","description":"Type of the breakpoint to remove.","$ref":"DOMBreakpointType"}]},{"name":"removeEventListenerBreakpoint","description":"Removes breakpoint on particular DOM event.","parameters":[{"name":"eventName","description":"Event name.","type":"string"},{"name":"targetName","description":"EventTarget interface name.","experimental":true,"optional":true,"type":"string"}]},{"name":"removeInstrumentationBreakpoint","description":"Removes breakpoint on particular native event.","experimental":true,"parameters":[{"name":"eventName","description":"Instrumentation name to stop on.","type":"string"}]},{"name":"removeXHRBreakpoint","description":"Removes breakpoint from XMLHttpRequest.","parameters":[{"name":"url","description":"Resource URL substring.","type":"string"}]},{"name":"setDOMBreakpoint","description":"Sets breakpoint on particular operation with DOM.","parameters":[{"name":"nodeId","description":"Identifier of the node to set breakpoint on.","$ref":"DOM.NodeId"},{"name":"type","description":"Type of the operation to stop upon.","$ref":"DOMBreakpointType"}]},{"name":"setEventListenerBreakpoint","description":"Sets breakpoint on particular DOM event.","parameters":[{"name":"eventName","description":"DOM Event name to stop on (any DOM event will do).","type":"string"},{"name":"targetName","description":"EventTarget interface name to stop on. If equal to `\"*\"` or not provided, will stop on any\nEventTarget.","experimental":true,"optional":true,"type":"string"}]},{"name":"setInstrumentationBreakpoint","description":"Sets breakpoint on particular native event.","experimental":true,"parameters":[{"name":"eventName","description":"Instrumentation name to stop on.","type":"string"}]},{"name":"setXHRBreakpoint","description":"Sets breakpoint on XMLHttpRequest.","parameters":[{"name":"url","description":"Resource URL substring. All XHRs having this substring in the URL will get stopped upon.","type":"string"}]}]},{"domain":"DOMSnapshot","description":"This domain facilitates obtaining document snapshots with DOM, layout, and style information.","experimental":true,"dependencies":["CSS","DOM","DOMDebugger","Page"],"types":[{"id":"DOMNode","description":"A Node in the DOM tree.","type":"object","properties":[{"name":"nodeType","description":"`Node`'s nodeType.","type":"integer"},{"name":"nodeName","description":"`Node`'s nodeName.","type":"string"},{"name":"nodeValue","description":"`Node`'s nodeValue.","type":"string"},{"name":"textValue","description":"Only set for textarea elements, contains the text value.","optional":true,"type":"string"},{"name":"inputValue","description":"Only set for input elements, contains the input's associated text value.","optional":true,"type":"string"},{"name":"inputChecked","description":"Only set for radio and checkbox input elements, indicates if the element has been checked","optional":true,"type":"boolean"},{"name":"optionSelected","description":"Only set for option elements, indicates if the element has been selected","optional":true,"type":"boolean"},{"name":"backendNodeId","description":"`Node`'s id, corresponds to DOM.Node.backendNodeId.","$ref":"DOM.BackendNodeId"},{"name":"childNodeIndexes","description":"The indexes of the node's child nodes in the `domNodes` array returned by `getSnapshot`, if\nany.","optional":true,"type":"array","items":{"type":"integer"}},{"name":"attributes","description":"Attributes of an `Element` node.","optional":true,"type":"array","items":{"$ref":"NameValue"}},{"name":"pseudoElementIndexes","description":"Indexes of pseudo elements associated with this node in the `domNodes` array returned by\n`getSnapshot`, if any.","optional":true,"type":"array","items":{"type":"integer"}},{"name":"layoutNodeIndex","description":"The index of the node's related layout tree node in the `layoutTreeNodes` array returned by\n`getSnapshot`, if any.","optional":true,"type":"integer"},{"name":"documentURL","description":"Document URL that `Document` or `FrameOwner` node points to.","optional":true,"type":"string"},{"name":"baseURL","description":"Base URL that `Document` or `FrameOwner` node uses for URL completion.","optional":true,"type":"string"},{"name":"contentLanguage","description":"Only set for documents, contains the document's content language.","optional":true,"type":"string"},{"name":"documentEncoding","description":"Only set for documents, contains the document's character set encoding.","optional":true,"type":"string"},{"name":"publicId","description":"`DocumentType` node's publicId.","optional":true,"type":"string"},{"name":"systemId","description":"`DocumentType` node's systemId.","optional":true,"type":"string"},{"name":"frameId","description":"Frame ID for frame owner elements and also for the document node.","optional":true,"$ref":"Page.FrameId"},{"name":"contentDocumentIndex","description":"The index of a frame owner element's content document in the `domNodes` array returned by\n`getSnapshot`, if any.","optional":true,"type":"integer"},{"name":"importedDocumentIndex","description":"Index of the imported document's node of a link element in the `domNodes` array returned by\n`getSnapshot`, if any.","optional":true,"type":"integer"},{"name":"templateContentIndex","description":"Index of the content node of a template element in the `domNodes` array returned by\n`getSnapshot`.","optional":true,"type":"integer"},{"name":"pseudoType","description":"Type of a pseudo element node.","optional":true,"$ref":"DOM.PseudoType"},{"name":"shadowRootType","description":"Shadow root type.","optional":true,"$ref":"DOM.ShadowRootType"},{"name":"isClickable","description":"Whether this DOM node responds to mouse clicks. This includes nodes that have had click\nevent listeners attached via JavaScript as well as anchor tags that naturally navigate when\nclicked.","optional":true,"type":"boolean"},{"name":"eventListeners","description":"Details of the node's event listeners, if any.","optional":true,"type":"array","items":{"$ref":"DOMDebugger.EventListener"}},{"name":"currentSourceURL","description":"The selected url for nodes with a srcset attribute.","optional":true,"type":"string"},{"name":"originURL","description":"The url of the script (if any) that generates this node.","optional":true,"type":"string"}]},{"id":"InlineTextBox","description":"Details of post layout rendered text positions. The exact layout should not be regarded as\nstable and may change between versions.","type":"object","properties":[{"name":"boundingBox","description":"The absolute position bounding box.","$ref":"DOM.Rect"},{"name":"startCharacterIndex","description":"The starting index in characters, for this post layout textbox substring. Characters that\nwould be represented as a surrogate pair in UTF-16 have length 2.","type":"integer"},{"name":"numCharacters","description":"The number of characters in this post layout textbox substring. Characters that would be\nrepresented as a surrogate pair in UTF-16 have length 2.","type":"integer"}]},{"id":"LayoutTreeNode","description":"Details of an element in the DOM tree with a LayoutObject.","type":"object","properties":[{"name":"domNodeIndex","description":"The index of the related DOM node in the `domNodes` array returned by `getSnapshot`.","type":"integer"},{"name":"boundingBox","description":"The absolute position bounding box.","$ref":"DOM.Rect"},{"name":"layoutText","description":"Contents of the LayoutText, if any.","optional":true,"type":"string"},{"name":"inlineTextNodes","description":"The post-layout inline text nodes, if any.","optional":true,"type":"array","items":{"$ref":"InlineTextBox"}},{"name":"styleIndex","description":"Index into the `computedStyles` array returned by `getSnapshot`.","optional":true,"type":"integer"},{"name":"paintOrder","description":"Global paint order index, which is determined by the stacking order of the nodes. Nodes\nthat are painted together will have the same index. Only provided if includePaintOrder in\ngetSnapshot was true.","optional":true,"type":"integer"}]},{"id":"ComputedStyle","description":"A subset of the full ComputedStyle as defined by the request whitelist.","type":"object","properties":[{"name":"properties","description":"Name/value pairs of computed style properties.","type":"array","items":{"$ref":"NameValue"}}]},{"id":"NameValue","description":"A name/value pair.","type":"object","properties":[{"name":"name","description":"Attribute/property name.","type":"string"},{"name":"value","description":"Attribute/property value.","type":"string"}]},{"id":"StringIndex","description":"Index of the string in the strings table.","type":"integer"},{"id":"ArrayOfStrings","description":"Index of the string in the strings table.","type":"array","items":{"$ref":"StringIndex"}},{"id":"RareStringData","description":"Data that is only present on rare nodes.","type":"object","properties":[{"name":"index","type":"array","items":{"type":"integer"}},{"name":"value","type":"array","items":{"$ref":"StringIndex"}}]},{"id":"RareBooleanData","type":"object","properties":[{"name":"index","type":"array","items":{"type":"integer"}}]},{"id":"RareIntegerData","type":"object","properties":[{"name":"index","type":"array","items":{"type":"integer"}},{"name":"value","type":"array","items":{"type":"integer"}}]},{"id":"Rectangle","type":"array","items":{"type":"number"}},{"id":"DOMTreeSnapshot","description":"DOM tree snapshot.","type":"object","properties":[{"name":"parentIndex","description":"Parent node index.","optional":true,"type":"array","items":{"type":"integer"}},{"name":"nodeType","description":"`Node`'s nodeType.","optional":true,"type":"array","items":{"type":"integer"}},{"name":"nodeName","description":"`Node`'s nodeName.","optional":true,"type":"array","items":{"$ref":"StringIndex"}},{"name":"nodeValue","description":"`Node`'s nodeValue.","optional":true,"type":"array","items":{"$ref":"StringIndex"}},{"name":"backendNodeId","description":"`Node`'s id, corresponds to DOM.Node.backendNodeId.","optional":true,"type":"array","items":{"$ref":"DOM.BackendNodeId"}},{"name":"attributes","description":"Attributes of an `Element` node. Flatten name, value pairs.","optional":true,"type":"array","items":{"$ref":"ArrayOfStrings"}},{"name":"layoutNodeIndex","description":"The index of the node's related layout tree node in the `layoutTreeNodes` array returned by\n`captureSnapshot`, if any.","optional":true,"type":"array","items":{"type":"integer"}},{"name":"textValue","description":"Only set for textarea elements, contains the text value.","optional":true,"$ref":"RareStringData"},{"name":"inputValue","description":"Only set for input elements, contains the input's associated text value.","optional":true,"$ref":"RareStringData"},{"name":"inputChecked","description":"Only set for radio and checkbox input elements, indicates if the element has been checked","optional":true,"$ref":"RareBooleanData"},{"name":"optionSelected","description":"Only set for option elements, indicates if the element has been selected","optional":true,"$ref":"RareBooleanData"},{"name":"documentURL","description":"Document URL that `Document` or `FrameOwner` node points to.","optional":true,"$ref":"RareStringData"},{"name":"baseURL","description":"Base URL that `Document` or `FrameOwner` node uses for URL completion.","optional":true,"$ref":"RareStringData"},{"name":"contentLanguage","description":"Only set for documents, contains the document's content language.","optional":true,"$ref":"RareStringData"},{"name":"documentEncoding","description":"Only set for documents, contains the document's character set encoding.","optional":true,"$ref":"RareStringData"},{"name":"publicId","description":"`DocumentType` node's publicId.","optional":true,"$ref":"RareStringData"},{"name":"systemId","description":"`DocumentType` node's systemId.","optional":true,"$ref":"RareStringData"},{"name":"frameId","description":"Frame ID for frame owner elements and also for the document node.","optional":true,"$ref":"RareStringData"},{"name":"contentDocumentIndex","description":"The index of a frame owner element's content document in the `domNodes` array returned by\n`captureSnapshot`, if any.","optional":true,"$ref":"RareIntegerData"},{"name":"importedDocumentIndex","description":"Index of the imported document's node of a link element in the `domNodes` array returned by\n`captureSnapshot`, if any.","optional":true,"$ref":"RareIntegerData"},{"name":"templateContentIndex","description":"Index of the content node of a template element in the `domNodes` array returned by\n`captureSnapshot`.","optional":true,"$ref":"RareIntegerData"},{"name":"pseudoType","description":"Type of a pseudo element node.","optional":true,"$ref":"RareStringData"},{"name":"isClickable","description":"Whether this DOM node responds to mouse clicks. This includes nodes that have had click\nevent listeners attached via JavaScript as well as anchor tags that naturally navigate when\nclicked.","optional":true,"$ref":"RareBooleanData"},{"name":"currentSourceURL","description":"The selected url for nodes with a srcset attribute.","optional":true,"$ref":"RareStringData"},{"name":"originURL","description":"The url of the script (if any) that generates this node.","optional":true,"$ref":"RareStringData"}]},{"id":"TextBoxSnapshot","description":"Details of post layout rendered text positions. The exact layout should not be regarded as\nstable and may change between versions.","type":"object","properties":[{"name":"layoutIndex","description":"Intex of th elayout tree node that owns this box collection.","type":"array","items":{"type":"integer"}},{"name":"bounds","description":"The absolute position bounding box.","type":"array","items":{"$ref":"Rectangle"}},{"name":"start","description":"The starting index in characters, for this post layout textbox substring. Characters that\nwould be represented as a surrogate pair in UTF-16 have length 2.","type":"array","items":{"type":"integer"}},{"name":"length","description":"The number of characters in this post layout textbox substring. Characters that would be\nrepresented as a surrogate pair in UTF-16 have length 2.","type":"array","items":{"type":"integer"}}]},{"id":"LayoutTreeSnapshot","description":"Details of an element in the DOM tree with a LayoutObject.","type":"object","properties":[{"name":"nodeIndex","description":"The index of the related DOM node in the `domNodes` array returned by `getSnapshot`.","type":"array","items":{"type":"integer"}},{"name":"styles","description":"Index into the `computedStyles` array returned by `captureSnapshot`.","type":"array","items":{"$ref":"ArrayOfStrings"}},{"name":"bounds","description":"The absolute position bounding box.","type":"array","items":{"$ref":"Rectangle"}},{"name":"text","description":"Contents of the LayoutText, if any.","type":"array","items":{"$ref":"StringIndex"}},{"name":"textBoxes","description":"The post-layout inline text nodes","$ref":"TextBoxSnapshot"}]},{"id":"StylesSnapshot","description":"Computed style snapshot.","type":"object","properties":[{"name":"values","description":"Whitelisted ComputedStyle property values referenced by styleIndex.","type":"array","items":{"$ref":"ArrayOfStrings"}}]}],"commands":[{"name":"disable","description":"Disables DOM snapshot agent for the given page."},{"name":"enable","description":"Enables DOM snapshot agent for the given page."},{"name":"getSnapshot","description":"Returns a document snapshot, including the full DOM tree of the root node (including iframes,\ntemplate contents, and imported documents) in a flattened array, as well as layout and\nwhite-listed computed style information for the nodes. Shadow DOM in the returned DOM tree is\nflattened.","deprecated":true,"parameters":[{"name":"computedStyleWhitelist","description":"Whitelist of computed styles to return.","type":"array","items":{"type":"string"}},{"name":"includeEventListeners","description":"Whether or not to retrieve details of DOM listeners (default false).","optional":true,"type":"boolean"},{"name":"includePaintOrder","description":"Whether to determine and include the paint order index of LayoutTreeNodes (default false).","optional":true,"type":"boolean"},{"name":"includeUserAgentShadowTree","description":"Whether to include UA shadow tree in the snapshot (default false).","optional":true,"type":"boolean"}],"returns":[{"name":"domNodes","description":"The nodes in the DOM tree. The DOMNode at index 0 corresponds to the root document.","type":"array","items":{"$ref":"DOMNode"}},{"name":"layoutTreeNodes","description":"The nodes in the layout tree.","type":"array","items":{"$ref":"LayoutTreeNode"}},{"name":"computedStyles","description":"Whitelisted ComputedStyle properties for each node in the layout tree.","type":"array","items":{"$ref":"ComputedStyle"}}]},{"name":"captureSnapshot","description":"Returns a document snapshot, including the full DOM tree of the root node (including iframes,\ntemplate contents, and imported documents) in a flattened array, as well as layout and\nwhite-listed computed style information for the nodes. Shadow DOM in the returned DOM tree is\nflattened.","parameters":[{"name":"computedStyles","description":"Whitelist of computed styles to return.","type":"array","items":{"type":"string"}}],"returns":[{"name":"nodes","description":"The nodes in the DOM tree. The DOMNode at index 0 corresponds to the root document.","$ref":"DOMTreeSnapshot"},{"name":"layout","description":"The nodes in the layout tree.","$ref":"LayoutTreeSnapshot"},{"name":"strings","description":"Shared string table that all string properties refer to with indexes.","type":"array","items":{"type":"string"}}]}]},{"domain":"DOMStorage","description":"Query and modify DOM storage.","experimental":true,"types":[{"id":"StorageId","description":"DOM Storage identifier.","type":"object","properties":[{"name":"securityOrigin","description":"Security origin for the storage.","type":"string"},{"name":"isLocalStorage","description":"Whether the storage is local storage (not session storage).","type":"boolean"}]},{"id":"Item","description":"DOM Storage item.","type":"array","items":{"type":"string"}}],"commands":[{"name":"clear","parameters":[{"name":"storageId","$ref":"StorageId"}]},{"name":"disable","description":"Disables storage tracking, prevents storage events from being sent to the client."},{"name":"enable","description":"Enables storage tracking, storage events will now be delivered to the client."},{"name":"getDOMStorageItems","parameters":[{"name":"storageId","$ref":"StorageId"}],"returns":[{"name":"entries","type":"array","items":{"$ref":"Item"}}]},{"name":"removeDOMStorageItem","parameters":[{"name":"storageId","$ref":"StorageId"},{"name":"key","type":"string"}]},{"name":"setDOMStorageItem","parameters":[{"name":"storageId","$ref":"StorageId"},{"name":"key","type":"string"},{"name":"value","type":"string"}]}],"events":[{"name":"domStorageItemAdded","parameters":[{"name":"storageId","$ref":"StorageId"},{"name":"key","type":"string"},{"name":"newValue","type":"string"}]},{"name":"domStorageItemRemoved","parameters":[{"name":"storageId","$ref":"StorageId"},{"name":"key","type":"string"}]},{"name":"domStorageItemUpdated","parameters":[{"name":"storageId","$ref":"StorageId"},{"name":"key","type":"string"},{"name":"oldValue","type":"string"},{"name":"newValue","type":"string"}]},{"name":"domStorageItemsCleared","parameters":[{"name":"storageId","$ref":"StorageId"}]}]},{"domain":"Database","experimental":true,"types":[{"id":"DatabaseId","description":"Unique identifier of Database object.","type":"string"},{"id":"Database","description":"Database object.","type":"object","properties":[{"name":"id","description":"Database ID.","$ref":"DatabaseId"},{"name":"domain","description":"Database domain.","type":"string"},{"name":"name","description":"Database name.","type":"string"},{"name":"version","description":"Database version.","type":"string"}]},{"id":"Error","description":"Database error.","type":"object","properties":[{"name":"message","description":"Error message.","type":"string"},{"name":"code","description":"Error code.","type":"integer"}]}],"commands":[{"name":"disable","description":"Disables database tracking, prevents database events from being sent to the client."},{"name":"enable","description":"Enables database tracking, database events will now be delivered to the client."},{"name":"executeSQL","parameters":[{"name":"databaseId","$ref":"DatabaseId"},{"name":"query","type":"string"}],"returns":[{"name":"columnNames","optional":true,"type":"array","items":{"type":"string"}},{"name":"values","optional":true,"type":"array","items":{"type":"any"}},{"name":"sqlError","optional":true,"$ref":"Error"}]},{"name":"getDatabaseTableNames","parameters":[{"name":"databaseId","$ref":"DatabaseId"}],"returns":[{"name":"tableNames","type":"array","items":{"type":"string"}}]}],"events":[{"name":"addDatabase","parameters":[{"name":"database","$ref":"Database"}]}]},{"domain":"DeviceOrientation","experimental":true,"commands":[{"name":"clearDeviceOrientationOverride","description":"Clears the overridden Device Orientation."},{"name":"setDeviceOrientationOverride","description":"Overrides the Device Orientation.","parameters":[{"name":"alpha","description":"Mock alpha","type":"number"},{"name":"beta","description":"Mock beta","type":"number"},{"name":"gamma","description":"Mock gamma","type":"number"}]}]},{"domain":"Emulation","description":"This domain emulates different environments for the page.","dependencies":["DOM","Page","Runtime"],"types":[{"id":"ScreenOrientation","description":"Screen orientation.","type":"object","properties":[{"name":"type","description":"Orientation type.","type":"string","enum":["portraitPrimary","portraitSecondary","landscapePrimary","landscapeSecondary"]},{"name":"angle","description":"Orientation angle.","type":"integer"}]},{"id":"VirtualTimePolicy","description":"advance: If the scheduler runs out of immediate work, the virtual time base may fast forward to\nallow the next delayed task (if any) to run; pause: The virtual time base may not advance;\npauseIfNetworkFetchesPending: The virtual time base may not advance if there are any pending\nresource fetches.","experimental":true,"type":"string","enum":["advance","pause","pauseIfNetworkFetchesPending"]}],"commands":[{"name":"canEmulate","description":"Tells whether emulation is supported.","returns":[{"name":"result","description":"True if emulation is supported.","type":"boolean"}]},{"name":"clearDeviceMetricsOverride","description":"Clears the overriden device metrics."},{"name":"clearGeolocationOverride","description":"Clears the overriden Geolocation Position and Error."},{"name":"resetPageScaleFactor","description":"Requests that page scale factor is reset to initial values.","experimental":true},{"name":"setCPUThrottlingRate","description":"Enables CPU throttling to emulate slow CPUs.","experimental":true,"parameters":[{"name":"rate","description":"Throttling rate as a slowdown factor (1 is no throttle, 2 is 2x slowdown, etc).","type":"number"}]},{"name":"setDefaultBackgroundColorOverride","description":"Sets or clears an override of the default background color of the frame. This override is used\nif the content does not specify one.","parameters":[{"name":"color","description":"RGBA of the default background color. If not specified, any existing override will be\ncleared.","optional":true,"$ref":"DOM.RGBA"}]},{"name":"setDeviceMetricsOverride","description":"Overrides the values of device screen dimensions (window.screen.width, window.screen.height,\nwindow.innerWidth, window.innerHeight, and \"device-width\"/\"device-height\"-related CSS media\nquery results).","parameters":[{"name":"width","description":"Overriding width value in pixels (minimum 0, maximum 10000000). 0 disables the override.","type":"integer"},{"name":"height","description":"Overriding height value in pixels (minimum 0, maximum 10000000). 0 disables the override.","type":"integer"},{"name":"deviceScaleFactor","description":"Overriding device scale factor value. 0 disables the override.","type":"number"},{"name":"mobile","description":"Whether to emulate mobile device. This includes viewport meta tag, overlay scrollbars, text\nautosizing and more.","type":"boolean"},{"name":"scale","description":"Scale to apply to resulting view image.","experimental":true,"optional":true,"type":"number"},{"name":"screenWidth","description":"Overriding screen width value in pixels (minimum 0, maximum 10000000).","experimental":true,"optional":true,"type":"integer"},{"name":"screenHeight","description":"Overriding screen height value in pixels (minimum 0, maximum 10000000).","experimental":true,"optional":true,"type":"integer"},{"name":"positionX","description":"Overriding view X position on screen in pixels (minimum 0, maximum 10000000).","experimental":true,"optional":true,"type":"integer"},{"name":"positionY","description":"Overriding view Y position on screen in pixels (minimum 0, maximum 10000000).","experimental":true,"optional":true,"type":"integer"},{"name":"dontSetVisibleSize","description":"Do not set visible view size, rely upon explicit setVisibleSize call.","experimental":true,"optional":true,"type":"boolean"},{"name":"screenOrientation","description":"Screen orientation override.","optional":true,"$ref":"ScreenOrientation"},{"name":"viewport","description":"If set, the visible area of the page will be overridden to this viewport. This viewport\nchange is not observed by the page, e.g. viewport-relative elements do not change positions.","experimental":true,"optional":true,"$ref":"Page.Viewport"}]},{"name":"setScrollbarsHidden","experimental":true,"parameters":[{"name":"hidden","description":"Whether scrollbars should be always hidden.","type":"boolean"}]},{"name":"setDocumentCookieDisabled","experimental":true,"parameters":[{"name":"disabled","description":"Whether document.coookie API should be disabled.","type":"boolean"}]},{"name":"setEmitTouchEventsForMouse","experimental":true,"parameters":[{"name":"enabled","description":"Whether touch emulation based on mouse input should be enabled.","type":"boolean"},{"name":"configuration","description":"Touch/gesture events configuration. Default: current platform.","optional":true,"type":"string","enum":["mobile","desktop"]}]},{"name":"setEmulatedMedia","description":"Emulates the given media for CSS media queries.","parameters":[{"name":"media","description":"Media type to emulate. Empty string disables the override.","type":"string"}]},{"name":"setGeolocationOverride","description":"Overrides the Geolocation Position or Error. Omitting any of the parameters emulates position\nunavailable.","parameters":[{"name":"latitude","description":"Mock latitude","optional":true,"type":"number"},{"name":"longitude","description":"Mock longitude","optional":true,"type":"number"},{"name":"accuracy","description":"Mock accuracy","optional":true,"type":"number"}]},{"name":"setNavigatorOverrides","description":"Overrides value returned by the javascript navigator object.","experimental":true,"deprecated":true,"parameters":[{"name":"platform","description":"The platform navigator.platform should return.","type":"string"}]},{"name":"setPageScaleFactor","description":"Sets a specified page scale factor.","experimental":true,"parameters":[{"name":"pageScaleFactor","description":"Page scale factor.","type":"number"}]},{"name":"setScriptExecutionDisabled","description":"Switches script execution in the page.","parameters":[{"name":"value","description":"Whether script execution should be disabled in the page.","type":"boolean"}]},{"name":"setTouchEmulationEnabled","description":"Enables touch on platforms which do not support them.","parameters":[{"name":"enabled","description":"Whether the touch event emulation should be enabled.","type":"boolean"},{"name":"maxTouchPoints","description":"Maximum touch points supported. Defaults to one.","optional":true,"type":"integer"}]},{"name":"setVirtualTimePolicy","description":"Turns on virtual time for all frames (replacing real-time with a synthetic time source) and sets\nthe current virtual time policy.  Note this supersedes any previous time budget.","experimental":true,"parameters":[{"name":"policy","$ref":"VirtualTimePolicy"},{"name":"budget","description":"If set, after this many virtual milliseconds have elapsed virtual time will be paused and a\nvirtualTimeBudgetExpired event is sent.","optional":true,"type":"number"},{"name":"maxVirtualTimeTaskStarvationCount","description":"If set this specifies the maximum number of tasks that can be run before virtual is forced\nforwards to prevent deadlock.","optional":true,"type":"integer"},{"name":"waitForNavigation","description":"If set the virtual time policy change should be deferred until any frame starts navigating.\nNote any previous deferred policy change is superseded.","optional":true,"type":"boolean"},{"name":"initialVirtualTime","description":"If set, base::Time::Now will be overriden to initially return this value.","optional":true,"$ref":"Network.TimeSinceEpoch"}],"returns":[{"name":"virtualTimeTicksBase","description":"Absolute timestamp at which virtual time was first enabled (up time in milliseconds).","type":"number"}]},{"name":"setVisibleSize","description":"Resizes the frame/viewport of the page. Note that this does not affect the frame's container\n(e.g. browser window). Can be used to produce screenshots of the specified size. Not supported\non Android.","experimental":true,"deprecated":true,"parameters":[{"name":"width","description":"Frame width (DIP).","type":"integer"},{"name":"height","description":"Frame height (DIP).","type":"integer"}]},{"name":"setUserAgentOverride","description":"Allows overriding user agent with the given string.","parameters":[{"name":"userAgent","description":"User agent to use.","type":"string"},{"name":"acceptLanguage","description":"Browser langugage to emulate.","optional":true,"type":"string"},{"name":"platform","description":"The platform navigator.platform should return.","optional":true,"type":"string"}]}],"events":[{"name":"virtualTimeAdvanced","description":"Notification sent after the virtual time has advanced.","experimental":true,"parameters":[{"name":"virtualTimeElapsed","description":"The amount of virtual time that has elapsed in milliseconds since virtual time was first\nenabled.","type":"number"}]},{"name":"virtualTimeBudgetExpired","description":"Notification sent after the virtual time budget for the current VirtualTimePolicy has run out.","experimental":true},{"name":"virtualTimePaused","description":"Notification sent after the virtual time has paused.","experimental":true,"parameters":[{"name":"virtualTimeElapsed","description":"The amount of virtual time that has elapsed in milliseconds since virtual time was first\nenabled.","type":"number"}]}]},{"domain":"HeadlessExperimental","description":"This domain provides experimental commands only supported in headless mode.","experimental":true,"dependencies":["Page","Runtime"],"types":[{"id":"ScreenshotParams","description":"Encoding options for a screenshot.","type":"object","properties":[{"name":"format","description":"Image compression format (defaults to png).","optional":true,"type":"string","enum":["jpeg","png"]},{"name":"quality","description":"Compression quality from range [0..100] (jpeg only).","optional":true,"type":"integer"}]}],"commands":[{"name":"beginFrame","description":"Sends a BeginFrame to the target and returns when the frame was completed. Optionally captures a\nscreenshot from the resulting frame. Requires that the target was created with enabled\nBeginFrameControl. Designed for use with --run-all-compositor-stages-before-draw, see also\nhttps://goo.gl/3zHXhB for more background.","parameters":[{"name":"frameTimeTicks","description":"Timestamp of this BeginFrame in Renderer TimeTicks (milliseconds of uptime). If not set,\nthe current time will be used.","optional":true,"type":"number"},{"name":"interval","description":"The interval between BeginFrames that is reported to the compositor, in milliseconds.\nDefaults to a 60 frames/second interval, i.e. about 16.666 milliseconds.","optional":true,"type":"number"},{"name":"noDisplayUpdates","description":"Whether updates should not be committed and drawn onto the display. False by default. If\ntrue, only side effects of the BeginFrame will be run, such as layout and animations, but\nany visual updates may not be visible on the display or in screenshots.","optional":true,"type":"boolean"},{"name":"screenshot","description":"If set, a screenshot of the frame will be captured and returned in the response. Otherwise,\nno screenshot will be captured. Note that capturing a screenshot can fail, for example,\nduring renderer initialization. In such a case, no screenshot data will be returned.","optional":true,"$ref":"ScreenshotParams"}],"returns":[{"name":"hasDamage","description":"Whether the BeginFrame resulted in damage and, thus, a new frame was committed to the\ndisplay. Reported for diagnostic uses, may be removed in the future.","type":"boolean"},{"name":"screenshotData","description":"Base64-encoded image data of the screenshot, if one was requested and successfully taken.","optional":true,"type":"string"}]},{"name":"disable","description":"Disables headless events for the target."},{"name":"enable","description":"Enables headless events for the target."}],"events":[{"name":"needsBeginFramesChanged","description":"Issued when the target starts or stops needing BeginFrames.","parameters":[{"name":"needsBeginFrames","description":"True if BeginFrames are needed, false otherwise.","type":"boolean"}]}]},{"domain":"IO","description":"Input/Output operations for streams produced by DevTools.","types":[{"id":"StreamHandle","description":"This is either obtained from another method or specifed as `blob:&lt;uuid&gt;` where\n`&lt;uuid&gt` is an UUID of a Blob.","type":"string"}],"commands":[{"name":"close","description":"Close the stream, discard any temporary backing storage.","parameters":[{"name":"handle","description":"Handle of the stream to close.","$ref":"StreamHandle"}]},{"name":"read","description":"Read a chunk of the stream","parameters":[{"name":"handle","description":"Handle of the stream to read.","$ref":"StreamHandle"},{"name":"offset","description":"Seek to the specified offset before reading (if not specificed, proceed with offset\nfollowing the last read). Some types of streams may only support sequential reads.","optional":true,"type":"integer"},{"name":"size","description":"Maximum number of bytes to read (left upon the agent discretion if not specified).","optional":true,"type":"integer"}],"returns":[{"name":"base64Encoded","description":"Set if the data is base64-encoded","optional":true,"type":"boolean"},{"name":"data","description":"Data that were read.","type":"string"},{"name":"eof","description":"Set if the end-of-file condition occured while reading.","type":"boolean"}]},{"name":"resolveBlob","description":"Return UUID of Blob object specified by a remote object id.","parameters":[{"name":"objectId","description":"Object id of a Blob object wrapper.","$ref":"Runtime.RemoteObjectId"}],"returns":[{"name":"uuid","description":"UUID of the specified Blob.","type":"string"}]}]},{"domain":"IndexedDB","experimental":true,"dependencies":["Runtime"],"types":[{"id":"DatabaseWithObjectStores","description":"Database with an array of object stores.","type":"object","properties":[{"name":"name","description":"Database name.","type":"string"},{"name":"version","description":"Database version.","type":"integer"},{"name":"objectStores","description":"Object stores in this database.","type":"array","items":{"$ref":"ObjectStore"}}]},{"id":"ObjectStore","description":"Object store.","type":"object","properties":[{"name":"name","description":"Object store name.","type":"string"},{"name":"keyPath","description":"Object store key path.","$ref":"KeyPath"},{"name":"autoIncrement","description":"If true, object store has auto increment flag set.","type":"boolean"},{"name":"indexes","description":"Indexes in this object store.","type":"array","items":{"$ref":"ObjectStoreIndex"}}]},{"id":"ObjectStoreIndex","description":"Object store index.","type":"object","properties":[{"name":"name","description":"Index name.","type":"string"},{"name":"keyPath","description":"Index key path.","$ref":"KeyPath"},{"name":"unique","description":"If true, index is unique.","type":"boolean"},{"name":"multiEntry","description":"If true, index allows multiple entries for a key.","type":"boolean"}]},{"id":"Key","description":"Key.","type":"object","properties":[{"name":"type","description":"Key type.","type":"string","enum":["number","string","date","array"]},{"name":"number","description":"Number value.","optional":true,"type":"number"},{"name":"string","description":"String value.","optional":true,"type":"string"},{"name":"date","description":"Date value.","optional":true,"type":"number"},{"name":"array","description":"Array value.","optional":true,"type":"array","items":{"$ref":"Key"}}]},{"id":"KeyRange","description":"Key range.","type":"object","properties":[{"name":"lower","description":"Lower bound.","optional":true,"$ref":"Key"},{"name":"upper","description":"Upper bound.","optional":true,"$ref":"Key"},{"name":"lowerOpen","description":"If true lower bound is open.","type":"boolean"},{"name":"upperOpen","description":"If true upper bound is open.","type":"boolean"}]},{"id":"DataEntry","description":"Data entry.","type":"object","properties":[{"name":"key","description":"Key object.","$ref":"Runtime.RemoteObject"},{"name":"primaryKey","description":"Primary key object.","$ref":"Runtime.RemoteObject"},{"name":"value","description":"Value object.","$ref":"Runtime.RemoteObject"}]},{"id":"KeyPath","description":"Key path.","type":"object","properties":[{"name":"type","description":"Key path type.","type":"string","enum":["null","string","array"]},{"name":"string","description":"String value.","optional":true,"type":"string"},{"name":"array","description":"Array value.","optional":true,"type":"array","items":{"type":"string"}}]}],"commands":[{"name":"clearObjectStore","description":"Clears all entries from an object store.","parameters":[{"name":"securityOrigin","description":"Security origin.","type":"string"},{"name":"databaseName","description":"Database name.","type":"string"},{"name":"objectStoreName","description":"Object store name.","type":"string"}]},{"name":"deleteDatabase","description":"Deletes a database.","parameters":[{"name":"securityOrigin","description":"Security origin.","type":"string"},{"name":"databaseName","description":"Database name.","type":"string"}]},{"name":"deleteObjectStoreEntries","description":"Delete a range of entries from an object store","parameters":[{"name":"securityOrigin","type":"string"},{"name":"databaseName","type":"string"},{"name":"objectStoreName","type":"string"},{"name":"keyRange","description":"Range of entry keys to delete","$ref":"KeyRange"}]},{"name":"disable","description":"Disables events from backend."},{"name":"enable","description":"Enables events from backend."},{"name":"requestData","description":"Requests data from object store or index.","parameters":[{"name":"securityOrigin","description":"Security origin.","type":"string"},{"name":"databaseName","description":"Database name.","type":"string"},{"name":"objectStoreName","description":"Object store name.","type":"string"},{"name":"indexName","description":"Index name, empty string for object store data requests.","type":"string"},{"name":"skipCount","description":"Number of records to skip.","type":"integer"},{"name":"pageSize","description":"Number of records to fetch.","type":"integer"},{"name":"keyRange","description":"Key range.","optional":true,"$ref":"KeyRange"}],"returns":[{"name":"objectStoreDataEntries","description":"Array of object store data entries.","type":"array","items":{"$ref":"DataEntry"}},{"name":"hasMore","description":"If true, there are more entries to fetch in the given range.","type":"boolean"}]},{"name":"requestDatabase","description":"Requests database with given name in given frame.","parameters":[{"name":"securityOrigin","description":"Security origin.","type":"string"},{"name":"databaseName","description":"Database name.","type":"string"}],"returns":[{"name":"databaseWithObjectStores","description":"Database with an array of object stores.","$ref":"DatabaseWithObjectStores"}]},{"name":"requestDatabaseNames","description":"Requests database names for given security origin.","parameters":[{"name":"securityOrigin","description":"Security origin.","type":"string"}],"returns":[{"name":"databaseNames","description":"Database names for origin.","type":"array","items":{"type":"string"}}]}]},{"domain":"Input","types":[{"id":"TouchPoint","type":"object","properties":[{"name":"x","description":"X coordinate of the event relative to the main frame's viewport in CSS pixels.","type":"number"},{"name":"y","description":"Y coordinate of the event relative to the main frame's viewport in CSS pixels. 0 refers to\nthe top of the viewport and Y increases as it proceeds towards the bottom of the viewport.","type":"number"},{"name":"radiusX","description":"X radius of the touch area (default: 1.0).","optional":true,"type":"number"},{"name":"radiusY","description":"Y radius of the touch area (default: 1.0).","optional":true,"type":"number"},{"name":"rotationAngle","description":"Rotation angle (default: 0.0).","optional":true,"type":"number"},{"name":"force","description":"Force (default: 1.0).","optional":true,"type":"number"},{"name":"id","description":"Identifier used to track touch sources between events, must be unique within an event.","optional":true,"type":"number"}]},{"id":"GestureSourceType","experimental":true,"type":"string","enum":["default","touch","mouse"]},{"id":"TimeSinceEpoch","description":"UTC time in seconds, counted from January 1, 1970.","type":"number"}],"commands":[{"name":"dispatchKeyEvent","description":"Dispatches a key event to the page.","parameters":[{"name":"type","description":"Type of the key event.","type":"string","enum":["keyDown","keyUp","rawKeyDown","char"]},{"name":"modifiers","description":"Bit field representing pressed modifier keys. Alt=1, Ctrl=2, Meta/Command=4, Shift=8\n(default: 0).","optional":true,"type":"integer"},{"name":"timestamp","description":"Time at which the event occurred.","optional":true,"$ref":"TimeSinceEpoch"},{"name":"text","description":"Text as generated by processing a virtual key code with a keyboard layout. Not needed for\nfor `keyUp` and `rawKeyDown` events (default: \"\")","optional":true,"type":"string"},{"name":"unmodifiedText","description":"Text that would have been generated by the keyboard if no modifiers were pressed (except for\nshift). Useful for shortcut (accelerator) key handling (default: \"\").","optional":true,"type":"string"},{"name":"keyIdentifier","description":"Unique key identifier (e.g., 'U+0041') (default: \"\").","optional":true,"type":"string"},{"name":"code","description":"Unique DOM defined string value for each physical key (e.g., 'KeyA') (default: \"\").","optional":true,"type":"string"},{"name":"key","description":"Unique DOM defined string value describing the meaning of the key in the context of active\nmodifiers, keyboard layout, etc (e.g., 'AltGr') (default: \"\").","optional":true,"type":"string"},{"name":"windowsVirtualKeyCode","description":"Windows virtual key code (default: 0).","optional":true,"type":"integer"},{"name":"nativeVirtualKeyCode","description":"Native virtual key code (default: 0).","optional":true,"type":"integer"},{"name":"autoRepeat","description":"Whether the event was generated from auto repeat (default: false).","optional":true,"type":"boolean"},{"name":"isKeypad","description":"Whether the event was generated from the keypad (default: false).","optional":true,"type":"boolean"},{"name":"isSystemKey","description":"Whether the event was a system key event (default: false).","optional":true,"type":"boolean"},{"name":"location","description":"Whether the event was from the left or right side of the keyboard. 1=Left, 2=Right (default:\n0).","optional":true,"type":"integer"}]},{"name":"dispatchMouseEvent","description":"Dispatches a mouse event to the page.","parameters":[{"name":"type","description":"Type of the mouse event.","type":"string","enum":["mousePressed","mouseReleased","mouseMoved","mouseWheel"]},{"name":"x","description":"X coordinate of the event relative to the main frame's viewport in CSS pixels.","type":"number"},{"name":"y","description":"Y coordinate of the event relative to the main frame's viewport in CSS pixels. 0 refers to\nthe top of the viewport and Y increases as it proceeds towards the bottom of the viewport.","type":"number"},{"name":"modifiers","description":"Bit field representing pressed modifier keys. Alt=1, Ctrl=2, Meta/Command=4, Shift=8\n(default: 0).","optional":true,"type":"integer"},{"name":"timestamp","description":"Time at which the event occurred.","optional":true,"$ref":"TimeSinceEpoch"},{"name":"button","description":"Mouse button (default: \"none\").","optional":true,"type":"string","enum":["none","left","middle","right"]},{"name":"clickCount","description":"Number of times the mouse button was clicked (default: 0).","optional":true,"type":"integer"},{"name":"deltaX","description":"X delta in CSS pixels for mouse wheel event (default: 0).","optional":true,"type":"number"},{"name":"deltaY","description":"Y delta in CSS pixels for mouse wheel event (default: 0).","optional":true,"type":"number"}]},{"name":"dispatchTouchEvent","description":"Dispatches a touch event to the page.","parameters":[{"name":"type","description":"Type of the touch event. TouchEnd and TouchCancel must not contain any touch points, while\nTouchStart and TouchMove must contains at least one.","type":"string","enum":["touchStart","touchEnd","touchMove","touchCancel"]},{"name":"touchPoints","description":"Active touch points on the touch device. One event per any changed point (compared to\nprevious touch event in a sequence) is generated, emulating pressing/moving/releasing points\none by one.","type":"array","items":{"$ref":"TouchPoint"}},{"name":"modifiers","description":"Bit field representing pressed modifier keys. Alt=1, Ctrl=2, Meta/Command=4, Shift=8\n(default: 0).","optional":true,"type":"integer"},{"name":"timestamp","description":"Time at which the event occurred.","optional":true,"$ref":"TimeSinceEpoch"}]},{"name":"emulateTouchFromMouseEvent","description":"Emulates touch event from the mouse event parameters.","experimental":true,"parameters":[{"name":"type","description":"Type of the mouse event.","type":"string","enum":["mousePressed","mouseReleased","mouseMoved","mouseWheel"]},{"name":"x","description":"X coordinate of the mouse pointer in DIP.","type":"integer"},{"name":"y","description":"Y coordinate of the mouse pointer in DIP.","type":"integer"},{"name":"button","description":"Mouse button.","type":"string","enum":["none","left","middle","right"]},{"name":"timestamp","description":"Time at which the event occurred (default: current time).","optional":true,"$ref":"TimeSinceEpoch"},{"name":"deltaX","description":"X delta in DIP for mouse wheel event (default: 0).","optional":true,"type":"number"},{"name":"deltaY","description":"Y delta in DIP for mouse wheel event (default: 0).","optional":true,"type":"number"},{"name":"modifiers","description":"Bit field representing pressed modifier keys. Alt=1, Ctrl=2, Meta/Command=4, Shift=8\n(default: 0).","optional":true,"type":"integer"},{"name":"clickCount","description":"Number of times the mouse button was clicked (default: 0).","optional":true,"type":"integer"}]},{"name":"setIgnoreInputEvents","description":"Ignores input events (useful while auditing page).","parameters":[{"name":"ignore","description":"Ignores input events processing when set to true.","type":"boolean"}]},{"name":"synthesizePinchGesture","description":"Synthesizes a pinch gesture over a time period by issuing appropriate touch events.","experimental":true,"parameters":[{"name":"x","description":"X coordinate of the start of the gesture in CSS pixels.","type":"number"},{"name":"y","description":"Y coordinate of the start of the gesture in CSS pixels.","type":"number"},{"name":"scaleFactor","description":"Relative scale factor after zooming (>1.0 zooms in, <1.0 zooms out).","type":"number"},{"name":"relativeSpeed","description":"Relative pointer speed in pixels per second (default: 800).","optional":true,"type":"integer"},{"name":"gestureSourceType","description":"Which type of input events to be generated (default: 'default', which queries the platform\nfor the preferred input type).","optional":true,"$ref":"GestureSourceType"}]},{"name":"synthesizeScrollGesture","description":"Synthesizes a scroll gesture over a time period by issuing appropriate touch events.","experimental":true,"parameters":[{"name":"x","description":"X coordinate of the start of the gesture in CSS pixels.","type":"number"},{"name":"y","description":"Y coordinate of the start of the gesture in CSS pixels.","type":"number"},{"name":"xDistance","description":"The distance to scroll along the X axis (positive to scroll left).","optional":true,"type":"number"},{"name":"yDistance","description":"The distance to scroll along the Y axis (positive to scroll up).","optional":true,"type":"number"},{"name":"xOverscroll","description":"The number of additional pixels to scroll back along the X axis, in addition to the given\ndistance.","optional":true,"type":"number"},{"name":"yOverscroll","description":"The number of additional pixels to scroll back along the Y axis, in addition to the given\ndistance.","optional":true,"type":"number"},{"name":"preventFling","description":"Prevent fling (default: true).","optional":true,"type":"boolean"},{"name":"speed","description":"Swipe speed in pixels per second (default: 800).","optional":true,"type":"integer"},{"name":"gestureSourceType","description":"Which type of input events to be generated (default: 'default', which queries the platform\nfor the preferred input type).","optional":true,"$ref":"GestureSourceType"},{"name":"repeatCount","description":"The number of times to repeat the gesture (default: 0).","optional":true,"type":"integer"},{"name":"repeatDelayMs","description":"The number of milliseconds delay between each repeat. (default: 250).","optional":true,"type":"integer"},{"name":"interactionMarkerName","description":"The name of the interaction markers to generate, if not empty (default: \"\").","optional":true,"type":"string"}]},{"name":"synthesizeTapGesture","description":"Synthesizes a tap gesture over a time period by issuing appropriate touch events.","experimental":true,"parameters":[{"name":"x","description":"X coordinate of the start of the gesture in CSS pixels.","type":"number"},{"name":"y","description":"Y coordinate of the start of the gesture in CSS pixels.","type":"number"},{"name":"duration","description":"Duration between touchdown and touchup events in ms (default: 50).","optional":true,"type":"integer"},{"name":"tapCount","description":"Number of times to perform the tap (e.g. 2 for double tap, default: 1).","optional":true,"type":"integer"},{"name":"gestureSourceType","description":"Which type of input events to be generated (default: 'default', which queries the platform\nfor the preferred input type).","optional":true,"$ref":"GestureSourceType"}]}]},{"domain":"Inspector","experimental":true,"commands":[{"name":"disable","description":"Disables inspector domain notifications."},{"name":"enable","description":"Enables inspector domain notifications."}],"events":[{"name":"detached","description":"Fired when remote debugging connection is about to be terminated. Contains detach reason.","parameters":[{"name":"reason","description":"The reason why connection has been terminated.","type":"string"}]},{"name":"targetCrashed","description":"Fired when debugging target has crashed"},{"name":"targetReloadedAfterCrash","description":"Fired when debugging target has reloaded after crash"}]},{"domain":"LayerTree","experimental":true,"dependencies":["DOM"],"types":[{"id":"LayerId","description":"Unique Layer identifier.","type":"string"},{"id":"SnapshotId","description":"Unique snapshot identifier.","type":"string"},{"id":"ScrollRect","description":"Rectangle where scrolling happens on the main thread.","type":"object","properties":[{"name":"rect","description":"Rectangle itself.","$ref":"DOM.Rect"},{"name":"type","description":"Reason for rectangle to force scrolling on the main thread","type":"string","enum":["RepaintsOnScroll","TouchEventHandler","WheelEventHandler"]}]},{"id":"StickyPositionConstraint","description":"Sticky position constraints.","type":"object","properties":[{"name":"stickyBoxRect","description":"Layout rectangle of the sticky element before being shifted","$ref":"DOM.Rect"},{"name":"containingBlockRect","description":"Layout rectangle of the containing block of the sticky element","$ref":"DOM.Rect"},{"name":"nearestLayerShiftingStickyBox","description":"The nearest sticky layer that shifts the sticky box","optional":true,"$ref":"LayerId"},{"name":"nearestLayerShiftingContainingBlock","description":"The nearest sticky layer that shifts the containing block","optional":true,"$ref":"LayerId"}]},{"id":"PictureTile","description":"Serialized fragment of layer picture along with its offset within the layer.","type":"object","properties":[{"name":"x","description":"Offset from owning layer left boundary","type":"number"},{"name":"y","description":"Offset from owning layer top boundary","type":"number"},{"name":"picture","description":"Base64-encoded snapshot data.","type":"string"}]},{"id":"Layer","description":"Information about a compositing layer.","type":"object","properties":[{"name":"layerId","description":"The unique id for this layer.","$ref":"LayerId"},{"name":"parentLayerId","description":"The id of parent (not present for root).","optional":true,"$ref":"LayerId"},{"name":"backendNodeId","description":"The backend id for the node associated with this layer.","optional":true,"$ref":"DOM.BackendNodeId"},{"name":"offsetX","description":"Offset from parent layer, X coordinate.","type":"number"},{"name":"offsetY","description":"Offset from parent layer, Y coordinate.","type":"number"},{"name":"width","description":"Layer width.","type":"number"},{"name":"height","description":"Layer height.","type":"number"},{"name":"transform","description":"Transformation matrix for layer, default is identity matrix","optional":true,"type":"array","items":{"type":"number"}},{"name":"anchorX","description":"Transform anchor point X, absent if no transform specified","optional":true,"type":"number"},{"name":"anchorY","description":"Transform anchor point Y, absent if no transform specified","optional":true,"type":"number"},{"name":"anchorZ","description":"Transform anchor point Z, absent if no transform specified","optional":true,"type":"number"},{"name":"paintCount","description":"Indicates how many time this layer has painted.","type":"integer"},{"name":"drawsContent","description":"Indicates whether this layer hosts any content, rather than being used for\ntransform/scrolling purposes only.","type":"boolean"},{"name":"invisible","description":"Set if layer is not visible.","optional":true,"type":"boolean"},{"name":"scrollRects","description":"Rectangles scrolling on main thread only.","optional":true,"type":"array","items":{"$ref":"ScrollRect"}},{"name":"stickyPositionConstraint","description":"Sticky position constraint information","optional":true,"$ref":"StickyPositionConstraint"}]},{"id":"PaintProfile","description":"Array of timings, one per paint step.","type":"array","items":{"type":"number"}}],"commands":[{"name":"compositingReasons","description":"Provides the reasons why the given layer was composited.","parameters":[{"name":"layerId","description":"The id of the layer for which we want to get the reasons it was composited.","$ref":"LayerId"}],"returns":[{"name":"compositingReasons","description":"A list of strings specifying reasons for the given layer to become composited.","type":"array","items":{"type":"string"}}]},{"name":"disable","description":"Disables compositing tree inspection."},{"name":"enable","description":"Enables compositing tree inspection."},{"name":"loadSnapshot","description":"Returns the snapshot identifier.","parameters":[{"name":"tiles","description":"An array of tiles composing the snapshot.","type":"array","items":{"$ref":"PictureTile"}}],"returns":[{"name":"snapshotId","description":"The id of the snapshot.","$ref":"SnapshotId"}]},{"name":"makeSnapshot","description":"Returns the layer snapshot identifier.","parameters":[{"name":"layerId","description":"The id of the layer.","$ref":"LayerId"}],"returns":[{"name":"snapshotId","description":"The id of the layer snapshot.","$ref":"SnapshotId"}]},{"name":"profileSnapshot","parameters":[{"name":"snapshotId","description":"The id of the layer snapshot.","$ref":"SnapshotId"},{"name":"minRepeatCount","description":"The maximum number of times to replay the snapshot (1, if not specified).","optional":true,"type":"integer"},{"name":"minDuration","description":"The minimum duration (in seconds) to replay the snapshot.","optional":true,"type":"number"},{"name":"clipRect","description":"The clip rectangle to apply when replaying the snapshot.","optional":true,"$ref":"DOM.Rect"}],"returns":[{"name":"timings","description":"The array of paint profiles, one per run.","type":"array","items":{"$ref":"PaintProfile"}}]},{"name":"releaseSnapshot","description":"Releases layer snapshot captured by the back-end.","parameters":[{"name":"snapshotId","description":"The id of the layer snapshot.","$ref":"SnapshotId"}]},{"name":"replaySnapshot","description":"Replays the layer snapshot and returns the resulting bitmap.","parameters":[{"name":"snapshotId","description":"The id of the layer snapshot.","$ref":"SnapshotId"},{"name":"fromStep","description":"The first step to replay from (replay from the very start if not specified).","optional":true,"type":"integer"},{"name":"toStep","description":"The last step to replay to (replay till the end if not specified).","optional":true,"type":"integer"},{"name":"scale","description":"The scale to apply while replaying (defaults to 1).","optional":true,"type":"number"}],"returns":[{"name":"dataURL","description":"A data: URL for resulting image.","type":"string"}]},{"name":"snapshotCommandLog","description":"Replays the layer snapshot and returns canvas log.","parameters":[{"name":"snapshotId","description":"The id of the layer snapshot.","$ref":"SnapshotId"}],"returns":[{"name":"commandLog","description":"The array of canvas function calls.","type":"array","items":{"type":"object"}}]}],"events":[{"name":"layerPainted","parameters":[{"name":"layerId","description":"The id of the painted layer.","$ref":"LayerId"},{"name":"clip","description":"Clip rectangle.","$ref":"DOM.Rect"}]},{"name":"layerTreeDidChange","parameters":[{"name":"layers","description":"Layer tree, absent if not in the comspositing mode.","optional":true,"type":"array","items":{"$ref":"Layer"}}]}]},{"domain":"Log","description":"Provides access to log entries.","dependencies":["Runtime","Network"],"types":[{"id":"LogEntry","description":"Log entry.","type":"object","properties":[{"name":"source","description":"Log entry source.","type":"string","enum":["xml","javascript","network","storage","appcache","rendering","security","deprecation","worker","violation","intervention","recommendation","other"]},{"name":"level","description":"Log entry severity.","type":"string","enum":["verbose","info","warning","error"]},{"name":"text","description":"Logged text.","type":"string"},{"name":"timestamp","description":"Timestamp when this entry was added.","$ref":"Runtime.Timestamp"},{"name":"url","description":"URL of the resource if known.","optional":true,"type":"string"},{"name":"lineNumber","description":"Line number in the resource.","optional":true,"type":"integer"},{"name":"stackTrace","description":"JavaScript stack trace.","optional":true,"$ref":"Runtime.StackTrace"},{"name":"networkRequestId","description":"Identifier of the network request associated with this entry.","optional":true,"$ref":"Network.RequestId"},{"name":"workerId","description":"Identifier of the worker associated with this entry.","optional":true,"type":"string"},{"name":"args","description":"Call arguments.","optional":true,"type":"array","items":{"$ref":"Runtime.RemoteObject"}}]},{"id":"ViolationSetting","description":"Violation configuration setting.","type":"object","properties":[{"name":"name","description":"Violation type.","type":"string","enum":["longTask","longLayout","blockedEvent","blockedParser","discouragedAPIUse","handler","recurringHandler"]},{"name":"threshold","description":"Time threshold to trigger upon.","type":"number"}]}],"commands":[{"name":"clear","description":"Clears the log."},{"name":"disable","description":"Disables log domain, prevents further log entries from being reported to the client."},{"name":"enable","description":"Enables log domain, sends the entries collected so far to the client by means of the\n`entryAdded` notification."},{"name":"startViolationsReport","description":"start violation reporting.","parameters":[{"name":"config","description":"Configuration for violations.","type":"array","items":{"$ref":"ViolationSetting"}}]},{"name":"stopViolationsReport","description":"Stop violation reporting."}],"events":[{"name":"entryAdded","description":"Issued when new message was logged.","parameters":[{"name":"entry","description":"The entry.","$ref":"LogEntry"}]}]},{"domain":"Memory","experimental":true,"types":[{"id":"PressureLevel","description":"Memory pressure level.","type":"string","enum":["moderate","critical"]},{"id":"SamplingProfileNode","description":"Heap profile sample.","type":"object","properties":[{"name":"size","description":"Size of the sampled allocation.","type":"number"},{"name":"total","description":"Total bytes attributed to this sample.","type":"number"},{"name":"stack","description":"Execution stack at the point of allocation.","type":"array","items":{"type":"string"}}]},{"id":"SamplingProfile","description":"Array of heap profile samples.","type":"object","properties":[{"name":"samples","type":"array","items":{"$ref":"SamplingProfileNode"}}]}],"commands":[{"name":"getDOMCounters","returns":[{"name":"documents","type":"integer"},{"name":"nodes","type":"integer"},{"name":"jsEventListeners","type":"integer"}]},{"name":"prepareForLeakDetection"},{"name":"setPressureNotificationsSuppressed","description":"Enable/disable suppressing memory pressure notifications in all processes.","parameters":[{"name":"suppressed","description":"If true, memory pressure notifications will be suppressed.","type":"boolean"}]},{"name":"simulatePressureNotification","description":"Simulate a memory pressure notification in all processes.","parameters":[{"name":"level","description":"Memory pressure level of the notification.","$ref":"PressureLevel"}]},{"name":"startSampling","description":"Start collecting native memory profile.","parameters":[{"name":"samplingInterval","description":"Average number of bytes between samples.","optional":true,"type":"integer"},{"name":"suppressRandomness","description":"Do not randomize intervals between samples.","optional":true,"type":"boolean"}]},{"name":"stopSampling","description":"Stop collecting native memory profile."},{"name":"getAllTimeSamplingProfile","description":"Retrieve native memory allocations profile\ncollected since renderer process startup.","returns":[{"name":"profile","$ref":"SamplingProfile"}]},{"name":"getBrowserSamplingProfile","description":"Retrieve native memory allocations profile\ncollected since browser process startup.","returns":[{"name":"profile","$ref":"SamplingProfile"}]},{"name":"getSamplingProfile","description":"Retrieve native memory allocations profile collected since last\n`startSampling` call.","returns":[{"name":"profile","$ref":"SamplingProfile"}]}]},{"domain":"Network","description":"Network domain allows tracking network activities of the page. It exposes information about http,\nfile, data and other requests and responses, their headers, bodies, timing, etc.","dependencies":["Debugger","Runtime","Security"],"types":[{"id":"LoaderId","description":"Unique loader identifier.","type":"string"},{"id":"RequestId","description":"Unique request identifier.","type":"string"},{"id":"InterceptionId","description":"Unique intercepted request identifier.","type":"string"},{"id":"ErrorReason","description":"Network level fetch failure reason.","type":"string","enum":["Failed","Aborted","TimedOut","AccessDenied","ConnectionClosed","ConnectionReset","ConnectionRefused","ConnectionAborted","ConnectionFailed","NameNotResolved","InternetDisconnected","AddressUnreachable","BlockedByClient","BlockedByResponse"]},{"id":"TimeSinceEpoch","description":"UTC time in seconds, counted from January 1, 1970.","type":"number"},{"id":"MonotonicTime","description":"Monotonically increasing time in seconds since an arbitrary point in the past.","type":"number"},{"id":"Headers","description":"Request / response headers as keys / values of JSON object.","type":"object"},{"id":"ConnectionType","description":"The underlying connection technology that the browser is supposedly using.","type":"string","enum":["none","cellular2g","cellular3g","cellular4g","bluetooth","ethernet","wifi","wimax","other"]},{"id":"CookieSameSite","description":"Represents the cookie's 'SameSite' status:\nhttps://tools.ietf.org/html/draft-west-first-party-cookies","type":"string","enum":["Strict","Lax"]},{"id":"ResourceTiming","description":"Timing information for the request.","type":"object","properties":[{"name":"requestTime","description":"Timing's requestTime is a baseline in seconds, while the other numbers are ticks in\nmilliseconds relatively to this requestTime.","type":"number"},{"name":"proxyStart","description":"Started resolving proxy.","type":"number"},{"name":"proxyEnd","description":"Finished resolving proxy.","type":"number"},{"name":"dnsStart","description":"Started DNS address resolve.","type":"number"},{"name":"dnsEnd","description":"Finished DNS address resolve.","type":"number"},{"name":"connectStart","description":"Started connecting to the remote host.","type":"number"},{"name":"connectEnd","description":"Connected to the remote host.","type":"number"},{"name":"sslStart","description":"Started SSL handshake.","type":"number"},{"name":"sslEnd","description":"Finished SSL handshake.","type":"number"},{"name":"workerStart","description":"Started running ServiceWorker.","experimental":true,"type":"number"},{"name":"workerReady","description":"Finished Starting ServiceWorker.","experimental":true,"type":"number"},{"name":"sendStart","description":"Started sending request.","type":"number"},{"name":"sendEnd","description":"Finished sending request.","type":"number"},{"name":"pushStart","description":"Time the server started pushing request.","experimental":true,"type":"number"},{"name":"pushEnd","description":"Time the server finished pushing request.","experimental":true,"type":"number"},{"name":"receiveHeadersEnd","description":"Finished receiving response headers.","type":"number"}]},{"id":"ResourcePriority","description":"Loading priority of a resource request.","type":"string","enum":["VeryLow","Low","Medium","High","VeryHigh"]},{"id":"Request","description":"HTTP request data.","type":"object","properties":[{"name":"url","description":"Request URL (without fragment).","type":"string"},{"name":"urlFragment","description":"Fragment of the requested URL starting with hash, if present.","optional":true,"type":"string"},{"name":"method","description":"HTTP request method.","type":"string"},{"name":"headers","description":"HTTP request headers.","$ref":"Headers"},{"name":"postData","description":"HTTP POST request data.","optional":true,"type":"string"},{"name":"hasPostData","description":"True when the request has POST data. Note that postData might still be omitted when this flag is true when the data is too long.","optional":true,"type":"boolean"},{"name":"mixedContentType","description":"The mixed content type of the request.","optional":true,"$ref":"Security.MixedContentType"},{"name":"initialPriority","description":"Priority of the resource request at the time request is sent.","$ref":"ResourcePriority"},{"name":"referrerPolicy","description":"The referrer policy of the request, as defined in https://www.w3.org/TR/referrer-policy/","type":"string","enum":["unsafe-url","no-referrer-when-downgrade","no-referrer","origin","origin-when-cross-origin","same-origin","strict-origin","strict-origin-when-cross-origin"]},{"name":"isLinkPreload","description":"Whether is loaded via link preload.","optional":true,"type":"boolean"}]},{"id":"SignedCertificateTimestamp","description":"Details of a signed certificate timestamp (SCT).","type":"object","properties":[{"name":"status","description":"Validation status.","type":"string"},{"name":"origin","description":"Origin.","type":"string"},{"name":"logDescription","description":"Log name / description.","type":"string"},{"name":"logId","description":"Log ID.","type":"string"},{"name":"timestamp","description":"Issuance date.","$ref":"TimeSinceEpoch"},{"name":"hashAlgorithm","description":"Hash algorithm.","type":"string"},{"name":"signatureAlgorithm","description":"Signature algorithm.","type":"string"},{"name":"signatureData","description":"Signature data.","type":"string"}]},{"id":"SecurityDetails","description":"Security details about a request.","type":"object","properties":[{"name":"protocol","description":"Protocol name (e.g. \"TLS 1.2\" or \"QUIC\").","type":"string"},{"name":"keyExchange","description":"Key Exchange used by the connection, or the empty string if not applicable.","type":"string"},{"name":"keyExchangeGroup","description":"(EC)DH group used by the connection, if applicable.","optional":true,"type":"string"},{"name":"cipher","description":"Cipher name.","type":"string"},{"name":"mac","description":"TLS MAC. Note that AEAD ciphers do not have separate MACs.","optional":true,"type":"string"},{"name":"certificateId","description":"Certificate ID value.","$ref":"Security.CertificateId"},{"name":"subjectName","description":"Certificate subject name.","type":"string"},{"name":"sanList","description":"Subject Alternative Name (SAN) DNS names and IP addresses.","type":"array","items":{"type":"string"}},{"name":"issuer","description":"Name of the issuing CA.","type":"string"},{"name":"validFrom","description":"Certificate valid from date.","$ref":"TimeSinceEpoch"},{"name":"validTo","description":"Certificate valid to (expiration) date","$ref":"TimeSinceEpoch"},{"name":"signedCertificateTimestampList","description":"List of signed certificate timestamps (SCTs).","type":"array","items":{"$ref":"SignedCertificateTimestamp"}},{"name":"certificateTransparencyCompliance","description":"Whether the request complied with Certificate Transparency policy","$ref":"CertificateTransparencyCompliance"}]},{"id":"CertificateTransparencyCompliance","description":"Whether the request complied with Certificate Transparency policy.","type":"string","enum":["unknown","not-compliant","compliant"]},{"id":"BlockedReason","description":"The reason why request was blocked.","type":"string","enum":["other","csp","mixed-content","origin","inspector","subresource-filter","content-type","collapsed-by-client"]},{"id":"Response","description":"HTTP response data.","type":"object","properties":[{"name":"url","description":"Response URL. This URL can be different from CachedResource.url in case of redirect.","type":"string"},{"name":"status","description":"HTTP response status code.","type":"integer"},{"name":"statusText","description":"HTTP response status text.","type":"string"},{"name":"headers","description":"HTTP response headers.","$ref":"Headers"},{"name":"headersText","description":"HTTP response headers text.","optional":true,"type":"string"},{"name":"mimeType","description":"Resource mimeType as determined by the browser.","type":"string"},{"name":"requestHeaders","description":"Refined HTTP request headers that were actually transmitted over the network.","optional":true,"$ref":"Headers"},{"name":"requestHeadersText","description":"HTTP request headers text.","optional":true,"type":"string"},{"name":"connectionReused","description":"Specifies whether physical connection was actually reused for this request.","type":"boolean"},{"name":"connectionId","description":"Physical connection id that was actually used for this request.","type":"number"},{"name":"remoteIPAddress","description":"Remote IP address.","optional":true,"type":"string"},{"name":"remotePort","description":"Remote port.","optional":true,"type":"integer"},{"name":"fromDiskCache","description":"Specifies that the request was served from the disk cache.","optional":true,"type":"boolean"},{"name":"fromServiceWorker","description":"Specifies that the request was served from the ServiceWorker.","optional":true,"type":"boolean"},{"name":"encodedDataLength","description":"Total number of bytes received for this request so far.","type":"number"},{"name":"timing","description":"Timing information for the given request.","optional":true,"$ref":"ResourceTiming"},{"name":"protocol","description":"Protocol used to fetch this request.","optional":true,"type":"string"},{"name":"securityState","description":"Security state of the request resource.","$ref":"Security.SecurityState"},{"name":"securityDetails","description":"Security details for the request.","optional":true,"$ref":"SecurityDetails"}]},{"id":"WebSocketRequest","description":"WebSocket request data.","type":"object","properties":[{"name":"headers","description":"HTTP request headers.","$ref":"Headers"}]},{"id":"WebSocketResponse","description":"WebSocket response data.","type":"object","properties":[{"name":"status","description":"HTTP response status code.","type":"integer"},{"name":"statusText","description":"HTTP response status text.","type":"string"},{"name":"headers","description":"HTTP response headers.","$ref":"Headers"},{"name":"headersText","description":"HTTP response headers text.","optional":true,"type":"string"},{"name":"requestHeaders","description":"HTTP request headers.","optional":true,"$ref":"Headers"},{"name":"requestHeadersText","description":"HTTP request headers text.","optional":true,"type":"string"}]},{"id":"WebSocketFrame","description":"WebSocket frame data.","type":"object","properties":[{"name":"opcode","description":"WebSocket frame opcode.","type":"number"},{"name":"mask","description":"WebSocke frame mask.","type":"boolean"},{"name":"payloadData","description":"WebSocke frame payload data.","type":"string"}]},{"id":"CachedResource","description":"Information about the cached resource.","type":"object","properties":[{"name":"url","description":"Resource URL. This is the url of the original network request.","type":"string"},{"name":"type","description":"Type of this resource.","$ref":"Page.ResourceType"},{"name":"response","description":"Cached response data.","optional":true,"$ref":"Response"},{"name":"bodySize","description":"Cached response body size.","type":"number"}]},{"id":"Initiator","description":"Information about the request initiator.","type":"object","properties":[{"name":"type","description":"Type of this initiator.","type":"string","enum":["parser","script","preload","SignedExchange","other"]},{"name":"stack","description":"Initiator JavaScript stack trace, set for Script only.","optional":true,"$ref":"Runtime.StackTrace"},{"name":"url","description":"Initiator URL, set for Parser type or for Script type (when script is importing module) or for SignedExchange type.","optional":true,"type":"string"},{"name":"lineNumber","description":"Initiator line number, set for Parser type or for Script type (when script is importing\nmodule) (0-based).","optional":true,"type":"number"}]},{"id":"Cookie","description":"Cookie object","type":"object","properties":[{"name":"name","description":"Cookie name.","type":"string"},{"name":"value","description":"Cookie value.","type":"string"},{"name":"domain","description":"Cookie domain.","type":"string"},{"name":"path","description":"Cookie path.","type":"string"},{"name":"expires","description":"Cookie expiration date as the number of seconds since the UNIX epoch.","type":"number"},{"name":"size","description":"Cookie size.","type":"integer"},{"name":"httpOnly","description":"True if cookie is http-only.","type":"boolean"},{"name":"secure","description":"True if cookie is secure.","type":"boolean"},{"name":"session","description":"True in case of session cookie.","type":"boolean"},{"name":"sameSite","description":"Cookie SameSite type.","optional":true,"$ref":"CookieSameSite"}]},{"id":"CookieParam","description":"Cookie parameter object","type":"object","properties":[{"name":"name","description":"Cookie name.","type":"string"},{"name":"value","description":"Cookie value.","type":"string"},{"name":"url","description":"The request-URI to associate with the setting of the cookie. This value can affect the\ndefault domain and path values of the created cookie.","optional":true,"type":"string"},{"name":"domain","description":"Cookie domain.","optional":true,"type":"string"},{"name":"path","description":"Cookie path.","optional":true,"type":"string"},{"name":"secure","description":"True if cookie is secure.","optional":true,"type":"boolean"},{"name":"httpOnly","description":"True if cookie is http-only.","optional":true,"type":"boolean"},{"name":"sameSite","description":"Cookie SameSite type.","optional":true,"$ref":"CookieSameSite"},{"name":"expires","description":"Cookie expiration date, session cookie if not set","optional":true,"$ref":"TimeSinceEpoch"}]},{"id":"AuthChallenge","description":"Authorization challenge for HTTP status code 401 or 407.","experimental":true,"type":"object","properties":[{"name":"source","description":"Source of the authentication challenge.","optional":true,"type":"string","enum":["Server","Proxy"]},{"name":"origin","description":"Origin of the challenger.","type":"string"},{"name":"scheme","description":"The authentication scheme used, such as basic or digest","type":"string"},{"name":"realm","description":"The realm of the challenge. May be empty.","type":"string"}]},{"id":"AuthChallengeResponse","description":"Response to an AuthChallenge.","experimental":true,"type":"object","properties":[{"name":"response","description":"The decision on what to do in response to the authorization challenge.  Default means\ndeferring to the default behavior of the net stack, which will likely either the Cancel\nauthentication or display a popup dialog box.","type":"string","enum":["Default","CancelAuth","ProvideCredentials"]},{"name":"username","description":"The username to provide, possibly empty. Should only be set if response is\nProvideCredentials.","optional":true,"type":"string"},{"name":"password","description":"The password to provide, possibly empty. Should only be set if response is\nProvideCredentials.","optional":true,"type":"string"}]},{"id":"InterceptionStage","description":"Stages of the interception to begin intercepting. Request will intercept before the request is\nsent. Response will intercept after the response is received.","experimental":true,"type":"string","enum":["Request","HeadersReceived"]},{"id":"RequestPattern","description":"Request pattern for interception.","experimental":true,"type":"object","properties":[{"name":"urlPattern","description":"Wildcards ('*' -> zero or more, '?' -> exactly one) are allowed. Escape character is\nbackslash. Omitting is equivalent to \"*\".","optional":true,"type":"string"},{"name":"resourceType","description":"If set, only requests for matching resource types will be intercepted.","optional":true,"$ref":"Page.ResourceType"},{"name":"interceptionStage","description":"Stage at wich to begin intercepting requests. Default is Request.","optional":true,"$ref":"InterceptionStage"}]},{"id":"SignedExchangeSignature","description":"Information about a signed exchange signature.\nhttps://wicg.github.io/webpackage/draft-yasskin-httpbis-origin-signed-exchanges-impl.html#rfc.section.3.1","experimental":true,"type":"object","properties":[{"name":"label","description":"Signed exchange signature label.","type":"string"},{"name":"signature","description":"The hex string of signed exchange signature.","type":"string"},{"name":"integrity","description":"Signed exchange signature integrity.","type":"string"},{"name":"certUrl","description":"Signed exchange signature cert Url.","optional":true,"type":"string"},{"name":"certSha256","description":"The hex string of signed exchange signature cert sha256.","optional":true,"type":"string"},{"name":"validityUrl","description":"Signed exchange signature validity Url.","type":"string"},{"name":"date","description":"Signed exchange signature date.","type":"integer"},{"name":"expires","description":"Signed exchange signature expires.","type":"integer"},{"name":"certificates","description":"The encoded certificates.","optional":true,"type":"array","items":{"type":"string"}}]},{"id":"SignedExchangeHeader","description":"Information about a signed exchange header.\nhttps://wicg.github.io/webpackage/draft-yasskin-httpbis-origin-signed-exchanges-impl.html#cbor-representation","experimental":true,"type":"object","properties":[{"name":"requestUrl","description":"Signed exchange request URL.","type":"string"},{"name":"requestMethod","description":"Signed exchange request method.","type":"string"},{"name":"responseCode","description":"Signed exchange response code.","type":"integer"},{"name":"responseHeaders","description":"Signed exchange response headers.","$ref":"Headers"},{"name":"signatures","description":"Signed exchange response signature.","type":"array","items":{"$ref":"SignedExchangeSignature"}}]},{"id":"SignedExchangeErrorField","description":"Field type for a signed exchange related error.","experimental":true,"type":"string","enum":["signatureSig","signatureIntegrity","signatureCertUrl","signatureCertSha256","signatureValidityUrl","signatureTimestamps"]},{"id":"SignedExchangeError","description":"Information about a signed exchange response.","experimental":true,"type":"object","properties":[{"name":"message","description":"Error message.","type":"string"},{"name":"signatureIndex","description":"The index of the signature which caused the error.","optional":true,"type":"integer"},{"name":"errorField","description":"The field which caused the error.","optional":true,"$ref":"SignedExchangeErrorField"}]},{"id":"SignedExchangeInfo","description":"Information about a signed exchange response.","experimental":true,"type":"object","properties":[{"name":"outerResponse","description":"The outer response of signed HTTP exchange which was received from network.","$ref":"Response"},{"name":"header","description":"Information about the signed exchange header.","optional":true,"$ref":"SignedExchangeHeader"},{"name":"securityDetails","description":"Security details for the signed exchange header.","optional":true,"$ref":"SecurityDetails"},{"name":"errors","description":"Errors occurred while handling the signed exchagne.","optional":true,"type":"array","items":{"$ref":"SignedExchangeError"}}]}],"commands":[{"name":"canClearBrowserCache","description":"Tells whether clearing browser cache is supported.","deprecated":true,"returns":[{"name":"result","description":"True if browser cache can be cleared.","type":"boolean"}]},{"name":"canClearBrowserCookies","description":"Tells whether clearing browser cookies is supported.","deprecated":true,"returns":[{"name":"result","description":"True if browser cookies can be cleared.","type":"boolean"}]},{"name":"canEmulateNetworkConditions","description":"Tells whether emulation of network conditions is supported.","deprecated":true,"returns":[{"name":"result","description":"True if emulation of network conditions is supported.","type":"boolean"}]},{"name":"clearBrowserCache","description":"Clears browser cache."},{"name":"clearBrowserCookies","description":"Clears browser cookies."},{"name":"continueInterceptedRequest","description":"Response to Network.requestIntercepted which either modifies the request to continue with any\nmodifications, or blocks it, or completes it with the provided response bytes. If a network\nfetch occurs as a result which encounters a redirect an additional Network.requestIntercepted\nevent will be sent with the same InterceptionId.","experimental":true,"parameters":[{"name":"interceptionId","$ref":"InterceptionId"},{"name":"errorReason","description":"If set this causes the request to fail with the given reason. Passing `Aborted` for requests\nmarked with `isNavigationRequest` also cancels the navigation. Must not be set in response\nto an authChallenge.","optional":true,"$ref":"ErrorReason"},{"name":"rawResponse","description":"If set the requests completes using with the provided base64 encoded raw response, including\nHTTP status line and headers etc... Must not be set in response to an authChallenge.","optional":true,"type":"string"},{"name":"url","description":"If set the request url will be modified in a way that's not observable by page. Must not be\nset in response to an authChallenge.","optional":true,"type":"string"},{"name":"method","description":"If set this allows the request method to be overridden. Must not be set in response to an\nauthChallenge.","optional":true,"type":"string"},{"name":"postData","description":"If set this allows postData to be set. Must not be set in response to an authChallenge.","optional":true,"type":"string"},{"name":"headers","description":"If set this allows the request headers to be changed. Must not be set in response to an\nauthChallenge.","optional":true,"$ref":"Headers"},{"name":"authChallengeResponse","description":"Response to a requestIntercepted with an authChallenge. Must not be set otherwise.","optional":true,"$ref":"AuthChallengeResponse"}]},{"name":"deleteCookies","description":"Deletes browser cookies with matching name and url or domain/path pair.","parameters":[{"name":"name","description":"Name of the cookies to remove.","type":"string"},{"name":"url","description":"If specified, deletes all the cookies with the given name where domain and path match\nprovided URL.","optional":true,"type":"string"},{"name":"domain","description":"If specified, deletes only cookies with the exact domain.","optional":true,"type":"string"},{"name":"path","description":"If specified, deletes only cookies with the exact path.","optional":true,"type":"string"}]},{"name":"disable","description":"Disables network tracking, prevents network events from being sent to the client."},{"name":"emulateNetworkConditions","description":"Activates emulation of network conditions.","parameters":[{"name":"offline","description":"True to emulate internet disconnection.","type":"boolean"},{"name":"latency","description":"Minimum latency from request sent to response headers received (ms).","type":"number"},{"name":"downloadThroughput","description":"Maximal aggregated download throughput (bytes/sec). -1 disables download throttling.","type":"number"},{"name":"uploadThroughput","description":"Maximal aggregated upload throughput (bytes/sec).  -1 disables upload throttling.","type":"number"},{"name":"connectionType","description":"Connection type if known.","optional":true,"$ref":"ConnectionType"}]},{"name":"enable","description":"Enables network tracking, network events will now be delivered to the client.","parameters":[{"name":"maxTotalBufferSize","description":"Buffer size in bytes to use when preserving network payloads (XHRs, etc).","experimental":true,"optional":true,"type":"integer"},{"name":"maxResourceBufferSize","description":"Per-resource buffer size in bytes to use when preserving network payloads (XHRs, etc).","experimental":true,"optional":true,"type":"integer"},{"name":"maxPostDataSize","description":"Longest post body size (in bytes) that would be included in requestWillBeSent notification","optional":true,"type":"integer"}]},{"name":"getAllCookies","description":"Returns all browser cookies. Depending on the backend support, will return detailed cookie\ninformation in the `cookies` field.","returns":[{"name":"cookies","description":"Array of cookie objects.","type":"array","items":{"$ref":"Cookie"}}]},{"name":"getCertificate","description":"Returns the DER-encoded certificate.","experimental":true,"parameters":[{"name":"origin","description":"Origin to get certificate for.","type":"string"}],"returns":[{"name":"tableNames","type":"array","items":{"type":"string"}}]},{"name":"getCookies","description":"Returns all browser cookies for the current URL. Depending on the backend support, will return\ndetailed cookie information in the `cookies` field.","parameters":[{"name":"urls","description":"The list of URLs for which applicable cookies will be fetched","optional":true,"type":"array","items":{"type":"string"}}],"returns":[{"name":"cookies","description":"Array of cookie objects.","type":"array","items":{"$ref":"Cookie"}}]},{"name":"getResponseBody","description":"Returns content served for the given request.","parameters":[{"name":"requestId","description":"Identifier of the network request to get content for.","$ref":"RequestId"}],"returns":[{"name":"body","description":"Response body.","type":"string"},{"name":"base64Encoded","description":"True, if content was sent as base64.","type":"boolean"}]},{"name":"getRequestPostData","description":"Returns post data sent with the request. Returns an error when no data was sent with the request.","parameters":[{"name":"requestId","description":"Identifier of the network request to get content for.","$ref":"RequestId"}],"returns":[{"name":"postData","description":"Base64-encoded request body.","type":"string"}]},{"name":"getResponseBodyForInterception","description":"Returns content served for the given currently intercepted request.","experimental":true,"parameters":[{"name":"interceptionId","description":"Identifier for the intercepted request to get body for.","$ref":"InterceptionId"}],"returns":[{"name":"body","description":"Response body.","type":"string"},{"name":"base64Encoded","description":"True, if content was sent as base64.","type":"boolean"}]},{"name":"takeResponseBodyForInterceptionAsStream","description":"Returns a handle to the stream representing the response body. Note that after this command,\nthe intercepted request can't be continued as is -- you either need to cancel it or to provide\nthe response body. The stream only supports sequential read, IO.read will fail if the position\nis specified.","experimental":true,"parameters":[{"name":"interceptionId","$ref":"InterceptionId"}],"returns":[{"name":"stream","$ref":"IO.StreamHandle"}]},{"name":"replayXHR","description":"This method sends a new XMLHttpRequest which is identical to the original one. The following\nparameters should be identical: method, url, async, request body, extra headers, withCredentials\nattribute, user, password.","experimental":true,"parameters":[{"name":"requestId","description":"Identifier of XHR to replay.","$ref":"RequestId"}]},{"name":"searchInResponseBody","description":"Searches for given string in response content.","experimental":true,"parameters":[{"name":"requestId","description":"Identifier of the network response to search.","$ref":"RequestId"},{"name":"query","description":"String to search for.","type":"string"},{"name":"caseSensitive","description":"If true, search is case sensitive.","optional":true,"type":"boolean"},{"name":"isRegex","description":"If true, treats string parameter as regex.","optional":true,"type":"boolean"}],"returns":[{"name":"result","description":"List of search matches.","type":"array","items":{"$ref":"Debugger.SearchMatch"}}]},{"name":"setBlockedURLs","description":"Blocks URLs from loading.","experimental":true,"parameters":[{"name":"urls","description":"URL patterns to block. Wildcards ('*') are allowed.","type":"array","items":{"type":"string"}}]},{"name":"setBypassServiceWorker","description":"Toggles ignoring of service worker for each request.","experimental":true,"parameters":[{"name":"bypass","description":"Bypass service worker and load from network.","type":"boolean"}]},{"name":"setCacheDisabled","description":"Toggles ignoring cache for each request. If `true`, cache will not be used.","parameters":[{"name":"cacheDisabled","description":"Cache disabled state.","type":"boolean"}]},{"name":"setCookie","description":"Sets a cookie with the given cookie data; may overwrite equivalent cookies if they exist.","parameters":[{"name":"name","description":"Cookie name.","type":"string"},{"name":"value","description":"Cookie value.","type":"string"},{"name":"url","description":"The request-URI to associate with the setting of the cookie. This value can affect the\ndefault domain and path values of the created cookie.","optional":true,"type":"string"},{"name":"domain","description":"Cookie domain.","optional":true,"type":"string"},{"name":"path","description":"Cookie path.","optional":true,"type":"string"},{"name":"secure","description":"True if cookie is secure.","optional":true,"type":"boolean"},{"name":"httpOnly","description":"True if cookie is http-only.","optional":true,"type":"boolean"},{"name":"sameSite","description":"Cookie SameSite type.","optional":true,"$ref":"CookieSameSite"},{"name":"expires","description":"Cookie expiration date, session cookie if not set","optional":true,"$ref":"TimeSinceEpoch"}],"returns":[{"name":"success","description":"True if successfully set cookie.","type":"boolean"}]},{"name":"setCookies","description":"Sets given cookies.","parameters":[{"name":"cookies","description":"Cookies to be set.","type":"array","items":{"$ref":"CookieParam"}}]},{"name":"setDataSizeLimitsForTest","description":"For testing.","experimental":true,"parameters":[{"name":"maxTotalSize","description":"Maximum total buffer size.","type":"integer"},{"name":"maxResourceSize","description":"Maximum per-resource size.","type":"integer"}]},{"name":"setExtraHTTPHeaders","description":"Specifies whether to always send extra HTTP headers with the requests from this page.","parameters":[{"name":"headers","description":"Map with extra HTTP headers.","$ref":"Headers"}]},{"name":"setRequestInterception","description":"Sets the requests to intercept that match a the provided patterns and optionally resource types.","experimental":true,"parameters":[{"name":"patterns","description":"Requests matching any of these patterns will be forwarded and wait for the corresponding\ncontinueInterceptedRequest call.","type":"array","items":{"$ref":"RequestPattern"}}]},{"name":"setUserAgentOverride","description":"Allows overriding user agent with the given string.","redirect":"Emulation","parameters":[{"name":"userAgent","description":"User agent to use.","type":"string"},{"name":"acceptLanguage","description":"Browser langugage to emulate.","optional":true,"type":"string"},{"name":"platform","description":"The platform navigator.platform should return.","optional":true,"type":"string"}]}],"events":[{"name":"dataReceived","description":"Fired when data chunk was received over the network.","parameters":[{"name":"requestId","description":"Request identifier.","$ref":"RequestId"},{"name":"timestamp","description":"Timestamp.","$ref":"MonotonicTime"},{"name":"dataLength","description":"Data chunk length.","type":"integer"},{"name":"encodedDataLength","description":"Actual bytes received (might be less than dataLength for compressed encodings).","type":"integer"}]},{"name":"eventSourceMessageReceived","description":"Fired when EventSource message is received.","parameters":[{"name":"requestId","description":"Request identifier.","$ref":"RequestId"},{"name":"timestamp","description":"Timestamp.","$ref":"MonotonicTime"},{"name":"eventName","description":"Message type.","type":"string"},{"name":"eventId","description":"Message identifier.","type":"string"},{"name":"data","description":"Message content.","type":"string"}]},{"name":"loadingFailed","description":"Fired when HTTP request has failed to load.","parameters":[{"name":"requestId","description":"Request identifier.","$ref":"RequestId"},{"name":"timestamp","description":"Timestamp.","$ref":"MonotonicTime"},{"name":"type","description":"Resource type.","$ref":"Page.ResourceType"},{"name":"errorText","description":"User friendly error message.","type":"string"},{"name":"canceled","description":"True if loading was canceled.","optional":true,"type":"boolean"},{"name":"blockedReason","description":"The reason why loading was blocked, if any.","optional":true,"$ref":"BlockedReason"}]},{"name":"loadingFinished","description":"Fired when HTTP request has finished loading.","parameters":[{"name":"requestId","description":"Request identifier.","$ref":"RequestId"},{"name":"timestamp","description":"Timestamp.","$ref":"MonotonicTime"},{"name":"encodedDataLength","description":"Total number of bytes received for this request.","type":"number"},{"name":"shouldReportCorbBlocking","description":"Set when 1) response was blocked by Cross-Origin Read Blocking and also\n2) this needs to be reported to the DevTools console.","optional":true,"type":"boolean"}]},{"name":"requestIntercepted","description":"Details of an intercepted HTTP request, which must be either allowed, blocked, modified or\nmocked.","experimental":true,"parameters":[{"name":"interceptionId","description":"Each request the page makes will have a unique id, however if any redirects are encountered\nwhile processing that fetch, they will be reported with the same id as the original fetch.\nLikewise if HTTP authentication is needed then the same fetch id will be used.","$ref":"InterceptionId"},{"name":"request","$ref":"Request"},{"name":"frameId","description":"The id of the frame that initiated the request.","$ref":"Page.FrameId"},{"name":"resourceType","description":"How the requested resource will be used.","$ref":"Page.ResourceType"},{"name":"isNavigationRequest","description":"Whether this is a navigation request, which can abort the navigation completely.","type":"boolean"},{"name":"isDownload","description":"Set if the request is a navigation that will result in a download.\nOnly present after response is received from the server (i.e. HeadersReceived stage).","optional":true,"type":"boolean"},{"name":"redirectUrl","description":"Redirect location, only sent if a redirect was intercepted.","optional":true,"type":"string"},{"name":"authChallenge","description":"Details of the Authorization Challenge encountered. If this is set then\ncontinueInterceptedRequest must contain an authChallengeResponse.","optional":true,"$ref":"AuthChallenge"},{"name":"responseErrorReason","description":"Response error if intercepted at response stage or if redirect occurred while intercepting\nrequest.","optional":true,"$ref":"ErrorReason"},{"name":"responseStatusCode","description":"Response code if intercepted at response stage or if redirect occurred while intercepting\nrequest or auth retry occurred.","optional":true,"type":"integer"},{"name":"responseHeaders","description":"Response headers if intercepted at the response stage or if redirect occurred while\nintercepting request or auth retry occurred.","optional":true,"$ref":"Headers"}]},{"name":"requestServedFromCache","description":"Fired if request ended up loading from cache.","parameters":[{"name":"requestId","description":"Request identifier.","$ref":"RequestId"}]},{"name":"requestWillBeSent","description":"Fired when page is about to send HTTP request.","parameters":[{"name":"requestId","description":"Request identifier.","$ref":"RequestId"},{"name":"loaderId","description":"Loader identifier. Empty string if the request is fetched from worker.","$ref":"LoaderId"},{"name":"documentURL","description":"URL of the document this request is loaded for.","type":"string"},{"name":"request","description":"Request data.","$ref":"Request"},{"name":"timestamp","description":"Timestamp.","$ref":"MonotonicTime"},{"name":"wallTime","description":"Timestamp.","$ref":"TimeSinceEpoch"},{"name":"initiator","description":"Request initiator.","$ref":"Initiator"},{"name":"redirectResponse","description":"Redirect response data.","optional":true,"$ref":"Response"},{"name":"type","description":"Type of this resource.","optional":true,"$ref":"Page.ResourceType"},{"name":"frameId","description":"Frame identifier.","optional":true,"$ref":"Page.FrameId"},{"name":"hasUserGesture","description":"Whether the request is initiated by a user gesture. Defaults to false.","optional":true,"type":"boolean"}]},{"name":"resourceChangedPriority","description":"Fired when resource loading priority is changed","experimental":true,"parameters":[{"name":"requestId","description":"Request identifier.","$ref":"RequestId"},{"name":"newPriority","description":"New priority","$ref":"ResourcePriority"},{"name":"timestamp","description":"Timestamp.","$ref":"MonotonicTime"}]},{"name":"signedExchangeReceived","description":"Fired when a signed exchange was received over the network","experimental":true,"parameters":[{"name":"requestId","description":"Request identifier.","$ref":"RequestId"},{"name":"info","description":"Information about the signed exchange response.","$ref":"SignedExchangeInfo"}]},{"name":"responseReceived","description":"Fired when HTTP response is available.","parameters":[{"name":"requestId","description":"Request identifier.","$ref":"RequestId"},{"name":"loaderId","description":"Loader identifier. Empty string if the request is fetched from worker.","$ref":"LoaderId"},{"name":"timestamp","description":"Timestamp.","$ref":"MonotonicTime"},{"name":"type","description":"Resource type.","$ref":"Page.ResourceType"},{"name":"response","description":"Response data.","$ref":"Response"},{"name":"frameId","description":"Frame identifier.","optional":true,"$ref":"Page.FrameId"}]},{"name":"webSocketClosed","description":"Fired when WebSocket is closed.","parameters":[{"name":"requestId","description":"Request identifier.","$ref":"RequestId"},{"name":"timestamp","description":"Timestamp.","$ref":"MonotonicTime"}]},{"name":"webSocketCreated","description":"Fired upon WebSocket creation.","parameters":[{"name":"requestId","description":"Request identifier.","$ref":"RequestId"},{"name":"url","description":"WebSocket request URL.","type":"string"},{"name":"initiator","description":"Request initiator.","optional":true,"$ref":"Initiator"}]},{"name":"webSocketFrameError","description":"Fired when WebSocket frame error occurs.","parameters":[{"name":"requestId","description":"Request identifier.","$ref":"RequestId"},{"name":"timestamp","description":"Timestamp.","$ref":"MonotonicTime"},{"name":"errorMessage","description":"WebSocket frame error message.","type":"string"}]},{"name":"webSocketFrameReceived","description":"Fired when WebSocket frame is received.","parameters":[{"name":"requestId","description":"Request identifier.","$ref":"RequestId"},{"name":"timestamp","description":"Timestamp.","$ref":"MonotonicTime"},{"name":"response","description":"WebSocket response data.","$ref":"WebSocketFrame"}]},{"name":"webSocketFrameSent","description":"Fired when WebSocket frame is sent.","parameters":[{"name":"requestId","description":"Request identifier.","$ref":"RequestId"},{"name":"timestamp","description":"Timestamp.","$ref":"MonotonicTime"},{"name":"response","description":"WebSocket response data.","$ref":"WebSocketFrame"}]},{"name":"webSocketHandshakeResponseReceived","description":"Fired when WebSocket handshake response becomes available.","parameters":[{"name":"requestId","description":"Request identifier.","$ref":"RequestId"},{"name":"timestamp","description":"Timestamp.","$ref":"MonotonicTime"},{"name":"response","description":"WebSocket response data.","$ref":"WebSocketResponse"}]},{"name":"webSocketWillSendHandshakeRequest","description":"Fired when WebSocket is about to initiate handshake.","parameters":[{"name":"requestId","description":"Request identifier.","$ref":"RequestId"},{"name":"timestamp","description":"Timestamp.","$ref":"MonotonicTime"},{"name":"wallTime","description":"UTC Timestamp.","$ref":"TimeSinceEpoch"},{"name":"request","description":"WebSocket request data.","$ref":"WebSocketRequest"}]}]},{"domain":"Overlay","description":"This domain provides various functionality related to drawing atop the inspected page.","experimental":true,"dependencies":["DOM","Page","Runtime"],"types":[{"id":"HighlightConfig","description":"Configuration data for the highlighting of page elements.","type":"object","properties":[{"name":"showInfo","description":"Whether the node info tooltip should be shown (default: false).","optional":true,"type":"boolean"},{"name":"showRulers","description":"Whether the rulers should be shown (default: false).","optional":true,"type":"boolean"},{"name":"showExtensionLines","description":"Whether the extension lines from node to the rulers should be shown (default: false).","optional":true,"type":"boolean"},{"name":"displayAsMaterial","optional":true,"type":"boolean"},{"name":"contentColor","description":"The content box highlight fill color (default: transparent).","optional":true,"$ref":"DOM.RGBA"},{"name":"paddingColor","description":"The padding highlight fill color (default: transparent).","optional":true,"$ref":"DOM.RGBA"},{"name":"borderColor","description":"The border highlight fill color (default: transparent).","optional":true,"$ref":"DOM.RGBA"},{"name":"marginColor","description":"The margin highlight fill color (default: transparent).","optional":true,"$ref":"DOM.RGBA"},{"name":"eventTargetColor","description":"The event target element highlight fill color (default: transparent).","optional":true,"$ref":"DOM.RGBA"},{"name":"shapeColor","description":"The shape outside fill color (default: transparent).","optional":true,"$ref":"DOM.RGBA"},{"name":"shapeMarginColor","description":"The shape margin fill color (default: transparent).","optional":true,"$ref":"DOM.RGBA"},{"name":"selectorList","description":"Selectors to highlight relevant nodes.","optional":true,"type":"string"},{"name":"cssGridColor","description":"The grid layout color (default: transparent).","optional":true,"$ref":"DOM.RGBA"}]},{"id":"InspectMode","type":"string","enum":["searchForNode","searchForUAShadowDOM","none"]}],"commands":[{"name":"disable","description":"Disables domain notifications."},{"name":"enable","description":"Enables domain notifications."},{"name":"getHighlightObjectForTest","description":"For testing.","parameters":[{"name":"nodeId","description":"Id of the node to get highlight object for.","$ref":"DOM.NodeId"}],"returns":[{"name":"highlight","description":"Highlight data for the node.","type":"object"}]},{"name":"hideHighlight","description":"Hides any highlight."},{"name":"highlightFrame","description":"Highlights owner element of the frame with given id.","parameters":[{"name":"frameId","description":"Identifier of the frame to highlight.","$ref":"Page.FrameId"},{"name":"contentColor","description":"The content box highlight fill color (default: transparent).","optional":true,"$ref":"DOM.RGBA"},{"name":"contentOutlineColor","description":"The content box highlight outline color (default: transparent).","optional":true,"$ref":"DOM.RGBA"}]},{"name":"highlightNode","description":"Highlights DOM node with given id or with the given JavaScript object wrapper. Either nodeId or\nobjectId must be specified.","parameters":[{"name":"highlightConfig","description":"A descriptor for the highlight appearance.","$ref":"HighlightConfig"},{"name":"nodeId","description":"Identifier of the node to highlight.","optional":true,"$ref":"DOM.NodeId"},{"name":"backendNodeId","description":"Identifier of the backend node to highlight.","optional":true,"$ref":"DOM.BackendNodeId"},{"name":"objectId","description":"JavaScript object id of the node to be highlighted.","optional":true,"$ref":"Runtime.RemoteObjectId"}]},{"name":"highlightQuad","description":"Highlights given quad. Coordinates are absolute with respect to the main frame viewport.","parameters":[{"name":"quad","description":"Quad to highlight","$ref":"DOM.Quad"},{"name":"color","description":"The highlight fill color (default: transparent).","optional":true,"$ref":"DOM.RGBA"},{"name":"outlineColor","description":"The highlight outline color (default: transparent).","optional":true,"$ref":"DOM.RGBA"}]},{"name":"highlightRect","description":"Highlights given rectangle. Coordinates are absolute with respect to the main frame viewport.","parameters":[{"name":"x","description":"X coordinate","type":"integer"},{"name":"y","description":"Y coordinate","type":"integer"},{"name":"width","description":"Rectangle width","type":"integer"},{"name":"height","description":"Rectangle height","type":"integer"},{"name":"color","description":"The highlight fill color (default: transparent).","optional":true,"$ref":"DOM.RGBA"},{"name":"outlineColor","description":"The highlight outline color (default: transparent).","optional":true,"$ref":"DOM.RGBA"}]},{"name":"setInspectMode","description":"Enters the 'inspect' mode. In this mode, elements that user is hovering over are highlighted.\nBackend then generates 'inspectNodeRequested' event upon element selection.","parameters":[{"name":"mode","description":"Set an inspection mode.","$ref":"InspectMode"},{"name":"highlightConfig","description":"A descriptor for the highlight appearance of hovered-over nodes. May be omitted if `enabled\n== false`.","optional":true,"$ref":"HighlightConfig"}]},{"name":"setPausedInDebuggerMessage","parameters":[{"name":"message","description":"The message to display, also triggers resume and step over controls.","optional":true,"type":"string"}]},{"name":"setShowDebugBorders","description":"Requests that backend shows debug borders on layers","parameters":[{"name":"show","description":"True for showing debug borders","type":"boolean"}]},{"name":"setShowFPSCounter","description":"Requests that backend shows the FPS counter","parameters":[{"name":"show","description":"True for showing the FPS counter","type":"boolean"}]},{"name":"setShowPaintRects","description":"Requests that backend shows paint rectangles","parameters":[{"name":"result","description":"True for showing paint rectangles","type":"boolean"}]},{"name":"setShowScrollBottleneckRects","description":"Requests that backend shows scroll bottleneck rects","parameters":[{"name":"show","description":"True for showing scroll bottleneck rects","type":"boolean"}]},{"name":"setShowViewportSizeOnResize","description":"Paints viewport size upon main frame resize.","parameters":[{"name":"show","description":"Whether to paint size or not.","type":"boolean"}]},{"name":"setSuspended","parameters":[{"name":"suspended","description":"Whether overlay should be suspended and not consume any resources until resumed.","type":"boolean"}]}],"events":[{"name":"inspectNodeRequested","description":"Fired when the node should be inspected. This happens after call to `setInspectMode` or when\nuser manually inspects an element.","parameters":[{"name":"backendNodeId","description":"Id of the node to inspect.","$ref":"DOM.BackendNodeId"}]},{"name":"nodeHighlightRequested","description":"Fired when the node should be highlighted. This happens after call to `setInspectMode`.","parameters":[{"name":"nodeId","$ref":"DOM.NodeId"}]},{"name":"screenshotRequested","description":"Fired when user asks to capture screenshot of some area on the page.","parameters":[{"name":"viewport","description":"Viewport to capture, in CSS.","$ref":"Page.Viewport"}]}]},{"domain":"Page","description":"Actions and events related to the inspected page belong to the page domain.","dependencies":["Debugger","DOM","Network"],"types":[{"id":"ResourceType","description":"Resource type as it was perceived by the rendering engine.","type":"string","enum":["Document","Stylesheet","Image","Media","Font","Script","TextTrack","XHR","Fetch","EventSource","WebSocket","Manifest","SignedExchange","Ping","CSPViolationReport","Other"]},{"id":"FrameId","description":"Unique frame identifier.","type":"string"},{"id":"Frame","description":"Information about the Frame on the page.","type":"object","properties":[{"name":"id","description":"Frame unique identifier.","type":"string"},{"name":"parentId","description":"Parent frame identifier.","optional":true,"type":"string"},{"name":"loaderId","description":"Identifier of the loader associated with this frame.","$ref":"Network.LoaderId"},{"name":"name","description":"Frame's name as specified in the tag.","optional":true,"type":"string"},{"name":"url","description":"Frame document's URL.","type":"string"},{"name":"securityOrigin","description":"Frame document's security origin.","type":"string"},{"name":"mimeType","description":"Frame document's mimeType as determined by the browser.","type":"string"},{"name":"unreachableUrl","description":"If the frame failed to load, this contains the URL that could not be loaded.","experimental":true,"optional":true,"type":"string"}]},{"id":"FrameResource","description":"Information about the Resource on the page.","experimental":true,"type":"object","properties":[{"name":"url","description":"Resource URL.","type":"string"},{"name":"type","description":"Type of this resource.","$ref":"ResourceType"},{"name":"mimeType","description":"Resource mimeType as determined by the browser.","type":"string"},{"name":"lastModified","description":"last-modified timestamp as reported by server.","optional":true,"$ref":"Network.TimeSinceEpoch"},{"name":"contentSize","description":"Resource content size.","optional":true,"type":"number"},{"name":"failed","description":"True if the resource failed to load.","optional":true,"type":"boolean"},{"name":"canceled","description":"True if the resource was canceled during loading.","optional":true,"type":"boolean"}]},{"id":"FrameResourceTree","description":"Information about the Frame hierarchy along with their cached resources.","experimental":true,"type":"object","properties":[{"name":"frame","description":"Frame information for this tree item.","$ref":"Frame"},{"name":"childFrames","description":"Child frames.","optional":true,"type":"array","items":{"$ref":"FrameResourceTree"}},{"name":"resources","description":"Information about frame resources.","type":"array","items":{"$ref":"FrameResource"}}]},{"id":"FrameTree","description":"Information about the Frame hierarchy.","type":"object","properties":[{"name":"frame","description":"Frame information for this tree item.","$ref":"Frame"},{"name":"childFrames","description":"Child frames.","optional":true,"type":"array","items":{"$ref":"FrameTree"}}]},{"id":"ScriptIdentifier","description":"Unique script identifier.","type":"string"},{"id":"TransitionType","description":"Transition type.","type":"string","enum":["link","typed","auto_bookmark","auto_subframe","manual_subframe","generated","auto_toplevel","form_submit","reload","keyword","keyword_generated","other"]},{"id":"NavigationEntry","description":"Navigation history entry.","type":"object","properties":[{"name":"id","description":"Unique id of the navigation history entry.","type":"integer"},{"name":"url","description":"URL of the navigation history entry.","type":"string"},{"name":"userTypedURL","description":"URL that the user typed in the url bar.","type":"string"},{"name":"title","description":"Title of the navigation history entry.","type":"string"},{"name":"transitionType","description":"Transition type.","$ref":"TransitionType"}]},{"id":"ScreencastFrameMetadata","description":"Screencast frame metadata.","experimental":true,"type":"object","properties":[{"name":"offsetTop","description":"Top offset in DIP.","type":"number"},{"name":"pageScaleFactor","description":"Page scale factor.","type":"number"},{"name":"deviceWidth","description":"Device screen width in DIP.","type":"number"},{"name":"deviceHeight","description":"Device screen height in DIP.","type":"number"},{"name":"scrollOffsetX","description":"Position of horizontal scroll in CSS pixels.","type":"number"},{"name":"scrollOffsetY","description":"Position of vertical scroll in CSS pixels.","type":"number"},{"name":"timestamp","description":"Frame swap timestamp.","optional":true,"$ref":"Network.TimeSinceEpoch"}]},{"id":"DialogType","description":"Javascript dialog type.","type":"string","enum":["alert","confirm","prompt","beforeunload"]},{"id":"AppManifestError","description":"Error while paring app manifest.","type":"object","properties":[{"name":"message","description":"Error message.","type":"string"},{"name":"critical","description":"If criticial, this is a non-recoverable parse error.","type":"integer"},{"name":"line","description":"Error line.","type":"integer"},{"name":"column","description":"Error column.","type":"integer"}]},{"id":"LayoutViewport","description":"Layout viewport position and dimensions.","type":"object","properties":[{"name":"pageX","description":"Horizontal offset relative to the document (CSS pixels).","type":"integer"},{"name":"pageY","description":"Vertical offset relative to the document (CSS pixels).","type":"integer"},{"name":"clientWidth","description":"Width (CSS pixels), excludes scrollbar if present.","type":"integer"},{"name":"clientHeight","description":"Height (CSS pixels), excludes scrollbar if present.","type":"integer"}]},{"id":"VisualViewport","description":"Visual viewport position, dimensions, and scale.","type":"object","properties":[{"name":"offsetX","description":"Horizontal offset relative to the layout viewport (CSS pixels).","type":"number"},{"name":"offsetY","description":"Vertical offset relative to the layout viewport (CSS pixels).","type":"number"},{"name":"pageX","description":"Horizontal offset relative to the document (CSS pixels).","type":"number"},{"name":"pageY","description":"Vertical offset relative to the document (CSS pixels).","type":"number"},{"name":"clientWidth","description":"Width (CSS pixels), excludes scrollbar if present.","type":"number"},{"name":"clientHeight","description":"Height (CSS pixels), excludes scrollbar if present.","type":"number"},{"name":"scale","description":"Scale relative to the ideal viewport (size at width=device-width).","type":"number"}]},{"id":"Viewport","description":"Viewport for capturing screenshot.","type":"object","properties":[{"name":"x","description":"X offset in CSS pixels.","type":"number"},{"name":"y","description":"Y offset in CSS pixels","type":"number"},{"name":"width","description":"Rectangle width in CSS pixels","type":"number"},{"name":"height","description":"Rectangle height in CSS pixels","type":"number"},{"name":"scale","description":"Page scale factor.","type":"number"}]},{"id":"FontFamilies","description":"Generic font families collection.","experimental":true,"type":"object","properties":[{"name":"standard","description":"The standard font-family.","optional":true,"type":"string"},{"name":"fixed","description":"The fixed font-family.","optional":true,"type":"string"},{"name":"serif","description":"The serif font-family.","optional":true,"type":"string"},{"name":"sansSerif","description":"The sansSerif font-family.","optional":true,"type":"string"},{"name":"cursive","description":"The cursive font-family.","optional":true,"type":"string"},{"name":"fantasy","description":"The fantasy font-family.","optional":true,"type":"string"},{"name":"pictograph","description":"The pictograph font-family.","optional":true,"type":"string"}]},{"id":"FontSizes","description":"Default font sizes.","experimental":true,"type":"object","properties":[{"name":"standard","description":"Default standard font size.","optional":true,"type":"integer"},{"name":"fixed","description":"Default fixed font size.","optional":true,"type":"integer"}]}],"commands":[{"name":"addScriptToEvaluateOnLoad","description":"Deprecated, please use addScriptToEvaluateOnNewDocument instead.","experimental":true,"deprecated":true,"parameters":[{"name":"scriptSource","type":"string"}],"returns":[{"name":"identifier","description":"Identifier of the added script.","$ref":"ScriptIdentifier"}]},{"name":"addScriptToEvaluateOnNewDocument","description":"Evaluates given script in every frame upon creation (before loading frame's scripts).","parameters":[{"name":"source","type":"string"}],"returns":[{"name":"identifier","description":"Identifier of the added script.","$ref":"ScriptIdentifier"}]},{"name":"bringToFront","description":"Brings page to front (activates tab)."},{"name":"captureScreenshot","description":"Capture page screenshot.","parameters":[{"name":"format","description":"Image compression format (defaults to png).","optional":true,"type":"string","enum":["jpeg","png"]},{"name":"quality","description":"Compression quality from range [0..100] (jpeg only).","optional":true,"type":"integer"},{"name":"clip","description":"Capture the screenshot of a given region only.","optional":true,"$ref":"Viewport"},{"name":"fromSurface","description":"Capture the screenshot from the surface, rather than the view. Defaults to true.","experimental":true,"optional":true,"type":"boolean"}],"returns":[{"name":"data","description":"Base64-encoded image data.","type":"string"}]},{"name":"clearDeviceMetricsOverride","description":"Clears the overriden device metrics.","experimental":true,"deprecated":true,"redirect":"Emulation"},{"name":"clearDeviceOrientationOverride","description":"Clears the overridden Device Orientation.","experimental":true,"deprecated":true,"redirect":"DeviceOrientation"},{"name":"clearGeolocationOverride","description":"Clears the overriden Geolocation Position and Error.","deprecated":true,"redirect":"Emulation"},{"name":"createIsolatedWorld","description":"Creates an isolated world for the given frame.","parameters":[{"name":"frameId","description":"Id of the frame in which the isolated world should be created.","$ref":"FrameId"},{"name":"worldName","description":"An optional name which is reported in the Execution Context.","optional":true,"type":"string"},{"name":"grantUniveralAccess","description":"Whether or not universal access should be granted to the isolated world. This is a powerful\noption, use with caution.","optional":true,"type":"boolean"}],"returns":[{"name":"executionContextId","description":"Execution context of the isolated world.","$ref":"Runtime.ExecutionContextId"}]},{"name":"deleteCookie","description":"Deletes browser cookie with given name, domain and path.","experimental":true,"deprecated":true,"redirect":"Network","parameters":[{"name":"cookieName","description":"Name of the cookie to remove.","type":"string"},{"name":"url","description":"URL to match cooke domain and path.","type":"string"}]},{"name":"disable","description":"Disables page domain notifications."},{"name":"enable","description":"Enables page domain notifications."},{"name":"getAppManifest","returns":[{"name":"url","description":"Manifest location.","type":"string"},{"name":"errors","type":"array","items":{"$ref":"AppManifestError"}},{"name":"data","description":"Manifest content.","optional":true,"type":"string"}]},{"name":"getCookies","description":"Returns all browser cookies. Depending on the backend support, will return detailed cookie\ninformation in the `cookies` field.","experimental":true,"deprecated":true,"redirect":"Network","returns":[{"name":"cookies","description":"Array of cookie objects.","type":"array","items":{"$ref":"Network.Cookie"}}]},{"name":"getFrameTree","description":"Returns present frame tree structure.","returns":[{"name":"frameTree","description":"Present frame tree structure.","$ref":"FrameTree"}]},{"name":"getLayoutMetrics","description":"Returns metrics relating to the layouting of the page, such as viewport bounds/scale.","returns":[{"name":"layoutViewport","description":"Metrics relating to the layout viewport.","$ref":"LayoutViewport"},{"name":"visualViewport","description":"Metrics relating to the visual viewport.","$ref":"VisualViewport"},{"name":"contentSize","description":"Size of scrollable area.","$ref":"DOM.Rect"}]},{"name":"getNavigationHistory","description":"Returns navigation history for the current page.","returns":[{"name":"currentIndex","description":"Index of the current navigation history entry.","type":"integer"},{"name":"entries","description":"Array of navigation history entries.","type":"array","items":{"$ref":"NavigationEntry"}}]},{"name":"getResourceContent","description":"Returns content of the given resource.","experimental":true,"parameters":[{"name":"frameId","description":"Frame id to get resource for.","$ref":"FrameId"},{"name":"url","description":"URL of the resource to get content for.","type":"string"}],"returns":[{"name":"content","description":"Resource content.","type":"string"},{"name":"base64Encoded","description":"True, if content was served as base64.","type":"boolean"}]},{"name":"getResourceTree","description":"Returns present frame / resource tree structure.","experimental":true,"returns":[{"name":"frameTree","description":"Present frame / resource tree structure.","$ref":"FrameResourceTree"}]},{"name":"handleJavaScriptDialog","description":"Accepts or dismisses a JavaScript initiated dialog (alert, confirm, prompt, or onbeforeunload).","parameters":[{"name":"accept","description":"Whether to accept or dismiss the dialog.","type":"boolean"},{"name":"promptText","description":"The text to enter into the dialog prompt before accepting. Used only if this is a prompt\ndialog.","optional":true,"type":"string"}]},{"name":"navigate","description":"Navigates current page to the given URL.","parameters":[{"name":"url","description":"URL to navigate the page to.","type":"string"},{"name":"referrer","description":"Referrer URL.","optional":true,"type":"string"},{"name":"transitionType","description":"Intended transition type.","optional":true,"$ref":"TransitionType"},{"name":"frameId","description":"Frame id to navigate, if not specified navigates the top frame.","optional":true,"$ref":"FrameId"}],"returns":[{"name":"frameId","description":"Frame id that has navigated (or failed to navigate)","$ref":"FrameId"},{"name":"loaderId","description":"Loader identifier.","optional":true,"$ref":"Network.LoaderId"},{"name":"errorText","description":"User friendly error message, present if and only if navigation has failed.","optional":true,"type":"string"}]},{"name":"navigateToHistoryEntry","description":"Navigates current page to the given history entry.","parameters":[{"name":"entryId","description":"Unique id of the entry to navigate to.","type":"integer"}]},{"name":"printToPDF","description":"Print page as PDF.","parameters":[{"name":"landscape","description":"Paper orientation. Defaults to false.","optional":true,"type":"boolean"},{"name":"displayHeaderFooter","description":"Display header and footer. Defaults to false.","optional":true,"type":"boolean"},{"name":"printBackground","description":"Print background graphics. Defaults to false.","optional":true,"type":"boolean"},{"name":"scale","description":"Scale of the webpage rendering. Defaults to 1.","optional":true,"type":"number"},{"name":"paperWidth","description":"Paper width in inches. Defaults to 8.5 inches.","optional":true,"type":"number"},{"name":"paperHeight","description":"Paper height in inches. Defaults to 11 inches.","optional":true,"type":"number"},{"name":"marginTop","description":"Top margin in inches. Defaults to 1cm (~0.4 inches).","optional":true,"type":"number"},{"name":"marginBottom","description":"Bottom margin in inches. Defaults to 1cm (~0.4 inches).","optional":true,"type":"number"},{"name":"marginLeft","description":"Left margin in inches. Defaults to 1cm (~0.4 inches).","optional":true,"type":"number"},{"name":"marginRight","description":"Right margin in inches. Defaults to 1cm (~0.4 inches).","optional":true,"type":"number"},{"name":"pageRanges","description":"Paper ranges to print, e.g., '1-5, 8, 11-13'. Defaults to the empty string, which means\nprint all pages.","optional":true,"type":"string"},{"name":"ignoreInvalidPageRanges","description":"Whether to silently ignore invalid but successfully parsed page ranges, such as '3-2'.\nDefaults to false.","optional":true,"type":"boolean"},{"name":"headerTemplate","description":"HTML template for the print header. Should be valid HTML markup with following\nclasses used to inject printing values into them:\n- `date`: formatted print date\n- `title`: document title\n- `url`: document location\n- `pageNumber`: current page number\n- `totalPages`: total pages in the document\n\nFor example, `<span class=title></span>` would generate span containing the title.","optional":true,"type":"string"},{"name":"footerTemplate","description":"HTML template for the print footer. Should use the same format as the `headerTemplate`.","optional":true,"type":"string"},{"name":"preferCSSPageSize","description":"Whether or not to prefer page size as defined by css. Defaults to false,\nin which case the content will be scaled to fit the paper size.","optional":true,"type":"boolean"}],"returns":[{"name":"data","description":"Base64-encoded pdf data.","type":"string"}]},{"name":"reload","description":"Reloads given page optionally ignoring the cache.","parameters":[{"name":"ignoreCache","description":"If true, browser cache is ignored (as if the user pressed Shift+refresh).","optional":true,"type":"boolean"},{"name":"scriptToEvaluateOnLoad","description":"If set, the script will be injected into all frames of the inspected page after reload.\nArgument will be ignored if reloading dataURL origin.","optional":true,"type":"string"}]},{"name":"removeScriptToEvaluateOnLoad","description":"Deprecated, please use removeScriptToEvaluateOnNewDocument instead.","experimental":true,"deprecated":true,"parameters":[{"name":"identifier","$ref":"ScriptIdentifier"}]},{"name":"removeScriptToEvaluateOnNewDocument","description":"Removes given script from the list.","parameters":[{"name":"identifier","$ref":"ScriptIdentifier"}]},{"name":"requestAppBanner","experimental":true},{"name":"screencastFrameAck","description":"Acknowledges that a screencast frame has been received by the frontend.","experimental":true,"parameters":[{"name":"sessionId","description":"Frame number.","type":"integer"}]},{"name":"searchInResource","description":"Searches for given string in resource content.","experimental":true,"parameters":[{"name":"frameId","description":"Frame id for resource to search in.","$ref":"FrameId"},{"name":"url","description":"URL of the resource to search in.","type":"string"},{"name":"query","description":"String to search for.","type":"string"},{"name":"caseSensitive","description":"If true, search is case sensitive.","optional":true,"type":"boolean"},{"name":"isRegex","description":"If true, treats string parameter as regex.","optional":true,"type":"boolean"}],"returns":[{"name":"result","description":"List of search matches.","type":"array","items":{"$ref":"Debugger.SearchMatch"}}]},{"name":"setAdBlockingEnabled","description":"Enable Chrome's experimental ad filter on all sites.","experimental":true,"parameters":[{"name":"enabled","description":"Whether to block ads.","type":"boolean"}]},{"name":"setBypassCSP","description":"Enable page Content Security Policy by-passing.","experimental":true,"parameters":[{"name":"enabled","description":"Whether to bypass page CSP.","type":"boolean"}]},{"name":"setDeviceMetricsOverride","description":"Overrides the values of device screen dimensions (window.screen.width, window.screen.height,\nwindow.innerWidth, window.innerHeight, and \"device-width\"/\"device-height\"-related CSS media\nquery results).","experimental":true,"deprecated":true,"redirect":"Emulation","parameters":[{"name":"width","description":"Overriding width value in pixels (minimum 0, maximum 10000000). 0 disables the override.","type":"integer"},{"name":"height","description":"Overriding height value in pixels (minimum 0, maximum 10000000). 0 disables the override.","type":"integer"},{"name":"deviceScaleFactor","description":"Overriding device scale factor value. 0 disables the override.","type":"number"},{"name":"mobile","description":"Whether to emulate mobile device. This includes viewport meta tag, overlay scrollbars, text\nautosizing and more.","type":"boolean"},{"name":"scale","description":"Scale to apply to resulting view image.","optional":true,"type":"number"},{"name":"screenWidth","description":"Overriding screen width value in pixels (minimum 0, maximum 10000000).","optional":true,"type":"integer"},{"name":"screenHeight","description":"Overriding screen height value in pixels (minimum 0, maximum 10000000).","optional":true,"type":"integer"},{"name":"positionX","description":"Overriding view X position on screen in pixels (minimum 0, maximum 10000000).","optional":true,"type":"integer"},{"name":"positionY","description":"Overriding view Y position on screen in pixels (minimum 0, maximum 10000000).","optional":true,"type":"integer"},{"name":"dontSetVisibleSize","description":"Do not set visible view size, rely upon explicit setVisibleSize call.","optional":true,"type":"boolean"},{"name":"screenOrientation","description":"Screen orientation override.","optional":true,"$ref":"Emulation.ScreenOrientation"},{"name":"viewport","description":"The viewport dimensions and scale. If not set, the override is cleared.","optional":true,"$ref":"Viewport"}]},{"name":"setDeviceOrientationOverride","description":"Overrides the Device Orientation.","experimental":true,"deprecated":true,"redirect":"DeviceOrientation","parameters":[{"name":"alpha","description":"Mock alpha","type":"number"},{"name":"beta","description":"Mock beta","type":"number"},{"name":"gamma","description":"Mock gamma","type":"number"}]},{"name":"setFontFamilies","description":"Set generic font families.","experimental":true,"parameters":[{"name":"fontFamilies","description":"Specifies font families to set. If a font family is not specified, it won't be changed.","$ref":"FontFamilies"}]},{"name":"setFontSizes","description":"Set default font sizes.","experimental":true,"parameters":[{"name":"fontSizes","description":"Specifies font sizes to set. If a font size is not specified, it won't be changed.","$ref":"FontSizes"}]},{"name":"setDocumentContent","description":"Sets given markup as the document's HTML.","parameters":[{"name":"frameId","description":"Frame id to set HTML for.","$ref":"FrameId"},{"name":"html","description":"HTML content to set.","type":"string"}]},{"name":"setDownloadBehavior","description":"Set the behavior when downloading a file.","experimental":true,"parameters":[{"name":"behavior","description":"Whether to allow all or deny all download requests, or use default Chrome behavior if\navailable (otherwise deny).","type":"string","enum":["deny","allow","default"]},{"name":"downloadPath","description":"The default path to save downloaded files to. This is requred if behavior is set to 'allow'","optional":true,"type":"string"}]},{"name":"setGeolocationOverride","description":"Overrides the Geolocation Position or Error. Omitting any of the parameters emulates position\nunavailable.","deprecated":true,"redirect":"Emulation","parameters":[{"name":"latitude","description":"Mock latitude","optional":true,"type":"number"},{"name":"longitude","description":"Mock longitude","optional":true,"type":"number"},{"name":"accuracy","description":"Mock accuracy","optional":true,"type":"number"}]},{"name":"setLifecycleEventsEnabled","description":"Controls whether page will emit lifecycle events.","experimental":true,"parameters":[{"name":"enabled","description":"If true, starts emitting lifecycle events.","type":"boolean"}]},{"name":"setTouchEmulationEnabled","description":"Toggles mouse event-based touch event emulation.","experimental":true,"deprecated":true,"redirect":"Emulation","parameters":[{"name":"enabled","description":"Whether the touch event emulation should be enabled.","type":"boolean"},{"name":"configuration","description":"Touch/gesture events configuration. Default: current platform.","optional":true,"type":"string","enum":["mobile","desktop"]}]},{"name":"startScreencast","description":"Starts sending each frame using the `screencastFrame` event.","experimental":true,"parameters":[{"name":"format","description":"Image compression format.","optional":true,"type":"string","enum":["jpeg","png"]},{"name":"quality","description":"Compression quality from range [0..100].","optional":true,"type":"integer"},{"name":"maxWidth","description":"Maximum screenshot width.","optional":true,"type":"integer"},{"name":"maxHeight","description":"Maximum screenshot height.","optional":true,"type":"integer"},{"name":"everyNthFrame","description":"Send every n-th frame.","optional":true,"type":"integer"}]},{"name":"stopLoading","description":"Force the page stop all navigations and pending resource fetches."},{"name":"crash","description":"Crashes renderer on the IO thread, generates minidumps.","experimental":true},{"name":"close","description":"Tries to close page, running its beforeunload hooks, if any.","experimental":true},{"name":"setWebLifecycleState","description":"Tries to update the web lifecycle state of the page.\nIt will transition the page to the given state according to:\nhttps://github.com/WICG/web-lifecycle/","experimental":true,"parameters":[{"name":"state","description":"Target lifecycle state","type":"string","enum":["frozen","active"]}]},{"name":"stopScreencast","description":"Stops sending each frame in the `screencastFrame`.","experimental":true}],"events":[{"name":"domContentEventFired","parameters":[{"name":"timestamp","$ref":"Network.MonotonicTime"}]},{"name":"frameAttached","description":"Fired when frame has been attached to its parent.","parameters":[{"name":"frameId","description":"Id of the frame that has been attached.","$ref":"FrameId"},{"name":"parentFrameId","description":"Parent frame identifier.","$ref":"FrameId"},{"name":"stack","description":"JavaScript stack trace of when frame was attached, only set if frame initiated from script.","optional":true,"$ref":"Runtime.StackTrace"}]},{"name":"frameClearedScheduledNavigation","description":"Fired when frame no longer has a scheduled navigation.","experimental":true,"parameters":[{"name":"frameId","description":"Id of the frame that has cleared its scheduled navigation.","$ref":"FrameId"}]},{"name":"frameDetached","description":"Fired when frame has been detached from its parent.","parameters":[{"name":"frameId","description":"Id of the frame that has been detached.","$ref":"FrameId"}]},{"name":"frameNavigated","description":"Fired once navigation of the frame has completed. Frame is now associated with the new loader.","parameters":[{"name":"frame","description":"Frame object.","$ref":"Frame"}]},{"name":"frameResized","experimental":true},{"name":"frameScheduledNavigation","description":"Fired when frame schedules a potential navigation.","experimental":true,"parameters":[{"name":"frameId","description":"Id of the frame that has scheduled a navigation.","$ref":"FrameId"},{"name":"delay","description":"Delay (in seconds) until the navigation is scheduled to begin. The navigation is not\nguaranteed to start.","type":"number"},{"name":"reason","description":"The reason for the navigation.","type":"string","enum":["formSubmissionGet","formSubmissionPost","httpHeaderRefresh","scriptInitiated","metaTagRefresh","pageBlockInterstitial","reload"]},{"name":"url","description":"The destination URL for the scheduled navigation.","type":"string"}]},{"name":"frameStartedLoading","description":"Fired when frame has started loading.","experimental":true,"parameters":[{"name":"frameId","description":"Id of the frame that has started loading.","$ref":"FrameId"}]},{"name":"frameStoppedLoading","description":"Fired when frame has stopped loading.","experimental":true,"parameters":[{"name":"frameId","description":"Id of the frame that has stopped loading.","$ref":"FrameId"}]},{"name":"interstitialHidden","description":"Fired when interstitial page was hidden"},{"name":"interstitialShown","description":"Fired when interstitial page was shown"},{"name":"javascriptDialogClosed","description":"Fired when a JavaScript initiated dialog (alert, confirm, prompt, or onbeforeunload) has been\nclosed.","parameters":[{"name":"result","description":"Whether dialog was confirmed.","type":"boolean"},{"name":"userInput","description":"User input in case of prompt.","type":"string"}]},{"name":"javascriptDialogOpening","description":"Fired when a JavaScript initiated dialog (alert, confirm, prompt, or onbeforeunload) is about to\nopen.","parameters":[{"name":"url","description":"Frame url.","type":"string"},{"name":"message","description":"Message that will be displayed by the dialog.","type":"string"},{"name":"type","description":"Dialog type.","$ref":"DialogType"},{"name":"hasBrowserHandler","description":"True iff browser is capable showing or acting on the given dialog. When browser has no\ndialog handler for given target, calling alert while Page domain is engaged will stall\nthe page execution. Execution can be resumed via calling Page.handleJavaScriptDialog.","type":"boolean"},{"name":"defaultPrompt","description":"Default dialog prompt.","optional":true,"type":"string"}]},{"name":"lifecycleEvent","description":"Fired for top level page lifecycle events such as navigation, load, paint, etc.","parameters":[{"name":"frameId","description":"Id of the frame.","$ref":"FrameId"},{"name":"loaderId","description":"Loader identifier. Empty string if the request is fetched from worker.","$ref":"Network.LoaderId"},{"name":"name","type":"string"},{"name":"timestamp","$ref":"Network.MonotonicTime"}]},{"name":"loadEventFired","parameters":[{"name":"timestamp","$ref":"Network.MonotonicTime"}]},{"name":"navigatedWithinDocument","description":"Fired when same-document navigation happens, e.g. due to history API usage or anchor navigation.","experimental":true,"parameters":[{"name":"frameId","description":"Id of the frame.","$ref":"FrameId"},{"name":"url","description":"Frame's new url.","type":"string"}]},{"name":"screencastFrame","description":"Compressed image data requested by the `startScreencast`.","experimental":true,"parameters":[{"name":"data","description":"Base64-encoded compressed image.","type":"string"},{"name":"metadata","description":"Screencast frame metadata.","$ref":"ScreencastFrameMetadata"},{"name":"sessionId","description":"Frame number.","type":"integer"}]},{"name":"screencastVisibilityChanged","description":"Fired when the page with currently enabled screencast was shown or hidden `.","experimental":true,"parameters":[{"name":"visible","description":"True if the page is visible.","type":"boolean"}]},{"name":"windowOpen","description":"Fired when a new window is going to be opened, via window.open(), link click, form submission,\netc.","parameters":[{"name":"url","description":"The URL for the new window.","type":"string"},{"name":"windowName","description":"Window name.","type":"string"},{"name":"windowFeatures","description":"An array of enabled window features.","type":"array","items":{"type":"string"}},{"name":"userGesture","description":"Whether or not it was triggered by user gesture.","type":"boolean"}]}]},{"domain":"Performance","types":[{"id":"Metric","description":"Run-time execution metric.","type":"object","properties":[{"name":"name","description":"Metric name.","type":"string"},{"name":"value","description":"Metric value.","type":"number"}]}],"commands":[{"name":"disable","description":"Disable collecting and reporting metrics."},{"name":"enable","description":"Enable collecting and reporting metrics."},{"name":"getMetrics","description":"Retrieve current values of run-time metrics.","returns":[{"name":"metrics","description":"Current values for run-time metrics.","type":"array","items":{"$ref":"Metric"}}]}],"events":[{"name":"metrics","description":"Current values of the metrics.","parameters":[{"name":"metrics","description":"Current values of the metrics.","type":"array","items":{"$ref":"Metric"}},{"name":"title","description":"Timestamp title.","type":"string"}]}]},{"domain":"Security","description":"Security","types":[{"id":"CertificateId","description":"An internal certificate ID value.","type":"integer"},{"id":"MixedContentType","description":"A description of mixed content (HTTP resources on HTTPS pages), as defined by\nhttps://www.w3.org/TR/mixed-content/#categories","type":"string","enum":["blockable","optionally-blockable","none"]},{"id":"SecurityState","description":"The security level of a page or resource.","type":"string","enum":["unknown","neutral","insecure","secure","info"]},{"id":"SecurityStateExplanation","description":"An explanation of an factor contributing to the security state.","type":"object","properties":[{"name":"securityState","description":"Security state representing the severity of the factor being explained.","$ref":"SecurityState"},{"name":"title","description":"Title describing the type of factor.","type":"string"},{"name":"summary","description":"Short phrase describing the type of factor.","type":"string"},{"name":"description","description":"Full text explanation of the factor.","type":"string"},{"name":"mixedContentType","description":"The type of mixed content described by the explanation.","$ref":"MixedContentType"},{"name":"certificate","description":"Page certificate.","type":"array","items":{"type":"string"}}]},{"id":"InsecureContentStatus","description":"Information about insecure content on the page.","type":"object","properties":[{"name":"ranMixedContent","description":"True if the page was loaded over HTTPS and ran mixed (HTTP) content such as scripts.","type":"boolean"},{"name":"displayedMixedContent","description":"True if the page was loaded over HTTPS and displayed mixed (HTTP) content such as images.","type":"boolean"},{"name":"containedMixedForm","description":"True if the page was loaded over HTTPS and contained a form targeting an insecure url.","type":"boolean"},{"name":"ranContentWithCertErrors","description":"True if the page was loaded over HTTPS without certificate errors, and ran content such as\nscripts that were loaded with certificate errors.","type":"boolean"},{"name":"displayedContentWithCertErrors","description":"True if the page was loaded over HTTPS without certificate errors, and displayed content\nsuch as images that were loaded with certificate errors.","type":"boolean"},{"name":"ranInsecureContentStyle","description":"Security state representing a page that ran insecure content.","$ref":"SecurityState"},{"name":"displayedInsecureContentStyle","description":"Security state representing a page that displayed insecure content.","$ref":"SecurityState"}]},{"id":"CertificateErrorAction","description":"The action to take when a certificate error occurs. continue will continue processing the\nrequest and cancel will cancel the request.","type":"string","enum":["continue","cancel"]}],"commands":[{"name":"disable","description":"Disables tracking security state changes."},{"name":"enable","description":"Enables tracking security state changes."},{"name":"setIgnoreCertificateErrors","description":"Enable/disable whether all certificate errors should be ignored.","experimental":true,"parameters":[{"name":"ignore","description":"If true, all certificate errors will be ignored.","type":"boolean"}]},{"name":"handleCertificateError","description":"Handles a certificate error that fired a certificateError event.","deprecated":true,"parameters":[{"name":"eventId","description":"The ID of the event.","type":"integer"},{"name":"action","description":"The action to take on the certificate error.","$ref":"CertificateErrorAction"}]},{"name":"setOverrideCertificateErrors","description":"Enable/disable overriding certificate errors. If enabled, all certificate error events need to\nbe handled by the DevTools client and should be answered with `handleCertificateError` commands.","deprecated":true,"parameters":[{"name":"override","description":"If true, certificate errors will be overridden.","type":"boolean"}]}],"events":[{"name":"certificateError","description":"There is a certificate error. If overriding certificate errors is enabled, then it should be\nhandled with the `handleCertificateError` command. Note: this event does not fire if the\ncertificate error has been allowed internally. Only one client per target should override\ncertificate errors at the same time.","deprecated":true,"parameters":[{"name":"eventId","description":"The ID of the event.","type":"integer"},{"name":"errorType","description":"The type of the error.","type":"string"},{"name":"requestURL","description":"The url that was requested.","type":"string"}]},{"name":"securityStateChanged","description":"The security state of the page changed.","parameters":[{"name":"securityState","description":"Security state.","$ref":"SecurityState"},{"name":"schemeIsCryptographic","description":"True if the page was loaded over cryptographic transport such as HTTPS.","type":"boolean"},{"name":"explanations","description":"List of explanations for the security state. If the overall security state is `insecure` or\n`warning`, at least one corresponding explanation should be included.","type":"array","items":{"$ref":"SecurityStateExplanation"}},{"name":"insecureContentStatus","description":"Information about insecure content on the page.","$ref":"InsecureContentStatus"},{"name":"summary","description":"Overrides user-visible description of the state.","optional":true,"type":"string"}]}]},{"domain":"ServiceWorker","experimental":true,"types":[{"id":"ServiceWorkerRegistration","description":"ServiceWorker registration.","type":"object","properties":[{"name":"registrationId","type":"string"},{"name":"scopeURL","type":"string"},{"name":"isDeleted","type":"boolean"}]},{"id":"ServiceWorkerVersionRunningStatus","type":"string","enum":["stopped","starting","running","stopping"]},{"id":"ServiceWorkerVersionStatus","type":"string","enum":["new","installing","installed","activating","activated","redundant"]},{"id":"ServiceWorkerVersion","description":"ServiceWorker version.","type":"object","properties":[{"name":"versionId","type":"string"},{"name":"registrationId","type":"string"},{"name":"scriptURL","type":"string"},{"name":"runningStatus","$ref":"ServiceWorkerVersionRunningStatus"},{"name":"status","$ref":"ServiceWorkerVersionStatus"},{"name":"scriptLastModified","description":"The Last-Modified header value of the main script.","optional":true,"type":"number"},{"name":"scriptResponseTime","description":"The time at which the response headers of the main script were received from the server.\nFor cached script it is the last time the cache entry was validated.","optional":true,"type":"number"},{"name":"controlledClients","optional":true,"type":"array","items":{"$ref":"Target.TargetID"}},{"name":"targetId","optional":true,"$ref":"Target.TargetID"}]},{"id":"ServiceWorkerErrorMessage","description":"ServiceWorker error message.","type":"object","properties":[{"name":"errorMessage","type":"string"},{"name":"registrationId","type":"string"},{"name":"versionId","type":"string"},{"name":"sourceURL","type":"string"},{"name":"lineNumber","type":"integer"},{"name":"columnNumber","type":"integer"}]}],"commands":[{"name":"deliverPushMessage","parameters":[{"name":"origin","type":"string"},{"name":"registrationId","type":"string"},{"name":"data","type":"string"}]},{"name":"disable"},{"name":"dispatchSyncEvent","parameters":[{"name":"origin","type":"string"},{"name":"registrationId","type":"string"},{"name":"tag","type":"string"},{"name":"lastChance","type":"boolean"}]},{"name":"enable"},{"name":"inspectWorker","parameters":[{"name":"versionId","type":"string"}]},{"name":"setForceUpdateOnPageLoad","parameters":[{"name":"forceUpdateOnPageLoad","type":"boolean"}]},{"name":"skipWaiting","parameters":[{"name":"scopeURL","type":"string"}]},{"name":"startWorker","parameters":[{"name":"scopeURL","type":"string"}]},{"name":"stopAllWorkers"},{"name":"stopWorker","parameters":[{"name":"versionId","type":"string"}]},{"name":"unregister","parameters":[{"name":"scopeURL","type":"string"}]},{"name":"updateRegistration","parameters":[{"name":"scopeURL","type":"string"}]}],"events":[{"name":"workerErrorReported","parameters":[{"name":"errorMessage","$ref":"ServiceWorkerErrorMessage"}]},{"name":"workerRegistrationUpdated","parameters":[{"name":"registrations","type":"array","items":{"$ref":"ServiceWorkerRegistration"}}]},{"name":"workerVersionUpdated","parameters":[{"name":"versions","type":"array","items":{"$ref":"ServiceWorkerVersion"}}]}]},{"domain":"Storage","experimental":true,"types":[{"id":"StorageType","description":"Enum of possible storage types.","type":"string","enum":["appcache","cookies","file_systems","indexeddb","local_storage","shader_cache","websql","service_workers","cache_storage","all","other"]},{"id":"UsageForType","description":"Usage for a storage type.","type":"object","properties":[{"name":"storageType","description":"Name of storage type.","$ref":"StorageType"},{"name":"usage","description":"Storage usage (bytes).","type":"number"}]}],"commands":[{"name":"clearDataForOrigin","description":"Clears storage for origin.","parameters":[{"name":"origin","description":"Security origin.","type":"string"},{"name":"storageTypes","description":"Comma separated origin names.","type":"string"}]},{"name":"getUsageAndQuota","description":"Returns usage and quota in bytes.","parameters":[{"name":"origin","description":"Security origin.","type":"string"}],"returns":[{"name":"usage","description":"Storage usage (bytes).","type":"number"},{"name":"quota","description":"Storage quota (bytes).","type":"number"},{"name":"usageBreakdown","description":"Storage usage per type (bytes).","type":"array","items":{"$ref":"UsageForType"}}]},{"name":"trackCacheStorageForOrigin","description":"Registers origin to be notified when an update occurs to its cache storage list.","parameters":[{"name":"origin","description":"Security origin.","type":"string"}]},{"name":"trackIndexedDBForOrigin","description":"Registers origin to be notified when an update occurs to its IndexedDB.","parameters":[{"name":"origin","description":"Security origin.","type":"string"}]},{"name":"untrackCacheStorageForOrigin","description":"Unregisters origin from receiving notifications for cache storage.","parameters":[{"name":"origin","description":"Security origin.","type":"string"}]},{"name":"untrackIndexedDBForOrigin","description":"Unregisters origin from receiving notifications for IndexedDB.","parameters":[{"name":"origin","description":"Security origin.","type":"string"}]}],"events":[{"name":"cacheStorageContentUpdated","description":"A cache's contents have been modified.","parameters":[{"name":"origin","description":"Origin to update.","type":"string"},{"name":"cacheName","description":"Name of cache in origin.","type":"string"}]},{"name":"cacheStorageListUpdated","description":"A cache has been added/deleted.","parameters":[{"name":"origin","description":"Origin to update.","type":"string"}]},{"name":"indexedDBContentUpdated","description":"The origin's IndexedDB object store has been modified.","parameters":[{"name":"origin","description":"Origin to update.","type":"string"},{"name":"databaseName","description":"Database to update.","type":"string"},{"name":"objectStoreName","description":"ObjectStore to update.","type":"string"}]},{"name":"indexedDBListUpdated","description":"The origin's IndexedDB database list has been modified.","parameters":[{"name":"origin","description":"Origin to update.","type":"string"}]}]},{"domain":"SystemInfo","description":"The SystemInfo domain defines methods and events for querying low-level system information.","experimental":true,"types":[{"id":"GPUDevice","description":"Describes a single graphics processor (GPU).","type":"object","properties":[{"name":"vendorId","description":"PCI ID of the GPU vendor, if available; 0 otherwise.","type":"number"},{"name":"deviceId","description":"PCI ID of the GPU device, if available; 0 otherwise.","type":"number"},{"name":"vendorString","description":"String description of the GPU vendor, if the PCI ID is not available.","type":"string"},{"name":"deviceString","description":"String description of the GPU device, if the PCI ID is not available.","type":"string"}]},{"id":"GPUInfo","description":"Provides information about the GPU(s) on the system.","type":"object","properties":[{"name":"devices","description":"The graphics devices on the system. Element 0 is the primary GPU.","type":"array","items":{"$ref":"GPUDevice"}},{"name":"auxAttributes","description":"An optional dictionary of additional GPU related attributes.","optional":true,"type":"object"},{"name":"featureStatus","description":"An optional dictionary of graphics features and their status.","optional":true,"type":"object"},{"name":"driverBugWorkarounds","description":"An optional array of GPU driver bug workarounds.","type":"array","items":{"type":"string"}}]}],"commands":[{"name":"getInfo","description":"Returns information about the system.","returns":[{"name":"gpu","description":"Information about the GPUs on the system.","$ref":"GPUInfo"},{"name":"modelName","description":"A platform-dependent description of the model of the machine. On Mac OS, this is, for\nexample, 'MacBookPro'. Will be the empty string if not supported.","type":"string"},{"name":"modelVersion","description":"A platform-dependent description of the version of the machine. On Mac OS, this is, for\nexample, '10.1'. Will be the empty string if not supported.","type":"string"},{"name":"commandLine","description":"The command line string used to launch the browser. Will be the empty string if not\nsupported.","type":"string"}]}]},{"domain":"Target","description":"Supports additional targets discovery and allows to attach to them.","types":[{"id":"TargetID","type":"string"},{"id":"SessionID","description":"Unique identifier of attached debugging session.","type":"string"},{"id":"BrowserContextID","experimental":true,"type":"string"},{"id":"TargetInfo","type":"object","properties":[{"name":"targetId","$ref":"TargetID"},{"name":"type","type":"string"},{"name":"title","type":"string"},{"name":"url","type":"string"},{"name":"attached","description":"Whether the target has an attached client.","type":"boolean"},{"name":"openerId","description":"Opener target Id","optional":true,"$ref":"TargetID"},{"name":"browserContextId","experimental":true,"optional":true,"$ref":"BrowserContextID"}]},{"id":"RemoteLocation","experimental":true,"type":"object","properties":[{"name":"host","type":"string"},{"name":"port","type":"integer"}]}],"commands":[{"name":"activateTarget","description":"Activates (focuses) the target.","parameters":[{"name":"targetId","$ref":"TargetID"}]},{"name":"attachToTarget","description":"Attaches to the target with given id.","parameters":[{"name":"targetId","$ref":"TargetID"}],"returns":[{"name":"sessionId","description":"Id assigned to the session.","$ref":"SessionID"}]},{"name":"closeTarget","description":"Closes the target. If the target is a page that gets closed too.","parameters":[{"name":"targetId","$ref":"TargetID"}],"returns":[{"name":"success","type":"boolean"}]},{"name":"exposeDevToolsProtocol","description":"Inject object to the target's main frame that provides a communication\nchannel with browser target.\n\nInjected object will be available as `window[bindingName]`.\n\nThe object has the follwing API:\n- `binding.send(json)` - a method to send messages over the remote debugging protocol\n- `binding.onmessage = json => handleMessage(json)` - a callback that will be called for the protocol notifications and command responses.","experimental":true,"parameters":[{"name":"targetId","$ref":"TargetID"},{"name":"bindingName","description":"Binding name, 'cdp' if not specified.","optional":true,"type":"string"}]},{"name":"createBrowserContext","description":"Creates a new empty BrowserContext. Similar to an incognito profile but you can have more than\none.","experimental":true,"returns":[{"name":"browserContextId","description":"The id of the context created.","$ref":"BrowserContextID"}]},{"name":"getBrowserContexts","description":"Returns all browser contexts created with `Target.createBrowserContext` method.","experimental":true,"returns":[{"name":"browserContextIds","description":"An array of browser context ids.","type":"array","items":{"$ref":"BrowserContextID"}}]},{"name":"createTarget","description":"Creates a new page.","parameters":[{"name":"url","description":"The initial URL the page will be navigated to.","type":"string"},{"name":"width","description":"Frame width in DIP (headless chrome only).","optional":true,"type":"integer"},{"name":"height","description":"Frame height in DIP (headless chrome only).","optional":true,"type":"integer"},{"name":"browserContextId","description":"The browser context to create the page in.","optional":true,"$ref":"BrowserContextID"},{"name":"enableBeginFrameControl","description":"Whether BeginFrames for this target will be controlled via DevTools (headless chrome only,\nnot supported on MacOS yet, false by default).","experimental":true,"optional":true,"type":"boolean"}],"returns":[{"name":"targetId","description":"The id of the page opened.","$ref":"TargetID"}]},{"name":"detachFromTarget","description":"Detaches session with given id.","parameters":[{"name":"sessionId","description":"Session to detach.","optional":true,"$ref":"SessionID"},{"name":"targetId","description":"Deprecated.","deprecated":true,"optional":true,"$ref":"TargetID"}]},{"name":"disposeBrowserContext","description":"Deletes a BrowserContext. All the belonging pages will be closed without calling their\nbeforeunload hooks.","experimental":true,"parameters":[{"name":"browserContextId","$ref":"BrowserContextID"}]},{"name":"getTargetInfo","description":"Returns information about a target.","experimental":true,"parameters":[{"name":"targetId","optional":true,"$ref":"TargetID"}],"returns":[{"name":"targetInfo","$ref":"TargetInfo"}]},{"name":"getTargets","description":"Retrieves a list of available targets.","returns":[{"name":"targetInfos","description":"The list of targets.","type":"array","items":{"$ref":"TargetInfo"}}]},{"name":"sendMessageToTarget","description":"Sends protocol message over session with given id.","parameters":[{"name":"message","type":"string"},{"name":"sessionId","description":"Identifier of the session.","optional":true,"$ref":"SessionID"},{"name":"targetId","description":"Deprecated.","deprecated":true,"optional":true,"$ref":"TargetID"}]},{"name":"setAutoAttach","description":"Controls whether to automatically attach to new targets which are considered to be related to\nthis one. When turned on, attaches to all existing related targets as well. When turned off,\nautomatically detaches from all currently attached targets.","experimental":true,"parameters":[{"name":"autoAttach","description":"Whether to auto-attach to related targets.","type":"boolean"},{"name":"waitForDebuggerOnStart","description":"Whether to pause new targets when attaching to them. Use `Runtime.runIfWaitingForDebugger`\nto run paused targets.","type":"boolean"}]},{"name":"setDiscoverTargets","description":"Controls whether to discover available targets and notify via\n`targetCreated/targetInfoChanged/targetDestroyed` events.","parameters":[{"name":"discover","description":"Whether to discover available targets.","type":"boolean"}]},{"name":"setRemoteLocations","description":"Enables target discovery for the specified locations, when `setDiscoverTargets` was set to\n`true`.","experimental":true,"parameters":[{"name":"locations","description":"List of remote locations.","type":"array","items":{"$ref":"RemoteLocation"}}]}],"events":[{"name":"attachedToTarget","description":"Issued when attached to target because of auto-attach or `attachToTarget` command.","experimental":true,"parameters":[{"name":"sessionId","description":"Identifier assigned to the session used to send/receive messages.","$ref":"SessionID"},{"name":"targetInfo","$ref":"TargetInfo"},{"name":"waitingForDebugger","type":"boolean"}]},{"name":"detachedFromTarget","description":"Issued when detached from target for any reason (including `detachFromTarget` command). Can be\nissued multiple times per target if multiple sessions have been attached to it.","experimental":true,"parameters":[{"name":"sessionId","description":"Detached session identifier.","$ref":"SessionID"},{"name":"targetId","description":"Deprecated.","deprecated":true,"optional":true,"$ref":"TargetID"}]},{"name":"receivedMessageFromTarget","description":"Notifies about a new protocol message received from the session (as reported in\n`attachedToTarget` event).","parameters":[{"name":"sessionId","description":"Identifier of a session which sends a message.","$ref":"SessionID"},{"name":"message","type":"string"},{"name":"targetId","description":"Deprecated.","deprecated":true,"optional":true,"$ref":"TargetID"}]},{"name":"targetCreated","description":"Issued when a possible inspection target is created.","parameters":[{"name":"targetInfo","$ref":"TargetInfo"}]},{"name":"targetDestroyed","description":"Issued when a target is destroyed.","parameters":[{"name":"targetId","$ref":"TargetID"}]},{"name":"targetCrashed","description":"Issued when a target has crashed.","parameters":[{"name":"targetId","$ref":"TargetID"},{"name":"status","description":"Termination status type.","type":"string"},{"name":"errorCode","description":"Termination error code.","type":"integer"}]},{"name":"targetInfoChanged","description":"Issued when some information about a target has changed. This only happens between\n`targetCreated` and `targetDestroyed`.","parameters":[{"name":"targetInfo","$ref":"TargetInfo"}]}]},{"domain":"Tethering","description":"The Tethering domain defines methods and events for browser port binding.","experimental":true,"commands":[{"name":"bind","description":"Request browser port binding.","parameters":[{"name":"port","description":"Port number to bind.","type":"integer"}]},{"name":"unbind","description":"Request browser port unbinding.","parameters":[{"name":"port","description":"Port number to unbind.","type":"integer"}]}],"events":[{"name":"accepted","description":"Informs that port was successfully bound and got a specified connection id.","parameters":[{"name":"port","description":"Port number that was successfully bound.","type":"integer"},{"name":"connectionId","description":"Connection id to be used.","type":"string"}]}]},{"domain":"Tracing","experimental":true,"dependencies":["IO"],"types":[{"id":"MemoryDumpConfig","description":"Configuration for memory dump. Used only when \"memory-infra\" category is enabled.","type":"object"},{"id":"TraceConfig","type":"object","properties":[{"name":"recordMode","description":"Controls how the trace buffer stores data.","optional":true,"type":"string","enum":["recordUntilFull","recordContinuously","recordAsMuchAsPossible","echoToConsole"]},{"name":"enableSampling","description":"Turns on JavaScript stack sampling.","optional":true,"type":"boolean"},{"name":"enableSystrace","description":"Turns on system tracing.","optional":true,"type":"boolean"},{"name":"enableArgumentFilter","description":"Turns on argument filter.","optional":true,"type":"boolean"},{"name":"includedCategories","description":"Included category filters.","optional":true,"type":"array","items":{"type":"string"}},{"name":"excludedCategories","description":"Excluded category filters.","optional":true,"type":"array","items":{"type":"string"}},{"name":"syntheticDelays","description":"Configuration to synthesize the delays in tracing.","optional":true,"type":"array","items":{"type":"string"}},{"name":"memoryDumpConfig","description":"Configuration for memory dump triggers. Used only when \"memory-infra\" category is enabled.","optional":true,"$ref":"MemoryDumpConfig"}]},{"id":"StreamCompression","description":"Compression type to use for traces returned via streams.","type":"string","enum":["none","gzip"]}],"commands":[{"name":"end","description":"Stop trace events collection."},{"name":"getCategories","description":"Gets supported tracing categories.","returns":[{"name":"categories","description":"A list of supported tracing categories.","type":"array","items":{"type":"string"}}]},{"name":"recordClockSyncMarker","description":"Record a clock sync marker in the trace.","parameters":[{"name":"syncId","description":"The ID of this clock sync marker","type":"string"}]},{"name":"requestMemoryDump","description":"Request a global memory dump.","returns":[{"name":"dumpGuid","description":"GUID of the resulting global memory dump.","type":"string"},{"name":"success","description":"True iff the global memory dump succeeded.","type":"boolean"}]},{"name":"start","description":"Start trace events collection.","parameters":[{"name":"categories","description":"Category/tag filter","deprecated":true,"optional":true,"type":"string"},{"name":"options","description":"Tracing options","deprecated":true,"optional":true,"type":"string"},{"name":"bufferUsageReportingInterval","description":"If set, the agent will issue bufferUsage events at this interval, specified in milliseconds","optional":true,"type":"number"},{"name":"transferMode","description":"Whether to report trace events as series of dataCollected events or to save trace to a\nstream (defaults to `ReportEvents`).","optional":true,"type":"string","enum":["ReportEvents","ReturnAsStream"]},{"name":"streamCompression","description":"Compression format to use. This only applies when using `ReturnAsStream`\ntransfer mode (defaults to `none`)","optional":true,"$ref":"StreamCompression"},{"name":"traceConfig","optional":true,"$ref":"TraceConfig"}]}],"events":[{"name":"bufferUsage","parameters":[{"name":"percentFull","description":"A number in range [0..1] that indicates the used size of event buffer as a fraction of its\ntotal size.","optional":true,"type":"number"},{"name":"eventCount","description":"An approximate number of events in the trace log.","optional":true,"type":"number"},{"name":"value","description":"A number in range [0..1] that indicates the used size of event buffer as a fraction of its\ntotal size.","optional":true,"type":"number"}]},{"name":"dataCollected","description":"Contains an bucket of collected trace events. When tracing is stopped collected events will be\nsend as a sequence of dataCollected events followed by tracingComplete event.","parameters":[{"name":"value","type":"array","items":{"type":"object"}}]},{"name":"tracingComplete","description":"Signals that tracing is stopped and there is no trace buffers pending flush, all data were\ndelivered via dataCollected events.","parameters":[{"name":"stream","description":"A handle of the stream that holds resulting trace data.","optional":true,"$ref":"IO.StreamHandle"},{"name":"streamCompression","description":"Compression format of returned stream.","optional":true,"$ref":"StreamCompression"}]}]},{"domain":"Console","description":"This domain is deprecated - use Runtime or Log instead.","deprecated":true,"dependencies":["Runtime"],"types":[{"id":"ConsoleMessage","description":"Console message.","type":"object","properties":[{"name":"source","description":"Message source.","type":"string","enum":["xml","javascript","network","console-api","storage","appcache","rendering","security","other","deprecation","worker"]},{"name":"level","description":"Message severity.","type":"string","enum":["log","warning","error","debug","info"]},{"name":"text","description":"Message text.","type":"string"},{"name":"url","description":"URL of the message origin.","optional":true,"type":"string"},{"name":"line","description":"Line number in the resource that generated this message (1-based).","optional":true,"type":"integer"},{"name":"column","description":"Column number in the resource that generated this message (1-based).","optional":true,"type":"integer"}]}],"commands":[{"name":"clearMessages","description":"Does nothing."},{"name":"disable","description":"Disables console domain, prevents further console messages from being reported to the client."},{"name":"enable","description":"Enables console domain, sends the messages collected so far to the client by means of the\n`messageAdded` notification."}],"events":[{"name":"messageAdded","description":"Issued when new console message is added.","parameters":[{"name":"message","description":"Console message that has been added.","$ref":"ConsoleMessage"}]}]},{"domain":"Debugger","description":"Debugger domain exposes JavaScript debugging capabilities. It allows setting and removing\nbreakpoints, stepping through execution, exploring stack traces, etc.","dependencies":["Runtime"],"types":[{"id":"BreakpointId","description":"Breakpoint identifier.","type":"string"},{"id":"CallFrameId","description":"Call frame identifier.","type":"string"},{"id":"Location","description":"Location in the source code.","type":"object","properties":[{"name":"scriptId","description":"Script identifier as reported in the `Debugger.scriptParsed`.","$ref":"Runtime.ScriptId"},{"name":"lineNumber","description":"Line number in the script (0-based).","type":"integer"},{"name":"columnNumber","description":"Column number in the script (0-based).","optional":true,"type":"integer"}]},{"id":"ScriptPosition","description":"Location in the source code.","experimental":true,"type":"object","properties":[{"name":"lineNumber","type":"integer"},{"name":"columnNumber","type":"integer"}]},{"id":"CallFrame","description":"JavaScript call frame. Array of call frames form the call stack.","type":"object","properties":[{"name":"callFrameId","description":"Call frame identifier. This identifier is only valid while the virtual machine is paused.","$ref":"CallFrameId"},{"name":"functionName","description":"Name of the JavaScript function called on this call frame.","type":"string"},{"name":"functionLocation","description":"Location in the source code.","optional":true,"$ref":"Location"},{"name":"location","description":"Location in the source code.","$ref":"Location"},{"name":"url","description":"JavaScript script name or url.","type":"string"},{"name":"scopeChain","description":"Scope chain for this call frame.","type":"array","items":{"$ref":"Scope"}},{"name":"this","description":"`this` object for this call frame.","$ref":"Runtime.RemoteObject"},{"name":"returnValue","description":"The value being returned, if the function is at return point.","optional":true,"$ref":"Runtime.RemoteObject"}]},{"id":"Scope","description":"Scope description.","type":"object","properties":[{"name":"type","description":"Scope type.","type":"string","enum":["global","local","with","closure","catch","block","script","eval","module"]},{"name":"object","description":"Object representing the scope. For `global` and `with` scopes it represents the actual\nobject; for the rest of the scopes, it is artificial transient object enumerating scope\nvariables as its properties.","$ref":"Runtime.RemoteObject"},{"name":"name","optional":true,"type":"string"},{"name":"startLocation","description":"Location in the source code where scope starts","optional":true,"$ref":"Location"},{"name":"endLocation","description":"Location in the source code where scope ends","optional":true,"$ref":"Location"}]},{"id":"SearchMatch","description":"Search match for resource.","type":"object","properties":[{"name":"lineNumber","description":"Line number in resource content.","type":"number"},{"name":"lineContent","description":"Line with match content.","type":"string"}]},{"id":"BreakLocation","type":"object","properties":[{"name":"scriptId","description":"Script identifier as reported in the `Debugger.scriptParsed`.","$ref":"Runtime.ScriptId"},{"name":"lineNumber","description":"Line number in the script (0-based).","type":"integer"},{"name":"columnNumber","description":"Column number in the script (0-based).","optional":true,"type":"integer"},{"name":"type","optional":true,"type":"string","enum":["debuggerStatement","call","return"]}]}],"commands":[{"name":"continueToLocation","description":"Continues execution until specific location is reached.","parameters":[{"name":"location","description":"Location to continue to.","$ref":"Location"},{"name":"targetCallFrames","optional":true,"type":"string","enum":["any","current"]}]},{"name":"disable","description":"Disables debugger for given page."},{"name":"enable","description":"Enables debugger for the given page. Clients should not assume that the debugging has been\nenabled until the result for this command is received.","returns":[{"name":"debuggerId","description":"Unique identifier of the debugger.","experimental":true,"$ref":"Runtime.UniqueDebuggerId"}]},{"name":"evaluateOnCallFrame","description":"Evaluates expression on a given call frame.","parameters":[{"name":"callFrameId","description":"Call frame identifier to evaluate on.","$ref":"CallFrameId"},{"name":"expression","description":"Expression to evaluate.","type":"string"},{"name":"objectGroup","description":"String object group name to put result into (allows rapid releasing resulting object handles\nusing `releaseObjectGroup`).","optional":true,"type":"string"},{"name":"includeCommandLineAPI","description":"Specifies whether command line API should be available to the evaluated expression, defaults\nto false.","optional":true,"type":"boolean"},{"name":"silent","description":"In silent mode exceptions thrown during evaluation are not reported and do not pause\nexecution. Overrides `setPauseOnException` state.","optional":true,"type":"boolean"},{"name":"returnByValue","description":"Whether the result is expected to be a JSON object that should be sent by value.","optional":true,"type":"boolean"},{"name":"generatePreview","description":"Whether preview should be generated for the result.","experimental":true,"optional":true,"type":"boolean"},{"name":"throwOnSideEffect","description":"Whether to throw an exception if side effect cannot be ruled out during evaluation.","optional":true,"type":"boolean"},{"name":"timeout","description":"Terminate execution after timing out (number of milliseconds).","experimental":true,"optional":true,"$ref":"Runtime.TimeDelta"}],"returns":[{"name":"result","description":"Object wrapper for the evaluation result.","$ref":"Runtime.RemoteObject"},{"name":"exceptionDetails","description":"Exception details.","optional":true,"$ref":"Runtime.ExceptionDetails"}]},{"name":"getPossibleBreakpoints","description":"Returns possible locations for breakpoint. scriptId in start and end range locations should be\nthe same.","parameters":[{"name":"start","description":"Start of range to search possible breakpoint locations in.","$ref":"Location"},{"name":"end","description":"End of range to search possible breakpoint locations in (excluding). When not specified, end\nof scripts is used as end of range.","optional":true,"$ref":"Location"},{"name":"restrictToFunction","description":"Only consider locations which are in the same (non-nested) function as start.","optional":true,"type":"boolean"}],"returns":[{"name":"locations","description":"List of the possible breakpoint locations.","type":"array","items":{"$ref":"BreakLocation"}}]},{"name":"getScriptSource","description":"Returns source for the script with given id.","parameters":[{"name":"scriptId","description":"Id of the script to get source for.","$ref":"Runtime.ScriptId"}],"returns":[{"name":"scriptSource","description":"Script source.","type":"string"}]},{"name":"getStackTrace","description":"Returns stack trace with given `stackTraceId`.","experimental":true,"parameters":[{"name":"stackTraceId","$ref":"Runtime.StackTraceId"}],"returns":[{"name":"stackTrace","$ref":"Runtime.StackTrace"}]},{"name":"pause","description":"Stops on the next JavaScript statement."},{"name":"pauseOnAsyncCall","experimental":true,"parameters":[{"name":"parentStackTraceId","description":"Debugger will pause when async call with given stack trace is started.","$ref":"Runtime.StackTraceId"}]},{"name":"removeBreakpoint","description":"Removes JavaScript breakpoint.","parameters":[{"name":"breakpointId","$ref":"BreakpointId"}]},{"name":"restartFrame","description":"Restarts particular call frame from the beginning.","parameters":[{"name":"callFrameId","description":"Call frame identifier to evaluate on.","$ref":"CallFrameId"}],"returns":[{"name":"callFrames","description":"New stack trace.","type":"array","items":{"$ref":"CallFrame"}},{"name":"asyncStackTrace","description":"Async stack trace, if any.","optional":true,"$ref":"Runtime.StackTrace"},{"name":"asyncStackTraceId","description":"Async stack trace, if any.","experimental":true,"optional":true,"$ref":"Runtime.StackTraceId"}]},{"name":"resume","description":"Resumes JavaScript execution."},{"name":"scheduleStepIntoAsync","description":"This method is deprecated - use Debugger.stepInto with breakOnAsyncCall and\nDebugger.pauseOnAsyncTask instead. Steps into next scheduled async task if any is scheduled\nbefore next pause. Returns success when async task is actually scheduled, returns error if no\ntask were scheduled or another scheduleStepIntoAsync was called.","experimental":true},{"name":"searchInContent","description":"Searches for given string in script content.","parameters":[{"name":"scriptId","description":"Id of the script to search in.","$ref":"Runtime.ScriptId"},{"name":"query","description":"String to search for.","type":"string"},{"name":"caseSensitive","description":"If true, search is case sensitive.","optional":true,"type":"boolean"},{"name":"isRegex","description":"If true, treats string parameter as regex.","optional":true,"type":"boolean"}],"returns":[{"name":"result","description":"List of search matches.","type":"array","items":{"$ref":"SearchMatch"}}]},{"name":"setAsyncCallStackDepth","description":"Enables or disables async call stacks tracking.","parameters":[{"name":"maxDepth","description":"Maximum depth of async call stacks. Setting to `0` will effectively disable collecting async\ncall stacks (default).","type":"integer"}]},{"name":"setBlackboxPatterns","description":"Replace previous blackbox patterns with passed ones. Forces backend to skip stepping/pausing in\nscripts with url matching one of the patterns. VM will try to leave blackboxed script by\nperforming 'step in' several times, finally resorting to 'step out' if unsuccessful.","experimental":true,"parameters":[{"name":"patterns","description":"Array of regexps that will be used to check script url for blackbox state.","type":"array","items":{"type":"string"}}]},{"name":"setBlackboxedRanges","description":"Makes backend skip steps in the script in blackboxed ranges. VM will try leave blacklisted\nscripts by performing 'step in' several times, finally resorting to 'step out' if unsuccessful.\nPositions array contains positions where blackbox state is changed. First interval isn't\nblackboxed. Array should be sorted.","experimental":true,"parameters":[{"name":"scriptId","description":"Id of the script.","$ref":"Runtime.ScriptId"},{"name":"positions","type":"array","items":{"$ref":"ScriptPosition"}}]},{"name":"setBreakpoint","description":"Sets JavaScript breakpoint at a given location.","parameters":[{"name":"location","description":"Location to set breakpoint in.","$ref":"Location"},{"name":"condition","description":"Expression to use as a breakpoint condition. When specified, debugger will only stop on the\nbreakpoint if this expression evaluates to true.","optional":true,"type":"string"}],"returns":[{"name":"breakpointId","description":"Id of the created breakpoint for further reference.","$ref":"BreakpointId"},{"name":"actualLocation","description":"Location this breakpoint resolved into.","$ref":"Location"}]},{"name":"setBreakpointByUrl","description":"Sets JavaScript breakpoint at given location specified either by URL or URL regex. Once this\ncommand is issued, all existing parsed scripts will have breakpoints resolved and returned in\n`locations` property. Further matching script parsing will result in subsequent\n`breakpointResolved` events issued. This logical breakpoint will survive page reloads.","parameters":[{"name":"lineNumber","description":"Line number to set breakpoint at.","type":"integer"},{"name":"url","description":"URL of the resources to set breakpoint on.","optional":true,"type":"string"},{"name":"urlRegex","description":"Regex pattern for the URLs of the resources to set breakpoints on. Either `url` or\n`urlRegex` must be specified.","optional":true,"type":"string"},{"name":"scriptHash","description":"Script hash of the resources to set breakpoint on.","optional":true,"type":"string"},{"name":"columnNumber","description":"Offset in the line to set breakpoint at.","optional":true,"type":"integer"},{"name":"condition","description":"Expression to use as a breakpoint condition. When specified, debugger will only stop on the\nbreakpoint if this expression evaluates to true.","optional":true,"type":"string"}],"returns":[{"name":"breakpointId","description":"Id of the created breakpoint for further reference.","$ref":"BreakpointId"},{"name":"locations","description":"List of the locations this breakpoint resolved into upon addition.","type":"array","items":{"$ref":"Location"}}]},{"name":"setBreakpointOnFunctionCall","description":"Sets JavaScript breakpoint before each call to the given function.\nIf another function was created from the same source as a given one,\ncalling it will also trigger the breakpoint.","experimental":true,"parameters":[{"name":"objectId","description":"Function object id.","$ref":"Runtime.RemoteObjectId"},{"name":"condition","description":"Expression to use as a breakpoint condition. When specified, debugger will\nstop on the breakpoint if this expression evaluates to true.","optional":true,"type":"string"}],"returns":[{"name":"breakpointId","description":"Id of the created breakpoint for further reference.","$ref":"BreakpointId"}]},{"name":"setBreakpointsActive","description":"Activates / deactivates all breakpoints on the page.","parameters":[{"name":"active","description":"New value for breakpoints active state.","type":"boolean"}]},{"name":"setPauseOnExceptions","description":"Defines pause on exceptions state. Can be set to stop on all exceptions, uncaught exceptions or\nno exceptions. Initial pause on exceptions state is `none`.","parameters":[{"name":"state","description":"Pause on exceptions mode.","type":"string","enum":["none","uncaught","all"]}]},{"name":"setReturnValue","description":"Changes return value in top frame. Available only at return break position.","experimental":true,"parameters":[{"name":"newValue","description":"New return value.","$ref":"Runtime.CallArgument"}]},{"name":"setScriptSource","description":"Edits JavaScript source live.","parameters":[{"name":"scriptId","description":"Id of the script to edit.","$ref":"Runtime.ScriptId"},{"name":"scriptSource","description":"New content of the script.","type":"string"},{"name":"dryRun","description":"If true the change will not actually be applied. Dry run may be used to get result\ndescription without actually modifying the code.","optional":true,"type":"boolean"}],"returns":[{"name":"callFrames","description":"New stack trace in case editing has happened while VM was stopped.","optional":true,"type":"array","items":{"$ref":"CallFrame"}},{"name":"stackChanged","description":"Whether current call stack  was modified after applying the changes.","optional":true,"type":"boolean"},{"name":"asyncStackTrace","description":"Async stack trace, if any.","optional":true,"$ref":"Runtime.StackTrace"},{"name":"asyncStackTraceId","description":"Async stack trace, if any.","experimental":true,"optional":true,"$ref":"Runtime.StackTraceId"},{"name":"exceptionDetails","description":"Exception details if any.","optional":true,"$ref":"Runtime.ExceptionDetails"}]},{"name":"setSkipAllPauses","description":"Makes page not interrupt on any pauses (breakpoint, exception, dom exception etc).","parameters":[{"name":"skip","description":"New value for skip pauses state.","type":"boolean"}]},{"name":"setVariableValue","description":"Changes value of variable in a callframe. Object-based scopes are not supported and must be\nmutated manually.","parameters":[{"name":"scopeNumber","description":"0-based number of scope as was listed in scope chain. Only 'local', 'closure' and 'catch'\nscope types are allowed. Other scopes could be manipulated manually.","type":"integer"},{"name":"variableName","description":"Variable name.","type":"string"},{"name":"newValue","description":"New variable value.","$ref":"Runtime.CallArgument"},{"name":"callFrameId","description":"Id of callframe that holds variable.","$ref":"CallFrameId"}]},{"name":"stepInto","description":"Steps into the function call.","parameters":[{"name":"breakOnAsyncCall","description":"Debugger will issue additional Debugger.paused notification if any async task is scheduled\nbefore next pause.","experimental":true,"optional":true,"type":"boolean"}]},{"name":"stepOut","description":"Steps out of the function call."},{"name":"stepOver","description":"Steps over the statement."}],"events":[{"name":"breakpointResolved","description":"Fired when breakpoint is resolved to an actual script and location.","parameters":[{"name":"breakpointId","description":"Breakpoint unique identifier.","$ref":"BreakpointId"},{"name":"location","description":"Actual breakpoint location.","$ref":"Location"}]},{"name":"paused","description":"Fired when the virtual machine stopped on breakpoint or exception or any other stop criteria.","parameters":[{"name":"callFrames","description":"Call stack the virtual machine stopped on.","type":"array","items":{"$ref":"CallFrame"}},{"name":"reason","description":"Pause reason.","type":"string","enum":["XHR","DOM","EventListener","exception","assert","debugCommand","promiseRejection","OOM","other","ambiguous"]},{"name":"data","description":"Object containing break-specific auxiliary properties.","optional":true,"type":"object"},{"name":"hitBreakpoints","description":"Hit breakpoints IDs","optional":true,"type":"array","items":{"type":"string"}},{"name":"asyncStackTrace","description":"Async stack trace, if any.","optional":true,"$ref":"Runtime.StackTrace"},{"name":"asyncStackTraceId","description":"Async stack trace, if any.","experimental":true,"optional":true,"$ref":"Runtime.StackTraceId"},{"name":"asyncCallStackTraceId","description":"Just scheduled async call will have this stack trace as parent stack during async execution.\nThis field is available only after `Debugger.stepInto` call with `breakOnAsynCall` flag.","experimental":true,"optional":true,"$ref":"Runtime.StackTraceId"}]},{"name":"resumed","description":"Fired when the virtual machine resumed execution."},{"name":"scriptFailedToParse","description":"Fired when virtual machine fails to parse the script.","parameters":[{"name":"scriptId","description":"Identifier of the script parsed.","$ref":"Runtime.ScriptId"},{"name":"url","description":"URL or name of the script parsed (if any).","type":"string"},{"name":"startLine","description":"Line offset of the script within the resource with given URL (for script tags).","type":"integer"},{"name":"startColumn","description":"Column offset of the script within the resource with given URL.","type":"integer"},{"name":"endLine","description":"Last line of the script.","type":"integer"},{"name":"endColumn","description":"Length of the last line of the script.","type":"integer"},{"name":"executionContextId","description":"Specifies script creation context.","$ref":"Runtime.ExecutionContextId"},{"name":"hash","description":"Content hash of the script.","type":"string"},{"name":"executionContextAuxData","description":"Embedder-specific auxiliary data.","optional":true,"type":"object"},{"name":"sourceMapURL","description":"URL of source map associated with script (if any).","optional":true,"type":"string"},{"name":"hasSourceURL","description":"True, if this script has sourceURL.","optional":true,"type":"boolean"},{"name":"isModule","description":"True, if this script is ES6 module.","optional":true,"type":"boolean"},{"name":"length","description":"This script length.","optional":true,"type":"integer"},{"name":"stackTrace","description":"JavaScript top stack frame of where the script parsed event was triggered if available.","experimental":true,"optional":true,"$ref":"Runtime.StackTrace"}]},{"name":"scriptParsed","description":"Fired when virtual machine parses script. This event is also fired for all known and uncollected\nscripts upon enabling debugger.","parameters":[{"name":"scriptId","description":"Identifier of the script parsed.","$ref":"Runtime.ScriptId"},{"name":"url","description":"URL or name of the script parsed (if any).","type":"string"},{"name":"startLine","description":"Line offset of the script within the resource with given URL (for script tags).","type":"integer"},{"name":"startColumn","description":"Column offset of the script within the resource with given URL.","type":"integer"},{"name":"endLine","description":"Last line of the script.","type":"integer"},{"name":"endColumn","description":"Length of the last line of the script.","type":"integer"},{"name":"executionContextId","description":"Specifies script creation context.","$ref":"Runtime.ExecutionContextId"},{"name":"hash","description":"Content hash of the script.","type":"string"},{"name":"executionContextAuxData","description":"Embedder-specific auxiliary data.","optional":true,"type":"object"},{"name":"isLiveEdit","description":"True, if this script is generated as a result of the live edit operation.","experimental":true,"optional":true,"type":"boolean"},{"name":"sourceMapURL","description":"URL of source map associated with script (if any).","optional":true,"type":"string"},{"name":"hasSourceURL","description":"True, if this script has sourceURL.","optional":true,"type":"boolean"},{"name":"isModule","description":"True, if this script is ES6 module.","optional":true,"type":"boolean"},{"name":"length","description":"This script length.","optional":true,"type":"integer"},{"name":"stackTrace","description":"JavaScript top stack frame of where the script parsed event was triggered if available.","experimental":true,"optional":true,"$ref":"Runtime.StackTrace"}]}]},{"domain":"HeapProfiler","experimental":true,"dependencies":["Runtime"],"types":[{"id":"HeapSnapshotObjectId","description":"Heap snapshot object id.","type":"string"},{"id":"SamplingHeapProfileNode","description":"Sampling Heap Profile node. Holds callsite information, allocation statistics and child nodes.","type":"object","properties":[{"name":"callFrame","description":"Function location.","$ref":"Runtime.CallFrame"},{"name":"selfSize","description":"Allocations size in bytes for the node excluding children.","type":"number"},{"name":"children","description":"Child nodes.","type":"array","items":{"$ref":"SamplingHeapProfileNode"}}]},{"id":"SamplingHeapProfile","description":"Profile.","type":"object","properties":[{"name":"head","$ref":"SamplingHeapProfileNode"}]}],"commands":[{"name":"addInspectedHeapObject","description":"Enables console to refer to the node with given id via $x (see Command Line API for more details\n$x functions).","parameters":[{"name":"heapObjectId","description":"Heap snapshot object id to be accessible by means of $x command line API.","$ref":"HeapSnapshotObjectId"}]},{"name":"collectGarbage"},{"name":"disable"},{"name":"enable"},{"name":"getHeapObjectId","parameters":[{"name":"objectId","description":"Identifier of the object to get heap object id for.","$ref":"Runtime.RemoteObjectId"}],"returns":[{"name":"heapSnapshotObjectId","description":"Id of the heap snapshot object corresponding to the passed remote object id.","$ref":"HeapSnapshotObjectId"}]},{"name":"getObjectByHeapObjectId","parameters":[{"name":"objectId","$ref":"HeapSnapshotObjectId"},{"name":"objectGroup","description":"Symbolic group name that can be used to release multiple objects.","optional":true,"type":"string"}],"returns":[{"name":"result","description":"Evaluation result.","$ref":"Runtime.RemoteObject"}]},{"name":"getSamplingProfile","returns":[{"name":"profile","description":"Return the sampling profile being collected.","$ref":"SamplingHeapProfile"}]},{"name":"startSampling","parameters":[{"name":"samplingInterval","description":"Average sample interval in bytes. Poisson distribution is used for the intervals. The\ndefault value is 32768 bytes.","optional":true,"type":"number"}]},{"name":"startTrackingHeapObjects","parameters":[{"name":"trackAllocations","optional":true,"type":"boolean"}]},{"name":"stopSampling","returns":[{"name":"profile","description":"Recorded sampling heap profile.","$ref":"SamplingHeapProfile"}]},{"name":"stopTrackingHeapObjects","parameters":[{"name":"reportProgress","description":"If true 'reportHeapSnapshotProgress' events will be generated while snapshot is being taken\nwhen the tracking is stopped.","optional":true,"type":"boolean"}]},{"name":"takeHeapSnapshot","parameters":[{"name":"reportProgress","description":"If true 'reportHeapSnapshotProgress' events will be generated while snapshot is being taken.","optional":true,"type":"boolean"}]}],"events":[{"name":"addHeapSnapshotChunk","parameters":[{"name":"chunk","type":"string"}]},{"name":"heapStatsUpdate","description":"If heap objects tracking has been started then backend may send update for one or more fragments","parameters":[{"name":"statsUpdate","description":"An array of triplets. Each triplet describes a fragment. The first integer is the fragment\nindex, the second integer is a total count of objects for the fragment, the third integer is\na total size of the objects for the fragment.","type":"array","items":{"type":"integer"}}]},{"name":"lastSeenObjectId","description":"If heap objects tracking has been started then backend regularly sends a current value for last\nseen object id and corresponding timestamp. If the were changes in the heap since last event\nthen one or more heapStatsUpdate events will be sent before a new lastSeenObjectId event.","parameters":[{"name":"lastSeenObjectId","type":"integer"},{"name":"timestamp","type":"number"}]},{"name":"reportHeapSnapshotProgress","parameters":[{"name":"done","type":"integer"},{"name":"total","type":"integer"},{"name":"finished","optional":true,"type":"boolean"}]},{"name":"resetProfiles"}]},{"domain":"Profiler","dependencies":["Runtime","Debugger"],"types":[{"id":"ProfileNode","description":"Profile node. Holds callsite information, execution statistics and child nodes.","type":"object","properties":[{"name":"id","description":"Unique id of the node.","type":"integer"},{"name":"callFrame","description":"Function location.","$ref":"Runtime.CallFrame"},{"name":"hitCount","description":"Number of samples where this node was on top of the call stack.","optional":true,"type":"integer"},{"name":"children","description":"Child node ids.","optional":true,"type":"array","items":{"type":"integer"}},{"name":"deoptReason","description":"The reason of being not optimized. The function may be deoptimized or marked as don't\noptimize.","optional":true,"type":"string"},{"name":"positionTicks","description":"An array of source position ticks.","optional":true,"type":"array","items":{"$ref":"PositionTickInfo"}}]},{"id":"Profile","description":"Profile.","type":"object","properties":[{"name":"nodes","description":"The list of profile nodes. First item is the root node.","type":"array","items":{"$ref":"ProfileNode"}},{"name":"startTime","description":"Profiling start timestamp in microseconds.","type":"number"},{"name":"endTime","description":"Profiling end timestamp in microseconds.","type":"number"},{"name":"samples","description":"Ids of samples top nodes.","optional":true,"type":"array","items":{"type":"integer"}},{"name":"timeDeltas","description":"Time intervals between adjacent samples in microseconds. The first delta is relative to the\nprofile startTime.","optional":true,"type":"array","items":{"type":"integer"}}]},{"id":"PositionTickInfo","description":"Specifies a number of samples attributed to a certain source position.","type":"object","properties":[{"name":"line","description":"Source line number (1-based).","type":"integer"},{"name":"ticks","description":"Number of samples attributed to the source line.","type":"integer"}]},{"id":"CoverageRange","description":"Coverage data for a source range.","type":"object","properties":[{"name":"startOffset","description":"JavaScript script source offset for the range start.","type":"integer"},{"name":"endOffset","description":"JavaScript script source offset for the range end.","type":"integer"},{"name":"count","description":"Collected execution count of the source range.","type":"integer"}]},{"id":"FunctionCoverage","description":"Coverage data for a JavaScript function.","type":"object","properties":[{"name":"functionName","description":"JavaScript function name.","type":"string"},{"name":"ranges","description":"Source ranges inside the function with coverage data.","type":"array","items":{"$ref":"CoverageRange"}},{"name":"isBlockCoverage","description":"Whether coverage data for this function has block granularity.","type":"boolean"}]},{"id":"ScriptCoverage","description":"Coverage data for a JavaScript script.","type":"object","properties":[{"name":"scriptId","description":"JavaScript script id.","$ref":"Runtime.ScriptId"},{"name":"url","description":"JavaScript script name or url.","type":"string"},{"name":"functions","description":"Functions contained in the script that has coverage data.","type":"array","items":{"$ref":"FunctionCoverage"}}]},{"id":"TypeObject","description":"Describes a type collected during runtime.","experimental":true,"type":"object","properties":[{"name":"name","description":"Name of a type collected with type profiling.","type":"string"}]},{"id":"TypeProfileEntry","description":"Source offset and types for a parameter or return value.","experimental":true,"type":"object","properties":[{"name":"offset","description":"Source offset of the parameter or end of function for return values.","type":"integer"},{"name":"types","description":"The types for this parameter or return value.","type":"array","items":{"$ref":"TypeObject"}}]},{"id":"ScriptTypeProfile","description":"Type profile data collected during runtime for a JavaScript script.","experimental":true,"type":"object","properties":[{"name":"scriptId","description":"JavaScript script id.","$ref":"Runtime.ScriptId"},{"name":"url","description":"JavaScript script name or url.","type":"string"},{"name":"entries","description":"Type profile entries for parameters and return values of the functions in the script.","type":"array","items":{"$ref":"TypeProfileEntry"}}]}],"commands":[{"name":"disable"},{"name":"enable"},{"name":"getBestEffortCoverage","description":"Collect coverage data for the current isolate. The coverage data may be incomplete due to\ngarbage collection.","returns":[{"name":"result","description":"Coverage data for the current isolate.","type":"array","items":{"$ref":"ScriptCoverage"}}]},{"name":"setSamplingInterval","description":"Changes CPU profiler sampling interval. Must be called before CPU profiles recording started.","parameters":[{"name":"interval","description":"New sampling interval in microseconds.","type":"integer"}]},{"name":"start"},{"name":"startPreciseCoverage","description":"Enable precise code coverage. Coverage data for JavaScript executed before enabling precise code\ncoverage may be incomplete. Enabling prevents running optimized code and resets execution\ncounters.","parameters":[{"name":"callCount","description":"Collect accurate call counts beyond simple 'covered' or 'not covered'.","optional":true,"type":"boolean"},{"name":"detailed","description":"Collect block-based coverage.","optional":true,"type":"boolean"}]},{"name":"startTypeProfile","description":"Enable type profile.","experimental":true},{"name":"stop","returns":[{"name":"profile","description":"Recorded profile.","$ref":"Profile"}]},{"name":"stopPreciseCoverage","description":"Disable precise code coverage. Disabling releases unnecessary execution count records and allows\nexecuting optimized code."},{"name":"stopTypeProfile","description":"Disable type profile. Disabling releases type profile data collected so far.","experimental":true},{"name":"takePreciseCoverage","description":"Collect coverage data for the current isolate, and resets execution counters. Precise code\ncoverage needs to have started.","returns":[{"name":"result","description":"Coverage data for the current isolate.","type":"array","items":{"$ref":"ScriptCoverage"}}]},{"name":"takeTypeProfile","description":"Collect type profile.","experimental":true,"returns":[{"name":"result","description":"Type profile for all scripts since startTypeProfile() was turned on.","type":"array","items":{"$ref":"ScriptTypeProfile"}}]}],"events":[{"name":"consoleProfileFinished","parameters":[{"name":"id","type":"string"},{"name":"location","description":"Location of console.profileEnd().","$ref":"Debugger.Location"},{"name":"profile","$ref":"Profile"},{"name":"title","description":"Profile title passed as an argument to console.profile().","optional":true,"type":"string"}]},{"name":"consoleProfileStarted","description":"Sent when new profile recording is started using console.profile() call.","parameters":[{"name":"id","type":"string"},{"name":"location","description":"Location of console.profile().","$ref":"Debugger.Location"},{"name":"title","description":"Profile title passed as an argument to console.profile().","optional":true,"type":"string"}]}]},{"domain":"Runtime","description":"Runtime domain exposes JavaScript runtime by means of remote evaluation and mirror objects.\nEvaluation results are returned as mirror object that expose object type, string representation\nand unique identifier that can be used for further object reference. Original objects are\nmaintained in memory unless they are either explicitly released or are released along with the\nother objects in their object group.","types":[{"id":"ScriptId","description":"Unique script identifier.","type":"string"},{"id":"RemoteObjectId","description":"Unique object identifier.","type":"string"},{"id":"UnserializableValue","description":"Primitive value which cannot be JSON-stringified. Includes values `-0`, `NaN`, `Infinity`,\n`-Infinity`, and bigint literals.","type":"string"},{"id":"RemoteObject","description":"Mirror object referencing original JavaScript object.","type":"object","properties":[{"name":"type","description":"Object type.","type":"string","enum":["object","function","undefined","string","number","boolean","symbol","bigint"]},{"name":"subtype","description":"Object subtype hint. Specified for `object` type values only.","optional":true,"type":"string","enum":["array","null","node","regexp","date","map","set","weakmap","weakset","iterator","generator","error","proxy","promise","typedarray"]},{"name":"className","description":"Object class (constructor) name. Specified for `object` type values only.","optional":true,"type":"string"},{"name":"value","description":"Remote object value in case of primitive values or JSON values (if it was requested).","optional":true,"type":"any"},{"name":"unserializableValue","description":"Primitive value which can not be JSON-stringified does not have `value`, but gets this\nproperty.","optional":true,"$ref":"UnserializableValue"},{"name":"description","description":"String representation of the object.","optional":true,"type":"string"},{"name":"objectId","description":"Unique object identifier (for non-primitive values).","optional":true,"$ref":"RemoteObjectId"},{"name":"preview","description":"Preview containing abbreviated property values. Specified for `object` type values only.","experimental":true,"optional":true,"$ref":"ObjectPreview"},{"name":"customPreview","experimental":true,"optional":true,"$ref":"CustomPreview"}]},{"id":"CustomPreview","experimental":true,"type":"object","properties":[{"name":"header","type":"string"},{"name":"hasBody","type":"boolean"},{"name":"formatterObjectId","$ref":"RemoteObjectId"},{"name":"bindRemoteObjectFunctionId","$ref":"RemoteObjectId"},{"name":"configObjectId","optional":true,"$ref":"RemoteObjectId"}]},{"id":"ObjectPreview","description":"Object containing abbreviated remote object value.","experimental":true,"type":"object","properties":[{"name":"type","description":"Object type.","type":"string","enum":["object","function","undefined","string","number","boolean","symbol","bigint"]},{"name":"subtype","description":"Object subtype hint. Specified for `object` type values only.","optional":true,"type":"string","enum":["array","null","node","regexp","date","map","set","weakmap","weakset","iterator","generator","error"]},{"name":"description","description":"String representation of the object.","optional":true,"type":"string"},{"name":"overflow","description":"True iff some of the properties or entries of the original object did not fit.","type":"boolean"},{"name":"properties","description":"List of the properties.","type":"array","items":{"$ref":"PropertyPreview"}},{"name":"entries","description":"List of the entries. Specified for `map` and `set` subtype values only.","optional":true,"type":"array","items":{"$ref":"EntryPreview"}}]},{"id":"PropertyPreview","experimental":true,"type":"object","properties":[{"name":"name","description":"Property name.","type":"string"},{"name":"type","description":"Object type. Accessor means that the property itself is an accessor property.","type":"string","enum":["object","function","undefined","string","number","boolean","symbol","accessor","bigint"]},{"name":"value","description":"User-friendly property value string.","optional":true,"type":"string"},{"name":"valuePreview","description":"Nested value preview.","optional":true,"$ref":"ObjectPreview"},{"name":"subtype","description":"Object subtype hint. Specified for `object` type values only.","optional":true,"type":"string","enum":["array","null","node","regexp","date","map","set","weakmap","weakset","iterator","generator","error"]}]},{"id":"EntryPreview","experimental":true,"type":"object","properties":[{"name":"key","description":"Preview of the key. Specified for map-like collection entries.","optional":true,"$ref":"ObjectPreview"},{"name":"value","description":"Preview of the value.","$ref":"ObjectPreview"}]},{"id":"PropertyDescriptor","description":"Object property descriptor.","type":"object","properties":[{"name":"name","description":"Property name or symbol description.","type":"string"},{"name":"value","description":"The value associated with the property.","optional":true,"$ref":"RemoteObject"},{"name":"writable","description":"True if the value associated with the property may be changed (data descriptors only).","optional":true,"type":"boolean"},{"name":"get","description":"A function which serves as a getter for the property, or `undefined` if there is no getter\n(accessor descriptors only).","optional":true,"$ref":"RemoteObject"},{"name":"set","description":"A function which serves as a setter for the property, or `undefined` if there is no setter\n(accessor descriptors only).","optional":true,"$ref":"RemoteObject"},{"name":"configurable","description":"True if the type of this property descriptor may be changed and if the property may be\ndeleted from the corresponding object.","type":"boolean"},{"name":"enumerable","description":"True if this property shows up during enumeration of the properties on the corresponding\nobject.","type":"boolean"},{"name":"wasThrown","description":"True if the result was thrown during the evaluation.","optional":true,"type":"boolean"},{"name":"isOwn","description":"True if the property is owned for the object.","optional":true,"type":"boolean"},{"name":"symbol","description":"Property symbol object, if the property is of the `symbol` type.","optional":true,"$ref":"RemoteObject"}]},{"id":"InternalPropertyDescriptor","description":"Object internal property descriptor. This property isn't normally visible in JavaScript code.","type":"object","properties":[{"name":"name","description":"Conventional property name.","type":"string"},{"name":"value","description":"The value associated with the property.","optional":true,"$ref":"RemoteObject"}]},{"id":"CallArgument","description":"Represents function call argument. Either remote object id `objectId`, primitive `value`,\nunserializable primitive value or neither of (for undefined) them should be specified.","type":"object","properties":[{"name":"value","description":"Primitive value or serializable javascript object.","optional":true,"type":"any"},{"name":"unserializableValue","description":"Primitive value which can not be JSON-stringified.","optional":true,"$ref":"UnserializableValue"},{"name":"objectId","description":"Remote object handle.","optional":true,"$ref":"RemoteObjectId"}]},{"id":"ExecutionContextId","description":"Id of an execution context.","type":"integer"},{"id":"ExecutionContextDescription","description":"Description of an isolated world.","type":"object","properties":[{"name":"id","description":"Unique id of the execution context. It can be used to specify in which execution context\nscript evaluation should be performed.","$ref":"ExecutionContextId"},{"name":"origin","description":"Execution context origin.","type":"string"},{"name":"name","description":"Human readable name describing given context.","type":"string"},{"name":"auxData","description":"Embedder-specific auxiliary data.","optional":true,"type":"object"}]},{"id":"ExceptionDetails","description":"Detailed information about exception (or error) that was thrown during script compilation or\nexecution.","type":"object","properties":[{"name":"exceptionId","description":"Exception id.","type":"integer"},{"name":"text","description":"Exception text, which should be used together with exception object when available.","type":"string"},{"name":"lineNumber","description":"Line number of the exception location (0-based).","type":"integer"},{"name":"columnNumber","description":"Column number of the exception location (0-based).","type":"integer"},{"name":"scriptId","description":"Script ID of the exception location.","optional":true,"$ref":"ScriptId"},{"name":"url","description":"URL of the exception location, to be used when the script was not reported.","optional":true,"type":"string"},{"name":"stackTrace","description":"JavaScript stack trace if available.","optional":true,"$ref":"StackTrace"},{"name":"exception","description":"Exception object if available.","optional":true,"$ref":"RemoteObject"},{"name":"executionContextId","description":"Identifier of the context where exception happened.","optional":true,"$ref":"ExecutionContextId"}]},{"id":"Timestamp","description":"Number of milliseconds since epoch.","type":"number"},{"id":"TimeDelta","description":"Number of milliseconds.","type":"number"},{"id":"CallFrame","description":"Stack entry for runtime errors and assertions.","type":"object","properties":[{"name":"functionName","description":"JavaScript function name.","type":"string"},{"name":"scriptId","description":"JavaScript script id.","$ref":"ScriptId"},{"name":"url","description":"JavaScript script name or url.","type":"string"},{"name":"lineNumber","description":"JavaScript script line number (0-based).","type":"integer"},{"name":"columnNumber","description":"JavaScript script column number (0-based).","type":"integer"}]},{"id":"StackTrace","description":"Call frames for assertions or error messages.","type":"object","properties":[{"name":"description","description":"String label of this stack trace. For async traces this may be a name of the function that\ninitiated the async call.","optional":true,"type":"string"},{"name":"callFrames","description":"JavaScript function name.","type":"array","items":{"$ref":"CallFrame"}},{"name":"parent","description":"Asynchronous JavaScript stack trace that preceded this stack, if available.","optional":true,"$ref":"StackTrace"},{"name":"parentId","description":"Asynchronous JavaScript stack trace that preceded this stack, if available.","experimental":true,"optional":true,"$ref":"StackTraceId"}]},{"id":"UniqueDebuggerId","description":"Unique identifier of current debugger.","experimental":true,"type":"string"},{"id":"StackTraceId","description":"If `debuggerId` is set stack trace comes from another debugger and can be resolved there. This\nallows to track cross-debugger calls. See `Runtime.StackTrace` and `Debugger.paused` for usages.","experimental":true,"type":"object","properties":[{"name":"id","type":"string"},{"name":"debuggerId","optional":true,"$ref":"UniqueDebuggerId"}]}],"commands":[{"name":"awaitPromise","description":"Add handler to promise with given promise object id.","parameters":[{"name":"promiseObjectId","description":"Identifier of the promise.","$ref":"RemoteObjectId"},{"name":"returnByValue","description":"Whether the result is expected to be a JSON object that should be sent by value.","optional":true,"type":"boolean"},{"name":"generatePreview","description":"Whether preview should be generated for the result.","optional":true,"type":"boolean"}],"returns":[{"name":"result","description":"Promise result. Will contain rejected value if promise was rejected.","$ref":"RemoteObject"},{"name":"exceptionDetails","description":"Exception details if stack strace is available.","optional":true,"$ref":"ExceptionDetails"}]},{"name":"callFunctionOn","description":"Calls function with given declaration on the given object. Object group of the result is\ninherited from the target object.","parameters":[{"name":"functionDeclaration","description":"Declaration of the function to call.","type":"string"},{"name":"objectId","description":"Identifier of the object to call function on. Either objectId or executionContextId should\nbe specified.","optional":true,"$ref":"RemoteObjectId"},{"name":"arguments","description":"Call arguments. All call arguments must belong to the same JavaScript world as the target\nobject.","optional":true,"type":"array","items":{"$ref":"CallArgument"}},{"name":"silent","description":"In silent mode exceptions thrown during evaluation are not reported and do not pause\nexecution. Overrides `setPauseOnException` state.","optional":true,"type":"boolean"},{"name":"returnByValue","description":"Whether the result is expected to be a JSON object which should be sent by value.","optional":true,"type":"boolean"},{"name":"generatePreview","description":"Whether preview should be generated for the result.","experimental":true,"optional":true,"type":"boolean"},{"name":"userGesture","description":"Whether execution should be treated as initiated by user in the UI.","optional":true,"type":"boolean"},{"name":"awaitPromise","description":"Whether execution should `await` for resulting value and return once awaited promise is\nresolved.","optional":true,"type":"boolean"},{"name":"executionContextId","description":"Specifies execution context which global object will be used to call function on. Either\nexecutionContextId or objectId should be specified.","optional":true,"$ref":"ExecutionContextId"},{"name":"objectGroup","description":"Symbolic group name that can be used to release multiple objects. If objectGroup is not\nspecified and objectId is, objectGroup will be inherited from object.","optional":true,"type":"string"}],"returns":[{"name":"result","description":"Call result.","$ref":"RemoteObject"},{"name":"exceptionDetails","description":"Exception details.","optional":true,"$ref":"ExceptionDetails"}]},{"name":"compileScript","description":"Compiles expression.","parameters":[{"name":"expression","description":"Expression to compile.","type":"string"},{"name":"sourceURL","description":"Source url to be set for the script.","type":"string"},{"name":"persistScript","description":"Specifies whether the compiled script should be persisted.","type":"boolean"},{"name":"executionContextId","description":"Specifies in which execution context to perform script run. If the parameter is omitted the\nevaluation will be performed in the context of the inspected page.","optional":true,"$ref":"ExecutionContextId"}],"returns":[{"name":"scriptId","description":"Id of the script.","optional":true,"$ref":"ScriptId"},{"name":"exceptionDetails","description":"Exception details.","optional":true,"$ref":"ExceptionDetails"}]},{"name":"disable","description":"Disables reporting of execution contexts creation."},{"name":"discardConsoleEntries","description":"Discards collected exceptions and console API calls."},{"name":"enable","description":"Enables reporting of execution contexts creation by means of `executionContextCreated` event.\nWhen the reporting gets enabled the event will be sent immediately for each existing execution\ncontext."},{"name":"evaluate","description":"Evaluates expression on global object.","parameters":[{"name":"expression","description":"Expression to evaluate.","type":"string"},{"name":"objectGroup","description":"Symbolic group name that can be used to release multiple objects.","optional":true,"type":"string"},{"name":"includeCommandLineAPI","description":"Determines whether Command Line API should be available during the evaluation.","optional":true,"type":"boolean"},{"name":"silent","description":"In silent mode exceptions thrown during evaluation are not reported and do not pause\nexecution. Overrides `setPauseOnException` state.","optional":true,"type":"boolean"},{"name":"contextId","description":"Specifies in which execution context to perform evaluation. If the parameter is omitted the\nevaluation will be performed in the context of the inspected page.","optional":true,"$ref":"ExecutionContextId"},{"name":"returnByValue","description":"Whether the result is expected to be a JSON object that should be sent by value.","optional":true,"type":"boolean"},{"name":"generatePreview","description":"Whether preview should be generated for the result.","experimental":true,"optional":true,"type":"boolean"},{"name":"userGesture","description":"Whether execution should be treated as initiated by user in the UI.","optional":true,"type":"boolean"},{"name":"awaitPromise","description":"Whether execution should `await` for resulting value and return once awaited promise is\nresolved.","optional":true,"type":"boolean"},{"name":"throwOnSideEffect","description":"Whether to throw an exception if side effect cannot be ruled out during evaluation.","experimental":true,"optional":true,"type":"boolean"},{"name":"timeout","description":"Terminate execution after timing out (number of milliseconds).","experimental":true,"optional":true,"$ref":"TimeDelta"}],"returns":[{"name":"result","description":"Evaluation result.","$ref":"RemoteObject"},{"name":"exceptionDetails","description":"Exception details.","optional":true,"$ref":"ExceptionDetails"}]},{"name":"getIsolateId","description":"Returns the isolate id.","experimental":true,"returns":[{"name":"id","description":"The isolate id.","type":"string"}]},{"name":"getHeapUsage","description":"Returns the JavaScript heap usage.\nIt is the total usage of the corresponding isolate not scoped to a particular Runtime.","experimental":true,"returns":[{"name":"usedSize","description":"Used heap size in bytes.","type":"number"},{"name":"totalSize","description":"Allocated heap size in bytes.","type":"number"}]},{"name":"getProperties","description":"Returns properties of a given object. Object group of the result is inherited from the target\nobject.","parameters":[{"name":"objectId","description":"Identifier of the object to return properties for.","$ref":"RemoteObjectId"},{"name":"ownProperties","description":"If true, returns properties belonging only to the element itself, not to its prototype\nchain.","optional":true,"type":"boolean"},{"name":"accessorPropertiesOnly","description":"If true, returns accessor properties (with getter/setter) only; internal properties are not\nreturned either.","experimental":true,"optional":true,"type":"boolean"},{"name":"generatePreview","description":"Whether preview should be generated for the results.","experimental":true,"optional":true,"type":"boolean"}],"returns":[{"name":"result","description":"Object properties.","type":"array","items":{"$ref":"PropertyDescriptor"}},{"name":"internalProperties","description":"Internal object properties (only of the element itself).","optional":true,"type":"array","items":{"$ref":"InternalPropertyDescriptor"}},{"name":"exceptionDetails","description":"Exception details.","optional":true,"$ref":"ExceptionDetails"}]},{"name":"globalLexicalScopeNames","description":"Returns all let, const and class variables from global scope.","parameters":[{"name":"executionContextId","description":"Specifies in which execution context to lookup global scope variables.","optional":true,"$ref":"ExecutionContextId"}],"returns":[{"name":"names","type":"array","items":{"type":"string"}}]},{"name":"queryObjects","parameters":[{"name":"prototypeObjectId","description":"Identifier of the prototype to return objects for.","$ref":"RemoteObjectId"},{"name":"objectGroup","description":"Symbolic group name that can be used to release the results.","optional":true,"type":"string"}],"returns":[{"name":"objects","description":"Array with objects.","$ref":"RemoteObject"}]},{"name":"releaseObject","description":"Releases remote object with given id.","parameters":[{"name":"objectId","description":"Identifier of the object to release.","$ref":"RemoteObjectId"}]},{"name":"releaseObjectGroup","description":"Releases all remote objects that belong to a given group.","parameters":[{"name":"objectGroup","description":"Symbolic object group name.","type":"string"}]},{"name":"runIfWaitingForDebugger","description":"Tells inspected instance to run if it was waiting for debugger to attach."},{"name":"runScript","description":"Runs script with given id in a given context.","parameters":[{"name":"scriptId","description":"Id of the script to run.","$ref":"ScriptId"},{"name":"executionContextId","description":"Specifies in which execution context to perform script run. If the parameter is omitted the\nevaluation will be performed in the context of the inspected page.","optional":true,"$ref":"ExecutionContextId"},{"name":"objectGroup","description":"Symbolic group name that can be used to release multiple objects.","optional":true,"type":"string"},{"name":"silent","description":"In silent mode exceptions thrown during evaluation are not reported and do not pause\nexecution. Overrides `setPauseOnException` state.","optional":true,"type":"boolean"},{"name":"includeCommandLineAPI","description":"Determines whether Command Line API should be available during the evaluation.","optional":true,"type":"boolean"},{"name":"returnByValue","description":"Whether the result is expected to be a JSON object which should be sent by value.","optional":true,"type":"boolean"},{"name":"generatePreview","description":"Whether preview should be generated for the result.","optional":true,"type":"boolean"},{"name":"awaitPromise","description":"Whether execution should `await` for resulting value and return once awaited promise is\nresolved.","optional":true,"type":"boolean"}],"returns":[{"name":"result","description":"Run result.","$ref":"RemoteObject"},{"name":"exceptionDetails","description":"Exception details.","optional":true,"$ref":"ExceptionDetails"}]},{"name":"setAsyncCallStackDepth","description":"Enables or disables async call stacks tracking.","redirect":"Debugger","parameters":[{"name":"maxDepth","description":"Maximum depth of async call stacks. Setting to `0` will effectively disable collecting async\ncall stacks (default).","type":"integer"}]},{"name":"setCustomObjectFormatterEnabled","experimental":true,"parameters":[{"name":"enabled","type":"boolean"}]},{"name":"setMaxCallStackSizeToCapture","experimental":true,"parameters":[{"name":"size","type":"integer"}]},{"name":"terminateExecution","description":"Terminate current or next JavaScript execution.\nWill cancel the termination when the outer-most script execution ends.","experimental":true},{"name":"addBinding","description":"If executionContextId is empty, adds binding with the given name on the\nglobal objects of all inspected contexts, including those created later,\nbindings survive reloads.\nIf executionContextId is specified, adds binding only on global object of\ngiven execution context.\nBinding function takes exactly one argument, this argument should be string,\nin case of any other input, function throws an exception.\nEach binding function call produces Runtime.bindingCalled notification.","experimental":true,"parameters":[{"name":"name","type":"string"},{"name":"executionContextId","optional":true,"$ref":"ExecutionContextId"}]},{"name":"removeBinding","description":"This method does not remove binding function from global object but\nunsubscribes current runtime agent from Runtime.bindingCalled notifications.","experimental":true,"parameters":[{"name":"name","type":"string"}]}],"events":[{"name":"bindingCalled","description":"Notification is issued every time when binding is called.","experimental":true,"parameters":[{"name":"name","type":"string"},{"name":"payload","type":"string"},{"name":"executionContextId","description":"Identifier of the context where the call was made.","$ref":"ExecutionContextId"}]},{"name":"consoleAPICalled","description":"Issued when console API was called.","parameters":[{"name":"type","description":"Type of the call.","type":"string","enum":["log","debug","info","error","warning","dir","dirxml","table","trace","clear","startGroup","startGroupCollapsed","endGroup","assert","profile","profileEnd","count","timeEnd"]},{"name":"args","description":"Call arguments.","type":"array","items":{"$ref":"RemoteObject"}},{"name":"executionContextId","description":"Identifier of the context where the call was made.","$ref":"ExecutionContextId"},{"name":"timestamp","description":"Call timestamp.","$ref":"Timestamp"},{"name":"stackTrace","description":"Stack trace captured when the call was made.","optional":true,"$ref":"StackTrace"},{"name":"context","description":"Console context descriptor for calls on non-default console context (not console.*):\n'anonymous#unique-logger-id' for call on unnamed context, 'name#unique-logger-id' for call\non named context.","experimental":true,"optional":true,"type":"string"}]},{"name":"exceptionRevoked","description":"Issued when unhandled exception was revoked.","parameters":[{"name":"reason","description":"Reason describing why exception was revoked.","type":"string"},{"name":"exceptionId","description":"The id of revoked exception, as reported in `exceptionThrown`.","type":"integer"}]},{"name":"exceptionThrown","description":"Issued when exception was thrown and unhandled.","parameters":[{"name":"timestamp","description":"Timestamp of the exception.","$ref":"Timestamp"},{"name":"exceptionDetails","$ref":"ExceptionDetails"}]},{"name":"executionContextCreated","description":"Issued when new execution context is created.","parameters":[{"name":"context","description":"A newly created execution context.","$ref":"ExecutionContextDescription"}]},{"name":"executionContextDestroyed","description":"Issued when execution context is destroyed.","parameters":[{"name":"executionContextId","description":"Id of the destroyed context","$ref":"ExecutionContextId"}]},{"name":"executionContextsCleared","description":"Issued when all executionContexts were cleared in browser"},{"name":"inspectRequested","description":"Issued when object should be inspected (for example, as a result of inspect() command line API\ncall).","parameters":[{"name":"object","$ref":"RemoteObject"},{"name":"hints","type":"object"}]}]},{"domain":"Schema","description":"This domain is deprecated.","deprecated":true,"types":[{"id":"Domain","description":"Description of the protocol domain.","type":"object","properties":[{"name":"name","description":"Domain name.","type":"string"},{"name":"version","description":"Domain version.","type":"string"}]}],"commands":[{"name":"getDomains","description":"Returns supported domains.","returns":[{"name":"domains","description":"List of supported domains.","type":"array","items":{"$ref":"Domain"}}]}]}]};

/***/ }),

/***/ "./lib/vscode/node_modules/ultron/index.js":
/*!*************************************************!*\
  !*** ./lib/vscode/node_modules/ultron/index.js ***!
  \*************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var has = Object.prototype.hasOwnProperty;

/**
 * An auto incrementing id which we can use to create "unique" Ultron instances
 * so we can track the event emitters that are added through the Ultron
 * interface.
 *
 * @type {Number}
 * @private
 */
var id = 0;

/**
 * Ultron is high-intelligence robot. It gathers intelligence so it can start improving
 * upon his rudimentary design. It will learn from your EventEmitting patterns
 * and exterminate them.
 *
 * @constructor
 * @param {EventEmitter} ee EventEmitter instance we need to wrap.
 * @api public
 */
function Ultron(ee) {
  if (!(this instanceof Ultron)) return new Ultron(ee);

  this.id = id++;
  this.ee = ee;
}

/**
 * Register a new EventListener for the given event.
 *
 * @param {String} event Name of the event.
 * @param {Functon} fn Callback function.
 * @param {Mixed} context The context of the function.
 * @returns {Ultron}
 * @api public
 */
Ultron.prototype.on = function on(event, fn, context) {
  fn.__ultron = this.id;
  this.ee.on(event, fn, context);

  return this;
};
/**
 * Add an EventListener that's only called once.
 *
 * @param {String} event Name of the event.
 * @param {Function} fn Callback function.
 * @param {Mixed} context The context of the function.
 * @returns {Ultron}
 * @api public
 */
Ultron.prototype.once = function once(event, fn, context) {
  fn.__ultron = this.id;
  this.ee.once(event, fn, context);

  return this;
};

/**
 * Remove the listeners we assigned for the given event.
 *
 * @returns {Ultron}
 * @api public
 */
Ultron.prototype.remove = function remove() {
  var args = arguments
    , ee = this.ee
    , event;

  //
  // When no event names are provided we assume that we need to clear all the
  // events that were assigned through us.
  //
  if (args.length === 1 && 'string' === typeof args[0]) {
    args = args[0].split(/[, ]+/);
  } else if (!args.length) {
    if (ee.eventNames) {
      args = ee.eventNames();
    } else if (ee._events) {
      args = [];

      for (event in ee._events) {
        if (has.call(ee._events, event)) args.push(event);
      }

      if (Object.getOwnPropertySymbols) {
        args = args.concat(Object.getOwnPropertySymbols(ee._events));
      }
    }
  }

  for (var i = 0; i < args.length; i++) {
    var listeners = ee.listeners(args[i]);

    for (var j = 0; j < listeners.length; j++) {
      event = listeners[j];

      //
      // Once listeners have a `listener` property that stores the real listener
      // in the EventEmitter that ships with Node.js.
      //
      if (event.listener) {
        if (event.listener.__ultron !== this.id) continue;
      } else if (event.__ultron !== this.id) {
        continue;
      }

      ee.removeListener(args[i], event);
    }
  }

  return this;
};

/**
 * Destroy the Ultron instance, remove all listeners and release all references.
 *
 * @returns {Boolean}
 * @api public
 */
Ultron.prototype.destroy = function destroy() {
  if (!this.ee) return false;

  this.remove();
  this.ee = null;

  return true;
};

//
// Expose the module.
//
module.exports = Ultron;


/***/ }),

/***/ "./lib/vscode/node_modules/v8-inspect-profiler/index.js":
/*!**************************************************************!*\
  !*** ./lib/vscode/node_modules/v8-inspect-profiler/index.js ***!
  \**************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

const { join, isAbsolute, basename } = __webpack_require__(/*! path */ "path");
const { writeFile } = __webpack_require__(/*! fs */ "fs");
const cdp = __webpack_require__(/*! chrome-remote-interface */ "./lib/vscode/node_modules/chrome-remote-interface/index.js");

async function wait(n) {
    return new Promise(resolve => setTimeout(resolve, n));
}

async function connectWithRetry(port, tries = 10, retryWait = 50, errors = [], target) {
    if (typeof target === 'undefined') {
        target = function (targets) {
            const target = targets.find(target => {
                if (target.webSocketDebuggerUrl) {
                    if (target.type === 'page') {
                        return target.url.indexOf('bootstrap/index.html') > 0
                    } else {
                        return true;
                    }
                }
            });
            if (!target) {
                throw new class extends Error {
                    constructor() {
                        super('no target');
                        this.code = 'ECONNREFUSED';
                    }
                };
            }
            return target;
        };
    }

    try {
        return await cdp({
            port,
            target,
            local: true,
        });
    } catch (e) {
        errors.push(e);
        if (tries <= 1) {
            throw new class extends Error {
                constructor() {
                    super('failed to connect');
                    this.errors = errors;
                }
            }
        }
        await wait(retryWait);
        return connectWithRetry(port, tries - 1, retryWait, errors, target);
    }
}

async function startProfiling(options) {

    const client = await connectWithRetry(options.port, options.tries, options.retryWait, [], options.target);
    const { Runtime, Profiler } = client;

    if (options.checkForPaused) {
        // ensure the runtime isn't being debugged
        let { Debugger } = client;
        let isPaused = false;
        client.on('event', message => {
            if (message.method === 'Debugger.paused') {
                isPaused = true;
            }
        })
        await Debugger.enable();
        if (isPaused) {
            // client.close();
            // ⬆︎ this leaks the connection but there is an issue in 
            // chrome that it will resume the runtime whenever a client
            // disconnects. Because things are relatively short-lived
            // we trade the leakage for being able to debug
            return Promise.reject('runtime is paused');
        }
    } else {
        // resume form inspect-brk
        await Runtime.runIfWaitingForDebugger();
    }

    // now start profiling
    await Profiler.enable();
    await Profiler.setSamplingInterval({ interval: 100 });
    await Profiler.start();

    return {
        stop: async function (n = 0) {
            if (n > 0) {
                await wait(n);
            }
            const data = await Profiler.stop();
            await client.close();
            return data;
        }
    }
}

function rewriteAbsolutePaths(profile, replace = 'noAbsolutePaths') {
    for (const node of profile.profile.nodes) {
        if (node.callFrame && node.callFrame.url) {
            if (isAbsolute(node.callFrame.url)) {
                node.callFrame.url = join(replace, basename(node.callFrame.url));
            }
        }
    }
    return profile;
}

async function writeProfile(profile, filename = `profile-${Date.now()}.cpuprofile`) {
    await new Promise((resolve, reject) => {
        const data = JSON.stringify(profile.profile, null, 4);
        writeFile(filename, data, err => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        })
    });
}

module.exports = {
    startProfiling,
    writeProfile,
    rewriteAbsolutePaths,
}


/***/ }),

/***/ "./lib/vscode/node_modules/ws/index.js":
/*!*********************************************!*\
  !*** ./lib/vscode/node_modules/ws/index.js ***!
  \*********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */



const WebSocket = __webpack_require__(/*! ./lib/WebSocket */ "./lib/vscode/node_modules/ws/lib/WebSocket.js");

WebSocket.Server = __webpack_require__(/*! ./lib/WebSocketServer */ "./lib/vscode/node_modules/ws/lib/WebSocketServer.js");
WebSocket.Receiver = __webpack_require__(/*! ./lib/Receiver */ "./lib/vscode/node_modules/ws/lib/Receiver.js");
WebSocket.Sender = __webpack_require__(/*! ./lib/Sender */ "./lib/vscode/node_modules/ws/lib/Sender.js");

module.exports = WebSocket;


/***/ }),

/***/ "./lib/vscode/node_modules/ws/lib/BufferUtil.js":
/*!******************************************************!*\
  !*** ./lib/vscode/node_modules/ws/lib/BufferUtil.js ***!
  \******************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */



const safeBuffer = __webpack_require__(/*! safe-buffer */ "./lib/vscode/node_modules/safe-buffer/index.js");

const Buffer = safeBuffer.Buffer;

/**
 * Merges an array of buffers into a new buffer.
 *
 * @param {Buffer[]} list The array of buffers to concat
 * @param {Number} totalLength The total length of buffers in the list
 * @return {Buffer} The resulting buffer
 * @public
 */
const concat = (list, totalLength) => {
  const target = Buffer.allocUnsafe(totalLength);
  var offset = 0;

  for (var i = 0; i < list.length; i++) {
    const buf = list[i];
    buf.copy(target, offset);
    offset += buf.length;
  }

  return target;
};

try {
  const bufferUtil = __webpack_require__(!(function webpackMissingModule() { var e = new Error("Cannot find module 'bufferutil'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

  module.exports = Object.assign({ concat }, bufferUtil.BufferUtil || bufferUtil);
} catch (e) /* istanbul ignore next */ {
  /**
   * Masks a buffer using the given mask.
   *
   * @param {Buffer} source The buffer to mask
   * @param {Buffer} mask The mask to use
   * @param {Buffer} output The buffer where to store the result
   * @param {Number} offset The offset at which to start writing
   * @param {Number} length The number of bytes to mask.
   * @public
   */
  const mask = (source, mask, output, offset, length) => {
    for (var i = 0; i < length; i++) {
      output[offset + i] = source[i] ^ mask[i & 3];
    }
  };

  /**
   * Unmasks a buffer using the given mask.
   *
   * @param {Buffer} buffer The buffer to unmask
   * @param {Buffer} mask The mask to use
   * @public
   */
  const unmask = (buffer, mask) => {
    // Required until https://github.com/nodejs/node/issues/9006 is resolved.
    const length = buffer.length;
    for (var i = 0; i < length; i++) {
      buffer[i] ^= mask[i & 3];
    }
  };

  module.exports = { concat, mask, unmask };
}


/***/ }),

/***/ "./lib/vscode/node_modules/ws/lib/Constants.js":
/*!*****************************************************!*\
  !*** ./lib/vscode/node_modules/ws/lib/Constants.js ***!
  \*****************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const safeBuffer = __webpack_require__(/*! safe-buffer */ "./lib/vscode/node_modules/safe-buffer/index.js");

const Buffer = safeBuffer.Buffer;

exports.BINARY_TYPES = ['nodebuffer', 'arraybuffer', 'fragments'];
exports.GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
exports.EMPTY_BUFFER = Buffer.alloc(0);
exports.NOOP = () => {};


/***/ }),

/***/ "./lib/vscode/node_modules/ws/lib/ErrorCodes.js":
/*!******************************************************!*\
  !*** ./lib/vscode/node_modules/ws/lib/ErrorCodes.js ***!
  \******************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */



module.exports = {
  isValidErrorCode: function (code) {
    return (code >= 1000 && code <= 1013 && code !== 1004 && code !== 1005 && code !== 1006) ||
      (code >= 3000 && code <= 4999);
  },
  1000: 'normal',
  1001: 'going away',
  1002: 'protocol error',
  1003: 'unsupported data',
  1004: 'reserved',
  1005: 'reserved for extensions',
  1006: 'reserved for extensions',
  1007: 'inconsistent or invalid data',
  1008: 'policy violation',
  1009: 'message too big',
  1010: 'extension handshake missing',
  1011: 'an unexpected condition prevented the request from being fulfilled',
  1012: 'service restart',
  1013: 'try again later'
};


/***/ }),

/***/ "./lib/vscode/node_modules/ws/lib/EventTarget.js":
/*!*******************************************************!*\
  !*** ./lib/vscode/node_modules/ws/lib/EventTarget.js ***!
  \*******************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


/**
 * Class representing an event.
 *
 * @private
 */
class Event {
  /**
   * Create a new `Event`.
   *
   * @param {String} type The name of the event
   * @param {Object} target A reference to the target to which the event was dispatched
   */
  constructor (type, target) {
    this.target = target;
    this.type = type;
  }
}

/**
 * Class representing a message event.
 *
 * @extends Event
 * @private
 */
class MessageEvent extends Event {
  /**
   * Create a new `MessageEvent`.
   *
   * @param {(String|Buffer|ArrayBuffer|Buffer[])} data The received data
   * @param {WebSocket} target A reference to the target to which the event was dispatched
   */
  constructor (data, target) {
    super('message', target);

    this.data = data;
  }
}

/**
 * Class representing a close event.
 *
 * @extends Event
 * @private
 */
class CloseEvent extends Event {
  /**
   * Create a new `CloseEvent`.
   *
   * @param {Number} code The status code explaining why the connection is being closed
   * @param {String} reason A human-readable string explaining why the connection is closing
   * @param {WebSocket} target A reference to the target to which the event was dispatched
   */
  constructor (code, reason, target) {
    super('close', target);

    this.wasClean = target._closeFrameReceived && target._closeFrameSent;
    this.reason = reason;
    this.code = code;
  }
}

/**
 * Class representing an open event.
 *
 * @extends Event
 * @private
 */
class OpenEvent extends Event {
  /**
   * Create a new `OpenEvent`.
   *
   * @param {WebSocket} target A reference to the target to which the event was dispatched
   */
  constructor (target) {
    super('open', target);
  }
}

/**
 * This provides methods for emulating the `EventTarget` interface. It's not
 * meant to be used directly.
 *
 * @mixin
 */
const EventTarget = {
  /**
   * Register an event listener.
   *
   * @param {String} method A string representing the event type to listen for
   * @param {Function} listener The listener to add
   * @public
   */
  addEventListener (method, listener) {
    if (typeof listener !== 'function') return;

    function onMessage (data) {
      listener.call(this, new MessageEvent(data, this));
    }

    function onClose (code, message) {
      listener.call(this, new CloseEvent(code, message, this));
    }

    function onError (event) {
      event.type = 'error';
      event.target = this;
      listener.call(this, event);
    }

    function onOpen () {
      listener.call(this, new OpenEvent(this));
    }

    if (method === 'message') {
      onMessage._listener = listener;
      this.on(method, onMessage);
    } else if (method === 'close') {
      onClose._listener = listener;
      this.on(method, onClose);
    } else if (method === 'error') {
      onError._listener = listener;
      this.on(method, onError);
    } else if (method === 'open') {
      onOpen._listener = listener;
      this.on(method, onOpen);
    } else {
      this.on(method, listener);
    }
  },

  /**
   * Remove an event listener.
   *
   * @param {String} method A string representing the event type to remove
   * @param {Function} listener The listener to remove
   * @public
   */
  removeEventListener (method, listener) {
    const listeners = this.listeners(method);

    for (var i = 0; i < listeners.length; i++) {
      if (listeners[i] === listener || listeners[i]._listener === listener) {
        this.removeListener(method, listeners[i]);
      }
    }
  }
};

module.exports = EventTarget;


/***/ }),

/***/ "./lib/vscode/node_modules/ws/lib/Extensions.js":
/*!******************************************************!*\
  !*** ./lib/vscode/node_modules/ws/lib/Extensions.js ***!
  \******************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


//
// Allowed token characters:
//
// '!', '#', '$', '%', '&', ''', '*', '+', '-',
// '.', 0-9, A-Z, '^', '_', '`', a-z, '|', '~'
//
// tokenChars[32] === 0 // ' '
// tokenChars[33] === 1 // '!'
// tokenChars[34] === 0 // '"'
// ...
//
const tokenChars = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0 - 15
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 16 - 31
  0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, // 32 - 47
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, // 48 - 63
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 64 - 79
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, // 80 - 95
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 96 - 111
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0 // 112 - 127
];

/**
 * Adds an offer to the map of extension offers or a parameter to the map of
 * parameters.
 *
 * @param {Object} dest The map of extension offers or parameters
 * @param {String} name The extension or parameter name
 * @param {(Object|Boolean|String)} elem The extension parameters or the
 *     parameter value
 * @private
 */
function push (dest, name, elem) {
  if (Object.prototype.hasOwnProperty.call(dest, name)) dest[name].push(elem);
  else dest[name] = [elem];
}

/**
 * Parses the `Sec-WebSocket-Extensions` header into an object.
 *
 * @param {String} header The field value of the header
 * @return {Object} The parsed object
 * @public
 */
function parse (header) {
  const offers = {};

  if (header === undefined || header === '') return offers;

  var params = {};
  var mustUnescape = false;
  var isEscaping = false;
  var inQuotes = false;
  var extensionName;
  var paramName;
  var start = -1;
  var end = -1;

  for (var i = 0; i < header.length; i++) {
    const code = header.charCodeAt(i);

    if (extensionName === undefined) {
      if (end === -1 && tokenChars[code] === 1) {
        if (start === -1) start = i;
      } else if (code === 0x20/* ' ' */|| code === 0x09/* '\t' */) {
        if (end === -1 && start !== -1) end = i;
      } else if (code === 0x3b/* ';' */ || code === 0x2c/* ',' */) {
        if (start === -1) throw new Error(`unexpected character at index ${i}`);

        if (end === -1) end = i;
        const name = header.slice(start, end);
        if (code === 0x2c) {
          push(offers, name, params);
          params = {};
        } else {
          extensionName = name;
        }

        start = end = -1;
      } else {
        throw new Error(`unexpected character at index ${i}`);
      }
    } else if (paramName === undefined) {
      if (end === -1 && tokenChars[code] === 1) {
        if (start === -1) start = i;
      } else if (code === 0x20 || code === 0x09) {
        if (end === -1 && start !== -1) end = i;
      } else if (code === 0x3b || code === 0x2c) {
        if (start === -1) throw new Error(`unexpected character at index ${i}`);

        if (end === -1) end = i;
        push(params, header.slice(start, end), true);
        if (code === 0x2c) {
          push(offers, extensionName, params);
          params = {};
          extensionName = undefined;
        }

        start = end = -1;
      } else if (code === 0x3d/* '=' */&& start !== -1 && end === -1) {
        paramName = header.slice(start, i);
        start = end = -1;
      } else {
        throw new Error(`unexpected character at index ${i}`);
      }
    } else {
      //
      // The value of a quoted-string after unescaping must conform to the
      // token ABNF, so only token characters are valid.
      // Ref: https://tools.ietf.org/html/rfc6455#section-9.1
      //
      if (isEscaping) {
        if (tokenChars[code] !== 1) {
          throw new Error(`unexpected character at index ${i}`);
        }
        if (start === -1) start = i;
        else if (!mustUnescape) mustUnescape = true;
        isEscaping = false;
      } else if (inQuotes) {
        if (tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (code === 0x22/* '"' */ && start !== -1) {
          inQuotes = false;
          end = i;
        } else if (code === 0x5c/* '\' */) {
          isEscaping = true;
        } else {
          throw new Error(`unexpected character at index ${i}`);
        }
      } else if (code === 0x22 && header.charCodeAt(i - 1) === 0x3d) {
        inQuotes = true;
      } else if (end === -1 && tokenChars[code] === 1) {
        if (start === -1) start = i;
      } else if (start !== -1 && (code === 0x20 || code === 0x09)) {
        if (end === -1) end = i;
      } else if (code === 0x3b || code === 0x2c) {
        if (start === -1) throw new Error(`unexpected character at index ${i}`);

        if (end === -1) end = i;
        var value = header.slice(start, end);
        if (mustUnescape) {
          value = value.replace(/\\/g, '');
          mustUnescape = false;
        }
        push(params, paramName, value);
        if (code === 0x2c) {
          push(offers, extensionName, params);
          params = {};
          extensionName = undefined;
        }

        paramName = undefined;
        start = end = -1;
      } else {
        throw new Error(`unexpected character at index ${i}`);
      }
    }
  }

  if (start === -1 || inQuotes) throw new Error('unexpected end of input');

  if (end === -1) end = i;
  const token = header.slice(start, end);
  if (extensionName === undefined) {
    push(offers, token, {});
  } else {
    if (paramName === undefined) {
      push(params, token, true);
    } else if (mustUnescape) {
      push(params, paramName, token.replace(/\\/g, ''));
    } else {
      push(params, paramName, token);
    }
    push(offers, extensionName, params);
  }

  return offers;
}

/**
 * Serializes a parsed `Sec-WebSocket-Extensions` header to a string.
 *
 * @param {Object} value The object to format
 * @return {String} A string representing the given value
 * @public
 */
function format (value) {
  return Object.keys(value).map((token) => {
    var paramsList = value[token];
    if (!Array.isArray(paramsList)) paramsList = [paramsList];
    return paramsList.map((params) => {
      return [token].concat(Object.keys(params).map((k) => {
        var p = params[k];
        if (!Array.isArray(p)) p = [p];
        return p.map((v) => v === true ? k : `${k}=${v}`).join('; ');
      })).join('; ');
    }).join(', ');
  }).join(', ');
}

module.exports = { format, parse };


/***/ }),

/***/ "./lib/vscode/node_modules/ws/lib/PerMessageDeflate.js":
/*!*************************************************************!*\
  !*** ./lib/vscode/node_modules/ws/lib/PerMessageDeflate.js ***!
  \*************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const safeBuffer = __webpack_require__(/*! safe-buffer */ "./lib/vscode/node_modules/safe-buffer/index.js");
const Limiter = __webpack_require__(/*! async-limiter */ "./lib/vscode/node_modules/async-limiter/index.js");
const zlib = __webpack_require__(/*! zlib */ "zlib");

const bufferUtil = __webpack_require__(/*! ./BufferUtil */ "./lib/vscode/node_modules/ws/lib/BufferUtil.js");

const Buffer = safeBuffer.Buffer;

const TRAILER = Buffer.from([0x00, 0x00, 0xff, 0xff]);
const EMPTY_BLOCK = Buffer.from([0x00]);

const kWriteInProgress = Symbol('write-in-progress');
const kPendingClose = Symbol('pending-close');
const kTotalLength = Symbol('total-length');
const kCallback = Symbol('callback');
const kBuffers = Symbol('buffers');
const kError = Symbol('error');
const kOwner = Symbol('owner');

//
// We limit zlib concurrency, which prevents severe memory fragmentation
// as documented in https://github.com/nodejs/node/issues/8871#issuecomment-250915913
// and https://github.com/websockets/ws/issues/1202
//
// Intentionally global; it's the global thread pool that's an issue.
//
let zlibLimiter;

/**
 * permessage-deflate implementation.
 */
class PerMessageDeflate {
  /**
   * Creates a PerMessageDeflate instance.
   *
   * @param {Object} options Configuration options
   * @param {Boolean} options.serverNoContextTakeover Request/accept disabling
   *     of server context takeover
   * @param {Boolean} options.clientNoContextTakeover Advertise/acknowledge
   *     disabling of client context takeover
   * @param {(Boolean|Number)} options.serverMaxWindowBits Request/confirm the
   *     use of a custom server window size
   * @param {(Boolean|Number)} options.clientMaxWindowBits Advertise support
   *     for, or request, a custom client window size
   * @param {Number} options.level The value of zlib's `level` param
   * @param {Number} options.memLevel The value of zlib's `memLevel` param
   * @param {Number} options.threshold Size (in bytes) below which messages
   *     should not be compressed
   * @param {Number} options.concurrencyLimit The number of concurrent calls to
   *     zlib
   * @param {Boolean} isServer Create the instance in either server or client
   *     mode
   * @param {Number} maxPayload The maximum allowed message length
   */
  constructor (options, isServer, maxPayload) {
    this._maxPayload = maxPayload | 0;
    this._options = options || {};
    this._threshold = this._options.threshold !== undefined
      ? this._options.threshold
      : 1024;
    this._isServer = !!isServer;
    this._deflate = null;
    this._inflate = null;

    this.params = null;

    if (!zlibLimiter) {
      const concurrency = this._options.concurrencyLimit !== undefined
        ? this._options.concurrencyLimit
        : 10;
      zlibLimiter = new Limiter({ concurrency });
    }
  }

  /**
   * @type {String}
   */
  static get extensionName () {
    return 'permessage-deflate';
  }

  /**
   * Create extension parameters offer.
   *
   * @return {Object} Extension parameters
   * @public
   */
  offer () {
    const params = {};

    if (this._options.serverNoContextTakeover) {
      params.server_no_context_takeover = true;
    }
    if (this._options.clientNoContextTakeover) {
      params.client_no_context_takeover = true;
    }
    if (this._options.serverMaxWindowBits) {
      params.server_max_window_bits = this._options.serverMaxWindowBits;
    }
    if (this._options.clientMaxWindowBits) {
      params.client_max_window_bits = this._options.clientMaxWindowBits;
    } else if (this._options.clientMaxWindowBits == null) {
      params.client_max_window_bits = true;
    }

    return params;
  }

  /**
   * Accept extension offer.
   *
   * @param {Array} paramsList Extension parameters
   * @return {Object} Accepted configuration
   * @public
   */
  accept (paramsList) {
    paramsList = this.normalizeParams(paramsList);

    var params;
    if (this._isServer) {
      params = this.acceptAsServer(paramsList);
    } else {
      params = this.acceptAsClient(paramsList);
    }

    this.params = params;
    return params;
  }

  /**
   * Releases all resources used by the extension.
   *
   * @public
   */
  cleanup () {
    if (this._inflate) {
      if (this._inflate[kWriteInProgress]) {
        this._inflate[kPendingClose] = true;
      } else {
        this._inflate.close();
        this._inflate = null;
      }
    }
    if (this._deflate) {
      if (this._deflate[kWriteInProgress]) {
        this._deflate[kPendingClose] = true;
      } else {
        this._deflate.close();
        this._deflate = null;
      }
    }
  }

  /**
   * Accept extension offer from client.
   *
   * @param {Array} paramsList Extension parameters
   * @return {Object} Accepted configuration
   * @private
   */
  acceptAsServer (paramsList) {
    const accepted = {};
    const result = paramsList.some((params) => {
      if (
        (this._options.serverNoContextTakeover === false &&
          params.server_no_context_takeover) ||
        (this._options.serverMaxWindowBits === false &&
          params.server_max_window_bits) ||
        (typeof this._options.serverMaxWindowBits === 'number' &&
          typeof params.server_max_window_bits === 'number' &&
          this._options.serverMaxWindowBits > params.server_max_window_bits) ||
        (typeof this._options.clientMaxWindowBits === 'number' &&
          !params.client_max_window_bits)
      ) {
        return;
      }

      if (
        this._options.serverNoContextTakeover ||
        params.server_no_context_takeover
      ) {
        accepted.server_no_context_takeover = true;
      }
      if (
        this._options.clientNoContextTakeover ||
        (this._options.clientNoContextTakeover !== false &&
          params.client_no_context_takeover)
      ) {
        accepted.client_no_context_takeover = true;
      }
      if (typeof this._options.serverMaxWindowBits === 'number') {
        accepted.server_max_window_bits = this._options.serverMaxWindowBits;
      } else if (typeof params.server_max_window_bits === 'number') {
        accepted.server_max_window_bits = params.server_max_window_bits;
      }
      if (typeof this._options.clientMaxWindowBits === 'number') {
        accepted.client_max_window_bits = this._options.clientMaxWindowBits;
      } else if (
        this._options.clientMaxWindowBits !== false &&
        typeof params.client_max_window_bits === 'number'
      ) {
        accepted.client_max_window_bits = params.client_max_window_bits;
      }
      return true;
    });

    if (!result) throw new Error("Doesn't support the offered configuration");

    return accepted;
  }

  /**
   * Accept extension response from server.
   *
   * @param {Array} paramsList Extension parameters
   * @return {Object} Accepted configuration
   * @private
   */
  acceptAsClient (paramsList) {
    const params = paramsList[0];

    if (
      this._options.clientNoContextTakeover === false &&
      params.client_no_context_takeover
    ) {
      throw new Error('Invalid value for "client_no_context_takeover"');
    }

    if (
      (typeof this._options.clientMaxWindowBits === 'number' &&
        (!params.client_max_window_bits ||
          params.client_max_window_bits > this._options.clientMaxWindowBits)) ||
      (this._options.clientMaxWindowBits === false &&
        params.client_max_window_bits)
    ) {
      throw new Error('Invalid value for "client_max_window_bits"');
    }

    return params;
  }

  /**
   * Normalize extensions parameters.
   *
   * @param {Array} paramsList Extension parameters
   * @return {Array} Normalized extensions parameters
   * @private
   */
  normalizeParams (paramsList) {
    return paramsList.map((params) => {
      Object.keys(params).forEach((key) => {
        var value = params[key];
        if (value.length > 1) {
          throw new Error(`Multiple extension parameters for ${key}`);
        }

        value = value[0];

        switch (key) {
          case 'server_no_context_takeover':
          case 'client_no_context_takeover':
            if (value !== true) {
              throw new Error(`invalid extension parameter value for ${key} (${value})`);
            }
            params[key] = true;
            break;
          case 'server_max_window_bits':
          case 'client_max_window_bits':
            if (typeof value === 'string') {
              value = parseInt(value, 10);
              if (
                Number.isNaN(value) ||
                value < zlib.Z_MIN_WINDOWBITS ||
                value > zlib.Z_MAX_WINDOWBITS
              ) {
                throw new Error(`invalid extension parameter value for ${key} (${value})`);
              }
            }
            if (!this._isServer && value === true) {
              throw new Error(`Missing extension parameter value for ${key}`);
            }
            params[key] = value;
            break;
          default:
            throw new Error(`Not defined extension parameter (${key})`);
        }
      });
      return params;
    });
  }

  /**
   * Decompress data. Concurrency limited by async-limiter.
   *
   * @param {Buffer} data Compressed data
   * @param {Boolean} fin Specifies whether or not this is the last fragment
   * @param {Function} callback Callback
   * @public
   */
  decompress (data, fin, callback) {
    zlibLimiter.push((done) => {
      this._decompress(data, fin, (err, result) => {
        done();
        callback(err, result);
      });
    });
  }

  /**
   * Compress data. Concurrency limited by async-limiter.
   *
   * @param {Buffer} data Data to compress
   * @param {Boolean} fin Specifies whether or not this is the last fragment
   * @param {Function} callback Callback
   * @public
   */
  compress (data, fin, callback) {
    zlibLimiter.push((done) => {
      this._compress(data, fin, (err, result) => {
        done();
        callback(err, result);
      });
    });
  }

  /**
   * Decompress data.
   *
   * @param {Buffer} data Compressed data
   * @param {Boolean} fin Specifies whether or not this is the last fragment
   * @param {Function} callback Callback
   * @private
   */
  _decompress (data, fin, callback) {
    const endpoint = this._isServer ? 'client' : 'server';

    if (!this._inflate) {
      const key = `${endpoint}_max_window_bits`;
      const windowBits = typeof this.params[key] !== 'number'
        ? zlib.Z_DEFAULT_WINDOWBITS
        : this.params[key];

      this._inflate = zlib.createInflateRaw({ windowBits });
      this._inflate[kTotalLength] = 0;
      this._inflate[kBuffers] = [];
      this._inflate[kOwner] = this;
      this._inflate.on('error', inflateOnError);
      this._inflate.on('data', inflateOnData);
    }

    this._inflate[kCallback] = callback;
    this._inflate[kWriteInProgress] = true;

    this._inflate.write(data);
    if (fin) this._inflate.write(TRAILER);

    this._inflate.flush(() => {
      const err = this._inflate[kError];

      if (err) {
        this._inflate.close();
        this._inflate = null;
        callback(err);
        return;
      }

      const data = bufferUtil.concat(
        this._inflate[kBuffers],
        this._inflate[kTotalLength]
      );

      if (
        (fin && this.params[`${endpoint}_no_context_takeover`]) ||
        this._inflate[kPendingClose]
      ) {
        this._inflate.close();
        this._inflate = null;
      } else {
        this._inflate[kWriteInProgress] = false;
        this._inflate[kTotalLength] = 0;
        this._inflate[kBuffers] = [];
      }

      callback(null, data);
    });
  }

  /**
   * Compress data.
   *
   * @param {Buffer} data Data to compress
   * @param {Boolean} fin Specifies whether or not this is the last fragment
   * @param {Function} callback Callback
   * @private
   */
  _compress (data, fin, callback) {
    if (!data || data.length === 0) {
      process.nextTick(callback, null, EMPTY_BLOCK);
      return;
    }

    const endpoint = this._isServer ? 'server' : 'client';

    if (!this._deflate) {
      const key = `${endpoint}_max_window_bits`;
      const windowBits = typeof this.params[key] !== 'number'
        ? zlib.Z_DEFAULT_WINDOWBITS
        : this.params[key];

      this._deflate = zlib.createDeflateRaw({
        memLevel: this._options.memLevel,
        level: this._options.level,
        flush: zlib.Z_SYNC_FLUSH,
        windowBits
      });

      this._deflate[kTotalLength] = 0;
      this._deflate[kBuffers] = [];

      //
      // `zlib.DeflateRaw` emits an `'error'` event only when an attempt to use
      // it is made after it has already been closed. This cannot happen here,
      // so we only add a listener for the `'data'` event.
      //
      this._deflate.on('data', deflateOnData);
    }

    this._deflate[kWriteInProgress] = true;

    this._deflate.write(data);
    this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
      var data = bufferUtil.concat(
        this._deflate[kBuffers],
        this._deflate[kTotalLength]
      );

      if (fin) data = data.slice(0, data.length - 4);

      if (
        (fin && this.params[`${endpoint}_no_context_takeover`]) ||
        this._deflate[kPendingClose]
      ) {
        this._deflate.close();
        this._deflate = null;
      } else {
        this._deflate[kWriteInProgress] = false;
        this._deflate[kTotalLength] = 0;
        this._deflate[kBuffers] = [];
      }

      callback(null, data);
    });
  }
}

module.exports = PerMessageDeflate;

/**
 * The listener of the `zlib.DeflateRaw` stream `'data'` event.
 *
 * @param {Buffer} chunk A chunk of data
 * @private
 */
function deflateOnData (chunk) {
  this[kBuffers].push(chunk);
  this[kTotalLength] += chunk.length;
}

/**
 * The listener of the `zlib.InflateRaw` stream `'data'` event.
 *
 * @param {Buffer} chunk A chunk of data
 * @private
 */
function inflateOnData (chunk) {
  this[kTotalLength] += chunk.length;

  if (
    this[kOwner]._maxPayload < 1 ||
    this[kTotalLength] <= this[kOwner]._maxPayload
  ) {
    this[kBuffers].push(chunk);
    return;
  }

  this[kError] = new Error('max payload size exceeded');
  this[kError].closeCode = 1009;
  this.removeListener('data', inflateOnData);
  this.reset();
}

/**
 * The listener of the `zlib.InflateRaw` stream `'error'` event.
 *
 * @param {Error} err The emitted error
 * @private
 */
function inflateOnError (err) {
  //
  // There is no need to call `Zlib#close()` as the handle is automatically
  // closed when an error is emitted.
  //
  this[kOwner]._inflate = null;
  this[kCallback](err);
}


/***/ }),

/***/ "./lib/vscode/node_modules/ws/lib/Receiver.js":
/*!****************************************************!*\
  !*** ./lib/vscode/node_modules/ws/lib/Receiver.js ***!
  \****************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */



const safeBuffer = __webpack_require__(/*! safe-buffer */ "./lib/vscode/node_modules/safe-buffer/index.js");

const PerMessageDeflate = __webpack_require__(/*! ./PerMessageDeflate */ "./lib/vscode/node_modules/ws/lib/PerMessageDeflate.js");
const isValidUTF8 = __webpack_require__(/*! ./Validation */ "./lib/vscode/node_modules/ws/lib/Validation.js");
const bufferUtil = __webpack_require__(/*! ./BufferUtil */ "./lib/vscode/node_modules/ws/lib/BufferUtil.js");
const ErrorCodes = __webpack_require__(/*! ./ErrorCodes */ "./lib/vscode/node_modules/ws/lib/ErrorCodes.js");
const constants = __webpack_require__(/*! ./Constants */ "./lib/vscode/node_modules/ws/lib/Constants.js");

const Buffer = safeBuffer.Buffer;

const GET_INFO = 0;
const GET_PAYLOAD_LENGTH_16 = 1;
const GET_PAYLOAD_LENGTH_64 = 2;
const GET_MASK = 3;
const GET_DATA = 4;
const INFLATING = 5;

/**
 * HyBi Receiver implementation.
 */
class Receiver {
  /**
   * Creates a Receiver instance.
   *
   * @param {Object} extensions An object containing the negotiated extensions
   * @param {Number} maxPayload The maximum allowed message length
   * @param {String} binaryType The type for binary data
   */
  constructor (extensions, maxPayload, binaryType) {
    this._binaryType = binaryType || constants.BINARY_TYPES[0];
    this._extensions = extensions || {};
    this._maxPayload = maxPayload | 0;

    this._bufferedBytes = 0;
    this._buffers = [];

    this._compressed = false;
    this._payloadLength = 0;
    this._fragmented = 0;
    this._masked = false;
    this._fin = false;
    this._mask = null;
    this._opcode = 0;

    this._totalPayloadLength = 0;
    this._messageLength = 0;
    this._fragments = [];

    this._cleanupCallback = null;
    this._hadError = false;
    this._dead = false;
    this._loop = false;

    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.onping = null;
    this.onpong = null;

    this._state = GET_INFO;
  }

  /**
   * Consumes bytes from the available buffered data.
   *
   * @param {Number} bytes The number of bytes to consume
   * @return {Buffer} Consumed bytes
   * @private
   */
  readBuffer (bytes) {
    var offset = 0;
    var dst;
    var l;

    this._bufferedBytes -= bytes;

    if (bytes === this._buffers[0].length) return this._buffers.shift();

    if (bytes < this._buffers[0].length) {
      dst = this._buffers[0].slice(0, bytes);
      this._buffers[0] = this._buffers[0].slice(bytes);
      return dst;
    }

    dst = Buffer.allocUnsafe(bytes);

    while (bytes > 0) {
      l = this._buffers[0].length;

      if (bytes >= l) {
        this._buffers[0].copy(dst, offset);
        offset += l;
        this._buffers.shift();
      } else {
        this._buffers[0].copy(dst, offset, 0, bytes);
        this._buffers[0] = this._buffers[0].slice(bytes);
      }

      bytes -= l;
    }

    return dst;
  }

  /**
   * Checks if the number of buffered bytes is bigger or equal than `n` and
   * calls `cleanup` if necessary.
   *
   * @param {Number} n The number of bytes to check against
   * @return {Boolean} `true` if `bufferedBytes >= n`, else `false`
   * @private
   */
  hasBufferedBytes (n) {
    if (this._bufferedBytes >= n) return true;

    this._loop = false;
    if (this._dead) this.cleanup(this._cleanupCallback);
    return false;
  }

  /**
   * Adds new data to the parser.
   *
   * @public
   */
  add (data) {
    if (this._dead) return;

    this._bufferedBytes += data.length;
    this._buffers.push(data);
    this.startLoop();
  }

  /**
   * Starts the parsing loop.
   *
   * @private
   */
  startLoop () {
    this._loop = true;

    while (this._loop) {
      switch (this._state) {
        case GET_INFO:
          this.getInfo();
          break;
        case GET_PAYLOAD_LENGTH_16:
          this.getPayloadLength16();
          break;
        case GET_PAYLOAD_LENGTH_64:
          this.getPayloadLength64();
          break;
        case GET_MASK:
          this.getMask();
          break;
        case GET_DATA:
          this.getData();
          break;
        default: // `INFLATING`
          this._loop = false;
      }
    }
  }

  /**
   * Reads the first two bytes of a frame.
   *
   * @private
   */
  getInfo () {
    if (!this.hasBufferedBytes(2)) return;

    const buf = this.readBuffer(2);

    if ((buf[0] & 0x30) !== 0x00) {
      this.error(new Error('RSV2 and RSV3 must be clear'), 1002);
      return;
    }

    const compressed = (buf[0] & 0x40) === 0x40;

    if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
      this.error(new Error('RSV1 must be clear'), 1002);
      return;
    }

    this._fin = (buf[0] & 0x80) === 0x80;
    this._opcode = buf[0] & 0x0f;
    this._payloadLength = buf[1] & 0x7f;

    if (this._opcode === 0x00) {
      if (compressed) {
        this.error(new Error('RSV1 must be clear'), 1002);
        return;
      }

      if (!this._fragmented) {
        this.error(new Error(`invalid opcode: ${this._opcode}`), 1002);
        return;
      } else {
        this._opcode = this._fragmented;
      }
    } else if (this._opcode === 0x01 || this._opcode === 0x02) {
      if (this._fragmented) {
        this.error(new Error(`invalid opcode: ${this._opcode}`), 1002);
        return;
      }

      this._compressed = compressed;
    } else if (this._opcode > 0x07 && this._opcode < 0x0b) {
      if (!this._fin) {
        this.error(new Error('FIN must be set'), 1002);
        return;
      }

      if (compressed) {
        this.error(new Error('RSV1 must be clear'), 1002);
        return;
      }

      if (this._payloadLength > 0x7d) {
        this.error(new Error('invalid payload length'), 1002);
        return;
      }
    } else {
      this.error(new Error(`invalid opcode: ${this._opcode}`), 1002);
      return;
    }

    if (!this._fin && !this._fragmented) this._fragmented = this._opcode;

    this._masked = (buf[1] & 0x80) === 0x80;

    if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
    else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
    else this.haveLength();
  }

  /**
   * Gets extended payload length (7+16).
   *
   * @private
   */
  getPayloadLength16 () {
    if (!this.hasBufferedBytes(2)) return;

    this._payloadLength = this.readBuffer(2).readUInt16BE(0, true);
    this.haveLength();
  }

  /**
   * Gets extended payload length (7+64).
   *
   * @private
   */
  getPayloadLength64 () {
    if (!this.hasBufferedBytes(8)) return;

    const buf = this.readBuffer(8);
    const num = buf.readUInt32BE(0, true);

    //
    // The maximum safe integer in JavaScript is 2^53 - 1. An error is returned
    // if payload length is greater than this number.
    //
    if (num > Math.pow(2, 53 - 32) - 1) {
      this.error(new Error('max payload size exceeded'), 1009);
      return;
    }

    this._payloadLength = (num * Math.pow(2, 32)) + buf.readUInt32BE(4, true);
    this.haveLength();
  }

  /**
   * Payload length has been read.
   *
   * @private
   */
  haveLength () {
    if (this._opcode < 0x08 && this.maxPayloadExceeded(this._payloadLength)) {
      return;
    }

    if (this._masked) this._state = GET_MASK;
    else this._state = GET_DATA;
  }

  /**
   * Reads mask bytes.
   *
   * @private
   */
  getMask () {
    if (!this.hasBufferedBytes(4)) return;

    this._mask = this.readBuffer(4);
    this._state = GET_DATA;
  }

  /**
   * Reads data bytes.
   *
   * @private
   */
  getData () {
    var data = constants.EMPTY_BUFFER;

    if (this._payloadLength) {
      if (!this.hasBufferedBytes(this._payloadLength)) return;

      data = this.readBuffer(this._payloadLength);
      if (this._masked) bufferUtil.unmask(data, this._mask);
    }

    if (this._opcode > 0x07) {
      this.controlMessage(data);
    } else if (this._compressed) {
      this._state = INFLATING;
      this.decompress(data);
    } else if (this.pushFragment(data)) {
      this.dataMessage();
    }
  }

  /**
   * Decompresses data.
   *
   * @param {Buffer} data Compressed data
   * @private
   */
  decompress (data) {
    const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];

    perMessageDeflate.decompress(data, this._fin, (err, buf) => {
      if (err) {
        this.error(err, err.closeCode === 1009 ? 1009 : 1007);
        return;
      }

      if (this.pushFragment(buf)) this.dataMessage();
      this.startLoop();
    });
  }

  /**
   * Handles a data message.
   *
   * @private
   */
  dataMessage () {
    if (this._fin) {
      const messageLength = this._messageLength;
      const fragments = this._fragments;

      this._totalPayloadLength = 0;
      this._messageLength = 0;
      this._fragmented = 0;
      this._fragments = [];

      if (this._opcode === 2) {
        var data;

        if (this._binaryType === 'nodebuffer') {
          data = toBuffer(fragments, messageLength);
        } else if (this._binaryType === 'arraybuffer') {
          data = toArrayBuffer(toBuffer(fragments, messageLength));
        } else {
          data = fragments;
        }

        this.onmessage(data);
      } else {
        const buf = toBuffer(fragments, messageLength);

        if (!isValidUTF8(buf)) {
          this.error(new Error('invalid utf8 sequence'), 1007);
          return;
        }

        this.onmessage(buf.toString());
      }
    }

    this._state = GET_INFO;
  }

  /**
   * Handles a control message.
   *
   * @param {Buffer} data Data to handle
   * @private
   */
  controlMessage (data) {
    if (this._opcode === 0x08) {
      if (data.length === 0) {
        this.onclose(1000, '');
        this._loop = false;
        this.cleanup(this._cleanupCallback);
      } else if (data.length === 1) {
        this.error(new Error('invalid payload length'), 1002);
      } else {
        const code = data.readUInt16BE(0, true);

        if (!ErrorCodes.isValidErrorCode(code)) {
          this.error(new Error(`invalid status code: ${code}`), 1002);
          return;
        }

        const buf = data.slice(2);

        if (!isValidUTF8(buf)) {
          this.error(new Error('invalid utf8 sequence'), 1007);
          return;
        }

        this.onclose(code, buf.toString());
        this._loop = false;
        this.cleanup(this._cleanupCallback);
      }

      return;
    }

    if (this._opcode === 0x09) this.onping(data);
    else this.onpong(data);

    this._state = GET_INFO;
  }

  /**
   * Handles an error.
   *
   * @param {Error} err The error
   * @param {Number} code Close code
   * @private
   */
  error (err, code) {
    this.onerror(err, code);
    this._hadError = true;
    this._loop = false;
    this.cleanup(this._cleanupCallback);
  }

  /**
   * Checks payload size, disconnects socket when it exceeds `maxPayload`.
   *
   * @param {Number} length Payload length
   * @private
   */
  maxPayloadExceeded (length) {
    if (length === 0 || this._maxPayload < 1) return false;

    const fullLength = this._totalPayloadLength + length;

    if (fullLength <= this._maxPayload) {
      this._totalPayloadLength = fullLength;
      return false;
    }

    this.error(new Error('max payload size exceeded'), 1009);
    return true;
  }

  /**
   * Appends a fragment in the fragments array after checking that the sum of
   * fragment lengths does not exceed `maxPayload`.
   *
   * @param {Buffer} fragment The fragment to add
   * @return {Boolean} `true` if `maxPayload` is not exceeded, else `false`
   * @private
   */
  pushFragment (fragment) {
    if (fragment.length === 0) return true;

    const totalLength = this._messageLength + fragment.length;

    if (this._maxPayload < 1 || totalLength <= this._maxPayload) {
      this._messageLength = totalLength;
      this._fragments.push(fragment);
      return true;
    }

    this.error(new Error('max payload size exceeded'), 1009);
    return false;
  }

  /**
   * Releases resources used by the receiver.
   *
   * @param {Function} cb Callback
   * @public
   */
  cleanup (cb) {
    this._dead = true;

    if (!this._hadError && (this._loop || this._state === INFLATING)) {
      this._cleanupCallback = cb;
    } else {
      this._extensions = null;
      this._fragments = null;
      this._buffers = null;
      this._mask = null;

      this._cleanupCallback = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;
      this.onping = null;
      this.onpong = null;

      if (cb) cb();
    }
  }
}

module.exports = Receiver;

/**
 * Makes a buffer from a list of fragments.
 *
 * @param {Buffer[]} fragments The list of fragments composing the message
 * @param {Number} messageLength The length of the message
 * @return {Buffer}
 * @private
 */
function toBuffer (fragments, messageLength) {
  if (fragments.length === 1) return fragments[0];
  if (fragments.length > 1) return bufferUtil.concat(fragments, messageLength);
  return constants.EMPTY_BUFFER;
}

/**
 * Converts a buffer to an `ArrayBuffer`.
 *
 * @param {Buffer} The buffer to convert
 * @return {ArrayBuffer} Converted buffer
 */
function toArrayBuffer (buf) {
  if (buf.byteOffset === 0 && buf.byteLength === buf.buffer.byteLength) {
    return buf.buffer;
  }

  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}


/***/ }),

/***/ "./lib/vscode/node_modules/ws/lib/Sender.js":
/*!**************************************************!*\
  !*** ./lib/vscode/node_modules/ws/lib/Sender.js ***!
  \**************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */



const safeBuffer = __webpack_require__(/*! safe-buffer */ "./lib/vscode/node_modules/safe-buffer/index.js");
const crypto = __webpack_require__(/*! crypto */ "crypto");

const PerMessageDeflate = __webpack_require__(/*! ./PerMessageDeflate */ "./lib/vscode/node_modules/ws/lib/PerMessageDeflate.js");
const bufferUtil = __webpack_require__(/*! ./BufferUtil */ "./lib/vscode/node_modules/ws/lib/BufferUtil.js");
const ErrorCodes = __webpack_require__(/*! ./ErrorCodes */ "./lib/vscode/node_modules/ws/lib/ErrorCodes.js");
const constants = __webpack_require__(/*! ./Constants */ "./lib/vscode/node_modules/ws/lib/Constants.js");

const Buffer = safeBuffer.Buffer;

/**
 * HyBi Sender implementation.
 */
class Sender {
  /**
   * Creates a Sender instance.
   *
   * @param {net.Socket} socket The connection socket
   * @param {Object} extensions An object containing the negotiated extensions
   */
  constructor (socket, extensions) {
    this._extensions = extensions || {};
    this._socket = socket;

    this._firstFragment = true;
    this._compress = false;

    this._bufferedBytes = 0;
    this._deflating = false;
    this._queue = [];
  }

  /**
   * Frames a piece of data according to the HyBi WebSocket protocol.
   *
   * @param {Buffer} data The data to frame
   * @param {Object} options Options object
   * @param {Number} options.opcode The opcode
   * @param {Boolean} options.readOnly Specifies whether `data` can be modified
   * @param {Boolean} options.fin Specifies whether or not to set the FIN bit
   * @param {Boolean} options.mask Specifies whether or not to mask `data`
   * @param {Boolean} options.rsv1 Specifies whether or not to set the RSV1 bit
   * @return {Buffer[]} The framed data as a list of `Buffer` instances
   * @public
   */
  static frame (data, options) {
    const merge = data.length < 1024 || (options.mask && options.readOnly);
    var offset = options.mask ? 6 : 2;
    var payloadLength = data.length;

    if (data.length >= 65536) {
      offset += 8;
      payloadLength = 127;
    } else if (data.length > 125) {
      offset += 2;
      payloadLength = 126;
    }

    const target = Buffer.allocUnsafe(merge ? data.length + offset : offset);

    target[0] = options.fin ? options.opcode | 0x80 : options.opcode;
    if (options.rsv1) target[0] |= 0x40;

    if (payloadLength === 126) {
      target.writeUInt16BE(data.length, 2, true);
    } else if (payloadLength === 127) {
      target.writeUInt32BE(0, 2, true);
      target.writeUInt32BE(data.length, 6, true);
    }

    if (!options.mask) {
      target[1] = payloadLength;
      if (merge) {
        data.copy(target, offset);
        return [target];
      }

      return [target, data];
    }

    const mask = crypto.randomBytes(4);

    target[1] = payloadLength | 0x80;
    target[offset - 4] = mask[0];
    target[offset - 3] = mask[1];
    target[offset - 2] = mask[2];
    target[offset - 1] = mask[3];

    if (merge) {
      bufferUtil.mask(data, mask, target, offset, data.length);
      return [target];
    }

    bufferUtil.mask(data, mask, data, 0, data.length);
    return [target, data];
  }

  /**
   * Sends a close message to the other peer.
   *
   * @param {(Number|undefined)} code The status code component of the body
   * @param {String} data The message component of the body
   * @param {Boolean} mask Specifies whether or not to mask the message
   * @param {Function} cb Callback
   * @public
   */
  close (code, data, mask, cb) {
    var buf;

    if (code === undefined) {
      code = 1000;
    } else if (typeof code !== 'number' || !ErrorCodes.isValidErrorCode(code)) {
      throw new Error('first argument must be a valid error code number');
    }

    if (data === undefined || data === '') {
      if (code === 1000) {
        buf = constants.EMPTY_BUFFER;
      } else {
        buf = Buffer.allocUnsafe(2);
        buf.writeUInt16BE(code, 0, true);
      }
    } else {
      buf = Buffer.allocUnsafe(2 + Buffer.byteLength(data));
      buf.writeUInt16BE(code, 0, true);
      buf.write(data, 2);
    }

    if (this._deflating) {
      this.enqueue([this.doClose, buf, mask, cb]);
    } else {
      this.doClose(buf, mask, cb);
    }
  }

  /**
   * Frames and sends a close message.
   *
   * @param {Buffer} data The message to send
   * @param {Boolean} mask Specifies whether or not to mask `data`
   * @param {Function} cb Callback
   * @private
   */
  doClose (data, mask, cb) {
    this.sendFrame(Sender.frame(data, {
      fin: true,
      rsv1: false,
      opcode: 0x08,
      mask,
      readOnly: false
    }), cb);
  }

  /**
   * Sends a ping message to the other peer.
   *
   * @param {*} data The message to send
   * @param {Boolean} mask Specifies whether or not to mask `data`
   * @public
   */
  ping (data, mask) {
    var readOnly = true;

    if (!Buffer.isBuffer(data)) {
      if (data instanceof ArrayBuffer) {
        data = Buffer.from(data);
      } else if (ArrayBuffer.isView(data)) {
        data = viewToBuffer(data);
      } else {
        data = Buffer.from(data);
        readOnly = false;
      }
    }

    if (this._deflating) {
      this.enqueue([this.doPing, data, mask, readOnly]);
    } else {
      this.doPing(data, mask, readOnly);
    }
  }

  /**
   * Frames and sends a ping message.
   *
   * @param {*} data The message to send
   * @param {Boolean} mask Specifies whether or not to mask `data`
   * @param {Boolean} readOnly Specifies whether `data` can be modified
   * @private
   */
  doPing (data, mask, readOnly) {
    this.sendFrame(Sender.frame(data, {
      fin: true,
      rsv1: false,
      opcode: 0x09,
      mask,
      readOnly
    }));
  }

  /**
   * Sends a pong message to the other peer.
   *
   * @param {*} data The message to send
   * @param {Boolean} mask Specifies whether or not to mask `data`
   * @public
   */
  pong (data, mask) {
    var readOnly = true;

    if (!Buffer.isBuffer(data)) {
      if (data instanceof ArrayBuffer) {
        data = Buffer.from(data);
      } else if (ArrayBuffer.isView(data)) {
        data = viewToBuffer(data);
      } else {
        data = Buffer.from(data);
        readOnly = false;
      }
    }

    if (this._deflating) {
      this.enqueue([this.doPong, data, mask, readOnly]);
    } else {
      this.doPong(data, mask, readOnly);
    }
  }

  /**
   * Frames and sends a pong message.
   *
   * @param {*} data The message to send
   * @param {Boolean} mask Specifies whether or not to mask `data`
   * @param {Boolean} readOnly Specifies whether `data` can be modified
   * @private
   */
  doPong (data, mask, readOnly) {
    this.sendFrame(Sender.frame(data, {
      fin: true,
      rsv1: false,
      opcode: 0x0a,
      mask,
      readOnly
    }));
  }

  /**
   * Sends a data message to the other peer.
   *
   * @param {*} data The message to send
   * @param {Object} options Options object
   * @param {Boolean} options.compress Specifies whether or not to compress `data`
   * @param {Boolean} options.binary Specifies whether `data` is binary or text
   * @param {Boolean} options.fin Specifies whether the fragment is the last one
   * @param {Boolean} options.mask Specifies whether or not to mask `data`
   * @param {Function} cb Callback
   * @public
   */
  send (data, options, cb) {
    var opcode = options.binary ? 2 : 1;
    var rsv1 = options.compress;
    var readOnly = true;

    if (!Buffer.isBuffer(data)) {
      if (data instanceof ArrayBuffer) {
        data = Buffer.from(data);
      } else if (ArrayBuffer.isView(data)) {
        data = viewToBuffer(data);
      } else {
        data = Buffer.from(data);
        readOnly = false;
      }
    }

    const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];

    if (this._firstFragment) {
      this._firstFragment = false;
      if (rsv1 && perMessageDeflate) {
        rsv1 = data.length >= perMessageDeflate._threshold;
      }
      this._compress = rsv1;
    } else {
      rsv1 = false;
      opcode = 0;
    }

    if (options.fin) this._firstFragment = true;

    if (perMessageDeflate) {
      const opts = {
        fin: options.fin,
        rsv1,
        opcode,
        mask: options.mask,
        readOnly
      };

      if (this._deflating) {
        this.enqueue([this.dispatch, data, this._compress, opts, cb]);
      } else {
        this.dispatch(data, this._compress, opts, cb);
      }
    } else {
      this.sendFrame(Sender.frame(data, {
        fin: options.fin,
        rsv1: false,
        opcode,
        mask: options.mask,
        readOnly
      }), cb);
    }
  }

  /**
   * Dispatches a data message.
   *
   * @param {Buffer} data The message to send
   * @param {Boolean} compress Specifies whether or not to compress `data`
   * @param {Object} options Options object
   * @param {Number} options.opcode The opcode
   * @param {Boolean} options.readOnly Specifies whether `data` can be modified
   * @param {Boolean} options.fin Specifies whether or not to set the FIN bit
   * @param {Boolean} options.mask Specifies whether or not to mask `data`
   * @param {Boolean} options.rsv1 Specifies whether or not to set the RSV1 bit
   * @param {Function} cb Callback
   * @private
   */
  dispatch (data, compress, options, cb) {
    if (!compress) {
      this.sendFrame(Sender.frame(data, options), cb);
      return;
    }

    const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];

    this._deflating = true;
    perMessageDeflate.compress(data, options.fin, (_, buf) => {
      options.readOnly = false;
      this.sendFrame(Sender.frame(buf, options), cb);
      this._deflating = false;
      this.dequeue();
    });
  }

  /**
   * Executes queued send operations.
   *
   * @private
   */
  dequeue () {
    while (!this._deflating && this._queue.length) {
      const params = this._queue.shift();

      this._bufferedBytes -= params[1].length;
      params[0].apply(this, params.slice(1));
    }
  }

  /**
   * Enqueues a send operation.
   *
   * @param {Array} params Send operation parameters.
   * @private
   */
  enqueue (params) {
    this._bufferedBytes += params[1].length;
    this._queue.push(params);
  }

  /**
   * Sends a frame.
   *
   * @param {Buffer[]} list The frame to send
   * @param {Function} cb Callback
   * @private
   */
  sendFrame (list, cb) {
    if (list.length === 2) {
      this._socket.write(list[0]);
      this._socket.write(list[1], cb);
    } else {
      this._socket.write(list[0], cb);
    }
  }
}

module.exports = Sender;

/**
 * Converts an `ArrayBuffer` view into a buffer.
 *
 * @param {(DataView|TypedArray)} view The view to convert
 * @return {Buffer} Converted view
 * @private
 */
function viewToBuffer (view) {
  const buf = Buffer.from(view.buffer);

  if (view.byteLength !== view.buffer.byteLength) {
    return buf.slice(view.byteOffset, view.byteOffset + view.byteLength);
  }

  return buf;
}


/***/ }),

/***/ "./lib/vscode/node_modules/ws/lib/Validation.js":
/*!******************************************************!*\
  !*** ./lib/vscode/node_modules/ws/lib/Validation.js ***!
  \******************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */



try {
  const isValidUTF8 = __webpack_require__(!(function webpackMissingModule() { var e = new Error("Cannot find module 'utf-8-validate'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

  module.exports = typeof isValidUTF8 === 'object'
    ? isValidUTF8.Validation.isValidUTF8 // utf-8-validate@<3.0.0
    : isValidUTF8;
} catch (e) /* istanbul ignore next */ {
  module.exports = () => true;
}


/***/ }),

/***/ "./lib/vscode/node_modules/ws/lib/WebSocket.js":
/*!*****************************************************!*\
  !*** ./lib/vscode/node_modules/ws/lib/WebSocket.js ***!
  \*****************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */



const EventEmitter = __webpack_require__(/*! events */ "events");
const crypto = __webpack_require__(/*! crypto */ "crypto");
const Ultron = __webpack_require__(/*! ultron */ "./lib/vscode/node_modules/ultron/index.js");
const https = __webpack_require__(/*! https */ "https");
const http = __webpack_require__(/*! http */ "http");
const url = __webpack_require__(/*! url */ "url");

const PerMessageDeflate = __webpack_require__(/*! ./PerMessageDeflate */ "./lib/vscode/node_modules/ws/lib/PerMessageDeflate.js");
const EventTarget = __webpack_require__(/*! ./EventTarget */ "./lib/vscode/node_modules/ws/lib/EventTarget.js");
const Extensions = __webpack_require__(/*! ./Extensions */ "./lib/vscode/node_modules/ws/lib/Extensions.js");
const constants = __webpack_require__(/*! ./Constants */ "./lib/vscode/node_modules/ws/lib/Constants.js");
const Receiver = __webpack_require__(/*! ./Receiver */ "./lib/vscode/node_modules/ws/lib/Receiver.js");
const Sender = __webpack_require__(/*! ./Sender */ "./lib/vscode/node_modules/ws/lib/Sender.js");

const protocolVersions = [8, 13];
const closeTimeout = 30 * 1000; // Allow 30 seconds to terminate the connection cleanly.

/**
 * Class representing a WebSocket.
 *
 * @extends EventEmitter
 */
class WebSocket extends EventEmitter {
  /**
   * Create a new `WebSocket`.
   *
   * @param {String} address The URL to which to connect
   * @param {(String|String[])} protocols The subprotocols
   * @param {Object} options Connection options
   */
  constructor (address, protocols, options) {
    super();

    if (!protocols) {
      protocols = [];
    } else if (typeof protocols === 'string') {
      protocols = [protocols];
    } else if (!Array.isArray(protocols)) {
      options = protocols;
      protocols = [];
    }

    this.readyState = WebSocket.CONNECTING;
    this.bytesReceived = 0;
    this.extensions = {};
    this.protocol = '';

    this._binaryType = constants.BINARY_TYPES[0];
    this._finalize = this.finalize.bind(this);
    this._closeFrameReceived = false;
    this._closeFrameSent = false;
    this._closeMessage = '';
    this._closeTimer = null;
    this._finalized = false;
    this._closeCode = 1006;
    this._receiver = null;
    this._sender = null;
    this._socket = null;
    this._ultron = null;

    if (Array.isArray(address)) {
      initAsServerClient.call(this, address[0], address[1], options);
    } else {
      initAsClient.call(this, address, protocols, options);
    }
  }

  get CONNECTING () { return WebSocket.CONNECTING; }
  get CLOSING () { return WebSocket.CLOSING; }
  get CLOSED () { return WebSocket.CLOSED; }
  get OPEN () { return WebSocket.OPEN; }

  /**
   * @type {Number}
   */
  get bufferedAmount () {
    var amount = 0;

    if (this._socket) {
      amount = this._socket.bufferSize + this._sender._bufferedBytes;
    }
    return amount;
  }

  /**
   * This deviates from the WHATWG interface since ws doesn't support the required
   * default "blob" type (instead we define a custom "nodebuffer" type).
   *
   * @type {String}
   */
  get binaryType () {
    return this._binaryType;
  }

  set binaryType (type) {
    if (constants.BINARY_TYPES.indexOf(type) < 0) return;

    this._binaryType = type;

    //
    // Allow to change `binaryType` on the fly.
    //
    if (this._receiver) this._receiver._binaryType = type;
  }

  /**
   * Set up the socket and the internal resources.
   *
   * @param {net.Socket} socket The network socket between the server and client
   * @param {Buffer} head The first packet of the upgraded stream
   * @private
   */
  setSocket (socket, head) {
    socket.setTimeout(0);
    socket.setNoDelay();

    this._receiver = new Receiver(this.extensions, this._maxPayload, this.binaryType);
    this._sender = new Sender(socket, this.extensions);
    this._ultron = new Ultron(socket);
    this._socket = socket;

    this._ultron.on('close', this._finalize);
    this._ultron.on('error', this._finalize);
    this._ultron.on('end', this._finalize);

    if (head.length > 0) socket.unshift(head);

    this._ultron.on('data', (data) => {
      this.bytesReceived += data.length;
      this._receiver.add(data);
    });

    this._receiver.onmessage = (data) => this.emit('message', data);
    this._receiver.onping = (data) => {
      this.pong(data, !this._isServer, true);
      this.emit('ping', data);
    };
    this._receiver.onpong = (data) => this.emit('pong', data);
    this._receiver.onclose = (code, reason) => {
      this._closeFrameReceived = true;
      this._closeMessage = reason;
      this._closeCode = code;
      if (!this._finalized) this.close(code, reason);
    };
    this._receiver.onerror = (error, code) => {
      this._closeMessage = '';
      this._closeCode = code;

      //
      // Ensure that the error is emitted even if `WebSocket#finalize()` has
      // already been called.
      //
      this.readyState = WebSocket.CLOSING;
      this.emit('error', error);
      this.finalize(true);
    };

    this.readyState = WebSocket.OPEN;
    this.emit('open');
  }

  /**
   * Clean up and release internal resources.
   *
   * @param {(Boolean|Error)} error Indicates whether or not an error occurred
   * @private
   */
  finalize (error) {
    if (this._finalized) return;

    this.readyState = WebSocket.CLOSING;
    this._finalized = true;

    if (typeof error === 'object') this.emit('error', error);
    if (!this._socket) return this.emitClose();

    clearTimeout(this._closeTimer);
    this._closeTimer = null;

    this._ultron.destroy();
    this._ultron = null;

    this._socket.on('error', constants.NOOP);

    if (!error) this._socket.end();
    else this._socket.destroy();

    this._socket = null;
    this._sender = null;

    this._receiver.cleanup(() => this.emitClose());
    this._receiver = null;
  }

  /**
   * Emit the `close` event.
   *
   * @private
   */
  emitClose () {
    this.readyState = WebSocket.CLOSED;

    this.emit('close', this._closeCode, this._closeMessage);

    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.extensions[PerMessageDeflate.extensionName].cleanup();
    }

    this.extensions = null;

    this.removeAllListeners();
  }

  /**
   * Pause the socket stream.
   *
   * @public
   */
  pause () {
    if (this.readyState !== WebSocket.OPEN) throw new Error('not opened');

    this._socket.pause();
  }

  /**
   * Resume the socket stream
   *
   * @public
   */
  resume () {
    if (this.readyState !== WebSocket.OPEN) throw new Error('not opened');

    this._socket.resume();
  }

  /**
   * Start a closing handshake.
   *
   *            +----------+     +-----------+   +----------+
   *     + - - -|ws.close()|---->|close frame|-->|ws.close()|- - - -
   *            +----------+     +-----------+   +----------+       |
   *     |      +----------+     +-----------+         |
   *            |ws.close()|<----|close frame|<--------+            |
   *            +----------+     +-----------+         |
   *  CLOSING         |              +---+             |         CLOSING
   *                  |          +---|fin|<------------+
   *     |            |          |   +---+                          |
   *                  |          |   +---+      +-------------+
   *     |            +----------+-->|fin|----->|ws.finalize()| - - +
   *                             |   +---+      +-------------+
   *     |     +-------------+   |
   *      - - -|ws.finalize()|<--+
   *           +-------------+
   *
   * @param {Number} code Status code explaining why the connection is closing
   * @param {String} data A string explaining why the connection is closing
   * @public
   */
  close (code, data) {
    if (this.readyState === WebSocket.CLOSED) return;
    if (this.readyState === WebSocket.CONNECTING) {
      this._req.abort();
      this.finalize(new Error('closed before the connection is established'));
      return;
    }

    if (this.readyState === WebSocket.CLOSING) {
      if (this._closeFrameSent && this._closeFrameReceived) this._socket.end();
      return;
    }

    this.readyState = WebSocket.CLOSING;
    this._sender.close(code, data, !this._isServer, (err) => {
      //
      // This error is handled by the `'error'` listener on the socket. We only
      // want to know if the close frame has been sent here.
      //
      if (err) return;

      this._closeFrameSent = true;

      if (!this._finalized) {
        if (this._closeFrameReceived) this._socket.end();

        //
        // Ensure that the connection is cleaned up even when the closing
        // handshake fails.
        //
        this._closeTimer = setTimeout(this._finalize, closeTimeout, true);
      }
    });
  }

  /**
   * Send a ping message.
   *
   * @param {*} data The message to send
   * @param {Boolean} mask Indicates whether or not to mask `data`
   * @param {Boolean} failSilently Indicates whether or not to throw if `readyState` isn't `OPEN`
   * @public
   */
  ping (data, mask, failSilently) {
    if (this.readyState !== WebSocket.OPEN) {
      if (failSilently) return;
      throw new Error('not opened');
    }

    if (typeof data === 'number') data = data.toString();
    if (mask === undefined) mask = !this._isServer;
    this._sender.ping(data || constants.EMPTY_BUFFER, mask);
  }

  /**
   * Send a pong message.
   *
   * @param {*} data The message to send
   * @param {Boolean} mask Indicates whether or not to mask `data`
   * @param {Boolean} failSilently Indicates whether or not to throw if `readyState` isn't `OPEN`
   * @public
   */
  pong (data, mask, failSilently) {
    if (this.readyState !== WebSocket.OPEN) {
      if (failSilently) return;
      throw new Error('not opened');
    }

    if (typeof data === 'number') data = data.toString();
    if (mask === undefined) mask = !this._isServer;
    this._sender.pong(data || constants.EMPTY_BUFFER, mask);
  }

  /**
   * Send a data message.
   *
   * @param {*} data The message to send
   * @param {Object} options Options object
   * @param {Boolean} options.compress Specifies whether or not to compress `data`
   * @param {Boolean} options.binary Specifies whether `data` is binary or text
   * @param {Boolean} options.fin Specifies whether the fragment is the last one
   * @param {Boolean} options.mask Specifies whether or not to mask `data`
   * @param {Function} cb Callback which is executed when data is written out
   * @public
   */
  send (data, options, cb) {
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }

    if (this.readyState !== WebSocket.OPEN) {
      if (cb) cb(new Error('not opened'));
      else throw new Error('not opened');
      return;
    }

    if (typeof data === 'number') data = data.toString();

    const opts = Object.assign({
      binary: typeof data !== 'string',
      mask: !this._isServer,
      compress: true,
      fin: true
    }, options);

    if (!this.extensions[PerMessageDeflate.extensionName]) {
      opts.compress = false;
    }

    this._sender.send(data || constants.EMPTY_BUFFER, opts, cb);
  }

  /**
   * Forcibly close the connection.
   *
   * @public
   */
  terminate () {
    if (this.readyState === WebSocket.CLOSED) return;
    if (this.readyState === WebSocket.CONNECTING) {
      this._req.abort();
      this.finalize(new Error('closed before the connection is established'));
      return;
    }

    this.finalize(true);
  }
}

WebSocket.CONNECTING = 0;
WebSocket.OPEN = 1;
WebSocket.CLOSING = 2;
WebSocket.CLOSED = 3;

//
// Add the `onopen`, `onerror`, `onclose`, and `onmessage` attributes.
// See https://html.spec.whatwg.org/multipage/comms.html#the-websocket-interface
//
['open', 'error', 'close', 'message'].forEach((method) => {
  Object.defineProperty(WebSocket.prototype, `on${method}`, {
    /**
     * Return the listener of the event.
     *
     * @return {(Function|undefined)} The event listener or `undefined`
     * @public
     */
    get () {
      const listeners = this.listeners(method);
      for (var i = 0; i < listeners.length; i++) {
        if (listeners[i]._listener) return listeners[i]._listener;
      }
    },
    /**
     * Add a listener for the event.
     *
     * @param {Function} listener The listener to add
     * @public
     */
    set (listener) {
      const listeners = this.listeners(method);
      for (var i = 0; i < listeners.length; i++) {
        //
        // Remove only the listeners added via `addEventListener`.
        //
        if (listeners[i]._listener) this.removeListener(method, listeners[i]);
      }
      this.addEventListener(method, listener);
    }
  });
});

WebSocket.prototype.addEventListener = EventTarget.addEventListener;
WebSocket.prototype.removeEventListener = EventTarget.removeEventListener;

module.exports = WebSocket;

/**
 * Initialize a WebSocket server client.
 *
 * @param {http.IncomingMessage} req The request object
 * @param {net.Socket} socket The network socket between the server and client
 * @param {Buffer} head The first packet of the upgraded stream
 * @param {Object} options WebSocket attributes
 * @param {Number} options.protocolVersion The WebSocket protocol version
 * @param {Object} options.extensions The negotiated extensions
 * @param {Number} options.maxPayload The maximum allowed message size
 * @param {String} options.protocol The chosen subprotocol
 * @private
 */
function initAsServerClient (socket, head, options) {
  this.protocolVersion = options.protocolVersion;
  this._maxPayload = options.maxPayload;
  this.extensions = options.extensions;
  this.protocol = options.protocol;

  this._isServer = true;

  this.setSocket(socket, head);
}

/**
 * Initialize a WebSocket client.
 *
 * @param {String} address The URL to which to connect
 * @param {String[]} protocols The list of subprotocols
 * @param {Object} options Connection options
 * @param {String} options.protocol Value of the `Sec-WebSocket-Protocol` header
 * @param {(Boolean|Object)} options.perMessageDeflate Enable/disable permessage-deflate
 * @param {Number} options.handshakeTimeout Timeout in milliseconds for the handshake request
 * @param {String} options.localAddress Local interface to bind for network connections
 * @param {Number} options.protocolVersion Value of the `Sec-WebSocket-Version` header
 * @param {Object} options.headers An object containing request headers
 * @param {String} options.origin Value of the `Origin` or `Sec-WebSocket-Origin` header
 * @param {http.Agent} options.agent Use the specified Agent
 * @param {String} options.host Value of the `Host` header
 * @param {Number} options.family IP address family to use during hostname lookup (4 or 6).
 * @param {Function} options.checkServerIdentity A function to validate the server hostname
 * @param {Boolean} options.rejectUnauthorized Verify or not the server certificate
 * @param {String} options.passphrase The passphrase for the private key or pfx
 * @param {String} options.ciphers The ciphers to use or exclude
 * @param {String} options.ecdhCurve The curves for ECDH key agreement to use or exclude
 * @param {(String|String[]|Buffer|Buffer[])} options.cert The certificate key
 * @param {(String|String[]|Buffer|Buffer[])} options.key The private key
 * @param {(String|Buffer)} options.pfx The private key, certificate, and CA certs
 * @param {(String|String[]|Buffer|Buffer[])} options.ca Trusted certificates
 * @private
 */
function initAsClient (address, protocols, options) {
  options = Object.assign({
    protocolVersion: protocolVersions[1],
    protocol: protocols.join(','),
    perMessageDeflate: true,
    handshakeTimeout: null,
    localAddress: null,
    headers: null,
    family: null,
    origin: null,
    agent: null,
    host: null,

    //
    // SSL options.
    //
    checkServerIdentity: null,
    rejectUnauthorized: null,
    passphrase: null,
    ciphers: null,
    ecdhCurve: null,
    cert: null,
    key: null,
    pfx: null,
    ca: null
  }, options);

  if (protocolVersions.indexOf(options.protocolVersion) === -1) {
    throw new Error(
      `unsupported protocol version: ${options.protocolVersion} ` +
      `(supported versions: ${protocolVersions.join(', ')})`
    );
  }

  this.protocolVersion = options.protocolVersion;
  this._isServer = false;
  this.url = address;

  const serverUrl = url.parse(address);
  const isUnixSocket = serverUrl.protocol === 'ws+unix:';

  if (!serverUrl.host && (!isUnixSocket || !serverUrl.path)) {
    throw new Error('invalid url');
  }

  const isSecure = serverUrl.protocol === 'wss:' || serverUrl.protocol === 'https:';
  const key = crypto.randomBytes(16).toString('base64');
  const httpObj = isSecure ? https : http;
  var perMessageDeflate;

  const requestOptions = {
    port: serverUrl.port || (isSecure ? 443 : 80),
    host: serverUrl.hostname,
    path: '/',
    headers: {
      'Sec-WebSocket-Version': options.protocolVersion,
      'Sec-WebSocket-Key': key,
      'Connection': 'Upgrade',
      'Upgrade': 'websocket'
    }
  };

  if (options.headers) Object.assign(requestOptions.headers, options.headers);
  if (options.perMessageDeflate) {
    perMessageDeflate = new PerMessageDeflate(
      options.perMessageDeflate !== true ? options.perMessageDeflate : {},
      false
    );
    requestOptions.headers['Sec-WebSocket-Extensions'] = Extensions.format({
      [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
    });
  }
  if (options.protocol) {
    requestOptions.headers['Sec-WebSocket-Protocol'] = options.protocol;
  }
  if (options.origin) {
    if (options.protocolVersion < 13) {
      requestOptions.headers['Sec-WebSocket-Origin'] = options.origin;
    } else {
      requestOptions.headers.Origin = options.origin;
    }
  }
  if (options.host) requestOptions.headers.Host = options.host;
  if (serverUrl.auth) requestOptions.auth = serverUrl.auth;

  if (options.localAddress) requestOptions.localAddress = options.localAddress;
  if (options.family) requestOptions.family = options.family;

  if (isUnixSocket) {
    const parts = serverUrl.path.split(':');

    requestOptions.socketPath = parts[0];
    requestOptions.path = parts[1];
  } else if (serverUrl.path) {
    //
    // Make sure that path starts with `/`.
    //
    if (serverUrl.path.charAt(0) !== '/') {
      requestOptions.path = `/${serverUrl.path}`;
    } else {
      requestOptions.path = serverUrl.path;
    }
  }

  var agent = options.agent;

  //
  // A custom agent is required for these options.
  //
  if (
    options.rejectUnauthorized != null ||
    options.checkServerIdentity ||
    options.passphrase ||
    options.ciphers ||
    options.ecdhCurve ||
    options.cert ||
    options.key ||
    options.pfx ||
    options.ca
  ) {
    if (options.passphrase) requestOptions.passphrase = options.passphrase;
    if (options.ciphers) requestOptions.ciphers = options.ciphers;
    if (options.ecdhCurve) requestOptions.ecdhCurve = options.ecdhCurve;
    if (options.cert) requestOptions.cert = options.cert;
    if (options.key) requestOptions.key = options.key;
    if (options.pfx) requestOptions.pfx = options.pfx;
    if (options.ca) requestOptions.ca = options.ca;
    if (options.checkServerIdentity) {
      requestOptions.checkServerIdentity = options.checkServerIdentity;
    }
    if (options.rejectUnauthorized != null) {
      requestOptions.rejectUnauthorized = options.rejectUnauthorized;
    }

    if (!agent) agent = new httpObj.Agent(requestOptions);
  }

  if (agent) requestOptions.agent = agent;

  this._req = httpObj.get(requestOptions);

  if (options.handshakeTimeout) {
    this._req.setTimeout(options.handshakeTimeout, () => {
      this._req.abort();
      this.finalize(new Error('opening handshake has timed out'));
    });
  }

  this._req.on('error', (error) => {
    if (this._req.aborted) return;

    this._req = null;
    this.finalize(error);
  });

  this._req.on('response', (res) => {
    if (!this.emit('unexpected-response', this._req, res)) {
      this._req.abort();
      this.finalize(new Error(`unexpected server response (${res.statusCode})`));
    }
  });

  this._req.on('upgrade', (res, socket, head) => {
    this.emit('headers', res.headers, res);

    //
    // The user may have closed the connection from a listener of the `headers`
    // event.
    //
    if (this.readyState !== WebSocket.CONNECTING) return;

    this._req = null;

    const digest = crypto.createHash('sha1')
      .update(key + constants.GUID, 'binary')
      .digest('base64');

    if (res.headers['sec-websocket-accept'] !== digest) {
      socket.destroy();
      return this.finalize(new Error('invalid server key'));
    }

    const serverProt = res.headers['sec-websocket-protocol'];
    const protList = (options.protocol || '').split(/, */);
    var protError;

    if (!options.protocol && serverProt) {
      protError = 'server sent a subprotocol even though none requested';
    } else if (options.protocol && !serverProt) {
      protError = 'server sent no subprotocol even though requested';
    } else if (serverProt && protList.indexOf(serverProt) === -1) {
      protError = 'server responded with an invalid protocol';
    }

    if (protError) {
      socket.destroy();
      return this.finalize(new Error(protError));
    }

    if (serverProt) this.protocol = serverProt;

    if (perMessageDeflate) {
      try {
        const serverExtensions = Extensions.parse(
          res.headers['sec-websocket-extensions']
        );

        if (serverExtensions[PerMessageDeflate.extensionName]) {
          perMessageDeflate.accept(
            serverExtensions[PerMessageDeflate.extensionName]
          );
          this.extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
        }
      } catch (err) {
        socket.destroy();
        this.finalize(new Error('invalid Sec-WebSocket-Extensions header'));
        return;
      }
    }

    this.setSocket(socket, head);
  });
}


/***/ }),

/***/ "./lib/vscode/node_modules/ws/lib/WebSocketServer.js":
/*!***********************************************************!*\
  !*** ./lib/vscode/node_modules/ws/lib/WebSocketServer.js ***!
  \***********************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */



const safeBuffer = __webpack_require__(/*! safe-buffer */ "./lib/vscode/node_modules/safe-buffer/index.js");
const EventEmitter = __webpack_require__(/*! events */ "events");
const crypto = __webpack_require__(/*! crypto */ "crypto");
const Ultron = __webpack_require__(/*! ultron */ "./lib/vscode/node_modules/ultron/index.js");
const http = __webpack_require__(/*! http */ "http");
const url = __webpack_require__(/*! url */ "url");

const PerMessageDeflate = __webpack_require__(/*! ./PerMessageDeflate */ "./lib/vscode/node_modules/ws/lib/PerMessageDeflate.js");
const Extensions = __webpack_require__(/*! ./Extensions */ "./lib/vscode/node_modules/ws/lib/Extensions.js");
const constants = __webpack_require__(/*! ./Constants */ "./lib/vscode/node_modules/ws/lib/Constants.js");
const WebSocket = __webpack_require__(/*! ./WebSocket */ "./lib/vscode/node_modules/ws/lib/WebSocket.js");

const Buffer = safeBuffer.Buffer;

/**
 * Class representing a WebSocket server.
 *
 * @extends EventEmitter
 */
class WebSocketServer extends EventEmitter {
  /**
   * Create a `WebSocketServer` instance.
   *
   * @param {Object} options Configuration options
   * @param {String} options.host The hostname where to bind the server
   * @param {Number} options.port The port where to bind the server
   * @param {http.Server} options.server A pre-created HTTP/S server to use
   * @param {Function} options.verifyClient An hook to reject connections
   * @param {Function} options.handleProtocols An hook to handle protocols
   * @param {String} options.path Accept only connections matching this path
   * @param {Boolean} options.noServer Enable no server mode
   * @param {Boolean} options.clientTracking Specifies whether or not to track clients
   * @param {(Boolean|Object)} options.perMessageDeflate Enable/disable permessage-deflate
   * @param {Number} options.maxPayload The maximum allowed message size
   * @param {Function} callback A listener for the `listening` event
   */
  constructor (options, callback) {
    super();

    options = Object.assign({
      maxPayload: 100 * 1024 * 1024,
      perMessageDeflate: false,
      handleProtocols: null,
      clientTracking: true,
      verifyClient: null,
      noServer: false,
      backlog: null, // use default (511 as implemented in net.js)
      server: null,
      host: null,
      path: null,
      port: null
    }, options);

    if (options.port == null && !options.server && !options.noServer) {
      throw new TypeError('missing or invalid options');
    }

    if (options.port != null) {
      this._server = http.createServer((req, res) => {
        const body = http.STATUS_CODES[426];

        res.writeHead(426, {
          'Content-Length': body.length,
          'Content-Type': 'text/plain'
        });
        res.end(body);
      });
      this._server.listen(options.port, options.host, options.backlog, callback);
    } else if (options.server) {
      this._server = options.server;
    }

    if (this._server) {
      this._ultron = new Ultron(this._server);
      this._ultron.on('listening', () => this.emit('listening'));
      this._ultron.on('error', (err) => this.emit('error', err));
      this._ultron.on('upgrade', (req, socket, head) => {
        this.handleUpgrade(req, socket, head, (client) => {
          this.emit('connection', client, req);
        });
      });
    }

    if (options.perMessageDeflate === true) options.perMessageDeflate = {};
    if (options.clientTracking) this.clients = new Set();
    this.options = options;
  }

  /**
   * Close the server.
   *
   * @param {Function} cb Callback
   * @public
   */
  close (cb) {
    //
    // Terminate all associated clients.
    //
    if (this.clients) {
      for (const client of this.clients) client.terminate();
    }

    const server = this._server;

    if (server) {
      this._ultron.destroy();
      this._ultron = this._server = null;

      //
      // Close the http server if it was internally created.
      //
      if (this.options.port != null) return server.close(cb);
    }

    if (cb) cb();
  }

  /**
   * See if a given request should be handled by this server instance.
   *
   * @param {http.IncomingMessage} req Request object to inspect
   * @return {Boolean} `true` if the request is valid, else `false`
   * @public
   */
  shouldHandle (req) {
    if (this.options.path && url.parse(req.url).pathname !== this.options.path) {
      return false;
    }

    return true;
  }

  /**
   * Handle a HTTP Upgrade request.
   *
   * @param {http.IncomingMessage} req The request object
   * @param {net.Socket} socket The network socket between the server and client
   * @param {Buffer} head The first packet of the upgraded stream
   * @param {Function} cb Callback
   * @public
   */
  handleUpgrade (req, socket, head, cb) {
    socket.on('error', socketError);

    const version = +req.headers['sec-websocket-version'];
    const extensions = {};

    if (
      req.method !== 'GET' || req.headers.upgrade.toLowerCase() !== 'websocket' ||
      !req.headers['sec-websocket-key'] || (version !== 8 && version !== 13) ||
      !this.shouldHandle(req)
    ) {
      return abortConnection(socket, 400);
    }

    if (this.options.perMessageDeflate) {
      const perMessageDeflate = new PerMessageDeflate(
        this.options.perMessageDeflate,
        true,
        this.options.maxPayload
      );

      try {
        const offers = Extensions.parse(
          req.headers['sec-websocket-extensions']
        );

        if (offers[PerMessageDeflate.extensionName]) {
          perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
          extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
        }
      } catch (err) {
        return abortConnection(socket, 400);
      }
    }

    var protocol = (req.headers['sec-websocket-protocol'] || '').split(/, */);

    //
    // Optionally call external protocol selection handler.
    //
    if (this.options.handleProtocols) {
      protocol = this.options.handleProtocols(protocol, req);
      if (protocol === false) return abortConnection(socket, 401);
    } else {
      protocol = protocol[0];
    }

    //
    // Optionally call external client verification handler.
    //
    if (this.options.verifyClient) {
      const info = {
        origin: req.headers[`${version === 8 ? 'sec-websocket-origin' : 'origin'}`],
        secure: !!(req.connection.authorized || req.connection.encrypted),
        req
      };

      if (this.options.verifyClient.length === 2) {
        this.options.verifyClient(info, (verified, code, message) => {
          if (!verified) return abortConnection(socket, code || 401, message);

          this.completeUpgrade(
            protocol,
            extensions,
            version,
            req,
            socket,
            head,
            cb
          );
        });
        return;
      }

      if (!this.options.verifyClient(info)) return abortConnection(socket, 401);
    }

    this.completeUpgrade(protocol, extensions, version, req, socket, head, cb);
  }

  /**
   * Upgrade the connection to WebSocket.
   *
   * @param {String} protocol The chosen subprotocol
   * @param {Object} extensions The accepted extensions
   * @param {Number} version The WebSocket protocol version
   * @param {http.IncomingMessage} req The request object
   * @param {net.Socket} socket The network socket between the server and client
   * @param {Buffer} head The first packet of the upgraded stream
   * @param {Function} cb Callback
   * @private
   */
  completeUpgrade (protocol, extensions, version, req, socket, head, cb) {
    //
    // Destroy the socket if the client has already sent a FIN packet.
    //
    if (!socket.readable || !socket.writable) return socket.destroy();

    const key = crypto.createHash('sha1')
      .update(req.headers['sec-websocket-key'] + constants.GUID, 'binary')
      .digest('base64');

    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${key}`
    ];

    if (protocol) headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
    if (extensions[PerMessageDeflate.extensionName]) {
      const params = extensions[PerMessageDeflate.extensionName].params;
      const value = Extensions.format({
        [PerMessageDeflate.extensionName]: [params]
      });
      headers.push(`Sec-WebSocket-Extensions: ${value}`);
    }

    //
    // Allow external modification/inspection of handshake headers.
    //
    this.emit('headers', headers, req);

    socket.write(headers.concat('\r\n').join('\r\n'));

    const client = new WebSocket([socket, head], null, {
      maxPayload: this.options.maxPayload,
      protocolVersion: version,
      extensions,
      protocol
    });

    if (this.clients) {
      this.clients.add(client);
      client.on('close', () => this.clients.delete(client));
    }

    socket.removeListener('error', socketError);
    cb(client);
  }
}

module.exports = WebSocketServer;

/**
 * Handle premature socket errors.
 *
 * @private
 */
function socketError () {
  this.destroy();
}

/**
 * Close the connection when preconditions are not fulfilled.
 *
 * @param {net.Socket} socket The socket of the upgrade request
 * @param {Number} code The HTTP response status code
 * @param {String} [message] The HTTP response body
 * @private
 */
function abortConnection (socket, code, message) {
  if (socket.writable) {
    message = message || http.STATUS_CODES[code];
    socket.write(
      `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r\n` +
      'Connection: close\r\n' +
      'Content-type: text/html\r\n' +
      `Content-Length: ${Buffer.byteLength(message)}\r\n` +
      '\r\n' +
      message
    );
  }

  socket.removeListener('error', socketError);
  socket.destroy();
}


/***/ })

};;