module.exports = function(callback) {
    function translate(str) {
        return config.translation[str.reformat()] || str;
    }

    return callback(null, {
        translate: translate
    });
}
