'use strict';
let _currentState;
let _ = require('lodash');
let stateQueue = [
    {
        done: false,
        fn: initiateRollManeuver
    },
    {
        done: false,
        fn: initiateGravityTurn
    },
    {
        done: false,
        fn: step3
    },
    {
        done: false,
        fn: close
    },
    {
        done: false,
        fn: done
    }
];

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

async function initiateRollManeuver({ streamUpdate, falcon9Heavy, state }) {
    if (state.done) {
        return;
    }
    const targetAltitude = 150;
    if (streamUpdate.altitude < targetAltitude) {
        console.log(
            `initiateRollManeuver waiting ${percentageToTarget(
                targetAltitude,
                streamUpdate.altitude
            )}`
        );
        return;
    }
    console.log('initiateRollManeuver setting new heading');
    await falcon9Heavy.autoPilot.targetPitchAndHeading(85, 90);
    pop(state);
}

async function initiateGravityTurn({ streamUpdate, falcon9Heavy, state }) {
    if (state.done) {
        return;
    }
    const targetAltitude = 2000;
    if (streamUpdate.altitude < targetAltitude) {
        console.log(
            `initiateGravityTurn waiting ${percentageToTarget(
                targetAltitude,
                streamUpdate.altitude
            )}`
        );
        return;
    }
    console.log('initiateRollManeuver setting SAS to prograde');
    await falcon9Heavy.autoPilot.disengage();
    await falcon9Heavy.control.sas.set(true);
    await falcon9Heavy.control.sasMode.set('Prograde');
    pop(state);
}

async function step3({ streamUpdate, state }) {
    if (state.done) {
        return;
    }
    const targetAltitude = 25000;
    if (streamUpdate.altitude < targetAltitude) {
        console.log(`step3 waiting ${percentageToTarget(targetAltitude, streamUpdate.altitude)}`);
        return;
    }
    pop(state);
}

async function close({ client, state }) {
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
