'use strict';

module.exports = function(client, falcon9Heavy) {
    return function(streamUpdate) {
        console.log(streamUpdate);
    };
};
