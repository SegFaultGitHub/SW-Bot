GLOBAL.logger = require("winston");
GLOBAL.config = require("./config.json");

// Modules
var Discord = require("discord.io");
var async = require("async");
var redis = require("redis");
var merge = require("merge");
var express = require("express");
var commandLineArgs = require('command-line-args');

// Command line args
GLOBAL.options = commandLineArgs([{
	name: 'debug',
	alias: 'd',
	type: Boolean
}]);

// Initilize libs
GLOBAL.libs = {};
async.parallel({
	commands: require("./commands.js"),
	swapi: require("./SWApi.js"),
	utils: require("./utils.js")
}, function (err, results) {
	libs = merge(results, libs);
});

// Express server
var app = express();
var port = options.debug ? 29061 : 2906;
app.listen(port, function () {
	logger.info("Express server listening on port " + port);
});
app.get("/mob/:family/:element/:channelID", function (req, res) {
	async.waterfall([
		function (callback) {
			redisClient.get((options.debug ? "debug:" : "") + "mob:" + req.params.family + ":" + req.params.element, callback);
		}
	], function (err, item) {
		if (err) return res.status(500);
		else if (!item) return res.status(404);
		var embed = libs.commands.buildMobEmbedMessage(JSON.parse(item));
		discordClient.sendMessage({
			to: req.params.channelID,
			embed: embed
		}, function (err) {
			res.status(err ? 500 : 200).send(embed);
		});
	});
});
app.get("/disconnect", function (req, res) {
	discordClient.disconnect();
	res.sendStatus(200);
});

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {
	colorize: true,
	timestamp: true
});
logger.level = "debug";

// Initialize Discord Bot
GLOBAL.discordClient = new Discord.Client({
	token: options.debug ? process.env.DISCORD_DEV_TOKEN : process.env.DISCORD_TOKEN,
	autorun: true
});
GLOBAL.botConfig = config.botConfig;
if (options.debug) botConfig.prefix = "?";

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

GLOBAL.now = function (plus) {
	return new Date().getTime() + (plus || 0) * 1e3;
};

function messageListener(user, userID, channelID, message, evt) {
	if (userID === discordClient.id) return;

	loweredMessage = message.toLowerCase();
	trimedMessage = message.trim();
	trimedMessage = message.replace(/\s+/, " ");
	var redisKey = (options.debug ? "debug:" : "") + "user:" + userID;

	async.waterfall([
		//initUserRedisKeys:
		function (callback) {
			async.parallel([
				function (callback) {
					redisClient.hsetnx(redisKey, "messages", 0, callback);
				},
				function (callback) {
					redisClient.hsetnx(redisKey, "lastMessage", 0, callback);
				},
				function (callback) {
					redisClient.hsetnx(redisKey, "name", user, callback);
				},
				function (callback) {
					redisClient.hsetnx(redisKey, "commands-good", 0, callback);
				},
				function (callback) {
					redisClient.hsetnx(redisKey, "commands-misused", 0, callback);
				}
			], function (err) {
				if (err) return callback(err);
				return callback();
			});
		},

		//updateUserRedisKeys:
		function (callback) {
			async.waterfall([
				function (callback) {
					redisClient.hincrby(redisKey, "messages", 1, function (err) {
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
					redisClient.get((options.debug ? "debug:" : "") + "channels", callback);
				},
				function (channels, callback) {
					channels = channels ? channels.split(",") : [];
					if (channels.indexOf(channelID) === -1) channels.push(channelID);
					redisClient.set((options.debug ? "debug:" : "") + "channels", channels.join(","), function (err) {
						if (err) return callback(err);
						return callback();
					});
				}
			], function (err) {
				if (err) return callback(err);
				return callback();
			});
		},

		//updateServerKeys:
		function (callback) {
			async.waterfall([
				function (callback) {
					//discordClient.channels[channelID].guild_id
					callback();
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

var firstConnection = true;
discordClient.on("ready", function (evt) {
	logger.info("Logged in as: " + discordClient.username + " - (" + discordClient.id + ")");
	discordClient.sendMessage({
		to: botConfig.adminChannelID,
		message: firstConnection ? "Connected" : "Reconnected"
	});

	if (!firstConnection) return;
	firstConnection = false;

	redisClient.set((options.debug ? "debug:" : "") + "reconnections", 0);
	GLOBAL.connectionDate = now();

	if (!options.debug) {
		// Regular uptime notification
		setInterval(function () {
			libs.commands.executeCommand(null, discordClient.id, botConfig.uptimeChannelID, "!stats", null, function (err) {});
		}, 5 * 60e3);

		// Siege alerts
		setTimeout(function alert() {
			var siegeState = libs.commands.getSiegeState();

			setTimeout(function () {
				discordClient.sendMessage({
					to: config.siege.channelID,
					message: "@everyone",
					embed: config.siege.events[siegeState.index].embed
				}, function (err) {
					if (err) logger.error(err);
					alert();
				});
			}, siegeState.timeToWait * 1000);
		}, 0);
	}

	// Reaction
	setTimeout(function followMessages() {
		async.waterfall([
			function (callback) {
				redisClient.get((options.debug ? "debug:" : "") + "channels", callback);
			},
			function (channels, callback) {
				if (channels) {
					async.each(channels.split(","), function (channel, callback) {
						async.parallel({
							mobsList: function (callback) {
								async.waterfall([
									function (callback) {
										redisClient.get((options.debug ? "debug:" : "") + "follow:mobList:" + channel, callback);
									},
									function (messageID, callback) {
										redisClient.hgetall((options.debug ? "debug:" : "") + "follow:mobList:" + channel + ":" + messageID, function (err, res) {
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
															redisClient.get((options.debug ? "debug:" : "") + "mob:" + value["mob" + n], callback);
														},
														function (item, callback) {
															if (!item) return callback(null, false);
															discordClient.sendMessage({
																to: channel,
																embed: libs.commands.buildMobEmbedMessage(JSON.parse(item))
															}, function (err) {
																if (err) return callback(err);
																async.parallel([
																	function (callback) {
																		redisClient.del((options.debug ? "debug:" : "") + "follow:mobList:" + channel, callback);
																	},
																	function (callback) {
																		redisClient.del((options.debug ? "debug:" : "") + "follow:mobList:" + channel + ":" + messageID, callback);
																	}
																], callback);
															});
														}
													], callback);
												} else return callback();
											});
										}, function (err) {
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

discordClient.on("disconnect", function (err, code) {
	logger.info("Bot disconnected, reconnecting.\nErr: " + code);
	redisClient.incr((options.debug ? "debug:" : "") + "reconnections");
	GLOBAL.lastReconnection = Date.now();
	discordClient.connect();
});

discordClient.on("error", function (err) {
	logger.info(err);
});

process.on("uncaughtException", function (err) {
	discordClient.sendMessage({
		to: botConfig.adminChannelID,
		message: "```\n" + err.stack + "\n```"
	});
});