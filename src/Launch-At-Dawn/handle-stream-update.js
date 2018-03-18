'use strict';
const setEngineClusterThrust = require('./set-engine-cluster-thrust');
const modelBuilder = require('./model-builder');
const stepRunner = require('./step-runner');
const returnFunctionOptions = { _fn: true };

let stepQueue = [
    // throttleDownCentralCore,
    // launch,
    // { action: initiateRollManeuver, condition: checkAboveAltitude(150) },
    // { action: initiateGravityTurn, condition: checkAboveAltitude(2000) },
    // { action: initiateBoosterSeparation, condition: checkAboveAltitude(25000) },
    // { action: close, condition: checkAboveAltitude(300000) },
    stage,
    stage,
    initiateBoosterSeparation,
    done
];

module.exports = function(client, falcon9Heavy) {
    let state = { falcon9Heavy };
    return stepRunner.runSteps(stepQueue, client, state);
};

async function throttleDownCentralCore({ state, client }) {
    let { falcon9Heavy } = state;
    const callBatch = await setEngineClusterThrust(falcon9Heavy.centerCore.engines, 0.6);
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
    await falcon9Heavy.control.activateNextStage();
}

async function initiateRollManeuver({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy.autoPilot.targetRoll.set(0);
    await falcon9Heavy.autoPilot.targetPitchAndHeading(85, 90);
}

async function initiateGravityTurn({ state }) {
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
    console.log(cores);
}

async function stage({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy.control.activateNextStage();
}

async function close({ client }) {
    console.log('closing');
    await client.close();
}

function done() {
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
