var async = require("async");

module.exports = function(callback) {
	function colorToHexa(color) {
		return color[0] * 0x10000 + color[1] * 0x100 + color[2];
	}

	function footer() {
		return {
			text: "Bot créé par SegFault#5814"
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

		embed.footer = footer();

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
			help: {
				usage: "!redis KEY [KEY ...]",
				message: "Affiche les valeurs redis demandées",
			},
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
			help: {
				usage: "!del KEY",
				message: "Supprime la valeur redis spécifiée"
			},
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
				var name = args.join(" ");
				if (name.length < 1)
					return callback(null, {
						type: "MISUSED"
					});
				libs.swapi.mob(name, force, function(err, res) {
					if (err) return callback(err);
					else if (res.length === 0) {
						discordClient.sendMessage({
							to: channelID,
							embed: {
								description: "Aucun monstre trouvé pour la recherche \"" + name + "\""
							}
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
					} else if (res.length <= 10) {
						var embed = {
							description: "Plusieurs monstres trouvés pour la recherche \"" + name + "\", affinez votre recherche",
							fields: []
						};
						async.times(res.length, function(n, callback) {
							var item = res[n];
							var field = {
								name: "Résultat #" + (n + 1),
								value: "~~[" + item.title + "](http://localhost:3000/mob/" + item.mob.family.redis() + "/" + item.mob.element.redis() + "/" + channelID + ")~~ (lien non fonctionnel)"
							};
							embed.fields.push(field);
						});
						embed.footer = footer();
						discordClient.sendMessage({
							to: channelID,
							embed: embed
						}, function (err) {
							if (err) return callback(err);
							return callback(null, {
								type: "GOOD"
							});
						});
					} else {
						discordClient.sendMessage({
							to: channelID,
							embed: {
								description: "Trop de résultats pour la recherche \"" + name + "\", affinez votre recherche"
							}
						}, function(err) {
							if (err) return callback(err);
							return callback(null, {
								type: "GOOD"
							});
						});
					}
				});
			},
			help: {
				usage: "!mob [--name] MOB_NAME",
				message: "Affiche les informations sur le monstre demandé"
			}
		},
		help: {
			func: function(user, userID, channelID, message, evt, args, callback) {
				if (args.length === 0)
					sendHelpMessage(user, userID, channelID, message, evt, Object.keys(commands), callback);
				else
					sendHelpMessage(user, userID, channelID, message, evt, args, callback);
			},
			help: {
				usage: "!help [COMMAND ...]",
				message: "Affiche les informations sur les commandes demandées"
			}
		},
		crash: {
			func: function(user, userID, channelID, message, evt, args, callback) {
				throw new Error();
			},
			help: {
				usage: "!crash",
				message: "Fait crasher le bot"
			},
			devOnly: true
		}
	};

	function sendHelpMessage(user, userID, channelID, message, evt, cmds, callback) {
		async.waterfall([
			function(callback) {
				return callback(null, cmds.filter(function(cmd) {
					return Object.keys(commands).indexOf(cmd) !== -1;
				}).filter(function(elem, index, self) {
				    return index == self.indexOf(elem);
				}));
			},
			function(cmds, callback) {
				if (cmds.length === 0) {
					return discordClient.sendMessage({
							to: channelID,
							message: "La commande demandée n'existe pas"
					}, function(err) {
						if (err) return callback(err);
						return callback(null, {
							type: "GOOD"
						})
					});
				}
				var embed = {
					title: "Aide",
					fields: []
				}
				cmds.forEach(function(cmd) {
					if (commands[cmd].devOnly && botConfig.adminUserID !== userID) return;
					var field = {
						name: cmd,
						value: "`" + commands[cmd].help.usage + "`\n" + commands[cmd].help.message
					};
					embed.fields.push(field);
				});
				embed.footer = footer();
				discordClient.sendMessage({
					to: channelID,
					embed: embed
				}, function(err) {
					if (err) return callback(err);
					return callback(null, {
						type: "GOOD"
					})
				});
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
						sendHelpMessage(user, userID, channelID, message, evt, [cmd], callback);
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
