var async = require("async");

module.exports = function(callback) {
	var commands = {
		redis: {
			func: function(user, userID, channelID, message, evt, args, callback) {
				if (args.length === 0)
					return callback(null, {
						type: "MISUSED"
					});
				args = args.filter(function(elem, index, self) {
				    return index == self.indexOf(elem);
				});
				async.eachSeries(args, function(redisKey, callback) {
					async.waterfall([
						function(callback) {
							return redisClient.hgetall(redisKey, callback);
						},
						function(redis, callback) {
							discordClient.sendMessage({
								to: channelID,
								message: "```\n" + JSON.stringify({
										key: redisKey,
										value: redis || null
									}, null, 2) + "\n```"
							}, callback);
						}
					], callback);
				}, function(err) {
					if (err) return callback(err);
					return callback(null, {
						type:"GOOD"
					});
				});
			},
			help: "!redis KEY [KEY ...]{ret}Affiche les valeurs redis demandées",
			devOnly: true
		},
		del: {
			func: function(user, userID, channelID, message, evt, args, callback) {
				if (args.length !== 1)
					return callback(null, {
						type: "MISUSED"
					});
				else redisClient.del(args[0], function(err) {
					if (err) return callback(err);
					return callback(null, {
						type: "GOOD"
					})
				});
			},
			help: "!del KEY{ret}Supprime la valeur redis spécifiée",
			devOnly: true
		},
		mob: {
			func: function(user, userID, channelID, message, evt, args, callback) {
				if (args.length === 0)
					return callback(null, {
						type: "MISUSED"
					});
				libs.swapi.mob(args.join(" "), function(err, res) {
					if (err) return callback(err);
					else if (res.length === 0) {
						discordClient.sendMessage({
							to: channelID,
							message: "```\nAucun monstre trouvé pour la recherche \"" + args.join(" ") + "\"\n```"
						}, function(err) {
							if (err) return callback(err);
							return callback(null, {
								type: "GOOD"
							});
						});
					} else {
						res.length = Math.min(res.length, 5);
						async.times(res.length, function(n, callback) {
							var item = res[n];
							var embed = {
								title: item.title,
								url: libs.swapi.baseURL + item.href,
								thumbnail: {
									url: item.mob.urls.unawaken
								}
							};
							if (item.mob.urls.awaken);
								embed.image = {
									url: item.mob.urls.awaken
								};
							discordClient.sendMessage({
								to: channelID,
								embed: embed
							}, function(err) {
								if (err) return callback(err);
								return callback(null, {
									type: "GOOD"
								});
							});
						});
					}
				});
			},
			help: "!mob MOB_NAME{ret}Affiche les informations sur le monstre demandé"
		},
		help: {
			func: function(user, userID, channelID, message, evt, args, callback) {
				if (args.length === 0)
					sendHelpMessage(user, userID, channelID, message, evt, Object.keys(commands), callback);
				else
					sendHelpMessage(user, userID, channelID, message, evt, args, callback);
			},
			help: "!help [COMMAND ...]{ret}Affiche les informations sur les commandes demandées"
		},
		crash: {
			func: function(user, userID, channelID, message, evt, args, callback) {
				throw new Error();
			},
			help: "!crash{ret}Fait crasher le bot",
			devOnly: true
		}
	};

	function sendHelpMessage(user, userID, channelID, message, evt, cmds, callback) {
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
					if (commands[cmd].devOnly && botConfig.adminUserID !== userID) return;
					result += "\n*" + cmd + "*" + " ".repeat(size - cmd.length + 2) +
						commands[cmd].help.replace("{ret}", "\n" + " ".repeat(size + 4)) +
						"\n";
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
			if (commands[cmd].devOnly && botConfig.adminUserID !== userID) return callback();
			args = args.splice(1);
			async.waterfall([
				function(callback) {
					commands[cmd].func(user, userID, channelID, message, evt, args, callback);
				},
				function(retval, callback) {
					if (retval.type === "MISUSED") {
						sendHelpMessage(user, userID, channelID, message, evt, channelID, [cmd], callback);
					} else {
						return callback();
					}
				}
			], callback);
		} else {
			return callback("Command " + cmd + " does not exist.");
		}
	}

	return callback(null, {
		executeCommand: executeCommand
	});
};
