var request = require("request");
var async = require("async");
var htmlparser = require("htmlparser");
var fs = require("fs");

module.exports = function(callback) {
	var baseURL = "http://summonerswar.wikia.com";

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

	function mob(name, callback) {
		name = name.reformat();
		var mobURL = "/wiki/Category:Monsters?page=";
		var n = 0;

		async.concat([1, 2, 3], function(n, callback) {
			async.waterfall([
				function(callback) {
					request.get(baseURL + mobURL + n, function(err, res, body) {
						if (err) return callback(err);
						else return	callback(null, body);
					});
				},
				function(body, callback) {
					var handler = new htmlparser.DefaultHandler(function (err, dom) {
						if (err) return callback(err);
						else return callback(null, handler);
					});
					var parser = new htmlparser.Parser(handler);
					parser.parseComplete(body);
				},
				function(handler, callback) {
					searchById(handler.dom, "mw-pages", callback);
				},
				function(div, callback) {
					if (!div) return callback(new Error("Category not found")); // Shouldn't happen

					var children = div.children[5].children[0].children[0].children;
					var mobs = [];

					for (var i = 0; i < children.length; i += 2) {
						for (var j = 2; j < children[i].children.length; j += 3) {
							for (var k = 0; k < children[i].children[j].children.length; k += 2) {
								var toConcat = children[i].children[j].children[k].children[0].attribs;
								toConcat.lowerTitle = toConcat.title.reformat();
								if (toConcat.lowerTitle.match(/\((dark|light|water|wind|fire)\)/g) &&
									!toConcat.lowerTitle.toLowerCase().match(/user:/g)) {
									mobs = mobs.concat(toConcat);
								}
							}
						}
					}

					return callback(null, mobs);
				}
			], callback);
		}, function(err, res) {
			if (err) return callback(err);

			async.concat(res, function(item, callback) {
				if (item.lowerTitle.indexOf(name) !== -1) return callback(null, item);
				else return callback();
			}, callback);
		});
	}

	return callback(null, {
		baseURL: baseURL,
		mob: mob
	});
};
