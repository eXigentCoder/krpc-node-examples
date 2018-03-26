'use strict';
const { createClient, spaceCenter } = require('krpc-node');
const _ = require('lodash');
const modelBuilder = require('./model-builder');
const returnFunctionOptions = { _fn: true };
const handleStreamUpdate = require('./handle-stream-update');
let _client;

const saveGameNames = {
    pad: '01 DevConf FH Pad',
    preSep: '02 DevConf FH PreSep',
    postSep: '03 DevConf FH PostSep',
    preOrbit: '04 DevConf FH PreOrbit',
    inOrbit: '05 DevConf FH InOrbit'
};
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
