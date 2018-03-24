'use strict';
const moment = require('moment');

module.exports = function delay(value, period) {
    let runAt;
    return function atTargetApoapsis() {
        const now = moment.utc();
        runAt = runAt || moment.utc().add(value, period);
        const remaining = runAt.diff(now, 'seconds');
        return {
            shouldRun: now.isAfter(runAt),
            percentage: `T-${remaining}`
        };
    };
};
