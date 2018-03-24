'use strict';
const returnFunctionOptions = { _fn: true };
const setEngineClusterThrust = require('../set-engine-cluster-thrust');

module.exports = async function fireEngines(core, client, thrust) {
    let calls = await setEngineClusterThrust(core.engines, 0.5);
    calls = calls.concat(await core.control.throttle.set(returnFunctionOptions, thrust));
    await client.send(calls);
};
