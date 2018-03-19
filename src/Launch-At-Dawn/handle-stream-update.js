'use strict';
const setEngineClusterThrust = require('./set-engine-cluster-thrust');
const modelBuilder = require('./model-builder');
const stepRunner = require('./step-runner');
const returnFunctionOptions = { _fn: true };
//const { spaceCenter } = require('krpc-node');
const moment = require('moment');

let stepQueue = [
    // throttleDownCentralCore,
    // //todo UI countdown
    // launch,
    // { action: initiateRollManeuver, condition: checkAboveAltitude(150) },
    // { action: setSasToPrograde, condition: checkAboveAltitude(2400) },
    { action: initiateBoosterSeparation, condition: checkAboveAltitude(25000) },
    //todo target LZ rather
    setBoosterAutoPilot,
    throttleUpCentralCore,

    { action: accelerateBoostBackBurn(0.2), condition: delay(9.5, 'seconds') },
    setPitchToZero,
    { action: accelerateBoostBackBurn(0.4), condition: delay(4, 'seconds') },
    { action: accelerateBoostBackBurn(1), condition: delay(2, 'seconds') },
    { action: setBoosterSasModeToStability, condition: delay(7, 'seconds') },
    { action: meco, condition: checkAboveApoapsis(120000) },
    setSasToPrograde,
    { action: secondStageBoost, condition: delay(3, 'seconds') },
    { action: endSecondStageBoost, condition: delay(1, 'seconds') },
    { action: flipCentralCore, condition: delay(1, 'seconds') },
    { action: deployFairings, condition: delay(14, 'seconds') },
    { action: initiateCircularisationBurn, condition: checkAboveAltitude(119700) },
    { action: secondStageEngineCutoff, condition: checkAbovePeriapsis(120000) },
    { action: done, condition: delay(1, 'seconds') }
];

module.exports = function(client, falcon9Heavy) {
    let state = { falcon9Heavy };
    return stepRunner.runSteps(stepQueue, client, state);
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

async function launch({ state }) {
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

async function setBoosterAutoPilot({ state }) {
    let { falcon9Heavy } = state;
    await coreRTLS(falcon9Heavy.leftCore);
    await coreRTLS(falcon9Heavy.rightCore);
}

async function coreRTLS(core) {
    await core.control.rcs.set(true);
    await core.control.sas.set(true);
    await core.control.sasMode.set('Retrograde');
}

async function fireEngines(core, client, thrust) {
    let calls = await setEngineClusterThrust(core.engines, 0.5);
    calls = calls.concat(await core.control.throttle.set(returnFunctionOptions, thrust));
    await client.send(calls);
}

function accelerateBoostBackBurn(throttle) {
    return async function _accelerateBoostBackBurn({ state, client }) {
        let { falcon9Heavy } = state;
        await fireEngines(falcon9Heavy.leftCore, client, throttle);
        await fireEngines(falcon9Heavy.rightCore, client, throttle);
    };
}

async function setBoosterSasModeToStability({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy.leftCore.control.sasMode.set('StabilityAssist');
    await falcon9Heavy.rightCore.control.sasMode.set('StabilityAssist');
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
function delay(value, period) {
    let runAt;
    return function atTargetApoapsis() {
        runAt = runAt || moment.utc().add(value, period);
        return {
            shouldRun: moment.utc().isAfter(runAt),
            percentage: runAt.fromNow()
        };
    };
}
