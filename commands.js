var async = require("async");

module.exports = function(callback) {
	function colorToHexa(color) {
		return color[0] * 0x10000 + color[1] * 0x100 + color[2];
	}

	function footer() {
		return {
			icon_url: "https://camo.githubusercontent.com/7710b43d0476b6f6d4b4b2865e35c108f69991f3/68747470733a2f2f7777772e69636f6e66696e6465722e636f6d2f646174612f69636f6e732f6f637469636f6e732f313032342f6d61726b2d6769746875622d3235362e706e67",
			text: "[GitHub](https://github.com/SegFaultGitHub/SW-Bot)"
		};
	}

	function buildMobEmbedMessage(item) {
		var embed = {
			title: item.title,
			url: libs.swapi.baseURL + item.href,
			description: ":star:".repeat(item.mob.stars),
			thumbnail: {
				url: item.mob.urls.unawaken
			},
			fields: []
		};
		switch (item.mob.element) {
			case "dark":
				embed.color = colorToHexa([160, 55, 214]);
				break;
			case "fire":
				embed.color = colorToHexa([255, 95, 0]);
				break;
			case "water":
				embed.color = colorToHexa([0, 153, 186]);
				break;
			case "light":
				embed.color = colorToHexa([243, 241, 227]);
				break;
			case "wind":
				embed.color = colorToHexa([255, 195, 0]);
				break;
		}
		embed.fields.push({
			name: "*Famille*",
			value: item.mob.family.capitalize(),
			inline: true
		});
		embed.fields.push({
			name: "*Élément*",
			value: libs.utils.translate(item.mob.element),
			inline: true
		});
		if (item.mob.urls.awaken) {
			embed.fields.push({
				name: "*Nom*",
				value: item.mob.name.capitalize(),
				inline: true
			});
			embed.fields.push({
				name: "*Éveil*",
				value: item.mob.awake,
				inline: true
			});
			embed.image = {
				url: item.mob.urls.awaken
			};
		}
		embed.fields.push({
			name: "*Type*",
			value: libs.utils.translate(item.mob.type)
		}, {
			name: "*Statistiques*",
			value: "• **Points de vie :** " + item.mob.stats[0] + "\n" +
			"• **Attaque :** " + item.mob.stats[1] + "\n" +
			"• **Défense :** " + item.mob.stats[2] + "\n" +
			"• **Vitesse :** " + item.mob.stats[3] + "\n\n" +
			"• **Taux critique :** " + item.mob.stats[4] + "\n" +
			"• **Dégâts critiques :** " + item.mob.stats[5] + "\n" +
			"• **Résistance :** " + item.mob.stats[6] + "\n" +
			"• **Précision :** " + item.mob.stats[7]
		});

		return embed;
	}

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
				var redis_ = {};
				async.eachSeries(args, function(redisKey, callback) {
					async.waterfall([
						function(callback) {
							return redisClient.hgetall(redisKey, callback);
						},
						function(redis, callback) {
							redis_[redisKey] = redis || null;
							return callback();
						}
					], callback);
				}, function(err) {
					if (err) return callback(err);
					discordClient.sendMessage({
						to: channelID,
						message: "```\n" + JSON.stringify(redis_, null, 2) + "\n```"
					}, function(err) {
						if (err) return callback(err);
						return callback(null, {
							type:"GOOD"
						});
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
					});
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
				var force = false;
				if (args[0] === "--name") {
					args = args.splice(1);
					force = true;
				}
				libs.swapi.mob(args.join(" "), force, function(err, res) {
					if (err) return callback(err);
					else if (res.length === 0) {
						discordClient.sendMessage({
							to: channelID,
							message: "nAucun monstre trouvé pour la recherche \"" + args.join(" ") + "\""
						}, function(err) {
							if (err) return callback(err);
							return callback(null, {
								type: "GOOD"
							});
						});
					} else if (res.length === 1) {
						var item = res[0];
						discordClient.sendMessage({
							to: channelID,
							embed: buildMobEmbedMessage(item)
						}, function (err) {
							if (err) return callback(err);
							return callback(null, {
								type: "GOOD"
							});
						});
					} else {
						var message = "Plusieurs monstres trouvés pour la recherche \"" + args.join(" ") + "\", affinez votre recherche";
						async.times(res.length, function(n, callback) {
							var item = res[n];
							message += "\n• [" + item.title + "](http://172.31.32.4:3000/mob/" + item.mob.family + "/" + item.mob.element + "/" + channelID + ")";
						});
						discordClient.sendMessage({
							to: channelID,
							message: message
						}, function (err) {
							if (err) return callback(err);
							return callback(null, {
								type: "GOOD"
							});
						});
					}
				});
			},
			help: "!mob [--name] MOB_NAME{ret}Affiche les informations sur le monstre demandé"
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
		executeCommand: executeCommand,
		buildMobEmbedMessage: buildMobEmbedMessage
	});
};
