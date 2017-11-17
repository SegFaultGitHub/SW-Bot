var request = require("request");
var async = require("async");
var htmlparser = require("htmlparser");
var fs = require("fs");

var baseUrl = "http://summonerswar.wikia.com/wiki/Special:Search?query=";

module.exports = function(callback) {
	function mob(name, callback) {
		var mobURL = "http://summonerswar.wikia.com/wiki/Category:Monsters?page=";
		var n = 0;

		async.eachSeries([1, 2, 3, null], function(n, callback) {
			if (n === null) return callback("NOT_FOUND");
			async.waterfall([
				function(callback) {
					request.get(baseUrl + n, function(err, res, body) {
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
					logger.info(body.indexOf("mw"));
					fd = fs.openSync("./coucou.html", "w");
					fs.write(fd, body);
					fd.close();
					parser.parseComplete(body);
				},
				function(handler, callback) {
					// logger.info(handler.dom);
					return callback();
				}
			], callback);
		}, function(err) {
			if (err === "NOT_FOUND") return callback("NOT_FOUND");
			else if (err) return callback(err);
			else return callback(null, n);
		});
	}

	return callback(null, {
		mob: mob
	});
};