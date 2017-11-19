var request = require("request");
var async = require("async");
var htmlparser = require("htmlparser");
var fs = require("fs");

module.exports = function(callback) {
	var baseURL = "http://summonerswar.wikia.com";
	var elementRegex = /\((dark|light|water|wind|fire)\)/g;

	String.prototype.reformat = function() {
		str = this.toLowerCase();
		str = str.replace(/(á|à|ä|â)/g, "a");
		str = str.replace(/(é|è|ë|ê)/g, "e");
		str = str.replace(/(í|ì|ï|î)/g, "i");
		str = str.replace(/(ó|ò|ö|ô)/g, "o");
		str = str.replace(/(ú|ù|ü|û)/g, "u");
		str = str.replace(/(ÿ)/g, "y");
		str = str.replace(/(ç)/g, "c");
		str = str.replace(/\s+/g, " ")
		return str;
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
							function(div, callback) {
								if (!div) return callback(new Error("Category not found")); // Shouldn't happen

								var children = div.children[5].children[0].children[0].children;
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
												toConcat.mob.type = split[0].trim();
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
					if (item.mob.name.indexOf(name) !== -1 || item.mob.type.indexOf(name) !== -1) return callback(null, item);
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
							searchById(handler.dom, "images", callback);
						},
						function(div, callback) {
							var images = div.children[1].children[1].children;
							fs.write(fs.openSync("search.json", "w"), JSON.stringify(images, null, 2));
							var unawaken = images[1];
							item.mob.urls = {};
							item.mob.urls.unawaken = unawaken.children[0].attribs.href;
							if (item.mob.name) {
								var awaken = images.length > 2 ? images[2] : null;
								item.mob.urls.awaken = awaken ? awaken.children[0].attribs.href : null;
							}
							return callback(null, item);
						}
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
