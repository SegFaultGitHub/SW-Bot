var request = require("request");
var async = require("async");
var htmlparser = require("htmlparser");
var fs = require("fs");

module.exports = function(callback) {
	var baseURL = "http://summonerswar.wikia.com";
	var elementRegex = /\((dark|light|water|wind|fire)\)/g;

	function _foo(j) {
		fs.write(fs.openSync("foo2.json", "w"), JSON.stringify(j, null, 2));
	}

	function searchById(arr, id, callback) {
		var result = null;

		function foo(arr, id) {
			return arr.some(function(item) {
				if (item.attribs && item.attribs.id === id) {
					result = item;
					return true;
				} else if (item.children) {
					return foo(item.children, id);
				} else {
					return false;
				}
			});
		}
		foo(arr, id);

		return callback(null, result);
	}

	// HTML to JSON
	function jsonizeURL(url, callback) {
		async.waterfall([
			function(callback) {
				request.get(url, function(err, res, body) {
					if (err) return callback(err);
					redisClient.hset("etags", url, res.headers.etag, function(err) {
						if (err) return callback(err);
						return callback(null, body);
					});
				});
			},
			function(body, callback) {
				var handler = new htmlparser.DefaultHandler(function (err, dom) {
					if (err) return callback(err);
					else return callback(null, handler);
				});
				var parser = new htmlparser.Parser(handler);
				parser.parseComplete(body);
			}
		], callback);
	}

	function mob(name, callback) {
		name = name.reformat();
		var mobURL = "/wiki/Category:Monsters?page=";
		var n = 0;

		var s = new Date().getTime();
		async.waterfall([
			function(callback) {
				async.some([1, 2, 3], function(n, callback) {
					// Gets page's ETAG
					async.waterfall([
						function(callback) {
							redisClient.hsetnx("etags", baseURL + mobURL + n, "", function(err) {
								if (err) return callback(err);
								return callback();
							});
						},
						function(callback) {
							redisClient.hget("etags", baseURL + mobURL + n, callback);
						},
						function(etag, callback) {
							request.head(baseURL + mobURL + n, function(err, res, body) {
								if (err) return callback(err);
								else return callback(null, etag !== res.headers.etag)
							});
						}
					], callback);
				}, callback);
			},
			function(outdated, callback) {
				redisClient.get("mobs", function(err, mobs) {
					if (err) return	callback(err);
					else if (mobs) return callback(null, JSON.parse(mobs), outdated);
					else return callback(null, null, outdated)
				})
			},
			function(mobs, outdated, callback) {
				if (!outdated && mobs) return callback(null, mobs);
				else {
					logger.info("retrieving data");
					async.concat([1, 2, 3], function(n, callback) {
						async.waterfall([
							function(callback) {
								jsonizeURL(baseURL + mobURL + n, callback)
							},
							function(handler, callback) {
								searchById(handler.dom, "mw-pages", callback);
							},
							function(res, callback) {
								if (!res) return callback(new Error("Category not found"));

								var children = res.children[5].children[0].children[0].children;
								mobs = [];

								for (var i = 0; i < children.length; i += 2) {
									for (var j = 2; j < children[i].children.length; j += 3) {
										for (var k = 0; k < children[i].children[j].children.length; k += 2) {
											var toConcat = children[i].children[j].children[k].children[0].attribs;
											var reformat = toConcat.title.reformat();
											if (reformat.match(elementRegex) &&
												!reformat.toLowerCase().match(/user:/g)) {
												var split = reformat.split(elementRegex);
												toConcat.mob = {};
												toConcat.mob.family = split[0].trim();
												toConcat.mob.element = split[1].trim();
												toConcat.mob.name = split[2].substring(split[2].indexOf("-") + 1 || 0).trim();
												mobs = mobs.concat(toConcat);
											}
										}
									}
								}

								return callback(null, mobs);
							}
						], callback);
					}, function(err, mobs) {
						if (err) return callback(err);
						redisClient.set("mobs", JSON.stringify(mobs), function(err) {
							return callback(null, mobs);
						});
					});
				}
			},
			function(mobs, callback) {
				async.concat(mobs, function(item, callback) {
					if (item.mob.name.indexOf(name) !== -1 || item.mob.family.indexOf(name) !== -1) return callback(null, item);
					else return callback();
				}, callback);
			},
			function(mobs, callback) {
				async.concat(mobs, function(item, callback) {
					async.waterfall([
						function(callback) {
							jsonizeURL(baseURL + item.href, callback);
						},
						function(handler, callback) {
							searchById(handler.dom, "images", function(err, res) {
								if (err) return	callback(err);
								else return callback(null, handler, res);
							});
						},
						// Get images
						function(handler, res, callback) {
							if (!res) return callback(new Error("Category not found"));

							var images = res.children[1].children[1].children;
							fs.write(fs.openSync("search.json", "w"), JSON.stringify(images, null, 2));
							var unawaken = images[1];
							item.mob.urls = {};
							item.mob.urls.unawaken = unawaken.children[0].attribs.href;
							if (item.mob.name) {
								var awaken = images.length > 2 ? images[2] : null;
								item.mob.urls.awaken = awaken ? awaken.children[0].attribs.href : null;
							}

							searchById(handler.dom, "monster_rightcol", function(err, res) {
								if (err) return	callback(err);
								else return callback(null, handler, res);
							});
						},
						// Get monster type
						function(handler, res, callback) {
							if (!res) return callback(new Error("Category not found"));

							item.mob.type = res.children[1].children[1].children[1].children[1].children[1].raw.trim();

							searchById(handler.dom, "skills", function(err, res) {
								if (err) return	callback(err);
								else return callback(null, handler, res);
							});
						},
						// Get monster skills
						function(handler, res, callback) {
							if (!res) return callback(new Error("Category not found"));

							searchById(handler.dom, "mw-content-text", function(err, res) {
								if (err) return	callback(err);
								else return callback(null, handler, res);
							});
						},
						// Get monster stats and stars
						function(handler, res, callback) {
							if (!res) return callback(new Error("Category not found"));

							var stars = res.children[6].children[1].children[1].children[4];
							if (stars.children) item.mob.stars = Number(stars.children[3].raw[1]);
							else item.mob.stars = 1;

							item.mob.stats = [];

							var stats = res.children[22].children[1].children;
							var index = 5;
							if (item.mob.name) {
								index = 15;
							}
							for (var i = index; i <= index + 4; i += 2) {
								item.mob.stats.push(stats[i].children[stats[i].children.length - 1].children[0].raw.trim());
							}

							index = 3;
							if (item.mob.name) {
								index = 5;
							}
							stats = res.children[30].children[1].children[index].children;
							index = 1;
							if (item.mob.name) {
								index = 2;
							}
							for (var i = index; i < index + 5; i++) {
								if (stats[i].children[0].children) {
									var toPush = "**" + stats[i].children[0].children[0].raw.trim();
									if (stats[i].children[1]) {
										toPush += stats[i].children[1].raw.trim();
									}
									toPush += "**";
								}
								else var toPush = stats[i].children[0].raw.trim();
								item.mob.stats.push(toPush);
							}
							_foo(stats);

							return callback(null, item);
						},
					], callback);
				}, callback);
			}
		], callback);
	}

	return callback(null, {
		baseURL: baseURL,
		mob: mob
	});
};
