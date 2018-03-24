'use strict';
const setEngineClusterThrust = require('./set-engine-cluster-thrust');
const modelBuilder = require('./model-builder');
const stepRunner = require('./step-runner');
const returnFunctionOptions = { _fn: true };
const boosterStreamUpdate = require('./booster-stream-update');
const displayMessage = require('./steps/display-message');
const delay = require('./conditions/delay');

let stepQueue = [
    /*--====[ 01 DevConf FH Pad ]====--*/
    // throttleDownCentralCore,
    // { action: displayMessage('T-10 ...'), condition: delay(1, 'seconds') },
    // { action: displayMessage('T-9 ...'), condition: delay(1, 'seconds') },
    // { action: displayMessage('T-8 ...'), condition: delay(1, 'seconds') },
    // { action: displayMessage('T-7 ...'), condition: delay(1, 'seconds') },
    // { action: displayMessage('T-6 ...'), condition: delay(1, 'seconds') },
    // {
    //     action: displayMessage('Booster Ignition Sequence Start', 1),
    //     condition: delay(1, 'seconds')
    // },
    // activateNextStage,
    // { action: displayMessage('T-4 ...'), condition: delay(1, 'seconds') },
    // { action: displayMessage('Core Ignition Sequence Start'), condition: delay(1, 'seconds') },
    // activateNextStage,
    // { action: displayMessage('T-2 ...'), condition: delay(1, 'seconds') },
    // { action: displayMessage('T-1 ...'), condition: delay(1, 'seconds') },
    // { action: displayMessage('Launch!!'), condition: delay(1, 'seconds') },
    // activateNextStage,
    // { action: initiateRollManeuver, condition: checkAboveAltitude(150) },
    // { action: displayMessage('Beginning roll program.', 3), condition: checkAboveAltitude(150) },
    // { action: setSasToPrograde, condition: checkAboveAltitude(2400) },
    // { action: displayMessage('Gravity turn initiated.', 3), condition: checkAboveAltitude(2400) },
    /*--====[ Comment out before here when loading from 02 DevConf FH PreSep ]====--*/
    { action: boosterEngineCutOff, condition: checkAboveAltitude(24000) },
    {
        action: displayMessage('BECO - Booster Engine Cutoff', 3),
        condition: checkAboveAltitude(24000)
    },

    { action: initiateBoosterSeparation, condition: checkAboveAltitude(25000) },
    {
        action: displayMessage('Booster separation.', 3),
        condition: checkAboveAltitude(25000)
    },
    //startBoosterSteps,
    displayMessage('Central core is at full thrust.', 3),
    throttleUpCentralCore,
    setPitchToZero,
    { action: displayMessage('MECO', 3), condition: checkAboveApoapsis(120000) },
    { action: meco, condition: checkAboveApoapsis(120000) },
    setSasToPrograde,
    { action: secondStageBoost, condition: delay(3, 'seconds') },
    { action: endSecondStageBoost, condition: delay(0.6, 'seconds') },
    displayMessage('Central core rotating retrograde for deceleration burn.', 3),
    { action: flipCentralCore, condition: delay(1, 'seconds') },
    { action: deployFairings, condition: delay(14, 'seconds') },
    { action: initiateCircularisationBurn, condition: checkAboveAltitude(119700) },
    { action: secondStageEngineCutoff, condition: checkAbovePeriapsis(120000) },
    { action: done, condition: delay(120, 'seconds') }
];

module.exports = function(client, falcon9Heavy) {
    let state = { falcon9Heavy };
    return stepRunner.runSteps('CoreSteps', stepQueue, client, state);
};

async function throttleDownCentralCore({ state, client }) {
    let { falcon9Heavy } = state;
    const callBatch = await setEngineClusterThrust(falcon9Heavy.centerCore.engines, 0.55);
    callBatch.push(await falcon9Heavy.autoPilot.engage(returnFunctionOptions));
    callBatch.push(
        await falcon9Heavy.autoPilot.targetPitchAndHeading(returnFunctionOptions, 90, 0)
    );
    callBatch.push(await falcon9Heavy.control.throttle.set(returnFunctionOptions, 1));
    await client.send(callBatch);
}

async function activateNextStage({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy.control.activateNextStage();
}

async function initiateRollManeuver({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy.autoPilot.targetRoll.set(0);
    //because why should 90 degrees exactly work >.<
    await falcon9Heavy.autoPilot.targetPitchAndHeading(85, 93);
}

async function setSasToPrograde({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy.autoPilot.disengage();
    await falcon9Heavy.control.sas.set(true);
    await falcon9Heavy.control.sasMode.set('Prograde');
}
async function boosterEngineCutOff({ state, client }) {
    let { falcon9Heavy } = state;
    let calls = await setEngineClusterThrust(falcon9Heavy.leftCore.engines, 0);
    calls = calls.concat(await setEngineClusterThrust(falcon9Heavy.rightCore.engines, 0));
    await client.send(calls);
}

async function initiateBoosterSeparation({ state, client }) {
    let { falcon9Heavy } = state;
    let calls = await setEngineClusterThrust(falcon9Heavy.leftCore.engines, 0);
    calls = calls.concat(await setEngineClusterThrust(falcon9Heavy.rightCore.engines, 0));
    await client.send(calls);
    await falcon9Heavy.control.activateNextStage();


    const cores = await modelBuilder.buildBoosterCoresPostSeparation({
        falcon9Heavy,
        client
    });
    Object.assign(falcon9Heavy.leftCore, cores.left);
    Object.assign(falcon9Heavy.rightCore, cores.right);
}

async function startBoosterSteps({ client, state }) {
    client.stream.on('message', boosterStreamUpdate(client, state));
}

async function throttleUpCentralCore({ state, client }) {
    let { falcon9Heavy } = state;
    const callBatch = await setEngineClusterThrust(falcon9Heavy.centerCore.engines, 1);
    await client.send(callBatch);
}

async function setPitchToZero({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy.autoPilot.engage();
    await falcon9Heavy.autoPilot.targetPitchAndHeading(0, 90);
}

async function meco({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy.control.throttle.set(0);
}

async function secondStageBoost({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy.control.activateNextStage();
    await falcon9Heavy.control.activateNextStage();
    //todo RK use RCS for this
    await falcon9Heavy.control.throttle.set(0.1);
}
async function endSecondStageBoost({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy.control.throttle.set(0);
}

async function flipCentralCore({ state }) {
    let { falcon9Heavy } = state;
    const vessel = await falcon9Heavy.centerCore.fuelTank.vessel.get();
    let centralCore = await modelBuilder.buildCentralCoreAfterSeparation(vessel);
    Object.assign(falcon9Heavy.centerCore, centralCore);
    await centralCore.control.rcs.set(true);
    await centralCore.control.sas.set(true);
    await centralCore.control.sasMode.set('Retrograde');
}

async function deployFairings({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy.control.activateNextStage();
    await falcon9Heavy.control.rcs.set(true);
}

async function initiateCircularisationBurn({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy.control.throttle.set(1);
}
async function secondStageEngineCutoff({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy.control.throttle.set(0);
}

async function done({ client }) {
    console.log('closing');
    await client.close();
    console.log('Done!');
    // eslint-disable-next-line no-process-exit
    process.exit(0);
}

function checkAboveAltitude(targetAltitude) {
    return function atTargetAltitude(streamUpdate) {
        return {
            shouldRun: streamUpdate.altitude >= targetAltitude,
            percentage: stepRunner.percentageToTarget(targetAltitude, streamUpdate.altitude)
        };
    };
}
function checkAboveApoapsis(targetApoapsis) {
    return function atTargetApoapsis(streamUpdate) {
        return {
            shouldRun: streamUpdate.apoapsis >= targetApoapsis,
            percentage: stepRunner.percentageToTarget(targetApoapsis, streamUpdate.apoapsis)
        };
    };
}
function checkAbovePeriapsis(targetPeriapsis) {
    return function atTargetPeriapsis(streamUpdate) {
        return {
            shouldRun: streamUpdate.periapsis >= targetPeriapsis,
            percentage: stepRunner.percentageToTarget(targetPeriapsis, streamUpdate.periapsis)
        };
    };
}
