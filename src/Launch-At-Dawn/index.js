'use strict';
const { createClient, spaceCenter } = require('krpc-node');
const _ = require('lodash');
let _client;
(async function run() {
    const client = await createClient();
    try {
        _client = client;
        const falcon9HeavyRaw = await client.send(spaceCenter.getActiveVessel());
        const falcon9Heavy = buildVesselModel(falcon9HeavyRaw);
        await prepForLaunch(falcon9Heavy);
        await client.close();
        console.log('Done, exiting!');
    } catch (err) {
        await client.close();
        console.error('Error running script', err);
    }
})();

async function buildVesselModel(falcon9Heavy) {
    const interStageTitle = 'Falcon 9 1.1 FT Interstage';
    const fuelTankTitle = 'Falcon 9 1.1 FT Main Fuel Tank';
    const octawebTitle = 'Falcon 9 Octaweb';
    const merlin1dEngineTitle = 'SpaceX Merlin 1D Full Thrust';
    const parts = await falcon9Heavy.parts.get();
    const allMerlin1dFTEngines = await parts.withTitle(merlin1dEngineTitle);
    const allf9MainFuelTanks = await parts.withTitle(fuelTankTitle);
    const allOctawebs = await parts.withTitle(octawebTitle);
    //todo ensure only 1
    let interstage = (await parts.withTitle(interStageTitle))[0];
    let interstageChildren = await interstage.children.get();
    const centralTank = _.intersectionBy(interstageChildren, allf9MainFuelTanks, byPartId);
    const centralEngines = await getEnginesForF9MainFuelTank(
        allMerlin1dFTEngines,
        allOctawebs,
        centralTank
    );
    const vessel = {
        leftCore: {},
        centerCore: {
            engines: centralEngines
        },
        rightCore: {}
    };
    return vessel;
}

async function getEnginesForF9MainFuelTank(allMerlin1dFTEngines, allOctawebs, fuelTank) {
    let fuelTankChildren = await fuelTank.children.get();
    const octaweb = first(_.intersectionBy(allOctawebs, fuelTankChildren, byPartId));
    let octawebChildren = await octaweb.children.get();
    const engineParts = _.intersectionBy(octawebChildren, allMerlin1dFTEngines, byPartId);
    const promises = [];
    engineParts.forEach(function(enginePart) {
        promises.push(enginePart.engine.get());
    });
    return Promise.all(promises);
}

function first(arr) {
    if (!arr.length !== 0) {
        throw new Error(`There were ${arr.length} items in the array instead of 1`);
    }
    return arr[0];
}

function byPartId(part) {
    return part.id;
}

async function prepForLaunch(falcon9Heavy) {
    const parts = await falcon9Heavy.parts.get();
    const centralFuelTank = await findCentralFuelTank(parts);
    const centralEngines = await findEnginesOnFuelTank(parts, centralFuelTank);
    await setEngineClusterThrust(centralEngines, 0.6);
}

async function findCentralFuelTank(parts) {
    const interStageTitle = 'Falcon 9 1.1 FT Interstage';
    const fuelTankTitle = 'Falcon 9 1.1 FT Main Fuel Tank';
    let interstage = (await parts.withTitle(interStageTitle))[0];
    let interstageChildren = await interstage.children.get();
    const mainFuelTanks = await parts.withTitle(fuelTankTitle);
    const centralTank = _.intersectionBy(interstageChildren, mainFuelTanks, byPartId);
    return centralTank[0];
}

async function findEnginesOnFuelTank(parts, fuelTank) {
    const octawebTitle = 'Falcon 9 Octaweb';
    const merlin1dEngineTitle = 'SpaceX Merlin 1D Full Thrust';
    const octawebs = await parts.withTitle(octawebTitle);
    let centralFuelTankChildren = await fuelTank.children.get();
    const centralOctaweb = _.intersectionBy(octawebs, centralFuelTankChildren, byPartId)[0];
    let centralOctawebChildren = await centralOctaweb.children.get();
    const allMerlin1dFTEngines = await parts.withTitle(merlin1dEngineTitle);
    const engineParts = _.intersectionBy(centralOctawebChildren, allMerlin1dFTEngines, byPartId);
    const promises = [];
    engineParts.forEach(function(enginePart) {
        promises.push(enginePart.engine.get());
    });
    return await Promise.all(promises);
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
