const _ = require('lodash');

module.exports = async function buildVesselModel(falcon9Heavy) {
    const interStageTitle = 'Falcon 9 1.1 FT Interstage';
    const fuelTankTitle = 'Falcon 9 1.1 FT Main Fuel Tank';
    const octawebTitle = 'Falcon 9 Octaweb';
    const merlin1dEngineTitle = 'SpaceX Merlin 1D Full Thrust';
    const parts = await falcon9Heavy.parts.get();
    const allMerlin1dFTEngines = await parts.withTitle(merlin1dEngineTitle);
    const allf9MainFuelTanks = await parts.withTitle(fuelTankTitle);
    const allOctawebs = await parts.withTitle(octawebTitle);
    let interstage = oneOrError(await parts.withTitle(interStageTitle));
    let interstageChildren = await interstage.children.get();
    const centralTank = oneOrError(
        _.intersectionBy(interstageChildren, allf9MainFuelTanks, byPartId)
    );
    const centralEngines = await getEnginesForF9MainFuelTank(
        allMerlin1dFTEngines,
        allOctawebs,
        centralTank
    );
    const otherTanks = nOrError(2, _.differenceBy(allf9MainFuelTanks, [centralTank], byPartId));
    const leftTank = otherTanks[0];
    const rightTank = otherTanks[1];
    const leftEngines = await getEnginesForF9MainFuelTank(
        allMerlin1dFTEngines,
        allOctawebs,
        leftTank
    );
    const rightEngines = await getEnginesForF9MainFuelTank(
        allMerlin1dFTEngines,
        allOctawebs,
        rightTank
    );
    const control = await falcon9Heavy.control.get();
    const autoPilot = await falcon9Heavy.autoPilot.get();
    const surfaceReference = await falcon9Heavy.surfaceReferenceFrame.get();
    const flight = await falcon9Heavy.flight(surfaceReference);
    /* Left and right are orientated towards the camera in locked mode*/
    return {
        _raw: falcon9Heavy,
        control,
        autoPilot,
        flight,
        leftCore: {
            fuelTank: leftTank,
            engines: leftEngines
        },
        centerCore: {
            fuelTank: centralTank,
            engines: centralEngines
        },
        rightCore: {
            fuelTank: rightTank,
            engines: rightEngines
        }
    };
};

async function getEnginesForF9MainFuelTank(allMerlin1dFTEngines, allOctawebs, fuelTank) {
    let fuelTankChildren = await fuelTank.children.get();
    const octaweb = oneOrError(_.intersectionBy(allOctawebs, fuelTankChildren, byPartId));
    let octawebChildren = await octaweb.children.get();
    const engineParts = _.intersectionBy(octawebChildren, allMerlin1dFTEngines, byPartId);
    const promises = [];
    engineParts.forEach(function(enginePart) {
        promises.push(enginePart.engine.get());
    });
    return Promise.all(promises);
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

function byPartId(part) {
    return part.id;
}
