'use strict';
const { createClient, spaceCenter } = require('krpc-node');
let _client;
(async function run() {
    const client = await createClient();
    try {
        _client = client;
        const falcon9Heavy = await client.send(spaceCenter.getActiveVessel());
        await prepForLaunch(falcon9Heavy);
        await client.close();
        console.log('Done, exiting!');
    } catch (err) {
        await client.close();
        console.error('Error running script', err);
    }
})();

async function prepForLaunch(falcon9Heavy) {
    const parts = await falcon9Heavy.parts.get();
    //const merlin1dEngines = await findMerlin1dEnginesMethod1(parts);
    const merlin1dEngines = await findMerlin1dEnginesMethod2(parts);
    const centralEngines = findCentralEngines(merlin1dEngines);
    await setEngineClusterThrust(centralEngines, 0.8);
}

async function findMerlin1dEnginesMethod1(parts) {
    const title = 'SpaceX Merlin 1D Full Thrust';
    // The C# type of the below returned array is KRPC.SpaceCenter.Services.Parts.Part
    let engineParts = await parts.withTitle(title);
    const enginePart = engineParts[0];
    //Throws error.
    const engine = await enginePart.engine.get();
}

async function findMerlin1dEnginesMethod2(parts) {
    const engines = await parts.engines.get();
    const engine = engines[0];
    const part = await engine.part.get();
    //As expected(?), the below id's are different.
    //One represents the KRPC.SpaceCenter.Services.Parts.Engine object
    //One represents the KRPC.SpaceCenter.Services.Parts.Part object
    console.log({ partId: part.id, engineId: engine.id });
    //Throws error.
    const name = await part.name.get();
    //Also throws error.
    //const name = await _client.send(spaceCenter.partGetName(part.id));
    //Also throws error.
    //const name = await _client.send(spaceCenter.partGetName(engine.id));
}

function findCentralEngines(engines) {
    const centralEngineIndexes = [
        1
        // 2,
        // 3,
        // 4,
        // 5,
        // 6,
        // 7,
        // 9,
        // 10,
        // 11,
        // 12,
        // 13,
        // 14,
        // 15,
        // 16,
        // 17,
        // 18,
        // 19,
        // 20,
        // 21,
        // 22,
        // 23,
        // 24,
        // 25,
        // 26,
        // 27
    ];
    const centralEngines = [];
    engines.forEach(function(engine, index) {
        if (centralEngineIndexes.indexOf(index) > -1) {
            centralEngines.push(engine);
        }
    });
    return centralEngines;
}

async function setEngineClusterThrust(cluster, thrustPercentage) {
    const promises = [];
    cluster.forEach(function(engine) {
        promises.push(engine.thrustLimit.set(thrustPercentage));
    });
    await Promise.all(promises);
}

process.on('uncaughtException', async function(err) {
    console.error(
        `Unhandled ${err.name} on process.\n${err.message}\nJS Stack :${err.stack}\n.Net Stack :\n${
            err.dotNetStackTrace
        }`
    );
    await _client.close();
});
