'use strict';
const { ui } = require('krpc-node');

module.exports = function displayMessage(text, duration = 1) {
    return async function({ client }) {
        client.send(ui.message(text, duration, 'TopCenter'));
    };
};
