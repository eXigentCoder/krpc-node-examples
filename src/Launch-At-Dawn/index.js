'use strict';
const { createClient, spaceCenter } = require('krpc-node');
const _ = require('lodash');
const buildVesselModel = require('./build-vessel-model');
const returnFunctionOptions = { _fn: true };
const handleStreamUpdate = require('./handle-stream-update');
const setEngineClusterThrust = require('./set-engine-cluster-thrust');
let _client;
(async function run() {
    const client = await createClient();
    try {
        _client = client;
        const falcon9HeavyRaw = await client.send(spaceCenter.getActiveVessel());
        const falcon9Heavy = await buildVesselModel(falcon9HeavyRaw);
        await client.connectToStreamServer();
        await prepForLaunch(falcon9Heavy);
        await falcon9Heavy.control.activateNextStage();
        await falcon9Heavy.control.activateNextStage();
        let getAltitudeCall = await falcon9Heavy.flight.surfaceAltitude.get(returnFunctionOptions);
        await client.addStream(getAltitudeCall, 'altitude');
        client.stream.on('message', handleStreamUpdate(client, falcon9Heavy));
    } catch (err) {
        await client.close();
        console.error('Error running script', err);
    }
})();

async function prepForLaunch(falcon9Heavy) {
    const callBatch = await setEngineClusterThrust(falcon9Heavy.centerCore.engines, 0.6);
    callBatch.push(await falcon9Heavy.autoPilot.engage(returnFunctionOptions));
    callBatch.push(
        await falcon9Heavy.autoPilot.targetPitchAndHeading(returnFunctionOptions, 90, 0)
    );
    callBatch.push(await falcon9Heavy.control.throttle.set(returnFunctionOptions, 1));
    await _client.send(callBatch);
}

process.on('uncaughtException', async function(err) {
    console.error(
        `Unhandled ${err.name} on process.\n${err.message}\nJS Stack :${err.stack}\n.Net Stack :\n${
            err.dotNetStackTrace
        }`
    );
    await _client.close();
});
