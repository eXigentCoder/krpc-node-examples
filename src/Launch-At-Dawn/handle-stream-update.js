'use strict';
const setEngineClusterThrust = require('./set-engine-cluster-thrust');
const modelBuilder = require('./model-builder');
const stepRunner = require('./step-runner');
const leftBoosterStreamUpdate = require('./left-booster-stream-update');
const rightBoosterStreamUpdate = require('./right-booster-stream-update');
const displayMessage = require('./steps/display-message');
const targetPitchAndHeading = require('./steps/target-pitch-and-heading');
const setThrottle = require('./steps/set-throttle');
const setBoosterThrust = require('./steps/set-booster-thrust');
const delay = require('./conditions/delay');
const checkAbove = require('./conditions/check-above');

const rollAltitude = 150;
const gravityTurnAltitude = 1300;
const becoAltitude = 30000;
const mecoAltitude = 120000;
let stepQueue = [
    /*--====[ 01 DevConf FH Pad ]====--*/
    // setCentralCoreThrust(0.55),
    // targetPitchAndHeading(90, 0),
    // setThrottle(1),
    // // { action: displayMessage('T-10 ...'), condition: delay(1, 'seconds') },
    // // { action: displayMessage('T-9 ...'), condition: delay(1, 'seconds') },
    // // { action: displayMessage('T-8 ...'), condition: delay(1, 'seconds') },
    // // { action: displayMessage('T-7 ...'), condition: delay(1, 'seconds') },
    // // { action: displayMessage('T-6 ...'), condition: delay(1, 'seconds') },
    // {
    //     action: [activateNextStage, displayMessage('Booster Ignition Sequence Start', 1)],
    //     condition: delay(1, 'seconds')
    // },
    // // { action: displayMessage('T-4 ...'), condition: delay(1, 'seconds') },
    // {
    //     action: [activateNextStage, displayMessage('Core Ignition Sequence Start')],
    //     condition: delay(1, 'seconds')
    // },
    // // { action: displayMessage('T-2 ...'), condition: delay(1, 'seconds') },
    // // { action: displayMessage('T-1 ...'), condition: delay(1, 'seconds') },
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
    displayMessage('Central core is at full thrust.', 3),
    /*--====[ 03 DevConf FH PostSep ]====--*/
    // targetPitchAndHeading(0, 90),
    // {
    //     action: [displayMessage('MECO', 3), setThrottle(0), setSasToPrograde],
    //     condition: checkAbove('apoapsis', mecoAltitude)
    // },
    // activateNextStage, // separation
    // activateNextStage, // engine
    // { action: setRCSForward(1), condition: delay(3, 'seconds') },
    // { action: setRCSForward(0), condition: delay(2, 'seconds') },
    // displayMessage('Central core rotating retrograde for deceleration burn.', 3),
    // { action: flipCentralCore, condition: delay(1, 'seconds') },
    // { action: activateNextStage, condition: delay(14, 'seconds') },
    // /*--====[ 04 DevConf FH PreOrbit ]====--*/
    // { action: setThrottle(1), condition: checkAbove('altitude', 119700) },
    // { action: setThrottle(0), condition: checkAbove('periapsis', 120000) },
    // { action: done, condition: delay(5, 'seconds') }
];

module.exports = function(client, falcon9Heavy) {
    let state = { falcon9Heavy };
    return stepRunner.runSteps('CoreSteps', stepQueue, client, state);
};

function setCentralCoreThrust(thrust) {
    return async function throttleDownCentralCore({ state, client }) {
        let { falcon9Heavy } = state;
        const callBatch = await setEngineClusterThrust(falcon9Heavy.centerCore.engines, thrust);
        await client.send(callBatch);
    };
}


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

function setRCSForward(value) {
    return async function secondStageBoost({ state }) {
        let { falcon9Heavy } = state;
        await falcon9Heavy.control.forward.set(value);
    };
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

async function done({ client }) {
    console.log('Done with core stream');
}
