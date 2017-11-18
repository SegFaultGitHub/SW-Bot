GLOBAL.logger = require("winston");
GLOBAL.config = require("./config.json");

var Discord = require("discord.io");
var auth = require("./auth.json");
var async = require("async");
var redis = require("redis");
var merge = require("merge");
var express = require("express");

GLOBAL.libs = {};
// Initilize libs
async.parallel({
	commands: require("./commands.js"),
	swapi: require("./SWApi.js")
}, function(err, results) {
	libs = merge(results, libs);
});

// Express server
var app = express();
var port = 3000;
app.listen(port, function() {
	logger.info("Express server listening on port " + port);
})
app.get("/ping", function(req, res) {
	res.send("pong");
});

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {
	colorize: true
});
logger.level = "debug";

// Initialize Discord Bot
GLOBAL.discordClient = new Discord.Client({
	token: auth.token,
	autorun: true
});
GLOBAL.botConfig = config.botConfig;
GLOBAL.redisClient = redis.createClient({
	host: config.redis.host,
	port: config.redis.port
});
redisClient.select(config.redis.db, function(err) {
	if (err) return logger.error(err);
	logger.info("Redis client connected to db" + config.redis.db);
});

function discordClientSendMessage(options, callback) {
	if (!options.to) return callback("No channelID set.");
	discordClient.sendMessage(options, function(err, res) {
		if (options.expire)
			setTimeout(function() {
				discordClient.deleteMessage({
					channelID: res.channel_id,
					messageID: res.id
				});
			}, options.expire * 1e3);
		return callback(err, res);
	});
}

function now(plus) {
	return new Date().getTime() + (plus || 0) * 1e3;
}

function messageListener(user, userID, channelID, message, evt) {
	if (userID === discordClient.id) return;

	loweredMessage = message.toLowerCase();
	trimedMessage = message.trim();
	trimedMessage = message.replace(/\s+/, " ");
	var redisKey = evt.d.author.username + "#" + evt.d.author.discriminator;

	async.waterfall([
		//initRedisKeys:
		function(callback) {
			async.parallel([
				function(callback) {
					redisClient.hsetnx(redisKey, "messages", 0, callback);
				},
				function(callback) {
					redisClient.hsetnx(redisKey, "lastMessage", 0, callback);
				},
				function(callback) {
					redisClient.hset(redisKey, "id", userID, callback);
				}
			], function(err) {
				if (err) return callback(err);
				return callback();
			});
		},

		//updateRedisKeys:
		function(callback) {
			async.waterfall([
				function(callback) {
					redisClient.hget(redisKey, "messages", callback);
				},
				function(messages, callback) {
					redisClient.hset(redisKey, "messages", Number(messages) + 1, function(err) {
						if (err) return callback(err);
						return callback();
					});
				},
				function(callback) {
					redisClient.hset(redisKey, "lastMessage", now(), callback);
				}
			], function(err) {
				if (err) return callback(err);
				return callback();
			});
		},

		//commands:
		function(callback) {
			if (trimedMessage.substring(0, botConfig.prefix.length) === botConfig.prefix) {
				libs.commands.executeCommand(user, userID, channelID, message, evt, callback);
			} else {
				return callback();
			}
		}
	], function(err) {
		if (err) logger.error(err);
		logger.info("Done");
	});
}

discordClient.on("ready", function(evt) {
	logger.info("Logged in as: " + discordClient.username + " - (" + discordClient.id + ")");
});

discordClient.on("message", messageListener);

process.on("uncaughtException", function(err) {
	discordClient.sendMessage({
		to: botConfig.adminChannelID,
		message: "<@" + botConfig.adminUserID + ">```\n" + err.stack + "\n```"
	});
});
