var async = require("async");
var git = require("simple-git")(".");

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
		index %= config.siege.events.length;
		var nextAlert = config.siege.events[index].date.day * 24 * 60 * 60 +
			config.siege.events[index].date.hours * 60 * 60 +
			config.siege.events[index].date.minutes * 60;

		if (dateNow > nextAlert) dateNow -= 7 * 24 * 60 * 60;
		var timeToWait = nextAlert - dateNow;

		return {
			index: index,
			timeToWait: timeToWait
		};
	}

	function gitLog(callback) {
		git.log(function (err, data) {
			if (err) return callback(err);
			var date = new Date(data.latest.date);
			date = {
				day: date.getUTCDate(),
				month: date.getUTCMonth() + 1,
				year: date.getUTCFullYear(),
				time: date.toJSON().substring(11, 19)
			};
			return callback(null, {
				date: (date.day < 10 ? "0" : "") + date.day + "/" + 
					(date.month < 10 ? "0" : "") + date.month + "/" + 
					date.year + ", " + date.time,
				message: data.latest.message,
				author: data.latest.author_name
			});
		});
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
			fields: [],
			footer: footer()
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
							if (args[0] === "--get") return redisClient.get((options.debug ? "debug:" : "") + redisKey, callback);
							else if (args[0] === "--hget") return redisClient.hgetall((options.debug ? "debug:" : "") + redisKey, callback);
							else if (args[0] === "--del") return redisClient.del((options.debug ? "debug:" : "") + redisKey, callback);
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
					redisClient.del((options.debug ? "debug:" : "") + args[0], function (err) {
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
							fields: [],
							footer: footer()
						};
						async.times(res.length, function (n, callback) {
							var item = res[n];
							var field = {
								name: "Résultat #" + emojiNumbers[n],
								value: item.title
							};
							embed.fields.push(field);
						});
						async.waterfall([
							function (callback) {
								discordClient.sendMessage({
									to: channelID,
									embed: embed
								}, callback);
							},
							function (message, callback) {
								redisClient.set((options.debug ? "debug:" : "") + "follow:mobList:" + channelID, message.id, function (err) {
									if (err) return callback(err);
									return callback(null, message);
								});
							},
							function (message, callback) {
								redisClient.expire((options.debug ? "debug:" : "") + "follow:mobList:" + channelID, 300, function (err) {
									if (err) return callback(err);
									return callback(null, message);
								});
							},
							function (message, callback) {
								redisClient.del((options.debug ? "debug:" : "") + "follow:mobList:" + channelID + ":" + message.id, function (err) {
									if (err) return callback(err);
									return callback(null, message);
								});
							},
							function (message, callback) {
								redisClient.hset((options.debug ? "debug:" : "") + "follow:mobList:" + channelID + ":" + message.id, "count", res.length, function (err) {
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
												redisClient.hset((options.debug ? "debug:" : "") + "follow:mobList:" + channelID + ":" + message.id, "mob" + n, item.mob.family.redis() + ":" + item.mob.element.redis(), callback);
											}
										], function (err) {
											if (err) return callback(err);
											return setTimeout(callback, 250);
										});
									});
								}, function (err) {
									if (err) return callback(err);
									redisClient.expire((options.debug ? "debug:" : "") + "follow:mobList:" + channelID + ":" + message.id, 300, callback);
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
		},
		stats: {
			func: function (user, userID, channelID, message, evt, args, callback) {
				if (args.length !== 0) {
					return callback(null, {
						type: "MISUSED"
					});
				}
				embed = {
					title: " :bar_chart: Statistiques de Summoners Bot",
					fields: [],
					footer: footer()
				};
				async.series({
					uptime: function (callback) {
						embed.fields.push({
							name: ":clock4: Uptime",
							value: "• **En ligne depuis** : " + secondsToTimestamp(now() - connectionDate)
						});
						return callback();
					},
					reconnections: function (callback) {
						async.waterfall([
							function (callback) {
								redisClient.get((options.debug ? "debug:" : "") + "reconnections", callback);
							},
							function (n, callback) {
								embed.fields.push({
									name: ":arrows_counterclockwise: Reconnexions",
									value: "• **Reconnecté** " + n + (n <= 1 ? "" : "s") + " fois"
								});
							}
						], callback);
					},
					commands: function (callback) {
						async.parallel({
							good: function (callback) {
								redisClient.get((options.debug ? "debug:" : "") + "stats:commands:good", callback);
							},
							misused: function (callback) {
								redisClient.get((options.debug ? "debug:" : "") + "stats:commands:misused", callback);
							},
							top: function (callback) {
								async.concat(Object.keys(commands).sort(), function (key, callback) {
									redisClient.get((options.debug ? "debug:" : "") + "stats:commands:good:" + key, function (err, res) {
										if (err) return callback(err);
										else return callback(null, [
											[key, Number(res) || 0]
										]);
									});
								}, function (err, res) {
									if (err) return callback(err);
									else {
										return callback(null, res.sort(function (a, b) {
											return b[1] - a[1];
										}).slice(0, 3));
									}
								});
							}
						}, function (err, res) {
							if (err) return callback(err);
							embed.fields.push({
								name: ":keyboard: Commandes",
								value: "• **Commandes réussies** : " + (res.good || 0) + "\n" +
									"• **Commandes ratées** : " + (res.misused || 0) + "\n" +
									"• **Commandes favorites** : \n" +
									":first_place: *" + botConfig.prefix + res.top[0][0] + "* : " + res.top[0][1] + " utilisation" + (res.top[0][1] > 1 ? "s" : "" ) + "\n" +
									":second_place: *" + botConfig.prefix + res.top[1][0] + "* : " + res.top[1][1] + " utilisation" + (res.top[1][1] > 1 ? "s" : "" ) + "\n" +
									":third_place: *" + botConfig.prefix + res.top[2][0] + "* : " + res.top[2][1] + " utilisation" + (res.top[2][1] > 1 ? "s" : "" ) + "\n"
							});
							return callback();
						});
					},
					git: function (callback) {
						async.waterfall([
							gitLog,
							function (log, callback) {
								embed.fields.push({
									name: ":minidisc: Git",
									value: "• **Date** : " + log.date + "\n" +
										"• **Modification** : " + log.message + "\n" +
										"• **Auteur** : " + log.author + "\n"
								});
								return callback();
							}
						], callback);
					}
				}, function (err) {
					if (err) return callback(err);
					discordClient.sendMessage({
						to: channelID,
						embed: embed
					}, function (err) {
						if (err) return callback(err);
						return callback(null, {
							type: "GOOD"
						});
					});
				});
			},
			help: {
				usage: "!stats",
				message: "Affiche des statistiques concernant le bot"
			},
			devOnly: true
		},
		todo: {
			func: function (user, userID, channelID, message, evt, args, callback) {
				if (args.length === 0) {
					async.waterfall([
						function (callback) {
							redisClient.get((options.debug ? "debug:" : "") + "todos", callback);
						},
						function (todos, callback) {
							if (!todos) {
								return discordClient.sendMessage({
									to: channelID,
									embed: {
										title: "To do's",
										description: "Aucun todo enregistré",
										footer: footer()
									}
								}, callback);
							}
							todos = JSON.parse(todos);
							var embed = {
								title: "To do's",
								fields: [],
								footer: footer()
							};
							todos.forEach(function (todo, index) {
								embed.fields.push({
									name: "To do #" + (index + 1),
									value: todo
								});
							});
							discordClient.sendMessage({
								to: channelID,
								embed: embed
							}, callback);
						}
					], function (err, res) {
						if (err) return callback(err);
						return callback(null, {
							type: "GOOD"
						});
					});

				} else if (args === 1) {
					return callback(null, {
						type: "MISUSED"
					});
				} else {
					if (args[0] === "--add" && args.length > 1) {
						args = args.splice(1);
						var todoMessage = args.join(" ");
						async.waterfall([
							function (callback) {
								redisClient.get((options.debug ? "debug:" : "") + "todos", callback);
							},
							function (todos, callback) {
								todos = todos ? JSON.parse(todos) : [];
								todos.push(todoMessage);
								return callback(null, todos);
							},
							function (todos, callback) {
								redisClient.set((options.debug ? "debug:" : "") + "todos", JSON.stringify(todos), function (err) {
									if (err) return callback(err);
									return callback();
								});
							},
							function (callback) {
								discordClient.sendMessage({
									to: channelID,
									embed: {
										title: "To do's",
										description: "To do ajouté",
										footer: footer()
									}
								}, callback);
							}
						], function (err) {
							if (err) return callback(err);
							return callback(null, {
								type: "GOOD"
							});
						});
					} else if (args[0] === "--remove" && args.length === 2) {
						var index = Number(args[1]);
						if (!index) {
							return callback(null, {
								type: "MISUSED"
							});
						}
						index--;
						async.waterfall([
							function (callback) {
								redisClient.get((options.debug ? "debug:" : "") + "todos", callback);
							},
							function (todos, callback) {
								return callback(null, todos ? JSON.parse(todos) : []);
							},
							function (todos, callback) {
								if (index >= todos.length) {
									return callback(null, {
										type: "MISUSED"
									});
								}
								todos.splice(index, 1);
								redisClient.set((options.debug ? "debug:" : "") + "todos", JSON.stringify(todos), callback);
							},
							function (callback) {
								discordClient.sendMessage({
									to: channelID,
									embed: {
										title: "To do's",
										description: "To do retiré",
										footer: footer()
									}
								}, callback);
							}
						], function (err) {
							if (err) return callback(err);
							return callback(null, {
								type: "GOOD"
							});
						});
					} else {
						return callback(null, {
							type: "MISUSED"
						});
					}
				}
			},
			help: {
				usage: "!todo [--remove INDEX | --add MESSAGE]",
				message: "Affiche, ajoute, ou retire des todo"
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
					fields: [],
					footer: footer()
				};
				cmds.forEach(function (cmd) {
					if (devCmd(cmd, userID)) return;
					var field = {
						name: cmd + (commands[cmd].devOnly ? " (dev only)" : ""),
						value: "`" + commands[cmd].help.usage + "`\n" + commands[cmd].help.message
					};
					embed.fields.push(field);
				});
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
		var redisKey = (options.debug ? "debug:" : "") + "user:" + userID;
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
						async.parallel([
							function (callback) {
								if (userID === discordClient.id) return callback();
								redisClient.incr((options.debug ? "debug:" : "") + "stats:commands:misused", callback);
							},
							function (callback) {
								sendHelpMessage(user, userID, channelID, message, evt, [cmd], callback);
							}
						], callback);
					} else {
						if (userID === discordClient.id) return callback();
						async.parallel([
							function (callback) {
								redisClient.incr((options.debug ? "debug:" : "") + "stats:commands:good", callback);
							},
							function (callback) {
								redisClient.incr((options.debug ? "debug:" : "") + "stats:commands:good:" + cmd, callback);
							},
							function (callback) {
								redisClient.hincrby(redisKey, "commands-good", 1, callback);
							}
						], callback);
					}
				}
			], callback);
		} else {
			async.parallel([
				function (callback) {
					redisClient.incr((options.debug ? "debug:" : "") + "stats:commands:misused", callback);
				},
				function (callback) {
					redisClient.hincrby(redisKey, "commands-misused", 1, callback);
				}
			], function (err) {
				if (err) return callback(err);
				return callback("Command " + cmd + " does not exist.");
			});
		}
	}

	return callback(null, {
		executeCommand: executeCommand,
		buildMobEmbedMessage: buildMobEmbedMessage,
		emojiNumbers: emojiNumbers,
		getSiegeState: getSiegeState
	});
};