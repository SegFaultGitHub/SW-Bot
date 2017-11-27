GLOBAL.logger = require("winston");
GLOBAL.config = require("./config.json");

var Discord = require("discord.io");
var async = require("async");
var redis = require("redis");
var merge = require("merge");
var express = require("express");

GLOBAL.libs = {};
// Initilize libs
async.parallel({
	commands: require("./commands.js"),
	swapi: require("./SWApi.js"),
	utils: require("./utils.js")
}, function (err, results) {
	libs = merge(results, libs);
});

// Express server
var app = express();
var port = 3000;
app.listen(port, function () {
	logger.info("Express server listening on port " + port);
});
app.get("/mob/:family/:element/:channelID", function (req, res) {
	async.waterfall([
		function (callback) {
			redisClient.get("mob:" + req.params.family + ":" + req.params.element, callback);
		}
	], function (err, item) {
		if (err) return res.status(500);
		discordClient.sendMessage({
			to: req.params.channelID,
			embed: libs.commands.buildMobEmbedMessage(JSON.parse(item))
		}, function (err) {
			res.status(err ? 500 : 200);
		});
	});
});

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {
	colorize: true
});
logger.level = "debug";

// Initialize Discord Bot
GLOBAL.discordClient = new Discord.Client({
	token: process.env.DISCORD_TOKEN,
	autorun: true
});
GLOBAL.botConfig = config.botConfig;

// Initialize redis client
GLOBAL.redisClient = redis.createClient({
	host: config.redis.host,
	port: config.redis.port
});
redisClient.select(config.redis.db, function (err) {
	if (err) return logger.error(err);
	logger.info("Redis client connected to db" + config.redis.db);
});

// String prototypes
String.prototype.reformat = function () {
	var str = this.toLowerCase();
	str = str.replace(/(á|à|ä|â)/g, "a");
	str = str.replace(/(é|è|ë|ê)/g, "e");
	str = str.replace(/(í|ì|ï|î)/g, "i");
	str = str.replace(/(ó|ò|ö|ô)/g, "o");
	str = str.replace(/(ú|ù|ü|û)/g, "u");
	str = str.replace(/(ÿ)/g, "y");
	str = str.replace(/(ç)/g, "c");
	str = str.replace(/\s+/g, " ");
	return str;
};

String.prototype.redis = function () {
	var str = this.reformat();
	str = str.replace(/(\s|')/g, "-");
	return str;
}

String.prototype.capitalize = function () {
	var index = 0;
	var str = this.replace(/\s+/g, " ");
	str = str.split(" ");
	str.forEach(function (_, index, array) {
		array[index] = array[index][0].toUpperCase() + array[index].substring(1);
	});
	return str.join(" ");
};

function discordClientSendMessage(options, callback) {
	if (!options.to) return callback("No channelID set.");
	discordClient.sendMessage(options, function (err, res) {
		if (options.expire)
			setTimeout(function () {
				discordClient.deleteMessage({
					channelID: res.channel_id,
					messageID: res.id
				});
			}, options.expire * 1e3);
		return callback(err, res);
	});
}

GLOBAL.now = function(plus) {
	return new Date().getTime() + (plus || 0) * 1e3;
};

function messageListener(user, userID, channelID, message, evt) {
	if (userID === discordClient.id) return;

	loweredMessage = message.toLowerCase();
	trimedMessage = message.trim();
	trimedMessage = message.replace(/\s+/, " ");
	var redisKey = evt.d.author.username + "#" + evt.d.author.discriminator;

	async.waterfall([
		//initRedisKeys:
		function (callback) {
			async.parallel([
				function (callback) {
					redisClient.hsetnx(redisKey, "messages", 0, callback);
				},
				function (callback) {
					redisClient.hsetnx(redisKey, "lastMessage", 0, callback);
				},
				function (callback) {
					redisClient.hset(redisKey, "id", userID, callback);
				}
			], function (err) {
				if (err) return callback(err);
				return callback();
			});
		},

		//updateRedisKeys:
		function (callback) {
			async.waterfall([
				function (callback) {
					redisClient.hget(redisKey, "messages", callback);
				},
				function (messages, callback) {
					redisClient.hset(redisKey, "messages", Number(messages) + 1, function (err) {
						if (err) return callback(err);
						return callback();
					});
				},
				function (callback) {
					redisClient.hset(redisKey, "lastMessage", now(), function (err) {
						if (err) return callback(err);
						return callback();
					});
				},
				function (callback) {
					redisClient.get("channels", callback);
				},
				function (channels, callback) {
					channels = channels ? channels.split(",") : [];
					if (channels.indexOf(channelID) === -1) channels.push(channelID);
					redisClient.set("channels", channels.join(","), callback);
				}
			], function (err) {
				if (err) return callback(err);
				return callback();
			});
		},

		//commands:
		function (callback) {
			if (trimedMessage.substring(0, botConfig.prefix.length) === botConfig.prefix) {
				libs.commands.executeCommand(user, userID, channelID, message, evt, callback);
			} else {
				return callback();
			}
		}
	], function (err) {
		if (err) logger.error(err);
		logger.info("Done");
	});
}

discordClient.on("ready", function (evt) {
	logger.info("Logged in as: " + discordClient.username + " - (" + discordClient.id + ")");
	GLOBAL.connectionDate = now();

	setInterval(function () {
		libs.commands.executeCommand(null, discordClient.id, botConfig.uptimeChannelID, "!uptime", null, function (err) { });
	}, 60e3);

	// Reaction
	setTimeout(function followMessages() {
		async.waterfall([
			function (callback) {
				redisClient.get("channels", callback);
			},
			function (channels, callback) {
				if (channels) {
					async.each(channels.split(","), function (channel, callback) {
						async.parallel({
							mobsList: function (callback) {
								async.waterfall([
									function (callback) {
										redisClient.get("follow:mobList:" + channel, callback);
									},
									function (messageID, callback) {
										redisClient.hgetall("follow:mobList:" + channel + ":" + messageID, function (err, res) {
											return callback(null, res, messageID);
										});
									},
									function (value, messageID, callback) {
										if (!messageID) return callback(null, false);
										async.times(value.count, function (n, callback) {
											discordClient.getReaction({
												channelID: channel,
												messageID: messageID,
												reaction: libs.commands.emojiNumbers[n]
											}, function (err, res) {
												if (err) return callback(err);
												if (res.length > 1) {
													async.waterfall([
														function (callback) {
															redisClient.get("mob:" + value["mob" + n], callback);
														},
														function (item, callback) {
															if (!item) return callback(null, false);
															discordClient.sendMessage({
																to: channel,
																embed: libs.commands.buildMobEmbedMessage(JSON.parse(item))
															}, function(err) {
																if (err) return callback(err);
																async.parallel([
																	function(callback) {
																		redisClient.del("follow:mobList:" + channel, callback);
																	},
																	function(callback) {
																		redisClient.del("follow:mobList:" + channel + ":" + messageID, callback);
																	}
																], callback);
															});
														}
													], callback);
												} else return callback();
											});
										}, function(err) {
											if (err) return callback(err);
											setTimeout(callback, 200);
										});
									}
								], callback);
							}
						}, callback);
					}, callback);
				} else return callback();
			}
		], function (err) {
			if (err) logger.error(err);
			setTimeout(followMessages, 250);
		});
	}, 0);
});

discordClient.on("message", messageListener);

discordClient.on("disconnect", function () {
	logger.info("Bot disconnected, reconnecting.");
	bot.connect();
});

process.on("uncaughtException", function (err) {
	discordClient.sendMessage({
		to: botConfig.adminChannelID,
		message: "<@" + botConfig.adminUserID + ">```\n" + err.stack + "\n```"
	});
});