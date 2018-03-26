'use strict';
const setEngineClusterThrust = require('../set-engine-cluster-thrust');

module.exports = function setBoosterThrust(thrust, mode = 'both') {
    return async function _setBoosterThrust({ state, client }) {
        let { falcon9Heavy } = state;
        let calls = [];
        if (mode === 'both') {
            calls = calls.concat(
                await setEngineClusterThrust(falcon9Heavy.leftCore.engines, thrust)
            );
            calls = calls.concat(
                await setEngineClusterThrust(falcon9Heavy.rightCore.engines, thrust)
            );
        } else {
            calls = calls.concat(await setEngineClusterThrust(falcon9Heavy[mode].engines, thrust));
        }
        await client.send(calls);
    };
};
