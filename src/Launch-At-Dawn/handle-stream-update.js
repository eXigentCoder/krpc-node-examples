'use strict';
let _currentState;
let _ = require('lodash');
const setEngineClusterThrust = require('./set-engine-cluster-thrust');

let stateQueue = [
    wrapFnStep(waitForAltitude(initiateRollManeuver, 'initiateRollManeuver', 150)),
    wrapFnStep(waitForAltitude(initiateGravityTurn, 'initiateGravityTurn', 2000)),
    wrapFnStep(waitForAltitude(initiateBoosterSeparation, 'initiateBoosterSeparation', 25000)),
    wrapFnStep(waitForAltitude(initiateBoosterSeparation, 'initiateBoosterSeparation', 300000)),
    wrapFnStep(close),
    wrapFnStep(done)
];

function wrapFnStep(fn) {
    return {
        processing: false,
        done: false,
        fn
    };
}

module.exports = function(client, falcon9Heavy) {
    stateQueue = _.reverse(stateQueue);
    _currentState = stateQueue.pop();
    return async function(streamUpdate) {
        try {
            await _currentState.fn({ streamUpdate, client, falcon9Heavy, state: _currentState });
        } catch (err) {
            //terminate stream?
            throw err;
        }
    };
};

function waitForAltitude(action, functionName, targetAltitude) {
    function atTargetAltitude(streamUpdate) {
        if (streamUpdate.altitude < targetAltitude) {
            console.log(
                `${functionName} waiting ${percentageToTarget(
                    targetAltitude,
                    streamUpdate.altitude
                )}`
            );
            return false;
        }
        return true;
    }
    return waitForCondition(action, functionName, atTargetAltitude);
}

function waitForCondition(action, functionName, atTarget) {
    return async function({ streamUpdate, client, falcon9Heavy, state }) {
        if (shouldSkip(state)) {
            return;
        }
        if (!atTarget(streamUpdate)) {
            return;
        }
        state.processing = true;
        console.log(`${functionName} processing`);
        await action({ streamUpdate, client, falcon9Heavy, state });
        pop(state);
    };
}

async function initiateRollManeuver({ falcon9Heavy }) {
    await falcon9Heavy.autoPilot.targetPitchAndHeading(85, 90);
}

async function initiateGravityTurn({ falcon9Heavy }) {
    await falcon9Heavy.autoPilot.disengage();
    await falcon9Heavy.control.sas.set(true);
    await falcon9Heavy.control.sasMode.set('Prograde');
}

async function initiateBoosterSeparation({ falcon9Heavy, client }) {
    let boosterEngineCallBatch = await setEngineClusterThrust(falcon9Heavy.leftCore.engines, 0);
    boosterEngineCallBatch = boosterEngineCallBatch.concat(
        await setEngineClusterThrust(falcon9Heavy.rightCore.engines, 0)
    );
    await client.send(boosterEngineCallBatch);
    await falcon9Heavy.control.activateNextStage();
}

async function close({ client, state }) {
    if (shouldSkip(state)) {
        return;
    }
    console.log('closing');
    await client.close();
    pop(state);
}

function done() {
    console.log('Done!');
    process.exit(0);
}

function percentageToTarget(target, current) {
    const percentage = (current / target * 100).toFixed(2);
    return `${percentage} %`;
}

function pop(state) {
    if (state.done) {
        return;
    }
    state.done = true;
    _currentState = stateQueue.pop();
}

function shouldSkip(state) {
    return state.done || state.processing;
}
