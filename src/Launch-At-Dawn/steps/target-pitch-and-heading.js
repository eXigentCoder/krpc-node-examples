'use strict';

module.exports = function targetPitchAndHeading(pitch, heading) {
    return async function _targetPitchAndHeading({ state }) {
        let { falcon9Heavy } = state;
        await falcon9Heavy.autoPilot.engage();
        await falcon9Heavy.autoPilot.targetPitchAndHeading(pitch, heading);
    };
};
