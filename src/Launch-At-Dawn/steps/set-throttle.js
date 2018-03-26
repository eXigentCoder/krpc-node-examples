'use strict';

module.exports = function setThrottle(throttle) {
    return async function _setThrottle({ state }) {
        let { falcon9Heavy } = state;
        await falcon9Heavy.control.throttle.set(throttle);
    };
};
