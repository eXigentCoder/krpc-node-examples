'use strict';
const setEngineClusterThrust = require('./set-engine-cluster-thrust');
const modelBuilder = require('./model-builder');
const stepRunner = require('./step-runner');
const leftBoosterStreamUpdate = require('./left-booster-stream-update');
const rightBoosterStreamUpdate = require('./right-booster-stream-update');
const displayMessage = require('./steps/display-message');
const setBoosterThrust = require('./steps/set-booster-thrust');
const delay = require('./conditions/delay');
const checkAbove = require('./conditions/check-above');
const targetPitchAndHeading = require('./steps/target-pitch-and-heading');
const setThrottle = require('./steps/set-throttle');

const rollAltitude = 150;
const gravityTurnAltitude = 1300;
const becoAltitude = 30000;

let stepQueue = [
    /*--====[ 01 DevConf FH Pad ]====--*/
    // setCentralCoreThrust(0.55),
    // targetPitchAndHeading(90, 0),
    // setThrottle(1),
    // { action: displayMessage('T-10 ...'), condition: delay(1, 'seconds') },
    // { action: displayMessage('T-9 ...'), condition: delay(1, 'seconds') },
    // { action: displayMessage('T-8 ...'), condition: delay(1, 'seconds') },
    // { action: displayMessage('T-7 ...'), condition: delay(1, 'seconds') },
    // { action: displayMessage('T-6 ...'), condition: delay(1, 'seconds') },
    // {
    //     action: [activateNextStage, displayMessage('Booster Ignition Sequence Start', 1)],
    //     condition: delay(1, 'seconds')
    // },
    // { action: displayMessage('T-4 ...'), condition: delay(1, 'seconds') },
    // {
    //     action: [activateNextStage, displayMessage('Core Ignition Sequence Start')],
    //     condition: delay(1, 'seconds')
    // },
    // { action: displayMessage('T-2 ...'), condition: delay(1, 'seconds') },
    // { action: displayMessage('T-1 ...'), condition: delay(1, 'seconds') },
    // { action: [activateNextStage, displayMessage('Launch!!')], condition: delay(1, 'seconds') },
    // {
    //     action: [setRoll(0), targetPitchAndHeading(85, 93)],
    //     condition: checkAbove('altitude', rollAltitude)
    // },
    // {
    //     action: displayMessage('Beginning roll program.', 3),
    //     condition: checkAbove('altitude', rollAltitude)
    // },
    // {
    //     action: [setSasToPrograde, displayMessage('Gravity turn initiated.', 3)],
    //     condition: checkAbove('altitude', gravityTurnAltitude)
    // },
    /*--====[ 02 DevConf FH PreSep ]====--*/
    {
        action: [setBoosterThrust(0), displayMessage('BECO - Booster Engine Cutoff', 3)],
        condition: checkAbove('altitude', becoAltitude)
    },
    {
        action: [initiateBoosterSeparation, displayMessage('Booster separation.', 3)],
        condition: delay(1, 'second')
    },
    startBoosterSteps,
    setCentralCoreThrust(1),
    displayMessage('Central core is at full thrust.', 3)
];

module.exports = function(client, falcon9Heavy) {
    let state = { falcon9Heavy };
    return stepRunner.runSteps('CoreSteps', stepQueue, client, state);
};

async function activateNextStage({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy.control.activateNextStage();
}

function setRoll(roll) {
    return async function _setRoll({ state }) {
        let { falcon9Heavy } = state;
        await falcon9Heavy.autoPilot.targetRoll.set(roll);
    };
}

async function setSasToPrograde({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy.autoPilot.disengage();
    await falcon9Heavy.control.sas.set(true);
    await falcon9Heavy.control.rcs.set(true);
    await falcon9Heavy.control.sasMode.set('Prograde');
}

function setCentralCoreThrust(thrust) {
    return async function throttleDownCentralCore({ state, client }) {
        let { falcon9Heavy } = state;
        const callBatch = await setEngineClusterThrust(falcon9Heavy.centerCore.engines, thrust);
        await client.send(callBatch);
    };
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
    client.stream.on('message', rightBoosterStreamUpdate(client, state));
    client.stream.on('message', leftBoosterStreamUpdate(client, state));
}
