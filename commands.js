var async = require("async");

module.exports = function(callback) {
	var commands = {
		redis: {
			func: function(user, userID, channelID, message, evt, args, callback) {
				if (args.length === 0)
					return callback(null, {
						type: "MISUSED"
					});
				async.eachSeries(args, function(redisKey, callback) {
					async.waterfall([
						function(callback) {
							return redisClient.hgetall(redisKey, callback);
						},
						function(redis, callback) {
							var str = "no data";
							if (redis) str = JSON.stringify(redis);
							logger.info(redisKey + ": " + str);
							return callback();
						}
					], callback);
				}, function(err) {
					if (err) return callback(err);
					return callback(null, {
						type:"GOOD"
					});
				});
			},
			help: "Affiche les données redis demandées"
		},
		mob: {
			func: function(user, userID, channelID, message, evt, args, callback) {
				if (args.length === 0)
					return callback(null, {
						type: "MISUSED"
					});
				return callback(null, {
					type: "GOOD"
				});
			},
			help: "Affiche les informations sur le monstre demandé{ret}!mob <nom du mob>"
		},
		help: {
			func: function(user, userID, channelID, message, evt, args, callback) {
				if (args.length === 0)
					sendHelpMessage(channelID, Object.keys(commands), callback);
				else
					sendHelpMessage(channelID, args, callback);
			},
			help: "Affiche les informations sur les commandes"
		}
	};

	function sendHelpMessage(channelID, cmds, callback) {
		async.waterfall([
			function(callback) {
				return callback(null, cmds.filter(function(cmd) {
					return cmds.indexOf(cmd) !== -1;
				}).filter(function(elem, index, self) {
				    return index == self.indexOf(elem);
				}));
			},
			function(cmds, callback) {
				var max = 0;
				cmds.forEach(function(cmd) {
					if (max < cmd.length) max = cmd.length;
				});
				return callback(null, max, cmds);
			},
			function(size, cmds, callback) {
				var result = "```";
				cmds.forEach(function(cmd) {
					result += "\n*" + cmd + "*" + " ".repeat(size - cmd.length + 2) + commands[cmd].help.replace("{ret}", "\n" + " ".repeat(size + 4));
				});
				result += "\n```";
				discordClient.sendMessage({
					to: channelID,
					message: result
				}, callback);
			}
		], callback);
	}

	function executeCommand(user, userID, channelID, message, evt, callback) {
		var args = message.split(" ");
		var cmd = args[0].substring(botConfig.prefix.length, args[0].length);
		if (Object.keys(commands).indexOf(cmd) !== -1) {
			args = args.splice(1);
			async.waterfall([
				function(callback) {
					commands[cmd].func(user, userID, channelID, message, evt, args, callback);
				},
				function(retval, callback) {
					if (retval.type === "MISUSED") {
						sendHelpMessage(channelID, [cmd], callback);
					} else {
						return callback();
					}
				}
			], callback);
		} else {
			return callback("Command " + command + " does not exist.");
		}
	}

	return callback(null, {
		executeCommand: executeCommand
	});
};