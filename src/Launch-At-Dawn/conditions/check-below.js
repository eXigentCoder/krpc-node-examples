'use strict';
const stepRunner = require('../step-runner');

module.exports = function checkAbove(field, target) {
    return function atTargetAltitude(streamUpdate) {
        const current = streamUpdate[field];
        return {
            shouldRun: current <= target,
            percentage: stepRunner.percentageToTarget(target, current)
        };
    };
};
