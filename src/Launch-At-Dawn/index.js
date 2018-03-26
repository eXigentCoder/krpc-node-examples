'use strict';
const { createClient, spaceCenter } = require('krpc-node');
const _ = require('lodash');
const modelBuilder = require('./model-builder');
const handleStreamUpdate = require('./handle-stream-update');
const saveGameNames = require('./save-game-names');
const returnFunctionOptions = { _fn: true };
let _client;

(async function run() {
    const client = await createClient();
    try {
        _client = client;
        await client.send(spaceCenter.load(saveGameNames.preSep));
        const falcon9Heavy = await modelBuilder.buildFalcon9OnPad(client);
        await client.connectToStreamServer();
        await registerStreams(falcon9Heavy, client);
        client.stream.on('message', handleStreamUpdate(client, falcon9Heavy));
    } catch (err) {
        await client.close();
        console.error('Error running script', err);
    }
})();

process.on('uncaughtException', async function(err) {
    console.error(
        `Unhandled ${err.name} on process.\n${err.message}\nJS Stack :${err.stack}\n.Net Stack :\n${
            err.dotNetStackTrace
        }`
    );
    await _client.close();
});

process.on('SIGTERM', closeClient);

process.on('SIGINT', closeClient);

async function closeClient() {
    console.error('Termination/interrupt received, closing client.');
    if (_client) {
        await _client.close();
        // eslint-disable-next-line no-process-exit
        process.exit(-1);
    }
}

async function registerStreams(falcon9Heavy, client) {
    let getAltitudeCall = await falcon9Heavy.flight.surfaceAltitude.get(returnFunctionOptions);
    await client.addStream(getAltitudeCall, 'altitude');
    let getApoapsisCall = await falcon9Heavy.orbit.apoapsisAltitude.get(returnFunctionOptions);
    await client.addStream(getApoapsisCall, 'apoapsis');
    let getPeriapsisCall = await falcon9Heavy.orbit.periapsisAltitude.get(returnFunctionOptions);
    await client.addStream(getPeriapsisCall, 'periapsis');
}
