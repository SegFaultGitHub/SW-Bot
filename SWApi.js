var request = require("request");

var baseUrl = "http://summonerswar.wikia.com/wiki/";

module.exports = function(callback) {
	function mob(name, callback) {
		request.head(baseUrl + name, function(err, res, body) {
			if (err) return callback(err);
			return callback(null, res);
		});
	}

	return callback(null, {
		mob: mob
	});
};