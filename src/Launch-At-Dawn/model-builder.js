'use strict';

const _ = require('lodash');
//const returnFunctionOptions = { _fn: true };
const { spaceCenter } = require('krpc-node');
const boosterSeprationStage = 6;
//const secondStageSeparation = 5;
const interStageTitle = 'Falcon 9 1.1 FT Interstage';
const fuelTankTitle = 'Falcon 9 1.1 FT Main Fuel Tank';
const octawebTitle = 'Falcon 9 Octaweb';
const merlin1dEngineTitle = 'SpaceX Merlin 1D Full Thrust';

module.exports = {
    buildFalcon9OnPad,
    buildBoosterCoresPostSeparation,
    buildCentralCoreAfterSeparation
};

async function buildFalcon9OnPad(client) {
    const vessel = await client.send(spaceCenter.getActiveVessel());
    const falcon9Heavy = await buildControllableVessel(vessel);
    await addSurfaceFlightAndOrbit(falcon9Heavy);
    const currentStage = await falcon9Heavy.control.currentStage.get();
    const parts = await falcon9Heavy._raw.parts.get();
    const allMerlin1dFTEngines = await parts.withTitle(merlin1dEngineTitle);
    const allF9MainFuelTanks = await parts.withTitle(fuelTankTitle);
    const allOctawebs = await parts.withTitle(octawebTitle);
    falcon9Heavy.centerCore = await addCentralCore(
        parts,
        allMerlin1dFTEngines,
        allF9MainFuelTanks,
        allOctawebs
    );

    if (currentStage > boosterSeprationStage) {
        await addBoosterCores(falcon9Heavy, allMerlin1dFTEngines, allF9MainFuelTanks, allOctawebs);
    }

    return falcon9Heavy;
}

async function addBoosterCores(
    falcon9Heavy,
    allMerlin1dFTEngines,
    allF9MainFuelTanks,
    allOctawebs
) {
    /* Left and right are orientated towards the camera in locked mode*/
    const otherTanks = nOrError(
        2,
        _.differenceBy(allF9MainFuelTanks, [falcon9Heavy.centerCore.fuelTank], byId)
    );
    const leftTank = otherTanks[0];
    const leftEngines = await getEnginesForF9MainFuelTank(
        allMerlin1dFTEngines,
        allOctawebs,
        leftTank
    );
    falcon9Heavy.leftCore = {
        fuelTank: leftTank,
        engines: leftEngines
    };
    const rightTank = otherTanks[1];
    const rightEngines = await getEnginesForF9MainFuelTank(
        allMerlin1dFTEngines,
        allOctawebs,
        rightTank
    );
    falcon9Heavy.rightCore = {
        fuelTank: rightTank,
        engines: rightEngines
    };
}

async function addCentralCore(parts, allMerlin1dFTEngines, allF9MainFuelTanks, allOctawebs) {
    let interstage = oneOrError(await parts.withTitle(interStageTitle));
    let interstageChildren = await interstage.children.get();
    const centralTank = oneOrError(_.intersectionBy(interstageChildren, allF9MainFuelTanks, byId));
    const centralEngines = await getEnginesForF9MainFuelTank(
        allMerlin1dFTEngines,
        allOctawebs,
        centralTank
    );
    return {
        fuelTank: centralTank,
        engines: centralEngines
    };
}

async function getEnginesForF9MainFuelTank(allMerlin1dFTEngines, allOctawebs, fuelTank) {
    let fuelTankChildren = await fuelTank.children.get();
    const octaweb = oneOrError(_.intersectionBy(allOctawebs, fuelTankChildren, byId));
    let octawebChildren = await octaweb.children.get();
    const engineParts = _.intersectionBy(octawebChildren, allMerlin1dFTEngines, byId);
    const promises = [];
    engineParts.forEach(function(enginePart) {
        promises.push(enginePart.engine.get());
    });
    return Promise.all(promises);
}

async function buildBoosterCoresPostSeparation({ falcon9Heavy, client }) {
    const allVessels = await client.send(spaceCenter.getVessels());
    const otherVessels = _.differenceBy(allVessels, [falcon9Heavy._raw], byId);
    const cores = {
        left: null,
        right: null
    };
    for (let vessel of otherVessels) {
        const type = await vessel.type.get();
        if (type !== 'Probe') {
            continue;
        }
        const name = await vessel.name.get();
        if (name.toLowerCase().indexOf('fh') < 0) {
            continue;
        }
        if (!cores.right) {
            cores.right = await buildControllableVessel(vessel, client);
            continue;
        }
        cores.left = await buildControllableVessel(vessel, client);
    }
    return cores;
}

async function buildControllableVessel(vessel) {
    const autoPilot = await vessel.autoPilot.get();
    const control = await vessel.control.get();
    return {
        _raw: vessel,
        autoPilot,
        control
    };
}

async function addSurfaceFlightAndOrbit(falcon9Heavy) {
    const surfaceReference = await falcon9Heavy._raw.surfaceReferenceFrame.get();
    falcon9Heavy.flight = await falcon9Heavy._raw.flight(surfaceReference);
    falcon9Heavy.orbit = await falcon9Heavy._raw.orbit.get();
    return falcon9Heavy;
}

async function buildCentralCoreAfterSeparation(vessel) {
    const autoPilot = await vessel.autoPilot.get();
    const control = await vessel.control.get();
    return {
        _raw: vessel,
        autoPilot,
        control
    };
}
function oneOrError(arr) {
    return nOrError(1, arr);
}

function nOrError(n, arr) {
    if (arr.length !== n) {
        throw new Error(`There were ${arr.length} items in the array instead of ${n}`);
    }
    if (n === 1) {
        return arr[0];
    }
    return arr;
}

function byId(obj) {
    return obj.id;
}
