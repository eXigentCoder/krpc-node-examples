'use strict';
const { createClient, spaceCenter } = require('krpc-node');
const _ = require('lodash');
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
    const centralFuelTank = await findCentralFuelTank(parts);
    const centralEngines = await findEnginesOnFuelTank(parts, centralFuelTank);
    await setEngineClusterThrust(centralEngines, 0.8);
}

async function findCentralFuelTank(parts) {
    const interStageTitle = 'Falcon 9 1.1 FT Interstage';
    const fuelTankTitle = 'Falcon 9 1.1 FT Main Fuel Tank';
    let interstage = (await parts.withTitle(interStageTitle))[0];
    let interstageChildren = await interstage.children.get();
    const mainFuelTanks = await parts.withTitle(fuelTankTitle);
    const centralTank = _.intersectionBy(interstageChildren, mainFuelTanks, comparePartIds);
    return centralTank[0];
}

async function findEnginesOnFuelTank(parts, fuelTank) {
    const octawebTitle = 'Falcon 9 Octaweb';
    const merlin1dEngineTitle = 'SpaceX Merlin 1D Full Thrust';
    const octawebs = await parts.withTitle(octawebTitle);
    let children = await fuelTank.children.get();
    const thisOctaweb = _.intersectionBy(octawebs, children, comparePartIds)[0];
    children = await thisOctaweb.children.get();
    const allMerlin1dFTEngines = await parts.withTitle(merlin1dEngineTitle);
    const engineParts = _.intersectionBy(children, allMerlin1dFTEngines, comparePartIds);
    const promises = [];
    engineParts.forEach(function(enginePart) {
        promises.push(enginePart.engine.get());
    });
    return await Promise.all(promises);
}

function comparePartIds(part) {
    return part.id;
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
