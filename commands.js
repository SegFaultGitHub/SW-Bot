var async = require("async");

module.exports = function (callback) {
	var emojiNumbers = [
		"1⃣",
		"2⃣",
		"3⃣",
		"4⃣",
		"5⃣",
		"6⃣",
		"7⃣",
		"8⃣",
		"9⃣",
		"🔟"
	];

	function getSiegeState() {
		var dateNow = new Date();
		dateNow = dateNow.getUTCDay() * 24 * 60 * 60 +
			dateNow.getUTCHours() * 60 * 60 +
			dateNow.getUTCMinutes() * 60 +
			dateNow.getUTCSeconds();
		var index = 0;
		while (index < config.siege.events.length &&
			dateNow >= config.siege.events[index].date.day * 24 * 60 * 60 +
			config.siege.events[index].date.hours * 60 * 60 +
			config.siege.events[index].date.minutes * 60) {
			index++;
		}
		var nextAlert = config.siege.events[index].date.day * 24 * 60 * 60 +
			config.siege.events[index].date.hours * 60 * 60 +
			config.siege.events[index].date.minutes * 60;
		
		if (dateNow > nextAlert) dateNow -= 7 * 24 * 60 * 60;
		var timeToWait = nextAlert - dateNow;

		return {
			index: index,
			timeToWait: timeToWait
		}
	}

	function devCmd(cmd, userID) {
		return commands[cmd].devOnly && botConfig.adminUserIDs.indexOf(userID) === -1;
	}

	function colorToHexa(color) {
		return color[0] * 0x10000 + color[1] * 0x100 + color[2];
	}

	function footer() {
		return {
			text: "Bot créé par SegFault#5814"
		};
	}

	function secondsToTimestamp(epoch) {
		epoch = epoch / 1000;
		var uptime = {
			days: Math.floor(epoch / (60 * 60 * 24)),
			hours: Math.floor(epoch % (60 * 60 * 24) / (60 * 60)),
			minutes: Math.floor(epoch % (60 * 60) / 60),
			seconds: Math.floor(epoch % 60)
		};

		var result = "";
		if (uptime.days) result += uptime.days + " jour" + (uptime.days > 1 ? "s " : " ");
		if (uptime.hours) result += uptime.hours + " heure" + (uptime.hours > 1 ? "s " : " ");
		if (uptime.minutes) result += uptime.minutes + " minute" + (uptime.minutes > 1 ? "s " : " ");
		if (uptime.seconds) result += uptime.seconds + " seconde" + (uptime.seconds > 1 ? "s " : " ");
		return result.trim() || "0 seconde";
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
			func: function (user, userID, channelID, message, evt, args, callback) {
				if (args.length <= 1)
					return callback(null, {
						type: "MISUSED"
					});
				args = args.filter(function (elem, index, self) {
					return index == self.indexOf(elem);
				});
				var redis_ = {};
				var func;
				if (args[0] !== "--get" && args[0] !== "--hget" && args[0] !== "--del") {
					return callback(null, {
						type: "MISUSED"
					});
				}
				async.eachSeries(args.splice(1), function (redisKey, callback) {
					async.waterfall([
						function (callback) {
							if (args[0] === "--get") return redisClient.get(redisKey, callback);
							else if (args[0] === "--hget") return redisClient.hgetall(redisKey, callback);
							else if (args[0] === "--del") return redisClient.del(redisKey, callback);
						},
						function (redis, callback) {
							redis_[redisKey] = redis || null;
							return callback();
						}
					], callback);
				}, function (err) {
					if (err) return callback(err);
					discordClient.sendMessage({
						to: channelID,
						message: "```\n" + JSON.stringify(redis_, null, 2) + "\n```"
					}, function (err) {
						if (err) return callback(err);
						return callback(null, {
							type: "GOOD"
						});
					});
				});
			},
			help: {
				usage: "!redis (--get | --hget | --del) KEY [KEY ...]",
				message: "Affiche les valeurs redis demandées",
			},
			devOnly: true
		},
		del: {
			func: function (user, userID, channelID, message, evt, args, callback) {
				if (args.length !== 1) {
					return callback(null, {
						type: "MISUSED"
					});
				} else {
					redisClient.del(args[0], function (err) {
						if (err) return callback(err);
						return callback(null, {
							type: "GOOD"
						});
					});
				}
			},
			help: {
				usage: "!del KEY",
				message: "Supprime la valeur redis spécifiée"
			},
			devOnly: true
		},
		siege: {
			func: function (user, userID, channelID, message, evt, args, callback) {
				if (args.length !== 0) {
					return callback(null, {
						type: "MISUSED"
					});
				}
				var siegeState = getSiegeState();
				siegeState.index -= 1;
				async.series([
					function (callback) {
						discordClient.sendMessage({
							to: channelID,
							message: "État courant :",
							embed: config.siege.events[(siegeState.index + config.siege.events.length) % config.siege.events.length].embed
						}, callback);
					},
					function (callback) {
						discordClient.sendMessage({
							to: channelID,
							message: "État suivant (dans " + secondsToTimestamp(siegeState.timeToWait * 1000) + ") :",
							embed: config.siege.events[siegeState.index + 1].embed
						}, callback);
					}
				], function (err) {
					if (err) return callback(err);
					else {
						return callback(null, {
							type: "GOOD"
						});
					}
				});
			},
			help: {
				usage: "!siege",
				message: "Affiche les informations sur le siège."
			}
		},
		mob: {
			func: function (user, userID, channelID, message, evt, args, callback) {
				if (args.length === 0) {
					return callback(null, {
						type: "MISUSED"
					});
				}
				var force = false;
				if (args[0] === "--name") {
					args = args.splice(1);
					force = true;
				}
				var name = args.join(" ");
				if (name.length < 3) {
					return callback(null, {
						type: "MISUSED"
					});
				}
				libs.swapi.mob(name, force, function (err, res) {
					if (err) return callback(err);
					else if (res.length === 0) {
						discordClient.sendMessage({
							to: channelID,
							embed: {
								description: "Aucun monstre trouvé pour la recherche \"" + name + "\""
							}
						}, function (err) {
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
						res = res.sort(function (a, b) {
							return a.mob.element > b.mob.element;
						}).sort(function (a, b) {
							return a.mob.family > b.mob.family;
						}).sort(function (a, b) {
							return a.mob.stars > b.mob.stars;
						});
						var embed = {
							description: "Plusieurs monstres trouvés pour la recherche \"" + name + "\", sélectionnez une réaction pour choisir le monstre à afficher",
							fields: []
						};
						async.times(res.length, function (n, callback) {
							var item = res[n];
							var field = {
								name: "Résultat #" + emojiNumbers[n],
								value: item.title
							};
							embed.fields.push(field);
						});
						embed.footer = footer();
						async.waterfall([
							function (callback) {
								discordClient.sendMessage({
									to: channelID,
									embed: embed
								}, callback);
							},
							function (message, callback) {
								redisClient.set("follow:mobList:" + channelID, message.id, function (err) {
									if (err) return callback(err);
									return callback(null, message);
								});
							},
							function (message, callback) {
								redisClient.expire("follow:mobList:" + channelID, 300, function (err) {
									if (err) return callback(err);
									return callback(null, message);
								});
							},
							function (message, callback) {
								redisClient.del("follow:mobList:" + channelID + ":" + message.id, function (err) {
									if (err) return callback(err);
									return callback(null, message);
								});
							},
							function (message, callback) {
								redisClient.hset("follow:mobList:" + channelID + ":" + message.id, "count", res.length, function (err) {
									if (err) return callback(err);
									return callback(null, message);
								});
							},
							function (message, callback) {
								async.timesSeries(res.length, function (n, callback) {
									var item = res[n];
									discordClient.addReaction({
										channelID: channelID,
										messageID: message.id,
										reaction: emojiNumbers[n]
									}, function (err, res) {
										if (err) return callback(err);
										async.waterfall([
											function (callback) {
												redisClient.hset("follow:mobList:" + channelID + ":" + message.id, "mob" + n, item.mob.family.redis() + ":" + item.mob.element.redis(), callback);
											}
										], function (err) {
											if (err) return callback(err);
											return setTimeout(callback, 250);
										});
									});
								}, function (err) {
									if (err) return callback(err);
									redisClient.expire("follow:mobList:" + channelID + ":" + message.id, 300, callback);
								});
							}
						], function (err) {
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
						}, function (err) {
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
				message: "Affiche les informations sur le monstre demandé (trois caractères minimum)."
			}
		},
		help: {
			func: function (user, userID, channelID, message, evt, args, callback) {
				if (args.length === 0) sendHelpMessage(user, userID, channelID, message, evt, Object.keys(commands), callback);
				else sendHelpMessage(user, userID, channelID, message, evt, args.map(function (arg) {
					return arg.toLowerCase();
				}), callback);
			},
			help: {
				usage: "!help [COMMAND ...]",
				message: "Affiche les informations sur les commandes demandées"
			}
		},
		crash: {
			func: function (user, userID, channelID, message, evt, args, callback) {
				throw new Error();
			},
			help: {
				usage: "!crash",
				message: "Fait crasher le bot"
			},
			devOnly: true
		},
		uptime: {
			func: function (user, userID, channelID, message, evt, args, callback) {
				if (args.length !== 0) {
					return callback(null, {
						type: "MISUSED"
					});
				}
				discordClient.sendMessage({
					to: channelID,
					embed: {
						title: "Uptime",
						description: "En ligne depuis " + secondsToTimestamp(now() - connectionDate)
					}
				}, function (err) {
					if (err) return callback(err);
					return callback(null, {
						type: "GOOD"
					});
				});
			},
			help: {
				usage: "!uptime",
				message: "Affiche l'uptime du bot"
			},
			devOnly: true
		}
	};

	function sendHelpMessage(user, userID, channelID, message, evt, cmds, callback) {
		async.waterfall([
			function (callback) {
				return callback(null, cmds.filter(function (cmd) {
					return Object.keys(commands).indexOf(cmd) !== -1;
				}).filter(function (elem, index, self) {
					return index == self.indexOf(elem);
				}));
			},
			function (cmds, callback) {
				if (cmds.length === 0) {
					return discordClient.sendMessage({
						to: channelID,
						message: "La commande demandée n'existe pas"
					}, function (err) {
						if (err) return callback(err);
						return callback(null, {
							type: "GOOD"
						});
					});
				}
				var embed = {
					title: "Aide",
					fields: []
				}
				cmds.forEach(function (cmd) {
					if (devCmd(cmd, userID)) return;
					var field = {
						name: cmd + (commands[cmd].devOnly ? " (dev only)" : ""),
						value: "`" + commands[cmd].help.usage + "`\n" + commands[cmd].help.message
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
			}
		], callback);
	}

	function executeCommand(user, userID, channelID, message, evt, callback) {
		var args = message.split(" ");
		var cmd = args[0].toLowerCase().substring(botConfig.prefix.length, args[0].length);
		if (Object.keys(commands).indexOf(cmd) !== -1) {
			if (devCmd(cmd, userID)) return callback();
			args = args.splice(1);
			async.waterfall([
				function (callback) {
					commands[cmd].func(user, userID, channelID, message, evt, args, callback);
				},
				function (retval, callback) {
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
		buildMobEmbedMessage: buildMobEmbedMessage,
		emojiNumbers: emojiNumbers,
		getSiegeState: getSiegeState
	});
};