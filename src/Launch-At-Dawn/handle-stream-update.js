'use strict';
let _currentState;
let _ = require('lodash');
let stateQueue = [initiateRollManeuver, step2, close, done];

module.exports = function(client, falcon9Heavy) {
    stateQueue = _.reverse(stateQueue);
    _currentState = stateQueue.pop();
    return async function(streamUpdate) {
        try {
            await _currentState({ streamUpdate, client, falcon9Heavy });
        } catch (err) {
            //terminate stream?
            throw err;
        }
    };
};

async function initiateRollManeuver({ streamUpdate, falcon9Heavy }) {
    if (streamUpdate.altitude < 100) {
        console.log(`initiateRollManeuver waiting ${streamUpdate.altitude}`);
        return;
    }
    console.log('initiateRollManeuver setting new heading');
    await falcon9Heavy.autoPilot.targetPitchAndHeading(88, 90);
    _currentState = stateQueue.pop();
}

async function step2({ streamUpdate }) {
    if (streamUpdate.altitude < 6000) {
        console.log(`step2 waiting ${streamUpdate.altitude}`);
        return;
    }
    await falcon9Heavy.autoPilot.targetPitchAndHeading(80, 90);
    _currentState = stateQueue.pop();
}

async function close({ client }) {
    console.log('closing');
    await client.close();
    _currentState = stateQueue.pop();
}

function done() {
    console.log('Done!');
    process.exit(0);
}
