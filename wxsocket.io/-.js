    import io from './index'
    var root = {
        console: console
    };
    var isBrowser = typeof window === 'object' && window.window === window;
    if ((isBrowser && location.href.indexOf('debug=sdk') > -1)
        || (typeof process === 'object' && process.env.DEBUG)) {
        root.DEBUG_YUNBA = true;
    }

    var noop = function () {};
    var forEach = function (dataList, fn, context) {
        var i;
        var length;
        if (dataList.forEach) {
            dataList.forEach(fn, context);
        } else {
            for (i = 0, length = dataList.length; i < length; i++) {
                fn.call(context || this, dataList[i], i, dataList);
            }
        }
    };
    // simple bind
    // currently doesn't support argument bind
    var bind = function (fn, context) {
        if (fn.bind) {
            return fn.bind(context);
        }

        return function () {
            fn.apply(context, arguments);
        };
    };

    function Log(level) {
        var cs = root.console && console;

        level = (level == 'debug' && 4) 
                || (level == 'info' && 3)
                || (level == 'warning' && 2)
                || (level == 'error' && 1);

        this.debug = level >= 4 ? bind(cs.debug, cs) : noop;
        this.info = level >= 3 ? bind(cs.info, cs) : noop;
        this.warn = level >= 2 ? bind(cs.warn, cs) : noop;
        this.error = level >= 1 ? bind(cs.error, cs) : noop;
    }

    var cookieUtil = {
        get: function (name) {
            var cookieName = encodeURIComponent(name) + '=';
            var cookieStart = document.cookie.indexOf(cookieName);
            var cookieValue = null;

            if (cookieStart > -1) {
                var cookieEnd = document.cookie.indexOf(';', cookieStart);
                if (cookieEnd === -1) {
                    cookieEnd = document.cookie.length;
                }
                cookieValue = decodeURIComponent(
                    document.cookie.substring(cookieStart + cookieName.length, cookieEnd)
                );
            }
            return cookieValue;
        },

        set: function (name, value, expires, path, domain, secure) {
            var cookieText = encodeURIComponent(name) + '=' + encodeURIComponent(value);

            if (expires instanceof Date) {
                cookieText += '; expires=' + expires.toGMTString();
            }

            if (path) {
                cookieText += '; path=' + path;
            }

            if (domain) {
                cookieText += '; domain=' + domain;
            }

            if (secure) {
                cookieText += '; secure';
            }

            document.cookie = cookieText;
        },

        unset: function (name, path, domain, secure) {
            this.set(name, '', new Date(0), path, domain, secure);
        },

        isSupport: function () {
            var isSupport = false;
            if (isBrowser) {
                if (typeof navigator === 'object' && navigator.cookieEnabled !== undefined) {
                    isSupport = navigator.cookieEnabled;
                } else {
                    this.set('yunbaTestCookie', 'yunbaTestCookie');
                    isSupport = !!this.get('yunbaTestCookie');
                }
            }
            return isSupport;
        }
    };

    var genMsgId = function () {
        var randomness = Math.round(Math.random() * 1e16) % Math.pow(2, 23);
        if (randomness.toString(2).length > 23) {
            randomness = (randomness >>> (randomness.toString(2).length - 23)).toString(2);
        } else {
            randomness = (randomness << (23 - randomness.toString(2).length)).toString(2);
        }
        var timestamp = (new Date().getTime()).toString(2);
        return parseInt(timestamp, 2).toString() + parseInt(randomness, 2).toString();
    };

    var getCustomId = function () {
        var customId;
        if (cookieUtil.isSupport()) {
            customId = cookieUtil.get('YUNBA_CUSTOMID_COOKIE');
            if (!customId) {
                customId = 'uid_' + (new Date()).getTime() + parseInt(Math.random() * 10000, 10);
                cookieUtil.set('YUNBA_CUSTOMID_COOKIE', customId, new Date('January 1, 2100'));
            }
        }
        return customId;
    };

    var QOS0 = 0;
    var QOS1 = 1;
    var QOS2 = 2;

    /**
     * Yunba
     * @constructor
     * @param {Object} opts - options
     * @param {String} [opts.socketioServer] - socket.io server config
     * @param {String} appKey - yunba appKey
     */
    function Yunba(opts) {
        var options = opts || {};
        this.url = options.url || 'wss://portal-test.yunba.io:443';
        this.appKey = options.appKey || '';
        this.customId = options.customId || getCustomId();
        this.messageHandler = options.messageHandler || noop;
        this.socketioConnectErrorHandler = options.socketioConnectErrorHandler || noop;
        this.mqttConnectErrorHandler = options.mqttConnectErrorHandler || noop;
        this.autoConnect = options.autoConnect === undefined ? true : options.autoConnect;

        this.topics = {};
        this.callbacks = {};

        this.socketioReadyCallbacks = [];
        this.socketioDisconnectCallback = undefined;
        this.mqttReadyCallbacks = [];

        this.getStateCallbacks = [];
        this.getAliasListCallbacks = [];
        this.getTopicListCallbacks = [];
        this.socketioState = 'disconnected';
        this.mqttState = 'disconnected';

        this.log = new Log(opts.logLevel);
        if (this.autoConnect) {
            this._autoConnect();
        }
    }


    Yunba.create = function (opts) {
        return new Yunba(opts);
    };

    Yunba._cookieUtil = cookieUtil;

    Yunba.prototype = {
        constructor: Yunba,
        _socketioReady: function (fn) {
            this._ready(fn, this.socketioState === 'connected', this.socketioReadyCallbacks);
        },
        _mqttReady: function (fn) {
            this._ready(fn, this.mqttState === 'connected', this.mqttReadyCallbacks);
        },
        _ready: function (fn, condition, callbacks) {
            if (condition) {
                fn.call(this);
            } else {
                callbacks.push(fn);
            }
        },
        _callFnList: function (cbs, args) {
            forEach(cbs, function (fn) {
                if (typeof fn === 'function') {
                    fn.apply(this, args);
                }
            }, this);
        },

        _autoConnect: function () {
            this.log.info('[connection] auto connecting');
            this.connectSocketio();
            this.connectMqtt();
        },

        _initSocketEvents: function () {
            this.socketio.on('connect', bind(function () {
                this.log.info('[connection] socketio is ready');
                this.socketioState = 'connected';
                this._callFnList(this.socketioReadyCallbacks, [null]);
                // clear
                this.socketioReadyCallbacks.length = 0;
            }, this));

            this.socketio.on('reconnect', bind(function() {
                // 当 socketio 不是因为 booted 原因断开时, 它有自动重连机制,
                // 当自动重连成功后, 会触发 reconnect 事件
                this.log.info('[connection] socketio reconnected');
                this.connectMqtt();
            }, this));

            this.socketio.on('disconnect', bind(function (reason) {
                this.log.info('[connection] disconnect: %s', reason);
                this.socketioState = 'disconnected';
                this.mqttState = 'disconnected';
                if (typeof this.socketioDisconnectCallback === 'function') {
                    this.socketioDisconnectCallback(null, reason);
                }
            }, this));

            this.socketio.on('connect_error', bind(function (error) {
                this.log.info('[connection] socketio connect error');
                this.log.error(error);
                this.socketioState = 'disconnected';
                this._callFnList(this.socketioReadyCallbacks, [error]);
                this.socketioConnectErrorHandler(error);
                // clear
                this.socketioReadyCallbacks.length = 0;
            }, this));

            this.socketio.on('connack', bind(function (result) {
                if (result.success) {
                    this.log.info('[connection] mqtt is ready');
                    this.mqttState = 'connected';
                    this._callFnList(this.mqttReadyCallbacks, [null, result]);
                } else {
                    this.log.error('[connection] mqtt connect error: %s', result.msg);
                    this.mqttState = 'disconnected';
                    this.mqttConnectErrorHandler(new Error(result.msg));
                    this._callFnList(this.mqttReadyCallbacks, [new Error(result.msg), result]);
                }
                // clear
                this.mqttReadyCallbacks.length = 0;
            }, this));

            this.socketio.on('suback', bind(function (result) {
                var messageId = result.messageId;
                var cb = this.callbacks[messageId] || noop;
                if (result.success) {
                    this.log.info('[subscribe] succeed to subscribe to topic: %s', result.topic);
                    cb(null, result);
                } else {
                    this.log.info('[subscribe] failed to subscribe to topic: %s', result.topic);
                    cb(new Error(result.error_msg), result);
                }
                // remove cb
                this.callbacks[messageId] = null;
            }, this));

            this.socketio.on('unsuback', bind(function (result) {
                var messageId = result.messageId;
                var cb = this.callbacks[messageId] || noop;
                if (result.success) {
                    this.log.info('[unsubscribe] succeed to unsubscribe to topic: %s', result.topic);
                    cb(null, result);
                } else {
                    this.log.info('[unsubscribe] failed to unsubscribe to topic: %s', result.topic);
                    cb(new Error(result.error_msg), result);
                }
                // remove cb
                this.callbacks[messageId] = null;
            }, this));

            this.socketio.on('message', bind(function (data) {
                this.log.info('[message]' + this.customId + ' receive message: ');
                this.log.info(data);
                if (/\/p$/.test(data.topic)) {
                    try {
                        data.presence = JSON.parse(data.msg);
                    } catch (err) {
                        this.log.error('[message] error in parsing msg: %s', data.msg);
                    }
                }
                if (this.topics[data.topic] && this.topics[data.topic].messageHandlers.length > 0) {
                    forEach(this.topics[data.topic].messageHandlers, function (cb) {
                        cb(data);
                    }, this);
                } else {
                    this.messageHandler(data);
                }
            }, this));

            this.socketio.on('puback', bind(function (result) {
                var messageId = result.messageId;
                var cb = this.callbacks[messageId] || noop;
                this.callbacks[messageId] = null;
                if (result.success) {
                    this.log.info('[publish] succeed to publish message: %s', messageId);
                    cb(null, result);
                } else {
                    this.log.error('[publish] failed to publish message: %s', messageId);
                    cb(new Error('publish error'), result);
                }
            }, this));

            // set alias ack
            this.socketio.on('set_alias_ack', bind(function (result) {
                var cb = this.callbacks['setAlias'];
                this.callbacks['setAlias'] = null;
                if (result.success) {
                    this.log.info('[set alias] succeed to set alias');
                    cb(null, result);
                } else {
                    this.log.info('[set alias] failed to set alias');
                    cb(new Error(result.error_msg), result);
                }
            }, this));

            // get alias ack
            this.socketio.on('alias', bind(function (result) {
                if (result.alias !== undefined) {
                    result.success = true;
                }
                var cb = this.callbacks['getAlias'];
                this.callbacks['getAlias'] = null;
                if (result.success) {
                    this.log.info('[get alias] succeed to get alias');
                    cb(null, result);
                } else {
                    this.log.info('[get alias] failed to get alias');
                    cb(new Error(result.error_msg), result);
                }
            }, this));

            this.socketio.on('get_state_ack', bind(function (result) {
                if (result.success) {
                    this.log.info('[get state] succeed to set state');
                    this._callFnList(this.getStateCallbacks, [null, result]);
                } else {
                    this.log.info('[get state] failed to get state');
                    this._callFnList(this.getStateCallbacks, [new Error(result.error_msg), result]);
                }
                // clear
                this.getStateCallbacks.length = 0;
            }, this));


            this.socketio.on('get_alias_list_ack', bind(function (result) {
                if (result.success) {
                    this.log.info('[get alias list] succeed to get alias list');
                    this._callFnList(this.getAliasListCallbacks, [null, result]);
                } else {
                    this.log.info('[get alias list] failed to get alias list');
                    this._callFnList(this.getAliasListCallbacks,
                        [new Error(result.error_msg), result]);
                }
                // clear
                this.getAliasListCallbacks.length = 0;
            }, this));

            this.socketio.on('get_topic_list_ack', bind(function (result) {
                if (result.success) {
                    this.log.info('[get topic list] succeed to get topic list');
                    this._callFnList(this.getTopicListCallbacks, [null, result]);
                } else {
                    this.log.info('[get topic list] failed to get topic list');
                    this._callFnList(this.getTopicListCallbacks,
                        [new Error(result.error_msg), result]);
                }
                // clear
                this.getTopicListCallbacks.length = 0;
            }, this));
        },

        connectSocketio: function (cb) {
            cb = cb || noop;
            var state = this.socketioState;
            if (state === 'disconnected') {
                this.log.info('[connection] trying to connect to socketio');
                this.socketioState = 'connecting';
                // start to connect
                this.socketio = io(this.url, { 'force new connection': true });
                this.socketioReadyCallbacks.push(cb);
                this._initSocketEvents();
            } else if (state === 'connecting') {
                this.socketioReadyCallbacks.push(cb);
            } else {
                cb.call(this, null);
            }
        },

        connectMqtt: function (cb) {
            cb = cb || noop;
            var state = this.mqttState;
            if (state === 'disconnected') {
                this.log.info('[connection] trying to connect to mqtt');
                this.mqttState = 'connecting';
                this.mqttReadyCallbacks.push(cb);
                this._socketioReady(function () {
                    var opts = {
                        appkey: this.appKey
                    };
                    if (this.customId) {
                        opts.customid = this.customId;
                    }
                    this.socketio.emit('connect', opts);
                });
            } else if (state === 'connecting') {
                this.mqttReadyCallbacks.push(cb);
            } else {
                cb.call(this, null);
            }
        },

        disconnect: function (cb) {
            var socketio = this.socketio;
            if (socketio && socketio.socket.connected) {
                this.socketioDisconnectCallback = cb;
                socketio.socket.disconnect();
            } else {
                typeof cb === 'function' && cb(null);
            }
        },

        initTopic: function (topic) {
            this.topics[topic] = this.topics[topic] || {
                messageHandlers: []
            };
            return this.topics[topic];
        },

        /**
         * subscribe a topic
         * @param  {Object}   opts - options
         * @param {String} opts.topic - topic
         * @param {Function} messageHandler - handler for messages from the topic
         * @param {Function} cb   subscribe callback
         */
        subscribe: function (opts, cb) {
            this._mqttReady(function () {
                var options = (typeof opts === 'object' && opts) || {topic: opts};
                var topic = options.topic;
                var qos = options.qos || QOS1;
                var messageId = options.messageId || genMsgId();
                var messageHandler = options.messageHandler || this.messageHandler;
                if (!topic) {
                    return cb(new Error('opts.topic is required'));
                }
                this.initTopic(topic);
                this.log.info('[subscribe] try to subscribe to topic: %s', topic);
                this.socketio.emit('subscribe', { topic: topic, qos: qos, messageId: messageId});
                this.topics[topic].messageHandlers.push(messageHandler);
                this.callbacks[messageId] = cb;
            });
        },
        unsubscribe: function (opts, cb) {
            this._mqttReady(function () {
                cb = cb || noop;
                var options = (typeof opts === 'object' && opts) || {topic: opts};
                var topic = options.topic;
                var messageId = opts.messageId || genMsgId();
                if (!topic) {
                    return cb(new Error('topic is required'));
                }
                this.initTopic(topic);
                this.log.info('[unsubscribe] try to unsubscribe to topic: %s', topic);
                this.socketio.emit('unsubscribe', { topic: topic, messageId: messageId});
                // 移除所有或特定messageHandler
                var wrapCb = bind(function(err, result) {
                    var handlers = this.topics[topic].messageHandlers;
                    if (opts.messageHandler) {
                        var mh = options.messageHandler;
                        // 移除特定messageHandler
                        for (var i = 0; i < handlers.length; i++) {
                            if (handlers[i] === mh) {
                                handlers.splice(i, 1);
                                break;
                            }
                        }
                    } else {
                        // 移除所有messageHandler
                        handlers.length = 0;
                    }
                    cb(err, result);
                }, this);
                this.callbacks[messageId] = wrapCb;
            });
        },
        publish: function (opts, cb) {
            this._mqttReady(function () {
                opts = opts || {};
                var eventName;
                var messageId;
                var options = {
                    msg: opts.msg === undefined ? '' : opts.msg
                };

                if (opts.topic) {
                    options.topic = opts.topic;
                } else if (opts.alias) {
                    options.alias = opts.alias;
                } else {
                    return cb(new Error('topic or alias is required'));
                }

                eventName = options.alias ? 'publish_to_alias' : 'publish';
                messageId = opts.messageId || genMsgId();
                options.messageId = messageId;
                options.qos = opts.qos === undefined ? QOS1 : opts.qos;

                this.log.info('[publish] publish message: ');
                this.log.info(options);
                this.socketio.emit(eventName, options);
                this.callbacks[messageId] = cb;
            });
        },
        publish2: function(opts, cb) {
            this._mqttReady(function () {
                opts = opts || {};
                var eventName;
                var messageId;
                var options = {
                    msg: opts.msg === undefined ? '' : opts.msg
                };

                if (opts.topic) {
                    options.topic = opts.topic;
                } else if (opts.alias) {
                    options.alias = opts.alias;
                } else {
                    return cb(new Error('topic or alias is required'));
                }

                eventName = options.alias ? 'publish2_to_alias' : 'publish2';
                options.opts = opts.opts || {};
                messageId = options.opts.messageId || genMsgId();
                options.opts.messageId = messageId;
                options.opts.qos = options.opts.qos === undefined ? QOS1 : options.opts.qos;

                this.log.info('[publish2] publish message: ');
                this.log.info(options);
                this.socketio.emit(eventName, options);
                // qos > 0 才有ack
                if (options.opts.qos > 0) {
                    this.callbacks[messageId] = cb;
                } else {
                    //cb(null, {success: true, messageId: messageId});
                }
            });
        },
        getAlias: function (cb) {
            this._mqttReady(bind(function () {
                // It doesn't accept messageId
                this.callbacks['getAlias'] = cb;
                this.socketio.emit('get_alias');
            }, this));
        },
        setAlias: function (alias, cb) {
            this._mqttReady(bind(function () {
                // It doesn't accept messageId
                this.callbacks['setAlias'] = cb;
                this.socketio.emit('set_alias', { alias: alias });
            }, this));
        },
        getState: function (alias, cb) {
            this._mqttReady(bind(function () {
                this.getStateCallbacks.push(cb);
                this.socketio.emit('get_state', { alias: alias });
            }, this));
        },
        getTopicList: function (alias, cb) {
            this._mqttReady(bind(function () {
                this.getTopicListCallbacks.push(cb);
                this.socketio.emit('get_topic_list', { alias: alias });
            }, this));
        },
        getAliasList: function (topic, cb) {
            this._mqttReady(bind(function () {
                this.getAliasListCallbacks.push(cb);
                this.socketio.emit('get_alias_list', { topic: topic });
            }, this));
        }
    };
    console.log(Yunba);
    module.exports.Yunba = Yunba;
