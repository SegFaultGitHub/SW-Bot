var async = require("async");

module.exports = function (redisClient, callback) {
    function lock(key, callback) {
        var KEYS = {
            1: key,
            2: process.pid
        };
        var lua = "\
            if redis.call('exists', KEYS[1]) == 0 then \
                redis.call('set', KEYS[1], KEYS[2]); \
                return 'lock'; \
            end; \
            return 'wait' \
        ";
        redisClient.eval(lua, 2, KEYS[1], KEYS[2], callback);
    }

    function unlock(key, callback) {
        var KEYS = {
            1: key
        };
        var lua = "\
            redis.call('publish', KEYS[1], 'unlocked'); \
            redis.call('del', KEYS[1]); \
        ";
        redisClient.eval(lua, 1, KEYS[1], function (err) {
            if (err) return callback(err);
            return callback();
        });
    }

    function wait(key, callback) {
        async.waterfall([
            require("./redisClient.js"),
            function (subscriber, callback) {
                subscriber.subscribe(key);
                subscriber.on("message", function (channel, message) {
                    subscriber.unsubscribe(key);
                    return callback();
                });
            }
        ], callback);
    }

    function execute(key, prefun, postfun, callback) {
        async.waterfall([
            function (callback) {
                lock(key, callback);
            },
            function (value, callback) {
                if (value === "lock") {
                    async.waterfall([
                        prefun,
                        function (callback) {
                            unlock(key, callback);
                        }
                    ], callback);
                } else if (value === "wait") {
                    wait(key, callback);
                } else {
                    return callback(new Error("Wrong message: got " + value));
                }
            },
            postfun
        ], callback);
    }

    return callback(null, {
        lock: lock,
        unlock: unlock,
        wait: wait,
        execute: execute
    });
};